# Railway Deployment

Deploy this repository as a Railway service. Railway will use `railway.json` and the root `Dockerfile`.

## Required Variables

```bash
COLLECTOR_MODE=live
PYTHON_PATH=python3
AI_PROVIDER=gemini
AI_API_KEY=your_key
AI_EXTRACTION_MODE=always
AI_CONCURRENCY=1
AI_REQUIRE_SUCCESS=false
PROCESSING_CONCURRENCY=3
PARSER_TIMEOUT_MS=30000
```

Railway injects `PORT`, so do not hard-code it.

## Optional Split Frontend

If a separate frontend origin is used, add:

```bash
ALLOWED_ORIGINS=https://your-frontend-domain
PUBLIC_API_BASE_URL=https://your-railway-backend-domain
```

After deploy, verify:

```text
https://your-railway-domain/api/health
```
