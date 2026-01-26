// ============================================================
// DINNER PARTY PLANNER - CADILLAC EDITION
// ============================================================
 
const express = require("express");
const path = require("path");
const os = require("os");
const fs = require("fs/promises");
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} = require("@aws-sdk/client-s3");
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
const COOKBOOK_BUCKET = process.env.COOKBOOK_S3_BUCKET || "";
const COOKBOOK_REGION = process.env.COOKBOOK_S3_REGION || process.env.AWS_REGION || "";
const COOKBOOK_PREFIX = process.env.COOKBOOK_S3_PREFIX || "cookbooks";
const DETAILS_PREFIX = process.env.DETAILS_S3_PREFIX || "details";
const STORAGE_MODE = COOKBOOK_BUCKET && COOKBOOK_REGION ? "s3" : "disk";
const s3Client = STORAGE_MODE === "s3" ? new S3Client({ region: COOKBOOK_REGION }) : null;
const DEFAULT_TIMEOUTS_MS = {
  chat: 15000,
  menus: 45000,
  details: 600000,
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

const REQUIRED_ROLES = ["Host", "Kitchen", "Service", "Bar", "Shopping", "Prep", "Day-Of Execution", "Cleanup"];
 
async function ensureCookbookStorageDir() {
  try {
    await fs.mkdir(COOKBOOK_STORAGE_DIR, { recursive: true });
  } catch (err) {
    console.error("Failed to create cookbook storage directory:", err);
  }
}

if (STORAGE_MODE === "disk") {
  ensureCookbookStorageDir();
}

function getCookbookKeys(id) {
  return {
    manifestKey: `${COOKBOOK_PREFIX}/${id}/manifest.json`,
    docKey: `${COOKBOOK_PREFIX}/${id}/cookbook.docx`,
    detailsKey: `${COOKBOOK_PREFIX}/${id}/details.json`,
  };
}

function getDetailsKey(id) {
  return `${DETAILS_PREFIX}/${id}.json`;
}

async function storagePut(key, body, contentType) {
  if (STORAGE_MODE === "s3") {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: COOKBOOK_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    );
    return;
  }
  const filePath = path.join(COOKBOOK_STORAGE_DIR, key);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, body);
}

async function storageGet(key) {
  if (STORAGE_MODE === "s3") {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: COOKBOOK_BUCKET,
        Key: key,
      })
    );
    const chunks = [];
    for await (const chunk of response.Body) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
  const filePath = path.join(COOKBOOK_STORAGE_DIR, key);
  return fs.readFile(filePath);
}

async function storageExists(key) {
  if (STORAGE_MODE === "s3") {
    try {
      await s3Client.send(
        new HeadObjectCommand({
          Bucket: COOKBOOK_BUCKET,
          Key: key,
        })
      );
      return true;
    } catch (err) {
      return false;
    }
  }
  try {
    await fs.access(path.join(COOKBOOK_STORAGE_DIR, key));
    return true;
  } catch (err) {
    return false;
  }
}

async function storageDelete(key) {
  if (STORAGE_MODE === "s3") {
    try {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: COOKBOOK_BUCKET,
          Key: key,
        })
      );
    } catch (err) {
      // ignore
    }
    return;
  }
  try {
    await fs.unlink(path.join(COOKBOOK_STORAGE_DIR, key));
  } catch (err) {
    // ignore
  }
}

async function writeManifest(id, manifest) {
  const { manifestKey } = getCookbookKeys(id);
  await storagePut(manifestKey, JSON.stringify(manifest, null, 2), "application/json");
}

async function readManifest(id) {
  const { manifestKey } = getCookbookKeys(id);
  if (!(await storageExists(manifestKey))) {
    return null;
  }
  const buffer = await storageGet(manifestKey);
  return JSON.parse(buffer.toString("utf8"));
}

async function writeDetails(id, details) {
  const key = getDetailsKey(id);
  await storagePut(key, JSON.stringify(details, null, 2), "application/json");
}

async function readDetails(id) {
  const key = getDetailsKey(id);
  if (!(await storageExists(key))) {
    return null;
  }
  const buffer = await storageGet(key);
  return JSON.parse(buffer.toString("utf8"));
}

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

async function getCookbookRecord(id) {
  if (!id) {
    return null;
  }
  if (global.cookbookFiles?.[id]) {
    return global.cookbookFiles[id];
  }
  const manifest = await readManifest(id);
  if (!manifest) {
    return null;
  }
  global.cookbookFiles[id] = manifest;
  return manifest;
}

