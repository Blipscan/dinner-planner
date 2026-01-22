// ============================================================
// DINNER PARTY PLANNER - CADILLAC EDITION
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
 
const CLIENT_DIR = path.join(__dirname, "..", "client");
const INLINE_FAVICON_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Dinner Party Planner"><rect width="64" height="64" rx="12" fill="#1E3A5F"/><circle cx="32" cy="32" r="18" fill="#C9A227"/><text x="32" y="39" text-anchor="middle" font-size="20" font-family="Georgia, serif" fill="#1E3A5F">DP</text></svg>`;
app.use(express.static(CLIENT_DIR));

app.get("/favicon.ico", (req, res) => {
  res.status(200).type("image/svg+xml").send(INLINE_FAVICON_SVG);
});
 
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
 
const usageStats = {};
global.cookbooks = global.cookbooks || {};
const ALLOW_DEMO_FALLBACK = (process.env.ALLOW_DEMO_FALLBACK || "").toLowerCase() === "true";
const REQUEST_TIMEOUTS_MS = {
  chat: 15000,
  menus: 25000,
  details: 20000,
};

function extractAccessCode(req) {
  const body = req.body || {};
  const candidates = [
    body.code,
    body.accessCode,
    body.access_code,
    body.token,
    req.query?.code,
  ];
  let code = candidates.find((value) => typeof value === "string" && value.trim());
  if (!code) {
    code = req.get("x-access-code") || req.get("x-access-token");
  }
  if (!code) {
    const authHeader = req.get("authorization") || "";
    const match = authHeader.match(/Bearer\s+(.+)/i);
    if (match) {
      code = match[1];
    }
  }
  return typeof code === "string" ? code.trim() : "";
}

