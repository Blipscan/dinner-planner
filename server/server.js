// ============================================================
// DINNER PARTY PLANNER - CADILLAC EDITION
// ============================================================
 
const express = require("express");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");
const { jsonrepair } = require("jsonrepair");
 
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
 
const CLIENT_DIR = path.join(__dirname, "..", "client");
app.use(
  express.static(CLIENT_DIR, {
    setHeaders: (res, filePath) => {
      if (path.extname(filePath).toLowerCase() === ".html") {
        res.setHeader("Cache-Control", "no-store, max-age=0");
      }
    },
  })
);
 
app.get("/", (req, res) => {
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.sendFile(path.join(CLIENT_DIR, "index.html"));
});
 
// ============================================================
// CONFIGURATION
// ============================================================
 
const PORT = process.env.PORT || 3000;
const APP_VERSION = process.env.APP_VERSION || "2.0.0-cadillac";
const DEPLOY_ID =
  process.env.DEPLOY_NUMBER ||
  process.env.DEPLOY_ID ||
  process.env.RENDER_GIT_COMMIT ||
  process.env.RENDER_DEPLOY_ID ||
  process.env.RENDER_INSTANCE_ID ||
  "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
 
const ADMIN_CODE = process.env.ADMIN_CODE || "ADMIN2024";
const ACCESS_CODES = (process.env.ACCESS_CODES || "BETA001,BETA002,BETA003")
  .split(",")
  .map((c) => c.trim());
 
const BETA_EXPIRY = process.env.BETA_EXPIRY || "2026-03-01";
const MAX_GENERATIONS = parseInt(process.env.MAX_GENERATIONS_PER_CODE || "50", 10);
 
const usageStats = {};
global.cookbooks = global.cookbooks || {};
const ALLOW_DEMO_FALLBACK = (process.env.ALLOW_DEMO_FALLBACK || "false").toLowerCase() === "true";
const DEFAULT_TIMEOUTS_MS = {
  chat: 15000,
  menus: 45000,
  details: 300000,
};

function parseTimeout(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const REQUEST_TIMEOUTS_MS = {
  chat: parseTimeout(process.env.REQUEST_TIMEOUT_CHAT_MS, DEFAULT_TIMEOUTS_MS.chat),
  menus: parseTimeout(process.env.REQUEST_TIMEOUT_MENUS_MS, DEFAULT_TIMEOUTS_MS.menus),
  details: parseTimeout(process.env.REQUEST_TIMEOUT_DETAILS_MS, DEFAULT_TIMEOUTS_MS.details),
};
 
function respondMissingApiKey(res, detail) {
  return res.status(503).json({
    error: "Anthropic API key not configured.",
    detail: detail || "Set ANTHROPIC_API_KEY to enable AI generation.",
  });
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

function stripCodeFences(text) {
  return String(text || "")
    .replace(/^```json?\n?/i, "")
    .replace(/\n?```$/i, "")
    .trim();
}

function extractJsonPayload(text) {
  const cleaned = stripCodeFences(text);
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  const firstBracket = cleaned.indexOf("[");
  const lastBracket = cleaned.lastIndexOf("]");

  if (firstBracket !== -1 && lastBracket !== -1 && (firstBracket < firstBrace || firstBrace === -1)) {
    return cleaned.slice(firstBracket, lastBracket + 1);
  }
  if (firstBrace !== -1 && lastBrace !== -1) {
    return cleaned.slice(firstBrace, lastBrace + 1);
  }
  return cleaned;
}

function parseJsonPayload(text, label) {
  const candidate = extractJsonPayload(text);
  try {
    return JSON.parse(candidate);
  } catch (err) {
    try {
      return JSON.parse(jsonrepair(candidate));
    } catch (repairErr) {
      const error = new Error(`${label} JSON parse failed: ${repairErr.message}`);
      error.cause = repairErr;
      throw error;
    }
  }
}

function formatDeployId(value) {
  if (!value) {
    return "";
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    return "";
  }
  if (/^[0-9a-f]{7,}$/i.test(trimmed)) {
    return trimmed.slice(0, 7);
  }
  return trimmed.length > 16 ? trimmed.slice(0, 16) : trimmed;
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
    };
  });
}

function buildDemoWineTiers(menu, context) {
  const baseRange = parseBudgetRange(context?.wineBudget || menu?.wineCost || "$80-120");
  const basePairings = (menu?.courses || []).map((course) => {
    return course.wine || `${course.type} pairing`;
  });
  const tiers = [
    { id: "value", label: "Value", factor: 0.7 },
    { id: "classic", label: "Classic", factor: 1 },
    { id: "premium", label: "Premium", factor: 1.6 },
    { id: "splurge", label: "Splurge", factor: 2.4 },
  ];

  return tiers.map((tier) => {
    const min = Math.max(30, Math.round(baseRange.min * tier.factor));
    const max = Math.max(min, Math.round(baseRange.max * tier.factor));
    return {
      id: tier.id,
      label: tier.label,
      totalCost: formatBudgetRange(min, max),
      pairings: basePairings.map((pairing) => `${tier.label} pick: ${pairing}`),
    };
  });
}

