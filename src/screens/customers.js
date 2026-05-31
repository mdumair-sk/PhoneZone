// src/screens/customers.js
// ─────────────────────────────────────────────────────────────────────────────
// Customer Ledger Screen

function esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmt(n) {
  return Number(n ?? 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function openModal(html) {
  const backdrop = document.createElement('div');
  backdrop.className = 'fh-modal-backdrop';
  backdrop.innerHTML = `<div class="fh-modal" style="max-width:600px;width:94%;">${html}</div>`;
  document.body.appendChild(backdrop);
  backdrop.addEventListener('click', e => { if (e.target === backdrop) backdrop.remove(); });
  return backdrop;
}

export async function renderCustomers(container) {
  container.innerHTML = `
    <div style="padding: 24px; max-width: 1000px; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; height: 100%;">
      <div style="display: flex; justify-content: space-between; align-items: flex-end; flex-shrink: 0;">
        <div>
          <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: var(--color-text); letter-spacing: -0.02em;">Customer Ledger</h1>
          <div style="font-size: 11px; font-weight: 600; color: var(--color-primary); letter-spacing: 0.15em; text-transform: uppercase; margin-top: 6px; opacity: 0.8;">
            DIRECTORY · CREDIT BALANCE · HISTORY
          </div>
        </div>
        <div style="position: relative; width: 300px; margin-bottom: 2px;">
          <input type="text" id="cust-search" class="fh-input" placeholder="🔍 Search customers..." style="width: 100%;" />
        </div>
      </div>

      <div class="fh-card" style="flex: 1; display: flex; flex-direction: column; padding: 0; overflow: hidden;">
        <div style="overflow-y: auto; flex: 1;">
          <table class="fh-table" style="width: 100%; border-collapse: collapse;">
            <thead style="position: sticky; top: 0; background: var(--color-surface); z-index: 10;">
              <tr>
                <th style="padding: 14px 20px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.5;">Name</th>
                <th style="padding: 14px 20px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.5;">Phone</th>
                <th style="padding: 14px 20px; text-align: right; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.5;">Total Purchases</th>
                <th style="padding: 14px 20px; text-align: right; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.5;">Credit Balance</th>
              </tr>
            </thead>
            <tbody id="cust-tbody">
              <tr><td colspan="4" style="text-align:center; padding: 40px; opacity: 0.5;">Loading...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  await fetchAndRenderCustomers(container);

  container.querySelector('#cust-search').addEventListener('input', (e) => {
    fetchAndRenderCustomers(container, e.target.value.trim());
  });
}

async function fetchAndRenderCustomers(container, searchQuery = '') {
  const tbody = container.querySelector('#cust-tbody');
  if (!tbody) return;

  try {
    let sql = `
      SELECT c.*, 
        COALESCE((SELECT SUM(grand_total - amount_paid) FROM sales s WHERE s.customer_name = c.name AND s.grand_total > s.amount_paid AND s.status = 'Active'), 0) as credit_balance
      FROM customers c
    `;
    let params = [];

    if (searchQuery) {
      sql += ` WHERE c.name LIKE ? OR c.phone LIKE ?`;
      params.push(`%${searchQuery}%`, `%${searchQuery}%`);
    }

    sql += ` ORDER BY c.total_purchases DESC, c.name ASC`;

    const res = await window.api.db.query(sql, params);
    const customers = res.ok ? res.rows : [];

    if (customers.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 40px; opacity: 0.5;">No customers found.</td></tr>`;
      return;
    }

    tbody.innerHTML = customers.map(c => `
      <tr class="cust-row" data-name="${esc(c.name)}" style="cursor: pointer; border-bottom: 1px solid var(--color-border); transition: background 0.15s;">
        <td style="padding: 14px 20px; font-weight: 600;">${esc(c.name)}</td>
        <td style="padding: 14px 20px; font-variant-numeric: tabular-nums; opacity: 0.8;">${esc(c.phone) || '-'}</td>
        <td style="padding: 14px 20px; text-align: right; font-variant-numeric: tabular-nums; font-weight: 600;">₹${fmt(c.total_purchases)}</td>
        <td style="padding: 14px 20px; text-align: right; font-variant-numeric: tabular-nums; font-weight: 700; color: ${c.credit_balance > 0 ? '#FF8C00' : 'inherit'};">
          ₹${fmt(c.credit_balance)}
        </td>
      </tr>
    `).join('');

    tbody.querySelectorAll('.cust-row').forEach(tr => {
      tr.addEventListener('mouseover', () => tr.style.background = 'rgba(255,255,255,0.03)');
      tr.addEventListener('mouseout', () => tr.style.background = 'transparent');
      tr.addEventListener('click', () => showCustomerDetails(tr.dataset.name));
    });

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 40px; color: #FF4444;">Error: ${esc(err.message)}</td></tr>`;
  }
}

