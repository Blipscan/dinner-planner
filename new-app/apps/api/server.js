// ============================================================
// DINNER PARTY PLANNER - NEW APP API
// ============================================================

const express = require("express");
const path = require("path");
const Anthropic = require("@anthropic-ai/sdk");
const { jsonrepair } = require("jsonrepair");
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
require("dotenv").config();

const {
  CUISINES,
  MENU_INSPIRATIONS,
  MENU_STYLES,
  STAFFING,
  AVERY_PRODUCTS,
  PERSONAS,
  DEMO_MENUS,
  DEMO_MENU_RECIPES,
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
const ALLOW_DEMO_FALLBACK = false;
const COOKBOOK_EXPERIENCE_MAX_TOKENS = parseInt(
  process.env.COOKBOOK_EXPERIENCE_MAX_TOKENS || "4096",
  10
);
const DETAIL_COMPACT_MODE = COOKBOOK_EXPERIENCE_MAX_TOKENS <= 1200;
const REQUEST_TIMEOUTS_MS = {
  chat: 15000,
  menus: parseInt(process.env.MENUS_TIMEOUT_MS || "180000", 10),
  details: parseInt(process.env.DETAILS_TIMEOUT_MS || "180000", 10),
};

const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || "60000", 10);
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || "10", 10);
const COOKBOOK_TTL_MS = parseInt(process.env.COOKBOOK_TTL_MS || "86400000", 10);

const usageStats = {};
const rateLimitBuckets = new Map();

global.cookbooks = global.cookbooks || {};

const COURSE_TYPES = ["Amuse-Bouche", "First Course", "Second Course", "Main Course", "Dessert"];

function normalizeCourseType(value) {
  if (!value) return null;
  const key = value.toLowerCase().replace(/[^a-z]/g, "");
  const map = {
    amusebouche: "Amuse-Bouche",
    amuse: "Amuse-Bouche",
    firstcourse: "First Course",
    first: "First Course",
    secondcourse: "Second Course",
    second: "Second Course",
    maincourse: "Main Course",
    main: "Main Course",
    dessert: "Dessert",
  };
  return map[key] || null;
}

function parseCustomMenu(text) {
  if (!text || typeof text !== "string") {
    return { error: "Provide your five courses in the custom menu field." };
  }
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length !== 5) {
    return { error: "Custom menus must include exactly five courses (one per line)." };
  }

  const courses = lines.map((line, index) => {
    const parts = line.split(":");
    let type = COURSE_TYPES[index];
    let name = line;
    if (parts.length > 1) {
      const candidateType = normalizeCourseType(parts[0].trim());
      if (candidateType) {
        type = candidateType;
        name = parts.slice(1).join(":").trim();
      } else {
        name = parts.slice(1).join(":").trim() || line;
      }
    }
    return {
      type,
      name: name || `Course ${index + 1}`,
      wine: normalizeWineTiers(null),
    };
  });

  return { courses };
}

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

function parseFraction(value) {
  const trimmed = value.trim();
  if (!trimmed) return 0;
  if (trimmed.includes("-")) {
    const [whole, fraction] = trimmed.split("-");
    return parseFraction(whole) + parseFraction(fraction);
  }
  if (trimmed.includes("/")) {
    const [numerator, denominator] = trimmed.split("/");
    const num = parseFloat(numerator);
    const den = parseFloat(denominator);
    if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return 0;
    return num / den;
  }
  const num = parseFloat(trimmed);
  return Number.isFinite(num) ? num : 0;
}

