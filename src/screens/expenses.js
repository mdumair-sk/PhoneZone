// src/screens/expenses.js
// ─────────────────────────────────────────────────────────────────────────────
// Expense Tracker Screen

function esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmt(n) {
  return Number(n ?? 0).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function getTodayStr() {
  const now = new Date();
  return now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-' +
    String(now.getDate()).padStart(2, '0');
}

function getMonthStartStr() {
  const now = new Date();
  return now.getFullYear() + '-' +
    String(now.getMonth() + 1).padStart(2, '0') + '-01';
}

const CATEGORIES = ['Rent', 'Utilities', 'Salaries', 'Miscellaneous'];

export async function renderExpenses(container) {
  container.innerHTML = `
    <div style="padding: 24px; max-width: 1200px; margin: 0 auto; display: flex; gap: 24px; height: 100%; flex-wrap: wrap;">
      
      <!-- Left: Add Expense Form -->
      <div style="flex: 0 0 320px; display: flex; flex-direction: column; gap: 16px;">
        <div style="margin-bottom: 16px;">
          <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: var(--color-text); letter-spacing: -0.02em;">Expenses</h1>
          <div style="font-size: 11px; font-weight: 600; color: var(--color-primary); letter-spacing: 0.15em; text-transform: uppercase; margin-top: 6px; opacity: 0.8;">
            OPERATIONAL COSTS · MONTHLY TRACKER
          </div>
        </div>
        
        <div class="fh-card">
          <div class="fh-card-title">💸 Log New Expense</div>
          
          <div class="fh-field">
            <label class="fh-label">Description</label>
            <input type="text" id="exp-desc" class="fh-input" placeholder="e.g. Electricity Bill" />
          </div>

          <div class="fh-field">
            <label class="fh-label">Amount (₹)</label>
            <input type="number" id="exp-amt" class="fh-input" placeholder="0.00" min="0" step="0.01" />
          </div>

          <div class="fh-field">
            <label class="fh-label">Category</label>
            <select id="exp-cat" class="fh-input">
              ${CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
            </select>
          </div>

          <div class="fh-field">
            <label class="fh-label">Date</label>
            <input type="date" id="exp-date" class="fh-input" value="${getTodayStr()}" />
          </div>

          <div class="fh-field">
            <label class="fh-label">Notes (Optional)</label>
            <textarea id="exp-notes" class="fh-input" rows="2" placeholder="Extra details..."></textarea>
          </div>

          <button id="btn-add-exp" class="fh-btn fh-btn-primary" style="width: 100%; justify-content: center; padding: 12px; margin-top: 10px;">
            Save Expense
          </button>
        </div>
        
        <!-- Summary Box -->
        <div class="fh-card" style="background: rgba(255, 68, 68, 0.05); border-color: rgba(255, 68, 68, 0.2);">
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.6;">Total Expenses This Month</div>
          <div id="exp-month-total" style="font-size: 24px; font-weight: 800; color: #FF4444; font-variant-numeric: tabular-nums; margin-top: 4px;">
            ₹0.00
          </div>
        </div>
      </div>

      <!-- Right: Expense Table -->
      <div style="flex: 1; min-width: 400px; display: flex; flex-direction: column; overflow: hidden;">
        <div class="fh-card" style="flex: 1; display: flex; flex-direction: column; padding: 0;">
          <div style="padding: 16px 20px; border-bottom: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center; background: var(--color-bg);">
            <div style="font-weight: 600;">Expense History</div>
            <div style="display: flex; gap: 10px; align-items: center;">
              <label style="font-size: 12px; opacity: 0.6;">From:</label>
              <input type="date" id="filter-from" class="fh-input" value="${getMonthStartStr()}" style="padding: 4px 8px; font-size: 12px;" />
              <label style="font-size: 12px; opacity: 0.6;">To:</label>
              <input type="date" id="filter-to" class="fh-input" value="${getTodayStr()}" style="padding: 4px 8px; font-size: 12px;" />
            </div>
          </div>
          
          <div style="overflow-y: auto; flex: 1;">
            <table class="fh-table" style="width: 100%; border-collapse: collapse;">
              <thead style="position: sticky; top: 0; background: var(--color-surface); z-index: 10;">
                <tr>
                  <th style="padding: 12px 20px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.5;">Date</th>
                  <th style="padding: 12px 20px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.5;">Description</th>
                  <th style="padding: 12px 20px; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.5;">Category</th>
                  <th style="padding: 12px 20px; text-align: right; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.5;">Amount</th>
                </tr>
              </thead>
              <tbody id="exp-tbody">
                <tr><td colspan="4" style="text-align:center; padding: 40px; opacity: 0.5;">Loading...</td></tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
      
    </div>
  `;

  // Init handlers
  container.querySelector('#btn-add-exp').addEventListener('click', () => handleAddExpense(container));
  container.querySelector('#filter-from').addEventListener('change', () => loadExpenses(container));
  container.querySelector('#filter-to').addEventListener('change', () => loadExpenses(container));

  await loadExpenses(container);
}

async function loadExpenses(container) {
  const tbody = container.querySelector('#exp-tbody');
  const totalEl = container.querySelector('#exp-month-total');
  if (!tbody || !totalEl) return;

  const fromDate = container.querySelector('#filter-from').value;
  const toDate = container.querySelector('#filter-to').value;

  try {
    // Load table data
    const res = await window.api.db.query(
      `SELECT * FROM expenses 
       WHERE date(expense_date) >= date(?) AND date(expense_date) <= date(?)
       ORDER BY expense_date DESC, id DESC`,
      [fromDate, toDate]
    );

    const expenses = res.ok ? res.rows : [];

    if (expenses.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 40px; opacity: 0.5;">No expenses found in this range.</td></tr>`;
    } else {
      tbody.innerHTML = expenses.map(e => `
        <tr style="border-bottom: 1px solid var(--color-border); transition: background 0.15s;" onmouseover="this.style.background='rgba(255,255,255,0.03)'" onmouseout="this.style.background='transparent'">
          <td style="padding: 12px 20px; font-variant-numeric: tabular-nums; opacity: 0.8;">${e.expense_date.split(' ')[0]}</td>
          <td style="padding: 12px 20px; font-weight: 500;">
            ${esc(e.description)}
            ${e.notes ? `<div style="font-size: 10px; opacity: 0.5; margin-top: 2px;">${esc(e.notes)}</div>` : ''}
          </td>
          <td style="padding: 12px 20px;">
            <span style="background: rgba(255, 255, 255, 0.1); padding: 2px 6px; border-radius: 4px; font-size: 11px;">${esc(e.category)}</span>
          </td>
          <td style="padding: 12px 20px; text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; color: #FF4444;">₹${fmt(e.amount)}</td>
        </tr>
      `).join('');
    }

    // Update monthly total
    const monthRes = await window.api.db.query(
      `SELECT SUM(amount) as total FROM expenses WHERE date(expense_date) >= date(?)`,
      [getMonthStartStr()]
    );
    totalEl.textContent = `₹${fmt(monthRes.rows[0]?.total || 0)}`;

  } catch (err) {
    window.showToast('Failed to load expenses', 'error');
  }
}

async function handleAddExpense(container) {
  const desc = container.querySelector('#exp-desc').value.trim();
  const amt = parseFloat(container.querySelector('#exp-amt').value);
  const cat = container.querySelector('#exp-cat').value;
  const dateStr = container.querySelector('#exp-date').value;
  const notes = container.querySelector('#exp-notes').value.trim();

  if (!desc) { window.showToast('Description is required.', 'error'); return; }
  if (isNaN(amt) || amt <= 0) { window.showToast('Valid amount is required.', 'error'); return; }

  const btn = container.querySelector('#btn-add-exp');
  btn.disabled = true;
  btn.textContent = 'Saving...';

  try {
    const res = await window.api.db.run(
      `INSERT INTO expenses (description, amount, category, expense_date, notes) VALUES (?, ?, ?, ?, ?)`,
      [desc, amt, cat, dateStr + ' 12:00:00', notes]
    );

    if (res.ok) {
      window.showToast('Expense logged successfully!');
      container.querySelector('#exp-desc').value = '';
      container.querySelector('#exp-amt').value = '';
      container.querySelector('#exp-notes').value = '';
      await loadExpenses(container);
    } else {
      throw new Error(res.error);
    }
  } catch (err) {
    window.showToast(`Error: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Expense';
  }
}
