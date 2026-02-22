# Backend

This folder contains the local API server for OpenAI analysis and secrets.

## Local run

1. Create `backend/.env`:

```env
OPENAI_API_KEY=sk-proj-REPLACE_ME
OPENAI_MODEL=gpt-4.1-mini
ALLOWED_ORIGINS=http://localhost:8000
INTERNAL_API_KEY=replace-with-strong-token
```

2. Run server from project root:

```bash
node backend/server.js
```

3. Open:

- App: `http://localhost:8000`
- API: `POST http://localhost:8000/api/analyze`

## Notes

- Do not put real API keys in frontend code.
- `backend/.env` is gitignored.
- If `OPENAI_API_KEY` is missing, `/api/analyze` returns an explicit error message.
- `ALLOWED_ORIGINS` is optional. If set, only listed origins can call `/api/analyze`.
- `INTERNAL_API_KEY` is optional. If set, requests must include `X-API-Key`.

Example env:

```
OPENAI_API_KEY=sk-proj-REPLACE_ME
ALLOWED_ORIGINS=http://localhost:8000
INTERNAL_API_KEY=replace-with-strong-token
```