function evaluateAccessCode(code) {
  if (!code) {
    return { valid: false, message: "Please enter an access code." };
  }

  const upperCode = code.trim().toUpperCase();

  if (upperCode === ADMIN_CODE.toUpperCase()) {
    return { valid: true, isAdmin: true, remaining: 999 };
  }

  if (new Date() > new Date(BETA_EXPIRY)) {
    return { valid: false, message: "Beta period has ended." };
  }

  if (!ACCESS_CODES.map((c) => c.toUpperCase()).includes(upperCode)) {
    return { valid: false, message: "Invalid access code." };
  }

  if (!usageStats[upperCode]) {
    usageStats[upperCode] = { generations: 0, lastUsed: new Date() };
  }

  if (usageStats[upperCode].generations >= MAX_GENERATIONS) {
    return { valid: false, message: "Usage limit reached for this code." };
  }

  usageStats[upperCode].lastUsed = new Date();
  return {
    valid: true,
    remaining: MAX_GENERATIONS - usageStats[upperCode].generations,
  };
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

function getCookbookTestContext(context = {}) {
  return {
    eventTitle: context.eventTitle || "Cookbook Test Dinner",
    eventDate: context.eventDate || "TBD",
    guestCount: context.guestCount || 4,
    serviceTime: context.serviceTime || "7:00 PM",
    wineBudget: context.wineBudget || "$80-120",
    foodBudget: context.foodBudget || "$45-60",
    guestList: context.guestList || "",
    ...context,
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

function formatMenuCourses(menu) {
  if (!menu?.courses?.length) {
    return "";
  }
  return menu.courses
    .map((course, index) => `${index + 1}. ${course.type}: ${course.name}`)
    .join("\n");
}

function formatWineTierMatrix(menu, wineTiers) {
  if (!menu?.courses?.length || !Array.isArray(wineTiers) || wineTiers.length === 0) {
    return "";
  }
  return menu.courses
    .map((course, index) => {
      const tierLines = wineTiers.map((tier) => {
        const pairing = tier?.pairings?.[index] || "Pairing TBD";
        return `  - ${tier.label}: ${pairing}`;
      });
      return `${course.type}: ${course.name}\n${tierLines.join("\n")}`;
    })
    .join("\n\n");
}

function formatTimelineItems(timeline) {
  if (!Array.isArray(timeline) || timeline.length === 0) {
    return "";
  }
  return timeline
    .map((item) => {
      const time = item?.time || item?.offsetLabel || "Time";
      const task = item?.task || "Task";
      return `- ${time}: ${task}`;
    })
    .join("\n");
}

function formatStaffingSummary(staffingId) {
  if (!staffingId) {
    return "";
  }
  const staffing = STAFFING.find((option) => option.id === staffingId);
  if (!staffing) {
    return "";
  }
  return `${staffing.name} (${staffing.desc}, ~${staffing.activeMin} min active)`;
}

function buildExpertFocusPrompt(persona, options) {
  const menuSummary = options.menuSummary;
  const tierMatrix = options.tierMatrix;
  const timelineSummary = options.timelineSummary;
  const staffingSummary = options.staffingSummary;

  if (!menuSummary) {
    return "If no menu is selected, ask the host to choose a menu so you can give course-specific guidance.";
  }

  if (persona === "sommelier") {
    return `Selected menu courses:\n${menuSummary}

Wine tier matrix (if available):
${tierMatrix || "Not provided"}

Sommelier focus:
- Discuss the selected courses in order.
- Provide 4 tiers of beverage pairings (Value, Classic, Premium, Splurge) for EACH course.
- Mix wine, champagne, and cocktails across the tiers where it fits the course.
- Help choose the final wines that will appear on the printed menu.
- Explain why the pairings work, in approachable language.
- Ask one clarifying question about guest preferences or budget.`;
  }

  if (persona === "instructor") {
    return `Selected menu courses:\n${menuSummary}

Staffing: ${staffingSummary || "Not provided"}
Day-of timeline (if available):
${timelineSummary || "Not provided"}

Instructor focus:
- Give a pre-days plan (two days before, day before).
- Give a cooking-day plan with key timestamps (use timeline if provided).
- Call out make-ahead items, staging, and calm checkpoints.
- Note any substitutions that change prep or timing.
- Ask one question about kitchen setup or timing comfort.`;
  }

  if (persona === "chef") {
    return `Selected menu courses:\n${menuSummary}

Chef focus:
- Talk course-by-course about flavor arc, balance, and technique.
- Highlight one or two upgrades or tweaks per course.
- Suggest substitutions for dietary needs or availability.
- Ask about plating preferences (dish color, rimless vs rimmed).
- Ask which course they are most excited or nervous about.`;
  }

  if (persona === "all") {
    return `Selected menu courses:\n${menuSummary}

Team focus:
- Chef covers course-by-course flavor arc and technique.
- Chef also confirms substitutions and plating details (dish color).
- Sommelier provides 4 tiers (Value, Classic, Premium, Splurge) of wine/champagne/cocktails for each course and locks the menu wine list.
- Instructor provides pre-days plan, cooking-day timeline, and notes substitution impacts.
- Use labels "Chef:", "Sommelier:", "Instructor:" when switching voices.`;
  }

  return `Selected menu courses:\n${menuSummary}\nProvide guidance tailored to these courses.`;
}

function buildDemoChefResponse(menu) {
  if (!menu?.courses?.length) {
    return "Chef: I can dive into the course-by-course plan as soon as you select a menu. Which menu are you leaning toward?";
  }
  const courseLines = menu.courses.map((course) => `- ${course.type}: ${course.name}`).join("\n");
  return `Chef: Here is your selected course arc:\n${courseLines}\n\nThis is also the moment to confirm substitutions and plating preferences (dish color, rimmed vs rimless). For each course, we can sharpen the flavor story and keep the pacing elegant. Which course do you want to elevate first?`;
}

function buildDemoSommelierResponse(menu) {
  if (!menu?.courses?.length) {
    return "Sommelier: Select a menu and I will map four tiers of wine, champagne, and cocktails for each course.";
  }
  const tierNames = ["Value", "Classic", "Premium", "Splurge"];
  const tierSuggestions = {
    "Amuse-Bouche": [
      "Cocktail: citrus spritz",
      "Champagne: brut cava",
      "Champagne: vintage blanc de blancs",
      "Champagne: prestige cuvee",
    ],
    "First Course": [
      "Cocktail: herb gimlet",
      "Wine: Sauvignon Blanc",
      "Wine: White Burgundy",
      "Champagne: vintage brut",
    ],
    "Second Course": [
      "Cocktail: dry martini",
      "Wine: rose Provence",
      "Wine: Pinot Noir",
      "Champagne: rose vintage",
    ],
    "Main Course": [
      "Cocktail: black Manhattan",
      "Wine: Syrah or Cabernet",
      "Wine: premier cru Bordeaux",
      "Wine: grand cru Burgundy",
    ],
    "Dessert": [
      "Cocktail: espresso martini",
      "Wine: Moscato d'Asti",
      "Wine: Sauternes",
      "Champagne: demi-sec",
    ],
  };

  const courseBlocks = menu.courses.map((course) => {
    const suggestions = tierSuggestions[course.type] || tierSuggestions["Main Course"];
    const tierLines = tierNames.map((tier, index) => `- ${tier}: ${suggestions[index]}`);
    return `${course.type}: ${course.name}\n${tierLines.join("\n")}`;
  });

  return `Sommelier: Four-tier beverage map by course (wine, champagne, and cocktails mixed across tiers):\n\n${courseBlocks.join("\n\n")}\n\nTell me which spirits or wine regions your guests love, and I will refine the tiers and lock the wines that should appear on the printed menu.`;
}

function buildDemoInstructorResponse(menu, timeline) {
  const courseSummary = menu?.courses?.length
    ? menu.courses.map((course) => `- ${course.type}: ${course.name}`).join("\n")
    : "- Menu selection pending";
  const timelineSummary = formatTimelineItems(timeline);
  const dayOfPlan = timelineSummary || "- Final prep, warm plates, and staggered firing by course.\n- Plate, serve, reset, repeat.";

  return `Instructor: Here is a calm, staged plan around your menu:\n${courseSummary}\n\nTwo days before:\n- Confirm menu, substitutions, shopping list, and equipment.\n- Prep any long-hold elements (stocks, sauces, dessert bases).\n\nDay before:\n- Shop perishables and proteins.\n- Pre-chop, pre-measure, and label.\n- Set the table and stage serving pieces.\n\nCooking day:\n${dayOfPlan}\n\nWhat is your kitchen setup and how much prep time do you have the day before?`;
}

function buildDemoTeamResponse(menu, timeline) {
  return [
    buildDemoChefResponse(menu),
    buildDemoSommelierResponse(menu),
    buildDemoInstructorResponse(menu, timeline),
  ].join("\n\n");
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
    version: "2.0.0-cadillac",
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
  const code = extractAccessCode(req);
  const result = evaluateAccessCode(code);
  res.json({
    ...result,
    authorized: result.valid,
    success: result.valid,
  });
});

app.post("/api/verify", (req, res) => {
  const code = extractAccessCode(req);
  const result = evaluateAccessCode(code);
  res.status(result.valid ? 200 : 401).json({
    ...result,
    authorized: result.valid,
    success: result.valid,
  });
});

// Internal test: confirm cookbook generation pipeline runs
app.post("/api/debug/test-cookbook", async (req, res) => {
  const code = extractAccessCode(req);
  const result = evaluateAccessCode(code);
  if (!result.valid) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  const menu = req.body?.menu || DEMO_MENUS[0];
  const context = getCookbookTestContext(req.body?.context);
  const staffing = req.body?.staffing || STAFFING[0]?.id || "solo";
  const recipes = req.body?.recipes || null;

  try {
    const start = Date.now();
    const buffer = await buildCookbook(menu, context, staffing, recipes);
    const elapsedMs = Date.now() - start;
    res.json({
      success: true,
      bytes: buffer.length,
      elapsedMs,
      menuTitle: menu?.title || "Unknown",
      staffing,
    });
  } catch (err) {
    console.error("Cookbook test error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});
 
// Chat with expert persona
app.post("/api/chat", async (req, res) => {
  const { persona, messages, context, menu, menuDetails, timeline, staffing, focus } = req.body || {};
  const isExpertFocus = focus === "expert";

  if (!ANTHROPIC_API_KEY) {
    if (isExpertFocus) {
      const responseByPersona = {
        chef: buildDemoChefResponse(menu),
        sommelier: buildDemoSommelierResponse(menu),
        instructor: buildDemoInstructorResponse(menu, timeline),
        all: buildDemoTeamResponse(menu, timeline),
      };
      return res.json({ response: responseByPersona[persona] || buildDemoChefResponse(menu) });
    }
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
    const menuSummary = isExpertFocus ? formatMenuCourses(menu) : "";
    const tierMatrix = isExpertFocus ? formatWineTierMatrix(menu, menuDetails?.wineTiers) : "";
    const timelineSummary = isExpertFocus ? formatTimelineItems(timeline) : "";
    const staffingSummary = isExpertFocus ? formatStaffingSummary(staffing) : "";
    const focusPrompt = isExpertFocus
      ? buildExpertFocusPrompt(persona, {
          menuSummary,
          tierMatrix,
          timelineSummary,
          staffingSummary,
        })
      : "";
    const focusSection = focusPrompt ? `\n\n${focusPrompt}\n` : "\n";

    const systemPrompt =
      (personaData?.systemPrompt || "") +
      focusSection +
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
    return res.json({ menus: DEMO_MENUS, demo: true });
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
      const text = response.content[0].text.trim();
      const jsonText = text.replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim();
      menus = JSON.parse(jsonText);
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
 
// Generate recipes + wine tiers for selected menu
app.post("/api/generate-details", async (req, res) => {
  const { menu, context } = req.body || {};

  if (!menu?.courses?.length) {
    return res.status(400).json({ error: "Menu data is required." });
  }

  if (!ANTHROPIC_API_KEY) {
    return res.json({ ...buildDemoDetails(menu, context), demo: true });
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
- Keep steps concise and practical for a skilled home cook.`;

    const response = await withTimeout(
      client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 3072,
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

    const text = response.content[0].text.trim();
    const jsonText = text.replace(/^```json?\n?/, "").replace(/\n?```$/, "").trim();
    const details = JSON.parse(jsonText);
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
  const { cookbookId } = req.body || {};
  const cookbookData = global.cookbooks?.[cookbookId];
 
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
 
// ============================================================
// START SERVER
// ============================================================
 
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Dinner Planner listening on port ${PORT} (${ANTHROPIC_API_KEY ? "API key set" : "demo mode"})`);
});