function buildDemoDetails(menu, context) {
  return {
    recipes: buildDemoRecipes(menu, context),
    wineTiers: buildDemoWineTiers(menu, context),
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
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    apiConfigured: !!ANTHROPIC_API_KEY,
    betaExpiry: BETA_EXPIRY,
    version: APP_VERSION,
    deploy: formatDeployId(DEPLOY_ID),
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
app.post("/api/chat", async (req, res) => {
  const { persona, messages, context } = req.body || {};
 
  if (!ANTHROPIC_API_KEY) {
    if (ALLOW_DEMO_FALLBACK) {
      const demoResponses = {
        chef: "I love the direction you're thinking! For a dinner party this size, I'd suggest building around one show-stopping protein. What ingredients are you most excited about right now?",
        sommelier: "Great question! For your menu style, I'd recommend starting with something crisp and refreshing, then building to fuller-bodied wines as the meal progresses. What's your comfort level with wine - do your guests tend toward adventure or familiar favorites?",
        instructor: "Let's make sure you're set up for success. The key is doing as much as possible the day before. What's your biggest concern about the timing?",
        all: "Chef: That sounds delicious!\n\nSommelier: I have some perfect pairing ideas.\n\nInstructor: And I can help you time everything perfectly.",
      };
      return res.json({ response: demoResponses[persona] || demoResponses.chef, demo: true });
    }
    return respondMissingApiKey(res, "Set ANTHROPIC_API_KEY to enable AI chat.");
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
 
    const apiMessages = (messages || []).map((m) => ({
      role: m.role === "user" ? "user" : "assistant",
      content: m.content,
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
app.post("/api/generate-menus", async (req, res) => {
  const { code, context, chatHistory, rejectionHistory } = req.body || {};
 
  const upperCode = code?.trim?.().toUpperCase?.();
  if (upperCode && usageStats[upperCode]) {
    usageStats[upperCode].generations++;
  }
 
  if (!ANTHROPIC_API_KEY) {
    if (ALLOW_DEMO_FALLBACK) {
      return res.json({ menus: DEMO_MENUS, demo: true });
    }
    return respondMissingApiKey(res);
  }
 
  try {
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
      menus = parseJsonPayload(response.content?.[0]?.text, "Menu generation");
      if (!Array.isArray(menus)) {
        throw new Error("Menu generation JSON was not an array.");
      }
    } catch (parseErr) {
      console.error("JSON parse error:", parseErr);
      console.error("Raw response:", response.content?.[0]?.text);
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
 
// Generate recipes + wine tiers for selected menu
app.post("/api/generate-details", async (req, res) => {
  const { menu, context } = req.body || {};

  if (!menu?.courses?.length) {
    return res.status(400).json({ error: "Menu data is required." });
  }

  if (!ANTHROPIC_API_KEY) {
    if (ALLOW_DEMO_FALLBACK) {
      return res.json({ ...buildDemoDetails(menu, context), demo: true });
    }
    return respondMissingApiKey(res);
  }

  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const systemPrompt = `You are an expert culinary team creating detailed recipe previews and tiered wine pairings.

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
      "makeAhead": "string"
    }
  ],
  "wineTiers": [
    {
      "id": "value|classic|premium|splurge",
      "label": "Value|Classic|Premium|Splurge",
      "totalCost": "string",
      "pairings": ["string", "..."]
    }
  ]
}

Rules:
- Provide exactly 5 recipes, in the same order as the menu courses.
- Provide exactly 4 wine tiers, each with 5 pairings in course order.
- Pairings should be specific bottles with producer + vintage when possible.
- Keep steps concise and practical for a skilled home cook.
- Keep each recipe to 6-8 ingredients and 4-6 steps.
- Keep notes and make-ahead guidance to one sentence each.`;

    const response = await withTimeout(
      client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 2048,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: `Generate details for this menu and context:\n\nMenu:\n${JSON.stringify(menu, null, 2)}\n\nContext:\n${JSON.stringify(context || {}, null, 2)}`,
          },
        ],
      }),
      REQUEST_TIMEOUTS_MS.details,
      "Details generation"
    );

    const details = parseJsonPayload(response.content?.[0]?.text, "Details generation");
    res.json(details);
  } catch (err) {
    console.error("Details generation error:", err);
    if (ALLOW_DEMO_FALLBACK) {
      return res.json({ ...buildDemoDetails(menu, context), demo: true, warning: "AI request failed." });
    }
    return res.status(502).json({ error: "Details generation failed.", detail: err.message });
  }
});

// Generate cookbook (creates an id, then /api/download-cookbook downloads DOCX)
app.post("/api/generate-cookbook", async (req, res) => {
  const { menu, context, staffing, recipes } = req.body || {};
  const cookbookId = Date.now().toString(36) + Math.random().toString(36).slice(2);
 
  global.cookbooks[cookbookId] = { menu, context, staffing, recipes: recipes || null };
  res.json({ success: true, cookbookId });
});
 
app.post("/api/download-cookbook", async (req, res) => {
  const { cookbookId, menu, context, staffing, recipes } = req.body || {};
  let cookbookData = cookbookId ? global.cookbooks?.[cookbookId] : null;

  if (!cookbookData && menu && context) {
    cookbookData = { menu, context, staffing, recipes };
  }

  if (!cookbookData || !cookbookData.menu || !cookbookData.menu.courses) {
    return res.status(404).json({ error: "Cookbook not found" });
  }

  const payload = cookbookData;

  try {
    const buffer = await buildCookbook(payload.menu, payload.context, payload.staffing, payload.recipes);
    const filename =
      (payload.context?.eventTitle || "Dinner_Party").replace(/[^a-zA-Z0-9]/g, "_") + "_Cookbook.docx";

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (err) {
    console.error("DOCX generation error:", err);
    res.status(500).json({ error: "Error generating cookbook", detail: err.message });
  }
});
 
// ============================================================
// START SERVER
// ============================================================
 
app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Dinner Planner ${APP_VERSION} listening on port ${PORT} (${ANTHROPIC_API_KEY ? "API key set" : "demo mode"})`
  );
});