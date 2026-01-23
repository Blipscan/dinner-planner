// ============================================================
// DINNER PARTY PLANNER - NEW APP API
// ============================================================

const express = require("express");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");

const {
  CUISINES,
  MENU_INSPIRATIONS,
  MENU_STYLES,
  STAFFING,
  AVERY_PRODUCTS,
  PERSONAS,
  DEMO_MENUS,
  COOKBOOK_SECTIONS,
} = require("./data");

const { buildCookbook } = require("./cookbook");

const app = express();

// ============================================================
// STATIC + PARSING
// ============================================================

app.use(express.json({ limit: "10mb" }));

const CLIENT_DIR = path.join(__dirname, "..", "web", "public");
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
const ACCESS_CODES = (process.env.ACCESS_CODES || process.env.BETA_ACCESS_CODE || "BETA001,BETA002,BETA003")
  .split(",")
  .map((c) => c.trim())
  .filter(Boolean);

const BETA_EXPIRY = process.env.BETA_EXPIRY || "2026-03-01";
const MAX_GENERATIONS = parseInt(process.env.MAX_GENERATIONS_PER_CODE || "50", 10);
const ALLOW_DEMO_FALLBACK = (process.env.ALLOW_DEMO_FALLBACK || "").toLowerCase() === "true";
const COOKBOOK_EXPERIENCE_MAX_TOKENS = parseInt(
  process.env.COOKBOOK_EXPERIENCE_MAX_TOKENS || "3072",
  10
);
const REQUEST_TIMEOUTS_MS = {
  chat: 15000,
  menus: 25000,
  details: 20000,
};

const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10);
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || "10", 10);
const COOKBOOK_TTL_MS = parseInt(process.env.COOKBOOK_TTL_MS || "86400000", 10);

const usageStats = {};
const rateLimitBuckets = new Map();

global.cookbooks = global.cookbooks || {};

function pruneCookbooks() {
  const now = Date.now();
  Object.entries(global.cookbooks).forEach(([id, payload]) => {
    if (!payload?.createdAt) {
      return;
    }
    if (now - payload.createdAt > COOKBOOK_TTL_MS) {
      delete global.cookbooks[id];
    }
  });
}

setInterval(pruneCookbooks, 60 * 60 * 1000);

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || "unknown";
  const now = Date.now();
  const bucket = rateLimitBuckets.get(ip) || [];
  const fresh = bucket.filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);

  if (fresh.length >= RATE_LIMIT_MAX) {
    return res.status(429).json({ error: "Rate limit exceeded", detail: "Please wait and try again." });
  }

  fresh.push(now);
  rateLimitBuckets.set(ip, fresh);
  next();
}

function parseBudgetRange(value) {
  if (!value) {
    return { min: 80, max: 120 };
  }

  const rangeMatch = value.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch) {
    return { min: parseInt(rangeMatch[1], 10), max: parseInt(rangeMatch[2], 10) };
  }

  const plusMatch = value.match(/(\d+)\s*\+/);
  if (plusMatch) {
    const min = parseInt(plusMatch[1], 10);
    return { min, max: Math.round(min * 1.5) };
  }

  const singleMatch = value.match(/(\d+)/);
  if (singleMatch) {
    const min = parseInt(singleMatch[1], 10);
    return { min, max: Math.round(min * 1.4) };
  }

  return { min: 80, max: 120 };
}

function formatBudgetRange(min, max) {
  if (!max || max <= min) {
    return `$${min}+ total`;
  }
  return `$${min}-${max} total`;
}

function normalizeWineTiers(wine) {
  if (!wine) {
    return {
      worldwideTopRated: null,
      domesticTopRated: null,
      budgetTopRated: null,
      bondPick: null,
    };
  }

  if (typeof wine === "string") {
    return {
      worldwideTopRated: wine,
      domesticTopRated: null,
      budgetTopRated: null,
      bondPick: null,
    };
  }

  return {
    worldwideTopRated: wine.worldwideTopRated || wine.worldwide || null,
    domesticTopRated: wine.domesticTopRated || wine.domestic || null,
    budgetTopRated: wine.budgetTopRated || wine.budget || null,
    bondPick: wine.bondPick || wine.bond || null,
  };
}

