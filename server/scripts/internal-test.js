/* eslint-disable no-console */

// Internal smoke test: starts server on an ephemeral port and exercises key endpoints.

process.env.PORT = "0";
process.env.ADMIN_CODE = process.env.ADMIN_CODE || "ADMIN2024";
process.env.ACCESS_CODES = process.env.ACCESS_CODES || "BETA001,BETA002,BETA003";
process.env.MAX_GENERATIONS_PER_CODE = process.env.MAX_GENERATIONS_PER_CODE || "50";
process.env.BETA_EXPIRY = process.env.BETA_EXPIRY || "2026-03-01";
process.env.COOKBOOK_TTL_DAYS = process.env.COOKBOOK_TTL_DAYS || "30";
process.env.COOKBOOK_CLEANUP_INTERVAL_HOURS = process.env.COOKBOOK_CLEANUP_INTERVAL_HOURS || "12";

const { startServer } = require("../server");
const { DEMO_MENUS } = require("../data");
const { once } = require("node:events");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function readJson(res) {
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON, got: ${text.slice(0, 200)}`);
  }
}

async function main() {
  const server = startServer();
  if (!server.listening) await once(server, "listening");
  const addr = server.address();
  const port = addr && typeof addr === "object" ? addr.port : null;
  assert(port, "Failed to get ephemeral port");

  const base = `http://127.0.0.1:${port}`;
  const admin = process.env.ADMIN_CODE;

  const results = [];
  const ok = (name) => results.push({ name, ok: true });
  const fail = (name, err) => results.push({ name, ok: false, err: err?.message || String(err) });

  try {
    // health
    try {
      const res = await fetch(`${base}/api/health`);
      assert(res.ok, "/api/health not ok");
      const j = await readJson(res);
      assert(j.status === "ok", "health.status != ok");
      assert(j.cookbookStorage, "health.cookbookStorage missing");
      ok("GET /api/health");
    } catch (e) {
      fail("GET /api/health", e);
    }

    // data
    try {
      const res = await fetch(`${base}/api/data`);
      assert(res.ok, "/api/data not ok");
      const j = await readJson(res);
      assert(j.CUISINES && j.MENU_INSPIRATIONS && j.MENU_STYLES, "data missing keys");
      ok("GET /api/data");
    } catch (e) {
      fail("GET /api/data", e);
    }

    // validate code: invalid
    try {
      const res = await fetch(`${base}/api/validate-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "NOPE" }),
      });
      assert(res.ok, "validate-code request failed");
      const j = await readJson(res);
      assert(j.valid === false, "invalid code should be rejected");
      ok("POST /api/validate-code (invalid)");
    } catch (e) {
      fail("POST /api/validate-code (invalid)", e);
    }

    // validate code: admin
    try {
      const res = await fetch(`${base}/api/validate-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: admin }),
      });
      const j = await readJson(res);
      assert(j.valid === true && j.isAdmin === true, "admin code should be accepted");
      ok("POST /api/validate-code (admin)");
    } catch (e) {
      fail("POST /api/validate-code (admin)", e);
    }

    // validate code: beta
    try {
      const res = await fetch(`${base}/api/validate-code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: "BETA001" }),
      });
      const j = await readJson(res);
      assert(j.valid === true, "beta code should be accepted");
      ok("POST /api/validate-code (beta)");
    } catch (e) {
      fail("POST /api/validate-code (beta)", e);
    }

    // generate cookbook -> html -> docx
    let cookbookId = null;
    try {
      const res = await fetch(`${base}/api/generate-cookbook`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: "BETA001",
          menu: DEMO_MENUS[0],
          context: {
            eventTitle: "Internal Test",
            eventDate: "2026-01-12",
            guestCount: 6,
            guestList: "Alice\nBob\nCara\nDan\nEve\nFrank",
            serviceTime: "7:00 PM",
            foodBudget: "$45-60",
            wineBudget: "$80-120",
            skillLevel: "intermediate",
            inspiration: "chefs-tasting",
            cuisine: "any",
            likes: [],
            dislikes: [],
            restrictions: [],
          },
          staffing: "solo",
        }),
      });
      assert(res.ok, "generate-cookbook not ok");
      const j = await readJson(res);
      assert(j.success === true && j.cookbookId, "generate-cookbook missing id");
      cookbookId = j.cookbookId;
      ok("POST /api/generate-cookbook");
    } catch (e) {
      fail("POST /api/generate-cookbook", e);
    }

    if (cookbookId) {
      try {
        const res = await fetch(`${base}/cookbook/${cookbookId}`);
        assert(res.ok, "cookbook html not ok");
        const html = await res.text();
        assert(html.includes("Recipes"), "cookbook html missing Recipes");
        ok("GET /cookbook/:id");
      } catch (e) {
        fail("GET /cookbook/:id", e);
      }

      try {
        const res = await fetch(`${base}/api/download-cookbook`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: "BETA001", cookbookId }),
        });
        assert(res.ok, "download-cookbook not ok");
        const ct = res.headers.get("content-type") || "";
        assert(ct.includes("application/vnd.openxmlformats-officedocument.wordprocessingml.document"), "docx content-type missing");
        const buf = Buffer.from(await res.arrayBuffer());
        assert(buf.length > 1000, "docx too small");
        ok("POST /api/download-cookbook");
      } catch (e) {
        fail("POST /api/download-cookbook", e);
      }

      try {
        const res = await fetch(`${base}/api/print-product`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cookbookId, type: "placeCards", sku: "5302" }),
        });
        assert(res.ok, "print-product not ok");
        const ct = res.headers.get("content-type") || "";
        assert(ct.includes("application/pdf"), "pdf content-type missing");
        const buf = Buffer.from(await res.arrayBuffer());
        assert(buf.length > 500, "pdf too small");
        ok("POST /api/print-product");
      } catch (e) {
        fail("POST /api/print-product", e);
      }
    }

    // admin endpoints
    try {
      const res = await fetch(`${base}/api/admin/code-usage`);
      assert(res.status === 401, "admin endpoint should 401 without code");
      ok("GET /api/admin/code-usage (unauthorized)");
    } catch (e) {
      fail("GET /api/admin/code-usage (unauthorized)", e);
    }

    try {
      const res = await fetch(`${base}/api/admin/code-usage`, {
        headers: { "x-admin-code": admin },
      });
      assert(res.ok, "admin code-usage not ok");
      const j = await readJson(res);
      assert(Array.isArray(j.usage), "admin usage not array");
      ok("GET /api/admin/code-usage (authorized)");
    } catch (e) {
      fail("GET /api/admin/code-usage (authorized)", e);
    }

    try {
      const res = await fetch(`${base}/api/admin/cleanup-cookbooks`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-code": admin },
        body: JSON.stringify({ ttlDays: 1 }),
      });
      assert(res.ok, "admin cleanup not ok");
      const j = await readJson(res);
      assert(typeof j.deleted === "number", "cleanup response missing deleted");
      ok("POST /api/admin/cleanup-cookbooks");
    } catch (e) {
      fail("POST /api/admin/cleanup-cookbooks", e);
    }

  } finally {
    await new Promise((r) => server.close(r));
  }

  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    console.log(r.ok ? `PASS ${r.name}` : `FAIL ${r.name}: ${r.err}`);
  }
  if (failed.length) process.exitCode = 1;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

