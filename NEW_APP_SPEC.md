# New App Specification: Dinner Party Planner (Everything We Want)

Version: 1.0  
Date: 2026-01-23  
Owner: Product + Engineering

## 1. Vision
Create a premium, guided dinner party planner that turns a host's ideas into a
complete, execution-ready experience: menu, wine pairings, timeline, staffing
plan, and a polished cookbook for print or download. The app should feel like a
concierge service with expert guidance and beautiful outputs.

## 2. Goals
- Deliver a polished end-to-end planning flow in 7 steps.
- Provide AI-assisted expert consultation and menu generation.
- Produce a downloadable, print-ready cookbook with all execution details.
- Support beta access control and usage tracking.
- Provide demo mode so the app is usable without API credentials.

## 3. Non-Goals
- Payments or e-commerce checkout.
- Marketplace for hiring staff (we only recommend staffing levels).
- Fully automated grocery ordering.

## 4. Target Users and Personas
- Host (primary): Wants a memorable dinner with minimal stress.
- Co-host/Helper: Needs a clear prep and timing plan.
- Admin (internal): Manages beta access and monitors usage.

## 5. Primary User Journey (7-Step Wizard)
1. **Access Code**
   - Validate access code or admin code.
   - Display remaining generations and beta status.
2. **Event Details**
   - Event title, date, service time, guest count.
   - Guest list for place cards.
   - Food budget (per person), wine budget (total), skill level.
3. **Preferences**
   - Choose menu inspiration (12 options).
   - Choose menu style (8 options).
   - Choose cuisine and optional sub-cuisine (cascading).
   - Likes, dislikes, dietary restrictions.
4. **Expert Consultation**
   - Select persona: Chef, Sommelier, Instructor, or Team.
   - Chat with context-aware experts.
5. **Menu Selection**
   - Generate 5 AI menus with courses and wine pairings.
   - Accept, or reject with feedback and regenerate.
6. **Staffing Selection**
   - Pick staffing model (solo, +1, +2, hired chef).
   - Adjust timeline intensity based on staffing.
7. **Cookbook Download**
   - Generate and download a DOCX cookbook.
   - Provide print product recommendations.

## 6. Functional Requirements

### 6.1 Access Control and Beta Management
- Access codes are validated against a configured allowlist.
- Admin code bypasses limits and returns elevated access.
- Beta expiration date blocks standard access codes after expiration.
- Usage tracking per access code with remaining generation count.

### 6.2 Event Details
Required fields:
- Event title
- Event date
- Guest count
- Service time
Optional fields:
- Guest list (for place cards)
- Food budget (per person)
- Wine budget (total)
- Skill level (beginner/intermediate/advanced)

### 6.3 Preferences
Menu inspirations (12):
- Chefs Tasting, Adventurous, Garden to Table, What Mom Made
- Whats On Sale, Whats In Season, From Restaurants, Michelin Inspired
- Holiday Traditional, Dietary Focus, World Street Food, I Already Know

Menu styles (8):
- Classic Formal, Modern Minimalist, Romantic Elegance, Art Deco
- Rustic Elegant, Vintage Botanical, Coastal Elegance, Urban Chic

Cuisine selections (cascading):
- American (region -> subregion):
  - Northeast: New England, Mid-Atlantic
  - South: Lowcountry, Deep South, Gulf Coast, Texas, Appalachia
  - Midwest: Great Lakes, Plains, Upper Midwest
  - West: Pacific Northwest, California, Southwest, Mountain West, Alaska, Hawaii
- European (country -> region):
  - France: Provence, Bordeaux, Burgundy, Loire Valley, Alsace, Champagne, Rhone, Normandy, Brittany
  - Italy: Tuscany, Piedmont, Veneto, Emilia-Romagna, Campania, Sicily, Sardinia, Lazio, Puglia
  - Spain: Basque, Catalonia, Andalusia, Galicia, Rioja, Valencia, Madrid
  - Germany: Bavaria, Mosel, Rheingau, Baden, Pfalz, Saxony
  - UK and Ireland: England (Cornwall, London, Yorkshire), Scotland (Highlands, Islands), Wales, Ireland
  - Portugal: Douro, Alentejo, Lisboa, Madeira, Azores
  - Greece: Crete, Cyclades, Macedonia, Peloponnese, Athens
  - Scandinavia: Sweden, Denmark, Norway, Finland, Iceland
  - Benelux: Belgium (Flanders, Wallonia), Netherlands (North Holland, South Holland)
  - Central Europe: Austria (Vienna, Styria, Tyrol), Switzerland (Valais, Ticino)
  - Eastern Europe: Poland, Hungary, Czechia, Croatia, Romania, Bulgaria
