// ============================================================
// DINNER PARTY PLANNER - CADILLAC EDITION
// ============================================================
 
const express = require("express");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");
 
const {
  saveCookbook,
  getCookbook,
  initStorage,
  storageMode,
  getCodeUsage,
  bumpCodeUsage,
  listCodeUsage,
  cleanupCookbooks,
} = require("./storage");

const {
  CUISINES,
  MENU_INSPIRATIONS,
  MENU_STYLES,
  STAFFING,
  AVERY_PRODUCTS,
  PERSONAS,
  DEMO_MENUS,
  COOKBOOK_SECTIONS,
  COPYRIGHT_TEXT,
} = require("./data");
 
const { buildCookbook } = require("./cookbook");
const { generatePrintPdf } = require("./pdf");
 
const app = express();
 
// ============================================================
// STATIC + PARSING
// ============================================================
 
app.use(express.json({ limit: "10mb" }));
 
const CLIENT_DIR = path.join(__dirname, "..", "client");
app.use(express.static(CLIENT_DIR));
 
app.get("/", (req, res) => {
  res.sendFile(path.join(CLIENT_DIR, "index.html"));
});
 
// ============================================================
// CONFIGURATION
// ============================================================
 
const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
 
const ADMIN_CODE = process.env.ADMIN_CODE || "ADMIN2024";
const ACCESS_CODES = (process.env.ACCESS_CODES || "BETA001,BETA002,BETA003")
  .split(",")
  .map((c) => c.trim());
 
const BETA_EXPIRY = process.env.BETA_EXPIRY || "2026-03-01";
const MAX_GENERATIONS = parseInt(process.env.MAX_GENERATIONS_PER_CODE || "50", 10);
const COOKBOOK_TTL_DAYS = parseInt(process.env.COOKBOOK_TTL_DAYS || "30", 10);
const COOKBOOK_CLEANUP_INTERVAL_HOURS = parseInt(process.env.COOKBOOK_CLEANUP_INTERVAL_HOURS || "12", 10);
 
function isValidBetaCode(code) {
  const upper = String(code || "").trim().toUpperCase();
  return ACCESS_CODES.map((c) => c.toUpperCase()).includes(upper);
}
 
let lastCookbookCleanup = null;
async function runCookbookCleanup() {
  try {
    const result = await cleanupCookbooks(COOKBOOK_TTL_DAYS);
    lastCookbookCleanup = { at: new Date().toISOString(), ...result };
  } catch (e) {
    console.error("Cookbook cleanup error:", e);
    lastCookbookCleanup = { at: new Date().toISOString(), error: String(e?.message || e) };
  }
}

// ============================================================
// API ROUTES
// ============================================================
 
// Health check
app.get("/api/health", async (req, res) => {
  // Best-effort init so health shows DB readiness.
  try {
    await initStorage();
  } catch (e) {
    // Don't fail health for storage issues; just report.
    console.error("Storage init error (health):", e);
  }

  res.json({
    status: "ok",
    apiConfigured: !!ANTHROPIC_API_KEY,
    betaExpiry: BETA_EXPIRY,
    version: "2.0.0-cadillac",
    cookbookStorage: storageMode(),
    cookbookTtlDays: COOKBOOK_TTL_DAYS,
    lastCookbookCleanup,
  });
});
 
// Get all data for client
app.get("/api/data", (req, res) => {
  res.json({
    CUISINES,
    MENU_INSPIRATIONS,
    MENU_STYLES,
    STAFFING,
    AVERY_PRODUCTS,
    COOKBOOK_SECTIONS,
    personas: Object.fromEntries(
      Object.entries(PERSONAS).map(([k, v]) => [
        k,
        {
          name: v.name,
          icon: v.icon,
          credentials: v.credentials,
          philosophy: v.philosophy,
        },
      ])
    ),
  });
});
 
// Validate access code
app.post("/api/validate-code", async (req, res) => {
  const { code } = req.body;
 
  if (!code) {
    return res.json({ valid: false, message: "Please enter an access code." });
  }
 
  const upperCode = code.trim().toUpperCase();
 
  // Admin code
  if (upperCode === ADMIN_CODE.toUpperCase()) {
    return res.json({ valid: true, isAdmin: true, remaining: 999 });
  }
 
  // Check beta expiry
  if (new Date() > new Date(BETA_EXPIRY)) {
    return res.json({ valid: false, message: "Beta period has ended." });
  }
 
  // Check if valid code
  if (!isValidBetaCode(upperCode)) {
    return res.json({ valid: false, message: "Invalid access code." });
  }
 
  const usage = await getCodeUsage(upperCode);
  if ((usage?.generations || 0) >= MAX_GENERATIONS) {
    return res.json({ valid: false, message: "Usage limit reached for this code." });
  }
 
  res.json({ valid: true, remaining: MAX_GENERATIONS - (usage?.generations || 0) });
});
 
function requireAdmin(req) {
  const headerCode = req.get("x-admin-code");
  const queryCode = req.query?.adminCode;
  const bodyCode = req.body?.adminCode;
  const provided = (headerCode || queryCode || bodyCode || "").toString();
  return provided && provided.toUpperCase() === ADMIN_CODE.toUpperCase();
}