function normalizeMenuWinePairings(menu) {
  if (!menu?.courses?.length) {
    return menu;
  }
  return {
    ...menu,
    courses: menu.courses.map((course) => ({
      ...course,
      wine: normalizeWineTiers(course?.wine),
    })),
  };
}

function normalizeWinePairings(menu, winePairings) {
  const menuCourses = menu?.courses || [];
  const source = Array.isArray(winePairings) && winePairings.length ? winePairings : menuCourses;
  return source.map((course, index) => {
    const fallback = menuCourses[index] || {};
    const type = course.type || course.courseType || fallback.type || `Course ${index + 1}`;
    const name = course.name || course.courseName || fallback.name || "";
    const wine = normalizeWineTiers(course?.wine || course?.pairings || fallback?.wine);
    return { type, name, wine };
  });
}

function mergeMenuWinePairings(menu, winePairings) {
  if (!menu?.courses?.length) {
    return menu;
  }
  const normalized = normalizeMenuWinePairings(menu);
  if (!Array.isArray(winePairings) || !winePairings.length) {
    return normalized;
  }
  const pairs = normalizeWinePairings(menu, winePairings);
  return {
    ...normalized,
    courses: normalized.courses.map((course, index) => ({
      ...course,
      wine: normalizeWineTiers(pairs[index]?.wine || course.wine),
    })),
  };
}

function buildDemoRecipes(menu, context) {
  const guestCount = parseInt(context?.guestCount || "6", 10);
  const timeByCourse = {
    "Amuse-Bouche": { active: "20 min", total: "45 min" },
    "First Course": { active: "30 min", total: "1 hour" },
    "Second Course": { active: "25 min", total: "45 min" },
    "Main Course": { active: "45 min", total: "1.5 hours" },
    "Dessert": { active: "35 min", total: "1 hour" },
  };

  return (menu?.courses || []).map((course) => {
    const timing = timeByCourse[course.type] || { active: "30 min", total: "1 hour" };
    const title = course.name || course.type;
    return {
      title,
      serves: guestCount,
      activeTime: timing.active,
      totalTime: timing.total,
      ingredients: [
        title,
        "Kosher salt",
        "Freshly ground black pepper",
        "Olive oil or butter",
        "Seasonal herbs",
      ],
      steps: [
        `Prep ingredients for ${title}.`,
        `Cook the core components of ${title} until perfectly done.`,
        `Season, plate, and serve ${title}.`,
      ],
      notes: "Taste and adjust seasoning right before serving.",
      makeAhead: "Most prep can be completed earlier in the day.",
      whyItWorks: "Balanced textures and clean flavors keep the course elegant and easy to execute.",
    };
  });
}

function buildDemoWinePairings(menu) {
  return normalizeWinePairings(menu, menu?.courses || []);
}

function buildDemoDetails(menu, context) {
  return {
    recipes: buildDemoRecipes(menu, context),
    winePairings: buildDemoWinePairings(menu),
  };
}

async function withTimeout(promise, timeoutMs, label) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

// ============================================================
// API ROUTES
// ============================================================

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    apiConfigured: !!ANTHROPIC_API_KEY,
    betaExpiry: BETA_EXPIRY,
    version: "3.0.0-cadillac",
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
    apiConfigured: !!ANTHROPIC_API_KEY,
    allowDemoFallback: ALLOW_DEMO_FALLBACK,
    personas: Object.fromEntries(
      Object.entries(PERSONAS).map(([key, value]) => [
        key,
        {
          name: value.name,
          icon: value.icon,
          credentials: value.credentials,
          philosophy: value.philosophy,
        },
      ])
    ),
  });
});

