# Dinner Party Planner - Complete Edition
## Thames Club - Production Ready for Beta

### Features
- 7-step wizard flow with progress indicator
- Expert consultation (Chef, Sommelier, Instructor personas)
- 12 menu inspiration categories
- Cascading cuisine selections (American → Southern, European → France → Provence)
- 5 AI-generated personalized menus
- Menu rejection flow with Chef follow-up
- 4 staffing configurations with adjusted timelines
- 15-section DOCX cookbook generation
- Print products with Avery paper specifications

### Deployment to Render

1. Push to GitHub
2. Go to Render Dashboard → New Web Service
3. Connect your GitHub repo
4. Set environment variables:
   - `ANTHROPIC_API_KEY` - Your Claude API key
   - `ACCESS_CODES` - Comma-separated beta codes (default: BETA001,BETA002,BETA003)
   - `ADMIN_CODE` - Admin access code (default: ADMIN2024)
   - `BETA_EXPIRY` - Expiration date (default: 2026-03-01)
   - `MAX_GENERATIONS_PER_CODE` - Usage limit per code (default: 50)
5. Deploy

### Demo Mode
Works without API key - returns 5 pre-built sample menus.

### API Endpoints
- `GET /` - Main application
- `GET /api/health` - Health check
- `GET /api/data` - Client-side data
- `POST /api/validate-code` - Validate access code
- `POST /api/chat` - Expert persona chat
- `POST /api/generate-menus` - Generate 5 menu options
- `POST /api/generate-cookbook` - Generate cookbook
- `POST /api/download-cookbook` - Download DOCX

### Cookbook Sections
1. Cover Page
2. Menu Overview
3. 5 Complete Recipes
4. Wine Pairings
5. Shopping List
6. Day-Before Prep
7. Day-Of Timeline
8. Plating Guides
9. Table Setting
10. Ambiance Guide
11. Final Checklist

### Print Products (Avery)
**Place Cards:** 5302, 5309
**Menu Cards:** 8315, 3265
**Invitations:** 8315

### Tech Stack
- Node.js 18+
- Express.js
- @anthropic-ai/sdk
- docx (Word document generation)
