const DEFAULT_TIMEOUT_MS = 30000;
const DETAILS_TIMEOUT_MS = 300000;
const COOKBOOK_TIMEOUT_MS = 300000;

const REQUIRED_ROLES = [
  "Host",
  "Kitchen",
  "Service",
  "Bar",
  "Shopping",
  "Prep",
  "Day-Of Execution",
  "Cleanup",
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function formatError(err) {
  if (!err) return "Unknown error";
  return err.stack || err.message || String(err);
}

async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchJson(url, options, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const response = await fetchWithTimeout(url, options, timeoutMs);
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

function buildContext() {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return {
    eventTitle: "E2E Smoke Dinner",
    eventDate: date.toISOString().split("T")[0],
    eventLocation: "Test Kitchen",
    guestCount: "4",
    serviceTime: "7:00 PM",
    serviceStyle: "plated",
    foodBudget: "$45-60",
    wineBudget: "$120-180",
    skillLevel: "intermediate",
    menuStyle: "classic",
    inspiration: "chefs-tasting",
    cuisine: "any",
    subCuisine: "",
    likes: ["Seafood", "Mushrooms"],
    dislikes: [],
    restrictions: [],
    guestList: "Alex\nJamie\nTaylor\nMorgan",
  };
}

function validateDetails(details, menu) {
  assert(details, "Details missing");
  assert(details.systemIndex, "systemIndex missing");
  assert(details.systemIndex.eventName, "systemIndex.eventName missing");
  assert(details.systemIndex.eventDate, "systemIndex.eventDate missing");
  assert(details.systemIndex.location, "systemIndex.location missing");
  assert(details.systemIndex.guestCount, "systemIndex.guestCount missing");
  assert(details.systemIndex.serviceStyle, "systemIndex.serviceStyle missing");
  assert(Array.isArray(details.systemIndex.menuSummary), "systemIndex.menuSummary missing");

  assert(Array.isArray(details.coursePlan), "coursePlan missing");
  assert(details.coursePlan.length === menu.courses.length, "coursePlan length mismatch");
  assert(Array.isArray(details.masterTimeline), "masterTimeline missing");
  assert(details.masterTimeline.length >= 12, "masterTimeline too short");

  assert(Array.isArray(details.roleViews), "roleViews missing");
  const rolesPresent = new Set(details.roleViews.map((r) => r.role));
  REQUIRED_ROLES.forEach((role) => {
    assert(rolesPresent.has(role), `roleViews missing ${role}`);
  });

  assert(details.masterShoppingList?.categories?.length >= 6, "masterShoppingList incomplete");
  assert(Array.isArray(details.executionPacket), "executionPacket missing");
  assert(details.executionPacket.length === menu.courses.length, "executionPacket length mismatch");

  assert(details.equipmentConstraints, "equipmentConstraints missing");
  assert(Array.isArray(details.contingencies) && details.contingencies.length >= 2, "contingencies missing");
  assert(details.cleanupReset, "cleanupReset missing");

  assert(Array.isArray(details.recipes), "recipes missing");
  assert(details.recipes.length === menu.courses.length, "recipes length mismatch");
  assert(Array.isArray(details.wineTiers), "wineTiers missing");
  assert(details.wineTiers.length === 4, "wineTiers length mismatch");
}

async function main() {
  const baseUrl = process.env.SMOKE_BASE_URL || `http://localhost:${process.env.PORT || 3000}`;
  const accessCode =
    process.env.SMOKE_ACCESS_CODE || process.env.ADMIN_CODE || "ADMIN2024";

  console.log(`Smoke test against ${baseUrl}`);

  const health = await fetchJson(`${baseUrl}/api/health`, { method: "GET" });
  assert(health.response.ok, `Health check failed: ${health.response.status}`);
  assert(health.payload.apiConfigured === true, "ANTHROPIC_API_KEY missing");

  const codeCheck = await fetchJson(`${baseUrl}/api/validate-code`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: accessCode }),
  });
  assert(codeCheck.response.ok, "Access code validation failed");
  assert(codeCheck.payload.valid, "Access code invalid");

  const context = buildContext();
  const menusRes = await fetchJson(
    `${baseUrl}/api/generate-menus`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: accessCode, context }),
    },
    DETAILS_TIMEOUT_MS
  );
  assert(menusRes.response.ok, "Menu generation failed");
  assert(Array.isArray(menusRes.payload.menus), "Menus missing");
  assert(menusRes.payload.menus.length === 5, "Menus length mismatch");

  const menu = menusRes.payload.menus[0];
  const detailsRes = await fetchJson(
    `${baseUrl}/api/generate-details`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ menu, context }),
    },
    DETAILS_TIMEOUT_MS
  );
  assert(detailsRes.response.ok, `Details generation failed: ${detailsRes.payload.detail || detailsRes.response.status}`);

  const details = detailsRes.payload;
  validateDetails(details, menu);

  const cookbookRes = await fetchJson(
    `${baseUrl}/api/generate-cookbook`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        code: accessCode,
        menu,
        context,
        staffing: "solo",
        recipes: details.recipes,
        details,
      }),
    },
    COOKBOOK_TIMEOUT_MS
  );
  assert(cookbookRes.response.ok, `Cookbook generate failed: ${cookbookRes.payload.message || cookbookRes.response.status}`);
  assert(cookbookRes.payload.success, "Cookbook generate not successful");
  assert(cookbookRes.payload.cookbookId, "cookbookId missing");

  const cookbookId = cookbookRes.payload.cookbookId;
  const maxPolls = 30;
  for (let i = 0; i < maxPolls; i += 1) {
    const statusRes = await fetchJson(
      `${baseUrl}/api/cookbook-status`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: accessCode, cookbookId }),
      },
      DEFAULT_TIMEOUT_MS
    );
    if (statusRes.payload.status === "ready") {
      const downloadRes = await fetchWithTimeout(
        `${baseUrl}/api/download-cookbook`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: accessCode, cookbookId }),
        },
        DEFAULT_TIMEOUT_MS
      );
      assert(downloadRes.ok, `Cookbook download failed: ${downloadRes.status}`);
      const buffer = await downloadRes.arrayBuffer();
      assert(buffer.byteLength > 0, "Cookbook download empty");
      console.log("Smoke test passed.");
      return;
    }
    if (statusRes.payload.status === "failed") {
      throw new Error(statusRes.payload.message || "Cookbook generation failed.");
    }
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }

  throw new Error("Cookbook did not become ready in time.");
}

main().catch((err) => {
  console.error(`Smoke test failed: ${formatError(err)}`);
  process.exit(1);
});