// Admin: access code usage overview
app.get("/api/admin/code-usage", async (req, res) => {
  if (!requireAdmin(req)) return res.status(401).json({ error: "Unauthorized" });

  const rows = await listCodeUsage();
  const byCode = Object.fromEntries(rows.map((r) => [String(r.code).toUpperCase(), r]));

  const known = ACCESS_CODES.map((c) => c.trim()).filter(Boolean).map((c) => c.toUpperCase());
  const allCodes = Array.from(new Set([...known, ...Object.keys(byCode)])).sort();

  const usage = allCodes.map((code) => {
    const row = byCode[code];
    const generations = row?.generations || 0;
    return {
      code,
      known: known.includes(code),
      generations,
      remaining: Math.max(0, MAX_GENERATIONS - generations),
      lastUsed: row?.lastUsed || null,
      limit: MAX_GENERATIONS,
    };
  });

  res.json({
    storage: storageMode(),
    count: usage.length,
    usage,
  });
});

// Admin: run cookbook cleanup now (optional ttlDays override)
app.post("/api/admin/cleanup-cookbooks", async (req, res) => {
  if (!requireAdmin(req)) return res.status(401).json({ error: "Unauthorized" });
  const ttlDays = req.body?.ttlDays ?? COOKBOOK_TTL_DAYS;
  const result = await cleanupCookbooks(ttlDays);
  lastCookbookCleanup = { at: new Date().toISOString(), ...result };
  res.json(lastCookbookCleanup);
});

// Chat with expert persona
app.post("/api/chat", async (req, res) => {
  const { persona, messages, context, menu } = req.body || {};
 
  if (!ANTHROPIC_API_KEY) {
    const demoResponses = {
      chef: "I love the direction you're thinking! For a dinner party this size, I'd suggest building around one show-stopping protein. What ingredients are you most excited about right now?",
      sommelier: "Great question! For your menu style, I'd recommend starting with something crisp and refreshing, then building to fuller-bodied wines as the meal progresses. What's your comfort level with wine - do your guests tend toward adventure or familiar favorites?",
      instructor: "Let's make sure you're set up for success. The key is doing as much as possible the day before. What's your biggest concern about the timing?",
      all: "Chef: That sounds delicious!\n\nSommelier: I have some perfect pairing ideas.\n\nInstructor: And I can help you time everything perfectly.",
    };
    return res.json({ response: demoResponses[persona] || demoResponses.chef });
  }
 
  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const personaData = PERSONAS?.[persona] || PERSONAS.chef;
 
    const menuData = menu || context?.menu || null;
    const menuSummary = buildMenuContextSummary(menuData);
    const winePairings = buildWinePairingSummary(menuData);
    const wineGuidance =
      persona === "sommelier" || persona === "all"
        ? `\nSommelier continuity rules:\n- If a wine is already listed in the menu OR you already recommended a specific bottle earlier in this conversation, treat that as authoritative unless the user explicitly asks to change it.\n- Before asking a question, scan the prior messages for your own earlier recommendations.\n- Do NOT ask basic classification questions about a bottle already named (e.g., “is it red/white?”).\n`
        : "";

    const systemPrompt =
      (personaData?.systemPrompt || "") +
      `
 
Current event context:
- Event: ${context?.eventTitle || "Dinner Party"}
- Date: ${context?.eventDate || "TBD"}
- Guests: ${context?.guestCount || 6}
- Service Time: ${context?.serviceTime || "7:00 PM"}
- Food Budget: ${context?.foodBudget || "$45-60"}/person
- Wine Budget: ${context?.wineBudget || "$80-120"} total
- Skill Level: ${context?.skillLevel || "intermediate"}
- Inspiration: ${context?.inspiration || "chefs-tasting"}
- Cuisine: ${context?.cuisine || "any"} ${context?.subCuisine ? `(${context.subCuisine})` : ""}
- Likes: ${context?.likes?.join(", ") || "none specified"}
- Dislikes: ${context?.dislikes?.join(", ") || "none specified"}
- Restrictions: ${context?.restrictions?.join(", ") || "none"}

${menuSummary ? `\nSelected/Current Menu (if provided):\n${menuSummary}\n` : ""}
${winePairings ? `\nKnown Wine Pairings (from the menu; treat as authoritative):\n${winePairings}\n` : ""}
${wineGuidance}
 
Be conversational, warm, and helpful. Ask clarifying questions when needed. Share your expertise naturally.`;
 
    const apiMessages = (messages || []).map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
    }));
 
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages: apiMessages,
    });
 
    res.json({ response: response.content[0].text });
  } catch (err) {
    console.error("Chat error:", err);
    res.json({ response: "I apologize, but I'm having trouble connecting. Please try again in a moment." });
  }
});
 
