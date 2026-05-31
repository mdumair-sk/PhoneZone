// src/screens/pos.js
// ─────────────────────────────────────────────────────────────────────────────
// FoneHisab — Point of Sale (Billing) Screen
// ─────────────────────────────────────────────────────────────────────────────
import { printInvoice } from '../utils/print.js';

// ── Utilities ─────────────────────────────────────────────────────────────────

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmt(n, d = 2) {
  return Number(n ?? 0).toLocaleString('en-IN', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

// Debounce helper
function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

// Toast (top-right)
function showToast(msg, color = 'var(--color-primary)') {
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
  backdrop.innerHTML = `<div class="fh-modal" style="max-width:480px;width:94%;">${html}</div>`;
  document.body.appendChild(backdrop);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.remove(); });
  if (onMount) onMount(backdrop);
  return backdrop;
}

// ── Tax Engine ────────────────────────────────────────────────────────────────

function calcLineItemTax(unitPrice, gstRate, useMargin, purchasePrice) {
  const price = Number(unitPrice)  || 0;
  const rate  = Number(gstRate)    || 0;
  const pp    = Number(purchasePrice) || 0;

  if (useMargin) {
    const margin = price - pp;
    if (margin <= 0) {
      return { taxableBase: 0, cgst: 0, sgst: 0 };
    }
    const taxableMargin = margin / (1 + rate / 100);
    const totalGST      = margin - taxableMargin;
    return {
      taxableBase: round2(taxableMargin),
      kind: 'margin',
      cgst:        round2(totalGST / 2),
      sgst:        round2(totalGST / 2),
    };
  }

  const taxableBase = price / (1 + rate / 100);
  const totalGST    = price - taxableBase;
  return {
    taxableBase: round2(taxableBase),
    kind: 'standard',
    cgst:        round2(totalGST / 2),
    sgst:        round2(totalGST / 2),
  };
}

function calcCartTotals(cart) {
  let totalTaxable = 0, totalCgst = 0, totalSgst = 0, grandTotal = 0;
  for (const row of cart) {
    const qty   = Number(row.qty)       || 0;
    const price = Number(row.unitPrice) || 0;
    const tax   = calcLineItemTax(price, row.item.gst_rate, row.useMargin, row.item.purchase_price);
    totalTaxable += tax.taxableBase * qty;
    totalCgst    += tax.cgst        * qty;
    totalSgst    += tax.sgst        * qty;
    grandTotal   += price           * qty;
  }
  return {
    total_taxable: round2(totalTaxable),
    total_cgst:    round2(totalCgst),
    total_sgst:    round2(totalSgst),
    grand_total:   round2(grandTotal),
  };
}

// ── Invoice Number Generator ──────────────────────────────────────────────────

async function generateInvoiceNumber() {
  const now  = new Date();
  const pad2 = n => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
  const timeStr = `${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`;
  const prefix  = `${dateStr}-`;

  // Find the highest counter used today
  const r = await window.api.db.query(
    `SELECT invoice_number FROM sales
     WHERE invoice_number LIKE ?
     ORDER BY invoice_number DESC LIMIT 1`,
    [`${prefix}%`]
  );

  let counter = 1;
  if (r.ok && r.rows.length) {
    const last    = r.rows[0].invoice_number;  // e.g. 20250328-143022-007
    const parts   = last.split('-');
    const lastNNN = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(lastNNN)) counter = lastNNN + 1;
  }

  const nnn = String(counter).padStart(3, '0');
  return `${dateStr}-${timeStr}-${nnn}`;
}

// ── POS State ─────────────────────────────────────────────────────────────────

const pos = {
  cart:           [],   // [{ item, qty, unitPrice, useMargin }]
  searchResults:  [],
  customerName:   'Walk-in Customer',
  customerPhone:  '',
  customerGstin:  '',
  paymentMode:    'Cash',
  amountPaid:     0,
};

// ── Cart helpers ──────────────────────────────────────────────────────────────

function addToCart(item) {
  if (item.stock_qty <= 0) return;
  const existing = pos.cart.find(r => r.item.id === item.id);
  if (existing) {
    if (existing.qty < item.stock_qty) existing.qty++;
  } else {
    pos.cart.push({
      item,
      qty:       1,
      unitPrice: Number(item.sell_price) || 0,
      useMargin: item.is_margin_scheme === 1 && item.category === 'Used Phone',
    });
  }
}

function removeFromCart(itemId) {
  pos.cart = pos.cart.filter(r => r.item.id !== itemId);
}

