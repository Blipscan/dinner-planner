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
 
const usageStats = {};
global.cookbooks = global.cookbooks || {};

const COURSE_TYPES = ["Amuse-Bouche", "First Course", "Second Course", "Main Course", "Dessert"];
const CUSTOM_MENU_OPTIONS = [
  { label: "Classic", personality: "A classic, timeless execution of your requested courses." },
  { label: "Deconstructed", personality: "Deconstructed plating that keeps flavors intact while changing form." },
  { label: "Modernist", personality: "Modernist techniques and refined textures across your requested courses." },
  { label: "Global Slant", personality: "International flavor accents that reinterpret your requested courses." },
  { label: "Elevated", personality: "An elevated, special-occasion version of your requested courses." }
];

function extractCustomMenuItems(customMenu) {
  if (!customMenu || typeof customMenu !== "string") return [];
  return customMenu
    .split("\n")
    .map((line) => line.replace(/^[\s*\-•\d.)]+/, "").trim())
    .filter(Boolean)
    .slice(0, COURSE_TYPES.length);
}

function buildCustomMenusFromIdeas(ideas, context) {
  const foodBudget = context?.foodBudget || "$45-60";
  const wineBudget = context?.wineBudget || "$80-120";
  const fallbacks = {
    "Amuse-Bouche": "Chef's amuse-bouche selection",
    "First Course": "Seasonal first course",
    "Second Course": "Light second course",
    "Main Course": "Signature main course",
    "Dessert": "House dessert"
  };
  return CUSTOM_MENU_OPTIONS.map((option, idx) => ({
    id: idx + 1,
    title: `${option.label} Interpretation`,
    personality: option.personality,
    foodCost: `${foodBudget}/person`,
    wineCost: `${wineBudget} total`,
    courses: COURSE_TYPES.map((type, courseIndex) => {
      const idea = ideas[courseIndex];
      const name = idea ? `${idea} (${option.label.toLowerCase()} variation)` : fallbacks[type];
      const wine = type === "Amuse-Bouche" || type === "Second Course" ? null : "Sommelier selection";
      return { type, name, wine };
    })
  }));
}

function buildCustomMenuPrompt(customMenu, ideas) {
  if (!customMenu) return "";
  const lines = ideas.length
    ? ideas.map((item, idx) => `- Course ${idx + 1}: ${item}`).join("\n")
    : customMenu.trim();
  return `

Host provided desired courses. Use these as the foundation and keep the same course order.
${lines}

Requirements for custom menu:
- Each of the 5 menus must preserve the requested course ideas.
- Provide options by varying preparation, ingredients, or style, but do not replace the course themes.
- Keep the same number of courses in the same order.
- Use these style lenses for the five options: Classic, Deconstructed, Modernist, Global slant, Elevated.
`;
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
  const customMenu = context?.customMenu?.trim?.();
  const customMenuIdeas = extractCustomMenuItems(customMenu);
  const hasCustomMenu = context?.inspiration === "custom" && !!customMenu;
 
  const upperCode = code?.trim?.().toUpperCase?.();
  if (upperCode && usageStats[upperCode]) {
    usageStats[upperCode].generations++;
  }
 
  if (!ANTHROPIC_API_KEY) {
    if (hasCustomMenu) {
      return res.json({ menus: buildCustomMenusFromIdeas(customMenuIdeas, context) });
    }
    return res.json({ menus: DEMO_MENUS });
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
 
    const customMenuPrompt = hasCustomMenu ? buildCustomMenuPrompt(customMenu, customMenuIdeas) : "";
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
${customMenuPrompt}
 
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
 
// Generate cookbook (creates an id, then /api/download-cookbook downloads DOCX)
app.post("/api/generate-cookbook", async (req, res) => {
  const { menu, context, staffing } = req.body || {};
  const cookbookId = Date.now().toString(36) + Math.random().toString(36).slice(2);
 
  global.cookbooks[cookbookId] = { menu, context, staffing, recipes: null };
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