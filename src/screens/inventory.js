// src/screens/inventory.js
// ─────────────────────────────────────────────────────────────────────────────
// Phone Zone — Inventory Screen (3 tabs)
//   A: View / Edit Inventory
//   B: Log Stock-In Purchase
//   C: Sales Returns & Voids
// ─────────────────────────────────────────────────────────────────────────────

import { printInvoice } from '../utils/print.js';
import { icons } from '../utils/icons.js';

const CATEGORIES = ['New Phone', 'Accessory', 'Used Phone', 'Repair Service'];
const PAGE_SIZE  = 50;

// ── Tiny utilities ────────────────────────────────────────────────────────────

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmt(n, decimals = 2) {
  return Number(n ?? 0).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtDate(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return isNaN(d) ? ts : d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
}

export function showToast(msg, color = 'var(--color-primary)') {
  const t = document.createElement('div');
  t.textContent = msg;
  Object.assign(t.style, {
    position: 'fixed', top: '24px', right: '24px',
    background: color, color: '#0D0D0D',
    padding: '10px 20px', borderRadius: '6px',
    fontSize: '12px', fontWeight: '600', letterSpacing: '0.06em',
    zIndex: '9999', boxShadow: `0 4px 24px ${color}55`,
    animation: 'fhToastIn 0.2s ease', pointerEvents: 'none',
  });
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.3s'; }, 2700);
  setTimeout(() => t.remove(), 3100);
}

function openModal(html, onMount) {
  const backdrop = document.createElement('div');
  backdrop.className = 'fh-modal-backdrop';
  backdrop.innerHTML = `<div class="fh-modal" style="max-width:520px;width:94%;">${html}</div>`;
  document.body.appendChild(backdrop);
  backdrop.addEventListener('click', e => { /* Backdrop click does NOT dismiss — anti-data-loss */ });
  window.setupCustomSelects(backdrop);
  if (onMount) onMount(backdrop);
  return backdrop;
}

// ── State ─────────────────────────────────────────────────────────────────────

const state = {
  // Tab A
  items:       [],
  filteredA:   [],
  sortCol:     'name',
  sortDir:     'asc',
  searchA:     '',
  pageA:       1,
  // Tab C
  activeSales: [],
  filteredC:   [],
  searchC:     '',
};

// ── DB helpers ────────────────────────────────────────────────────────────────

async function fetchItems() {
  const r = await window.api.db.query(`SELECT * FROM items ORDER BY name COLLATE NOCASE`);
  state.items = r.ok ? r.rows : [];
}

async function fetchActiveSales() {
  const r = await window.api.db.query(`
    SELECT id, invoice_number, sale_date, customer_name, grand_total, status
    FROM   sales
    WHERE  status = 'Active'
    ORDER  BY sale_date DESC
  `);
  state.activeSales = r.ok ? r.rows : [];
}

async function fetchSaleItems(saleId) {
  const r = await window.api.db.query(
    `SELECT * FROM sale_items WHERE sale_id = ?`, [saleId]
  );
  return r.ok ? r.rows : [];
}

// ── TAB A — View / Edit Inventory ────────────────────────────────────────────

function applyFilterSort() {
  let rows = [...state.items];
  const q  = state.searchA.trim().toLowerCase();
  if (q) rows = rows.filter(r => r.name.toLowerCase().includes(q));

  const col = state.sortCol;
  rows.sort((a, b) => {
    let va = a[col] ?? '', vb = b[col] ?? '';
    if (typeof va === 'string') va = va.toLowerCase();
    if (typeof vb === 'string') vb = vb.toLowerCase();
    if (va < vb) return state.sortDir === 'asc' ? -1 :  1;
    if (va > vb) return state.sortDir === 'asc' ?  1 : -1;
    return 0;
  });
  state.filteredA = rows;
}

function colHeader(col, label, container) {
  const isSorted = state.sortCol === col;
  const arrow = isSorted ? (state.sortDir === 'asc' ? ' ↑' : ' ↓') : '';
  return `
    <th data-sort="${col}"
      style="
        padding:10px 14px;text-align:left;font-size:10px;
        letter-spacing:0.12em;text-transform:uppercase;
        color:${isSorted ? 'var(--color-primary)' : 'var(--color-text)'};
        opacity:${isSorted ? '1' : '0.5'};
        cursor:pointer;white-space:nowrap;user-select:none;
        border-bottom:1px solid var(--color-border);
      ">${esc(label)}${arrow}</th>`;
}

function renderTableA(container) {
  applyFilterSort();
  const total  = state.filteredA.length;
  const pages  = Math.max(1, Math.ceil(total / PAGE_SIZE));
  state.pageA  = Math.min(state.pageA, pages);
  const start  = (state.pageA - 1) * PAGE_SIZE;
  const rows   = state.filteredA.slice(start, start + PAGE_SIZE);

  const cols = [
    { key: 'name',           label: 'Name'           },
    { key: 'category',       label: 'Category'       },
    { key: 'hsn_code',       label: 'HSN'            },
    { key: 'stock_qty',      label: 'Stock'          },
    { key: 'purchase_price', label: 'Purchase (₹)'   },
    { key: 'sell_price',     label: 'Sell (₹)'       },
    { key: 'gst_rate',       label: 'GST %'          },
    { key: 'is_margin_scheme', label: 'Margin Scheme' },
  ];

  const table = container.querySelector('#inv-table-wrap');
  if (!table) return;

  table.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:var(--color-surface);">
          ${cols.map(c => colHeader(c.key, c.label, container)).join('')}
          <th style="padding:10px 14px;border-bottom:1px solid var(--color-border);width:60px;"></th>
        </tr>
      </thead>
      <tbody>
        ${rows.length === 0 ? `
          <tr><td colspan="9" style="padding:40px;text-align:center;opacity:0.3;font-size:12px;letter-spacing:0.1em;">
            No items found
          </td></tr>` :
          rows.map((item, i) => `
            <tr data-item-id="${item.id}" class="fh-table-row"
              style="
                border-bottom:1px solid var(--color-border);
                background:${i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'};
              ">
              <td style="padding:10px 14px;font-weight:500;">${esc(item.name)}</td>
              <td style="padding:10px 14px;">
                <span class="fh-badge ${categoryBadgeClass(item.category)}">${esc(item.category)}</span>
              </td>
              <td style="padding:10px 14px;font-size:12px;font-variant-numeric:tabular-nums;opacity:0.7;">${esc(item.hsn_code || '8471')}</td>
              <td style="padding:10px 14px;font-variant-numeric:tabular-nums;
                color:${item.stock_qty === 0 ? 'var(--color-danger)' : item.stock_qty < 3 ? 'var(--color-warning)' : 'inherit'}; font-weight:600;">
                ${item.stock_qty}
              </td>
              <td style="padding:10px 14px;font-variant-numeric:tabular-nums;">₹${fmt(item.purchase_price)}</td>
              <td style="padding:10px 14px;font-variant-numeric:tabular-nums;">₹${fmt(item.sell_price)}</td>
              <td style="padding:10px 14px;">${item.gst_rate}%</td>
              <td style="padding:10px 14px;">
                ${item.is_margin_scheme
                  ? `<span style="color:var(--color-primary);font-size:11px;font-weight:600;">ON</span>`
                  : `<span style="opacity:0.25;font-size:11px;">—</span>`}
              </td>
              <td style="padding:10px 14px;">
                <button class="fh-btn fh-btn-ghost btn-edit-item" data-id="${item.id}"
                  style="padding:5px 12px;font-size:11px;">Edit</button>
              </td>
            </tr>`).join('')
        }
      </tbody>
    </table>

    <!-- Pagination -->
    <div style="display:flex;align-items:center;justify-content:space-between;
      padding:14px 4px;font-size:12px;opacity:0.6;">
      <span>${total} item${total !== 1 ? 's' : ''} — Page ${state.pageA} of ${pages}</span>
      <div style="display:flex;gap:8px;">
        <button class="fh-btn fh-btn-ghost" id="page-prev"
          style="padding:5px 14px;font-size:11px;display:flex;align-items:center;gap:4px;"
          ${state.pageA <= 1 ? 'disabled style="opacity:0.25;cursor:not-allowed;padding:5px 14px;font-size:11px;"' : ''}>
          ${icons.chevronLeft(12)} Prev
        </button>
        <button class="fh-btn fh-btn-ghost" id="page-next"
          style="padding:5px 14px;font-size:11px;display:flex;align-items:center;gap:4px;"
          ${state.pageA >= pages ? 'disabled style="opacity:0.25;cursor:not-allowed;padding:5px 14px;font-size:11px;"' : ''}>
          Next ${icons.chevronRight(12)}
        </button>
      </div>
    </div>
  `;

  // Sort headers
  table.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const col = th.dataset.sort;
      if (state.sortCol === col) {
        state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
      } else {
        state.sortCol = col;
        state.sortDir = 'asc';
      }
      state.pageA = 1;
      renderTableA(container);
    });
  });

  // Pagination
  table.querySelector('#page-prev')?.addEventListener('click', () => {
    if (state.pageA > 1) { state.pageA--; renderTableA(container); }
  });
  table.querySelector('#page-next')?.addEventListener('click', () => {
    if (state.pageA < pages) { state.pageA++; renderTableA(container); }
  });

  // Edit buttons
  table.querySelectorAll('.btn-edit-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = state.items.find(i => i.id === Number(btn.dataset.id));
      if (item) openItemModal(item, container);
    });
  });
}

function categoryBadgeClass(cat) {
  return {
    'New Phone':      'badge-new-phone',
    'Used Phone':     'badge-used-phone',
    'Accessory':      'badge-accessory',
    'Repair Service': 'badge-repair-service',
  }[cat] ?? 'badge-default';
}

function itemModalHTML(item) {
  const isEdit = !!item;
  const cat    = item?.category ?? 'New Phone';
  const isUsed = cat === 'Used Phone';
  return `
    <div class="fh-card-title" style="display: flex; align-items: center; justify-content: space-between; margin-bottom:20px;">
      <div style="display: flex; align-items: center; gap: 8px;">
        ${isEdit ? icons.edit(14) : icons.plus(14)} ${isEdit ? 'Edit Item' : 'New Item'}
      </div>
      <button class="fh-btn-ghost" id="im-close-icon" style="border:none;padding:4px;font-size:16px;line-height:1;height:auto;cursor:pointer;opacity:0.6;background:transparent;">✕</button>
    </div>

    <div class="fh-field">
      <label class="fh-label">Name</label>
      <input id="im-name" class="fh-input" type="text"
        placeholder="e.g. iPhone 15 Pro Max 256GB"
        value="${esc(item?.name ?? '')}" />
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
      <div class="fh-field">
        <label class="fh-label">Category</label>
        <select id="im-category" class="fh-input">
          ${CATEGORIES.map(c =>
            `<option value="${esc(c)}" ${cat === c ? 'selected' : ''}>${esc(c)}</option>`
          ).join('')}
        </select>
      </div>
      <div class="fh-field">
        <label class="fh-label">Stock Qty</label>
        <input id="im-stock" class="fh-input" type="number" min="0" step="1"
          onfocus="this.select()" value="${item?.stock_qty ?? 0}"
          ${isEdit ? 'disabled title="Manage stock via Log Purchase tab"' : ''}
          style="${isEdit ? 'opacity:0.4;cursor:not-allowed;' : ''}" />
        ${isEdit ? `<div style="font-size:10px;opacity:0.35;margin-top:4px;letter-spacing:0.05em;">
          Use Log Purchase tab to adjust stock.</div>` : ''}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:14px;align-items:flex-end;">
      <div class="fh-field">
        <label class="fh-label">Purchase (₹)</label>
        <input id="im-purchase" class="fh-input" type="number" min="0" step="0.01"
          onfocus="this.select()" value="${item?.purchase_price ?? 0}" />
      </div>
      <div class="fh-field">
        <label class="fh-label">Sell (₹)</label>
        <input id="im-sell" class="fh-input" type="number" min="0" step="0.01"
          onfocus="this.select()" value="${item?.sell_price ?? 0}" />
      </div>
      <div class="fh-field">
        <label class="fh-label">GST (%)</label>
        <input id="im-gst" class="fh-input" type="number" min="0" max="100" step="0.5"
          onfocus="this.select()" value="${item?.gst_rate ?? 18}" />
      </div>
      <div class="fh-field">
        <label class="fh-label">HSN Code</label>
        <input id="im-hsn" class="fh-input" type="text"
          placeholder="e.g. 8517"
          value="${esc(item?.hsn_code ?? '8471')}"
          maxlength="8"
          onfocus="this.select()" style="font-variant-numeric:tabular-nums;letter-spacing:0.06em;" />
      </div>
    </div>

    <div class="fh-field" id="im-margin-field" style="${isUsed ? '' : 'opacity:0.45;pointer-events:none;'}">
      <label style="display:flex;align-items:center;gap:10px;cursor:pointer;margin-top:2px;">
        <input id="im-margin" type="checkbox" ${item?.is_margin_scheme ? 'checked' : ''}
          ${isUsed ? '' : 'disabled'}
          style="width:16px;height:16px;accent-color:var(--color-primary);cursor:pointer;margin:0;" />
        <span style="font-size:12px;letter-spacing:0.06em;line-height:1;">
          Enable GST Margin Scheme
          <span style="opacity:0.45;"> — Used Phones only</span>
        </span>
      </label>
    </div>

    <div id="im-error" style="color:#FF4444;font-size:11px;min-height:16px;margin-bottom:8px;"></div>

    <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:4px;">
      <button class="fh-btn fh-btn-ghost" id="im-cancel">Cancel</button>
      <button class="fh-btn fh-btn-primary" id="im-save">
        ${isEdit ? 'Save Changes' : 'Create Item'}
      </button>
    </div>
  `;
}

function openItemModal(item, container) {
  const modal = openModal(itemModalHTML(item), (m) => {
    const catSel      = m.querySelector('#im-category');
    const marginField = m.querySelector('#im-margin-field');
    const marginCb    = m.querySelector('#im-margin');

    catSel.addEventListener('change', () => {
      const isUsed = catSel.value === 'Used Phone';
      marginField.style.opacity       = isUsed ? '1' : '0.3';
      marginField.style.pointerEvents = isUsed ? '' : 'none';
      marginCb.disabled               = !isUsed;
      if (!isUsed) marginCb.checked   = false;
    });

    m.querySelector('#im-cancel').addEventListener('click', () => m.remove());
    m.querySelector('#im-close-icon')?.addEventListener('click', () => m.remove());

    m.querySelector('#im-save').addEventListener('click', async () => {
      const errEl = m.querySelector('#im-error');
      const name  = m.querySelector('#im-name').value.trim();
      if (!name) { errEl.textContent = 'Item name is required.'; return; }

      const payload = {
        name,
        category:        catSel.value,
        purchase_price:  parseFloat(m.querySelector('#im-purchase').value) || 0,
        sell_price:      parseFloat(m.querySelector('#im-sell').value) || 0,
        gst_rate:        parseFloat(m.querySelector('#im-gst').value) || 18,
        is_margin_scheme: marginCb.checked ? 1 : 0,
        hsn_code:        m.querySelector('#im-hsn').value.trim() || '8471',
      };

      let res;
      if (item) {
        res = await window.api.db.run(`
          UPDATE items SET
            name=?, category=?, purchase_price=?, sell_price=?,
            gst_rate=?, is_margin_scheme=?, hsn_code=?
          WHERE id=?`,
          [payload.name, payload.category, payload.purchase_price,
           payload.sell_price, payload.gst_rate, payload.is_margin_scheme, payload.hsn_code, item.id]
        );
      } else {
        const stock = parseInt(m.querySelector('#im-stock').value) || 0;
        res = await window.api.db.run(`
          INSERT INTO items (name, category, stock_qty, purchase_price, sell_price, gst_rate, is_margin_scheme, hsn_code)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [payload.name, payload.category, stock, payload.purchase_price,
           payload.sell_price, payload.gst_rate, payload.is_margin_scheme, payload.hsn_code]
        );
      }

      if (!res.ok) { errEl.textContent = res.error ?? 'Save failed.'; return; }
      m.remove();
      showToast(item ? `"${name}" updated.` : `"${name}" created.`);
      await fetchItems();
      state.pageA = 1;
      renderTableA(container);
    });
  });
}