// Validate access code
app.post("/api/validate-code", (req, res) => {
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
  if (!ACCESS_CODES.map((c) => c.toUpperCase()).includes(upperCode)) {
    return res.json({ valid: false, message: "Invalid access code." });
  }

  // Initialize or check usage
  if (!usageStats[upperCode]) {
    usageStats[upperCode] = { generations: 0, lastUsed: new Date() };
  }

  if (usageStats[upperCode].generations >= MAX_GENERATIONS) {
    return res.json({ valid: false, message: "Usage limit reached for this code." });
  }

  usageStats[upperCode].lastUsed = new Date();
  res.json({ valid: true, remaining: MAX_GENERATIONS - usageStats[upperCode].generations });
});

// Chat with expert persona
app.post("/api/chat", rateLimit, async (req, res) => {
  const { persona, messages, context } = req.body || {};

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

Be conversational, warm, and helpful. Ask clarifying questions when needed. Share your expertise naturally.`;

    const apiMessages = (messages || []).map((message) => ({
      role: message.role === "user" ? "user" : "assistant",
      content: message.content,
    }));

    const response = await withTimeout(
      client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: systemPrompt,
        messages: apiMessages,
      }),
      REQUEST_TIMEOUTS_MS.chat,
      "Chat"
    );

    res.json({ response: response.content[0].text });
  } catch (err) {
    console.error("Chat error:", err);
    res.json({ response: "I apologize, but I'm having trouble connecting. Please try again in a moment." });
  }
});

// Generate menus
app.post("/api/generate-menus", rateLimit, async (req, res) => {
  const { code, context, chatHistory, rejectionHistory } = req.body || {};

  const upperCode = code?.trim?.().toUpperCase?.();
  if (upperCode && usageStats[upperCode]) {
    usageStats[upperCode].generations++;
  }

  if (!ANTHROPIC_API_KEY) {
    return res.json({ menus: DEMO_MENUS, demo: true });
  }

  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    let chatContext = "";
    if (chatHistory?.length) {
      chatContext +=
        "\n\nPrevious consultation with experts:\n" +
        chatHistory.map((message) => `${message.role}: ${message.content}`).join("\n");
    }
    if (rejectionHistory?.length) {
      chatContext +=
        "\n\nFeedback after rejecting previous menus (IMPORTANT - address this feedback):\n" +
        rejectionHistory.map((message) => `${message.role}: ${message.content}`).join("\n");
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
  - wine: object with four tiers (strings or null):
    - worldwideTopRated
    - domesticTopRated
    - budgetTopRated
    - bondPick
    Use null for tiers when a pairing should be omitted.

RESPOND WITH ONLY VALID JSON - no markdown, no explanation, just the array.`;

    const response = await withTimeout(
      client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: "Generate 5 personalized menu options based on the context provided." }],
      }),
      REQUEST_TIMEOUTS_MS.menus,
      "Menu generation"
    );

    let menus;
    try {
      const text = response.content[0].text.trim();
      const jsonText = text.replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim();
      menus = JSON.parse(jsonText);
      menus = Array.isArray(menus) ? menus.map(normalizeMenuWinePairings) : [];
    } catch (parseErr) {
      console.error("JSON parse error:", parseErr);
      console.error("Raw response:", response.content[0].text);
      if (ALLOW_DEMO_FALLBACK) {
        return res.json({ menus: DEMO_MENUS, demo: true, warning: "AI response parsing failed." });
      }
      return res.status(502).json({ error: "Menu generation failed.", detail: "AI returned invalid JSON." });
    }

    res.json({ menus });
  } catch (err) {
    console.error("Menu generation error:", err);
    if (ALLOW_DEMO_FALLBACK) {
      return res.json({ menus: DEMO_MENUS, demo: true, warning: "AI request failed." });
    }
    return res.status(502).json({ error: "Menu generation failed.", detail: err.message });
  }
});

