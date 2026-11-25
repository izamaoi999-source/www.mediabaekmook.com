# 배포 안내 (Cloudflare Pages + Functions + D1)

게시판(`/board.html`, `/api/board/*`)은 서버 기능(Pages Functions)과 D1 DB를 씁니다.
대시보드 zip 업로드는 `functions/`를 처리하지 않으므로, 앞으로는 **wrangler로 배포**합니다.

## 폴더 구조
- 정적 원본: 루트의 `*.html`, `bangbae/`, `yeongeondong/`, `css/`, `js/`, `img/`, `sitemap.xml`, `robots.txt`, `_headers`, IndexNow 키 파일
- 서버 코드: `functions/api/...` (라우트), `lib/board.js` (공용 유틸) — 공개되지 않음
- `scripts/build.mjs` → 정적 파일만 `dist/`로 복사 (제외: `_archive_old`, `*.TODO`, `preview.png`, `README.md`, `DEPLOY.md`, `schema.sql`, `wrangler.toml`, `package*.json`, `node_modules`, `functions`, `lib`, `scripts`, `.dev.vars`, `.wrangler`)
- `wrangler.toml`: `pages_build_output_dir = "./dist"`, D1 바인딩 `DB`

## 최초 1회 설정
```bash
cd /workspace/studio-site
npm install                      # wrangler 설치 (이미 설치됨)

# (a) API 토큰: Cloudflare 대시보드 > My Profile > API Tokens > Create Token > Custom
#     권한: Account · Cloudflare Pages · Edit,  Account · D1 · Edit  (Account Resources: 해당 계정)
export CLOUDFLARE_API_TOKEN=<토큰>
export CLOUDFLARE_ACCOUNT_ID=<계정 ID>   # 대시보드 Workers & Pages 오른쪽에 표시

# (b) D1 DB 생성 → 출력된 database_id 를 wrangler.toml 의 database_id 에 붙여넣기
npx wrangler d1 create mediabaekmook-board
npx wrangler d1 execute mediabaekmook-board --remote --file=schema.sql

# (c) 관리자 비밀번호 (프로덕션 비밀값). 프롬프트에 비밀번호 입력
npx wrangler pages secret put ADMIN_PASSWORD --project-name mediabaekmook
```
D1 바인딩은 `wrangler.toml`에서 배포 시 적용됩니다. (대시보드 > mediabaekmook > Settings > Bindings 에 `DB` 가 보이는지 확인)

## 배포 (매번)
```bash
cd /workspace/studio-site
node scripts/build.mjs
npx wrangler pages deploy --project-name mediabaekmook --branch main
# = npm run deploy
```
`--branch` 는 프로젝트의 Production branch 이름과 같아야 프로덕션에 반영됩니다
(대시보드 > mediabaekmook > Settings > Builds & deployments 에서 확인, 보통 `main`).

## 로컬 테스트
```bash
cp .dev.vars.example .dev.vars           # ADMIN_PASSWORD 로컬값
npx wrangler d1 execute mediabaekmook-board --local --file=schema.sql
node scripts/build.mjs && npx wrangler pages dev --port 8788
# http://127.0.0.1:8788/board.html   관리자: /board.html?admin
```

## 게시판 동작 요약
- 모든 글은 비밀글. 목록에는 번호·제목·작성자(김*은)·날짜·🔒·답변완료만 표시, 20개/페이지
- 열람/삭제: 글 비밀번호(PBKDF2-SHA256 10만회 + 16바이트 salt, 상수시간 비교) 또는 관리자 비밀번호(`X-Admin-Password` 헤더, 상수시간 비교)
- 관리자: `/board.html?admin` 또는 목록 아래 '관리자' 링크 → 세션 동안 유지(sessionStorage). 모든 글 열람·답변·삭제
- 스팸: 허니팟 칸(`website`), IP당 글쓰기 10분 5건, 비밀번호 오류 IP당 10분 10회 초과 시 429 (IP는 해시로만 저장)
- `/api/*` 응답: `Cache-Control: no-store, private`, `X-Robots-Tag: noindex`
- 개인정보: 동의 시각(`consent_at`) 저장. 보관 기간(문의 처리 후 1년) 지난 글은 관리자가 삭제하거나 아래 SQL로 정리:
  `npx wrangler d1 execute mediabaekmook-board --remote --command "DELETE FROM posts WHERE created_at < (strftime('%s','now','-1 year')*1000)"`

## 촬영샘플 (/gallery.html)
- 관리자: `/gallery.html?admin` 또는 하단 '관리자' → 유튜브(watch·youtu.be·shorts·embed·live)·Vimeo(일반·channels·player·비공개 해시) 주소 붙여넣기
- 제목을 비우면 oEmbed로 자동 입력. 비공개/퍼가기 금지 영상은 거절(422). DB에는 provider + 영상 ID(+Vimeo 해시)만 저장
- 공개 화면은 썸네일만 먼저 보여주고, 클릭 시 youtube-nocookie / player.vimeo.com(dnt=1) 플레이어를 불러옴
- 홈·방배점 페이지의 '스튜디오에서 촬영한 영상' 섹션은 최신 3개를 보여주고, 영상이 없으면 숨김

## 장비 리스트 (/equipment.html#bangbae, #yeongeon)
- 방배점 | 연건점 탭. 관리자(`?admin`)는 현재 탭 지점의 장비만 추가·수정·순서 변경·삭제 (지점 변경 불가)
- 관리자 비밀번호는 게시판·갤러리와 같은 `ADMIN_PASSWORD`, 한 번 로그인하면 같은 탭 세션 동안 세 화면 모두 관리자 모드
