// ============================================================
// DINNER PARTY PLANNER - CADILLAC EDITION
// ============================================================
 
const express = require("express");
const path = require("path");
const os = require("os");
const fs = require("fs/promises");
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
const ACCESS_CODE_SET = new Set(ACCESS_CODES.map((code) => code.toUpperCase()));
 
const BETA_EXPIRY = process.env.BETA_EXPIRY || "2026-03-01";
const MAX_GENERATIONS = parseInt(process.env.MAX_GENERATIONS_PER_CODE || "50", 10);
 
const usageStats = {};
global.cookbooks = global.cookbooks || {};
global.cookbookFiles = global.cookbookFiles || {};

const COOKBOOK_STORAGE_DIR =
  process.env.COOKBOOK_STORAGE_DIR || path.join(os.tmpdir(), "dinner-planner-cookbooks");
const MAX_COOKBOOK_FILES = parseInt(process.env.MAX_COOKBOOK_FILES || "30", 10);
const MAX_COOKBOOK_DOWNLOADS = parseInt(process.env.MAX_COOKBOOK_DOWNLOADS || "2", 10);
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
 
async function ensureCookbookStorageDir() {
  try {
    await fs.mkdir(COOKBOOK_STORAGE_DIR, { recursive: true });
  } catch (err) {
    console.error("Failed to create cookbook storage directory:", err);
  }
}

ensureCookbookStorageDir();

function respondMissingApiKey(res, detail) {
  return res.status(503).json({
    error: "Anthropic API key not configured.",
    detail: detail || "Set ANTHROPIC_API_KEY to enable AI generation.",
  });
}

function validateAccessCode(code) {
  if (!code) {
    return { ok: false, status: 401, message: "Access code required." };
  }

  const upperCode = code.trim().toUpperCase();
  if (!upperCode) {
    return { ok: false, status: 401, message: "Access code required." };
  }

  if (upperCode === ADMIN_CODE.toUpperCase()) {
    return { ok: true, isAdmin: true };
  }

  if (new Date() > new Date(BETA_EXPIRY)) {
    return { ok: false, status: 403, message: "Beta period has ended." };
  }

  if (!ACCESS_CODE_SET.has(upperCode)) {
    return { ok: false, status: 403, message: "Invalid access code." };
  }

  return { ok: true, isAdmin: false, code: upperCode };
}

async function pruneStoredCookbooks() {
  const entries = Object.values(global.cookbookFiles || {}).filter((record) => record?.status === "ready");
  if (entries.length <= MAX_COOKBOOK_FILES) {
    return;
  }

  const sorted = entries.sort((a, b) => a.createdAt - b.createdAt);
  const toRemove = sorted.slice(0, Math.max(0, sorted.length - MAX_COOKBOOK_FILES));

  for (const record of toRemove) {
    try {
      await fs.unlink(record.filePath);
    } catch (err) {
      // ignore
    }
    delete global.cookbookFiles[record.id];
  }
}

