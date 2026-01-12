// ============================================================
// Cookbook storage (Postgres if DATABASE_URL is set; else memory)
// ============================================================

const DEFAULT_TABLE = "cookbooks";

let memoryStore = Object.create(null);

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

module.exports = {
  initStorage,
  saveCookbook,
  getCookbook,
  storageMode,
};

