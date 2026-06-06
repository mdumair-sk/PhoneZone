/**
 * init.js — Run once at app startup to ensure the schema exists.
 * Fetches schema.sql relative to this file and sends it to the main
 * process via window.api.db.init().
 */
export async function initDatabase() {
  let sql;

  try {
    // In dev (Vite dev server) and prod (file:// with base './'), the
    // schema sits alongside this module's directory.
    const res = await fetch(new URL('./schema.sql', import.meta.url));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    sql = await res.text();
  } catch (err) {
    console.error('[Phone Zone] Failed to load schema.sql:', err);
    throw err;
  }

  const result = await window.api.db.init(sql);

  if (!result.ok) {
    console.error('[Phone Zone] Schema init failed:', result.error);
    throw new Error(result.error);
  }

  console.log('[Phone Zone] Database schema initialised.');

  // Migrate older databases to include invoice_type
  try {
    await window.api.db.run(`ALTER TABLE sales ADD COLUMN invoice_type TEXT CHECK(invoice_type IN ('Tax Invoice', 'Estimate')) DEFAULT 'Tax Invoice'`);
  } catch (err) {
    // Column may already exist, ignore error
  }

  // Seed default settings if not already present
  const defaults = [
    ['shop_name', ''],
    ['shop_address', ''],
    ['shop_gstin', ''],
    ['default_gst_rate', '18.0'],
    ['app_theme', 'dark'],
    // SHA-256 of 'admin123'
    ['master_password', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9'],
  ];

  for (const [key, value] of defaults) {
    await window.api.db.run(
      `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`,
      [key, value]
    );
  }
}
