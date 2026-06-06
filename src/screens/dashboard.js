// src/screens/dashboard.js
// ─────────────────────────────────────────────────────────────────────────────
// Dashboard / Home Screen

import { icons } from '../utils/icons.js';

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

function generateBarChartSVG(data, width = 300, height = 100) {
  if (!data || data.length === 0) return '';
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const barWidth = width / data.length;
  
  let svg = `<svg width="100%" height="${height}" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none">`;
  
  data.forEach((d, i) => {
    const h = (d.value / maxVal) * (height - 20); // 20px padding for labels
    const x = i * barWidth + (barWidth * 0.1);
    const w = barWidth * 0.8;
    const y = height - h - 15;
    
    // Bar
    svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="var(--color-primary)" rx="4" opacity="0.8">
              <title>${d.label}: ₹${fmt(d.value)}</title>
            </rect>`;
            
    // Label
    const dayLabel = d.label.substring(8, 10); // get DD from YYYY-MM-DD
    svg += `<text x="${x + w/2}" y="${height}" text-anchor="middle" fill="var(--color-text)" font-size="10" opacity="0.5">${dayLabel}</text>`;
  });
  
  svg += `</svg>`;
  return svg;
}

export async function renderDashboard(container) {
  container.innerHTML = `
    <div style="padding: 24px; max-width: 1200px; margin: 0 auto; display: flex; flex-direction: column; gap: 24px;">
      <div style="display: flex; justify-content: space-between; align-items: flex-end;">
        <div>
          <h1 style="margin: 0; font-size: 28px; font-weight: 700; color: var(--color-text); letter-spacing: -0.02em;">Overview</h1>
          <div style="font-size: 11px; font-weight: 600; color: var(--color-primary); letter-spacing: 0.15em; text-transform: uppercase; margin-top: 6px; opacity: 0.8;">
            DAILY METRICS · ALERTS · TRENDS
          </div>
        </div>
        <div style="display: flex; gap: 12px; margin-bottom: 2px;">
          <button class="fh-btn fh-btn-ghost" onclick="window.__showScreen('inventory')">${icons.inventory(14)} Add Stock</button>
          <button class="fh-btn fh-btn-primary" onclick="window.__showScreen('pos')">${icons.plus(14)} New Sale</button>
        </div>
      </div>
      
      <div id="dashboard-content" style="display: flex; flex-direction: column; gap: 24px;">
        <div style="font-size: 14px; opacity: 0.5;">Loading metrics...</div>
      </div>
    </div>
  `;

  const today = getTodayStr();
  const monthStart = getMonthStartStr();

  try {
    // 1. Today's Revenue & Invoices
    const todayRes = await window.api.db.query(
      `SELECT SUM(grand_total) as revenue, COUNT(id) as count 
       FROM sales 
       WHERE status = 'Active' AND sale_date LIKE ?`, 
      [`${today}%`]
    );
    const todayRev = todayRes.rows[0]?.revenue || 0;
    const todayCount = todayRes.rows[0]?.count || 0;

    // 2. Monthly Revenue & Expenses (for profit indicator)
    const monthRevRes = await window.api.db.query(
      `SELECT SUM(grand_total) as revenue FROM sales 
       WHERE status = 'Active' AND sale_date >= ?`, 
      [monthStart + ' 00:00:00']
    );
    const monthExpRes = await window.api.db.query(
      `SELECT SUM(amount) as expenses FROM expenses 
       WHERE expense_date >= ?`, 
      [monthStart + ' 00:00:00']
    );
    
    const monthRev = monthRevRes.rows[0]?.revenue || 0;
    const monthExp = monthExpRes.rows[0]?.expenses || 0;
    const monthProfit = monthRev - monthExp;

    // 3. Low Stock Alerts
    const lowStockRes = await window.api.db.query(
      `SELECT id, name, stock_qty FROM items WHERE stock_qty <= 3 ORDER BY stock_qty ASC`
    );
    const lowStock = lowStockRes.rows || [];

    // 4. Top 5 Selling Items This Month
    const topItemsRes = await window.api.db.query(
      `SELECT i.item_name, SUM(i.qty) as total_qty 
       FROM sale_items i 
       JOIN sales s ON i.sale_id = s.id 
       WHERE s.status = 'Active' AND s.sale_date >= ? 
       GROUP BY i.item_name 
       ORDER BY total_qty DESC LIMIT 5`,
       [monthStart + ' 00:00:00']
    );
    const topItems = topItemsRes.rows || [];

    // 5. Last 7 Days Revenue
    const chartData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dStr = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
      
      const dayRes = await window.api.db.query(
        `SELECT SUM(grand_total) as rev FROM sales WHERE status = 'Active' AND sale_date LIKE ?`, 
        [`${dStr}%`]
      );
      chartData.push({ label: dStr, value: dayRes.rows[0]?.rev || 0 });
    }

    const contentEl = container.querySelector('#dashboard-content');
    
    contentEl.innerHTML = `
      <!-- Top Metrics Row -->
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px;">
        <div class="fh-card" style="display: flex; flex-direction: column; gap: 8px;">
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.6;">Today's Revenue</div>
          <div style="font-size: 28px; font-weight: 800; color: var(--color-primary); font-variant-numeric: tabular-nums;">₹${fmt(todayRev)}</div>
        </div>
        <div class="fh-card" style="display: flex; flex-direction: column; gap: 8px;">
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.6;">Today's Invoices</div>
          <div style="font-size: 28px; font-weight: 800; font-variant-numeric: tabular-nums;">${todayCount}</div>
        </div>
        <div class="fh-card" style="display: flex; flex-direction: column; gap: 8px;">
          <div style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.6;">Monthly Profit Ind.</div>
          <div style="font-size: 28px; font-weight: 800; font-variant-numeric: tabular-nums; color: ${monthProfit >= 0 ? 'var(--color-success)' : 'var(--color-danger)'};">
            ${monthProfit >= 0 ? '+' : '-'}₹${fmt(Math.abs(monthProfit))}
          </div>
          <div style="font-size: 10px; opacity: 0.5;">Rev: ₹${fmt(monthRev)} | Exp: ₹${fmt(monthExp)}</div>
        </div>
      </div>

      <!-- Main Dash Area -->
      <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 24px; align-items: start;">
        
        <!-- Left Col -->
        <div style="display: flex; flex-direction: column; gap: 24px;">
          <!-- Chart -->
          <div class="fh-card">
            <div class="fh-card-title" style="display: flex; align-items: center; gap: 8px;">
              ${icons.trendingUp(14)} Last 7 Days Revenue
            </div>
            <div style="margin-top: 20px; height: 120px;">
              ${generateBarChartSVG(chartData, 600, 120)}
            </div>
          </div>
          
          <!-- Top Items -->
          <div class="fh-card">
            <div class="fh-card-title" style="display: flex; align-items: center; gap: 8px;">
              ${icons.flame(14)} Top 5 Items This Month
            </div>
            ${topItems.length === 0 ? '<div style="opacity: 0.5; font-size: 12px;">No sales this month yet.</div>' : `
              <div style="display: flex; flex-direction: column; gap: 12px;">
                ${topItems.map((ti, idx) => `
                  <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--color-border); padding-bottom: 8px;">
                    <span style="font-size: 13px;">${idx+1}. ${esc(ti.item_name)}</span>
                    <span style="font-size: 13px; font-weight: 600; font-variant-numeric: tabular-nums;">${ti.total_qty} units</span>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        </div>

        <!-- Right Col -->
        <div style="display: flex; flex-direction: column; gap: 24px;">
          <!-- Low Stock -->
          <div class="fh-card" style="${lowStock.length > 0 ? 'border: 1px solid var(--color-warning); background: color-mix(in srgb, var(--color-warning) 3%, transparent);' : ''}">
            <div class="fh-card-title" style="display: flex; align-items: center; gap: 8px; ${lowStock.length > 0 ? 'color: var(--color-warning);' : ''}">
              ${icons.alert(14)} Low Stock Alerts
            </div>
            ${lowStock.length === 0 ? '<div style="opacity: 0.5; font-size: 12px;">All items are sufficiently stocked.</div>' : `
              <div style="display: flex; flex-direction: column; gap: 12px; max-height: 300px; overflow-y: auto;">
                ${lowStock.map(ls => `
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 13px; max-width: 150px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${esc(ls.name)}">${esc(ls.name)}</span>
                    <span style="font-size: 12px; font-weight: 700; color: ${ls.stock_qty <= 0 ? 'var(--color-danger)' : 'var(--color-warning)'}; background: color-mix(in srgb, ${ls.stock_qty <= 0 ? 'var(--color-danger)' : 'var(--color-warning)'} 10%, transparent); padding: 2px 6px; border-radius: 4px;">
                      ${ls.stock_qty} left
                    </span>
                  </div>
                `).join('')}
              </div>
            `}
          </div>
        </div>
        
      </div>
    `;

  } catch (err) {
    container.querySelector('#dashboard-content').innerHTML = `
      <div style="color: #FF4444; font-size: 13px;">Failed to load dashboard data: ${esc(err.message)}</div>
    `;
  }
}
