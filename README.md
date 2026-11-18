# 🎛️ AI 비서실 통합 관제탑 (executive-dashboard) v4

메인 비서(차차차)와 서브 워커(Claude PC Worker)가 **7개 트랙**을 어떻게 나눠 진행 중인지,
반복 업무를 어떤 **스킬 단축키**로 꺼내 쓰는지, 그 결과물이 어디에 쌓이는지(**세컨드 브레인**)를
한 화면에서 보는 정적 대시보드입니다. GitHub Pages(`gh-pages` 브랜치)로 배포합니다.

이 저장소는 **공개**를 전제로 하므로, 화면과 데이터에는 실명·회사·연락처·거주지·금액 원문이
들어가지 않습니다. 원문 데이터는 개인 드라이브·로컬 워커 폴더에 분리 보관합니다.

## 화면 구성 (상단 뷰 탭 3개)

| 탭 | 무엇을 보여주나 | 조작 |
|---|---|---|
| 🎯 **7대 트랙 현황** | 트랙 버튼 8개(전체+7) **그리드** · 컴팩트 요약 카드 7개 · 확인 필요 알림 | 트랙 버튼/카드 클릭 → 상세 패널, 체크 토글(로컬 저장), 명령 복사 |
| ↳ **트랙 상세 패널** | 🎯 추적 중인 대상(대상·기준·현재 상태·다음 일정) · ⏳ 미결 확인 사항 · 실행 기록 · 스케줄 · 담당 분담 · 진행 체크 · 실행 버튼 | **대기 카드를 누르면 실행 패널**(문구 복사·답변 입력·링크 열기·완료 표시), 담당 칩 필터, `← 전체 보기`, 딥링크 `#tracks/{id}` |
| ⚡ **스킬 단축키** | 반복 업무 10종 카드(담당·언제·절차·참고자료·출력·주의) | 분류 칩 · 검색(하이라이트) · 실행 명령 복사 · 규칙 문서 경로 복사 |
| 🧠 **세컨드 브레인** | 7대 트랙의 길잡이 문서·리포트·템플릿·웹앱·계정 30건 | 카테고리 칩 · 검색 · 카드 펼쳐 요약 미리보기 · 경로 복사 |

- 뷰 선택은 `#tracks` / `#skills` / `#brain` 해시로 공유·기억됩니다(localStorage).
- 트랙 선택은 `#tracks/realestate` 처럼 딥링크로 공유·기억됩니다. 모바일에서도 트랙 버튼 8개가
  가로 스크롤 없이 2열(390px)·3열(720px)·4열(PC) 그리드로 한눈에 보입니다.
- 트랙 체크 상태는 브라우저(localStorage)에만 저장되며, 원본 기준값은 `data/status.json`의 `done`입니다.
- 하단 "내 체크 초기화"로 로컬 체크를 지울 수 있습니다.

## v4 — 대기 항목 클릭 액션 카드

`tracking_items`·`open_questions` **전부**가 눌러서 바로 진행하는 카드입니다.
카드를 누르면 그 자리(아코디언)에 실행 패널이 열립니다.

| 요소 | 동작 |
|---|---|
| 카드 본문 전체 | 액션 패널 열기/닫기 (`cursor: pointer`·눌림 효과·`aria-expanded`) |
| 카드 하단 `누르면 진행 · {action_label} →` | 어떤 일을 하는 카드인지 한 줄로 표시 |
| `{action_label} ⧉` | `action_prompt`를 클립보드로 복사 (예: 인스타 인증 → `인스타 계정 인증 완료했어! …`) |
| 답변 입력칸 + `답변 복사 ⧉` | 입력값을 `"<항목명> 답변: <입력값>"` 형태로 복사 (`action_title` 사용) |
| `{action_url_label} ↗` | 공개 링크를 새 탭으로 열기 (비공개 URL은 넣지 않음) |
| `완료로 표시` | 그 카드를 이 브라우저에서 흐리게 + 취소선 처리 (`localStorage`) |
| 트랙 요약 카드 안 항목 / 상단 알림 `지금 처리` | 그 트랙 상세로 이동해 해당 카드 패널을 바로 열기 |

- 입력한 답변 초안은 `localStorage`(`execdash.v4.drafts`)에 저장돼 새로고침해도 남습니다.
- 완료 표시는 `execdash.v4.actions`, 진행 체크는 `execdash.v1.checks`에 저장됩니다(하단 버튼으로 모두 초기화).
- `python3 update_status.py validate` 가 `action_url` 이 http(s) 인지도 확인합니다.

## 파일 구성