- Asian (country -> region)
- Mexican (region + style)
- Middle Eastern, Caribbean, Mediterranean, South American

Preference inputs:
- Likes (freeform list)
- Dislikes (freeform list)
- Dietary restrictions (freeform list)

### 6.4 Expert Consultation
- Persona options: Chef, Sommelier, Instructor, Team.
- Each persona has a distinct system prompt and response style.
- Chat history is preserved for menu generation context.
- If AI is unavailable, return helpful demo responses.

### 6.5 Menu Generation
Generate 5 menus, each with:
- id (1-5)
- title
- personality (one-sentence description)
- foodCost (per person)
- wineCost (total)
- courses (5):
  - Amuse-Bouche
  - First Course
  - Second Course
  - Main Course
  - Dessert
  - Each course includes dish name and wine pairing with 4 tiers:
    - Highest rated worldwide
    - Highest rated domestic
    - Highest rated budget
    - What would James Bond order

Regeneration:
- Allow the user to reject menus with feedback.
- Rejected feedback is included in the next generation prompt.

### 6.6 Staffing Selection
Options:
- Solo cook
- +1 helper
- +2 helpers
- Hired chef

Each option adjusts active cooking time and timeline guidance.

### 6.7 Cookbook Generation (DOCX)
Produce a DOCX with 15 sections:
1. Cover Page
2. Menu Overview
3. Wine Program
4. Complete Recipes (5)
5. Shopping List by Category
6. Day-Before Prep Schedule
7. Day-Of Timeline
8. Plating Guides
9. Table Setting Guide
10. Service Notes
11. Ambiance and Music
12. Final Checklist
13. AI Image Prompts
14. Notes Pages
15. Copyright

Include:
- Detailed recipe previews with ingredients, steps, and why it works.
- Four-tier wine pairings per course (worldwide, domestic, budget, Bond pick).
- Staffing-adjusted timing.

### 6.8 Print Product Recommendations
Provide Avery SKU suggestions for:
- Place cards
- Menu cards
- Invitations
- Table numbers

### 6.9 Demo Mode and Fallbacks
- If no AI key is configured, return demo menus and chat responses.
- If AI returns invalid data, optionally fallback to demo content.

## 7. Non-Functional Requirements
- **Performance:** Menu generation and details under configured timeouts.
- **Reliability:** Graceful errors with user-friendly messaging.
- **Security:** Do not store secrets client-side; protect admin code.
- **Privacy:** Avoid storing PII beyond session unless explicitly enabled.
- **Accessibility:** Keyboard navigation, contrast-compliant UI.
- **Observability:** Log AI errors and generation timing.

## 8. Data Model (Core Shapes)

### Event Context
```
{
  "eventTitle": "Dinner Party",
  "eventDate": "2026-02-14",
  "guestCount": 6,
  "serviceTime": "7:00 PM",
  "foodBudget": "$45-60/person",
  "wineBudget": "$80-120 total",
  "skillLevel": "intermediate",
  "inspiration": "chefs-tasting",
  "style": "classic",
  "cuisine": "european",
  "subCuisine": "france",
  "likes": ["herbs", "seafood"],
  "dislikes": ["cilantro"],
  "restrictions": ["gluten-free"],
  "guestList": ["Avery N.", "Sam R."]
}
```

### Menu
```
{
  "id": 1,
  "title": "Midnight in Provence",
  "personality": "Elegant, herb-forward, and seasonal.",
  "foodCost": "$45-55/person",
  "wineCost": "$120 total",
  "courses": [
    {
      "type": "Amuse-Bouche",
      "name": "Dish name",
      "wine": {
        "worldwideTopRated": "Wine name",
        "domesticTopRated": "Wine name",
        "budgetTopRated": "Wine name",
        "bondPick": "Wine name"
      }
    },
    {
      "type": "First Course",
      "name": "Dish name",
      "wine": {
        "worldwideTopRated": "Wine name",
        "domesticTopRated": "Wine name",
        "budgetTopRated": "Wine name",
        "bondPick": "Wine name"
      }
    },
    {
      "type": "Second Course",
      "name": "Dish name",
      "wine": {
        "worldwideTopRated": "Wine name",
        "domesticTopRated": "Wine name",
        "budgetTopRated": "Wine name",
        "bondPick": "Wine name"
      }
    },
    {
      "type": "Main Course",
      "name": "Dish name",
      "wine": {
        "worldwideTopRated": "Wine name",
        "domesticTopRated": "Wine name",
        "budgetTopRated": "Wine name",
        "bondPick": "Wine name"
      }
    },
    {
      "type": "Dessert",
      "name": "Dish name",
      "wine": {
        "worldwideTopRated": "Wine name",
        "domesticTopRated": "Wine name",
        "budgetTopRated": "Wine name",
        "bondPick": "Wine name"
      }
    }
  ]
}
```

