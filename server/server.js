// server/server.js
require("dotenv").config();

const path = require("path");
const express = require("express");

const app = express();
const PORT = process.env.PORT || 3000;
const SIM_MODE = process.env.SIM_MODE === "true";

// --------------------
// Middleware
// --------------------
app.use(express.json({ limit: "2mb" }));

// --------------------
// Static frontend
// --------------------
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const CLIENT_DIR = path.join(__dirname, "..", "client");

// Prefer /public, fallback to /client
app.use(express.static(PUBLIC_DIR));
app.use(express.static(CLIENT_DIR));

// --------------------
// Helpers
// --------------------
const ACCESS_CODES = (process.env.ACCESS_CODES || "")
  .split(",")
  .map(c => c.trim())
  .filter(Boolean);

function requireCode(req, res, next) {
  const code = req.body?.code || req.headers["x-access-code"];
  if (!code) {
    return res.status(400).json({ error: "Code required" });
  }
  if (!ACCESS_CODES.includes(code)) {
    return res.status(401).json({ error: "Invalid code" });
  }
  req.code = code;
  next();
}

// --------------------
// API ROUTES
// --------------------

// Health
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    version: "6.0-complete",
    hasApiKey: !!process.env.ANTHROPIC_API_KEY,
    timestamp: new Date().toISOString()
  });
});

// Validate code (LOGIN)
app.post("/api/validate-code", (req, res) => {
  const code = req.body?.code;
  if (!code) {
    return res.status(400).json({ error: "Code required" });
  }
  if (!ACCESS_CODES.includes(code)) {
    return res.status(401).json({ valid: false });
  }

  res.json({
    valid: true,
    isAdmin: false,
    hasApiKey: !!process.env.ANTHROPIC_API_KEY
  });
});

// Generate menus
app.post("/api/generate-menus", requireCode, async (req, res) => {
  if (SIM_MODE) {
    return res.json({
      menus: [
        {
          title: "SIM TEST MENU",
          theme: "Simulation Only",
          foodCost: "$30–50 / person",
          wineCost: "$120",
          courses: [
            { type: "First Course", name: "Seasonal Salad" },
            { type: "Main Course", name: "Roasted Entrée" },
            { type: "Dessert", name: "Simple Sweet" }
          ]
        }
      ]
    });
  }

  // REAL AI logic goes here later
  res.status(501).json({ error: "Menu generation not wired yet" });
});

// --------------------
// SPA FALLBACK (MUST BE LAST)
// --------------------
app.get("*", (req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ error: "Not found" });
  }

  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

// --------------------
// Start server
// --------------------
app.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