function buildTabA(container) {
  const wrap = container.querySelector('#tab-a');
  wrap.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;
      margin-bottom:18px;gap:14px;flex-wrap:wrap;">
      <div style="position:relative;max-width:300px;flex:1;">
        <span style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); opacity: 0.4; display: flex; align-items: center; pointer-events: none;">
          ${icons.search(14)}
        </span>
        <input id="inv-search" class="fh-input" type="search"
          placeholder="Search by name…"
          style="padding-left:34px;"
          value="${esc(state.searchA)}" />
      </div>
      <button class="fh-btn fh-btn-primary" id="btn-new-item" style="display: flex; align-items: center; gap: 8px;">
        ${icons.plus(14)} New Item
      </button>
    </div>
    <div id="inv-table-wrap"></div>
  `;

  wrap.querySelector('#btn-new-item').addEventListener('click', () => openItemModal(null, wrap));

  wrap.querySelector('#inv-search').addEventListener('input', e => {
    state.searchA = e.target.value;
    state.pageA   = 1;
    renderTableA(wrap);
  });

  renderTableA(wrap);
}

// ── TAB B — Log Stock-In Purchase ─────────────────────────────────────────────

function buildTabB(container) {
  const wrap = container.querySelector('#tab-b');
  wrap.innerHTML = `
    <div class="fh-card" style="max-width:560px;">
      <div class="fh-card-title" style="display: flex; align-items: center; gap: 8px;">
        ${icons.inventory(14)} Log Stock-In Purchase
      </div>

      <div class="fh-field">
        <label class="fh-label">Item</label>
        <div style="position:relative;">
          <input id="pur-item-search" class="fh-input" type="text"
            placeholder="Type to search items…"
            autocomplete="off" />
          <div id="pur-item-dropdown" class="pur-item-dropdown fh-dropdown" style="display:none;"></div>
        </div>
        <input id="pur-item-id" type="hidden" value="" />
        <div id="pur-item-name-display"
          style="font-size:11px;margin-top:5px;color:var(--color-primary);min-height:16px;"></div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;">
        <div class="fh-field">
          <label class="fh-label">Quantity</label>
          <input id="pur-qty" class="fh-input" type="number" min="1" step="1" placeholder="e.g. 5" />
        </div>
        <div class="fh-field">
          <label class="fh-label">Unit Purchase Rate (₹)</label>
          <input id="pur-rate" class="fh-input" type="number" min="0" step="0.01" placeholder="e.g. 42000" />
        </div>
      </div>

      <div class="fh-field">
        <label class="fh-label">Supplier Name <span style="opacity:0.4;">(optional)</span></label>
        <input id="pur-supplier" class="fh-input" type="text" placeholder="e.g. Rathi Distributors" />
      </div>

      <div id="pur-error" style="color:#FF4444;font-size:11px;min-height:16px;margin-bottom:10px;"></div>

      <div style="display:flex;justify-content:flex-end;">
        <button class="fh-btn fh-btn-primary" id="btn-log-purchase" style="min-width:140px; display: flex; align-items: center; gap: 8px; justify-content: center;">
          ${icons.save(14)} Log Purchase
        </button>
      </div>
    </div>
  `;

  // Live-search dropdown
  const searchInput = wrap.querySelector('#pur-item-search');
  const dropdown    = wrap.querySelector('#pur-item-dropdown');
  const hiddenId    = wrap.querySelector('#pur-item-id');
  const nameDisplay = wrap.querySelector('#pur-item-name-display');

  function showDropdown(q) {
    const matches = state.items.filter(i =>
      i.name.toLowerCase().includes(q.toLowerCase())
    ).slice(0, 12);

    if (!matches.length || !q) { dropdown.style.display = 'none'; return; }

    dropdown.innerHTML = matches.map(i => `
      <div data-id="${i.id}" data-name="${esc(i.name)}" class="fh-table-row"
        style="
          padding:10px 14px;cursor:pointer;font-size:13px;
          border-bottom:1px solid var(--color-border);
        ">
        <span style="font-weight:500;">${esc(i.name)}</span>
        <span style="font-size:10px;opacity:0.45;margin-left:8px;">${esc(i.category)}</span>
        <span style="float:right;font-size:11px;opacity:0.5;">Stock: ${i.stock_qty}</span>
      </div>`).join('');
    dropdown.style.display = 'block';

    dropdown.querySelectorAll('[data-id]').forEach(el => {
      el.addEventListener('click', () => {
        hiddenId.value       = el.dataset.id;
        searchInput.value    = el.dataset.name;
        nameDisplay.textContent = `Selected: ${el.dataset.name}`;
        dropdown.style.display = 'none';
      });
    });
  }

  searchInput.addEventListener('input', e => showDropdown(e.target.value));
  searchInput.addEventListener('focus', e => { if (e.target.value) showDropdown(e.target.value); });
  document.addEventListener('click', e => {
    if (!wrap.contains(e.target)) dropdown.style.display = 'none';
  }, { capture: true });

  // Save purchase
  wrap.querySelector('#btn-log-purchase').addEventListener('click', async () => {
    const errEl    = wrap.querySelector('#pur-error');
    const itemId   = parseInt(hiddenId.value);
    const qty      = parseInt(wrap.querySelector('#pur-qty').value);
    const rate     = parseFloat(wrap.querySelector('#pur-rate').value);
    const supplier = wrap.querySelector('#pur-supplier').value.trim();

    errEl.textContent = '';
    if (!itemId)    { errEl.textContent = 'Please select an item.'; return; }
    if (!qty || qty < 1) { errEl.textContent = 'Quantity must be ≥ 1.'; return; }
    if (isNaN(rate) || rate < 0) { errEl.textContent = 'Enter a valid purchase rate.'; return; }

    const itemRes = await window.api.db.query(
      `SELECT stock_qty, purchase_price FROM items WHERE id = ?`,
      [itemId]
    );
    if (!itemRes.ok || !itemRes.rows.length) {
      errEl.textContent = 'Item not found in DB.';
      return;
    }
    const dbItem = itemRes.rows[0];

    const oldQty = dbItem.stock_qty || 0;
    const oldPrice = dbItem.purchase_price || 0;
    const newAvg = oldQty + qty > 0
      ? (oldQty * oldPrice + qty * rate) / (oldQty + qty)
      : rate;
    const newAvgRounded = Math.round(newAvg * 100) / 100;

    const r1 = await window.api.db.run(
      `INSERT INTO purchases (item_id, qty, purchase_rate, supplier_name) VALUES (?, ?, ?, ?)`,
      [itemId, qty, rate, supplier]
    );
    if (!r1.ok) { errEl.textContent = r1.error ?? 'Failed to log purchase.'; return; }

    const r2 = await window.api.db.run(
      `UPDATE items SET stock_qty = stock_qty + ?, purchase_price = ? WHERE id = ?`,
      [qty, newAvgRounded, itemId]
    );
    if (!r2.ok) { errEl.textContent = r2.error ?? 'Failed to update stock.'; return; }

    const item = state.items.find(i => i.id === itemId);
    showToast(`Stock updated for "${item?.name ?? 'item'}". Avg cost: ₹${newAvgRounded}`);

    // Reset form
    searchInput.value    = '';
    hiddenId.value       = '';
    nameDisplay.textContent = '';
    wrap.querySelector('#pur-qty').value      = '';
    wrap.querySelector('#pur-rate').value     = '';
    wrap.querySelector('#pur-supplier').value = '';

    await fetchItems();
    renderTableA(container.querySelector('#tab-a'));
  });
}

// ── TAB C — Sales Returns & Voids ────────────────────────────────────────────

function renderTableC(container) {
  const wrap = container.querySelector('#returns-table-wrap');
  if (!wrap) return;

  const q    = state.searchC.trim().toLowerCase();
  const rows = q
    ? state.activeSales.filter(s =>
        s.invoice_number.toLowerCase().includes(q) ||
        (s.customer_name ?? '').toLowerCase().includes(q)
      )
    : state.activeSales;

  wrap.innerHTML = `
    <table style="width:100%;border-collapse:collapse;font-size:13px;">
      <thead>
        <tr style="background:var(--color-surface);">
          ${['Invoice No','Date','Customer','Grand Total','Actions'].map(h => `
            <th style="
              padding:10px 14px;text-align:left;font-size:10px;
              letter-spacing:0.12em;text-transform:uppercase;opacity:0.5;
              border-bottom:1px solid var(--color-border);white-space:nowrap;">
              ${h}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.length === 0 ? `
          <tr><td colspan="5" style="padding:40px;text-align:center;opacity:0.3;font-size:12px;letter-spacing:0.1em;">
            No active invoices found
          </td></tr>` :
          rows.map((s, i) => `
            <tr data-sale-id="${s.id}" class="fh-table-row"
              style="
                border-bottom:1px solid var(--color-border);
                background:${i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.015)'};
              ">
              <td style="padding:10px 14px;font-variant-numeric:tabular-nums;">
                <span class="inv-link" data-sale-id="${s.id}" style="
                  color: var(--color-primary); cursor: pointer; font-weight: 600;
                  letter-spacing: 0.04em; text-decoration: underline; text-underline-offset: 3px;
                ">${esc(s.invoice_number)}</span>
              </td>
              <td style="padding:10px 14px;opacity:0.7;">${fmtDate(s.sale_date)}</td>
              <td style="padding:10px 14px;">${esc(s.customer_name ?? 'Walk-in Customer')}</td>
              <td style="padding:10px 14px;font-variant-numeric:tabular-nums;font-weight:500;">
                ₹${fmt(s.grand_total)}</td>
              <td style="padding:10px 14px;">
                <div style="display:flex;gap:8px;">
                  <button class="fh-btn fh-btn-warn btn-void" data-id="${s.id}"
                    style="padding:5px 12px;font-size:11px;">Void</button>
                  <button class="fh-btn fh-btn-ghost btn-refund" data-id="${s.id}"
                    style="padding:5px 12px;font-size:11px;border-color:var(--color-primary);
                    color:var(--color-primary);">Refund</button>
                </div>
              </td>
            </tr>`).join('')
        }
      </tbody>
    </table>
  `;

  // Invoice Links
  wrap.querySelectorAll('.inv-link').forEach(link => {
    link.addEventListener('click', async () => {
      const saleId = Number(link.dataset.saleId);
      await openInvoiceDetailModal(saleId, container);
    });
  });

  // Void buttons
  wrap.querySelectorAll('.btn-void').forEach(btn => {
    btn.addEventListener('click', async () => {
      const sale = state.activeSales.find(s => s.id === Number(btn.dataset.id));
      if (sale) await openVoidModal(sale, container);
    });
  });

  // Refund buttons
  wrap.querySelectorAll('.btn-refund').forEach(btn => {
    btn.addEventListener('click', async () => {
      const sale = state.activeSales.find(s => s.id === Number(btn.dataset.id));
      if (sale) await openRefundModal(sale, container);
    });
  });
}

async function openInvoiceDetailModal(saleId, container) {
  const saleRes = await window.api.db.query(`SELECT * FROM sales WHERE id = ?`, [saleId]);
  if (!saleRes.ok || !saleRes.rows.length) {
    showToast('Sale not found.', '#FF4444');
    return;
  }
  const sale = saleRes.rows[0];

  const itemsRes = await window.api.db.query(`SELECT * FROM sale_items WHERE sale_id = ?`, [saleId]);
  const lineItems = itemsRes.ok ? itemsRes.rows : [];

  const statusColor = sale.status === 'Active' ? 'var(--color-success)' : (sale.status === 'Voided' ? 'var(--color-danger)' : 'var(--color-warning)');

  const lineRows = lineItems.map(li => {
    const amount = li.qty * li.price_per_unit;
    const gstCol = li.is_margin_applied
      ? `<span style="font-size:10px;opacity:0.6;">Margin Scheme</span>`
      : `<span style="font-size:10px;">CGST ₹${fmt(li.cgst_amount)} + SGST ₹${fmt(li.sgst_amount)}</span>`;
    return `
      <tr style="border-bottom:1px solid var(--color-border);background:transparent;">
        <td style="padding:10px 12px;font-size:12px;">${esc(li.item_name)}</td>
        <td style="padding:10px 12px;text-align:center;font-size:12px;">${li.qty}</td>
        <td style="padding:10px 12px;text-align:right;font-size:12px;">₹${fmt(li.price_per_unit)}</td>
        <td style="padding:10px 12px;text-align:center;">${gstCol}</td>
        <td style="padding:10px 12px;text-align:right;font-size:12px;font-weight:600;">₹${fmt(amount)}</td>
      </tr>`;
  }).join('');

  openModal(`
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;">
      <div class="fh-card-title" style="margin-bottom:0;">Invoice Details</div>
      <span style="background:${statusColor}22;color:${statusColor};padding:4px 8px;border-radius:4px;font-size:10px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;border:1px solid ${statusColor}55;">
        ${esc(sale.status)}
      </span>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;font-size:12px;margin-bottom:20px;opacity:0.8;">
      <div>
        <div style="margin-bottom:4px;"><span style="opacity:0.5;">Invoice No:</span> <strong style="color:var(--color-primary);">${esc(sale.invoice_number)}</strong></div>
        <div><span style="opacity:0.5;">Date:</span> <strong>${fmtDate(sale.sale_date)}</strong></div>
      </div>
      <div style="text-align:right;">
        <div style="margin-bottom:4px;"><span style="opacity:0.5;">Customer:</span> <strong>${esc(sale.customer_name || 'Walk-in Customer')}</strong></div>
        <div><span style="opacity:0.5;">Payment Mode:</span> <strong>${esc(sale.payment_mode)}</strong></div>
      </div>
    </div>

    <div style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:6px;overflow:hidden;margin-bottom:16px;">
      <table style="width:100%;border-collapse:collapse;">
        <thead>
          <tr style="background:rgba(255,255,255,0.02);border-bottom:1px solid var(--color-border);">
            <th style="padding:8px 12px;text-align:left;font-size:10px;text-transform:uppercase;opacity:0.5;">Item Name</th>
            <th style="padding:8px 12px;text-align:center;font-size:10px;text-transform:uppercase;opacity:0.5;">Qty</th>
            <th style="padding:8px 12px;text-align:right;font-size:10px;text-transform:uppercase;opacity:0.5;">Unit Price (₹)</th>
            <th style="padding:8px 12px;text-align:center;font-size:10px;text-transform:uppercase;opacity:0.5;">GST</th>
            <th style="padding:8px 12px;text-align:right;font-size:10px;text-transform:uppercase;opacity:0.5;">Line Total (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${lineRows}
        </tbody>
      </table>
    </div>

    <div style="display:flex;justify-content:flex-end;margin-bottom:24px;">
      <table style="width:240px;font-size:12px;">
        <tr>
          <td style="padding:4px;opacity:0.6;">Taxable Base</td>
          <td style="padding:4px;text-align:right;">₹${fmt(sale.total_taxable)}</td>
        </tr>
        <tr>
          <td style="padding:4px;opacity:0.6;">CGST</td>
          <td style="padding:4px;text-align:right;">₹${fmt(sale.total_cgst)}</td>
        </tr>
        <tr>
          <td style="padding:4px;opacity:0.6;">SGST</td>
          <td style="padding:4px;text-align:right;">₹${fmt(sale.total_sgst)}</td>
        </tr>
        <tr style="border-top:1px solid var(--color-border);">
          <td style="padding:8px 4px;font-weight:600;font-size:14px;color:var(--color-primary);">Grand Total</td>
          <td style="padding:8px 4px;text-align:right;font-weight:700;font-size:16px;color:var(--color-primary);">₹${fmt(sale.grand_total)}</td>
        </tr>
      </table>
    </div>

    <div style="display:flex;gap:10px;justify-content:flex-end;">
      <button class="fh-btn fh-btn-ghost" id="inv-detail-close">Close</button>
      <button class="fh-btn fh-btn-primary" id="inv-detail-print" style="display: flex; align-items: center; gap: 8px;">
        ${icons.print(14)} Print Invoice
      </button>
    </div>
  `, (m) => {
    m.querySelector('.fh-modal').style.maxWidth = '680px';
    m.querySelector('#inv-detail-close').addEventListener('click', () => m.remove());
    m.querySelector('#inv-detail-print').addEventListener('click', async () => {
      let settings = {};
      try {
        const r = await window.api.db.query(`SELECT key, value FROM settings`);
        if (r.ok) settings = Object.fromEntries(r.rows.map(x => [x.key, x.value]));
      } catch (_) {}
      await printInvoice(sale.id, settings);
    });
  });
}

async function openVoidModal(sale, container) {
  const lineItems = await fetchSaleItems(sale.id);

  openModal(`
    <div class="fh-card-title" style="display: flex; align-items: center; gap: 8px; margin-bottom:16px;color:#FF8C00;">
      ${icons.alert(14)} Void Invoice
    </div>
    <div style="font-size:13px;margin-bottom:16px;line-height:1.7;opacity:0.8;">
      Invoice <strong style="color:var(--color-primary);">${esc(sale.invoice_number)}</strong>
      — ${esc(sale.customer_name ?? 'Walk-in Customer')}
      — <strong>₹${fmt(sale.grand_total)}</strong>
    </div>

    <div style="background:rgba(255,140,0,0.08);border:1px solid rgba(255,140,0,0.3);
      border-radius:6px;padding:14px;margin-bottom:20px;font-size:12px;line-height:1.6;">
      ⚠ Stock for all line items will be restored.<br/>
      This action <strong>cannot be undone.</strong>
    </div>

    <div style="margin-bottom:20px;font-size:12px;">
      <div style="opacity:0.45;margin-bottom:8px;letter-spacing:0.08em;text-transform:uppercase;font-size:10px;">Line Items</div>
      ${lineItems.map(li => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;
          border-bottom:1px solid var(--color-border);opacity:0.75;">
          <span>${esc(li.item_name)}</span>
          <span>× ${li.qty}</span>
        </div>`).join('')}
    </div>

    <div id="void-error" style="color:#FF4444;font-size:11px;min-height:16px;margin-bottom:8px;"></div>
    <div style="display:flex;gap:10px;justify-content:flex-end;">
      <button class="fh-btn fh-btn-ghost" id="void-cancel">Cancel</button>
      <button class="fh-btn fh-btn-warn" id="void-confirm">Confirm Void</button>
    </div>
  `, (m) => {
    m.querySelector('#void-cancel').addEventListener('click', () => m.remove());
    m.querySelector('#void-confirm').addEventListener('click', async () => {
      const errEl = m.querySelector('#void-error');
      const r = await window.api.db.run(
        `UPDATE sales SET status='Voided' WHERE id=?`, [sale.id]
      );
      if (!r.ok) { errEl.textContent = r.error ?? 'Failed.'; return; }

      // Restore stock for each line item
      for (const li of lineItems) {
        if (li.item_id) {
          await window.api.db.run(
            `UPDATE items SET stock_qty = stock_qty + ? WHERE id = ?`,
            [li.qty, li.item_id]
          );
        }
      }

      m.remove();
      showToast(`Invoice ${sale.invoice_number} voided. Stock restored.`, '#FF8C00');
      await fetchActiveSales();
      await fetchItems();
      renderTableC(container);
    });
  });
}

async function openRefundModal(sale, container) {
  const lineItems = await fetchSaleItems(sale.id);

  openModal(`
    <div class="fh-card-title" style="display: flex; align-items: center; gap: 8px; margin-bottom:16px;color:var(--color-primary);">
      ${icons.refund(14)} Refund Invoice
    </div>
    <div style="font-size:13px;margin-bottom:16px;opacity:0.8;">
      Invoice <strong style="color:var(--color-primary);">${esc(sale.invoice_number)}</strong>
      — <strong>₹${fmt(sale.grand_total)}</strong>
    </div>

    <div style="margin-bottom:6px;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;opacity:0.4;">
      Adjust returned quantities
    </div>

    <div id="refund-lines" style="margin-bottom:20px;">
      ${lineItems.map((li, idx) => `
        <div style="display:flex;align-items:center;justify-content:space-between;
          padding:10px 0;border-bottom:1px solid var(--color-border);gap:12px;">
          <div style="flex:1;font-size:13px;">${esc(li.item_name)}</div>
          <div style="font-size:11px;opacity:0.45;margin-right:8px;">Sold: ${li.qty}</div>
          <div style="display:flex;align-items:center;gap:8px;">
            <label style="font-size:10px;opacity:0.45;text-transform:uppercase;letter-spacing:0.08em;">Return</label>
            <input type="number" class="fh-input refund-qty-input"
              data-line-id="${li.id}" data-item-id="${li.item_id ?? ''}"
              data-max="${li.qty}"
              min="0" max="${li.qty}" step="1" value="${li.qty}"
              style="width:72px;text-align:center;padding:7px 8px;" />
          </div>
        </div>`).join('')}
    </div>

    <div id="refund-error" style="color:#FF4444;font-size:11px;min-height:16px;margin-bottom:8px;"></div>
    <div style="display:flex;gap:10px;justify-content:flex-end;">
      <button class="fh-btn fh-btn-ghost" id="refund-cancel">Cancel</button>
      <button class="fh-btn fh-btn-primary" id="refund-confirm">Confirm Refund</button>
    </div>
  `, (m) => {
    // Clamp qty inputs
    m.querySelectorAll('.refund-qty-input').forEach(inp => {
      inp.addEventListener('input', () => {
        const max = parseInt(inp.dataset.max);
        let v = parseInt(inp.value);
        if (isNaN(v) || v < 0) inp.value = 0;
        if (v > max) inp.value = max;
      });
    });

    m.querySelector('#refund-cancel').addEventListener('click', () => m.remove());
    m.querySelector('#refund-confirm').addEventListener('click', async () => {
      const errEl  = m.querySelector('#refund-error');
      const inputs = [...m.querySelectorAll('.refund-qty-input')];
      const total  = inputs.reduce((s, i) => s + (parseInt(i.value) || 0), 0);

      if (total === 0) { errEl.textContent = 'Enter at least one returned unit.'; return; }

      const r = await window.api.db.run(
        `UPDATE sales SET status='Refunded' WHERE id=?`, [sale.id]
      );
      if (!r.ok) { errEl.textContent = r.error ?? 'Failed.'; return; }

      for (const inp of inputs) {
        const returnedQty = parseInt(inp.value) || 0;
        const itemId      = inp.dataset.itemId ? parseInt(inp.dataset.itemId) : null;
        if (returnedQty > 0 && itemId) {
          await window.api.db.run(
            `UPDATE items SET stock_qty = stock_qty + ? WHERE id = ?`,
            [returnedQty, itemId]
          );
        }
      }

      m.remove();
      showToast(`Refund processed for ${sale.invoice_number}.`);
      await fetchActiveSales();
      await fetchItems();
      renderTableC(container);
    });
  });
}

function buildTabC(container) {
  const wrap = container.querySelector('#tab-c');
  wrap.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;
      margin-bottom:18px;gap:14px;flex-wrap:wrap;">
      <div style="position:relative;max-width:360px;flex:1;">
        <span style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); opacity: 0.4; display: flex; align-items: center; pointer-events: none;">
          ${icons.search(14)}
        </span>
        <input id="returns-search" class="fh-input" type="search"
          placeholder="Search by invoice number or customer…"
          style="padding-left:34px;" />
      </div>
      <span style="font-size:11px;opacity:0.35;letter-spacing:0.06em;">
        Showing Active invoices only
      </span>
    </div>
    <div id="returns-table-wrap"></div>
  `;

  wrap.querySelector('#returns-search').addEventListener('input', e => {
    state.searchC = e.target.value;
    renderTableC(wrap);
  });

  renderTableC(wrap);
}

