#!/usr/bin/env python3
"""
AI 비서실 통합 관제탑 — 상태 갱신 헬퍼

`data/status.json`을 안전하게 고치고, 필요하면 그대로 GitHub Pages(gh-pages)로
올릴 수 있게 만든 스크립트입니다. 차차차(메인)와 클로드 PC 워커(서브) 모두
같은 명령으로 상태를 남깁니다.

사용 예
-------
  python3 update_status.py list
  python3 update_status.py set invest --status active \
      --summary "평일 두 번 발송 정상" \
      --next 2026-11-19T15:40:00+09:00 --next-label "장마감 30선(32종목)"
  python3 update_status.py check invest today-close --done
  python3 update_status.py note content --text "인스타 인증 대기 중"
  python3 update_status.py alert add --track content --level warn \
      --title "계정 인증 필요" --text "인스타 앱에서 인증하면 재개됩니다."
  python3 update_status.py validate          # 형식 + 개인정보 점검
  python3 update_status.py push -m "chore: 상태 갱신"

공개 저장소에 올라가는 파일이므로, 값을 넣을 때 실명·회사명·연락처·금액 원문은
쓰지 않습니다. `validate`와 `push`가 이런 값이 들어오면 막습니다.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent
STATUS_PATH = ROOT / "data" / "status.json"
TZ = ZoneInfo("Asia/Seoul")
BRANCH = "gh-pages"
ALLOWED_STATUS = ("active", "waiting", "blocked", "paused", "done")
ALLOWED_LEVEL = ("warn", "info")

# 공개 저장소에 절대 올라가면 안 되는 값들 — 일반 패턴(누구에게나 해당)
GENERIC_PATTERNS = [
    (r"[\w.+-]+@(?!users\.noreply\.github\.com)[\w-]+\.[\w.]+", "이메일 주소"),
    (r"01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}", "휴대폰 번호"),
    (r"\b\d{6}\s*-\s*\d{7}\b", "주민등록번호"),
    (r"\b\d{2,3}-\d{2,6}-\d{4,6}\b", "계좌·카드 번호로 보이는 숫자"),
    (r"\d{1,3}(?:,\d{3}){2,}\s*원", "금액 원문(콤마 포함)"),
    (r"\d+(?:\.\d+)?\s*억", "부동산 금액 원문"),
    (r"(연봉|급여|순자산|대출잔액|월\s*납입액)\s*[:：]?\s*\d", "민감 재무 수치"),
]

# 이 사람만의 금지어(실명·회사·지역 등)는 공개 저장소에 올리지 않습니다.
# `privacy_blocklist.local.txt` (git 제외) 또는 $EXECDASH_BLOCKLIST 파일에서 읽습니다.
# 줄 형식: `라벨<TAB>정규식`  · `#` 로 시작하면 주석
BLOCKLIST_ENV = "EXECDASH_BLOCKLIST"
BLOCKLIST_LOCAL = "privacy_blocklist.local.txt"
BLOCKLIST_HOME = ".execdash_blocklist.txt"


def load_blocklist() -> list[tuple[str, str]]:
    candidates = []
    env_path = os.environ.get(BLOCKLIST_ENV)
    if env_path:
        candidates.append(Path(env_path).expanduser())
    candidates.append(ROOT / BLOCKLIST_LOCAL)
    candidates.append(Path.home() / BLOCKLIST_HOME)

    patterns: list[tuple[str, str]] = []
    for path in candidates:
        if not path.exists():
            continue
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except OSError:
            continue
        for line in lines:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "\t" in line:
                label, pattern = line.split("\t", 1)
            elif ":" in line:
                label, pattern = line.split(":", 1)
            else:
                label, pattern = "금지어", line
            patterns.append((pattern.strip(), label.strip()))
        break
    return patterns


def privacy_patterns() -> list[tuple[str, str]]:
    return GENERIC_PATTERNS + load_blocklist()


class Fail(Exception):
    pass


# ---------------------------------------------------------------- 입출력
def load() -> dict:
    if not STATUS_PATH.exists():
        raise Fail(f"상태 파일이 없습니다: {STATUS_PATH}")
    with STATUS_PATH.open(encoding="utf-8") as fh:
        return json.load(fh)


def save(data: dict) -> None:
    data.setdefault("meta", {})["generated_at"] = datetime.now(TZ).replace(microsecond=0).isoformat()
    STATUS_PATH.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=str(STATUS_PATH.parent), suffix=".json.tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, ensure_ascii=False, indent=2)
            fh.write("\n")
        os.replace(tmp, STATUS_PATH)
    except Exception:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


# ---------------------------------------------------------------- 트랙 찾기
def find_track(data: dict, needle: str) -> dict:
    needle = str(needle).strip()
    tracks = data.get("tracks", [])
    for track in tracks:
        if needle == track.get("id"):
            return track
    for track in tracks:
        if needle == str(track.get("no")):
            return track
    lowered = needle.lower()
    for track in tracks:
        if lowered in str(track.get("name", "")).lower():
            return track
    ids = ", ".join(f"{t.get('no')}:{t.get('id')}" for t in tracks)
    raise Fail(f"트랙을 찾지 못했습니다: {needle} (사용 가능: {ids})")


def find_item(track: dict, item_id: str) -> dict:
    for item in track.get("checklist", []):
        if item.get("id") == item_id:
            return item
    ids = ", ".join(i.get("id", "?") for i in track.get("checklist", []))
    raise Fail(f"체크 항목을 찾지 못했습니다: {item_id} ({track.get('id')} 항목: {ids})")


# ---------------------------------------------------------------- 점검
def validate_data(data: dict) -> list[str]:
    errors: list[str] = []
    meta = data.get("meta") or {}
    if not meta.get("title"):
        errors.append("meta.title 이 비어 있습니다")
    tracks = data.get("tracks")
    if not isinstance(tracks, list) or not tracks:
        errors.append("tracks 가 비어 있습니다")
        return errors

    seen = set()
    for track in tracks:
        tid = track.get("id")
        if not tid:
            errors.append("id 없는 트랙이 있습니다")
            continue
        if tid in seen:
            errors.append(f"트랙 id 중복: {tid}")
        seen.add(tid)
        if track.get("status") not in ALLOWED_STATUS:
            errors.append(f"{tid}: status 값이 올바르지 않습니다 ({track.get('status')})")
        for key in ("name", "icon", "summary"):
            if not track.get(key):
                errors.append(f"{tid}: {key} 가 비어 있습니다")
        item_ids = set()
        for item in track.get("checklist", []):
            iid = item.get("id")
            if not iid:
                errors.append(f"{tid}: id 없는 체크 항목")
            elif iid in item_ids:
                errors.append(f"{tid}: 체크 id 중복 {iid}")
            item_ids.add(iid)
            if not isinstance(item.get("done"), bool):
                errors.append(f"{tid}/{iid}: done 은 true/false 여야 합니다")
            if item.get("role") not in ("main", "sub"):
                errors.append(f"{tid}/{iid}: role 은 main 또는 sub 여야 합니다")
        for key in ("next_run", "last_run"):
            run = track.get(key) or {}
            at = run.get("at")
            if at:
                try:
                    datetime.fromisoformat(at)
                except ValueError:
                    errors.append(f"{tid}.{key}.at 시각 형식 오류: {at}")

    for alert in data.get("alerts", []):
        if alert.get("track") and alert.get("track") not in seen:
            errors.append(f"알림이 없는 트랙을 가리킵니다: {alert.get('track')}")
        if alert.get("level") not in ALLOWED_LEVEL:
            errors.append(f"알림 level 값 오류: {alert.get('level')}")
    return errors


def privacy_scan(data: dict) -> list[str]:
    blob = json.dumps(data, ensure_ascii=False)
    hits = []
    for pattern, label in privacy_patterns():
        try:
            matches = list(re.finditer(pattern, blob, flags=re.IGNORECASE))
        except re.error:
            continue
        for match in matches:
            start = max(0, match.start() - 30)
            context = blob[start: match.end() + 30].replace("\n", " ")
            hits.append(f"{label}: …{context}…")
    return hits


# ---------------------------------------------------------------- 명령
def cmd_list(args) -> int:
    data = load()
    print(f"상태 파일: {STATUS_PATH}")
    print(f"마지막 갱신: {data.get('meta', {}).get('generated_at')}")
    print("-" * 64)
    for track in data["tracks"]:
        items = track.get("checklist", [])
        done = sum(1 for i in items if i.get("done"))
        nxt = (track.get("next_run") or {}).get("at") or "-"
        print(f"[{track.get('no')}] {track.get('id'):<11} {track.get('icon','')} {track.get('name')}")
        print(f"     상태={track.get('status'):<8} 체크={done}/{len(items)} 다음={nxt}")
    return 0


def cmd_items(args) -> int:
    data = load()
    track = find_track(data, args.track)
    print(f"{track.get('icon','')} {track.get('name')} ({track.get('id')})")
    for item in track.get("checklist", []):
        mark = "x" if item.get("done") else " "
        print(f"  [{mark}] {item.get('id'):<14} ({item.get('role')}) {item.get('text')}")
    return 0


def apply_schedule(track: dict, which: str, at: str | None, label: str | None) -> None:
    key = f"{which}_run"
    current = track.get(key) or {}
    if at is not None:
        current["at"] = None if at.lower() in ("none", "-", "") else at
    if label is not None:
        current["label"] = label
    track[key] = current


def guard_and_save(data: dict, message: str) -> int | None:
    """개인정보 의심 값이 있으면 저장하지 않고 막는다."""
    hits = privacy_scan(data)
    if hits:
        print("개인정보로 보이는 값이 있어 저장하지 않았습니다. 아래 값을 고쳐 주세요:", file=sys.stderr)
        for h in hits:
            print("  -", h, file=sys.stderr)
        return 2
    save(data)
    print(message)
    return None


def cmd_set(args) -> int:
    data = load()
    track = find_track(data, args.track)
    changed = []

    if args.status:
        if args.status not in ALLOWED_STATUS:
            raise Fail(f"status 는 {', '.join(ALLOWED_STATUS)} 중 하나여야 합니다")
        track["status"] = args.status
        changed.append(f"status={args.status}")
    if args.summary is not None:
        track["summary"] = args.summary
        changed.append("summary")
    if args.tagline is not None:
        track["tagline"] = args.tagline
        changed.append("tagline")
    if args.note is not None:
        track["note"] = args.note
        changed.append("note")
    if args.next is not None or args.next_label is not None:
        apply_schedule(track, "next", args.next, args.next_label)
        changed.append("next_run")
    if args.last is not None or args.last_label is not None:
        apply_schedule(track, "last", args.last, args.last_label)
        changed.append("last_run")

    if not changed:
        raise Fail("바꿀 값이 없습니다. --status/--summary/--next/--last/--note 중 하나를 주세요.")

    blocked = guard_and_save(data, f"{track.get('icon','')} {track.get('name')} 갱신: {', '.join(changed)}")
    if blocked is not None:
        return blocked
    return finalize(args)


def cmd_check(args) -> int:
    data = load()
    track = find_track(data, args.track)
    item = find_item(track, args.item)
    if args.done and args.undone:
        raise Fail("--done 과 --undone 은 함께 쓸 수 없습니다")
    value = True
    if args.undone:
        value = False
    elif not args.done:
        value = not bool(item.get("done"))
    item["done"] = value
    mark = "x" if value else " "
    blocked = guard_and_save(data, f"[{mark}] {track.get('id')}/{item.get('id')} {item.get('text')}")
    if blocked is not None:
        return blocked
    return finalize(args)


def cmd_add_item(args) -> int:
    data = load()
    track = find_track(data, args.track)
    item_id = args.id
    if any(i.get("id") == item_id for i in track.get("checklist", [])):
        raise Fail(f"이미 있는 체크 id 입니다: {item_id}")
    if args.role not in ("main", "sub"):
        raise Fail("--role 은 main 또는 sub 여야 합니다")
    track.setdefault("checklist", []).append(
        {"id": item_id, "text": args.text, "done": bool(args.done), "role": args.role}
    )
    blocked = guard_and_save(data, f"{track.get('id')} 에 체크 항목 추가: {item_id} ({args.role}) {args.text}")
    if blocked is not None:
        return blocked
    return finalize(args)


def cmd_alert(args) -> int:
    data = load()
    alerts = data.setdefault("alerts", [])
    if args.action == "add":
        track = find_track(data, args.track) if args.track else None
        alerts.append(
            {
                "track": track.get("id") if track else None,
                "level": args.level,
                "title": args.title,
                "text": args.text,
            }
        )
        done_message = f"알림 추가: {args.title}"
    elif args.action == "clear":
        if args.track:
            track = find_track(data, args.track)
            before = len(alerts)
            data["alerts"] = [a for a in alerts if a.get("track") != track.get("id")]
            done_message = f"알림 {before - len(data['alerts'])}건 정리: {track.get('id')}"
        else:
            done_message = f"알림 {len(alerts)}건 모두 정리"
            data["alerts"] = []
    else:
        raise Fail(f"알 수 없는 동작: {args.action}")

    blocked = guard_and_save(data, done_message)
    if blocked is not None:
        return blocked
    return finalize(args)


def cmd_validate(args) -> int:
    data = load()
    errors = validate_data(data)
    hits = privacy_scan(data)
    if errors:
        print("형식 오류:")
        for e in errors:
            print("  -", e)
    if hits:
        print("개인정보 의심 값:")
        for h in hits:
            print("  -", h)
    if not errors and not hits:
        print("형식·개인정보 점검 통과 ✅")
        return 0
    return 1


def finalize(args) -> int:
    """저장 뒤 개인정보 점검을 돌리고, --push 면 푸시까지."""
    data = load()
    errors = validate_data(data)
    hits = privacy_scan(data)
    if errors:
        print("형식 오류가 있습니다:", file=sys.stderr)
        for e in errors:
            print("  -", e, file=sys.stderr)
        return 1
    if hits:
        print("개인정보로 보이는 값이 있어 저장을 되돌려야 합니다. 아래 값을 고쳐 주세요:", file=sys.stderr)
        for h in hits:
            print("  -", h, file=sys.stderr)
        return 2
    if getattr(args, "push", False):
        return do_push(getattr(args, "message", None))
    return 0


def cmd_push(args) -> int:
    return do_push(args.message)


def do_push(message: str | None) -> int:
    data = load()
    hits = privacy_scan(data)
    if hits:
        print("개인정보로 보이는 값이 있어 푸시를 중단합니다:", file=sys.stderr)
        for h in hits:
            print("  -", h, file=sys.stderr)
        return 2

    def git(*args: str, check: bool = True) -> subprocess.CompletedProcess:
        return subprocess.run(["git", *args], cwd=str(ROOT), text=True, capture_output=True, check=check)

    try:
        git("rev-parse", "--git-dir")
    except subprocess.CalledProcessError:
        print("이 폴더가 git 저장소가 아닙니다. `git init -b gh-pages` 로 먼저 준비하세요.", file=sys.stderr)
        return 1

    branch = git("rev-parse", "--abbrev-ref", "HEAD").stdout.strip()
    if branch != BRANCH and branch != "main":
        print(f"현재 브랜치가 {branch} 입니다. GitHub Pages 배포 브랜치는 {BRANCH} 입니다.", file=sys.stderr)

    stamp = datetime.now(TZ).strftime("%Y-%m-%d %H:%M")
    msg = message or f"chore: 상태 갱신 {stamp} KST"
    git("add", "-A")
    status = git("status", "--porcelain").stdout.strip()
    if not status:
        print("바뀐 내용이 없습니다.")
    else:
        git("commit", "-m", msg)
        print(f"커밋: {msg}")

    remotes = git("remote").stdout.split()
    if "origin" not in remotes:
        print("origin 원격이 없습니다. 저장소를 만든 뒤 아래를 한 번 실행하세요:")
        print("  git remote add origin https://github.com/<계정>/executive-dashboard.git")
        return 1

    result = git("push", "origin", branch, check=False)
    if result.returncode != 0:
        print("푸시 실패:", file=sys.stderr)
        print((result.stderr or result.stdout).strip(), file=sys.stderr)
        return 1
    print(f"푸시 완료: origin/{branch}")
    print("GitHub Pages 주소는 저장소 Settings → Pages 에서 확인할 수 있습니다.")
    return 0


# ---------------------------------------------------------------- argparse
def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(description="AI 비서실 통합 관제탑 상태 갱신 헬퍼")
    sub = p.add_subparsers(dest="command", required=True)

    sp = sub.add_parser("list", help="트랙 목록과 상태 요약")
    sp.set_defaults(func=cmd_list)

    sp = sub.add_parser("items", help="한 트랙의 체크 항목 id 보기")
    sp.add_argument("track")
    sp.set_defaults(func=cmd_items)

    sp = sub.add_parser("set", help="트랙 상태·요약·스케줄 갱신")
    sp.add_argument("track", help="트랙 id 또는 번호(1~7) 또는 이름 일부")
    sp.add_argument("--status", choices=ALLOWED_STATUS)
    sp.add_argument("--summary")
    sp.add_argument("--tagline")
    sp.add_argument("--note")
    sp.add_argument("--next", help="다음 실행 시각 (ISO, 예: 2026-11-19T15:40:00+09:00, 없애려면 none)")
    sp.add_argument("--next-label", dest="next_label")
    sp.add_argument("--last", help="최근 실행 시각 (ISO 또는 none)")
    sp.add_argument("--last-label", dest="last_label")
    sp.add_argument("--push", action="store_true", help="저장 후 바로 git push")
    sp.add_argument("-m", "--message", help="커밋 메시지")
    sp.set_defaults(func=cmd_set)

    sp = sub.add_parser("check", help="체크 항목 완료/해제")
    sp.add_argument("track")
    sp.add_argument("item")
    sp.add_argument("--done", action="store_true", help="완료로 표시")
    sp.add_argument("--undone", action="store_true", help="미완료로 되돌리기")
    sp.add_argument("--push", action="store_true")
    sp.add_argument("-m", "--message")
    sp.set_defaults(func=cmd_check)

    sp = sub.add_parser("add-item", help="체크 항목 추가")
    sp.add_argument("track")
    sp.add_argument("--id", required=True)
    sp.add_argument("--text", required=True)
    sp.add_argument("--role", default="main", choices=["main", "sub"])
    sp.add_argument("--done", action="store_true")
    sp.add_argument("--push", action="store_true")
    sp.add_argument("-m", "--message")
    sp.set_defaults(func=cmd_add_item)

    sp = sub.add_parser("alert", help="상단 확인 필요 알림 추가·정리")
    sp.add_argument("action", choices=["add", "clear"])
    sp.add_argument("--track")
    sp.add_argument("--level", default="info", choices=ALLOWED_LEVEL)
    sp.add_argument("--title", default="확인 필요")
    sp.add_argument("--text", default="")
    sp.add_argument("--push", action="store_true")
    sp.add_argument("-m", "--message")
    sp.set_defaults(func=cmd_alert)

    sp = sub.add_parser("validate", help="형식·개인정보 점검")
    sp.set_defaults(func=cmd_validate)

    sp = sub.add_parser("push", help="커밋하고 origin 으로 푸시")
    sp.add_argument("-m", "--message")
    sp.set_defaults(func=cmd_push)

    return p


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except Fail as exc:
        print(f"오류: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