// Generate menus
app.post("/api/generate-menus", async (req, res) => {
  const { code, context, chatHistory, rejectionHistory } = req.body || {};
 
  const upperCode = code?.trim?.().toUpperCase?.();
 
  if (!ANTHROPIC_API_KEY) {
    return res.json({ menus: DEMO_MENUS });
  }
 
  try {
    // Enforce access code and generation limits before spending tokens
    const isAdmin = upperCode && upperCode === ADMIN_CODE.toUpperCase();
    if (upperCode && !isAdmin && !isValidBetaCode(upperCode)) {
      return res.status(403).json({ error: "Invalid access code." });
    }

    if (upperCode && !isAdmin) {
      const usage = await bumpCodeUsage(upperCode, 1);
      if ((usage?.generations || 0) > MAX_GENERATIONS) {
        return res.status(429).json({ error: "Usage limit reached for this code." });
      }
    }

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
 
    let chatContext = "";
    if (chatHistory?.length) {
      chatContext +=
        "\n\nPrevious consultation with experts:\n" +
        chatHistory.map((m) => `${m.role}: ${m.content}`).join("\n");
    }
    if (rejectionHistory?.length) {
      chatContext +=
        "\n\nFeedback after rejecting previous menus (IMPORTANT - address this feedback):\n" +
        rejectionHistory.map((m) => `${m.role}: ${m.content}`).join("\n");
    }
 
    const systemPrompt = `You are an expert culinary team creating dinner party menus.
 
Event Context:
- Event: ${context?.eventTitle || "Dinner Party"}
- Guests: ${context?.guestCount || 6}
- Food Budget: ${context?.foodBudget || "$45-60"}/person
- Wine Budget: ${context?.wineBudget || "$80-120"} total
- Skill Level: ${context?.skillLevel || "intermediate"}
- Inspiration: ${context?.inspiration || "chefs-tasting"}
- Cuisine Direction: ${context?.cuisine || "any"} ${context?.subCuisine ? `(${context.subCuisine})` : ""}
- Guest Preferences: Likes ${context?.likes?.join(", ") || "various"}, Avoids ${context?.dislikes?.join(", ") || "nothing specific"}
- Dietary Restrictions: ${context?.restrictions?.join(", ") || "none"}
${chatContext}
 
Generate exactly 5 distinct menu options as a JSON array. Each menu must have:
- id: number (1-5)
- title: Creative, evocative menu name
- personality: One sentence describing the menu's character and vibe
- foodCost: Estimated cost per person (e.g., "$45-55/person")
- wineCost: Total wine budget estimate (e.g., "$120 total")
- courses: Array of exactly 5 courses, each with:
  - type: One of "Amuse-Bouche", "First Course", "Second Course", "Main Course", "Dessert"
  - name: Full dish name with key components
  - wine: Specific wine pairing with producer if possible (null for amuse and salads)
 
RESPOND WITH ONLY VALID JSON - no markdown, no explanation, just the array.`;
 
    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: "user", content: "Generate 5 personalized menu options based on the context provided." }],
    });
 
    let menus;
    try {
      const text = response.content[0].text.trim();
      const jsonText = text.replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim();
      menus = JSON.parse(jsonText);
    } catch (parseErr) {
      console.error("JSON parse error:", parseErr);
      console.error("Raw response:", response.content[0].text);
      return res.json({ menus: DEMO_MENUS });
    }
 
    res.json({ menus });
  } catch (err) {
    console.error("Menu generation error:", err);
    res.json({ menus: DEMO_MENUS });
  }
});
 
