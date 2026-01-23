# Dinner Party Planner - New App

This folder contains the next-generation app build for the Dinner Party Planner.

## Structure

- apps/api
  - Express API, AI orchestration, DOCX cookbook generation
- apps/web
  - Static web UI served by the API
- packages/shared
  - Shared utilities and data (placeholder)
- packages/ui
  - Design system and components (placeholder)
- docs, config, infra, scripts, tests
  - Reserved for build documentation and tooling

## Local development

1. Install API dependencies:
   - cd new-app/apps/api
   - npm install
2. Configure environment variables:
   - copy new-app/apps/api/.env.example to .env
   - set ANTHROPIC_API_KEY
3. Start the API (serves the web UI):
   - npm start
4. Open http://localhost:3000

## Deployment

### Render
1. Create a new Render Web Service.
2. Set the root directory to `new-app/apps/api`.
3. Build command: `npm install`
4. Start command: `npm start`
5. Add environment variables (see `.env.example`).

### Docker
1. From the `new-app` folder:
   - docker build -t dinner-planner .
   - docker run -p 3000:3000 --env-file apps/api/.env dinner-planner

Or with docker compose:
   - docker compose up --build

### Generic Node host
1. Upload `new-app/apps/api` and `new-app/apps/web/public` to the same host.
2. Run `npm install` inside `new-app/apps/api`.
3. Set environment variables from `.env.example`.
4. Run `npm start`.

## Notes

- The API uses in-memory storage for cookbook downloads.
- Demo mode works without an API key (returns sample menus and responses).