async function pruneStoredCookbooks() {
  if (STORAGE_MODE === "s3") {
    try {
      const listResponse = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: COOKBOOK_BUCKET,
          Prefix: `${COOKBOOK_PREFIX}/`,
        })
      );
      const manifestObjects = (listResponse.Contents || []).filter((obj) => obj.Key.endsWith("manifest.json"));
      if (manifestObjects.length <= MAX_COOKBOOK_FILES) {
        return;
      }
      const sorted = manifestObjects.sort((a, b) => new Date(a.LastModified) - new Date(b.LastModified));
      const toRemove = sorted.slice(0, Math.max(0, sorted.length - MAX_COOKBOOK_FILES));
      for (const manifest of toRemove) {
        const match = manifest.Key.match(/cookbooks\/([^/]+)\//);
        if (!match) continue;
        const id = match[1];
        const keys = getCookbookKeys(id);
        await storageDelete(keys.manifestKey);
        await storageDelete(keys.docKey);
        await storageDelete(keys.detailsKey);
        delete global.cookbookFiles[id];
      }
    } catch (err) {
      console.error("Failed to prune S3 cookbooks:", err);
    }
    return;
  }

  const entries = Object.values(global.cookbookFiles || {}).filter((record) => record?.status === "ready");
  if (entries.length <= MAX_COOKBOOK_FILES) {
    return;
  }

  const sorted = entries.sort((a, b) => a.createdAt - b.createdAt);
  const toRemove = sorted.slice(0, Math.max(0, sorted.length - MAX_COOKBOOK_FILES));

  for (const record of toRemove) {
    if (record?.docKey) {
      await storageDelete(record.docKey);
    }
    if (record?.manifestKey) {
      await storageDelete(record.manifestKey);
    }
    delete global.cookbookFiles[record.id];
  }
}