function stripJsonFences(text) {
  return String(text || "")
    .trim()
    .replace(/^```json?\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();
}

function buildMenuContextSummary(menu) {
  if (!menu || !Array.isArray(menu.courses)) return "";
  const lines = menu.courses.map((c, i) => {
    const wine = c?.wine ? ` | Wine: ${c.wine}` : "";
    return `${i + 1}. ${c?.type || "Course"}: ${c?.name || ""}${wine}`.trim();
  });
  return lines.length ? lines.join("\n") : "";
}

function buildWinePairingSummary(menu) {
  if (!menu || !Array.isArray(menu.courses)) return "";
  const wines = menu.courses
    .map((c) => ({ type: c?.type, name: c?.name, wine: c?.wine }))
    .filter((c) => c.wine);
  if (!wines.length) return "";
  return wines.map((c) => `- ${c.type}: ${c.wine} (paired with ${c.name})`).join("\n");
}

async function generateRecipes({ menu, context }) {
  const guestCount = parseInt(context?.guestCount || "6", 10) || 6;

  // Demo-mode fallback: still return *real-looking* recipes, not empty placeholders.
  if (!ANTHROPIC_API_KEY) {
    return (menu?.courses || []).slice(0, 5).map((course) => ({
      title: course?.name || "Recipe",
      serves: guestCount,
      activeTime: "35 min",
      totalTime: "1 hr 15 min",
      ingredients: [
        `Kosher salt (to taste)`,
        `Freshly ground black pepper (to taste)`,
        `Extra-virgin olive oil (2 tbsp)`,
        `Unsalted butter (2 tbsp)`,
        `Garlic (2 cloves), minced`,
        `Lemon (1), zest and juice`,
        `Fresh herbs (2 tbsp), chopped`,
        `Main ingredient(s) for "${course?.name || "this dish"}" (scaled for ${guestCount})`,
      ],
      steps: [
        "Read through the full recipe and set up your mise en place (pre-measure, chop, and organize).",
        "Season thoughtfully in layers; taste early and often.",
        "Build flavor: gently sauté aromatics in olive oil/butter until fragrant.",
        "Cook the main component using appropriate heat control, aiming for proper doneness and texture.",
        "Finish with acid (lemon) and fresh herbs to brighten and lift the dish.",
        "Hold warm (or chill, if appropriate) and plate with intention just before serving.",
      ],
      notes:
        "Demo mode recipe. Add your own signature: a finishing oil, flaky salt, and a fresh herb garnish go a long way.",
      makeAhead:
        "You can prep aromatics and garnish earlier in the day; finish cooking close to service for best texture.",
    }));
  }

  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const menuSummary = buildMenuContextSummary(menu);

  const systemPrompt = `You are a Michelin-caliber test-kitchen team writing complete, usable recipes for a home cook hosting a dinner party.

You MUST generate recipes that match the exact menu courses provided. Be consistent: if a wine pairing is listed, do not ask the user what wine it is—treat it as already recommended.

Event context:
- Guests: ${guestCount}
- Skill level: ${context?.skillLevel || "intermediate"}
- Dietary restrictions: ${(context?.restrictions || []).join(", ") || "none"}
- Likes: ${(context?.likes || []).join(", ") || "none specified"}
- Avoids: ${(context?.dislikes || []).join(", ") || "none specified"}

Menu (5 courses):
${menuSummary}

Return ONLY valid JSON (no markdown) with this exact shape:
{
  "recipes": [
    {
      "title": "string (dish name)",
      "serves": number,
      "activeTime": "string (e.g. 35 min)",
      "totalTime": "string (e.g. 1 hr 20 min)",
      "ingredients": ["string", ...],
      "steps": ["string", ...],
      "notes": "string (optional but preferred)",
      "makeAhead": "string (what can be prepped earlier)"
    }
  ]
}

Rules:
- Output exactly 5 recipes in the same order as the menu courses.
- Ingredients must include quantities scaled for ${guestCount} guests.
- Steps must be specific and executable (temps, times, visual cues), but not overly long.
- Respect restrictions (e.g., if gluten-free, avoid wheat flour / breadcrumbs unless you explicitly provide a GF alternative).`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 6500,
    system: systemPrompt,
    messages: [{ role: "user", content: "Write the 5 recipes now." }],
  });

  const raw = response?.content?.[0]?.text;
  const jsonText = stripJsonFences(raw);
  const parsed = JSON.parse(jsonText);
  const recipes = parsed?.recipes;
  if (!Array.isArray(recipes) || recipes.length !== 5) {
    throw new Error("Recipe generation returned unexpected JSON shape.");
  }
  return recipes;
}

// Generate cookbook (creates an id, then /api/download-cookbook downloads DOCX)
app.post("/api/generate-cookbook", async (req, res) => {
  const { menu, context, staffing } = req.body || {};
  const cookbookId = Date.now().toString(36) + Math.random().toString(36).slice(2);
 
  try {
    const recipes = await generateRecipes({ menu, context });
    await saveCookbook(cookbookId, { menu, context, staffing, recipes });
    res.json({ success: true, cookbookId });
  } catch (err) {
    console.error("Cookbook generation error:", err);
    await saveCookbook(cookbookId, { menu, context, staffing, recipes: null });
    res.json({
      success: true,
      cookbookId,
      message: "Cookbook created, but recipes could not be generated. Download will include placeholders.",
    });
  }
});
 
// Lightweight HTML cookbook preview/print page
app.get("/cookbook/:cookbookId", async (req, res) => {
  const { cookbookId } = req.params || {};
  const cookbookData = await getCookbook(cookbookId);
  if (!cookbookData) return res.status(404).send("Cookbook not found");

  const { menu, context, staffing, recipes } = cookbookData;
  const staffingInfo = STAFFING.find((s) => s.id === staffing) || STAFFING[0];
  const guestNames = String(context?.guestList || "")
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
  const title = (context?.eventTitle || "Dinner Party").replace(/[<>]/g, "");
  const menuTitle = (menu?.title || "Menu").replace(/[<>]/g, "");

  const escapeHtml = (s) =>
    String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");

  const section = (id, heading, bodyHtml) => `<section class="section" id="${escapeHtml(id)}">
  <div class="section-header">
    <div class="section-kicker">${escapeHtml(heading)}</div>
  </div>
  ${bodyHtml}
</section>`;

  const courses = Array.isArray(menu?.courses) ? menu.courses : [];
  const wines = courses.filter((c) => c?.wine);

  const courseHtml = courses
    .map(
      (c) => `<div class="course">
  <div class="course-type">${escapeHtml(c?.type || "")}</div>
  <div class="course-name">${escapeHtml(c?.name || "")}</div>
  ${c?.wine ? `<div class="course-wine">Wine: ${escapeHtml(c.wine)}</div>` : ""}
</div>`
    )
    .join("\n");

  const recipesHtml = (menu?.courses || []).map((c, idx) => {
    const r = Array.isArray(recipes) ? recipes[idx] : null;
    const ingredients = (r?.ingredients || []).map((i) => `<li>${escapeHtml(i)}</li>`).join("");
    const steps = (r?.steps || []).map((s) => `<li>${escapeHtml(s)}</li>`).join("");

    return `<section class="recipe">
  <h2>${escapeHtml(c?.type || "Course")}: ${escapeHtml(c?.name || "Recipe")}</h2>
  ${
    r
      ? `<div class="meta">Serves ${escapeHtml(r.serves)} · Active ${escapeHtml(r.activeTime)} · Total ${escapeHtml(r.totalTime)}</div>`
      : `<div class="meta muted">Recipe details unavailable (placeholder).</div>`
  }
  <div class="cols">
    <div>
      <h3>Ingredients</h3>
      ${ingredients ? `<ul>${ingredients}</ul>` : `<div class="muted">Ingredients not available.</div>`}
    </div>
    <div>
      <h3>Method</h3>
      ${steps ? `<ol>${steps}</ol>` : `<div class="muted">Steps not available.</div>`}
    </div>
  </div>
  ${r?.notes ? `<h3>Chef's Notes</h3><p>${escapeHtml(r.notes)}</p>` : ""}
  ${r?.makeAhead ? `<h3>Make Ahead</h3><p>${escapeHtml(r.makeAhead)}</p>` : ""}
</section>`;
  }).join("\n");

  // Shopping list from recipes (same categorization logic as DOCX)
  const categorizeIngredient = (raw) => {
    const s = String(raw || "").toLowerCase();
    if (!s.trim()) return { cat: "Pantry", item: "" };

    const cleaned = String(raw)
      .replace(/^\s*[\d\s\/\.\-–—]+/g, "")
      .replace(
        /^\s*(cups?|tbsp|tsp|tablespoons?|teaspoons?|ounces?|oz|grams?|g|kg|ml|l|liters?|pounds?|lb|cloves?|pinch|handful|bunch|sprigs?)\b\s*/i,
        ""
      )
      .trim();

    const seafood = ["fish", "salmon", "tuna", "cod", "halibut", "bass", "shrimp", "prawn", "lobster", "crab", "scallop", "oyster", "mussel", "clam"];
    const proteins = ["beef", "steak", "lamb", "pork", "chicken", "duck", "turkey", "veal", "sausage", "bacon", "prosciutto"];
    const produce = ["onion", "shallot", "garlic", "leek", "tomato", "pepper", "spinach", "lettuce", "arugula", "herb", "parsley", "cilantro", "basil", "thyme", "rosemary", "mint", "lemon", "lime", "orange", "apple", "pear", "mushroom", "carrot", "celery", "potato", "radish", "pea", "asparagus"];
    const dairy = ["butter", "milk", "cream", "crème", "creme", "cheese", "yogurt", "egg", "parmesan", "gruyere", "ricotta", "mascarpone"];
    const beverages = ["wine", "champagne", "sancerre", "riesling", "port", "vermouth", "beer", "cider", "sparkling water", "soda", "coffee", "tea"];
    const pantry = ["salt", "pepper", "olive oil", "oil", "vinegar", "mustard", "flour", "sugar", "honey", "stock", "broth", "rice", "pasta", "breadcrumbs", "spice", "paprika", "cumin", "coriander", "vanilla", "cocoa", "chocolate"];

    const includesAny = (arr) => arr.some((k) => s.includes(k));
    if (includesAny(seafood)) return { cat: "Seafood", item: cleaned };
    if (includesAny(proteins)) return { cat: "Proteins", item: cleaned };
    if (includesAny(dairy)) return { cat: "Dairy & Eggs", item: cleaned };
    if (includesAny(beverages)) return { cat: "Wine & Beverages", item: cleaned };
    if (includesAny(produce)) return { cat: "Produce", item: cleaned };
    if (includesAny(pantry)) return { cat: "Pantry", item: cleaned };
    return { cat: "Special Ingredients", item: cleaned };
  };

  const categories = ["Proteins", "Seafood", "Produce", "Dairy & Eggs", "Pantry", "Wine & Beverages", "Special Ingredients"];
  const byCategory = Object.fromEntries(categories.map((c) => [c, new Set()]));
  if (Array.isArray(recipes) && recipes.length) {
    recipes.forEach((r) => {
      (r?.ingredients || []).forEach((ing) => {
        const { cat, item } = categorizeIngredient(ing);
        if (item) byCategory[cat]?.add(item);
      });
    });
  }
  const shoppingHtml = categories
    .map((cat) => {
      const items = Array.from(byCategory[cat] || []);
      const list = items.length
        ? `<ul class="checklist">${items.map((i) => `<li><span class="box"></span>${escapeHtml(i)}</li>`).join("")}</ul>`
        : `<div class="muted">List unavailable (generate recipes to populate this section).</div>`;
      return `<div class="subsection">
  <h3>${escapeHtml(cat)}</h3>
  ${list}
</div>`;
    })
    .join("\n");

  const serviceTime = context?.serviceTime || "7:00 PM";
  const dayBeforeTasks = [
    "Review all recipes and confirm you have all ingredients",
    "Prep stocks and sauces that improve overnight",
    "Marinate proteins as needed",
    "Wash and prep vegetables (store properly)",
    "Make dessert components that hold well",
    "Set the table completely",
    "Chill wine and set out serving pieces",
    "Write out your day-of timeline",
    "Prep any garnishes that hold",
    "Do a final equipment check",
  ];

  const timeline = [
    { time: "-6 hours", task: "Final shopping for any last-minute items" },
    { time: "-5 hours", task: "Begin slow-cooking items (braises, stocks)" },
    { time: "-4 hours", task: "Prep remaining vegetables and garnishes" },
    { time: "-3 hours", task: "Start sauces and reductions" },
    { time: "-2 hours", task: "Set out cheese and butter to temper" },
    { time: "-90 min", task: "Open and decant red wines" },
    { time: "-1 hour", task: "Final protein prep, bring to room temp" },
    { time: "-45 min", task: "Preheat oven, warm plates" },
    { time: "-30 min", task: "Light candles, start music, final touches" },
    { time: "-15 min", task: "Plate amuse-bouche, pour welcome drinks" },
    { time: "0", task: "Guests arrive — service begins" },
    { time: "+15 min", task: "Serve amuse-bouche" },
    { time: "+30 min", task: "Fire first course" },
    { time: "+50 min", task: "Clear, serve second course" },
    { time: "+80 min", task: "Fire main course" },
    { time: "+110 min", task: "Clear, prepare dessert" },
    { time: "+130 min", task: "Serve dessert and dessert wine" },
  ];

  const imagePromptsHtml = courses
    .map((c) => {
      const prompt = `Professional food photography of ${c?.name}, elegant plating on white porcelain, soft natural lighting, shallow depth of field, fine dining presentation, 85mm lens, Michelin star quality --ar 4:3 --v 6`;
      return `<div class="subsection">
  <h3>${escapeHtml(c?.type || "Course")}</h3>
  <pre class="prompt">${escapeHtml(prompt)}</pre>
</div>`;
    })
    .join("\n");

  const tocItems = [
    ["cover", "Cover Page"],
    ["menu", "Menu Overview"],
    ["wine", "Wine Program"],
    ["recipes", "Recipes"],
    ["shopping", "Shopping List"],
    ["daybefore", "Day-Before Prep"],
    ["dayof", "Day-Of Timeline"],
    ["plating", "Plating Guides"],
    ["tablesetting", "Table Setting"],
    ["servicenotes", "Service Notes"],
    ["ambiance", "Ambiance & Music"],
    ["checklist", "Final Checklist"],
    ["images", "AI Image Prompts"],
    ["notes", "Notes Pages"],
    ["copyright", "Copyright"],
  ]
    .map(([id, label]) => `<a class="toc-link" href="#${escapeHtml(id)}">${escapeHtml(label)}</a>`)
    .join("");

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} — Cookbook</title>
  <style>
    :root { --navy:#1E3A5F; --gold:#C9A227; --ink:#111827; --muted:#6b7280; --paper:#ffffff; --bg:#f6f2ed; }
    body { margin:0; font-family: Georgia, serif; color:var(--ink); background:var(--bg); }
    .wrap { max-width: 980px; margin: 0 auto; padding: 24px; }
    .card { background: var(--paper); border: 1px solid rgba(17,24,39,0.08); border-radius: 14px; padding: 22px; box-shadow: 0 6px 25px rgba(0,0,0,0.06); }
    h1 { margin:0 0 6px; font-size: 34px; color: var(--navy); }
    .subtitle { margin: 0 0 14px; color: var(--muted); font-style: italic; }
    .topmeta { display:flex; gap:12px; flex-wrap:wrap; color:var(--muted); font-size:14px; }
    .divider { height:1px; background: rgba(17,24,39,0.08); margin: 18px 0; }
    .course { padding: 10px 0; border-bottom: 1px dashed rgba(17,24,39,0.12); }
    .course:last-child { border-bottom: 0; }
    .course-type { font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--gold); font-weight: 700; }
    .course-name { font-size: 18px; color: var(--navy); margin-top: 2px; }
    .course-wine { font-size: 14px; color: var(--muted); margin-top: 4px; }
    .recipe { margin-top: 22px; }
    .recipe h2 { color: var(--navy); font-size: 22px; margin: 0 0 8px; }
    .meta { color: var(--muted); font-size: 14px; margin-bottom: 10px; }
    .muted { color: var(--muted); }
    .cols { display:grid; grid-template-columns: 1fr 1.2fr; gap: 18px; }
    h3 { margin: 12px 0 8px; color: var(--gold); font-size: 14px; letter-spacing: .06em; text-transform: uppercase; }
    ul,ol { margin: 0; padding-left: 18px; }
    li { margin: 6px 0; line-height: 1.35; }
    .printbar { display:flex; gap:10px; flex-wrap:wrap; margin-top: 14px; }
    button { border: 0; border-radius: 10px; padding: 10px 14px; font-weight: 700; cursor:pointer; }
    .btn { background: var(--navy); color: white; }
    .btn2 { background: white; color: var(--navy); border: 2px solid var(--navy); }
    .toc { display:flex; flex-wrap:wrap; gap:10px; margin-top: 14px; }
    .toc-link { display:inline-flex; padding: 6px 10px; border: 1px solid rgba(17,24,39,0.14); border-radius: 999px; text-decoration:none; color: var(--navy); font-size: 13px; }
    .toc-link:hover { border-color: var(--gold); }
    .section { padding-top: 8px; }
    .section + .section { margin-top: 22px; }
    .section-kicker { font-size: 22px; color: var(--navy); font-weight: 700; }
    .subsection { margin-top: 14px; }
    .checklist { list-style: none; padding-left: 0; margin: 0; }
    .checklist li { display:flex; gap:10px; align-items:flex-start; }
    .box { width: 14px; height: 14px; border: 1.5px solid rgba(17,24,39,0.5); border-radius: 3px; margin-top: 2px; flex: 0 0 auto; }
    .timeline { width: 100%; border-collapse: collapse; }
    .timeline td { padding: 8px 0; border-bottom: 1px dashed rgba(17,24,39,0.12); vertical-align: top; }
    .timeline td:first-child { width: 110px; color: var(--gold); font-weight: 700; }
    pre.prompt { background: rgba(17,24,39,0.04); border: 1px solid rgba(17,24,39,0.10); padding: 10px 12px; border-radius: 10px; overflow: auto; }
    @media (max-width: 820px) { .cols { grid-template-columns: 1fr; } }
    @media print {
      body { background: white; }
      .wrap { max-width: none; padding: 0; }
      .card { box-shadow:none; border:0; border-radius:0; padding: 0; }
      .printbar { display:none; }
      .toc { display:none; }
      .section { break-before: page; }
      #cover { break-before: auto; }
      .recipe { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="card">
      <h1>${escapeHtml(title)}</h1>
      <div class="subtitle">${escapeHtml(menuTitle)}</div>
      <div class="topmeta">
        <div><strong>Date:</strong> ${escapeHtml(context?.eventDate || "TBD")}</div>
        <div><strong>Guests:</strong> ${escapeHtml(context?.guestCount || 6)}</div>
        <div><strong>Service:</strong> ${escapeHtml(context?.serviceTime || "7:00 PM")}</div>
        <div><strong>Staffing:</strong> ${escapeHtml(staffingInfo?.name || staffing || "solo")}</div>
      </div>
      <div class="printbar">
        <button class="btn" onclick="window.print()">Print / Save as PDF</button>
        <button class="btn2" onclick="location.href='/'">Back to planner</button>
      </div>
      <div class="toc">
        ${tocItems}
      </div>

      <div class="divider"></div>
      ${section(
        "cover",
        "Cover Page",
        `<div class="subsection">
  <div class="muted">${escapeHtml(menu?.personality || "")}</div>
</div>`
      )}
      ${section("menu", "Menu Overview", courseHtml || `<div class="muted">No menu found.</div>`)}
      ${section(
        "wine",
        "Wine Program",
        wines.length
          ? `<div class="subsection">
  <div class="muted">Budget: ${escapeHtml(context?.wineBudget || "$80-120")}</div>
</div>
${wines
  .map(
    (c) => `<div class="subsection">
  <h3>${escapeHtml(c.type)}</h3>
  <div><strong>${escapeHtml(c.wine)}</strong></div>
  <div class="muted">Pairs with: ${escapeHtml(c.name)}</div>
  <div class="muted">Serve at 55–60°F. Decant 30 minutes before service if red.</div>
</div>`
  )
  .join("\n")}
<div class="subsection">
  <h3>Wine Service Notes</h3>
  <ul>
    <li>Chill white wines 2 hours before guests arrive</li>
    <li>Open and decant red wines 30–60 minutes before serving</li>
    <li>Have backup bottles ready — estimate 1 bottle per 2–3 guests per course</li>
    <li>Pour 4–5 oz per glass for tasting portions</li>
  </ul>
</div>`
          : `<div class="muted">No wine pairings in this menu.</div>`
      )}
      ${section("recipes", "Recipes", recipesHtml || `<div class="muted">No recipes found.</div>`)}
      ${section(
        "shopping",
        "Shopping List",
        `<div class="subsection"><div class="muted">For ${escapeHtml(context?.guestCount || 6)} guests</div></div>
${shoppingHtml}
<div class="subsection">
  <h3>Shopping Notes</h3>
  <ul>
    <li>Shop for proteins and seafood 1–2 days before</li>
    <li>Buy produce day-before for peak freshness</li>
    <li>Wine can be purchased a week ahead</li>
  </ul>
</div>`
      )}
      ${section(
        "daybefore",
        "Day-Before Prep",
        `<div class="subsection"><div class="muted">Staffing: ${escapeHtml(staffingInfo?.name || "Solo")}</div></div>
<ul class="checklist">
  ${dayBeforeTasks.map((t) => `<li><span class="box"></span>${escapeHtml(t)}</li>`).join("")}
</ul>`
      )}
      ${section(
        "dayof",
        "Day-Of Timeline",
        `<div class="subsection"><div class="muted">Service Time: ${escapeHtml(serviceTime)} · Your active time: ~${escapeHtml(
          staffingInfo?.activeMin || ""
        )} minutes</div></div>
<table class="timeline">
  <tbody>
    ${timeline
      .map(
        (t) => `<tr><td>${escapeHtml(t.time)}</td><td>${escapeHtml(t.task)}</td></tr>`
      )
      .join("")}
  </tbody>
</table>`
      )}
      ${section(
        "plating",
        "Plating Guides",
        courses.length
          ? courses
              .map(
                (c) => `<div class="subsection">
  <h3>${escapeHtml(c.type)}</h3>
  <div><strong>${escapeHtml(c.name)}</strong></div>
  <ul>
    <li>Plate: choose an appropriate size for the portion</li>
    <li>Placement: center the focal component; sauce underneath or alongside</li>
    <li>Garnish: fresh herbs, microgreens, or edible flowers</li>
    <li>Temperature: warm plates for hot courses; chilled for cold</li>
  </ul>
</div>`
              )
              .join("\n")
          : `<div class="muted">No courses found.</div>`
      )}
      ${section(
        "tablesetting",
        "Table Setting",
        `<div class="subsection"><div class="muted">${escapeHtml(context?.guestCount || 6)} place settings</div></div>
<div class="subsection">
  <h3>Per Place Setting</h3>
  <ul>
    <li>Charger plate (remove before main)</li>
    <li>Dinner fork, salad fork (outside in)</li>
    <li>Dinner knife, soup spoon</li>
    <li>Dessert spoon above plate</li>
    <li>Water glass, white wine glass, red wine glass</li>
    <li>Cloth napkin, folded or in ring</li>
    <li>Place card</li>
  </ul>
</div>
${
  guestNames.length
    ? `<div class="subsection"><h3>Guest List</h3><ul>${guestNames.map((n) => `<li>${escapeHtml(n)}</li>`).join("")}</ul></div>`
    : ""
}`
      )}
      ${section(
        "servicenotes",
        "Service Notes",
        `<div class="subsection">
  <h3>Pacing</h3>
  <ul>
    <li>Allow 15–20 minutes between courses</li>
    <li>Watch for guests finishing — clear when ~80% done</li>
    <li>Never rush; better to slow down than speed up</li>
  </ul>
</div>
<div class="subsection">
  <h3>Wine Service</h3>
  <ul>
    <li>Pour from guest’s right side</li>
    <li>Fill glasses 1/3 to 1/2 full</li>
    <li>Offer water throughout</li>
  </ul>
</div>
<div class="subsection">
  <h3>Clearing</h3>
  <ul>
    <li>Clear from right, serve from left</li>
    <li>Remove all plates before bringing next course</li>
    <li>Crumb table before dessert</li>
  </ul>
</div>`
      )}
      ${section(
        "ambiance",
        "Ambiance & Music",
        `<div class="subsection">
  <h3>Lighting</h3>
  <ul>
    <li>Dim overhead lights to 40–50%</li>
    <li>Use candles as primary table lighting</li>
    <li>Unscented candles only near food</li>
  </ul>
</div>
<div class="subsection">
  <h3>Music Suggestions</h3>
  <ul>
    <li>Arrival: upbeat jazz or bossa nova</li>
    <li>Dinner: soft jazz, classical, or acoustic</li>
    <li>Dessert: slightly more energy, still conversational</li>
    <li>Volume: background only</li>
  </ul>
</div>
<div class="subsection">
  <h3>Temperature</h3>
  <ul>
    <li>Set thermostat 2–3° cooler than normal</li>
    <li>Room will warm with guests and cooking</li>
  </ul>
</div>`
      )}
      ${section(
        "checklist",
        "Final Checklist",
        `<div class="subsection">
  <h3>One Week Before</h3>
  <ul class="checklist">
    ${[
      "Confirm guest count and dietary restrictions",
      "Order specialty ingredients",
      "Purchase wines",
      "Test any new recipes",
    ]
      .map((t) => `<li><span class="box"></span>${escapeHtml(t)}</li>`)
      .join("")}
  </ul>
</div>
<div class="subsection">
  <h3>Day Before</h3>
  <ul class="checklist">
    ${["Complete all make-ahead prep", "Set table completely", "Chill white wines", "Clean kitchen and clear workspace"]
      .map((t) => `<li><span class="box"></span>${escapeHtml(t)}</li>`)
      .join("")}
  </ul>
</div>
<div class="subsection">
  <h3>Day Of</h3>
  <ul class="checklist">
    ${["Follow timeline", "Final taste and season all dishes", "Light candles 10 minutes before arrival", "Start music", "Take a breath — you’ve got this!"]
      .map((t) => `<li><span class="box"></span>${escapeHtml(t)}</li>`)
      .join("")}
  </ul>
</div>`
      )}
      ${section(
        "images",
        "AI Image Prompts",
        `<div class="subsection"><div class="muted">Use these prompts with Midjourney, DALL·E, or similar tools to visualize your dishes.</div></div>
${imagePromptsHtml || `<div class="muted">No courses found.</div>`}`
      )}
      ${section(
        "notes",
        "Notes Pages",
        `<div class="subsection"><div class="muted">Space for your personal notes, adjustments, and memories from the evening.</div></div>
${Array.from({ length: 18 })
  .map(() => `<div style="border-bottom:1px solid rgba(17,24,39,0.18); height: 24px; margin-top: 10px;"></div>`)
  .join("")}`
      )}
      ${section(
        "copyright",
        "Copyright",
        `<div class="subsection"><div class="muted">${escapeHtml(COPYRIGHT_TEXT)}</div></div>
<div class="subsection"><div class="muted">© ${escapeHtml(new Date().getFullYear())} Generated for personal use.</div></div>`
      )}
    </div>
  </div>
</body>
</html>`;

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(html);
});

