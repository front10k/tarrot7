# Cloudflare 배포 가이드

이 프로젝트는 `index.html` 정적 앱 + Worker API(`/api/analyze`) 형태로 Cloudflare에 배포할 수 있습니다.

## 1) 사전 준비

```bash
npm i -D wrangler
npx wrangler login
```

## 2) 로컬 개발 실행

1. `.dev.vars` 파일 생성 (`.dev.vars.example` 복사):

```bash
cp .dev.vars.example .dev.vars
```

2. 값 입력:

```env
OPENAI_API_KEY=sk-proj-REPLACE_ME
OPENAI_MODEL=gpt-4.1-mini
ALLOWED_ORIGINS=http://127.0.0.1:8787
INTERNAL_API_KEY=replace-with-strong-token
```

3. 실행:

```bash
npx wrangler dev
```

기본적으로 `http://127.0.0.1:8787`에서 앱과 `/api/analyze`를 함께 테스트할 수 있습니다.

## 3) 배포

1. 운영 시크릿 등록:

```bash
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put OPENAI_MODEL
npx wrangler secret put ALLOWED_ORIGINS
npx wrangler secret put INTERNAL_API_KEY
```

`OPENAI_MODEL`은 선택 사항이며 미등록 시 기본값 `gpt-4.1-mini`를 사용합니다.
`ALLOWED_ORIGINS`는 쉼표(`,`)로 여러 도메인을 설정할 수 있습니다.
`INTERNAL_API_KEY`는 필수이며 `/api/analyze` 요청에 `X-API-Key` 헤더가 반드시 포함되어야 합니다.

2. 배포:

```bash
npx wrangler deploy
```

## 4) 현재 구조

- 정적 파일: 루트 디렉토리 (`index.html`, `assets/`)
- Worker 엔트리: `worker.js`
- 설정: `wrangler.toml`

`/api/analyze` 호출 시 `X-API-Key` 헤더가 필수입니다. 프론트에서 직접 호출할 경우 키 노출 위험이 있으므로, 서버 측 프록시(또는 토큰 교환 방식)로 호출하는 구성을 권장합니다.

## 5) 적용된 보안

- 허용 Origin 검증 (`ALLOWED_ORIGINS`)
- 필수 API 키 헤더 검증 (`X-API-Key`)
- `application/json` Content-Type 강제
- API Body 크기 제한 (100KB)
- 기본 보안 헤더 추가
