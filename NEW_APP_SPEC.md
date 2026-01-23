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
- American (regions + styles)
- European (country -> region)
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
  - Each course includes dish name and wine pairing (nullable where needed).

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
- Detailed recipe previews with ingredients and steps.
- Tiered wine pairing budgets.
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
    { "type": "Amuse-Bouche", "name": "Dish name", "wine": null },
    { "type": "First Course", "name": "Dish name", "wine": "Wine name" },
    { "type": "Second Course", "name": "Dish name", "wine": "Wine name" },
    { "type": "Main Course", "name": "Dish name", "wine": "Wine name" },
    { "type": "Dessert", "name": "Dish name", "wine": "Wine name" }
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
  "makeAhead": "Prep notes"
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
  - Response: `{ "recipes": [...], "wineTiers": [...] }`
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

## 11. Success Metrics
- 70 percent of users complete the wizard.
- Median time to cookbook download under 8 minutes.
- 50 percent of users regenerate menus at least once (engagement).
- Fewer than 2 percent of AI responses require manual fallback.

## 12. Tech Stack (Preferred)
- Node.js 18+
- Express.js
- Anthropic SDK for AI responses
- DOCX generation library
- Static web frontend (HTML, CSS, JS)

