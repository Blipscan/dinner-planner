// ============================================================
// Cookbook storage (Postgres if DATABASE_URL is set; else memory)
// ============================================================

const DEFAULT_TABLE = "cookbooks";

let memoryStore = Object.create(null);
let memoryCodeUsage = Object.create(null);

let pool = null;
let ready = false;

function hasPostgres() {
  return !!process.env.DATABASE_URL;
}

function storageMode() {
  return hasPostgres() ? "postgres" : "memory";
}

function shouldUseSsl() {
  // Railway Postgres typically requires SSL. Local dev usually doesn't.
  if (process.env.PGSSLMODE === "disable") return false;
  const url = process.env.DATABASE_URL || "";
  if (!url) return false;
  if (url.includes("localhost") || url.includes("127.0.0.1")) return false;
  return true;
}

async function initStorage() {
  if (ready) return;

  if (!hasPostgres()) {
    ready = true;
    return;
  }

  // Lazy require so pg isn't needed in environments
  // that don't set DATABASE_URL.
  // eslint-disable-next-line global-require
  const { Pool } = require("pg");

  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: shouldUseSsl() ? { rejectUnauthorized: false } : false,
  });

  const table = process.env.COOKBOOKS_TABLE || DEFAULT_TABLE;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${table} (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const usageTable = process.env.CODE_USAGE_TABLE || "access_code_usage";
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${usageTable} (
      code TEXT PRIMARY KEY,
      generations INTEGER NOT NULL DEFAULT 0,
      last_used TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  ready = true;
}

async function saveCookbook(id, data) {
  await initStorage();
  if (!hasPostgres()) {
    memoryStore[id] = data;
    return;
  }
  const table = process.env.COOKBOOKS_TABLE || DEFAULT_TABLE;
  await pool.query(
    `INSERT INTO ${table} (id, data) VALUES ($1, $2)
     ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
    [id, data]
  );
}

async function getCookbook(id) {
  await initStorage();
  if (!hasPostgres()) return memoryStore[id] || null;
  const table = process.env.COOKBOOKS_TABLE || DEFAULT_TABLE;
  const res = await pool.query(`SELECT data FROM ${table} WHERE id = $1`, [id]);
  return res?.rows?.[0]?.data || null;
}

async function getCodeUsage(code) {
  await initStorage();
  const upper = String(code || "").trim().toUpperCase();
  if (!upper) return null;

  if (!hasPostgres()) {
    const row = memoryCodeUsage[upper];
    return row ? { ...row } : { code: upper, generations: 0, lastUsed: new Date().toISOString() };
  }

  const usageTable = process.env.CODE_USAGE_TABLE || "access_code_usage";
  const res = await pool.query(`SELECT code, generations, last_used FROM ${usageTable} WHERE code = $1`, [upper]);
  if (res?.rows?.[0]) {
    return {
      code: res.rows[0].code,
      generations: Number(res.rows[0].generations || 0),
      lastUsed: res.rows[0].last_used,
    };
  }

  // Create on first sight so remaining counts stay consistent.
  await pool.query(
    `INSERT INTO ${usageTable} (code, generations) VALUES ($1, 0)
     ON CONFLICT (code) DO NOTHING`,
    [upper]
  );
  return { code: upper, generations: 0, lastUsed: new Date().toISOString() };
}

async function bumpCodeUsage(code, by = 1) {
  await initStorage();
  const upper = String(code || "").trim().toUpperCase();
  if (!upper) return null;

  const inc = Number(by || 0) || 0;
  if (inc <= 0) return getCodeUsage(upper);

  if (!hasPostgres()) {
    const current = memoryCodeUsage[upper] || { code: upper, generations: 0, lastUsed: new Date().toISOString() };
    const next = {
      code: upper,
      generations: (Number(current.generations) || 0) + inc,
      lastUsed: new Date().toISOString(),
    };
    memoryCodeUsage[upper] = next;
    return { ...next };
  }

  const usageTable = process.env.CODE_USAGE_TABLE || "access_code_usage";
  const res = await pool.query(
    `INSERT INTO ${usageTable} (code, generations, last_used)
     VALUES ($1, $2, NOW())
     ON CONFLICT (code)
     DO UPDATE SET generations = ${usageTable}.generations + EXCLUDED.generations,
                   last_used = NOW()
     RETURNING code, generations, last_used`,
    [upper, inc]
  );
  return {
    code: res.rows[0].code,
    generations: Number(res.rows[0].generations || 0),
    lastUsed: res.rows[0].last_used,
  };
}

module.exports = {
  initStorage,
  saveCookbook,
  getCookbook,
  storageMode,
  getCodeUsage,
  bumpCodeUsage,
};