// ── Render helpers ────────────────────────────────────────────────────────────

const PAYMENT_MODES = ['Cash', 'UPI', 'Card', 'Credit'];

function categoryBadgeStyle(cat) {
  const bg = {
    'New Phone':      '#00FFB2',
    'Accessory':      '#38bdf8',
    'Used Phone':     '#a78bfa',
    'Repair Service': '#fb923c',
  }[cat] ?? '#aaa';
  return `background: ${bg}; color: #0D0D0D; font-size: 10px; padding: 2px 7px; border-radius: 4px;
    font-weight: 600; letter-spacing: 0.05em; white-space: nowrap;`;
}

// ── Full screen render ────────────────────────────────────────────────────────

export async function renderPOS(container) {
  // Inject styles once
  if (!document.getElementById('fh-pos-style')) {
    const s = document.createElement('style');
    s.id = 'fh-pos-style';
    s.textContent = `
      @keyframes fhToastIn { from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:translateY(0)} }
      @keyframes fhDropIn  { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }

      .pos-search-drop { animation: fhDropIn 0.15s ease; }

      .pos-search-drop::-webkit-scrollbar { width: 4px; }
      .pos-search-drop::-webkit-scrollbar-thumb { background: var(--color-border); border-radius: 2px; }

      .cart-qty-btn {
        width:26px;height:26px;border-radius:4px;border:1px solid var(--color-border);
        background:transparent;color:var(--color-text);cursor:pointer;font-size:14px;
        display:flex;align-items:center;justify-content:center;line-height:1;
        transition:background 0.1s,border-color 0.1s;font-family:inherit;
        flex-shrink:0;
      }
      .cart-qty-btn:hover { background:rgba(0,255,178,0.1);border-color:var(--color-primary); }

      .pos-remove-btn {
        background:transparent;border:none;color:#FF4444;cursor:pointer;
        font-size:16px;line-height:1;padding:4px 6px;border-radius:4px;
        transition:background 0.1s;opacity:0.7;flex-shrink:0;
      }
      .pos-remove-btn:hover { background:rgba(255,68,68,0.12);opacity:1; }

      .pos-right::-webkit-scrollbar { width: 4px; }
      .pos-right::-webkit-scrollbar-thumb { background: var(--color-border); }

      .margin-toggle {
        display:flex;align-items:center;gap:5px;cursor:pointer;
        font-size:10px;letter-spacing:0.05em;white-space:nowrap;
        color:var(--color-primary);user-select:none;
      }
      .margin-toggle input { accent-color:var(--color-primary);cursor:pointer; }

      select.fh-input option { background:var(--color-surface);color:var(--color-text); }
    `;
    document.head.appendChild(s);
  }

  // Load settings for print
  let settings = {};
  try {
    const r = await window.api.db.query(`SELECT key, value FROM settings`);
    if (r.ok) settings = Object.fromEntries(r.rows.map(x => [x.key, x.value]));
  } catch (_) {}

  container.innerHTML = `
    <div style="display:flex;height:100%;overflow:hidden;">

      <!-- ── LEFT PANEL (60%) ─────────────────────────────────────────────── -->
      <div style="
        flex:0 0 60%;width:60%;display:flex;flex-direction:column;
        border-right:1px solid var(--color-border);overflow:hidden;
      ">

        <!-- Header -->
        <div style="padding: 24px 24px 0 24px; flex-shrink: 0;">
          <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: var(--color-text); letter-spacing: -0.02em;">Billing</h1>
          <div style="font-size: 11px; font-weight: 600; color: var(--color-primary); letter-spacing: 0.15em; text-transform: uppercase; margin-top: 6px; opacity: 0.8;">
            POINT OF SALE · CHECKOUT
          </div>
        </div>

        <!-- Search bar -->
        <div style="padding:24px 24px 0;flex-shrink:0;">
          <div style="position:relative;">
            <input id="pos-search" class="fh-input" type="search"
              placeholder="🔍  Search items by name…"
              style="padding-left:14px;"
              autocomplete="off" />
            <div id="pos-search-drop"
              class="pos-search-drop"
              style="
                display:none;position:absolute;top:100%;left:0;right:0;
                background:var(--color-surface);border:1px solid var(--color-border);
                border-top:none;border-radius:0 0 8px 8px;
                max-height:260px;overflow-y:auto;z-index:300;
                box-shadow:0 8px 24px rgba(0,0,0,0.4);
              "></div>
          </div>
        </div>

        <!-- Cart label -->
        <div style="
          padding:16px 20px 10px;flex-shrink:0;
          font-size:10px;letter-spacing:0.15em;text-transform:uppercase;opacity:0.4;
        ">Active Cart</div>

        <!-- Cart table (scrollable) -->
        <div id="pos-cart-wrap" style="flex:1;overflow-y:auto;padding:0 20px 20px;">
        </div>
      </div>

      <!-- ── RIGHT PANEL (40%) ────────────────────────────────────────────── -->
      <div class="pos-right" style="
        flex:0 0 40%;width:40%;
        display:flex;flex-direction:column;
        overflow-y:auto;padding:20px;gap:16px;
      ">

        <!-- Order summary card -->
        <div class="fh-card" style="flex-shrink:0;">
          <div class="fh-card-title">🧾 Order Summary</div>
          <div id="pos-summary"></div>
        </div>

        <!-- Customer details card -->
        <div class="fh-card" style="flex-shrink:0;">
          <div class="fh-card-title">👤 Customer</div>

          <div class="fh-field" style="position:relative;">
            <label class="fh-label">Name</label>
            <input id="pos-cust-name" class="fh-input" type="text"
              placeholder="Walk-in Customer" autocomplete="off"
              value="${esc(pos.customerName)}" />
            <div id="pos-cust-drop" class="pos-search-drop" style="
                display:none;position:absolute;top:100%;left:0;right:0;
                background:var(--color-surface);border:1px solid var(--color-border);
                border-top:none;border-radius:0 0 8px 8px;
                max-height:200px;overflow-y:auto;z-index:300;
                box-shadow:0 8px 24px rgba(0,0,0,0.4);
              "></div>
          </div>

          <div class="fh-field">
            <label class="fh-label">Phone <span style="opacity:0.4;">(optional)</span></label>
            <input id="pos-cust-phone" class="fh-input" type="text"
              placeholder="e.g. 9876543210" autocomplete="off"
              value="${esc(pos.customerPhone)}" />
          </div>

          <div class="fh-field" style="margin-bottom:0;">
            <label class="fh-label">GSTIN <span style="opacity:0.4;">(optional)</span></label>
            <input id="pos-cust-gstin" class="fh-input" type="text"
              placeholder="e.g. 27AABCU9603R1ZX" autocomplete="off"
              value="${esc(pos.customerGstin)}"
              style="letter-spacing:0.06em;" />
          </div>
        </div>

        <!-- Payment card -->
        <div class="fh-card" style="flex-shrink:0;">
          <div class="fh-card-title">💳 Payment</div>
          <div class="fh-field">
            <label class="fh-label">Mode</label>
            <select id="pos-payment" class="fh-input">
              ${PAYMENT_MODES.map(m =>
                `<option value="${m}" ${pos.paymentMode === m ? 'selected' : ''}>${m}</option>`
              ).join('')}
            </select>
          </div>
          <div class="fh-field" style="margin-bottom:0;">
            <label class="fh-label">Amount Paid Upfront</label>
            <input id="pos-amt-paid" class="fh-input" type="number" step="0.01" min="0" 
              ${pos.paymentMode === 'Credit' ? '' : 'disabled'} />
          </div>
        </div>

        <!-- Grand total display -->
        <div id="pos-grand-display" style="
          flex-shrink:0;background:var(--color-surface);
          border:1px solid var(--color-primary);border-radius:8px;
          padding:18px 20px;
        "></div>

        <!-- Save & Print button -->
        <button id="btn-save-print" class="fh-btn fh-btn-primary" style="
          width:100%;padding:14px;font-size:14px;
          letter-spacing:0.1em;border-radius:8px;
          box-shadow:0 4px 20px rgba(0,255,178,0.2);
          flex-shrink:0;
        ">
          🖨 Save &amp; Print Invoice
        </button>

        <!-- Error display -->
        <div id="pos-checkout-error"
          style="color:#FF4444;font-size:11px;text-align:center;min-height:14px;flex-shrink:0;"></div>

      </div>
    </div>
  `;

  // ── Wire up search ──────────────────────────────────────────────────────────
  const searchInput = container.querySelector('#pos-search');
  const searchDrop  = container.querySelector('#pos-search-drop');

  const doSearch = debounce(async (q) => {
    if (!q || q.length < 1) { searchDrop.style.display = 'none'; return; }
    const r = await window.api.db.query(
      `SELECT * FROM items WHERE name LIKE ? ORDER BY name COLLATE NOCASE LIMIT 20`,
      [`%${q}%`]
    );
    const results = r.ok ? r.rows : [];
    if (!results.length) { searchDrop.style.display = 'none'; return; }

    searchDrop.innerHTML = results.map(item => {
      const outOfStock = item.stock_qty <= 0;
      return `
        <div data-item-id="${item.id}"
          style="
            padding:10px 14px;display:flex;align-items:center;justify-content:space-between;
            gap:10px;border-bottom:1px solid var(--color-border);
            cursor:${outOfStock ? 'not-allowed' : 'pointer'};
            opacity:${outOfStock ? '0.38' : '1'};
            transition:background 0.1s;
          "
          ${!outOfStock ? `
            onmouseover="this.style.background='rgba(0,255,178,0.06)'"
            onmouseout="this.style.background=''"` : ''}>
          <div style="flex:1;min-width:0;">
            <div style="font-size:13px;font-weight:500;
              white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px;">
              ${esc(item.name)}</div>
            <div style="display:flex;align-items:center;gap:8px;margin-top:3px;">
              <span style="${categoryBadgeStyle(item.category)}">${esc(item.category)}</span>
              <span style="font-size:11px;opacity:0.5;">Stock: ${item.stock_qty}</span>
            </div>
          </div>
          <div style="text-align:right;flex-shrink:0;">
            <div style="font-size:13px;font-weight:600;font-variant-numeric:tabular-nums;">
              ₹${fmt(item.sell_price)}</div>
            ${outOfStock
              ? `<div style="font-size:10px;color:#FF4444;font-weight:600;letter-spacing:0.06em;">
                   OUT OF STOCK</div>`
              : ''}
          </div>
        </div>`;
    }).join('');
    searchDrop.style.display = 'block';

    // Bind click on each result row
    searchDrop.querySelectorAll('[data-item-id]').forEach(el => {
      const item = results.find(i => i.id === Number(el.dataset.itemId));
      if (!item || item.stock_qty <= 0) return;
      el.addEventListener('click', () => {
        addToCart(item);
        searchInput.value        = '';
        searchDrop.style.display = 'none';
        renderCart(container);
        renderSummary(container);
      });
    });
  }, 200);

  searchInput.addEventListener('input', e => doSearch(e.target.value.trim()));
  searchInput.addEventListener('focus', e => { if (e.target.value) doSearch(e.target.value.trim()); });
  document.addEventListener('click', e => {
    if (!container.querySelector('#pos-search')?.contains(e.target) &&
        !searchDrop.contains(e.target)) {
      searchDrop.style.display = 'none';
    }
  }, { capture: true });

  // ── Customer auto-suggest ──────────────────────────────────────────────────
  const custNameInput = container.querySelector('#pos-cust-name');
  const custPhoneInput = container.querySelector('#pos-cust-phone');
  const custDrop = container.querySelector('#pos-cust-drop');

  const doCustSearch = debounce(async (q) => {
    if (!q || q.length < 2) { custDrop.style.display = 'none'; return; }
    const r = await window.api.db.query(
      `SELECT * FROM customers WHERE name LIKE ? OR phone LIKE ? ORDER BY name COLLATE NOCASE LIMIT 10`,
      [`%${q}%`, `%${q}%`]
    );
    const results = r.ok ? r.rows : [];
    if (!results.length) { custDrop.style.display = 'none'; return; }

    custDrop.innerHTML = results.map(c => `
      <div data-cust-id="${c.id}" style="
        padding:10px 14px;border-bottom:1px solid var(--color-border);
        cursor:pointer;transition:background 0.1s;
      " onmouseover="this.style.background='rgba(0,255,178,0.06)'" onmouseout="this.style.background=''">
        <div style="font-size:13px;font-weight:600;color:var(--color-text);">${esc(c.name)}</div>
        <div style="font-size:11px;opacity:0.6;margin-top:2px;font-variant-numeric:tabular-nums;">
          ${c.phone ? '📞 ' + esc(c.phone) : ''} ${c.gstin ? ' | ' + esc(c.gstin) : ''}
        </div>
      </div>
    `).join('');
    custDrop.style.display = 'block';

    custDrop.querySelectorAll('[data-cust-id]').forEach(el => {
      const c = results.find(i => i.id === Number(el.dataset.custId));
      el.addEventListener('click', () => {
        pos.customerName = c.name;
        pos.customerPhone = c.phone;
        pos.customerGstin = c.gstin;
        custNameInput.value = c.name;
        custPhoneInput.value = c.phone;
        container.querySelector('#pos-cust-gstin').value = c.gstin;
        custDrop.style.display = 'none';
      });
    });
  }, 200);

  custNameInput.addEventListener('input', e => {
    pos.customerName = e.target.value;
    doCustSearch(e.target.value.trim());
  });
  custNameInput.addEventListener('focus', e => { if (e.target.value) doCustSearch(e.target.value.trim()); });
  custPhoneInput.addEventListener('input', e => {
    pos.customerPhone = e.target.value.trim();
    doCustSearch(e.target.value.trim());
  });

  document.addEventListener('click', e => {
    if (!container.querySelector('#pos-cust-name')?.contains(e.target) &&
        !container.querySelector('#pos-cust-phone')?.contains(e.target) &&
        !custDrop.contains(e.target)) {
      custDrop.style.display = 'none';
    }
  }, { capture: true });

  container.querySelector('#pos-cust-gstin').addEventListener('input', e => {
    pos.customerGstin = e.target.value.trim();
  });
  
  const paymentSelect = container.querySelector('#pos-payment');
  const amtPaidInput = container.querySelector('#pos-amt-paid');
  
  paymentSelect.addEventListener('change', e => {
    pos.paymentMode = e.target.value;
    if (pos.paymentMode !== 'Credit') {
      amtPaidInput.disabled = true;
      const t = calcCartTotals(pos.cart);
      amtPaidInput.value = t.grand_total;
      pos.amountPaid = t.grand_total;
    } else {
      amtPaidInput.disabled = false;
      amtPaidInput.value = '';
      pos.amountPaid = 0;
    }
  });

  amtPaidInput.addEventListener('input', e => {
    pos.amountPaid = parseFloat(e.target.value) || 0;
  });

  // ── Save & Print ────────────────────────────────────────────────────────────
  container.querySelector('#btn-save-print').addEventListener('click', () =>
    handleSavePrint(container, settings)
  );

  // Initial render
  renderCart(container);
  renderSummary(container);
}

