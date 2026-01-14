# Dinner Party Planner — Cadillac Edition
## Production Ready for Beta

### Complete Feature Set

**7-Step Wizard Flow**
1. Access Code validation with usage tracking
2. Event Details (date, guests, service time, guest list for place cards)
3. Preferences (12 inspirations, 8 styles, cascading cuisines, likes/dislikes/restrictions)
4. Expert Consultation (Chef, Sommelier, Instructor personas with full AI conversation)
5. Menu Selection (5 AI-generated personalized menus, rejection flow with Chef follow-up)
6. Staffing Selection (4 options with timeline adjustments)
7. Cookbook Download (complete 15-section DOCX)

**Menu Inspirations (12)**
- Chef's Tasting, Adventurous, Garden to Table, What Mom Made
- What's On Sale, What's In Season, From Restaurants, Michelin Inspired
- Holiday Traditional, Dietary Focus, World Street Food, I Already Know

**Menu Card Styles (8)**
- Classic Formal, Modern Minimalist, Romantic Elegance, Art Deco
- Rustic Elegant, Vintage Botanical, Coastal Elegance, Urban Chic

**Cascading Cuisine Selections**
- American → 8 regions + 6 styles
- European → France/Italy/Spain/Germany/UK/Portugal/Greece/Scandinavia → sub-regions
- Asian → China/Japan/Thailand/Vietnam/Korea/India → sub-regions
- Mexican → 8 regions + 4 styles
- Middle Eastern, Caribbean, Mediterranean, South American

**Expert Personas (4)**
- The Chef (James Beard Award winner) — menu design, ingredients
- The Sommelier (Master Sommelier) — wine pairings
- The Instructor (CIA Hyde Park) — timing, execution
- The Team (all three collaborating)

**15-Section DOCX Cookbook**
1. Cover Page
2. Menu Overview
3. Wine Program
4. Complete Recipes (5 courses with ingredients, steps, notes)
5. Shopping List by Category
6. Day-Before Prep Schedule
7. Day-Of Timeline
8. Plating Guides
9. Table Setting Guide
10. Service Notes
11. Ambiance & Music
12. Final Checklist
13. AI Image Prompts
14. Notes Pages
15. Copyright

**Print Products (Avery)**
- Place Cards: 5302, 5309, 3328, 35701
- Menu Cards: 8315, 3265, 3263
- Invitations: 8315, 3379, 8317
- Table Numbers: 5305

---

### Deployment to Render

1. Push this folder to GitHub (e.g., `Blipscan/dinner-planner`)
2. Go to Render Dashboard → New → Web Service
3. Connect your GitHub repo
4. Set Build Command: `npm install`
5. Set Start Command: `node server.js`
6. Add Environment Variable:
   - `ANTHROPIC_API_KEY` = your Claude API key from console.anthropic.com
7. Deploy

---

### Deployment to Railway (recommended for beta)

1. Create a new Railway project and add this repo.
2. Create a **Service** from the repo.
3. In the service settings, set **Root Directory** to `server`
4. Set:
   - Build Command: `npm ci`
   - Start Command: `npm start`
5. Ensure **Networking is Public** and generate a Railway domain.
6. (Recommended) Add Postgres:
   - Add Plugin → Postgres
   - Ensure `DATABASE_URL` is set on the service (Railway usually wires this automatically)
7. Add env vars (see `.env.example`):
   - `ANTHROPIC_API_KEY`
   - `ACCESS_CODES`
   - `ADMIN_CODE`
   - `MAX_GENERATIONS_PER_CODE`
   - `BETA_EXPIRY`

**Sanity checks**
- `GET /api/health` should return JSON with `status: "ok"`
- `/admin.html` lets you view access-code usage (requires `ADMIN_CODE`)

**Optional Environment Variables:**
- `ACCESS_CODES` — Comma-separated codes (default: BETA001,BETA002,BETA003)
- `ADMIN_CODE` — Admin code (default: ADMIN2024)
- `BETA_EXPIRY` — Expiration date (default: 2026-03-01)
- `MAX_GENERATIONS_PER_CODE` — Usage limit (default: 50)

---

### Demo Mode

Works without API key — returns 5 pre-built sample menus and placeholder chat responses.

---

### Files

```
dinner-planner-cadillac/
├── server.js      # Express server, API routes
├── data.js        # All data structures (cuisines, personas, etc.)
├── cookbook.js    # DOCX generation (15 sections)
├── index.html     # Complete frontend (1589 lines)
├── package.json   # Dependencies
└── README.md      # This file
```

---

### Tech Stack
- Node.js 18+
- Express.js
- @anthropic-ai/sdk (Claude API)
- docx (Word document generation)
- Vanilla JavaScript frontend

---

© 2025 — AI-assisted recipe development. Recipes are original adaptations inspired by classic techniques.