async function showCustomerDetails(customerName) {
  try {
    const res = await window.api.db.query(
      `SELECT id, invoice_number, sale_date, grand_total, amount_paid, payment_mode, status 
       FROM sales 
       WHERE customer_name = ? 
       ORDER BY sale_date DESC`,
      [customerName]
    );

    const invoices = res.ok ? res.rows : [];

    const modal = openModal(`
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
        <h2 style="margin: 0; font-family: 'Syne', sans-serif; font-size: 20px;">History: ${esc(customerName)}</h2>
        <button class="fh-btn fh-btn-ghost" onclick="this.closest('.fh-modal-backdrop').remove()">Close</button>
      </div>

      <div style="max-height: 400px; overflow-y: auto; background: var(--color-bg); border-radius: 6px; border: 1px solid var(--color-border);">
        ${invoices.length === 0 ? '<div style="padding: 20px; text-align: center; opacity: 0.5;">No invoices found.</div>' : `
          <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead style="position: sticky; top: 0; background: var(--color-surface);">
              <tr>
                <th style="padding: 10px; text-align: left; opacity: 0.6;">Date</th>
                <th style="padding: 10px; text-align: left; opacity: 0.6;">Invoice No</th>
                <th style="padding: 10px; text-align: right; opacity: 0.6;">Total</th>
                <th style="padding: 10px; text-align: right; opacity: 0.6;">Paid</th>
                <th style="padding: 10px; text-align: right; opacity: 0.6;">Due</th>
                <th style="padding: 10px; text-align: center; opacity: 0.6;">Status</th>
                <th style="padding: 10px; text-align: right; opacity: 0.6;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${invoices.map(inv => {
                let statusBadge = '';
                if (inv.status === 'Active') statusBadge = '<span style="color:#00FFB2;">Active</span>';
                if (inv.status === 'Voided') statusBadge = '<span style="color:#FF4444;">Voided</span>';
                if (inv.status === 'Refunded') statusBadge = '<span style="color:#FF8C00;">Refunded</span>';
                
                const due = inv.grand_total - inv.amount_paid;
                
                let actionBtn = due > 0 && inv.status === 'Active'
                  ? `<button class="fh-btn fh-btn-primary btn-record-pay" data-id="${inv.id}" data-due="${due}" style="padding: 4px 8px; font-size: 11px;">Record Payment</button>`
                  : `<span style="font-size:11px; opacity:0.5;">Settled</span>`;

                return `
                  <tr style="border-bottom: 1px solid var(--color-border);">
                    <td style="padding: 10px; font-variant-numeric: tabular-nums;">${inv.sale_date.split(' ')[0]}</td>
                    <td style="padding: 10px; font-variant-numeric: tabular-nums; font-family: 'JetBrains Mono', monospace;">${esc(inv.invoice_number)}</td>
                    <td style="padding: 10px; text-align: right; font-variant-numeric: tabular-nums; font-weight: 600;">₹${fmt(inv.grand_total)}</td>
                    <td style="padding: 10px; text-align: right; font-variant-numeric: tabular-nums; color: #00FFB2;">₹${fmt(inv.amount_paid)}</td>
                    <td style="padding: 10px; text-align: right; font-variant-numeric: tabular-nums; color: ${due > 0 ? '#FF8C00' : 'inherit'};">₹${fmt(due)}</td>
                    <td style="padding: 10px; text-align: center;">${statusBadge}</td>
                    <td style="padding: 10px; text-align: right;">${actionBtn}</td>
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        `}
      </div>
    `);

    // Attach Record Payment listeners
    modal.querySelectorAll('.btn-record-pay').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const maxDue = parseFloat(btn.dataset.due);
        
        const payModal = openModal(`
          <h3 style="margin-top:0;">Record Payment</h3>
          <div class="fh-field">
            <label class="fh-label">Amount Paying</label>
            <input type="number" id="pay-amt" class="fh-input" value="${maxDue}" min="0.01" max="${maxDue}" step="0.01" />
          </div>
          <div class="fh-field">
            <label class="fh-label">Payment Mode</label>
            <select id="pay-mode" class="fh-input">
              <option value="Cash">Cash</option>
              <option value="UPI">UPI</option>
              <option value="Card">Card</option>
            </select>
          </div>
          <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:20px;">
            <button class="fh-btn fh-btn-ghost" id="pay-cancel">Cancel</button>
            <button class="fh-btn fh-btn-primary" id="pay-confirm">Save Payment</button>
          </div>
        `);
        
        payModal.querySelector('#pay-cancel').addEventListener('click', () => payModal.remove());
        payModal.querySelector('#pay-confirm').addEventListener('click', async () => {
          const amt = parseFloat(payModal.querySelector('#pay-amt').value);
          const mode = payModal.querySelector('#pay-mode').value;
          
          if (isNaN(amt) || amt <= 0 || amt > maxDue) {
            window.showToast('Invalid amount', 'error');
            return;
          }
          
          try {
            await window.api.db.run(`UPDATE sales SET amount_paid = amount_paid + ? WHERE id = ?`, [amt, id]);
            await window.api.db.run(`INSERT INTO customer_payments (sale_id, amount, payment_mode) VALUES (?, ?, ?)`, [id, amt, mode]);
            window.showToast('Payment recorded successfully!');
            payModal.remove();
            modal.remove(); // Remove parent modal
            
            // Re-render
            const container = document.getElementById('content');
            if (container) {
              const searchInput = container.querySelector('#cust-search');
              await fetchAndRenderCustomers(container, searchInput ? searchInput.value.trim() : '');
            }
            showCustomerDetails(customerName);
          } catch (err) {
            window.showToast(err.message, 'error');
          }
        });
      });
    });

  } catch (err) {
    window.showToast('Failed to load customer details', 'error');
  }
}