// ── Cart renderer ─────────────────────────────────────────────────────────────

function renderCart(container) {
  const wrap = container.querySelector('#pos-cart-wrap');
  if (!wrap) return;

  if (pos.cart.length === 0) {
    wrap.innerHTML = `
      <div style="
        display:flex;flex-direction:column;align-items:center;justify-content:center;
        height:180px;opacity:0.2;gap:10px;
      ">
        <div style="font-size:36px;">🛒</div>
        <div style="font-size:12px;letter-spacing:0.1em;text-transform:uppercase;">Cart is empty</div>
      </div>`;
    return;
  }

  wrap.innerHTML = `
    <table style="width:100%;border-collapse:collapse;">
      <thead>
        <tr style="border-bottom:1px solid var(--color-border);">
          ${['Item','Qty','Unit Price','','Total',''].map((h, i) => `
            <th style="
              padding:8px ${i === 5 ? '0' : '8px'};text-align:${i >= 4 ? 'right' : 'left'};
              font-size:10px;letter-spacing:0.1em;text-transform:uppercase;opacity:0.4;
              ${i === 5 ? 'width:32px;' : ''}
            ">${h}</th>`).join('')}
        </tr>
      </thead>
      <tbody id="cart-tbody"></tbody>
    </table>`;

  const tbody = wrap.querySelector('#cart-tbody');
  pos.cart.forEach((row, idx) => {
    const lineTotal = round2(row.qty * row.unitPrice);
    const isUsed    = row.item.category === 'Used Phone';
    const tr        = document.createElement('tr');
    tr.style.cssText = `
      border-bottom:1px solid var(--color-border);
      vertical-align:middle;
      transition:background 0.1s;
    `;
    tr.innerHTML = `
      <!-- Name + margin toggle -->
      <td style="padding:10px 8px;min-width:120px;">
        <div style="font-size:13px;font-weight:500;margin-bottom:4px;
          white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:180px;">
          ${esc(row.item.name)}</div>
        <span style="${categoryBadgeStyle(row.item.category)}">${esc(row.item.category)}</span>
        ${isUsed ? `
          <div style="margin-top:6px;">
            <label class="margin-toggle">
              <input type="checkbox" class="cart-margin-cb" data-idx="${idx}"
                ${row.useMargin ? 'checked' : ''} />
              Margin Scheme
            </label>
          </div>` : ''}
      </td>

      <!-- Qty controls -->
      <td style="padding:10px 8px;white-space:nowrap;">
        <div style="display:flex;align-items:center;gap:4px;">
          <button class="cart-qty-btn cart-qty-dec" data-idx="${idx}">−</button>
          <input type="number" class="fh-input cart-qty-input" data-idx="${idx}"
            value="${row.qty}" min="1" max="${row.item.stock_qty}" step="1"
            style="width:52px;text-align:center;padding:5px 4px;font-size:13px;font-variant-numeric:tabular-nums;font-weight:500;" />
          <button class="cart-qty-btn cart-qty-inc" data-idx="${idx}"
            ${row.qty >= row.item.stock_qty ? 'disabled style="opacity:0.25;cursor:not-allowed;"' : ''}>+</button>
        </div>
        <div style="font-size:10px;opacity:0.3;margin-top:3px;text-align:center;">
          / ${row.item.stock_qty}
        </div>
      </td>

      <!-- Unit price editable -->
      <td style="padding:10px 8px;">
        <div style="position:relative;">
          <span style="
            position:absolute;left:8px;top:50%;transform:translateY(-50%);
            font-size:12px;opacity:0.45;pointer-events:none;
          ">₹</span>
          <input type="number" class="fh-input cart-price-input" data-idx="${idx}"
            value="${row.unitPrice}"
            min="0" step="0.01"
            style="padding-left:20px;width:100px;font-size:13px;font-variant-numeric:tabular-nums;" />
        </div>
      </td>

      <!-- Margin scheme tax info -->
      <td style="padding:10px 4px;font-size:10px;opacity:0.35;white-space:nowrap;min-width:60px;">
        ${row.useMargin ? 'Margin' : `GST ${row.item.gst_rate}%`}
      </td>

      <!-- Line total -->
      <td style="padding:10px 8px;text-align:right;font-size:13px;
        font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap;">
        ₹${fmt(lineTotal)}
      </td>

      <!-- Remove -->
      <td style="padding:10px 0;text-align:right;">
        <button class="pos-remove-btn cart-remove" data-idx="${idx}" title="Remove">×</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // ── Event delegation for cart controls ───────────────────────────────────
  tbody.querySelectorAll('.cart-qty-dec').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.idx);
      if (pos.cart[i].qty > 1) pos.cart[i].qty--;
      else return;
      renderCart(container);
      renderSummary(container);
    });
  });

  tbody.querySelectorAll('.cart-qty-inc').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.idx);
      const row = pos.cart[i];
      if (row.qty < row.item.stock_qty) row.qty++;
      renderCart(container);
      renderSummary(container);
    });
  });

  tbody.querySelectorAll('.cart-qty-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const i = Number(inp.dataset.idx);
      const row = pos.cart[i];
      let newQty = parseInt(inp.value, 10);
      if (isNaN(newQty)) newQty = 1;
      if (newQty < 1) newQty = 1;
      if (newQty > row.item.stock_qty) newQty = row.item.stock_qty;
      row.qty = newQty;
      renderCart(container);
      renderSummary(container);
    });
  });

  tbody.querySelectorAll('.cart-price-input').forEach(inp => {
    inp.addEventListener('change', () => {
      const i = Number(inp.dataset.idx);
      pos.cart[i].unitPrice = parseFloat(inp.value) || 0;
      renderCart(container);
      renderSummary(container);
    });
  });

  tbody.querySelectorAll('.cart-margin-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const i = Number(cb.dataset.idx);
      pos.cart[i].useMargin = cb.checked;
      renderCart(container);
      renderSummary(container);
    });
  });

  tbody.querySelectorAll('.cart-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.idx);
      removeFromCart(pos.cart[i].item.id);
      renderCart(container);
      renderSummary(container);
    });
  });
}