app.post("/api/download-cookbook", async (req, res) => {
  const { cookbookId } = req.body || {};
  const cookbookData = await getCookbook(cookbookId);
 
  if (!cookbookData) {
    return res.status(404).json({ error: "Cookbook not found" });
  }
 
  const { menu, context, staffing, recipes } = cookbookData;
 
  try {
    const buffer = await buildCookbook(menu, context, staffing, recipes);
    const filename =
      (context?.eventTitle || "Dinner_Party").replace(/[^a-zA-Z0-9]/g, "_") + "_Cookbook.docx";
 
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    console.error("DOCX generation error:", err);
    res.status(500).json({ error: "Error generating cookbook" });
  }
});
 
// Print product PDFs (Avery) - minimal v1
app.post("/api/print-product", async (req, res) => {
  const { cookbookId, type, sku } = req.body || {};
  if (!cookbookId || !type || !sku) {
    return res.status(400).json({ error: "cookbookId, type, and sku are required" });
  }

  const productList = AVERY_PRODUCTS?.[type];
  const product = Array.isArray(productList)
    ? productList.find((p) => String(p.sku) === String(sku))
    : null;
  if (!product) {
    return res.status(400).json({ error: "Unknown Avery product (type/sku)" });
  }

  const cookbookData = await getCookbook(cookbookId);
  if (!cookbookData) return res.status(404).json({ error: "Cookbook not found" });

  try {
    const pdfBuffer = await generatePrintPdf({ type, sku, product, cookbook: cookbookData });
    const safeSku = String(sku).replace(/[^0-9A-Za-z_-]/g, "");
    const filename = `Avery_${safeSku}_${type}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error("Print product PDF error:", err);
    res.status(500).json({ error: "Error generating PDF" });
  }
});

// ============================================================
// START SERVER
// ============================================================
 
function startServer() {
  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(
      `Dinner Planner listening on port ${PORT} (${ANTHROPIC_API_KEY ? "API key set" : "demo mode"})`
    );
  });

  // Periodic cookbook retention cleanup (best-effort)
  runCookbookCleanup();
  const maxTimerMs = 2 ** 31 - 1; // Node timers use signed 32-bit
  const intervalMs = Math.max(1, COOKBOOK_CLEANUP_INTERVAL_HOURS) * 60 * 60 * 1000;
  setInterval(runCookbookCleanup, Math.min(intervalMs, maxTimerMs));

  return server;
}

if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };