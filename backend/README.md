# veridico-backend

A small Fastify + TypeScript service that sits between the Verídico frontend and the existing **SON Intelligence Gateway**.

```
Browser → Verídico frontend → veridico-backend → SON Intelligence (/v1/ask)
                                   └─ not configured / timeout / unavailable → deterministic-demo
```

- Verídico owns the operational truth: session, events, detected workflow, recommendation and estimates.
- SON Intelligence owns model, provider, routing and product policy.

This service is not SON Intelligence. It has no database, no auth, no model SDK, no agents and no RAG.

## Endpoints

| Method | Path | Response |
|---|---|---|
| GET | `/health` | `{ "status": "ok", "service": "veridico-backend" }` (Railway healthcheck) |
| GET | `/ready` | `200 { status: "ready", checks }` / `503 { status: "not_ready", checks }`. Checks configuration only (SON URL + key, CORS, leads webhook). It never calls SON or a model. |
| POST | `/api/intelligence` | Request: `{ question, lang, session_id?, context }`. Response: `{ output, provider: "son-intelligence", request_id }` or `{ output: null, provider: "deterministic-demo", fallback: true, fallback_reason, request_id }` |
| POST | `/api/leads` | Response: `{ accepted: true }` or `{ accepted: false, fallback: true }` |

Two things to know about `/api/intelligence`:

- The `context` is produced by `buildIntelligenceContext()` in the frontend. It is validated and stripped by `src/intelligence/context-builder.ts`.
- SON Intelligence receives exactly `{ input, context, metadata: { session_id } }` with `Authorization: Bearer $SON_INTELLIGENCE_KEY`.

On the `deterministic-demo` directive, the frontend answers with its existing `DemoIntelligenceProvider`: the single deterministic implementation, grounded in the same context. It also covers this service being down.

## Environment

See `.env.example`.

| Variable | Required | Notes |
|---|---|---|
| `NODE_ENV` | yes | `production` on Railway |
| `PORT` | auto | Provided by Railway (default 3000 locally) |
| `SON_INTELLIGENCE_URL` | yes | Base URL of SON Intelligence (the service appends `/v1/ask`) |
| `SON_INTELLIGENCE_KEY` | yes | Secret. Only in Railway variables. |
| `ALLOWED_ORIGINS` | recommended | Comma-separated origins. `https://veridico.son.enterprises` is always allowed. `*` is rejected in production. |
| `LEADS_WEBHOOK_URL` | optional | Where leads are forwarded. Unset → `{ accepted: false, fallback: true }` |
| `SON_INTELLIGENCE_TIMEOUT_MS` | optional | Default `10000` |
| `BODY_LIMIT_BYTES` | optional | Default `65536`. Larger bodies → 413. |

## Security

- Zod validation on every body; unknown context fields are stripped.
- Body limit; explicit CORS allow-list; `Cache-Control: no-store` on the API routes.
- Basic security headers (nosniff, DENY, CSP `default-src 'none'`, HSTS in production).
- Production errors carry no stack traces or messages.
- Logs never include the key, request bodies or the full context (only state and counts).

## Develop and test

```bash
npm install
cp .env.example .env    # set NODE_ENV=development and ALLOWED_ORIGINS=http://localhost:8765
npm run dev
npm run typecheck && npm test && npm run build
```

## Railway

1. New service from this repo.
2. Settings: **Root Directory** = `backend`, **Config File Path** = `/backend/railway.toml`. Railway resolves the config path from the repo root.
3. Variables: `NODE_ENV=production`, `SON_INTELLIGENCE_URL`, `SON_INTELLIGENCE_KEY`, `ALLOWED_ORIGINS`, and optionally `LEADS_WEBHOOK_URL`.
4. Deploy. `railway.toml` runs `npm ci --include=dev && npm run build`, starts with `npm start` on `$PORT`, health-checks `/health`, and restarts on failure (5 retries).
5. Check that `GET /ready` returns `200` and `checks.son_intelligence: true`.
