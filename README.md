# Dinner Planner (Cadillac)

Single repo with:
- **Backend**: Node/Express in `server/`
- **Frontend**: static HTML/JS in `client/` (served by the backend)

## Local development

### Run (recommended)

```bash
npm install
npm start
```

Then open `http://localhost:3000`.

### Run from `server/` directly

```bash
cd server
npm install
npm start
```

## Deployment (Render)

This repo is designed to deploy via **Render Blueprint** using `render.yaml`.

`render.yaml` uses:
- **Build**: `npm ci --prefix server`
- **Start**: `npm start --prefix server`

### Required environment variables

- **`ANTHROPIC_API_KEY`**: Claude API key (enables real chat + menu generation)

### Optional environment variables

- **`ANTHROPIC_MODEL`**: model name (default: `claude-sonnet-4-20250514`)
- **`ACCESS_CODES`**: comma-separated list (default: `BETA001,BETA002,BETA003`)
- **`ADMIN_CODE`**: admin override code (default: `ADMIN2024`)
- **`BETA_EXPIRY`**: date string (default: `2026-03-01`)
- **`MAX_GENERATIONS_PER_CODE`**: integer (default: `50`)

## Quick verification (after deploy)

Replace `<service>` with your Render URL.

- **AI connectivity on entry**:
  - `GET <service>/api/health?probe=1`
  - Expect: `aiReachable: true|false` and `apiConfigured: true|false`
- **Chef chat**:
  - `POST <service>/api/chat`
- **Static assets**:
  - `GET <service>/favicon.svg` should be **200**

## Notes / common gotchas

- If the deployed API “reverts”, Render is usually deploying a different **branch/service**, or the dashboard **Build/Start Commands** are overriding `render.yaml`.
- Best practice is to create the service via **Blueprint**, and redeploy with **Clear build cache & deploy** after env var changes.

