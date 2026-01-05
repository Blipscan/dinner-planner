require("dotenv").config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// --------------------
// Middleware
// --------------------
app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// --------------------
// Access codes
// --------------------
function loadAccessCodes() {
  const codes = (process.env.ACCESS_CODES || "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  const adminCode = process.env.ADMIN_CODE;
  if (adminCode && !codes.includes(adminCode)) codes.push(adminCode);

  return codes;
}

const usageTracker = new Map(); // code -> { generations, lastUsed }
const validCodes = loadAccessCodes();

function getBetaEndDate() {
  if (!process.env.BETA_END_DATE) return new Date("2999-01-01");
  const d = new Date(process.env.BETA_END_DATE);
  return Number.isNaN(d.getTime()) ? new Date("2999-01-01") : d;
}

function getIncomingCode(req) {
  // Accept ALL of these to avoid frontend mismatches:
  // - JSON body: { code } or { accessCode }
  // - Header: x-access-code
  return (
    req.body?.code ||
    req.body?.accessCode ||
    req.headers["x-access-code"] ||
    req.headers["X-Access-Code"]
  );
}

function validateBeta(req, res, next) {
  const endDate = getBetaEndDate();
  if (new Date() > endDate) {
    return res.status(403).json({
      error: "Beta period has ended",
      message:
        "Thank you for testing! The beta period concluded on " +
        (process.env.BETA_END_DATE || "N/A"),
    });
  }

  const code = getIncomingCode(req);
  if (!code) {
    return res.status(400).json({ error: "Code required" });
  }

  if (!validCodes.includes(code)) {
    return res.status(401).json({
      error: "Invalid access code",
      message: "Please enter a valid tester access code",
    });
  }

  req.accessCode = code;
  next();
}

function trackUsage(code) {
  const usage = usageTracker.get(code) || { generations: 0, lastUsed: null };
  usage.generations += 1;
  usage.lastUsed = new Date();
  usageTracker.set(code, usage);
}

// --------------------
// Rate limit /api
// --------------------
app.use(
  "/api/",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please slow down" },
  })
);

// --------------------
// Static frontend (Cadillac)
// --------------------
const PUBLIC_DIR = path.join(__dirname, "..", "public");
app.use(express.static(PUBLIC_DIR));

// --------------------
// API Routes
// --------------------
app.get("/api/health", (req, res) => {
  const endDate = getBetaEndDate();
  res.json({
    status: "ok",
    version: "6.0-complete",
    hasApiKey: !!process.env.ANTHROPIC_API_KEY,
    timestamp: new Date().toISOString(),
    betaEnds: process.env.BETA_END_DATE || null,
    codesLoaded: validCodes.length,
  });
});

// Validate code (login)
app.post("/api/validate-code", (req, res) => {
  const endDate = getBetaEndDate();
  if (new Date() > endDate) {
    return res.status(403).json({ valid: false, message: "Beta period has ended" });
  }

  const code = getIncomingCode(req);
  if (!code) return res.status(400).json({ error: "Code required" });

  if (!validCodes.includes(code)) {
    return res.status(401).json({ valid: false, message: "Invalid access code" });
  }

  const isAdmin = code === process.env.ADMIN_CODE;

  res.json({
    valid: true,
    isAdmin,
    hasApiKey: !!process.env.ANTHROPIC_API_KEY,
  });
});

// Generate menus (Claude)
app.post("/api/generate-menus", validateBeta, async (req, res) => {
  try {
    const preferences = req.body?.preferences || {};
    const prompt = buildMenuPrompt(preferences);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Server missing ANTHROPIC_API_KEY" });
    }

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514",
        max_tokens: 4000,
        temperature: 1.15,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      const txt = await response.text();
      console.error("Anthropic error:", txt);
      return res.status(500).json({ error: "Menu generation failed" });
    }

    const data = await response.json();
    const content = data?.content?.[0]?.text || "";

    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      console.error("Menu parse failed. Head:", content.slice(0, 400));
      return res.status(500).json({ error: "Failed to parse menu response" });
    }

    const menus = JSON.parse(jsonMatch[0]);

    trackUsage(req.accessCode);
    res.json({ menus, source: "ai" });
  } catch (err) {
    console.error("Generate menus error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// SPA fallback: fixes "Cannot GET /"
app.get("*", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

// --------------------
// Prompt helper
// --------------------
function buildMenuPrompt(preferences) {
  const styles = [
    "rustic farmhouse",
    "modern minimalist",
    "classic French",
    "bistro-casual",
    "elegant formal",
    "seasonal harvest",
    "Mediterranean villa",
    "cozy intimate",
    "celebration feast",
    "chef's tasting",
  ];
  const randomStyle = styles[Math.floor(Math.random() * styles.length)];

  return `Generate 5 UNIQUE dinner party menu options. Return ONLY a JSON array, no other text.

Style inspiration for this generation: ${randomStyle}

Guest count: ${preferences.guestCount || 6}
Budget tier: ${preferences.budget || "$30-50 per person"}
Skill level: ${preferences.skillLevel || "intermediate"}
Cuisine preferences: ${Array.isArray(preferences.cuisines) ? preferences.cuisines.join(", ") : "any"}
Ingredients to feature: ${preferences.loves || "none specified"}
Ingredients to avoid: ${preferences.avoids || "none"}
Dietary restrictions: ${Array.isArray(preferences.dietary) ? preferences.dietary.join(", ") : "none"}

Each menu must have this exact JSON structure:
{
  "title": "Menu Name",
  "theme": "Brief theme description",
  "foodCost": "$XX-XX/person",
  "wineCost": "$XXX total",
  "courses": [
    {"type": "Amuse-Bouche", "name": "Dish name with brief description"},
    {"type": "First Course", "name": "Dish name with brief description"},
    {"type": "Second Course", "name": "Dish name with brief description"},
    {"type": "Main Course", "name": "Dish name with brief description"},
    {"type": "Dessert", "name": "Dish name with brief description"}
  ]
}

Return exactly 5 menus in a JSON array. No markdown, no explanation, just the JSON array.`;
}

app.listen(PORT, () => {
  console.log(`Server listening on port ${PORT}`);
});