```text
executive-dashboard/
├─ index.html            화면 골격(3개 뷰 + 탭)
├─ styles.css            다크/모던 스타일 (모바일·PC)
├─ app.js                JSON 3개를 읽어 트랙·스킬·지식 뷰를 그림
├─ data/
│  ├─ status.json        7대 트랙 상태·추적 항목·미결 사항·스케줄·체크리스트·실행 명령
│  ├─ skills.json        스킬 단축키 카드 10종
│  └─ brain.json         세컨드 브레인 지식 항목 30건
└─ update_status.py      상태 갱신 + 형식/민감어 검증 + git push 헬퍼
```

## 상태 갱신 방법

```bash
cd executive-dashboard

python3 update_status.py list                     # 트랙·상태·체크 요약
python3 update_status.py items content            # 체크 항목 id 보기
python3 update_status.py skills                   # 스킬 카드 목록
python3 update_status.py brain                    # 지식 항목 목록

python3 update_status.py set invest --status active \
  --summary "평일 두 번 발송 정상" \
  --next 2026-11-19T15:40:00+09:00 --next-label "장마감 30선"

python3 update_status.py check invest today-close --done
python3 update_status.py alert add --track content --level warn \
  --title "계정 인증 필요" --text "인스타 앱에서 인증하면 재개됩니다."
python3 update_status.py alert clear --track content

python3 update_status.py validate                 # data/ 3개 파일 형식 + 민감어
python3 update_status.py scan                     # 저장소 전체 파일 민감어
python3 update_status.py push -m "chore: 상태 갱신"
```

### 추적 항목(`tracking_items`)·미결 사항(`open_questions`)

각 트랙은 실제 추적 대상을 `tracking_items` 배열로, 확인 대기 중인 결정을 `open_questions` 배열로 가집니다.
`python3 update_status.py` 로는 다루지 않고 `data/status.json` 을 직접 고칩니다.

```json
"tracking_items": [
  {
    "id": "switch-aw",
    "kind": "갈아타기",
    "title": "진주 아너스웰가진주 84A",
    "detail": "2028년 6월 입주 예정 · 840세대",
    "criteria": "분양권 실거래 57,300~62,500만 원 · 56,500만 원 이하 급매 시 보고",
    "status": "감시 중",
    "tone": "wait",
    "next": "11/21(토) 10:00",
    "action_label": "급매 지금 조회",
    "action_prompt": "진주 아너스웰가진주 84A 분양권 실거래와 급매 지금 조회해줘.",
    "action_url": "https://land.naver.com/",
    "action_url_label": "네이버 부동산 열기"
  }
],
"open_questions": [
  {
    "id": "rq-mortgage",
    "text": "주담대 4가지 조건 회신 대기",
    "who": "user",
    "due": "12/15 점검 전",
    "action_title": "주담대 4가지 조건",
    "action_label": "답변 입력·복사",
    "input_placeholder": "예) 하나은행 / 4.1% / 월 원리금 OO만 원 / 원리금균등 30년",
    "action_prompt": "주담대 조건 템플릿: OO은행 / 금리 O.O% / 월 원리금 OO만 원 / 상환방식 OO·만기 OO년"
  }
]
```

- `tone`: `ok` · `wait` · `warn` · `info` (점 색)
- `who`: `user`(내 확인) · `main`(차차차) · `sub`(워커)
- `action_label`: 버튼 이름 · `action_prompt`: 복사할 실행/회신 문구 · `input_placeholder`: 있으면 답변 입력칸이 생김 · `action_title`: 답변 복사 접두어(없으면 `title`/`text`) · `action_url`+`action_url_label`: 공개 링크
- `open_questions` 는 `id` 가 있어야 카드로 동작합니다(로컬 완료 표시·초안 저장 키).
- 금액은 **만원 단위**로만 적습니다. 억 단위·콤마 원문은 `validate`/`scan` 이 막습니다(공개 저장소).

`set`, `check`, `alert` 뒤에 `--push`를 붙이면 저장 후 바로 커밋·푸시합니다.
`validate`·`scan`·`push`는 실명·회사명·연락처·금액 원문 같은 값이 보이면 **저장·푸시를 중단**합니다.

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

## 공개 범위 원칙

- 트랙 상태·스킬 정의·문서 **경로와 요약**만 공개합니다.
- 원문(회사 보고서·설비 자료·가계부·자산·가족 기록)은 공개 저장소에 넣지 않습니다.
- 학습 웹앱·개인 문서의 실제 URL은 공개 화면에 쓰지 않고, 비공개 인덱스(`executive-office/CLAUDE.md`)에만 둡니다.