async function removeCookbookFile(record) {
  if (!record) {
    return;
  }
  try {
    await fs.unlink(record.filePath);
  } catch (err) {
    // ignore
  }
  delete global.cookbookFiles[record.id];
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

function validateDetails(details, menu) {
  const errors = [];
  if (!details) {
    return ["Details payload missing."];
  }

  const courseCount = menu?.courses?.length || 0;
  const requiredRoles = ["Host", "Kitchen", "Service", "Bar", "Shopping", "Prep", "Day-Of Execution", "Cleanup"];

  if (!details.systemIndex) {
    errors.push("systemIndex missing");
  } else {
    const requiredIndexFields = ["eventName", "eventDate", "location", "guestCount", "serviceStyle", "menuSummary", "complexity", "totalPrepTime", "totalActiveTime", "stationsRequired"];
    requiredIndexFields.forEach((field) => {
      if (details.systemIndex[field] === undefined || details.systemIndex[field] === null || details.systemIndex[field] === "") {
        errors.push(`systemIndex.${field} missing`);
      }
    });
  }

  if (!Array.isArray(details.coursePlan) || details.coursePlan.length !== courseCount) {
    errors.push("coursePlan incomplete");
  }

  if (!Array.isArray(details.recipes) || details.recipes.length !== courseCount) {
    errors.push("recipes incomplete");
  }

  if (!Array.isArray(details.wineTiers) || details.wineTiers.length !== 4) {
    errors.push("wineTiers incomplete");
  }

  if (!Array.isArray(details.masterTimeline) || details.masterTimeline.length < 12) {
    errors.push("masterTimeline incomplete");
  }

  const roleViewsArray = Array.isArray(details.roleViews) ? details.roleViews : [];
  const rolesPresent = new Set(roleViewsArray.map((r) => r.role));
  requiredRoles.forEach((role) => {
    if (!rolesPresent.has(role)) {
      errors.push(`roleViews missing ${role}`);
    }
  });
  if (roleViewsArray.length === 0) {
    errors.push("roleViews missing roles");
  }
  roleViewsArray.forEach((role) => {
    if (!Array.isArray(role.setup) || role.setup.length === 0) {
      errors.push(`roleViews.${role.role}.setup missing`);
    }
    if (!Array.isArray(role.courseTasks) || role.courseTasks.length === 0) {
      errors.push(`roleViews.${role.role}.courseTasks missing`);
    }
    if (!Array.isArray(role.transitions) || role.transitions.length === 0) {
      errors.push(`roleViews.${role.role}.transitions missing`);
    }
    if (!Array.isArray(role.endOfNight) || role.endOfNight.length === 0) {
      errors.push(`roleViews.${role.role}.endOfNight missing`);
    }
  });

  if (!details.masterShoppingList?.categories || details.masterShoppingList.categories.length < 6) {
    errors.push("masterShoppingList incomplete");
  }

  if (!Array.isArray(details.executionPacket) || details.executionPacket.length !== courseCount) {
    errors.push("executionPacket incomplete");
  }

  if (!details.equipmentConstraints) {
    errors.push("equipmentConstraints missing");
  }

  if (!Array.isArray(details.contingencies) || details.contingencies.length < 2) {
    errors.push("contingencies missing");
  }

  if (!details.cleanupReset) {
    errors.push("cleanupReset missing");
  } else {
    if (!Array.isArray(details.cleanupReset.immediate) || details.cleanupReset.immediate.length === 0) {
      errors.push("cleanupReset.immediate missing");
    }
    if (!Array.isArray(details.cleanupReset.later) || details.cleanupReset.later.length === 0) {
      errors.push("cleanupReset.later missing");
    }
    if (!Array.isArray(details.cleanupReset.leftovers) || details.cleanupReset.leftovers.length === 0) {
      errors.push("cleanupReset.leftovers missing");
    }
  }

  if (!details.archiveMetadata) {
    errors.push("archiveMetadata missing");
  }

  return errors;
}

function mergeDetails(base, patch) {
  if (patch === null || patch === undefined) {
    return base;
  }
  if (Array.isArray(patch)) {
    return patch;
  }
  if (typeof patch !== "object") {
    return patch;
  }
  const output = { ...(base || {}) };
  Object.entries(patch).forEach(([key, value]) => {
    const existing = output[key];
    if (Array.isArray(value)) {
      output[key] = value;
    } else if (value && typeof value === "object") {
      output[key] = mergeDetails(existing, value);
    } else {
      output[key] = value;
    }
  });
  return output;
}

function scanForPlaceholders(details) {
  const errors = [];
  const placeholderPattern = /\b(TBD|TBA|TO BE DETERMINED|TODO)\b/i;

  function walk(node, path = []) {
    if (node === null || node === undefined) {
      return;
    }
    if (typeof node === "string") {
      const trimmed = node.trim();
      if (!trimmed && !path.includes("notes")) {
        errors.push(`Empty string at ${path.join(".")}`);
      }
      if (placeholderPattern.test(node)) {
        errors.push(`Placeholder text at ${path.join(".")}`);
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((value, index) => walk(value, path.concat(String(index))));
      return;
    }
    if (typeof node === "object") {
      Object.entries(node).forEach(([key, value]) => {
        if (key === "notes" && path.includes("archiveMetadata")) {
          return;
        }
        walk(value, path.concat(key));
      });
    }
  }

  walk(details, []);
  return errors;
}

function runCookbookQualityCheck(details, menu) {
  const errors = [];
  errors.push(...validateDetails(details, menu));

  if (details?.mealBalance?.overridesRequired) {
    errors.push("mealBalance override required");
  }

  errors.push(...scanForPlaceholders(details));

  return errors;
}

function shouldRetryRecipes(errors) {
  return errors.some((err) => err.includes("recipes") || err.includes("wineTiers"));
}

function shouldRetryOperations(errors) {
  return errors.some((err) => !err.includes("recipes") && !err.includes("wineTiers"));
}

function shouldRetryRoleViews(errors) {
  return errors.some((err) => err.includes("roleViews"));
}

function shouldRetryShopping(errors) {
  return errors.some((err) => err.includes("masterShoppingList"));
}

function shouldRetryExecution(errors) {
  return errors.some((err) => err.includes("executionPacket"));
}

function shouldRetryConstraints(errors) {
  return errors.some((err) => err.includes("equipmentConstraints") || err.includes("contingencies") || err.includes("cleanupReset"));
}

async function requestOperationsPatch(client, basePrompt, errors) {
  const errorList = errors.map((err, index) => `${index + 1}. ${err}`).join("\n");
  const prompt = `Your previous operational output failed these checks:\n${errorList}\n\nReturn ONLY JSON that fixes the missing fields. Include complete objects/arrays for any missing section. No placeholders. No empty arrays. Use the same schema as the operational details.`;
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 3600,
    system: prompt,
    messages: [{ role: "user", content: basePrompt }],
  });
  return parseJsonPayload(response.content?.[0]?.text, "Operational patch");
}