function parseSizeInches(size) {
  if (!size) return { width: 0, height: 0 };
  const cleaned = size.replace(/"/g, "").replace(/\s+/g, "");
  const parts = cleaned.toLowerCase().split("x");
  if (parts.length !== 2) return { width: 0, height: 0 };
  return {
    width: parseFraction(parts[0]),
    height: parseFraction(parts[1]),
  };
}

function gridForPerSheet(count) {
  switch (count) {
    case 6:
      return { rows: 3, cols: 2 };
    case 4:
      return { rows: 2, cols: 2 };
    case 2:
      return { rows: 2, cols: 1 };
    case 1:
      return { rows: 1, cols: 1 };
    default:
      return { rows: 1, cols: 1 };
  }
}

function buildPrintItems(type, context, menu, totalSlots) {
  const items = [];
  const eventTitle = context?.eventTitle || "Dinner Party";
  const eventDate = context?.eventDate || "";
  const serviceTime = context?.serviceTime || "";
  const guestList = Array.isArray(context?.guestList)
    ? context.guestList
    : typeof context?.guestList === "string"
      ? context.guestList.split("\n").map((name) => name.trim()).filter(Boolean)
      : [];

  if (type === "placeCards") {
    const names = guestList.length ? guestList : Array.from({ length: totalSlots }, (_, i) => `Guest ${i + 1}`);
    names.slice(0, totalSlots).forEach((name) => items.push([name]));
    return items;
  }

  if (type === "tableNumbers") {
    for (let i = 1; i <= totalSlots; i += 1) {
      items.push([`Table ${i}`]);
    }
    return items;
  }

  if (type === "invitations") {
    const lines = [
      "You're Invited",
      eventTitle,
      eventDate || "Date TBD",
      serviceTime ? `Service: ${serviceTime}` : "Details to follow",
    ].filter(Boolean);
    for (let i = 0; i < totalSlots; i += 1) {
      items.push(lines);
    }
    return items;
  }

  const menuTitle = menu?.title || "Menu";
  const courseLines = (menu?.courses || []).map((course) => `${course.type}: ${course.name}`);
  const lines = [eventTitle, menuTitle, ...courseLines];
  for (let i = 0; i < totalSlots; i += 1) {
    items.push(lines);
  }
  return items;
}

function truncateLine(text, maxLength) {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1)}…`;
}

async function buildPrintProductPdf({ type, product, context, menu }) {
  const { width, height } = parseSizeInches(product.size);
  if (!width || !height) {
    throw new Error("Unable to parse product size.");
  }

  const { rows, cols } = gridForPerSheet(product.perSheet);
  const pageWidth = 8.5 * 72;
  const pageHeight = 11 * 72;
  const cardWidth = width * 72;
  const cardHeight = height * 72;
  const gutterX = cols > 1 ? Math.max(0, (pageWidth - cols * cardWidth) / (cols - 1)) : 0;
  const gutterY = rows > 1 ? Math.max(0, (pageHeight - rows * cardHeight) / (rows - 1)) : 0;
  const totalWidth = cols * cardWidth + (cols - 1) * gutterX;
  const totalHeight = rows * cardHeight + (rows - 1) * gutterY;
  const startX = (pageWidth - totalWidth) / 2;
  const startY = (pageHeight - totalHeight) / 2;

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([pageWidth, pageHeight]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const items = buildPrintItems(type, context, menu, rows * cols);
  items.forEach((lines, index) => {
    const row = Math.floor(index / cols);
    const col = index % cols;
    const x = startX + col * (cardWidth + gutterX);
    const y = pageHeight - startY - (row + 1) * cardHeight - row * gutterY;

    page.drawRectangle({
      x,
      y,
      width: cardWidth,
      height: cardHeight,
      borderColor: rgb(0.83, 0.83, 0.83),
      borderWidth: 1,
      color: rgb(1, 1, 1),
    });

    const maxLength = type === "menuCards" ? 42 : 28;
    const processed = lines.map((line) => truncateLine(line, maxLength));
    const fontSize = type === "menuCards" ? 9 : type === "invitations" ? 12 : 16;
    const lineHeight = fontSize + 4;
    const totalTextHeight = processed.length * lineHeight;
    let textY = y + (cardHeight - totalTextHeight) / 2 + totalTextHeight - lineHeight;

    processed.forEach((line, lineIndex) => {
      const useBold = lineIndex === 0 || type === "tableNumbers" || type === "placeCards";
      const currentFont = useBold ? fontBold : font;
      const currentSize = type === "menuCards" && lineIndex === 1 ? fontSize + 1 : fontSize;
      const textWidth = currentFont.widthOfTextAtSize(line, currentSize);
      const textX = x + (cardWidth - textWidth) / 2;
      page.drawText(line, {
        x: textX,
        y: textY,
        size: currentSize,
        font: currentFont,
        color: rgb(0.15, 0.2, 0.3),
      });
      textY -= lineHeight;
    });
  });

  return pdfDoc.save();
}

function buildDemoRecipes(menu, context) {
  const guestCount = parseInt(context?.guestCount || "6", 10);
  const menuId = menu?.id;
  const preset = menuId ? DEMO_MENU_RECIPES?.[menuId] : null;
  if (preset?.length) {
    return preset.map((recipe) => ({
      ...recipe,
      serves: guestCount || recipe.serves || 6,
    }));
  }
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
    allowDemoFallback: false,
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
    return res.status(400).json({ error: "Anthropic API key is required for chat." });
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
- Dining Space Notes: ${context?.diningSpace || "none"}

Be conversational, warm, and helpful. Ask clarifying questions when needed. Share your expertise naturally.

Conversation requirements:
- If the user hasn't specified what dishes are already set, ask: "What are you already set on serving?"
- If inspiration is "restaurant", ask which restaurants or specific dishes to recreate.
- If inspiration is "custom", ask for the exact five courses and dish names, one per line.
- Ask one focused question at a time and avoid repeating questions already answered.`;

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

  if (context?.inspiration === "custom") {
    const parsed = parseCustomMenu(context?.customMenu);
    if (parsed.error) {
      return res.status(400).json({ error: "Custom menu required.", detail: parsed.error });
    }
    const customMenu = {
      id: 1,
      title: context?.eventTitle ? `${context.eventTitle} Menu` : "Custom Menu",
      personality: "Your exact requested menu, prepared to specification.",
      foodCost: context?.foodBudget || "TBD",
      wineCost: context?.wineBudget || "TBD",
      courses: parsed.courses,
    };
    return res.json({ menus: [customMenu] });
  }

  if (!ANTHROPIC_API_KEY) {
    return res.status(400).json({ error: "Anthropic API key is required to generate menus." });
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

Inspiration rules:
- The inspiration is the primary driver for menu selection.
- Ensure each menu clearly reflects the inspiration in title, personality, and course choices.
- If inspiration is "restaurant", mirror the style of the restaurant(s) discussed in chat.
- If inspiration is "custom", do not invent dishes—use the user-provided menu exactly.

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
      try {
        menus = JSON.parse(jsonText);
      } catch (parseErr) {
        menus = JSON.parse(jsonrepair(jsonText));
      }
      menus = Array.isArray(menus) ? menus.map(normalizeMenuWinePairings) : [];
    } catch (parseErr) {
      console.error("JSON parse error:", parseErr);
      console.error("Raw response:", response.content[0].text);
      return res.status(502).json({ error: "Menu generation failed.", detail: "AI returned invalid JSON." });
    }

    res.json({ menus });
  } catch (err) {
    console.error("Menu generation error:", err);
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
    return res.status(400).json({ error: "Anthropic API key is required to generate menu details." });
  }

  try {
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
    const compactGuidance = DETAIL_COMPACT_MODE
      ? `

Output constraints:
- Use 6-8 ingredients and 5-6 steps per recipe.
- Each step must be 16 words or fewer.
- notes and makeAhead must be 18 words or fewer.
- whyItWorks must be exactly 2 short sentences in the required format.
- Use short wine names (producer + wine only).`
      : "";

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
      "equipment": ["string", "..."],
      "techniques": ["string", "..."],
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
- Each recipe includes whyItWorks with exactly 2 sentences:
  - "Chef chose it because <reason>."
  - "It fits by <how it supports the meal arc>."
- Use the exact course names from the menu; do not rename dishes.
- Ingredients must include exact measurements in US and metric (e.g., "2 tbsp (30 ml) olive oil").
- Provide an equipment list with sizes where applicable.
- Provide a techniques list of the key methods used (e.g., sear, deglaze, emulsify).
- Provide exactly 5 winePairings, in the same order as the menu courses.
- Pairings should be specific bottles with producer + vintage when possible.
- Steps must mention technique where applicable and remain practical for a skilled home cook.${compactGuidance}`;

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
    let details;
    try {
      details = JSON.parse(jsonText);
    } catch (parseErr) {
      details = JSON.parse(jsonrepair(jsonText));
    }
    const normalizedRecipes = Array.isArray(details.recipes)
      ? details.recipes.map((recipe) => ({
          ...recipe,
          equipment: Array.isArray(recipe?.equipment)
            ? recipe.equipment
            : recipe?.equipment
              ? [recipe.equipment]
              : [],
          techniques: Array.isArray(recipe?.techniques)
            ? recipe.techniques
            : recipe?.techniques
              ? [recipe.techniques]
              : [],
        }))
      : [];
    const normalizedPairings = normalizeWinePairings(normalizedMenu, details.winePairings);
    res.json({ ...details, recipes: normalizedRecipes, winePairings: normalizedPairings });
  } catch (err) {
    console.error("Details generation error:", err);
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

// Print-ready PDF for Avery products
app.post("/api/print-product", async (req, res) => {
  const { type, sku, context, menu } = req.body || {};
  const productList = AVERY_PRODUCTS?.[type];
  if (!productList) {
    return res.status(400).json({ error: "Invalid product type." });
  }
  const product = productList.find((item) => item.sku === sku);
  if (!product) {
    return res.status(400).json({ error: "Invalid product SKU." });
  }

  try {
    const pdfBytes = await buildPrintProductPdf({
      type,
      product,
      context: context || {},
      menu: menu || null,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${type}-${sku}.pdf"`);
    res.send(Buffer.from(pdfBytes));
  } catch (err) {
    console.error("Print product error:", err);
    res.status(500).json({ error: "Error generating print product." });
  }
});

// ============================================================
// START SERVER
// ============================================================

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Dinner Planner listening on port ${PORT} (${ANTHROPIC_API_KEY ? "API key set" : "demo mode"})`);
});