// Generate recipes + wine pairings for selected menu
app.post("/api/generate-details", rateLimit, async (req, res) => {
  const { menu, context } = req.body || {};

  if (!menu?.courses?.length) {
    return res.status(400).json({ error: "Menu data is required." });
  }

  const normalizedMenu = normalizeMenuWinePairings(menu);

  if (!ANTHROPIC_API_KEY) {
    return res.json({ ...buildDemoDetails(normalizedMenu, context), demo: true });
  }

  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const systemPrompt = `You are an expert culinary team creating detailed recipe previews and wine pairings.

Return ONLY valid JSON with this exact shape:
{
  "recipes": [
    {
      "title": "string",
      "serves": number,
      "activeTime": "string",
      "totalTime": "string",
      "ingredients": ["string", "..."],
      "steps": ["string", "..."],
      "notes": "string",
      "makeAhead": "string",
      "whyItWorks": "string"
    }
  ],
  "winePairings": [
    {
      "type": "Amuse-Bouche",
      "name": "string",
      "wine": {
        "worldwideTopRated": "string or null",
        "domesticTopRated": "string or null",
        "budgetTopRated": "string or null",
        "bondPick": "string or null"
      }
    }
  ]
}

Rules:
- Provide exactly 5 recipes, in the same order as the menu courses.
- Each recipe includes whyItWorks (1-3 sentences explaining flavor/technique balance).
- Provide exactly 5 winePairings, in the same order as the menu courses.
- Pairings should be specific bottles with producer + vintage when possible.
- Keep steps concise and practical for a skilled home cook.`;

    const response = await withTimeout(
      client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: COOKBOOK_EXPERIENCE_MAX_TOKENS,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: `Generate details for this menu and context:\n\nMenu:\n${JSON.stringify(normalizedMenu, null, 2)}\n\nContext:\n${JSON.stringify(context || {}, null, 2)}`,
          },
        ],
      }),
      REQUEST_TIMEOUTS_MS.details,
      "Details generation"
    );

    const text = response.content[0].text.trim();
    const jsonText = text.replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim();
    const details = JSON.parse(jsonText);
    const normalizedRecipes = Array.isArray(details.recipes)
      ? details.recipes.map((recipe) => ({
          ...recipe,
          whyItWorks: recipe.whyItWorks || "Balanced flavors and thoughtful technique make this course shine.",
        }))
      : [];
    const normalizedPairings = normalizeWinePairings(normalizedMenu, details.winePairings);
    res.json({ ...details, recipes: normalizedRecipes, winePairings: normalizedPairings });
  } catch (err) {
    console.error("Details generation error:", err);
    if (ALLOW_DEMO_FALLBACK) {
      return res.json({ ...buildDemoDetails(normalizedMenu, context), demo: true, warning: "AI request failed." });
    }
    return res.status(502).json({ error: "Details generation failed.", detail: err.message });
  }
});

// Generate cookbook (creates an id, then /api/download-cookbook downloads DOCX)
app.post("/api/generate-cookbook", async (req, res) => {
  const { menu, context, staffing, recipes, winePairings } = req.body || {};
  const cookbookId = Date.now().toString(36) + Math.random().toString(36).slice(2);

  global.cookbooks[cookbookId] = {
    menu,
    context,
    staffing,
    recipes: recipes || null,
    winePairings: winePairings || null,
    createdAt: Date.now(),
  };
  res.json({ success: true, cookbookId });
});

app.post("/api/download-cookbook", async (req, res) => {
  const { cookbookId } = req.body || {};
  const cookbookData = global.cookbooks?.[cookbookId];

  if (!cookbookData) {
    return res.status(404).json({ error: "Cookbook not found" });
  }

  const { menu, context, staffing, recipes, winePairings } = cookbookData;

  try {
    const mergedMenu = mergeMenuWinePairings(menu, winePairings);
    const buffer = await buildCookbook(mergedMenu, context, staffing, recipes);
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

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Dinner Planner listening on port ${PORT} (${ANTHROPIC_API_KEY ? "API key set" : "demo mode"})`);
});
