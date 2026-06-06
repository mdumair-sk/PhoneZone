// src/utils/print.js
// ─────────────────────────────────────────────────────────────────────────────
// Phone Zone — Professional A4 Invoice Print Layout
// ─────────────────────────────────────────────────────────────────────────────
import logoUrl from '../../assets/logo-without-bg.png';

function fmt(n, d = 2) {
  return Number(n ?? 0).toLocaleString('en-IN', {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

function escPrint(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function numberToWords(amount) {
  const words = {
    0: 'Zero', 1: 'One', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine',
    10: 'Ten', 11: 'Eleven', 12: 'Twelve', 13: 'Thirteen', 14: 'Fourteen', 15: 'Fifteen', 16: 'Sixteen', 17: 'Seventeen', 18: 'Eighteen', 19: 'Nineteen',
    20: 'Twenty', 30: 'Thirty', 40: 'Forty', 50: 'Fifty', 60: 'Sixty', 70: 'Seventy', 80: 'Eighty', 90: 'Ninety'
  };

  function convertLessThanThousand(num) {
    if (num === 0) return '';
    let res = '';
    if (num >= 100) {
      res += words[Math.floor(num / 100)] + ' Hundred ';
      num %= 100;
    }
    if (num > 0) {
      if (num < 20) {
        res += words[num];
      } else {
        res += words[Math.floor(num / 10) * 10];
        if (num % 10 > 0) {
          res += ' ' + words[num % 10];
        }
      }
    }
    return res.trim();
  }

  const num = Math.floor(amount);
  const paise = Math.round((amount - num) * 100);

  if (num === 0) {
    if (paise > 0) {
      return 'Rs. ' + convertLessThanThousand(paise) + ' Paise Only';
    }
    return 'Rs. Zero Only';
  }

  let result = '';
  let crores = Math.floor(num / 10000000);
  let remaining = num % 10000000;
  let lakhs = Math.floor(remaining / 100000);
  remaining %= 100000;
  let thousands = Math.floor(remaining / 1000);
  remaining %= 1000;

  if (crores > 0) {
    result += convertLessThanThousand(crores) + ' Crore ';
  }
  if (lakhs > 0) {
    result += convertLessThanThousand(lakhs) + ' Lakh ';
  }
  if (thousands > 0) {
    result += convertLessThanThousand(thousands) + ' Thousand ';
  }
  if (remaining > 0) {
    result += convertLessThanThousand(remaining);
  }

  result = result.trim();
  if (paise > 0) {
    result += ' and ' + convertLessThanThousand(paise) + ' Paise';
  }

  return 'Rs. ' + result + ' Only';
}

export async function printInvoice(saleId, settings) {
  const saleRes = await window.api.db.query(
    `SELECT * FROM sales WHERE id = ?`, [saleId]
  );
  if (!saleRes.ok || !saleRes.rows.length) {
    window.showToast?.('Could not fetch invoice for printing.', 'error');
    return;
  }
  const sale = saleRes.rows[0];

  const itemsRes = await window.api.db.query(
    `SELECT * FROM sale_items WHERE sale_id = ?`, [saleId]
  );
  const lineItems = itemsRes.ok ? itemsRes.rows : [];

  // Fetch customer details (phone) if not walk-in
  let customerPhone = '';
  let customerGstin = sale.customer_gstin || '';
  if (sale.customer_name && sale.customer_name.toLowerCase() !== 'walk-in customer') {
    const custRes = await window.api.db.query(
      `SELECT phone, gstin FROM customers WHERE name = ? LIMIT 1`,
      [sale.customer_name]
    );
    if (custRes.ok && custRes.rows.length > 0) {
      customerPhone = custRes.rows[0].phone || '';
      if (!customerGstin) customerGstin = custRes.rows[0].gstin || '';
    }
  }

  // Fetch customer previous outstanding balance
  let prevBalance = 0;
  if (sale.customer_name && sale.customer_name.toLowerCase() !== 'walk-in customer') {
    const prevBalRes = await window.api.db.query(
      `SELECT COALESCE(SUM(grand_total - amount_paid), 0) AS prev_bal 
       FROM sales 
       WHERE customer_name = ? 
         AND status = 'Active' 
         AND id != ?`,
      [sale.customer_name, sale.id]
    );
    if (prevBalRes.ok && prevBalRes.rows.length > 0) {
      prevBalance = prevBalRes.rows[0].prev_bal;
    }
  }

  // Format date
  const d = new Date(sale.sale_date);
  const pad2 = n => String(n).padStart(2, '0');
  const dateFormatted = isNaN(d)
    ? sale.sale_date
    : `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

  const shopName = settings?.shop_name || 'Phone Zone';
  const shopAddress = settings?.shop_address || '';
  const shopGstin = settings?.shop_gstin || '';
  const shopEmail = settings?.shop_email || '';
  const shopPhone = settings?.shop_phone || '';

  // Bank details from settings (no hardcoded defaults)
  const bankName = settings?.bank_name || '';
  const bankAccName = settings?.bank_acc_name || '';
  const bankAccNo = settings?.bank_acc_no || '';
  const bankIfsc = settings?.bank_ifsc || '';
  const bankBranch = settings?.bank_branch || '';

  const hasBankInfo = bankName || bankAccName || bankAccNo || bankIfsc || bankBranch;

  // Build the items list
  const lineRows = lineItems.map((li, idx) => {
    const amount = round2(li.qty * li.price_per_unit);
    const hasImei = li.imei_number && li.imei_number.trim();

    // Item description with IMEI on next line
    const itemDesc = hasImei
      ? `${escPrint(li.item_name)}<br/><span style="font-size:10px;color:#555;font-style:italic;">[IMEI: ${escPrint(li.imei_number)}]</span>`
      : escPrint(li.item_name);

    return `
      <tr style="border-bottom:1px solid #ddd; height: 35px;">
        <td style="padding:8px 8px;font-size:12px;text-align:center;border-right:1px solid #ddd;">${idx + 1}</td>
        <td style="padding:8px 8px;font-size:11px;text-align:center;font-variant-numeric:tabular-nums;border-right:1px solid #ddd;">${escPrint(li.item_hsn || '')}</td>
        <td style="padding:8px 8px;font-size:12px;border-right:1px solid #ddd;">${itemDesc}</td>
        <td style="padding:8px 8px;text-align:center;font-size:12px;border-right:1px solid #ddd;">${li.qty}</td>
        <td style="padding:8px 8px;text-align:right;font-size:12px;border-right:1px solid #ddd;">₹${fmt(li.price_per_unit)}</td>
        <td style="padding:8px 8px;text-align:right;font-size:12px;font-weight:600;">₹${fmt(amount)}</td>
      </tr>`;
  });

  // Pad the table to exactly 10 rows for a static, neat ledger look
  const minRows = 10;
  for (let i = lineItems.length; i < minRows; i++) {
    lineRows.push(`
      <tr style="border-bottom:1px solid #ddd; height: 35px;">
        <td style="padding:8px 8px;font-size:12px;text-align:center;border-right:1px solid #ddd;">&nbsp;</td>
        <td style="padding:8px 8px;font-size:11px;text-align:center;border-right:1px solid #ddd;">&nbsp;</td>
        <td style="padding:8px 8px;font-size:12px;border-right:1px solid #ddd;">&nbsp;</td>
        <td style="padding:8px 8px;text-align:center;border-right:1px solid #ddd;">&nbsp;</td>
        <td style="padding:8px 8px;text-align:right;font-size:12px;border-right:1px solid #ddd;">&nbsp;</td>
        <td style="padding:8px 8px;text-align:right;font-size:12px;font-weight:600;">&nbsp;</td>
      </tr>`);
  }

  // Determine if ANY line has margin scheme (for totals masking)
  const hasMarginItems = lineItems.some(li => li.is_margin_applied);
  const isEstimate = sale.invoice_type === 'Estimate';

  const currentDue = sale.grand_total - sale.amount_paid;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <title>Invoice ${escPrint(sale.invoice_number)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Arial', 'Helvetica Neue', Helvetica, sans-serif;
      font-size: 12px;
      color: #000;
      background: #fff;
      padding: 12mm 12mm;
      max-width: 210mm;
      margin: 0 auto;
      position: relative;
    }
    @page { size: A4 portrait; margin: 12mm; }
    @media print {
      body { padding: 0; }
      /* Hide all UI chrome */
      aside, nav, .sidebar, .nav-item, .fh-btn,
      #app-container > div:first-child,
      .no-print { display: none !important; }
    }
    table { width: 100%; border-collapse: collapse; }
    .divider { border: none; border-top: 1px solid #ccc; margin: 8px 0; }
    .divider-bold { border: none; border-top: 2px solid #000; margin: 8px 0; }

    /* Signature Area styling */
    .signature-area {
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      margin-top: 35px;
      padding-top: 20px;
      position: relative;
      z-index: 1;
    }
    .sig-left {
      border-top: 1px solid #777;
      padding-top: 6px;
      min-width: 180px;
      font-size: 11px;
      text-align: center;
      font-weight: bold;
    }
    .sig-right {
      min-width: 180px;
      text-align: center;
    }
    .sig-line-trigger {
      border-top: 1px solid #777;
      padding-top: 6px;
      font-size: 11px;
      font-weight: bold;
    }
  </style>
</head>
<body>

  <!-- Shop Header -->
  <div style="text-align:center;margin-bottom:12px;position:relative;z-index:1;">
    <div style="font-size:22px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:#000;">${escPrint(shopName)}</div>
    ${shopAddress ? `<div style="font-size:11px;color:#333;margin-top:4px;white-space:pre-line;">${escPrint(shopAddress)}</div>` : ''}
    <div style="font-size:11px;margin-top:4px;color:#333;">
      ${shopPhone ? `Phone: ${escPrint(shopPhone)}` : ''}${shopPhone && shopEmail ? ' | ' : ''}${shopEmail ? `Email: ${escPrint(shopEmail)}` : ''}
    </div>
    ${(shopGstin && !isEstimate) ? `<div style="font-size:12px;margin-top:4px;color:#000;"><strong>GSTIN: ${escPrint(shopGstin)}</strong></div>` : ''}
  </div>

  <hr class="divider-bold"/>

  <!-- Tax Invoice Title -->
  <div style="text-align:center;font-size:15px;font-weight:800;letter-spacing:0.14em;
    text-transform:uppercase;margin:10px 0;position:relative;z-index:1;color:#000;">${isEstimate ? 'COMMERCIAL ESTIMATE' : 'TAX INVOICE'}</div>

  <hr class="divider"/>

  <!-- Dual-Column Metadata -->
  <div style="display:flex;justify-content:space-between;margin-bottom:14px;position:relative;z-index:1;">
    <!-- Left Column: Buyer -->
    <div style="font-size:12px;line-height:1.8;">
      <div><strong style="color:#000;">Customer:</strong> ${escPrint(sale.customer_name || 'Walk-in Customer')}</div>
      ${customerPhone ? `<div><strong style="color:#000;">Phone:</strong> ${escPrint(customerPhone)}</div>` : ''}
      ${(customerGstin && !isEstimate) ? `<div><strong style="color:#000;">Customer GSTIN:</strong> ${escPrint(customerGstin)}</div>` : ''}
    </div>
    <!-- Right Column: Document -->
    <div style="font-size:12px;line-height:1.8;text-align:right;">
      <div><strong style="color:#000;">Invoice No:</strong> ${escPrint(sale.invoice_number)}</div>
      <div><strong style="color:#000;">Date:</strong> ${dateFormatted}</div>
      <div><strong style="color:#000;">Payment Mode:</strong> ${escPrint(sale.payment_mode)}</div>
    </div>
  </div>

  <!-- Table Container with Watermark -->
  <div style="position: relative; z-index: 1;">
    <!-- Watermark Background -->
    <div style="
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 440px;
      height: 440px;
      opacity: 0.04;
      pointer-events: none;
      z-index: 0;
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <img src="${logoUrl}" style="width: 100%; height: 100%; object-fit: contain; filter: invert(1) grayscale(1);" />
    </div>

    <!-- Line Items Table -->
    <table style="width:100%; border: 1px solid #bbb; border-collapse: collapse; margin-bottom:0;position:relative;z-index:1;">
      <thead>
        <tr style="border-bottom:2px solid #000;background:#f2f2f2;height:35px;">
          <th style="padding:8px 8px;text-align:center;font-size:11px;width:45px;border-right:1px solid #bbb;color:#000;">S.No.</th>
          <th style="padding:8px 8px;text-align:center;font-size:11px;width:75px;border-right:1px solid #bbb;color:#000;">HSN</th>
          <th style="padding:8px 8px;text-align:left;font-size:11px;border-right:1px solid #bbb;color:#000;">Item Description</th>
          <th style="padding:8px 8px;text-align:center;font-size:11px;width:45px;border-right:1px solid #bbb;color:#000;">Qty</th>
          <th style="padding:8px 8px;text-align:right;font-size:11px;width:95px;border-right:1px solid #bbb;color:#000;">Rate</th>
          <th style="padding:8px 8px;text-align:right;font-size:11px;width:110px;color:#000;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${lineRows.join('')}
      </tbody>
    </table>
  </div>

  <!-- Dual Layout below items: Terms/Bank on left, Totals on right -->
  <div style="display:flex;justify-content:space-between;margin-top:14px;position:relative;z-index:1;gap:20px;">
    <!-- Left Column: Bank Details & Terms -->
    <div style="flex:1;max-width:400px;display:flex;flex-direction:column;gap:12px;">
      ${hasBankInfo ? `
      <div>
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:4px;color:#000;">Bank Details</div>
        <table style="width:auto;font-size:10px;line-height:1.6;">
          ${bankName ? `<tr><td style="padding:1px 8px 1px 0;opacity:0.8;">Bank Name</td><td style="padding:1px 0;font-weight:600;color:#000;">${escPrint(bankName)}</td></tr>` : ''}
          ${bankAccName ? `<tr><td style="padding:1px 8px 1px 0;opacity:0.8;">Account Name</td><td style="padding:1px 0;font-weight:600;color:#000;">${escPrint(bankAccName)}</td></tr>` : ''}
          ${bankAccNo ? `<tr><td style="padding:1px 8px 1px 0;opacity:0.8;">Account No.</td><td style="padding:1px 0;font-weight:600;color:#000;font-variant-numeric:tabular-nums;">${escPrint(bankAccNo)}</td></tr>` : ''}
          ${bankIfsc ? `<tr><td style="padding:1px 8px 1px 0;opacity:0.8;">IFSC Code</td><td style="padding:1px 0;font-weight:600;color:#000;font-variant-numeric:tabular-nums;">${escPrint(bankIfsc)}</td></tr>` : ''}
          ${bankBranch ? `<tr><td style="padding:1px 8px 1px 0;opacity:0.8;">Branch</td><td style="padding:1px 0;font-weight:600;color:#000;">${escPrint(bankBranch)}</td></tr>` : ''}
        </table>
      </div>
      ` : ''}

      <!-- Terms & Conditions -->
      <div style="font-size:9.5px;color:#444;line-height:1.5;">
        <div style="font-weight:700;text-transform:uppercase;letter-spacing:0.08em;margin-bottom:2px;color:#333;">Terms & Conditions</div>
        <div>1. Goods once sold will not be returned or refunded.</div>
        <div>2. Interest at 24% per annum applies on delayed payments.</div>
      </div>
    </div>

    <!-- Right Column: Totals Pane -->
    <div style="display:flex;flex-direction:column;align-items:flex-end;">
      <div style="width:300px;border:1px solid #ccc;border-radius:6px;padding:12px;background:#fafafa;">
        ${(hasMarginItems && !isEstimate) ? `
        <div style="font-size:11px;color:#333;font-style:italic;margin-bottom:6px;text-align:center;">
          GST paid under Margin Scheme
        </div>` : `
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#333;margin-bottom:5px;">
          <span>${isEstimate ? 'Subtotal' : 'SUB TOTAL (Base)'}</span>
          <span style="font-variant-numeric:tabular-nums;font-weight:500;">₹${fmt(sale.total_taxable)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#333;margin-bottom:5px;">
          <span>CGST</span>
          <span style="font-variant-numeric:tabular-nums;font-weight:500;">₹${isEstimate ? '0.00' : fmt(sale.total_cgst)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#333;margin-bottom:8px;">
          <span>SGST</span>
          <span style="font-variant-numeric:tabular-nums;font-weight:500;">₹${isEstimate ? '0.00' : fmt(sale.total_sgst)}</span>
        </div>
        `}

        <div style="display:flex;justify-content:space-between;font-size:13px;font-weight:800;border-top:2px solid #000;padding-top:8px;margin-bottom:8px;color:#000;">
          <span>GRAND TOTAL</span>
          <span style="font-variant-numeric:tabular-nums;font-size:14px;">₹${fmt(sale.grand_total)}</span>
        </div>

        ${(sale.payment_mode === 'Credit' || currentDue > 0) ? `
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#333;margin-bottom:4px;border-top:1px dashed #bbb;padding-top:6px;">
          <span>PAID</span>
          <span style="font-variant-numeric:tabular-nums;font-weight:500;">₹${fmt(sale.amount_paid)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:bold;color:#000;margin-bottom:4px;">
          <span>BALANCE</span>
          <span style="font-variant-numeric:tabular-nums;">₹${fmt(currentDue)}</span>
        </div>
        ` : ''}

        ${(prevBalance > 0) ? `
        <div style="display:flex;justify-content:space-between;font-size:11px;color:#333;margin-bottom:4px;border-top:1px solid #ccc;padding-top:4px;">
          <span>PREVIOUS BALANCE</span>
          <span style="font-variant-numeric:tabular-nums;font-weight:500;">₹${fmt(prevBalance)}</span>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;font-weight:bold;color:#000;border-top:1px solid #bbb;padding-top:4px;margin-top:2px;">
          <span>TOTAL OUTSTANDING</span>
          <span style="font-variant-numeric:tabular-nums;font-size:13px;">₹${fmt(prevBalance + currentDue)}</span>
        </div>
        ` : ''}
      </div>

      <!-- Amount in Words -->
      <div style="font-style:italic;font-size:10px;margin-top:6px;text-align:right;font-weight:bold;color:#000;max-width:300px;line-height:1.4;">
        ${escPrint(numberToWords(sale.grand_total))}
      </div>
    </div>
  </div>

  <hr class="divider" style="margin-top:20px;"/>

  <!-- Declaration -->
  <div style="margin-bottom:12px;font-size:9.5px;color:#333;line-height:1.5;font-style:italic;position:relative;z-index:1;">
    ${isEstimate 
      ? 'This document is a commercial inventory valuation estimate and does not represent an official tax ledger invoice.' 
      : 'We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct. The goods sold are intended for direct consumption by the end consumer. All disputes are subject to local jurisdiction.'}
  </div>

  <!-- Dual Signature blocks layout mapping -->
  <div class="signature-area">
    <div class="sig-left">
      Customer's Sign. with Stamp
    </div>
    <div class="sig-right">
      <div style="font-size: 10px; font-weight: bold; margin-bottom: 35px; color:#000;">For ${escPrint(shopName)}</div>
      <div class="sig-line-trigger">Authorised Signatory</div>
    </div>
  </div>

  <div style="text-align:center;font-size:9px;color:#777;margin-top:20px;position:relative;z-index:1;">
    This is a computer-generated invoice.
  </div>

</body>
</html>`;

  const pw = window.open('', '_blank', 'width=800,height=1000');
  if (!pw) { window.showToast?.('Pop-up blocked. Allow pop-ups for printing.', 'warning'); return; }
  pw.document.open();
  pw.document.write(html);
  pw.document.close();
  pw.focus();
  setTimeout(() => { pw.print(); pw.close(); }, 800);
}