async function requestRecipesPatch(client, basePrompt, errors) {
  const errorList = errors.map((err, index) => `${index + 1}. ${err}`).join("\n");
  const prompt = `Your previous recipe output failed these checks:\n${errorList}\n\nReturn ONLY JSON with complete "recipes" and/or "wineTiers" arrays to fix the missing fields. No placeholders.`;
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 3600,
    system: prompt,
    messages: [{ role: "user", content: basePrompt }],
  });
  return parseJsonPayload(response.content?.[0]?.text, "Recipe patch");
}

async function requestRoleViewsPatch(client, basePrompt, errors) {
  const errorList = errors.map((err, index) => `${index + 1}. ${err}`).join("\n");
  const prompt = `Your role views output failed these checks:\n${errorList}\n\nReturn ONLY JSON with a complete "roleViews" array for ALL roles. No placeholders.`;
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2800,
    system: prompt,
    messages: [{ role: "user", content: basePrompt }],
  });
  return parseJsonPayload(response.content?.[0]?.text, "Role views patch");
}

function getMissingRoles(errors) {
  return errors
    .map((err) => {
      const match = err.match(/^roleViews missing (.+)$/);
      return match ? match[1] : null;
    })
    .filter(Boolean);
}

function mergeRoleViews(existing = [], patch = []) {
  const merged = new Map();
  if (Array.isArray(existing)) {
    existing.forEach((view) => {
      if (view?.role) {
        merged.set(view.role, view);
      }
    });
  }
  if (Array.isArray(patch)) {
    patch.forEach((view) => {
      if (view?.role) {
        merged.set(view.role, view);
      }
    });
  }
  return Array.from(merged.values());
}

