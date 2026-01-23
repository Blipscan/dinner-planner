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

## Notes

- The API uses in-memory storage for cookbook downloads.
- Demo mode works without an API key (returns sample menus and responses).