async function removeCookbookFile(record) {
  if (!record) {
    return;
  }
  if (record.id) {
    const keys = getCookbookKeys(record.id);
    await storageDelete(keys.docKey);
    await storageDelete(keys.manifestKey);
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
  REQUIRED_ROLES.forEach((role) => {
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

function buildFallbackRoleView(role, menu, context) {
  const courseTypes = (menu?.courses || []).map((course) => course.type);
  const serviceTime = context?.serviceTime || "Service Start";

  const courseTasks = courseTypes.map((courseType) => {
    const tasksByRole = {
      Host: [
        `Announce ${courseType} and confirm guests are ready`,
        `Check pacing after ${courseType} and cue next course`,
        `Confirm dietary needs before ${courseType} is served`,
      ],
      Kitchen: [
        `Stage components for ${courseType}`,
        `Cook/finish ${courseType} course`,
        `Plate ${courseType} for service`,
      ],
      Service: [
        `Serve ${courseType} within 5 minutes of call`,
        `Clear ${courseType} once 80% finished`,
        `Reset cutlery and glassware after ${courseType}`,
      ],
      Bar: [
        `Pour pairing for ${courseType}`,
        `Refresh water before ${courseType}`,
        `Reset wine glasses after ${courseType}`,
      ],
      Shopping: [
        `Confirm all ingredients for ${courseType} are on hand`,
        `Purchase missing items for ${courseType}`,
        `Verify specialty items for ${courseType}`,
      ],
      Prep: [
        `Prep garnishes for ${courseType}`,
        `Portion components for ${courseType}`,
        `Label containers for ${courseType}`,
      ],
      "Day-Of Execution": [
        `Call fire time for ${courseType}`,
        `Confirm pass readiness for ${courseType}`,
        `Coordinate handoff for ${courseType}`,
      ],
      Cleanup: [
        `Collect plates and utensils from ${courseType}`,
        `Run dishwasher load after ${courseType}`,
        `Wipe surfaces after ${courseType}`,
      ],
    };
    return {
      courseType,
      tasks: tasksByRole[role] || [`Execute ${courseType} tasks`, `Support ${courseType} service`, `Reset after ${courseType}`],
    };
  });

  const setupByRole = {
    Host: ["Confirm guest count and seating plan", "Set lighting and music levels", "Review master timeline"],
    Kitchen: ["Stage ingredients by course", "Preheat ovens and warm plates", "Label containers and stations"],
    Service: ["Set pass and serving trays", "Polish glassware and flatware", "Stage water and wine service"],
    Bar: ["Chill whites and sparkling", "Prep welcome drinks", "Set wine service tools"],
    Shopping: ["Purchase all ingredients", "Pick up wines and specialty items", "Verify quantities and units"],
    Prep: ["Wash and prep produce", "Portion proteins and components", "Prepare stocks and sauces"],
    "Day-Of Execution": ["Review course order and cues", "Confirm station readiness", "Set communication plan"],
    Cleanup: ["Set soak station and bins", "Lay out storage containers", "Stage towels and sanitizers"],
  };

  const transitions = [
    "Clear previous course",
    "Reset cutlery and glassware",
    "Confirm next course timing",
  ];

  const endOfNight = {
    Host: ["Thank guests and close service", "Confirm leftovers plan", "Log notes for reuse"],
    Kitchen: ["Label leftovers and cool safely", "Break down stations", "Clean key equipment"],
    Service: ["Clear dining area", "Polish and store serviceware", "Reset tables"],
    Bar: ["Seal open bottles", "Store glassware", "Dispose of ice and garnishes"],
    Shopping: ["Store receipts and notes", "Log missing items", "Check pantry inventory"],
    Prep: ["Discard prep waste", "Store remaining prepped items", "Clean prep surfaces"],
    "Day-Of Execution": ["Confirm completion of all courses", "Close out timeline", "Assist cleanup as needed"],
    Cleanup: ["Run final dishwasher cycle", "Wipe counters and floors", "Empty trash and recycling"],
  };

  return {
    role,
    startTime: role === "Shopping" ? "T-48h" : "T-3h",
    endTime: role === "Cleanup" ? "T+2h" : serviceTime,
    reportsTo: "Host",
    setup: setupByRole[role] || ["Review tasks", "Stage supplies", "Confirm timing"],
    courseTasks,
    transitions,
    endOfNight: endOfNight[role] || ["Close out tasks", "Clean area", "Store equipment"],
  };
}

function applyFallbackRoleViews(details, menu, context, roles) {
  const roleViews = Array.isArray(details.roleViews) ? details.roleViews : [];
  const fallbackViews = roles.map((role) => buildFallbackRoleView(role, menu, context));
  details.roleViews = mergeRoleViews(roleViews, fallbackViews);
}

function getRoleFixTargets(errors) {
  const roles = new Set();
  errors.forEach((err) => {
    const missingMatch = err.match(/^roleViews missing (.+)$/);
    if (missingMatch) {
      roles.add(missingMatch[1]);
      return;
    }
    const roleDetailMatch = err.match(/^roleViews\.([^\.]+)\./);
    if (roleDetailMatch) {
      roles.add(roleDetailMatch[1]);
    }
  });

  if (errors.some((err) => err.includes("roleViews missing roles")) && roles.size === 0) {
    REQUIRED_ROLES.forEach((role) => roles.add(role));
  }

  return Array.from(roles);
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

        if (missingRoles.length >= REQUIRED_ROLES.length) {
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
            const currentViews = operationalDetails?.roleViews || [];
            operationalDetails = mergeDetails(operationalDetails, {
              roleViews: mergeRoleViews(currentViews, patchViews),
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

    const postFixErrors = validateDetails(details, menu);
    if (postFixErrors.length) {
      const rolesToFix = getRoleFixTargets(postFixErrors);
      if (rolesToFix.length) {
        applyFallbackRoleViews(details, menu, context, rolesToFix);
      }
    }

    const finalErrors = validateDetails(details, menu);
    if (finalErrors.length) {
      throw new Error(`Details incomplete: ${finalErrors.join("; ")}`);
    }

    const detailsId = details.detailsId || Date.now().toString(36) + Math.random().toString(36).slice(2);
    details.detailsId = detailsId;
    try {
      await writeDetails(detailsId, details);
    } catch (err) {
      console.error("Failed to persist details:", err);
      throw new Error("Details storage failed.");
    }

    res.json(details);
  } catch (err) {
    console.error("Details generation error:", err);
    return res.status(502).json({ error: "Details generation failed.", detail: err.message });
  }
});

// Generate cookbook (creates an id, then /api/download-cookbook downloads DOCX)
app.post("/api/generate-cookbook", async (req, res) => {
  const { code, menu, context, staffing, recipes, details, detailsId: requestDetailsId } = req.body || {};
  const accessResult = validateAccessCode(code);
  if (!accessResult.ok) {
    return res.status(accessResult.status).json({ success: false, message: accessResult.message });
  }

  const cookbookId = Date.now().toString(36) + Math.random().toString(36).slice(2);
  let detailsPayload = details || null;
  let detailsId = requestDetailsId || details?.detailsId || null;

  if (!detailsPayload && detailsId) {
    detailsPayload = await readDetails(detailsId);
    if (!detailsPayload) {
      return res.status(404).json({ success: false, message: "Details not found for cookbook." });
    }
  }

  if (detailsPayload) {
    const qualityErrors = runCookbookQualityCheck(detailsPayload, menu);
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

  if (!detailsId) {
    detailsId = Date.now().toString(36) + Math.random().toString(36).slice(2);
    detailsPayload.detailsId = detailsId;
    try {
      await writeDetails(detailsId, detailsPayload);
    } catch (err) {
      console.error("Failed to persist details:", err);
      return res.status(500).json({ success: false, message: "Failed to store details." });
    }
  }

  const filename =
    (context?.eventTitle || "Dinner_Party").replace(/[^a-zA-Z0-9]/g, "_") + "_Cookbook.docx";
  const keys = getCookbookKeys(cookbookId);

  const manifest = {
    id: cookbookId,
    status: "pending",
    filename,
    createdAt: Date.now(),
    downloads: 0,
    error: null,
    detailsId,
    docKey: keys.docKey,
    manifestKey: keys.manifestKey,
  };
  global.cookbookFiles[cookbookId] = manifest;
  await writeManifest(cookbookId, manifest);

  setImmediate(async () => {
    try {
      const buffer = await buildCookbook(menu, context, staffing, recipes, detailsPayload);
      await storagePut(keys.docKey, buffer, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

      global.cookbookFiles[cookbookId] = {
        ...global.cookbookFiles[cookbookId],
        status: "ready",
      };
      await writeManifest(cookbookId, global.cookbookFiles[cookbookId]);

      await pruneStoredCookbooks();
    } catch (err) {
      console.error("Cookbook storage error:", err);
      global.cookbookFiles[cookbookId] = {
        ...global.cookbookFiles[cookbookId],
        status: "failed",
        error: err.message || "Cookbook generation failed.",
      };
      await writeManifest(cookbookId, global.cookbookFiles[cookbookId]);
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

  const record = await getCookbookRecord(cookbookId);
  if (!record) {
    return res.status(404).json({ error: "Cookbook not found or expired." });
  }

  if (record.status === "pending") {
    return res.status(202).json({ status: "pending", message: "Cookbook is still compiling." });
  }

  if (record.status === "failed") {
    return res.status(500).json({ status: "failed", message: record.error || "Cookbook generation failed." });
  }

  const exists = await storageExists(record.docKey);
  if (!exists) {
    await removeCookbookFile(record);
    return res.status(404).json({ error: "Cookbook not found or expired." });
  }

  record.downloads += 1;
  const shouldDelete = record.downloads >= MAX_COOKBOOK_DOWNLOADS;
  await writeManifest(record.id, record);

  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
  );
  res.setHeader("Content-Disposition", `attachment; filename="${record.filename || "Cookbook.docx"}"`);
  try {
    const buffer = await storageGet(record.docKey);
    res.send(buffer);
    if (shouldDelete) {
      removeCookbookFile(record);
    }
  } catch (err) {
    console.error("DOCX send error:", err);
    return res.status(500).json({ error: "Error sending cookbook." });
  }
});

app.post("/api/cookbook-status", async (req, res) => {
  const { code, cookbookId } = req.body || {};
  const accessResult = validateAccessCode(code);
  if (!accessResult.ok) {
    return res.status(accessResult.status).json({ error: accessResult.message });
  }

  const record = await getCookbookRecord(cookbookId);
  if (!record) {
    return res.status(404).json({ status: "missing", message: "Cookbook not found or expired." });
  }

  if (record.status === "pending") {
    return res.json({ status: "pending", detailsId: record.detailsId || null });
  }

  if (record.status === "failed") {
    return res
      .status(500)
      .json({ status: "failed", message: record.error || "Cookbook generation failed.", detailsId: record.detailsId || null });
  }

  return res.json({
    status: "ready",
    downloadsRemaining: Math.max(0, MAX_COOKBOOK_DOWNLOADS - record.downloads),
    filename: record.filename,
    detailsId: record.detailsId || null,
  });
});

app.post("/api/cookbook-details", async (req, res) => {
  const { code, cookbookId, detailsId } = req.body || {};
  const accessResult = validateAccessCode(code);
  if (!accessResult.ok) {
    return res.status(accessResult.status).json({ error: accessResult.message });
  }

  let resolvedDetailsId = detailsId;
  if (!resolvedDetailsId && cookbookId) {
    const record = await getCookbookRecord(cookbookId);
    if (record?.detailsId) {
      resolvedDetailsId = record.detailsId;
    }
  }

  if (!resolvedDetailsId) {
    return res.status(404).json({ error: "Details not found." });
  }

  const details = await readDetails(resolvedDetailsId);
  if (!details) {
    return res.status(404).json({ error: "Details not found." });
  }

  res.json({ detailsId: resolvedDetailsId, details });
});
 
// ============================================================
// START SERVER
// ============================================================
 
app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Dinner Planner ${APP_VERSION} listening on port ${PORT} (${ANTHROPIC_API_KEY ? "API key set" : "API key missing"})`
  );
});