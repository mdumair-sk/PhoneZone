import { icons } from '../utils/icons.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function toLocalSqlDateTime(dateStr) {
  if (!dateStr) return null;
  if (typeof dateStr === 'string' && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const pad2 = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

async function loadSettings() {
  const res = await window.api.db.query(`SELECT key, value FROM settings`);
  if (!res.ok) return {};
  return Object.fromEntries(res.rows.map(r => [r.key, r.value]));
}

async function saveSetting(key, value) {
  await window.api.db.run(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}

async function sha256hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function openModal(html, onMount) {
  const backdrop = document.createElement('div');
  backdrop.className = 'fh-modal-backdrop';
  backdrop.innerHTML = `<div class="fh-modal">${html}</div>`;
  document.body.appendChild(backdrop);
  // Backdrop click does NOT dismiss — anti-data-loss
  window.setupCustomSelects(backdrop);
  if (onMount) onMount(backdrop);
  return backdrop;
}

// ── Section renderers ─────────────────────────────────────────────────────────

function sectionShopInfo(s) {
  return `
    <div class="fh-card">
      <div class="fh-card-title" style="display: flex; align-items: center; gap: 8px;">
        ${icons.store(14)} Shop Information
      </div>

      <div class="fh-field">
        <label class="fh-label" for="shop_name">Shop Name</label>
        <input id="shop_name" class="fh-input" type="text"
          placeholder="e.g. Phone Zone"
          value="${esc(s.shop_name || '')}"
          data-key="shop_name" />
      </div>

      <div class="fh-field">
        <label class="fh-label" for="shop_address">Address</label>
        <textarea id="shop_address" class="fh-input" rows="3"
          placeholder="Full shop address…"
          data-key="shop_address"
          style="resize:vertical;">${esc(s.shop_address || '')}</textarea>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
        <div class="fh-field">
          <label class="fh-label" for="shop_email">Email ID</label>
          <input id="shop_email" class="fh-input" type="email"
            placeholder="e.g. shop@phonezone.in"
            value="${esc(s.shop_email || '')}"
            data-key="shop_email" />
        </div>
        <div class="fh-field">
          <label class="fh-label" for="shop_phone">Phone Number</label>
          <input id="shop_phone" class="fh-input" type="text"
            placeholder="e.g. 9876543210"
            value="${esc(s.shop_phone || '')}"
            data-key="shop_phone" />
        </div>
      </div>

      <div class="fh-field" style="margin-bottom:0;">
        <label class="fh-label" for="shop_gstin">GSTIN</label>
        <input id="shop_gstin" class="fh-input" type="text"
          placeholder="e.g. 27AABCU9603R1ZX"
          value="${esc(s.shop_gstin || '')}"
          data-key="shop_gstin"
          style="font-variant-numeric:tabular-nums;letter-spacing:0.06em;" />
      </div>
    </div>`;
}

function sectionTax(s) {
  return `
    <div class="fh-card">
      <div class="fh-card-title" style="display: flex; align-items: center; gap: 8px;">
        ${icons.percent(14)} Tax Configuration
      </div>
      <div class="fh-field" style="margin-bottom:0;">
        <label class="fh-label" for="default_gst_rate">Default GST Rate (%)</label>
        <div style="display:flex;align-items:center;gap:12px;">
          <input id="default_gst_rate" class="fh-input" type="number"
            min="0" max="100" step="0.5"
            value="${esc(s.default_gst_rate || '18')}"
            data-key="default_gst_rate"
            style="max-width:140px;" />
          <span style="font-size:11px;opacity:0.35;letter-spacing:0.06em;">
            CGST + SGST split equally
          </span>
        </div>
      </div>
    </div>`;
}

function sectionBank(s) {
  return `
    <div class="fh-card">
      <div class="fh-card-title" style="display: flex; align-items: center; gap: 8px;">
        ${icons.bank(14)} Bank Configuration
      </div>
      <div class="fh-field">
        <label class="fh-label" for="bank_name">Bank Name</label>
        <input id="bank_name" class="fh-input" type="text"
          placeholder="e.g. HDFC BANK"
          value="${esc(s.bank_name || '')}"
          data-key="bank_name" />
      </div>
      <div class="fh-field">
        <label class="fh-label" for="bank_acc_name">Account Name</label>
        <input id="bank_acc_name" class="fh-input" type="text"
          placeholder="e.g. PHONE ZONE"
          value="${esc(s.bank_acc_name || '')}"
          data-key="bank_acc_name" />
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
        <div class="fh-field">
          <label class="fh-label" for="bank_acc_no">Account Number</label>
          <input id="bank_acc_no" class="fh-input" type="text"
            placeholder="e.g. 50200076937705"
            value="${esc(s.bank_acc_no || '')}"
            data-key="bank_acc_no"
            style="font-variant-numeric:tabular-nums;letter-spacing:0.04em;" />
        </div>
        <div class="fh-field">
          <label class="fh-label" for="bank_ifsc">IFSC Code</label>
          <input id="bank_ifsc" class="fh-input" type="text"
            placeholder="e.g. HDFC0008059"
            value="${esc(s.bank_ifsc || '')}"
            data-key="bank_ifsc"
            style="letter-spacing:0.04em;" />
        </div>
      </div>
      <div class="fh-field" style="margin-bottom:0;">
        <label class="fh-label" for="bank_branch">Branch</label>
        <input id="bank_branch" class="fh-input" type="text"
          placeholder="e.g. Jaripatka Nagpur"
          value="${esc(s.bank_branch || '')}"
          data-key="bank_branch" />
      </div>
    </div>`;
}

function sectionTheme(s) {
  const current = s.app_theme || 'dark';
  
  // Extract custom themes
  const customThemes = [];
  for (const [k, v] of Object.entries(s)) {
    if (k.startsWith('custom_theme_')) {
      try { customThemes.push(JSON.parse(v)); } catch(e){}
    }
  }

  // Combine with built-in
  const allThemes = [
    { id: 'dark', ...window.THEMES.dark },
    { id: 'light', ...window.THEMES.light },
    { id: 'cyberpunk', ...window.THEMES.cyberpunk },
    { id: 'nord', ...window.THEMES.nord },
    { id: 'mocha', ...window.THEMES.mocha },
    ...customThemes
  ];

  const cardsHtml = allThemes.map(t => {
    const active = current === t.id;
    const v = t.vars;
    return `
      <div class="theme-card ${active ? 'theme-card--active' : ''}" data-val="${t.id}"
        style="
          border: 2px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'};
          border-radius: 8px;
          padding: 12px;
          cursor: pointer;
          background: var(--color-surface);
          position: relative;
          min-width: 140px;
          flex: 1;
        ">
        ${active ? `<div style="position:absolute;top:8px;right:8px;color:var(--color-primary);font-size:14px;">✓</div>` : ''}
        <div style="font-weight:600;margin-bottom:8px;font-size:13px;">${esc(t.label)}</div>
        <div style="display:flex;gap:4px;margin-bottom:8px;">
          ${[v.bg, v.surface, v.border, v.primary, v.text].map(c => `
            <div style="width:16px;height:16px;border-radius:50%;background:${c};border:1px solid rgba(128,128,128,0.3);"></div>
          `).join('')}
        </div>
        <div style="font-size:11px;opacity:0.6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
          ${esc(t.fonts.body)}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="fh-card">
      <div class="fh-card-title" style="display: flex; align-items: center; gap: 8px;">
        ${icons.palette(14)} Theme
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:12px;margin-bottom:16px;">
        ${cardsHtml}
      </div>
      <button class="fh-btn fh-btn-ghost" id="btn-import-theme" style="width:100%;justify-content:center;border-style:dashed;display:flex;align-items:center;gap:8px;">
        ${icons.plus(14)} Import Custom Theme
      </button>
    </div>`;
}

function sectionSecurity() {
  return `
    <div class="fh-card">
      <div class="fh-card-title" style="display: flex; align-items: center; gap: 8px;">
        ${icons.lock(14)} Security
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
        <div>
          <div style="font-size:13px;margin-bottom:4px;">Master Password</div>
          <div style="font-size:11px;opacity:0.4;letter-spacing:0.04em;">
            Required to authorize destructive operations. Stored as SHA-256.
          </div>
        </div>
        <button class="fh-btn fh-btn-ghost" id="btn-change-pw" style="display:flex;align-items:center;gap:8px;">
          ${icons.lock(14)} Set / Change Password
        </button>
      </div>
    </div>`;
}

function sectionData() {
  return `
    <div class="fh-card">
      <div class="fh-card-title" style="display: flex; align-items: center; gap: 8px;">
        ${icons.database(14)} Data Maintenance
      </div>
      <div style="display:flex;flex-direction:column;gap:16px;">

        <!-- Backup -->
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding-bottom:16px;border-bottom:1px solid var(--color-border);">
          <div>
            <div style="font-size:13px;margin-bottom:3px;">JSON Backup</div>
            <div style="font-size:11px;opacity:0.4;">Full export or import of all tables as a JSON file.</div>
          </div>
          <div style="display:flex;gap:12px;">
            <button class="fh-btn fh-btn-ghost" id="btn-import-backup" style="border-color:#F59E0B;color:#F59E0B;display:flex;align-items:center;gap:8px;">
              ${icons.upload(14)} Import Backup
            </button>
            <button class="fh-btn fh-btn-primary" id="btn-backup" style="display:flex;align-items:center;gap:8px;">
              ${icons.download(14)} Download Backup
            </button>
          </div>
        </div>
        <input id="import-file-input" type="file" accept=".json" style="display:none;" />

        <!-- Clear sales -->
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;padding-bottom:16px;border-bottom:1px solid var(--color-border);">
          <div>
            <div style="font-size:13px;margin-bottom:3px;">Clear All Sales Data</div>
            <div style="font-size:11px;opacity:0.4;">Deletes all invoices and line items. Inventory untouched.</div>
          </div>
          <button class="fh-btn fh-btn-warn" id="btn-clear-sales" style="display:flex;align-items:center;gap:8px;">
            ${icons.trash(14)} Clear Sales
          </button>
        </div>

        <!-- Factory reset -->
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px;">
          <div>
            <div style="font-size:13px;margin-bottom:3px;">Factory Reset</div>
            <div style="font-size:11px;opacity:0.4;">Wipes <em>all</em> data from every table. Cannot be undone.</div>
          </div>
          <button class="fh-btn fh-btn-danger" id="btn-factory-reset" style="display:flex;align-items:center;gap:8px;">
            ${icons.alert(14)} Factory Reset
          </button>
        </div>

      </div>
    </div>`;
}

// ── Escape helper ─────────────────────────────────────────────────────────────
function esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Event wiring ──────────────────────────────────────────────────────────────

function wireBlurSave(container) {
  // Explicit save model: settings are NOT auto-saved on blur.
  // The "Save System Settings" button handles persistence.
}

function wireThemeChips(container) {
  container.querySelectorAll('.theme-card').forEach(card => {
    card.addEventListener('click', async () => {
      const val = card.dataset.val;
      await window.applyTheme(val);
      window.__showScreen('settings');
    });
  });

  const importBtn = container.querySelector('#btn-import-theme');
  if (importBtn) {
    importBtn.addEventListener('click', () => {
      const m = openModal(`
        <div class="fh-card-title" style="display: flex; align-items: center; gap: 8px; margin-bottom:16px;">
          ${icons.plus(14)} Import Custom Theme
        </div>
        <div style="margin-bottom:12px;font-size:12px;opacity:0.7;">Paste theme JSON below:</div>
        <textarea id="custom-theme-json" class="fh-input" rows="11" style="font-family:monospace;font-size:11px;" placeholder='{
  "id": "mytheme",
  "label": "My Theme",
  "fonts": { "body": "Inter", "mono": "Fira Code", "heading": "Inter" },
  "vars": {
    "bg": "#111111",
    "surface": "#222222",
    "border": "#333333",
    "text": "#eeeeee",
    "primary": "#ff0000",
    "success": "#00ffb2",
    "danger": "#ff4444",
    "warning": "#ff8c00"
  }
}'></textarea>
        <div id="theme-err" style="color:#FF4444;font-size:11px;min-height:16px;margin-top:8px;"></div>
        <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;">
          <button class="fh-btn fh-btn-ghost" id="theme-cancel">Cancel</button>
          <button class="fh-btn fh-btn-primary" id="theme-save">Save & Apply</button>
        </div>
      `, (m) => {
        m.querySelector('#theme-cancel').addEventListener('click', () => m.remove());
        m.querySelector('#theme-save').addEventListener('click', async () => {
          const err = m.querySelector('#theme-err');
          const val = m.querySelector('#custom-theme-json').value.trim();
          if (!val) { err.textContent = 'JSON cannot be empty'; return; }
          try {
            const parsed = JSON.parse(val);
            if (!parsed.id || !parsed.label || !parsed.vars || !parsed.vars.bg || !parsed.vars.surface || !parsed.vars.border || !parsed.vars.text || !parsed.vars.primary || !parsed.fonts || !parsed.fonts.body || !parsed.fonts.mono || !parsed.fonts.heading) {
              err.textContent = 'Invalid JSON structure (missing id, label, fonts, or vars)';
              return;
            }
            await window.api.db.run(`INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, [`custom_theme_${parsed.id}`, JSON.stringify(parsed)]);
            await window.applyTheme(parsed.id);
            m.remove();
            window.__showScreen('settings');
          } catch (e) {
            err.textContent = 'Invalid JSON syntax';
          }
        });
      });
    });
  }
}

function wirePasswordModal(container) {
  container.querySelector('#btn-change-pw').addEventListener('click', () => {
    const modal = openModal(`
      <div class="fh-card-title" style="display: flex; align-items: center; gap: 8px; margin-bottom:20px;">
        ${icons.lock(14)} Change Master Password
      </div>

      <div class="fh-field">
        <label class="fh-label">New Password</label>
        <input id="pw-new" class="fh-input" type="password" placeholder="Enter new password" />
      </div>
      <div class="fh-field">
        <label class="fh-label">Confirm Password</label>
        <input id="pw-confirm" class="fh-input" type="password" placeholder="Repeat password" />
      </div>
      <div id="pw-error" style="color:#FF4444;font-size:11px;min-height:16px;margin-bottom:12px;"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button class="fh-btn fh-btn-ghost" id="pw-cancel">Cancel</button>
        <button class="fh-btn fh-btn-primary" id="pw-save">Save Password</button>
      </div>
    `, (m) => {
      m.querySelector('#pw-cancel').addEventListener('click', () => m.remove());
      m.querySelector('#pw-save').addEventListener('click', async () => {
        const pw  = m.querySelector('#pw-new').value.trim();
        const cpw = m.querySelector('#pw-confirm').value.trim();
        const err = m.querySelector('#pw-error');
        if (!pw)          { err.textContent = 'Password cannot be empty.'; return; }
        if (pw !== cpw)   { err.textContent = 'Passwords do not match.'; return; }
        if (pw.length < 4){ err.textContent = 'Minimum 4 characters.'; return; }
        const hash = await sha256hex(pw);
        await saveSetting('master_password', hash);
        m.remove();
        // Flash the button label briefly
        const btn = container.querySelector('#btn-change-pw');
        const orig = btn.textContent;
        btn.textContent = '✓ Password Updated';
        btn.style.color = 'var(--color-primary)';
        setTimeout(() => { btn.textContent = orig; btn.style.color = ''; }, 2200);
      });
    });
  });
}

// ── Toast notification ────────────────────────────────────────────────────────
function showToast(msg, color = 'var(--color-primary)') {
  let type = 'success';
  if (color === '#FF4444' || color === 'var(--color-danger)') type = 'error';
  else if (color === '#F59E0B' || color === 'var(--color-warning)' || color === '#FF8C00') type = 'warning';
  window.showToast(msg, type);
}

function wireBackup(container) {
  container.querySelector('#btn-backup').addEventListener('click', async () => {
    const btn = container.querySelector('#btn-backup');
    btn.disabled = true;
    btn.innerHTML = `${icons.spinner(14)} Exporting…`;
    try {
      const res = await window.api.db.backup();
      if (!res.ok) throw new Error(res.error);
      // If running in browser-only context (no Electron save dialog), trigger download
      if (res.json) {
        const blob = new Blob([res.json], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url; a.download = `phone-zone-backup-${Date.now()}.json`;
        a.click(); URL.revokeObjectURL(url);
      }
      btn.textContent = '✓ Saved';
      btn.style.background = 'var(--color-primary)';
      btn.style.color = 'var(--color-bg)';
    } catch (e) {
      btn.textContent = '✗ Failed';
      btn.style.background = '#FF4444';
      btn.style.color = '#FFFFFF';
      console.error(e);
    } finally {
      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = `${icons.download(14)} Download Backup`;
        btn.style.background = '';
        btn.style.color = '';
      }, 2500);
    }
  });
}

function wireImportBackup(container) {
  const importBtn = container.querySelector('#btn-import-backup');
  const importFileInput = container.querySelector('#import-file-input');
  
  if (!importBtn || !importFileInput) return;
  const importOrigHTML = importBtn.innerHTML;

  importBtn.addEventListener('click', () => importFileInput.click());

  importFileInput.addEventListener('change', async () => {
    const file = importFileInput.files?.[0];
    if (!file) return;
    importFileInput.value = '';

    let data;
    try {
      const text = await file.text();
      data = JSON.parse(text);
    } catch (_) {
      showToast('Could not parse file — make sure it is a valid JSON backup.', '#FF4444');
      return;
    }

    const EXPECTED_TABLES = ['items', 'purchases', 'sales', 'sale_items'];
    const foundTables     = EXPECTED_TABLES.filter(t => Array.isArray(data[t]));

    if (foundTables.length === 0) {
      showToast('Invalid backup — no recognisable table data found.', '#FF4444');
      return;
    }

    const counts = {
      items:      (data.items      ?? []).length,
      purchases:  (data.purchases  ?? []).length,
      sales:      (data.sales      ?? []).length,
      sale_items: (data.sale_items ?? []).length,
      settings:   (data.settings   ?? []).length,
    };
    const totalRows = Object.values(counts).reduce((a, b) => a + b, 0);

    const exportedAt = data.exported_at
      ? `Backup date: ${new Date(data.exported_at).toLocaleString('en-IN')}\n`
      : '';

    const confirmed = await window.showConfirm(
      '⬆ Import Backup',
      `${exportedAt}Found: ${counts.items} items · ${counts.purchases} purchases · ` +
      `${counts.sales} sales · ${counts.sale_items} line items · ${counts.settings} settings.\n\n` +
      `Existing records with the same ID will be skipped (INSERT OR IGNORE). ` +
      `No existing data will be deleted.`,
      'Import Now',
      'warn'
    );
    if (!confirmed) return;

    importBtn.disabled = true;
    importBtn.style.opacity = '0.65';
    importBtn.innerHTML = `${icons.spinner(14)} Importing…`;

    const imported = { items: 0, purchases: 0, sales: 0, sale_items: 0, settings: 0 };
    const errors   = [];

    try {
      for (const row of (data.items ?? [])) {
        const r = await window.api.db.run(
          `INSERT OR IGNORE INTO items (id, name, category, stock_qty, purchase_price, sell_price, gst_rate, is_margin_scheme) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [row.id ?? null, row.name ?? '', row.category ?? 'Accessory', row.stock_qty ?? 0, row.purchase_price ?? 0, row.sell_price ?? 0, row.gst_rate ?? 18, row.is_margin_scheme ?? 0]
        );
        if (r.ok && r.changes > 0) imported.items++;
        else if (!r.ok) errors.push(`item id=${row.id}: ${r.error}`);
      }

      for (const row of (data.purchases ?? [])) {
        const r = await window.api.db.run(
          `INSERT OR IGNORE INTO purchases (id, item_id, qty, purchase_rate, supplier_name, purchase_date) VALUES (?, ?, ?, ?, ?, ?)`,
          [row.id ?? null, row.item_id ?? null, row.qty ?? 0, row.purchase_rate ?? 0, row.supplier_name ?? '', row.purchase_date ? toLocalSqlDateTime(row.purchase_date) : toLocalSqlDateTime(new Date())]
        );
        if (r.ok && r.changes > 0) imported.purchases++;
        else if (!r.ok) errors.push(`purchase id=${row.id}: ${r.error}`);
      }

      for (const row of (data.sales ?? [])) {
        const r = await window.api.db.run(
          `INSERT OR IGNORE INTO sales (id, invoice_number, sale_date, customer_name, customer_gstin, total_taxable, total_cgst, total_sgst, grand_total, payment_mode, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [row.id ?? null, row.invoice_number ?? '', row.sale_date ? toLocalSqlDateTime(row.sale_date) : toLocalSqlDateTime(new Date()), row.customer_name ?? 'Walk-in Customer', row.customer_gstin ?? '', row.total_taxable ?? 0, row.total_cgst ?? 0, row.total_sgst ?? 0, row.grand_total ?? 0, row.payment_mode ?? 'Cash', row.status ?? 'Active']
        );
        if (r.ok && r.changes > 0) imported.sales++;
        else if (!r.ok) errors.push(`sale id=${row.id}: ${r.error}`);
      }

      for (const row of (data.sale_items ?? [])) {
        const r = await window.api.db.run(
          `INSERT OR IGNORE INTO sale_items (id, sale_id, item_id, item_name, qty, price_per_unit, is_margin_applied, cgst_amount, sgst_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [row.id ?? null, row.sale_id ?? null, row.item_id ?? null, row.item_name ?? '', row.qty ?? 0, row.price_per_unit ?? 0, row.is_margin_applied ?? 0, row.cgst_amount ?? 0, row.sgst_amount ?? 0]
        );
        if (r.ok && r.changes > 0) imported.sale_items++;
        else if (!r.ok) errors.push(`sale_item id=${row.id}: ${r.error}`);
      }

      const SKIP_SETTINGS_KEYS = new Set(['master_password']);
      for (const row of (data.settings ?? [])) {
        if (!row.key || SKIP_SETTINGS_KEYS.has(row.key)) continue;
        const r = await window.api.db.run(
          `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`,
          [row.key, row.value ?? '']
        );
        if (r.ok && r.changes > 0) imported.settings++;
        else if (!r.ok) errors.push(`setting key=${row.key}: ${r.error}`);
      }

    } catch (err) {
      errors.push(`Unexpected error: ${err.message}`);
    }

    importBtn.disabled = false;
    importBtn.style.opacity = '';
    importBtn.innerHTML = importOrigHTML;

    const totalImported = Object.values(imported).reduce((a, b) => a + b, 0);

    const resultLines = [
      `✅ Items imported:      ${imported.items}    (skipped: ${counts.items - imported.items})`,
      `✅ Purchases imported:  ${imported.purchases} (skipped: ${counts.purchases - imported.purchases})`,
      `✅ Sales imported:      ${imported.sales}    (skipped: ${counts.sales - imported.sales})`,
      `✅ Line items imported: ${imported.sale_items} (skipped: ${counts.sale_items - imported.sale_items})`,
      `✅ Settings imported:   ${imported.settings}  (skipped / protected: ${counts.settings - imported.settings})`,
    ];

    const backdrop = document.createElement('div');
    backdrop.className = 'fh-modal-backdrop';
    backdrop.innerHTML = `
      <div class="fh-modal" style="max-width:500px;width:94%;">
        <div class="fh-card-title" style="display: flex; align-items: center; gap: 8px; color:#F59E0B;margin-bottom:18px;">
          ${icons.upload(14)} Import Complete
        </div>

        <div style="
          background:rgba(245,158,11,0.06);border:1px solid rgba(245,158,11,0.25);
          border-radius:6px;padding:16px;margin-bottom:18px;
          font-size:12px;line-height:2;font-variant-numeric:tabular-nums;
          white-space:pre;
        ">${resultLines.join('\n')}</div>

        ${errors.length > 0 ? `
          <div style="margin-bottom:16px;">
            <div style="font-size:10px;text-transform:uppercase;letter-spacing:0.1em;
              opacity:0.45;margin-bottom:8px;">
              ${errors.length} error${errors.length !== 1 ? 's' : ''} (rows were skipped)
            </div>
            <div style="
              background:rgba(255,68,68,0.06);border:1px solid rgba(255,68,68,0.2);
              border-radius:6px;padding:12px;max-height:120px;overflow-y:auto;
              font-size:11px;color:#FF8888;line-height:1.7;word-break:break-all;
            ">${errors.map(e => esc(e)).join('<br/>')}</div>
          </div>` : ''}

        <div style="font-size:11px;opacity:0.4;margin-bottom:20px;line-height:1.6;">
          Note: master_password was not imported to protect your current security settings.
        </div>

        <div style="display:flex;justify-content:flex-end;">
          <button class="fh-btn fh-btn-primary" id="import-result-close">Done</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    backdrop.querySelector('#import-result-close').addEventListener('click', () => {
      backdrop.remove();
      const content = document.getElementById('content');
      if (content) renderSettings(content);
    });
    backdrop.addEventListener('click', e => { 
      // Backdrop click does NOT dismiss — anti-data-loss
    });

    if (totalImported > 0) {
      showToast(`Import done — ${totalImported} record${totalImported !== 1 ? 's' : ''} added.`, '#F59E0B');
    }
  });
}

function wireClearSales(container) {
  container.querySelector('#btn-clear-sales').addEventListener('click', () => {
    openModal(`
      <div class="fh-card-title" style="display: flex; align-items: center; gap: 8px; margin-bottom:16px;color:#FF8C00;">
        ${icons.trash(14)} Clear All Sales Data
      </div>
      <p style="font-size:13px;opacity:0.75;margin-bottom:20px;line-height:1.6;">
        This will permanently delete all invoices and line items.
        Inventory stock levels will <strong>not</strong> be affected.
      </p>
      <div class="fh-field">
        <label class="fh-label">Type <span style="color:#FF8C00;font-weight:600;">DELETE</span> to confirm</label>
        <input id="confirm-clear" class="fh-input" type="text" placeholder="DELETE" autocomplete="off" />
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:8px;">
        <button class="fh-btn fh-btn-ghost" id="cls-cancel">Cancel</button>
        <button class="fh-btn fh-btn-warn" id="cls-confirm">Clear Sales</button>
      </div>
    `, (m) => {
      m.querySelector('#cls-cancel').addEventListener('click', () => m.remove());
      m.querySelector('#cls-confirm').addEventListener('click', async () => {
        if (m.querySelector('#confirm-clear').value.trim() !== 'DELETE') return;
        await window.api.db.run(`DELETE FROM sale_items`);
        await window.api.db.run(`DELETE FROM sales`);
        // Reset daily invoice counter (stored as setting)
        await saveSetting('invoice_daily_counter', '0');
        await saveSetting('invoice_counter_date', '');
        m.remove();
        showToast('Sales data cleared.', '#FF8C00');
      });
    });
  });
}

function wireFactoryReset(container) {
  container.querySelector('#btn-factory-reset').addEventListener('click', async () => {
    // Step 1: password verification
    const settings = await loadSettings();
    const storedHash = settings.master_password || await sha256hex('admin123');

    openModal(`
      <div class="fh-card-title" style="display: flex; align-items: center; gap: 8px; margin-bottom:16px;color:#FF4444;">
        ${icons.alert(14)} Factory Reset
      </div>
      <p style="font-size:13px;opacity:0.75;margin-bottom:20px;line-height:1.6;">
        This will erase <strong>all data</strong> including inventory, purchases, sales, and settings.
        This action is irreversible.
      </p>
      <div class="fh-field">
        <label class="fh-label">Master Password</label>
        <input id="reset-pw" class="fh-input" type="password" placeholder="Enter master password" />
      </div>
      <div class="fh-field">
        <label class="fh-label">Type <span style="color:#FF4444;font-weight:600;">RESET</span> to confirm</label>
        <input id="reset-confirm" class="fh-input" type="text" placeholder="RESET" autocomplete="off" />
      </div>
      <div id="reset-error" style="color:#FF4444;font-size:11px;min-height:16px;margin-bottom:8px;"></div>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button class="fh-btn fh-btn-ghost" id="rst-cancel">Cancel</button>
        <button class="fh-btn fh-btn-danger" id="rst-confirm">Wipe Everything</button>
      </div>
    `, (m) => {
      m.querySelector('#rst-cancel').addEventListener('click', () => m.remove());
      m.querySelector('#rst-confirm').addEventListener('click', async () => {
        const err     = m.querySelector('#reset-error');
        const pw      = m.querySelector('#reset-pw').value;
        const confirm = m.querySelector('#reset-confirm').value.trim();

        if (confirm !== 'RESET') { err.textContent = 'Type RESET to proceed.'; return; }

        const inputHash = await sha256hex(pw);
        if (inputHash !== storedHash) { err.textContent = 'Incorrect password.'; return; }

        // Wipe all tables
        for (const tbl of ['sale_items','sales','purchases','items','settings']) {
          await window.api.db.run(`DELETE FROM ${tbl}`);
        }
        await window.api.db.run(`VACUUM`).catch(() => {});
        m.remove();
        showToast('Factory reset complete. All data wiped.', '#FF4444');
        // Re-seed defaults
        const { initDatabase } = await import('../db/init.js');
        await initDatabase();
        // Reload settings screen
        const content = document.getElementById('content');
        if (content) renderSettings(content);
      });
    });
  });
}

// ── Main export ───────────────────────────────────────────────────────────────
export async function renderSettings(container) {
  try {
    container.innerHTML = `
      <div style="padding:32px;max-width:720px;margin:0 auto;">
        <div style="margin-bottom:28px;">
          <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: var(--color-text); letter-spacing: -0.02em;">Settings</h1>
          <div style="font-size: 11px; font-weight: 600; color: var(--color-primary); letter-spacing: 0.15em; text-transform: uppercase; margin-top: 6px; opacity: 0.8;">
            APP CONFIGURATION & DATA MANAGEMENT
          </div>
        </div>
        <div id="settings-body">
          <div style="opacity:0.35;font-size:12px;padding:40px 0 0;">Loading…</div>
        </div>
      </div>`;

    const s = await loadSettings();
    const body = container.querySelector('#settings-body');

    body.innerHTML =
      sectionShopInfo(s) +
      sectionTax(s) +
      sectionBank(s) +
      sectionTheme(s) +
      sectionSecurity() +
      sectionData();

    wireBlurSave(body);
    wireThemeChips(body);
    wirePasswordModal(body);
    wireBackup(body);
    wireImportBackup(body);
    wireClearSales(body);
    wireFactoryReset(body);

    window.setupCustomSelects(body);

    const saveBtn = document.createElement('div');
    saveBtn.style.cssText = 'position:sticky;bottom:0;padding:16px 0;background:linear-gradient(transparent,var(--color-bg) 30%);z-index:10;';
    saveBtn.innerHTML = `
      <button id="btn-save-settings" class="fh-btn fh-btn-primary" style="
        width:100%;padding:14px;font-size:14px;letter-spacing:0.1em;
        border-radius:8px;box-shadow:0 4px 20px rgba(0,255,178,0.2);
        justify-content:center;
        display:flex;align-items:center;gap:8px;
      ">${icons.save(14)} Save System Settings</button>
    `;
    body.appendChild(saveBtn);

    saveBtn.querySelector('#btn-save-settings').addEventListener('click', async () => {
      const btn = saveBtn.querySelector('#btn-save-settings');
      btn.disabled = true;
      btn.innerHTML = `${icons.spinner(14)} Saving…`;

      // Collect all [data-key] values from the form and save them
      const fields = body.querySelectorAll('[data-key]');
      for (const el of fields) {
        const key = el.dataset.key;
        const value = el.tagName === 'TEXTAREA' ? el.value : el.value;
        await saveSetting(key, value);
      }

      if (typeof window.refreshNavBranding === 'function') {
        await window.refreshNavBranding();
      }

      btn.textContent = '✓ Saved';
      btn.style.background = 'var(--color-primary)';
      btn.style.color = 'var(--color-bg)';
      window.showToast('System settings saved successfully.', 'success');

      setTimeout(() => {
        btn.disabled = false;
        btn.innerHTML = `${icons.save(14)} Save System Settings`;
        btn.style.background = '';
        btn.style.color = '';
      }, 2000);
    });
  } catch (err) {
    console.error(err);
    container.innerHTML = `
      <div style="padding:32px;max-width:720px;margin:0 auto;color:#FF4444;">
        <h2>Error loading settings</h2>
        <pre style="background:rgba(255,68,68,0.1);padding:16px;border-radius:6px;overflow:auto;font-family:monospace;">${err.stack || err.message}</pre>
      </div>`;
  }
}
