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

function isBondTheme(context) {
  const haystack = [
    context?.eventTitle,
    context?.inspiration,
    context?.menuStyle,
    context?.customMenu,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return /(james\s*bond|007|skyfall|spectre|goldeneye|casino royale|bond)/i.test(haystack);
}

function ensureBondWineText(existing) {
  const bondPick = "Bollinger Special Cuvée NV";
  if (!existing) {
    return `James Bond pick: ${bondPick}`;
  }
  if (/bollinger|james bond|bond pick/i.test(existing)) {
    return existing;
  }
  return `${existing} — James Bond pick: ${bondPick}`;
}

function injectBondWineIntoMenus(menus, context) {
  if (!isBondTheme(context) || !Array.isArray(menus)) {
    return;
  }

  const hasBondAlready = menus.some((menu) =>
    menu?.courses?.some((course) => /bollinger|james bond/i.test(course?.wine || ""))
  );
  if (hasBondAlready) {
    return;
  }

  const targetMenu = menus.find((menu) => Array.isArray(menu?.courses)) || menus[0];
  if (!targetMenu?.courses?.length) {
    return;
  }

  const firstWineCourse = targetMenu.courses.find((course) => course?.wine);
  if (firstWineCourse) {
    firstWineCourse.wine = ensureBondWineText(firstWineCourse.wine);
    return;
  }

  if (targetMenu.courses[1]) {
    targetMenu.courses[1].wine = ensureBondWineText(targetMenu.courses[1].wine);
  } else {
    targetMenu.courses[0].wine = ensureBondWineText(targetMenu.courses[0].wine);
  }
}

function injectBondWineIntoDetails(details, menu, context) {
  if (!isBondTheme(context) || !details?.wineTiers?.length) {
    return;
  }

  const hasBondAlready = details.wineTiers.some((tier) =>
    tier?.pairings?.some((pairing) => /bollinger|james bond/i.test(pairing || ""))
  );
  if (hasBondAlready) {
    return;
  }

  const targetTier = details.wineTiers.find((tier) => tier?.id === "classic") || details.wineTiers[0];
  if (!targetTier) {
    return;
  }

  if (!Array.isArray(targetTier.pairings)) {
    targetTier.pairings = [];
  }

  const index = 0;
  const courseLabel = menu?.courses?.[index]?.type ? `${menu.courses[index].type} pairing` : "Amuse-Bouche pairing";
  const existing = targetTier.pairings[index] || courseLabel;
  targetTier.pairings[index] = ensureBondWineText(existing);
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
      return res.status(502).json({ error: "Menu generation failed.", detail: "AI returned invalid JSON." });
    }
 
    injectBondWineIntoMenus(menus, context);
    res.json({ menus });
  } catch (err) {
    console.error("Menu generation error:", err);
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
    return respondMissingApiKey(res);
  }

  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const systemPrompt = `You are an expert culinary team creating detailed recipe previews, wine pairings, and cookbook guidance.

Return ONLY valid JSON with this exact shape:
{
  "chefOverview": "string",
  "wineOverview": "string",
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
  "wineTiers": [
    {
      "id": "value|classic|premium|splurge",
      "label": "Value|Classic|Premium|Splurge",
      "totalCost": "string",
      "pairings": ["string", "..."]
    }
  ],
  "shoppingList": {
    "categories": [
      { "name": "string", "items": ["string", "..."] }
    ],
    "notes": ["string", "..."]
  },
  "dayBeforePrep": ["string", "..."],
  "dayOfTimeline": [
    { "time": "string", "task": "string" }
  ],
  "platingGuides": [
    { "courseType": "string", "guidance": "string" }
  ],
  "tableSetting": {
    "placeSetting": ["string", "..."],
    "centerpiece": "string",
    "notes": ["string", "..."]
  },
  "serviceNotes": {
    "pacing": ["string", "..."],
    "wineService": ["string", "..."],
    "clearing": ["string", "..."]
  },
  "ambianceGuide": {
    "lighting": ["string", "..."],
    "music": ["string", "..."],
    "temperature": ["string", "..."]
  },
  "finalChecklist": {
    "weekBefore": ["string", "..."],
    "dayBefore": ["string", "..."],
    "dayOf": ["string", "..."]
  },
  "imagePrompts": ["string", "..."]
}

Rules:
- Provide exactly 5 recipes, in the same order as the menu courses.
- Provide exactly 4 wine tiers, each with 5 pairings in course order.
- Pairings should be specific bottles with producer + vintage when possible.
- For each pairing, append a short reason after " - " (max 10 words).
- Use 8-12 ingredients and 5-8 steps per recipe.
- Notes, make-ahead guidance, and why-it-works can be 1-2 sentences each.
- chefOverview should explain the course progression (2-3 sentences).
- wineOverview should explain pairing logic and progression (2-3 sentences).
- shoppingList.categories: 6 categories, each 4-6 items.
- dayBeforePrep: 8-10 tasks.
- dayOfTimeline: 10-12 time-stamped items.
- platingGuides: 5 entries, 2-3 sentences each.
- tableSetting.placeSetting: 6-8 items; centerpiece 1 sentence; notes 3 bullets.
- serviceNotes: 3-5 bullets per section.
- ambianceGuide: 3 bullets per section.
- finalChecklist: 4-6 items per section.
- imagePrompts: 6 prompts (5 courses + 1 tablescape).`;

    const response = await withTimeout(
      client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 4096,
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
    injectBondWineIntoDetails(details, menu, context);
    res.json(details);
  } catch (err) {
    console.error("Details generation error:", err);
    return res.status(502).json({ error: "Details generation failed.", detail: err.message });
  }
});

// Generate cookbook (creates an id, then /api/download-cookbook downloads DOCX)
app.post("/api/generate-cookbook", async (req, res) => {
  const { menu, context, staffing, recipes, details } = req.body || {};
  const cookbookId = Date.now().toString(36) + Math.random().toString(36).slice(2);
 
  global.cookbooks[cookbookId] = {
    menu,
    context,
    staffing,
    recipes: recipes || null,
    details: details || null,
  };
  res.json({ success: true, cookbookId });
});
 
app.post("/api/download-cookbook", async (req, res) => {
  const { cookbookId, menu, context, staffing, recipes, details } = req.body || {};
  let cookbookData = cookbookId ? global.cookbooks?.[cookbookId] : null;

  if (!cookbookData && menu && context) {
    cookbookData = { menu, context, staffing, recipes, details };
  }

  if (!cookbookData || !cookbookData.menu || !cookbookData.menu.courses) {
    return res.status(404).json({ error: "Cookbook not found" });
  }

  const payload = cookbookData;

  try {
    const buffer = await buildCookbook(
      payload.menu,
      payload.context,
      payload.staffing,
      payload.recipes,
      payload.details
    );
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
    `Dinner Planner ${APP_VERSION} listening on port ${PORT} (${ANTHROPIC_API_KEY ? "API key set" : "API key missing"})`
  );
});