# 🎛️ AI 비서실 통합 관제탑 (executive-dashboard)

메인 비서(차차차)와 서브 워커(Claude PC Worker)가 **7개 트랙**을 어떻게 나눠 진행 중인지
한 화면에서 보는 정적 대시보드입니다. GitHub Pages(`gh-pages` 브랜치)로 배포합니다.

이 저장소는 **공개**를 전제로 하므로, 화면과 데이터에는 실명·회사·연락처·거주지·금액 원문이
들어가지 않습니다. 원문 데이터는 개인 드라이브·로컬 워커 폴더에 분리 보관합니다.

## 파일 구성

```text
executive-dashboard/
├─ index.html            화면 골격
├─ styles.css            다크/모던 스타일 (모바일·PC)
├─ app.js                status.json 을 읽어 카드·필터·체크·복사 동작
├─ data/status.json      현재 운영 상태 (이 파일만 고치면 화면이 바뀝니다)
└─ update_status.py      상태 갱신 + 검증 + git push 헬퍼
```

## 화면에서 되는 것

- 상단: 전체 진행률, 마지막 동기화 시각, 메인/서브 역할
- 트랙 탭(7개)과 담당 필터(차차차 / Claude Worker) — 담당을 고르면 그 담당의 체크 항목만 남고 진행률도 그 담당 기준으로 바뀝니다
- 트랙별 카드: 상태 배지 · 다음 스케줄 · 최근 실행 · 스케줄 목록 · 담당 분담 · 진행 체크 · 바로가기 · 실행 명령 복사
- 체크는 브라우저(localStorage)에만 저장됩니다. 기기·브라우저를 바꾸면 초기화되며, 원본 기준값은 `status.json`의 `done` 값입니다.
- 하단 "내 체크 초기화"로 로컬 체크를 지울 수 있습니다.

## 상태 갱신 방법

```bash
cd executive-dashboard

python3 update_status.py list                     # 트랙·상태·체크 요약
python3 update_status.py items content            # 체크 항목 id 보기

python3 update_status.py set invest --status active \
  --summary "평일 두 번 발송 정상" \
  --next 2026-11-19T15:40:00+09:00 --next-label "장마감 30선"

python3 update_status.py check invest today-close --done
python3 update_status.py alert add --track content --level warn \
  --title "계정 인증 필요" --text "인스타 앱에서 인증하면 재개됩니다."
python3 update_status.py alert clear --track content

python3 update_status.py validate                 # 형식 + 개인정보 점검
python3 update_status.py push -m "chore: 상태 갱신"   # 커밋 + push
```

`set`, `check`, `alert` 뒤에 `--push`를 붙이면 저장 후 바로 커밋·푸시합니다.
`validate`와 `push`는 실명·회사명·연락처·금액 원문 같은 값이 보이면 **저장·푸시를 중단**합니다.

### 금지어 목록 (공개 저장소에 올리지 않음)

이 사람만의 실명·회사·지역 같은 단어는 코드에 넣지 않고 `privacy_blocklist.local.txt` 에 둡니다.
이 파일은 `.gitignore` 로 제외되어 저장소에 올라가지 않습니다. 줄 형식은 `라벨<TAB>정규식` 입니다.

```text
실명	홍\s*길\s*동
회사명	(주)예시회사
```

다른 곳에 둘 때는 `EXECDASH_BLOCKLIST=/경로/파일` 환경변수나 `~/.execdash_blocklist.txt` 를 씁니다.
파일이 없어도 이메일·전화번호·주민번호·계좌번호·금액 패턴은 기본으로 점검합니다.

## 배포

1. GitHub에 빈 저장소 `executive-dashboard`(Public)를 만듭니다.
2. 최초 1회:

```bash
cd executive-dashboard
git remote add origin https://github.com/<계정>/executive-dashboard.git
git push -u origin gh-pages
```

3. 저장소 **Settings → Pages** 에서 Source 를 `Deploy from a branch`, 브랜치를 `gh-pages` / `/ (root)` 로 지정합니다.
4. 주소: `https://<계정>.github.io/executive-dashboard/`

이후 갱신은 `python3 update_status.py push -m "..."` 한 줄이면 됩니다.

## 로컬에서 보기

`fetch`로 JSON을 읽으므로 파일을 직접 열지 말고 간단한 서버로 엽니다.

```bash
cd executive-dashboard && python3 -m http.server 8000
# 브라우저에서 http://localhost:8000
```
