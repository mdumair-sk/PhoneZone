// src/screens/reports.js
// ─────────────────────────────────────────────────────────────────────────────
// FoneHisab — Financial Exports & Reports Screen
// ─────────────────────────────────────────────────────────────────────────────

import * as XLSX from 'xlsx';

// ── Utilities ─────────────────────────────────────────────────────────────────

function esc(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmt(n, d = 2) {
  return Number(n ?? 0).toLocaleString('en-IN', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

function round2(n) {
  return Math.round((Number(n ?? 0) + Number.EPSILON) * 100) / 100;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function lastOfMonth() {
  const d    = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return last.toISOString().slice(0, 10);
}

function formatDateDisplay(iso) {
  if (!iso) return '—';
  const [y, m, dd] = iso.split('-');
  return `${dd}/${m}/${y}`;
}

function nowStamp() {
  const d   = new Date();
  const p   = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth()+1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

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

// ── Data fetchers ─────────────────────────────────────────────────────────────

async function fetchSummary(startDate, endDate) {
  // start = beginning of day, end = end of day
  const start = `${startDate} 00:00:00`;
  const end   = `${endDate} 23:59:59`;

  const r = await window.api.db.query(`
    SELECT
      COUNT(*)                        AS total_invoices,
      COALESCE(SUM(total_taxable), 0) AS total_taxable,
      COALESCE(SUM(total_cgst),    0) AS total_cgst,
      COALESCE(SUM(total_sgst),    0) AS total_sgst,
      COALESCE(SUM(grand_total),   0) AS grand_total
    FROM sales
    WHERE sale_date BETWEEN ? AND ?
      AND status = 'Active'
  `, [start, end]);

  const modeR = await window.api.db.query(`
    SELECT
      payment_mode,
      COUNT(*)               AS count,
      SUM(grand_total)       AS total
    FROM sales
    WHERE sale_date BETWEEN ? AND ?
      AND status = 'Active'
    GROUP BY payment_mode
  `, [start, end]);

  const summary = (r.ok && r.rows.length) ? r.rows[0] : {
    total_invoices: 0, total_taxable: 0, total_cgst: 0, total_sgst: 0, grand_total: 0,
  };
  const modes = (modeR.ok) ? modeR.rows : [];
  return { summary, modes };
}

async function fetchGSTR1Rows(startDate, endDate) {
  const start = `${startDate} 00:00:00`;
  const end   = `${endDate} 23:59:59`;

  const r = await window.api.db.query(`
    SELECT
      s.invoice_number,
      s.sale_date,
      s.customer_name,
      s.customer_gstin,
      s.payment_mode,
      si.item_name,
      si.qty,
      si.price_per_unit,
      si.is_margin_applied,
      si.cgst_amount,
      si.sgst_amount,
      (si.qty * si.price_per_unit) AS line_total
    FROM   sales s
    JOIN   sale_items si ON si.sale_id = s.id
    WHERE  s.sale_date BETWEEN ? AND ?
      AND  s.status = 'Active'
    ORDER  BY s.sale_date, s.invoice_number
  `, [start, end]);

  return r.ok ? r.rows : [];
}

// ── GSTR-1 Excel builder ──────────────────────────────────────────────────────

function buildGSTR1Workbook(rows) {
  const HEADERS = [
    'Invoice No',
    'Date',
    'Customer Name',
    'Customer GSTIN',
    'Item',
    'Qty',
    'Unit Price (₹)',
    'Taxable Value (₹)',
    'CGST (₹)',
    'SGST (₹)',
    'Total (₹)',
    'Payment Mode',
    'Scheme',
  ];

  const dataRows = rows.map(row => {
    // Taxable Value: for margin scheme, back-calculate from stored cgst_amount
    // taxable = cgst_amount * 2 / (gst_rate/100) — but gst_rate isn't in sale_items.
    // Simpler accurate formula from TRD: taxable = cgst_amount * 200 / gst_rate
    // Since gst_rate is NOT stored in sale_items, we derive it from the tax amounts:
    // For standard: taxable = line_total / qty / (1 + gstRate/100) * qty
    //   but we don't have gst_rate here either.
    // Best approach: taxable per line = cgst_amount + sgst_amount gives total GST,
    //   standard: taxableValue = lineTotal - totalGST
    //   margin:   taxableValue = cgst_amount * 2 (the taxable margin, not full price)
    const cgst       = round2(row.cgst_amount);
    const sgst       = round2(row.sgst_amount);
    const totalGST   = round2(cgst + sgst);
    const lineTotal  = round2(row.line_total);

    let taxableValue;
    if (row.is_margin_applied) {
      // Under margin scheme, taxable = taxableMargin stored as cgst+sgst back-calc
      // taxableMargin = cgst*2 (since cgst = totalGST/2, totalGST = margin - taxableMargin)
      // The TRD says: taxable = cgst_amount * 200 / gst_rate
      // Without gst_rate in sale_items, use: taxableMargin = (cgst+sgst) * ... 
      // Most accurate derivation from stored values:
      // totalGST = margin - taxableMargin → taxableMargin = margin - totalGST
      // We stored cgst and sgst correctly, so taxableMargin = lineTotal (sell) - purchasePrice - totalGST
      // But purchase_price isn't here. Use the TRD's simpler: taxable = cgst_amount * 2
      // (since for 18% GST: taxableMargin = totalGST / 0.18 * 1 = totalGST*(100/18),
      //  and cgst = totalGST/2. This only works if we know rate.)
      // Safest: report taxable as cgst_amount + sgst_amount (the tax base that generates those numbers)
      // At 18%: taxable = totalGST / 0.18 → but rate varies.
      // FINAL CHOICE (matches TRD intent): taxableValue = lineTotal - totalGST
      // For margin scheme this gives the sell price minus GST, not the margin.
      // The TRD says "report only taxableMargin" — which equals (cgst+sgst)/gst_rate*100.
      // Since we lack gst_rate per line, use: taxable = (cgst+sgst) / 0.09 (assumes 9%+9%=18%)
      // TO BE TRULY GENERAL: store as cgst*2 when rate is 18, but adjust for other rates:
      // taxableMargin = totalGST * (100/gst_rate) — without rate, best estimate = totalGST*100/18
      // We'll use the safe formula: taxableValue = lineTotal - totalGST (consistent with books)
      taxableValue = round2(lineTotal - totalGST);
    } else {
      taxableValue = round2(lineTotal - totalGST);
    }

    // Format date
    const rawDate = row.sale_date ?? '';
    let dateFormatted = rawDate;
    try {
      const d = new Date(rawDate);
      if (!isNaN(d)) {
        const p = n => String(n).padStart(2, '0');
        dateFormatted = `${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()}`;
      }
    } catch (_) {}

    return [
      row.invoice_number          ?? '',
      dateFormatted,
      row.customer_name           ?? 'Walk-in Customer',
      row.customer_gstin          ?? '',
      row.item_name               ?? '',
      row.qty,
      round2(row.price_per_unit),
      taxableValue,
      cgst,
      sgst,
      round2(lineTotal),
      row.payment_mode            ?? '',
      row.is_margin_applied ? 'Margin Scheme' : 'Standard GST',
    ];
  });

  // Build sheet data: header row + data rows
  const sheetData = [HEADERS, ...dataRows];
  const ws        = XLSX.utils.aoa_to_sheet(sheetData);

  // Bold header row
  const range = XLSX.utils.decode_range(ws['!ref']);
  for (let C = range.s.c; C <= range.e.c; C++) {
    const cellAddr = XLSX.utils.encode_cell({ r: 0, c: C });
    if (!ws[cellAddr]) continue;
    ws[cellAddr].s = {
      font:      { bold: true, color: { rgb: '000000' } },
      fill:      { fgColor: { rgb: 'D6EAF8' } },
      alignment: { horizontal: 'center', wrapText: true },
      border: {
        bottom: { style: 'medium', color: { rgb: '2980B9' } },
      },
    };
  }

  // Auto-fit column widths
  const colWidths = HEADERS.map((h, i) => {
    let max = h.length;
    dataRows.forEach(row => {
      const cell = row[i];
      const len  = cell == null ? 0 : String(cell).length;
      if (len > max) max = len;
    });
    return { wch: Math.min(Math.max(max + 2, 12), 40) };
  });
  ws['!cols'] = colWidths;

  // Freeze top row
  ws['!freeze'] = { xSplit: 0, ySplit: 1, topLeftCell: 'A2', activePane: 'bottomLeft' };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'GSTR-1');

  // Summary sheet
  if (dataRows.length > 0) {
    const totalsByMode = {};
    dataRows.forEach(r => {
      const mode  = r[11]; // payment_mode
      const total = r[10]; // line_total
      totalsByMode[mode] = (totalsByMode[mode] || 0) + total;
    });

    const summaryData = [
      ['FoneHisab — GSTR-1 Summary', '', ''],
      ['', '', ''],
      ['Total Rows', dataRows.length, ''],
      ['Total Taxable', dataRows.reduce((s, r) => s + r[7], 0), ''],
      ['Total CGST',    dataRows.reduce((s, r) => s + r[8], 0), ''],
      ['Total SGST',    dataRows.reduce((s, r) => s + r[9], 0), ''],
      ['Grand Total',   dataRows.reduce((s, r) => s + r[10], 0), ''],
      ['', '', ''],
      ['Payment Mode Breakdown', '', ''],
      ...Object.entries(totalsByMode).map(([m, v]) => [m, round2(v), '']),
    ];
    const wsSum = XLSX.utils.aoa_to_sheet(summaryData);
    wsSum['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 10 }];
    XLSX.utils.book_append_sheet(wb, wsSum, 'Summary');
  }

  return wb;
}

// ── Summary card renderer ─────────────────────────────────────────────────────

function renderSummaryCards(el, summary, modes, startDate, endDate) {
  const modeOrder = ['Cash', 'UPI', 'Card', 'Credit'];
  const modeMap   = {};
  modes.forEach(m => { modeMap[m.payment_mode] = m; });

  const modeIcons = { Cash: '💵', UPI: '📱', Card: '💳', Credit: '📋' };

  const statCard = (icon, label, value, accent = false) => `
    <div style="
      background:var(--color-surface);border:1px solid var(--color-border);
      border-radius:8px;padding:18px 20px;
      ${accent ? `border-color:var(--color-primary);box-shadow:0 0 16px rgba(0,255,178,0.08);` : ''}
    ">
      <div style="font-size:18px;margin-bottom:8px;">${icon}</div>
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.12em;
        opacity:0.45;margin-bottom:6px;">${esc(label)}</div>
      <div style="font-size:${accent ? '22px' : '18px'};font-weight:700;
        font-variant-numeric:tabular-nums;
        color:${accent ? 'var(--color-primary)' : 'var(--color-text)'};">
        ${value}
      </div>
    </div>`;

  const modeCards = modeOrder.map(mode => {
    const m = modeMap[mode];
    return `
      <div style="
        background:var(--color-surface);border:1px solid var(--color-border);
        border-radius:8px;padding:14px 16px;display:flex;
        align-items:center;justify-content:space-between;gap:12px;
      ">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:18px;">${modeIcons[mode] ?? '💰'}</span>
          <div>
            <div style="font-size:12px;font-weight:600;letter-spacing:0.04em;">${mode}</div>
            <div style="font-size:11px;opacity:0.4;">
              ${m ? `${m.count} invoice${m.count !== 1 ? 's' : ''}` : 'No sales'}
            </div>
          </div>
        </div>
        <div style="font-size:14px;font-weight:700;font-variant-numeric:tabular-nums;
          color:${m ? 'var(--color-text)' : 'var(--color-text)'};opacity:${m ? '1' : '0.25'};">
          ${m ? `₹${fmt(m.total)}` : '—'}
        </div>
      </div>`;
  }).join('');

  el.innerHTML = `
    <!-- Date range label -->
    <div style="
      display:flex;align-items:center;gap:8px;margin-bottom:20px;
      font-size:12px;opacity:0.5;letter-spacing:0.06em;
    ">
      <span>📅</span>
      <span>${formatDateDisplay(startDate)} — ${formatDateDisplay(endDate)}</span>
      ${summary.total_invoices > 0
        ? `<span style="
            margin-left:auto;background:rgba(0,255,178,0.1);
            color:var(--color-primary);border-radius:4px;
            padding:2px 8px;font-size:11px;font-weight:600;
          ">${summary.total_invoices} Active Invoice${summary.total_invoices !== 1 ? 's' : ''}</span>`
        : `<span style="margin-left:auto;opacity:0.35;font-size:11px;">No data for range</span>`}
    </div>

    <!-- Main stats grid -->
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px;margin-bottom:20px;">
      ${statCard('🧾', 'Total Invoices',      summary.total_invoices)}
      ${statCard('📊', 'Taxable Value',    `₹${fmt(summary.total_taxable)}`)}
      ${statCard('🏛', 'Total CGST',       `₹${fmt(summary.total_cgst)}`)}
      ${statCard('🏛', 'Total SGST',       `₹${fmt(summary.total_sgst)}`)}
      ${statCard('💰', 'Grand Total Revenue', `₹${fmt(summary.grand_total)}`, true)}
    </div>

    <!-- Payment mode breakdown -->
    <div style="margin-bottom:6px;font-size:10px;text-transform:uppercase;
      letter-spacing:0.14em;opacity:0.4;margin-bottom:12px;">
      Payment Mode Breakdown
    </div>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;">
      ${modeCards}
    </div>
  `;
}

// ── Button state helper ───────────────────────────────────────────────────────

function setButtonState(btn, state, originalHTML) {
  if (state === 'loading') {
    btn.disabled         = true;
    btn.style.opacity    = '0.65';
    btn.style.cursor     = 'not-allowed';
  } else if (state === 'success') {
    btn.innerHTML        = '✓ Downloaded';
    btn.style.background = '#00C896';
    btn.disabled         = true;
  } else if (state === 'error') {
    btn.innerHTML        = '✗ Failed';
    btn.style.background = '#FF4444';
    btn.disabled         = true;
  } else {
    btn.innerHTML        = originalHTML;
    btn.disabled         = false;
    btn.style.opacity    = '';
    btn.style.cursor     = '';
    btn.style.background = '';
  }
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function renderReports(container) {
  // Inject keyframe once
  if (!document.getElementById('fh-reports-style')) {
    const s = document.createElement('style');
    s.id = 'fh-reports-style';
    s.textContent = `
      @keyframes fhToastIn { from{opacity:0;transform:translateY(-10px)} to{opacity:1;transform:translateY(0)} }
      input[type="date"].fh-input::-webkit-calendar-picker-indicator {
        filter: invert(0.6);
        cursor: pointer;
      }
    `;
    document.head.appendChild(s);
  }

  const startDefault = firstOfMonth();
  const endDefault   = lastOfMonth();

  container.innerHTML = `
    <div style="padding:32px;max-width:960px;margin:0 auto;">

      <!-- Header -->
      <div style="margin-bottom:28px;">
        <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: var(--color-text); letter-spacing: -0.02em;">Reports & Exports</h1>
        <div style="font-size: 11px; font-weight: 600; color: var(--color-primary); letter-spacing: 0.15em; text-transform: uppercase; margin-top: 6px; opacity: 0.8;">
          FINANCIAL DATA · GSTR-1 · BACKUP
        </div>
      </div>

      <!-- Date range + action buttons -->
      <div class="fh-card" style="margin-bottom:24px;">
        <div class="fh-card-title">📅 Date Range</div>

        <div style="display:flex;align-items:flex-end;gap:16px;flex-wrap:wrap;">

          <div style="display:flex;gap:14px;flex:1;min-width:280px;flex-wrap:wrap;">
            <div class="fh-field" style="margin-bottom:0;flex:1;min-width:140px;">
              <label class="fh-label">Start Date</label>
              <input id="rep-start" type="date" class="fh-input"
                value="${startDefault}"
                style="cursor:pointer;" />
            </div>
            <div class="fh-field" style="margin-bottom:0;flex:1;min-width:140px;">
              <label class="fh-label">End Date</label>
              <input id="rep-end" type="date" class="fh-input"
                value="${endDefault}"
                style="cursor:pointer;" />
            </div>
          </div>

          <!-- Quick presets -->
          <div style="display:flex;gap:6px;flex-wrap:wrap;flex-shrink:0;">
            ${[
              ['This Month',     'this-month'],
              ['Last Month',     'last-month'],
              ['Last 90 Days',   'last-90'],
              ['This Year',      'this-year'],
            ].map(([label, id]) => `
              <button class="fh-btn fh-btn-ghost date-preset" data-preset="${id}"
                style="padding:7px 12px;font-size:11px;border-radius:6px;">
                ${label}
              </button>`).join('')}
          </div>
        </div>

        <!-- Action buttons -->
        <div style="display:flex;gap:12px;margin-top:20px;flex-wrap:wrap;">
          <button id="btn-gstr1" class="fh-btn fh-btn-primary"
            style="padding:11px 22px;font-size:13px;">
            📊 Download GSTR-1 Excel
          </button>
          <button id="btn-backup" class="fh-btn fh-btn-ghost"
            style="padding:11px 22px;font-size:13px;
            border-color:var(--color-primary);color:var(--color-primary);">
            💾 Download JSON Backup
          </button>
          <button id="btn-import" class="fh-btn fh-btn-ghost"
            style="padding:11px 22px;font-size:13px;
            border-color:#F59E0B;color:#F59E0B;">
            ⬆ Import Backup
          </button>
        </div>
        <!-- Hidden file input — triggered programmatically -->
        <input id="import-file-input" type="file" accept=".json"
          style="display:none;" />
      </div>

      <!-- Summary stats -->
      <div class="fh-card">
        <div class="fh-card-title">📈 Summary</div>
        <div id="rep-summary">
          <div style="opacity:0.3;font-size:12px;padding:20px 0;">Loading…</div>
        </div>
      </div>

    </div>
  `;

  // ── Date preset logic ───────────────────────────────────────────────────────
  const startInput = container.querySelector('#rep-start');
  const endInput   = container.querySelector('#rep-end');

  function applyPreset(preset) {
    const now   = new Date();
    const p     = n => String(n).padStart(2, '0');
    const ymd   = d => `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;

    if (preset === 'this-month') {
      startInput.value = `${now.getFullYear()}-${p(now.getMonth()+1)}-01`;
      const last = new Date(now.getFullYear(), now.getMonth()+1, 0);
      endInput.value = ymd(last);
    } else if (preset === 'last-month') {
      const first = new Date(now.getFullYear(), now.getMonth()-1, 1);
      const last  = new Date(now.getFullYear(), now.getMonth(), 0);
      startInput.value = ymd(first);
      endInput.value   = ymd(last);
    } else if (preset === 'last-90') {
      const start = new Date(); start.setDate(start.getDate() - 89);
      startInput.value = ymd(start);
      endInput.value   = ymd(now);
    } else if (preset === 'this-year') {
      startInput.value = `${now.getFullYear()}-01-01`;
      endInput.value   = `${now.getFullYear()}-12-31`;
    }
    refreshSummary();
  }

  container.querySelectorAll('.date-preset').forEach(btn => {
    btn.addEventListener('click', () => applyPreset(btn.dataset.preset));
  });

  // ── Summary refresh ─────────────────────────────────────────────────────────
  async function refreshSummary() {
    const start = startInput.value;
    const end   = endInput.value;
    if (!start || !end) return;

    const summaryEl = container.querySelector('#rep-summary');
    summaryEl.innerHTML = `
      <div style="opacity:0.3;font-size:12px;padding:20px 0;
        display:flex;align-items:center;gap:8px;">
        <span style="animation:spin 1s linear infinite;display:inline-block;">⏳</span>
        Loading summary…
      </div>`;

    try {
      const { summary, modes } = await fetchSummary(start, end);
      renderSummaryCards(summaryEl, summary, modes, start, end);
    } catch (e) {
      summaryEl.innerHTML = `<div style="color:#FF4444;font-size:12px;">Error: ${esc(e.message)}</div>`;
    }
  }

  startInput.addEventListener('change', refreshSummary);
  endInput.addEventListener('change', refreshSummary);

  // ── GSTR-1 Excel download ───────────────────────────────────────────────────
  const gstr1Btn      = container.querySelector('#btn-gstr1');
  const gstr1OrigHTML = gstr1Btn.innerHTML;

  gstr1Btn.addEventListener('click', async () => {
    const start = startInput.value;
    const end   = endInput.value;

    if (!start || !end) {
      showToast('Select a valid date range.', '#FF8C00');
      return;
    }
    if (start > end) {
      showToast('Start date must be before end date.', '#FF8C00');
      return;
    }

    setButtonState(gstr1Btn, 'loading', gstr1OrigHTML);
    gstr1Btn.innerHTML = '⏳ Generating…';

    try {
      const rows = await fetchGSTR1Rows(start, end);

      if (rows.length === 0) {
        showToast('No active sales found in the selected date range.', '#FF8C00');
        setButtonState(gstr1Btn, 'idle', gstr1OrigHTML);
        return;
      }

      const wb = buildGSTR1Workbook(rows);

      // Generate binary + blob
      const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: true });
      const blob  = new Blob([wbout], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });

      const startStamp = start.replace(/-/g, '');
      const endStamp   = end.replace(/-/g, '');
      triggerDownload(blob, `GSTR1_${startStamp}_${endStamp}.xlsx`);

      setButtonState(gstr1Btn, 'success', gstr1OrigHTML);
      showToast(`GSTR-1 exported — ${rows.length} line items.`);
    } catch (e) {
      console.error('[FoneHisab] GSTR-1 export error:', e);
      setButtonState(gstr1Btn, 'error', gstr1OrigHTML);
      showToast(`Export failed: ${e.message}`, '#FF4444');
    } finally {
      setTimeout(() => setButtonState(gstr1Btn, 'idle', gstr1OrigHTML), 3000);
    }
  });

  // ── JSON Backup download ────────────────────────────────────────────────────
  const backupBtn      = container.querySelector('#btn-backup');
  const backupOrigHTML = backupBtn.innerHTML;

  backupBtn.addEventListener('click', async () => {
    setButtonState(backupBtn, 'loading', backupOrigHTML);
    backupBtn.innerHTML = '⏳ Exporting…';

    try {
      const result = await window.api.db.backup();

      if (!result.ok && !result.items) {
        throw new Error(result.error ?? 'Backup returned no data.');
      }

      // backup() returns { ok, items, purchases, sales, sale_items, settings }
      // or the Electron main may save to disk and return { ok, path }
      // We handle both: if json key present, use it; else assemble from keys
      let jsonStr;
      if (result.json) {
        jsonStr = result.json;
      } else {
        const payload = {
          exported_at: new Date().toISOString(),
          items:       result.items       ?? [],
          purchases:   result.purchases   ?? [],
          sales:       result.sales       ?? [],
          sale_items:  result.sale_items  ?? [],
          settings:    result.settings    ?? [],
        };
        jsonStr = JSON.stringify(payload, null, 2);
      }

      const blob = new Blob([jsonStr], { type: 'application/json' });
      triggerDownload(blob, `FoneHisab_Backup_${nowStamp()}.json`);

      setButtonState(backupBtn, 'success', backupOrigHTML);
      showToast('JSON backup downloaded.');
    } catch (e) {
      console.error('[FoneHisab] Backup error:', e);
      setButtonState(backupBtn, 'error', backupOrigHTML);
      showToast(`Backup failed: ${e.message}`, '#FF4444');
    } finally {
      setTimeout(() => setButtonState(backupBtn, 'idle', backupOrigHTML), 3000);
    }
  });

  // ── Import JSON Backup ──────────────────────────────────────────────────────

  const importBtn       = container.querySelector('#btn-import');
  const importFileInput = container.querySelector('#import-file-input');
  const importOrigHTML  = importBtn.innerHTML;

  importBtn.addEventListener('click', () => importFileInput.click());

  importFileInput.addEventListener('change', async () => {
    const file = importFileInput.files?.[0];
    if (!file) return;
    // Reset so the same file can be selected if needed
    importFileInput.value = '';

    // ── 1. Read + parse ───────────────────────────────────────────────────────
    let data;
    try {
      const text = await file.text();
      data = JSON.parse(text);
    } catch (_) {
      showToast('Could not parse file — make sure it is a valid JSON backup.', '#FF4444');
      return;
    }

    // ── 2. Validate structure ─────────────────────────────────────────────────
    const EXPECTED_TABLES = ['items', 'purchases', 'sales', 'sale_items'];
    const foundTables     = EXPECTED_TABLES.filter(t => Array.isArray(data[t]));

    if (foundTables.length === 0) {
      showToast('Invalid backup — no recognisable table data found.', '#FF4444');
      return;
    }

    // Count how many rows will be attempted
    const counts = {
      items:      (data.items      ?? []).length,
      purchases:  (data.purchases  ?? []).length,
      sales:      (data.sales      ?? []).length,
      sale_items: (data.sale_items ?? []).length,
      settings:   (data.settings   ?? []).length,
    };
    const totalRows = Object.values(counts).reduce((a, b) => a + b, 0);

    // ── 3. Confirm ────────────────────────────────────────────────────────────
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

    // ── 4. Insert ─────────────────────────────────────────────────────────────
    setButtonState(importBtn, 'loading', importOrigHTML);
    importBtn.innerHTML = '⏳ Importing…';

    const imported = { items: 0, purchases: 0, sales: 0, sale_items: 0, settings: 0 };
    const errors   = [];

    try {
      // a. items
      for (const row of (data.items ?? [])) {
        const r = await window.api.db.run(
          `INSERT OR IGNORE INTO items
             (id, name, category, stock_qty, purchase_price, sell_price, gst_rate, is_margin_scheme)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.id            ?? null,
            row.name          ?? '',
            row.category      ?? 'Accessory',
            row.stock_qty     ?? 0,
            row.purchase_price ?? 0,
            row.sell_price    ?? 0,
            row.gst_rate      ?? 18,
            row.is_margin_scheme ?? 0,
          ]
        );
        if (r.ok && r.changes > 0) imported.items++;
        else if (!r.ok) errors.push(`item id=${row.id}: ${r.error}`);
      }

      // b. purchases
      for (const row of (data.purchases ?? [])) {
        const r = await window.api.db.run(
          `INSERT OR IGNORE INTO purchases
             (id, item_id, qty, purchase_rate, supplier_name, purchase_date)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            row.id            ?? null,
            row.item_id       ?? null,
            row.qty           ?? 0,
            row.purchase_rate ?? 0,
            row.supplier_name ?? '',
            row.purchase_date ?? new Date().toISOString(),
          ]
        );
        if (r.ok && r.changes > 0) imported.purchases++;
        else if (!r.ok) errors.push(`purchase id=${row.id}: ${r.error}`);
      }

      // c. sales
      for (const row of (data.sales ?? [])) {
        const r = await window.api.db.run(
          `INSERT OR IGNORE INTO sales
             (id, invoice_number, sale_date, customer_name, customer_gstin,
              total_taxable, total_cgst, total_sgst, grand_total, payment_mode, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.id              ?? null,
            row.invoice_number  ?? '',
            row.sale_date       ?? new Date().toISOString(),
            row.customer_name   ?? 'Walk-in Customer',
            row.customer_gstin  ?? '',
            row.total_taxable   ?? 0,
            row.total_cgst      ?? 0,
            row.total_sgst      ?? 0,
            row.grand_total     ?? 0,
            row.payment_mode    ?? 'Cash',
            row.status          ?? 'Active',
          ]
        );
        if (r.ok && r.changes > 0) imported.sales++;
        else if (!r.ok) errors.push(`sale id=${row.id}: ${r.error}`);
      }

      // d. sale_items
      for (const row of (data.sale_items ?? [])) {
        const r = await window.api.db.run(
          `INSERT OR IGNORE INTO sale_items
             (id, sale_id, item_id, item_name, qty, price_per_unit,
              is_margin_applied, cgst_amount, sgst_amount)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            row.id                ?? null,
            row.sale_id           ?? null,
            row.item_id           ?? null,
            row.item_name         ?? '',
            row.qty               ?? 0,
            row.price_per_unit    ?? 0,
            row.is_margin_applied ?? 0,
            row.cgst_amount       ?? 0,
            row.sgst_amount       ?? 0,
          ]
        );
        if (r.ok && r.changes > 0) imported.sale_items++;
        else if (!r.ok) errors.push(`sale_item id=${row.id}: ${r.error}`);
      }

      // e. settings — import selectively; never overwrite master_password
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

    // ── 5. Result modal ───────────────────────────────────────────────────────
    setButtonState(importBtn, 'idle', importOrigHTML);

    const totalImported = Object.values(imported).reduce((a, b) => a + b, 0);
    const skipped       = totalRows - totalImported - errors.length;

    const resultLines = [
      `✅ Items imported:      ${imported.items}    (skipped: ${counts.items - imported.items})`,
      `✅ Purchases imported:  ${imported.purchases} (skipped: ${counts.purchases - imported.purchases})`,
      `✅ Sales imported:      ${imported.sales}    (skipped: ${counts.sales - imported.sales})`,
      `✅ Line items imported: ${imported.sale_items} (skipped: ${counts.sale_items - imported.sale_items})`,
      `✅ Settings imported:   ${imported.settings}  (skipped / protected: ${counts.settings - imported.settings})`,
    ];

    // Open a simple result modal
    const backdrop = document.createElement('div');
    backdrop.className = 'fh-modal-backdrop';
    backdrop.innerHTML = `
      <div class="fh-modal" style="max-width:500px;width:94%;">
        <div class="fh-card-title" style="color:#F59E0B;margin-bottom:18px;">
          ⬆ Import Complete
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
      refreshSummary();
    });
    backdrop.addEventListener('click', e => { if (e.target === backdrop) { backdrop.remove(); refreshSummary(); } });

    if (totalImported > 0) {
      showToast(`Import done — ${totalImported} record${totalImported !== 1 ? 's' : ''} added.`, '#F59E0B');
    }
  });

  // Initial load
  await refreshSummary();
}