// ── Summary renderer ──────────────────────────────────────────────────────────

function renderSummary(container) {
  const totals    = calcCartTotals(pos.cart);
  const summaryEl = container.querySelector('#pos-summary');
  const grandEl   = container.querySelector('#pos-grand-display');
  if (!summaryEl || !grandEl) return;

  // Per-line breakdown rows
  const lineBreakdown = pos.cart.map(row => {
    const tax   = calcLineItemTax(row.unitPrice, row.item.gst_rate, row.useMargin, row.item.purchase_price);
    const label = row.useMargin ? 'Margin' : `GST ${row.item.gst_rate}%`;
    return `
      <div style="display:flex;justify-content:space-between;padding:4px 0;
        font-size:11px;opacity:0.55;border-bottom:1px solid var(--color-border);">
        <span style="max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          ${esc(row.item.name)} ×${row.qty}</span>
        <span style="white-space:nowrap;font-variant-numeric:tabular-nums;">
          ${label} · ₹${fmt(round2(row.qty * row.unitPrice))}</span>
      </div>`;
  }).join('');

  summaryEl.innerHTML = `
    <div style="margin-bottom:12px;">${lineBreakdown}</div>
    <div style="display:flex;flex-direction:column;gap:6px;font-size:12px;font-variant-numeric:tabular-nums;">
      ${[
        ['Taxable Base', totals.total_taxable],
        ['CGST',         totals.total_cgst],
        ['SGST',         totals.total_sgst],
      ].map(([label, val]) => `
        <div style="display:flex;justify-content:space-between;opacity:0.65;">
          <span>${label}</span>
          <span>₹${fmt(val)}</span>
        </div>`).join('')}
    </div>`;

  grandEl.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <span style="font-size:12px;letter-spacing:0.12em;text-transform:uppercase;opacity:0.6;">
        Grand Total
      </span>
      <span style="
        font-size:26px;font-weight:700;font-variant-numeric:tabular-nums;
        color:var(--color-primary);letter-spacing:0.02em;
      ">₹${fmt(totals.grand_total)}</span>
    </div>
    ${pos.cart.length > 0 ? `
    <div style="font-size:11px;opacity:0.35;margin-top:4px;text-align:right;letter-spacing:0.04em;">
      ${pos.cart.length} item${pos.cart.length !== 1 ? 's' : ''} in cart
    </div>` : ''}
  `;

  // Sync Amount Paid field if not credit
  const amtPaidInput = container.querySelector('#pos-amt-paid');
  if (amtPaidInput && pos.paymentMode !== 'Credit') {
    amtPaidInput.value = totals.grand_total;
    pos.amountPaid = totals.grand_total;
  }
}

// ── Save & Print handler ──────────────────────────────────────────────────────

async function handleSavePrint(container, settings) {
  const errEl = container.querySelector('#pos-checkout-error');
  errEl.textContent = '';

  // 1. Validate
  if (pos.cart.length === 0) {
    errEl.textContent = 'Cart is empty.';
    return;
  }

  // Refresh stock for validation
  const ids = pos.cart.map(r => r.item.id);
  const stockRes = await window.api.db.query(
    `SELECT id, stock_qty, name FROM items WHERE id IN (${ids.map(() => '?').join(',')})`,
    ids
  );
  const stockMap = {};
  if (stockRes.ok) stockRes.rows.forEach(r => { stockMap[r.id] = r; });

  for (const row of pos.cart) {
    const live = stockMap[row.item.id];
    if (!live) { errEl.textContent = `Item "${row.item.name}" no longer exists.`; return; }
    if (row.qty > live.stock_qty) {
      errEl.textContent = `"${live.name}" only has ${live.stock_qty} in stock (you have ${row.qty} in cart).`;
      return;
    }
  }

  // 2. Generate invoice number
  let invoiceNumber;
  try {
    invoiceNumber = await generateInvoiceNumber();
  } catch (e) {
    errEl.textContent = 'Failed to generate invoice number.';
    return;
  }

  // 3. Totals
  const totals = calcCartTotals(pos.cart);

  // 4. Commit transaction — all db:run calls sequentially
  const btn = container.querySelector('#btn-save-print');
  btn.disabled   = true;
  btn.textContent = '⏳ Saving…';

  try {
    // INSERT sales
    let finalAmountPaid = pos.paymentMode !== 'Credit' ? totals.grand_total : pos.amountPaid;
    if (finalAmountPaid > totals.grand_total) finalAmountPaid = totals.grand_total;

    const saleRes = await window.api.db.run(`
      INSERT INTO sales
        (invoice_number, customer_name, customer_gstin,
         total_taxable, total_cgst, total_sgst, grand_total, amount_paid, payment_mode, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active')`,
      [
        invoiceNumber,
        pos.customerName || 'Walk-in Customer',
        pos.customerGstin || '',
        totals.total_taxable,
        totals.total_cgst,
        totals.total_sgst,
        totals.grand_total,
        finalAmountPaid,
        pos.paymentMode,
      ]
    );

    if (!saleRes.ok) throw new Error(saleRes.error ?? 'Failed to insert sale.');

    const saleId = saleRes.lastInsertRowid;

    // Log initial payment
    if (finalAmountPaid > 0) {
      const pmMode = pos.paymentMode === 'Credit' ? 'Cash' : pos.paymentMode; // If credit but paid partial, default partial payment mode to Cash
      await window.api.db.run(
        `INSERT INTO customer_payments (sale_id, amount, payment_mode) VALUES (?, ?, ?)`,
        [saleId, finalAmountPaid, pmMode]
      );
    }

    // INSERT sale_items + UPDATE stock
    for (const row of pos.cart) {
      const tax = calcLineItemTax(
        row.unitPrice, row.item.gst_rate, row.useMargin, row.item.purchase_price
      );

      const siRes = await window.api.db.run(`
        INSERT INTO sale_items
          (sale_id, item_id, item_name, qty, price_per_unit,
           is_margin_applied, cgst_amount, sgst_amount)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          saleId,
          row.item.id,
          row.item.name,
          row.qty,
          row.unitPrice,
          row.useMargin ? 1 : 0,
          tax.cgst,
          tax.sgst,
        ]
      );
      if (!siRes.ok) throw new Error(siRes.error ?? `Failed to insert line item: ${row.item.name}`);

      const stRes = await window.api.db.run(
        `UPDATE items SET stock_qty = stock_qty - ? WHERE id = ?`,
        [row.qty, row.item.id]
      );
      if (!stRes.ok) throw new Error(stRes.error ?? `Failed to update stock: ${row.item.name}`);
    }

    // 5. Customer Ledger Integration
    if (pos.customerName && pos.customerName.toLowerCase() !== 'walk-in customer') {
      const name = pos.customerName.trim();
      const phone = pos.customerPhone || '';
      const gstin = pos.customerGstin || '';
      
      // Check if customer exists by name and phone
      const custRes = await window.api.db.query(
        `SELECT id FROM customers WHERE name = ? AND phone = ?`, 
        [name, phone]
      );
      
      if (custRes.ok && custRes.rows.length > 0) {
        // Exists, update total purchases
        const cid = custRes.rows[0].id;
        await window.api.db.run(
          `UPDATE customers SET total_purchases = total_purchases + ?, gstin = CASE WHEN gstin = '' THEN ? ELSE gstin END WHERE id = ?`,
          [totals.grand_total, gstin, cid]
        );
      } else {
        // Does not exist, insert
        await window.api.db.run(
          `INSERT INTO customers (name, phone, gstin, total_purchases) VALUES (?, ?, ?, ?)`,
          [name, phone, gstin, totals.grand_total]
        );
      }
    }

    // 6. Success
    const cartSnapshot = [...pos.cart];
    pos.cart         = [];
    pos.customerName = 'Walk-in Customer';
    pos.customerPhone = '';
    pos.customerGstin = '';
    pos.paymentMode  = 'Cash';
    pos.amountPaid   = 0;

    renderCart(container);
    renderSummary(container);
    container.querySelector('#pos-cust-name').value  = 'Walk-in Customer';
    container.querySelector('#pos-cust-phone').value = '';
    container.querySelector('#pos-cust-gstin').value = '';
    container.querySelector('#pos-payment').value    = 'Cash';
    if(container.querySelector('#pos-amt-paid')) {
      container.querySelector('#pos-amt-paid').disabled = true;
      container.querySelector('#pos-amt-paid').value = '';
    }

    showToast(`Invoice ${invoiceNumber} saved.`);
    await printInvoice(saleId, settings);

  } catch (err) {
    openModal(`
      <div class="fh-card-title" style="color:#FF4444;margin-bottom:16px;">⚠ Transaction Failed</div>
      <p style="font-size:13px;opacity:0.8;line-height:1.6;margin-bottom:16px;">
        No changes were saved to the database.
      </p>
      <div style="background:rgba(255,68,68,0.08);border:1px solid rgba(255,68,68,0.3);
        border-radius:6px;padding:12px;font-size:12px;font-family:monospace;
        color:#FF8888;margin-bottom:20px;word-break:break-all;">
        ${esc(err.message)}
      </div>
      <div style="display:flex;justify-content:flex-end;">
        <button class="fh-btn fh-btn-ghost" onclick="this.closest('.fh-modal-backdrop').remove()">
          Close
        </button>
      </div>
    `);
  } finally {
    btn.disabled    = false;
    btn.textContent = '🖨 Save & Print Invoice';
  }
}