### Recipe Detail
```
{
  "title": "Dish name",
  "serves": 6,
  "activeTime": "30 min",
  "totalTime": "1 hour",
  "ingredients": ["Ingredient 1", "Ingredient 2"],
  "steps": ["Step 1", "Step 2"],
  "notes": "Chef note",
  "makeAhead": "Prep notes",
  "whyItWorks": "Short explanation of flavor and technique balance."
}
```

### Wine Pairing (per course)
```
{
  "worldwideTopRated": "Highest rated worldwide pick",
  "domesticTopRated": "Highest rated domestic pick",
  "budgetTopRated": "Highest rated budget pick",
  "bondPick": "What would James Bond order"
}
```

## 9. API Contract
All endpoints return JSON unless otherwise noted.

- `GET /api/health`
  - Returns status, API key presence, beta expiry, version.
- `GET /api/data`
  - Returns cuisines, inspirations, styles, staffing, personas, cookbook sections.
- `POST /api/validate-code`
  - Request: `{ "code": "BETA001" }`
  - Response: `{ "valid": true, "remaining": 49, "isAdmin": false }`
- `POST /api/chat`
  - Request: `{ "persona": "chef", "messages": [...], "context": {...} }`
  - Response: `{ "response": "..." }`
- `POST /api/generate-menus`
  - Request: `{ "code": "BETA001", "context": {...}, "chatHistory": [...], "rejectionHistory": [...] }`
  - Response: `{ "menus": [...] }`
- `POST /api/generate-details`
  - Request: `{ "menu": {...}, "context": {...} }`
  - Response: `{ "recipes": [...], "winePairings": [...] }`
- `POST /api/generate-cookbook`
  - Request: `{ "menu": {...}, "details": {...}, "context": {...} }`
  - Response: `{ "cookbookId": "..." }`
- `POST /api/download-cookbook`
  - Request: `{ "cookbookId": "..." }`
  - Response: DOCX file download.

## 10. UX Requirements
- Progress indicator across 7 steps.
- Ability to go back and edit previous steps.
- Clear error messages and validation inline.
- Save progress in session (local storage) to avoid data loss.
- Elegant, premium visual style consistent with a high-end dining experience.

### 10.1 Step-by-step Flow and Validation
**Step 1: Access Code**
- Input is required, trimmed, uppercased before validation.
- Show remaining generations and beta expiry on success.
- Errors: invalid code, expired beta, usage limit reached.

**Step 2: Event Details**
- Event title: 3-80 characters.
- Event date: today or future date.
- Guest count: integer 1-30 (configurable max).
- Service time: HH:MM format or time picker.
- Budgets: freeform but must contain a number.
- Skill level: beginner, intermediate, advanced.
- Guest list: optional; names 1-40 chars, remove duplicates.

**Step 3: Preferences**
- Inspiration: required (one of 12).
- Style: required (one of 8).
- Cuisine: optional; if chosen, sub-cuisine required.
- Likes/dislikes/restrictions: optional, up to 15 items each.

**Step 4: Expert Consultation**
- Persona selection required before chat.
- Message length: 1-500 characters.
- Persist chat history for menu generation.
- Show AI typing indicator and retry on failure.

**Step 5: Menu Selection**
- Generate exactly 5 menus per request.
- Require a selected menu to proceed.
- Regeneration requires feedback (10-250 chars).
- Each generation consumes one usage credit.

**Step 6: Staffing Selection**
- Required selection.
- Immediately updates timeline intensity labels.

**Step 7: Cookbook Download**
- Show summary of selected menu, staffing, and counts.
- Generate on demand with progress indicator.
- Allow retry if DOCX generation fails.

### 10.2 Navigation and State
- Back navigation preserves inputs without revalidation.
- Autosave step data to local storage on each change.
- Clear warning on tab close if unsaved changes.

### 10.3 Visual and Content Requirements
- Use design tokens for colors and typography.
- Primary CTA style and consistent spacing scale.
- All course names and wine picks are sentence case.