// ── Tab switcher ──────────────────────────────────────────────────────────────

async function activateTab(tabId, container) {
  if (tabId === 'a') {
    await fetchItems();
    renderTableA(container.querySelector('#tab-a'));
  }

  ['a','b','c'].forEach(t => {
    const panel = container.querySelector(`#tab-${t}`);
    const btn   = container.querySelector(`[data-tab="${t}"]`);
    const isMe  = t === tabId;
    if (panel) panel.style.display = isMe ? 'block' : 'none';
    if (btn) {
      btn.style.background   = isMe ? 'var(--color-primary)' : 'transparent';
      btn.style.color        = isMe ? '#0D0D0D' : 'var(--color-text)';
      btn.style.borderColor  = isMe ? 'var(--color-primary)' : 'var(--color-border)';
      btn.style.opacity      = isMe ? '1' : '0.6';
    }
  });
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function renderInventory(container) {
  // Inject toast keyframe once
  if (!document.getElementById('fh-inv-style')) {
    const s = document.createElement('style');
    s.id = 'fh-inv-style';
    s.textContent = `
      @keyframes fhToastIn { from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:translateY(0)} }
      select.fh-input option { background: var(--color-surface); color: var(--color-text); }
    `;
    document.head.appendChild(s);
  }

  container.innerHTML = `
    <div style="padding:32px;max-width:1100px;margin:0 auto;">

      <!-- Header -->
      <div style="margin-bottom:24px;">
        <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: var(--color-text); letter-spacing: -0.02em;">Inventory</h1>
        <div style="font-size: 11px; font-weight: 600; color: var(--color-primary); letter-spacing: 0.15em; text-transform: uppercase; margin-top: 6px; opacity: 0.8;">
          ITEMS · PURCHASES · RETURNS
        </div>
      </div>

      <!-- Tab pills -->
      <div style="display:flex;gap:8px;margin-bottom:24px;flex-wrap:wrap;">
        ${[
          ['a', `${icons.fileText(14)} View / Edit Items`],
          ['b', `${icons.plus(14)} Log Purchase`],
          ['c', `${icons.refund(14)} Returns &amp; Voids`],
        ].map(([t, label]) => `
          <button data-tab="${t}" class="fh-btn"
            style="
              display:flex;align-items:center;gap:8px;
              padding:9px 20px;border:1px solid var(--color-border);
              border-radius:30px;font-size:12px;letter-spacing:0.07em;
              transition:all 0.15s;
            ">${label}</button>`).join('')}
      </div>

      <!-- Tab panels -->
      <div id="tab-a"></div>
      <div id="tab-b" style="display:none;"></div>
      <div id="tab-c" style="display:none;"></div>
    </div>
  `;

  // Load data
  await Promise.all([fetchItems(), fetchActiveSales()]);

  // Build panels
  buildTabA(container);
  buildTabB(container);
  buildTabC(container);

  window.setupCustomSelects(container);

  // Wire tab switcher
  container.querySelectorAll('[data-tab]').forEach(btn => {
    btn.addEventListener('click', async () => await activateTab(btn.dataset.tab, container));
  });

  // Activate first tab
  await activateTab('a', container);
}