async function requestSingleRoleView(client, basePrompt, role, courseTypes) {
  const prompt = `You are generating a single assistant checklist.

Return ONLY valid JSON with this exact shape:
{
  "roleViews": [
    {
      "role": "${role}",
      "startTime": "string",
      "endTime": "string",
      "reportsTo": "string",
      "setup": ["string", "..."],
      "courseTasks": [
        { "courseType": "string", "tasks": ["string", "..."] }
      ],
      "transitions": ["string", "..."],
      "endOfNight": ["string", "..."]
    }
  ]
}

Rules:
- Provide courseTasks for EACH course: ${courseTypes.join(", ")}.
- Each list must include 3-8 tasks.
- Tasks must be imperative and time-triggered.
- No placeholders, no TBD.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 1800,
    system: prompt,
    messages: [{ role: "user", content: basePrompt }],
  });
  return parseJsonPayload(response.content?.[0]?.text, "Role view");
}

async function requestShoppingPatch(client, basePrompt, errors) {
  const errorList = errors.map((err, index) => `${index + 1}. ${err}`).join("\n");
  const prompt = `Your shopping list output failed these checks:\n${errorList}\n\nReturn ONLY JSON with a complete "masterShoppingList" section. No placeholders.`;
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2200,
    system: prompt,
    messages: [{ role: "user", content: basePrompt }],
  });
  return parseJsonPayload(response.content?.[0]?.text, "Shopping patch");
}

async function requestExecutionPatch(client, basePrompt, errors) {
  const errorList = errors.map((err, index) => `${index + 1}. ${err}`).join("\n");
  const prompt = `Your execution packet output failed these checks:\n${errorList}\n\nReturn ONLY JSON with a complete "executionPacket" array (one entry per course). No placeholders.`;
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2200,
    system: prompt,
    messages: [{ role: "user", content: basePrompt }],
  });
  return parseJsonPayload(response.content?.[0]?.text, "Execution patch");
}

async function requestConstraintsPatch(client, basePrompt, errors) {
  const errorList = errors.map((err, index) => `${index + 1}. ${err}`).join("\n");
  const prompt = `Your constraints output failed these checks:\n${errorList}\n\nReturn ONLY JSON with "equipmentConstraints", "contingencies", and "cleanupReset". No placeholders.`;
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2200,
    system: prompt,
    messages: [{ role: "user", content: basePrompt }],
  });
  return parseJsonPayload(response.content?.[0]?.text, "Constraints patch");
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
        max_tokens: 6000,
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
    const operationsCorePrompt = `You are compiling the operational core for a French-style multi-course dinner.

Return ONLY valid JSON with this exact shape:
{
  "systemIndex": {
    "eventName": "string",
    "eventDate": "string",
    "location": "string",
    "guestCount": number,
    "serviceStyle": "string",
    "menuSummary": ["string", "..."],
    "complexity": "Low|Medium|High",
    "totalPrepTime": "string",
    "totalActiveTime": "string",
    "stationsRequired": number
  },
  "coursePlan": [
    {
      "courseType": "string",
      "dish": "string",
      "purpose": "string",
      "portion": "small|medium|substantial",
      "temperature": "hot|cold|room",
      "serviceDuration": "string",
      "dependsOn": ["string", "..."]
    }
  ],
  "mealBalance": {
    "warnings": ["string", "..."],
    "overridesRequired": boolean
  },
  "masterTimeline": [
    {
      "time": "HH:MM",
      "offset": "string",
      "role": "Host|Kitchen|Service|Bar|Shopping|Prep|Day-Of Execution|Cleanup",
      "course": "string",
      "task": "string",
      "duration": "string",
      "dependsOn": ["string", "..."],
      "parallel": boolean
    }
  ],
  "archiveMetadata": {
    "version": "string",
    "generatedAt": "YYYY-MM-DD",
    "parameters": {
      "guestCount": number,
      "menuStyle": "string",
      "serviceStyle": "string"
    },
    "notes": ""
  }
}

Rules:
- Use context fields directly for eventName, eventDate, location, guestCount, serviceStyle.
- menuSummary must list every course in order.
- coursePlan must define purpose, portion, temperature, duration, dependencies.
- mealBalance.warnings must be empty if constraints are satisfied.
- masterTimeline: 14-18 tasks with absolute time and offset from service time.
- No placeholders, no TBD.`;

    const roleViewsPrompt = `You are compiling assistant checklists for a French-style multi-course dinner.

Return ONLY valid JSON with this exact shape:
{
  "roleViews": [
    {
      "role": "Host|Kitchen|Service|Bar|Shopping|Prep|Day-Of Execution|Cleanup",
      "startTime": "string",
      "endTime": "string",
      "reportsTo": "string",
      "setup": ["string", "..."],
      "courseTasks": [
        { "courseType": "string", "tasks": ["string", "..."] }
      ],
      "transitions": ["string", "..."],
      "endOfNight": ["string", "..."]
    }
  ]
}

Rules:
- Include ALL roles: Host, Kitchen, Service, Bar, Shopping, Prep, Day-Of Execution, Cleanup.
- setup, transitions, endOfNight must each have 3-8 tasks.
- courseTasks must include every course in order.
- Tasks must be imperative and time-triggered when possible.
- No placeholders, no TBD.`;

    const shoppingPrompt = `You are compiling the master shopping list for a French-style multi-course dinner.

Return ONLY valid JSON with this exact shape:
{
  "masterShoppingList": {
    "categories": [
      {
        "name": "string",
        "items": [
          {
            "item": "string",
            "quantity": number,
            "unit": "string",
            "metricQuantity": number,
            "metricUnit": "string"
          }
        ]
      }
    ]
  }
}

Rules:
- 6-8 categories, each 4-8 items.
- Quantities must be aggregated for guest count.
- Units must be normalized; include both US and metric.
- No placeholders, no TBD.`;

    const executionPrompt = `You are compiling the day-of execution packet.

Return ONLY valid JSON with this exact shape:
{
  "executionPacket": [
    {
      "courseType": "string",
      "title": "string",
      "steps": ["string", "..."]
    }
  ]
}

Rules:
- One entry per course, in order.
- Steps must be stripped, imperative, and minimal.
- No narrative, no placeholders, no TBD.`;

    const constraintsPrompt = `You are compiling equipment constraints, contingencies, and cleanup.

Return ONLY valid JSON with this exact shape:
{
  "equipmentConstraints": {
    "stationsRequired": number,
    "burnersRequired": number,
    "ovenConflicts": ["string", "..."],
    "fridgeConstraints": ["string", "..."],
    "holdingWindows": ["string", "..."],
    "resolutions": ["string", "..."]
  },
  "contingencies": [
    { "issue": "string", "fix": "string" }
  ],
  "cleanupReset": {
    "immediate": ["string", "..."],
    "later": ["string", "..."],
    "leftovers": ["string", "..."]
  }
}

Rules:
- Provide concrete conflict resolutions.
- Provide 3-5 contingencies with actionable fixes.
- cleanupReset must include 3-6 items in each list.
- No placeholders, no TBD.`;

    const recipesPrompt = `You are compiling the recipe and wine modules for a French-style multi-course dinner.

Return ONLY valid JSON with this exact shape:
{
  "chefOverview": "string",
  "wineOverview": "string",
  "recipes": [
    {
      "title": "string",
      "serves": number,
      "yield": "string",
      "activeTime": "string",
      "totalTime": "string",
      "equipment": ["string", "..."],
      "ingredients": ["string", "..."],
      "steps": ["string", "..."],
      "holding": "string",
      "failurePoints": ["string", "..."]
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
- Provide exactly 5 recipes in menu course order.
- Recipes must be operational: no narrative or marketing language.
- Use 8-12 ingredients and 5-8 steps per recipe.
- Provide equipment, holding guidance, and likely failure points.
- Provide exactly 4 wine tiers, each with 5 pairings in course order.
- Pairings must include producer + vintage and end with " - reason" (max 10 words).
- No placeholders, no TBD.
- Provide chefOverview (2-3 sentences) and wineOverview (2-3 sentences) to explain course and wine logic.`;

    const basePrompt = `Menu:\n${JSON.stringify(menu, null, 2)}\n\nContext:\n${JSON.stringify(context || {}, null, 2)}`;

    const [operationsResponse, roleViewsResponse, shoppingResponse, executionResponse, constraintsResponse] = await Promise.all([
      withTimeout(
        client.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2400,
          system: operationsCorePrompt,
          messages: [{ role: "user", content: basePrompt }],
        }),
        REQUEST_TIMEOUTS_MS.details,
        "Details operations core generation"
      ),
      withTimeout(
        client.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2800,
          system: roleViewsPrompt,
          messages: [{ role: "user", content: basePrompt }],
        }),
        REQUEST_TIMEOUTS_MS.details,
        "Details role views generation"
      ),
      withTimeout(
        client.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          system: shoppingPrompt,
          messages: [{ role: "user", content: basePrompt }],
        }),
        REQUEST_TIMEOUTS_MS.details,
        "Details shopping list generation"
      ),
      withTimeout(
        client.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          system: executionPrompt,
          messages: [{ role: "user", content: basePrompt }],
        }),
        REQUEST_TIMEOUTS_MS.details,
        "Details execution packet generation"
      ),
      withTimeout(
        client.messages.create({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          system: constraintsPrompt,
          messages: [{ role: "user", content: basePrompt }],
        }),
        REQUEST_TIMEOUTS_MS.details,
        "Details constraints generation"
      ),
    ]);

    const recipesResponse = await withTimeout(
      client.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 3600,
        system: recipesPrompt,
        messages: [{ role: "user", content: basePrompt }],
      }),
      REQUEST_TIMEOUTS_MS.details,
      "Details recipe generation"
    );

    const operationsCore = parseJsonPayload(operationsResponse.content?.[0]?.text, "Operational core");
    const roleViewsDetails = parseJsonPayload(roleViewsResponse.content?.[0]?.text, "Role views");
    const shoppingDetails = parseJsonPayload(shoppingResponse.content?.[0]?.text, "Shopping list");
    const executionDetails = parseJsonPayload(executionResponse.content?.[0]?.text, "Execution packet");
    const constraintsDetails = parseJsonPayload(constraintsResponse.content?.[0]?.text, "Constraints");
    let recipeDetails = parseJsonPayload(recipesResponse.content?.[0]?.text, "Recipe details");

    let operationalDetails = mergeDetails(operationsCore, roleViewsDetails);
    operationalDetails = mergeDetails(operationalDetails, shoppingDetails);
    operationalDetails = mergeDetails(operationalDetails, executionDetails);
    operationalDetails = mergeDetails(operationalDetails, constraintsDetails);

    let details = mergeDetails(operationalDetails, recipeDetails);

    details.systemIndex = details.systemIndex || {};
    details.systemIndex.eventName = details.systemIndex.eventName || context?.eventTitle || "Dinner Party";
    details.systemIndex.eventDate = details.systemIndex.eventDate || context?.eventDate || "TBD";
    details.systemIndex.location = details.systemIndex.location || context?.eventLocation || "TBD";
    details.systemIndex.guestCount = details.systemIndex.guestCount || parseInt(context?.guestCount || "0", 10) || 0;
    details.systemIndex.serviceStyle = details.systemIndex.serviceStyle || context?.serviceStyle || "plated";
    details.systemIndex.menuSummary =
      details.systemIndex.menuSummary?.length
        ? details.systemIndex.menuSummary
        : (menu?.courses || []).map((c) => `${c.type}: ${c.name}`);

    details.archiveMetadata = details.archiveMetadata || {};
    details.archiveMetadata.generatedAt = new Date().toISOString().split("T")[0];
    details.archiveMetadata.parameters = details.archiveMetadata.parameters || {};
    details.archiveMetadata.parameters.guestCount = details.archiveMetadata.parameters.guestCount || details.systemIndex.guestCount;
    details.archiveMetadata.parameters.menuStyle = details.archiveMetadata.parameters.menuStyle || context?.menuStyle || "classic";
    details.archiveMetadata.parameters.serviceStyle =
      details.archiveMetadata.parameters.serviceStyle || details.systemIndex.serviceStyle;
    details.archiveMetadata.notes = "";

    injectBondWineIntoDetails(details, menu, context);

    let validationErrors = validateDetails(details, menu);
    let attempts = 0;
    while (validationErrors.length && attempts < 2) {
      attempts += 1;

      if (shouldRetryOperations(validationErrors)) {
        const patch = await withTimeout(
          requestOperationsPatch(client, basePrompt, validationErrors),
          REQUEST_TIMEOUTS_MS.details,
          "Details operations repair"
        );
        operationalDetails = mergeDetails(operationalDetails, patch);
      }

      if (shouldRetryRoleViews(validationErrors)) {
        const missingRoles = getMissingRoles(validationErrors);
        const courseTypes = (menu?.courses || []).map((course) => course.type);
        const roleViews = operationalDetails?.roleViews || [];

        if (missingRoles.length >= requiredRoles.length) {
          const patch = await withTimeout(
            requestRoleViewsPatch(client, basePrompt, validationErrors),
            REQUEST_TIMEOUTS_MS.details,
            "Details role views repair"
          );
          operationalDetails = mergeDetails(operationalDetails, patch);
        } else if (missingRoles.length) {
          for (const role of missingRoles) {
            const patch = await withTimeout(
              requestSingleRoleView(client, basePrompt, role, courseTypes),
              REQUEST_TIMEOUTS_MS.details,
              `Details role view repair ${role}`
            );
            const patchViews = patch?.roleViews || [];
            operationalDetails = mergeDetails(operationalDetails, {
              roleViews: mergeRoleViews(roleViews, patchViews),
            });
          }
        } else {
          const patch = await withTimeout(
            requestRoleViewsPatch(client, basePrompt, validationErrors),
            REQUEST_TIMEOUTS_MS.details,
            "Details role views repair"
          );
          operationalDetails = mergeDetails(operationalDetails, patch);
        }
      }

      if (shouldRetryShopping(validationErrors)) {
        const patch = await withTimeout(
          requestShoppingPatch(client, basePrompt, validationErrors),
          REQUEST_TIMEOUTS_MS.details,
          "Details shopping repair"
        );
        operationalDetails = mergeDetails(operationalDetails, patch);
      }

      if (shouldRetryExecution(validationErrors)) {
        const patch = await withTimeout(
          requestExecutionPatch(client, basePrompt, validationErrors),
          REQUEST_TIMEOUTS_MS.details,
          "Details execution repair"
        );
        operationalDetails = mergeDetails(operationalDetails, patch);
      }

      if (shouldRetryConstraints(validationErrors)) {
        const patch = await withTimeout(
          requestConstraintsPatch(client, basePrompt, validationErrors),
          REQUEST_TIMEOUTS_MS.details,
          "Details constraints repair"
        );
        operationalDetails = mergeDetails(operationalDetails, patch);
      }

      if (shouldRetryRecipes(validationErrors)) {
        const patch = await withTimeout(
          requestRecipesPatch(client, basePrompt, validationErrors),
          REQUEST_TIMEOUTS_MS.details,
          "Details recipe repair"
        );
        recipeDetails = mergeDetails(recipeDetails, patch);
      }

      details = mergeDetails(operationalDetails, recipeDetails);

      details.systemIndex = details.systemIndex || {};
      details.systemIndex.eventName = details.systemIndex.eventName || context?.eventTitle || "Dinner Party";
      details.systemIndex.eventDate = details.systemIndex.eventDate || context?.eventDate || "TBD";
      details.systemIndex.location = details.systemIndex.location || context?.eventLocation || "TBD";
      details.systemIndex.guestCount = details.systemIndex.guestCount || parseInt(context?.guestCount || "0", 10) || 0;
      details.systemIndex.serviceStyle = details.systemIndex.serviceStyle || context?.serviceStyle || "plated";
      details.systemIndex.menuSummary =
        details.systemIndex.menuSummary?.length
          ? details.systemIndex.menuSummary
          : (menu?.courses || []).map((c) => `${c.type}: ${c.name}`);

      details.archiveMetadata = details.archiveMetadata || {};
      details.archiveMetadata.generatedAt = new Date().toISOString().split("T")[0];
      details.archiveMetadata.parameters = details.archiveMetadata.parameters || {};
      details.archiveMetadata.parameters.guestCount =
        details.archiveMetadata.parameters.guestCount || details.systemIndex.guestCount;
      details.archiveMetadata.parameters.menuStyle =
        details.archiveMetadata.parameters.menuStyle || context?.menuStyle || "classic";
      details.archiveMetadata.parameters.serviceStyle =
        details.archiveMetadata.parameters.serviceStyle || details.systemIndex.serviceStyle;
      details.archiveMetadata.notes = "";

      injectBondWineIntoDetails(details, menu, context);

      validationErrors = validateDetails(details, menu);
    }

    if (validationErrors.length) {
      throw new Error(`Details incomplete: ${validationErrors.join("; ")}`);
    }

    res.json(details);
  } catch (err) {
    console.error("Details generation error:", err);
    return res.status(502).json({ error: "Details generation failed.", detail: err.message });
  }
});

// Generate cookbook (creates an id, then /api/download-cookbook downloads DOCX)
app.post("/api/generate-cookbook", async (req, res) => {
  const { code, menu, context, staffing, recipes, details } = req.body || {};
  const accessResult = validateAccessCode(code);
  if (!accessResult.ok) {
    return res.status(accessResult.status).json({ success: false, message: accessResult.message });
  }

  const cookbookId = Date.now().toString(36) + Math.random().toString(36).slice(2);

  if (details) {
    const qualityErrors = runCookbookQualityCheck(details, menu);
    if (qualityErrors.length) {
      return res.status(422).json({
        success: false,
        message: "Quality check failed.",
        errors: qualityErrors,
      });
    }
  } else {
    return res.status(422).json({
      success: false,
      message: "Quality check failed.",
      errors: ["details payload missing"],
    });
  }

  const filename =
    (context?.eventTitle || "Dinner_Party").replace(/[^a-zA-Z0-9]/g, "_") + "_Cookbook.docx";

  global.cookbookFiles[cookbookId] = {
    id: cookbookId,
    status: "pending",
    filePath: null,
    filename,
    createdAt: Date.now(),
    downloads: 0,
    error: null,
  };

  setImmediate(async () => {
    try {
      const buffer = await buildCookbook(menu, context, staffing, recipes, details);
      const filePath = path.join(COOKBOOK_STORAGE_DIR, `${cookbookId}.docx`);
      await fs.writeFile(filePath, buffer);

      global.cookbookFiles[cookbookId] = {
        ...global.cookbookFiles[cookbookId],
        status: "ready",
        filePath,
      };

      await pruneStoredCookbooks();
    } catch (err) {
      console.error("Cookbook storage error:", err);
      global.cookbookFiles[cookbookId] = {
        ...global.cookbookFiles[cookbookId],
        status: "failed",
        error: err.message || "Cookbook generation failed.",
      };
    }
  });

  res.json({
    success: true,
    status: "pending",
    cookbookId,
    downloadsRemaining: MAX_COOKBOOK_DOWNLOADS,
  });
});
 
app.post("/api/download-cookbook", async (req, res) => {
  const { code, cookbookId } = req.body || {};
  const accessResult = validateAccessCode(code);
  if (!accessResult.ok) {
    return res.status(accessResult.status).json({ error: accessResult.message });
  }

  const record = cookbookId ? global.cookbookFiles?.[cookbookId] : null;
  if (!record) {
    return res.status(404).json({ error: "Cookbook not found or expired." });
  }

  if (record.status === "pending") {
    return res.status(202).json({ status: "pending", message: "Cookbook is still compiling." });
  }

  if (record.status === "failed") {
    return res.status(500).json({ status: "failed", message: record.error || "Cookbook generation failed." });
  }

  try {
    await fs.access(record.filePath);
  } catch (err) {
    await removeCookbookFile(record);
    return res.status(404).json({ error: "Cookbook not found or expired." });
  }

  record.downloads += 1;
  const shouldDelete = record.downloads >= MAX_COOKBOOK_DOWNLOADS;

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
  res.setHeader("Content-Disposition", `attachment; filename="${record.filename || "Cookbook.docx"}"`);

  res.sendFile(record.filePath, (err) => {
    if (err) {
      console.error("DOCX send error:", err);
      return;
    }
    if (shouldDelete) {
      removeCookbookFile(record);
    }
  });
});

app.post("/api/cookbook-status", async (req, res) => {
  const { code, cookbookId } = req.body || {};
  const accessResult = validateAccessCode(code);
  if (!accessResult.ok) {
    return res.status(accessResult.status).json({ error: accessResult.message });
  }

  const record = cookbookId ? global.cookbookFiles?.[cookbookId] : null;
  if (!record) {
    return res.status(404).json({ status: "missing", message: "Cookbook not found or expired." });
  }

  if (record.status === "pending") {
    return res.json({ status: "pending" });
  }

  if (record.status === "failed") {
    return res.status(500).json({ status: "failed", message: record.error || "Cookbook generation failed." });
  }

  return res.json({
    status: "ready",
    downloadsRemaining: Math.max(0, MAX_COOKBOOK_DOWNLOADS - record.downloads),
    filename: record.filename,
  });
});
 
// ============================================================
// START SERVER
// ============================================================
 
app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Dinner Planner ${APP_VERSION} listening on port ${PORT} (${ANTHROPIC_API_KEY ? "API key set" : "API key missing"})`
  );
});