## 11. AI Prompting and Response Requirements
### 11.1 Input Payloads
- `context` includes event details, preferences, and staffing.
- `chatHistory` includes expert messages (role, content).
- `rejectionHistory` contains user feedback after menu rejection.

### 11.2 Response Formatting Rules
- Responses must be strict JSON only (no markdown, no prose).
- Keys must match schema exactly; unknown keys are ignored.
- All string values must be plain text (no HTML).

### 11.3 Menu Response Schema (Informal)
Each menu:
- `id`: integer 1-5
- `title`: string, 3-60 chars
- `personality`: string, 1 sentence
- `foodCost`: string (e.g., "$45-55/person")
- `wineCost`: string (e.g., "$120 total")
- `courses`: array length 5, types fixed order
- `courses[].wine`: required object with 4 tiers

Wine tiers object:
```
{
  "worldwideTopRated": "Wine name",
  "domesticTopRated": "Wine name",
  "budgetTopRated": "Wine name",
  "bondPick": "Wine name"
}
```

If a course should not have a pairing, set each tier value to null.

### 11.4 Detail Response Schema (Informal)
Response includes:
- `recipes`: one per course
- `winePairings`: array aligned to courses

Recipe detail must include:
- `whyItWorks`: 1-3 sentences explaining flavor/technique balance.

### 11.5 Tier Definitions
- **Worldwide top rated:** highest rated global pick for the pairing.
- **Domestic top rated:** highest rated in user locale; default to US.
- **Budget top rated:** best value under configured budget.
- **Bond pick:** luxury, iconic, and recognizable.

## 12. Data Persistence and Storage
- Client state stored in local storage:
  - `dinnerPlanner.state` (wizard data)
  - `dinnerPlanner.chat` (consultation history)
- Autosave on every change, restore on load.
- Server storage for generated cookbooks:
  - `cookbookId` maps to DOCX buffer.
  - Default retention: 24 hours.
  - Cleanup job runs at startup and hourly.

## 13. Security and Privacy
- Access codes and admin code provided via environment variables.
- Do not expose admin code or access lists to the client.
- Rate limit AI endpoints (default 10 requests per minute per IP).
- Sanitize all user inputs and enforce size limits.
- Do not log secrets or full chat contents; redact PII.

## 14. Cookbook Template and Layout
- Page size: US Letter, 1-inch margins.
- Fonts: headings in serif, body in readable serif or sans-serif.
- Each recipe includes:
  - Ingredients list
  - Steps
  - Notes
  - Make-ahead notes
  - Why it works paragraph
- Wine program includes a 4-tier table per course.
- Timeline sections show staffing-adjusted schedules.

## 15. Error Handling and Fallbacks
- Standard error shape:
  `{ "error": "Message", "code": "ERROR_CODE", "detail": "Optional" }`
- Use 400 for validation errors, 429 for rate limits, 502 for AI errors.
- Demo fallback is allowed when AI is unavailable if enabled.

## 16. Acceptance Criteria and Test Plan
**E2E Acceptance Criteria**
- Users can complete all 7 steps and download a DOCX.
- Menu regeneration works and includes feedback context.
- Wine pairings always include 4 tiers per course.
- Recipe details always include a why-it-works paragraph.

**API Tests**
- Validate-code rejects expired or over-limit codes.
- Generate-menus returns exactly 5 menus.
- Generate-details returns recipes and winePairings.
- Download-cookbook returns a valid DOCX.

**UI Tests**
- Field validations and error states.
- Back/forward navigation preserves data.
- Local storage restore works after refresh.

## 17. Observability and Logging
- Log request IDs and durations for AI endpoints.
- Track success vs failure counts for menu and detail generation.
- Log DOCX generation time and file size.

## 18. Deployment and Configuration
Environment variables:
- `ANTHROPIC_API_KEY` (required for AI)
- `ACCESS_CODES` (comma-separated)
- `ADMIN_CODE`
- `BETA_EXPIRY`
- `MAX_GENERATIONS_PER_CODE`
- `ALLOW_DEMO_FALLBACK`

Defaults:
- Port 3000
- AI timeouts: chat 15s, menus 25s, details 20s

## 19. Success Metrics
- 70 percent of users complete the wizard.
- Median time to cookbook download under 8 minutes.
- 50 percent of users regenerate menus at least once (engagement).
- Fewer than 2 percent of AI responses require manual fallback.

## 20. Tech Stack (Preferred)
- Node.js 18+
- Express.js
- Anthropic SDK for AI responses
- DOCX generation library
- Static web frontend (HTML, CSS, JS)

