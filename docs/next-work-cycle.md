# Next Work Cycle Notes (Sandbox + Deliberate Testing)

Last updated: 2026-01-12

## Current deployment reality (Railway)

- **If Railway “Private Networking only” is enabled, you will not have a public URL.**
  - Fix: enable public ingress + generate a Railway domain in the service’s **Domains/Networking** settings.
- **This repo’s server runs from `server/`**:
  - Server entry: `server/server.js`
  - Start script: `server/package.json` → `npm start` → `node server.js`
  - Listens on: `process.env.PORT` (falls back to `3000`)
  - Serves UI from: `client/index.html` via Express static middleware
- **Railway service settings (recommended):**
  - Root directory: `server`
  - Build: `npm ci`
  - Start: `npm start`
  - Env vars: see `server/.env.example`

## App architecture (what exists now)

### Server

- **Express server**: `server/server.js`
- **Static frontend**: `client/index.html` served at `/`
- **Key endpoints**:
  - `GET /api/health` → sanity/status JSON
  - `GET /api/data` → data needed by the UI (cuisines, personas, etc.)
  - `POST /api/validate-code` → access-code gate for beta
  - `POST /api/chat` → persona chat (Chef/Sommelier/Instructor/All)
  - `POST /api/generate-menus` → returns 5 menus (AI or `DEMO_MENUS`)
  - `POST /api/generate-cookbook` → creates cookbook ID + generates recipes
  - `POST /api/download-cookbook` → generates DOCX and returns it
  - `GET /cookbook/:cookbookId` → HTML cookbook preview/print page

### Frontend

- Single-page HTML wizard: `client/index.html`
- Cookbook step currently offers:
  - Download DOCX
  - View/Print HTML cookbook (`/cookbook/:cookbookId`)

## Known issues / gaps (high priority)

### 1) Sommelier memory / continuity

Observed: Sommelier asks questions that imply it doesn’t “remember” what it recommended.

Likely cause: `/api/chat` system prompt uses event context, but does **not** reliably include:
- the selected menu
- the wine pairings already chosen
- a compact summary of the conversation state

Fix direction (next cycle):
- Include a **menu+pairings summary** in the system prompt when persona is `sommelier` (and for `all`).
- Optionally store and pass a compact “state object” (selected menu, wine list, decisions) instead of only chat transcript.

### 2) Cookbook persistence (important)

`global.cookbooks` is in-memory.
- On redeploy/restart, cookbooks disappear and `/cookbook/:id` and downloads can 404.

Fix direction (next cycle):
- Add a persistence layer (even a simple one):
  - Redis, SQLite, Postgres, or object storage for generated artifacts
  - Minimum viable: store cookbook JSON in a DB keyed by `cookbookId`

### 3) Print product PDFs are “stubbed”

UI buttons previously showed an alert (“coming in next release”).

Fix direction (next cycle):
- Implement real PDF generation routes + templates per Avery SKU.

Status update:
- Implemented a **minimal v1** PDF generator:
  - `POST /api/print-product` with `{ cookbookId, type, sku }`
  - UI now downloads PDFs for place cards / menu cards / invitations
  - Layouts are pragmatic for beta (not perfect Avery specs yet)

## What was fixed (this cycle)

### Cookbook content was “empty”

Root cause:
- `POST /api/generate-cookbook` previously stored `recipes: null`, so:
  - DOCX Recipes section fell back to placeholders
  - HTML “cookbook” experience was essentially just a checklist

Fix:
- `POST /api/generate-cookbook` now generates `recipes` (AI if key is set; richer demo fallback otherwise).
- `buildShoppingList()` now uses recipe ingredients to populate categorized checklist items.
- Added `GET /cookbook/:cookbookId` for HTML preview/print.
- Added “View / Print HTML Cookbook” button in UI.

## Deliberate testing loop (recommended for beta)

### Acceptance checks (manual, fast)

- **Public URL works**
  - `GET /api/health` returns `{ status: "ok" }`
- **Menu generation**
  - Step through wizard → generate menus → verify 5 menus render
- **Cookbook generation**
  - Generate cookbook → verify:
    - HTML cookbook page contains ingredients + steps for 5 courses
    - DOCX download is non-empty and includes recipe text
    - Shopping list contains real items (not only placeholders)
- **Regression checks**
  - Access code gating still works (invalid code blocked; valid code allowed)

### Add a “smoke test” cadence

- Before sharing with testers: run the acceptance checks above once.
- After any server prompt changes: re-check chat + menu generation once.
- After any cookbook changes: re-check cookbook HTML + DOCX once.

## Sandbox / staging recommendation

Best practice for beta:
- **Sandbox**: internal use only, rapid changes, may break.
- **Staging**: “release candidate” for a small subset of testers.
- **Production beta**: stable, minimal churn.

Implementation options:
- **Railway**: two services/projects (sandbox vs beta), same repo.
  - Sandbox can run in demo mode (no API key) or with a separate API key.
  - Staging/beta uses full keys and stricter rate limits.
- Add environment flags:
  - `APP_ENV=sandbox|staging|beta`
  - Use this to control logging verbosity, feature flags, and UI banners.

## When to finalize the UI look

Don’t “freeze” the UI until these are stable:
- Wizard flow + step ordering
- Data model + state you need to carry between steps
- Cookbook outputs (HTML + DOCX) are meeting expectations

Recommended timing:
- **Finalize the design system early** (colors, typography, spacing, components) once the basic flow is correct.
- **Finalize/polish the UI later** (micro-interactions, animations, pixel-perfect spacing) after:
  - 1–2 full beta cycles of feedback
  - no major changes to the wizard’s step structure

Rule of thumb:
- Freeze UI polish when feature work shifts from “what is it?” to “how does it feel?”, and when you’re spending more time moving buttons than fixing core user value.

