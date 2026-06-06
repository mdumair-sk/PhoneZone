// tests/setup.js
// ─────────────────────────────────────────────────────────────────────────────
// Global test setup: Mocks the Electron `window.api` exposed via preload.js
// and other global helpers that the frontend code expects.
// ─────────────────────────────────────────────────────────────────────────────

import { vi, beforeEach } from 'vitest';

// ── In-memory data store for mock DB ─────────────────────────────────────────

/** @type {Map<string, any[]>} */
let _tables;

/** @type {Map<string, string>} */
let _settings;

/**
 * Resets the mock database state before each test.
 */
function resetMockDB() {
  _tables = new Map();
  _tables.set('items', []);
  _tables.set('purchases', []);
  _tables.set('sales', []);
  _tables.set('sale_items', []);
  _tables.set('customers', []);
  _tables.set('expenses', []);
  _tables.set('customer_payments', []);
  _settings = new Map();
}

/**
 * Get the mock tables store (for test assertions).
 */
export function getMockTables() {
  return _tables;
}

/**
 * Get the mock settings store (for test assertions).
 */
export function getMockSettings() {
  return _settings;
}

/**
 * Seed items into the mock DB. Returns the array.
 * @param {object[]} items
 */
export function seedItems(items) {
  const table = _tables.get('items');
  items.forEach((item, i) => {
    const record = {
      id: item.id ?? table.length + 1,
      name: item.name ?? `Item ${i}`,
      category: item.category ?? 'Accessory',
      stock_qty: item.stock_qty ?? 10,
      purchase_price: item.purchase_price ?? 100,
      sell_price: item.sell_price ?? 200,
      gst_rate: item.gst_rate ?? 18,
      is_margin_scheme: item.is_margin_scheme ?? 0,
      hsn_code: item.hsn_code ?? '8471',
    };
    table.push(record);
  });
  return table;
}

/**
 * Seed customers into the mock DB.
 */
export function seedCustomers(customers) {
  const table = _tables.get('customers');
  customers.forEach((c, i) => {
    table.push({
      id: c.id ?? table.length + 1,
      name: c.name ?? `Customer ${i}`,
      phone: c.phone ?? '',
      gstin: c.gstin ?? '',
      total_purchases: c.total_purchases ?? 0,
      created_at: c.created_at ?? new Date().toISOString(),
    });
  });
  return table;
}

/**
 * Seed sales into the mock DB.
 */
export function seedSales(sales) {
  const table = _tables.get('sales');
  sales.forEach((s, i) => {
    table.push({
      id: s.id ?? table.length + 1,
      invoice_number: s.invoice_number ?? `INV-${i}`,
      sale_date: s.sale_date ?? new Date().toISOString(),
      customer_name: s.customer_name ?? 'Walk-in Customer',
      customer_gstin: s.customer_gstin ?? '',
      total_taxable: s.total_taxable ?? 0,
      total_cgst: s.total_cgst ?? 0,
      total_sgst: s.total_sgst ?? 0,
      grand_total: s.grand_total ?? 0,
      amount_paid: s.amount_paid ?? 0,
      payment_mode: s.payment_mode ?? 'Cash',
      status: s.status ?? 'Active',
      invoice_type: s.invoice_type ?? 'Tax Invoice',
    });
  });
  return table;
}

/**
 * Seed expenses into the mock DB.
 */
export function seedExpenses(expenses) {
  const table = _tables.get('expenses');
  expenses.forEach((e, i) => {
    table.push({
      id: e.id ?? table.length + 1,
      description: e.description ?? `Expense ${i}`,
      amount: e.amount ?? 100,
      category: e.category ?? 'General',
      expense_date: e.expense_date ?? new Date().toISOString(),
      notes: e.notes ?? '',
    });
  });
  return table;
}

/**
 * Seed settings into the mock DB.
 */
export function seedSettings(entries) {
  for (const [key, value] of entries) {
    _settings.set(key, value);
  }
}

// ── Mock window.api ──────────────────────────────────────────────────────────

const mockDbQuery = vi.fn().mockImplementation(async (sql, params = []) => {
  // Simplified SQL parser for common patterns used by the app
  const sqlLower = sql.toLowerCase().trim();

  // Settings query
  if (sqlLower.includes('from settings')) {
    if (sqlLower.includes('where key =')) {
      const key = params[0];
      const val = _settings.get(key);
      return { ok: true, rows: val !== undefined ? [{ key, value: val }] : [] };
    }
    const rows = Array.from(_settings.entries()).map(([key, value]) => ({ key, value }));
    return { ok: true, rows };
  }

  // Items query
  if (sqlLower.includes('from items')) {
    let items = [...(_tables.get('items') || [])];
    if (sqlLower.includes('where') && sqlLower.includes('like') && params.length) {
      const pattern = params[0].replace(/%/g, '').toLowerCase();
      items = items.filter(i => i.name.toLowerCase().includes(pattern));
    }
    if (sqlLower.includes('where') && sqlLower.includes('id in')) {
      items = items.filter(i => params.includes(i.id));
    }
    if (sqlLower.includes('where') && sqlLower.includes('id =')) {
      const idParam = params.find(p => typeof p === 'number') ?? params[0];
      items = items.filter(i => i.id === idParam);
    }
    if (sqlLower.includes('stock_qty <=')) {
      items = items.filter(i => i.stock_qty <= 3);
    }
    return { ok: true, rows: items };
  }

  // Sales query
  if (sqlLower.includes('from sales') || sqlLower.includes('from   sales')) {
    let sales = [...(_tables.get('sales') || [])];
    if (sqlLower.includes("status = 'active'")) {
      sales = sales.filter(s => s.status === 'Active');
    }
    if (sqlLower.includes('where') && sqlLower.includes('id =') && params.length) {
      sales = sales.filter(s => s.id === params[0]);
    }
    if (sqlLower.includes('customer_name =') && params.length) {
      const name = params[0];
      sales = sales.filter(s => s.customer_name === name);
    }
    // Aggregations
    if (sqlLower.includes('sum(grand_total)') && sqlLower.includes('count')) {
      const revenue = sales.reduce((s, r) => s + (r.grand_total || 0), 0);
      return { ok: true, rows: [{ revenue, count: sales.length }] };
    }
    if (sqlLower.includes('sum(grand_total) as revenue')) {
      const revenue = sales.reduce((s, r) => s + (r.grand_total || 0), 0);
      return { ok: true, rows: [{ revenue }] };
    }
    if (sqlLower.includes('count(*)') && sqlLower.includes('total_invoices')) {
      const totals = {
        total_invoices: sales.length,
        total_taxable: sales.reduce((s, r) => s + (r.total_taxable || 0), 0),
        total_cgst: sales.reduce((s, r) => s + (r.total_cgst || 0), 0),
        total_sgst: sales.reduce((s, r) => s + (r.total_sgst || 0), 0),
        grand_total: sales.reduce((s, r) => s + (r.grand_total || 0), 0),
      };
      return { ok: true, rows: [totals] };
    }
    if (sqlLower.includes('payment_mode') && sqlLower.includes('group by')) {
      const groups = {};
      sales.forEach(s => {
        if (!groups[s.payment_mode]) groups[s.payment_mode] = { payment_mode: s.payment_mode, count: 0, total: 0 };
        groups[s.payment_mode].count++;
        groups[s.payment_mode].total += s.grand_total || 0;
      });
      return { ok: true, rows: Object.values(groups) };
    }
    if (sqlLower.includes('invoice_number like') && params.length) {
      const prefix = params[0].replace(/%/g, '');
      sales = sales.filter(s => s.invoice_number.startsWith(prefix));
      sales.sort((a, b) => b.invoice_number.localeCompare(a.invoice_number));
      return { ok: true, rows: sales.slice(0, 1) };
    }
    return { ok: true, rows: sales };
  }

  // Sale items query
  if (sqlLower.includes('from sale_items') || sqlLower.includes('from   sale_items')) {
    let items = [...(_tables.get('sale_items') || [])];
    if (sqlLower.includes('where') && sqlLower.includes('sale_id =') && params.length) {
      items = items.filter(i => i.sale_id === params[0]);
    }
    // Top items aggregation
    if (sqlLower.includes('sum(i.qty)') || sqlLower.includes('sum(qty)')) {
      const groups = {};
      items.forEach(i => {
        const name = i.item_name;
        if (!groups[name]) groups[name] = { item_name: name, total_qty: 0 };
        groups[name].total_qty += i.qty;
      });
      return { ok: true, rows: Object.values(groups).sort((a, b) => b.total_qty - a.total_qty).slice(0, 5) };
    }
    return { ok: true, rows: items };
  }

  // Customers query
  if (sqlLower.includes('from customers')) {
    let customers = [...(_tables.get('customers') || [])];
    if (sqlLower.includes('like') && params.length >= 2) {
      const pattern = params[0].replace(/%/g, '').toLowerCase();
      customers = customers.filter(c =>
        c.name.toLowerCase().includes(pattern) ||
        (c.phone && c.phone.includes(pattern))
      );
    }
    // Add credit_balance mock
    customers = customers.map(c => ({ ...c, credit_balance: 0 }));
    return { ok: true, rows: customers };
  }

  // Expenses query
  if (sqlLower.includes('from expenses')) {
    let expenses = [...(_tables.get('expenses') || [])];
    if (sqlLower.includes('sum(amount)')) {
      const total = expenses.reduce((s, e) => s + (e.amount || 0), 0);
      return { ok: true, rows: [{ total }] };
    }
    return { ok: true, rows: expenses };
  }

  // Customer payments
  if (sqlLower.includes('from customer_payments')) {
    return { ok: true, rows: [...(_tables.get('customer_payments') || [])] };
  }

  // Default
  return { ok: true, rows: [] };
});

let _autoIncrement = 100;

const mockDbRun = vi.fn().mockImplementation(async (sql, params = []) => {
  const sqlLower = sql.toLowerCase().trim();
  _autoIncrement++;

  // INSERT INTO settings
  if (sqlLower.includes('insert') && sqlLower.includes('settings')) {
    const key = params[0];
    const value = params[1];
    if (sqlLower.includes('or ignore')) {
      if (!_settings.has(key)) _settings.set(key, value);
    } else {
      _settings.set(key, value);
    }
    return { ok: true, changes: 1, lastInsertRowid: _autoIncrement };
  }

  // INSERT INTO items
  if (sqlLower.includes('insert') && sqlLower.includes('items')) {
    const newItem = {
      id: _autoIncrement,
      name: params[0],
      category: params[1],
      stock_qty: params[2] ?? 0,
      purchase_price: params[3] ?? 0,
      sell_price: params[4] ?? 0,
      gst_rate: params[5] ?? 18,
      is_margin_scheme: params[6] ?? 0,
      hsn_code: params[7] ?? '8471',
    };
    _tables.get('items').push(newItem);
    return { ok: true, changes: 1, lastInsertRowid: _autoIncrement };
  }

  // UPDATE items
  if (sqlLower.includes('update') && sqlLower.includes('items')) {
    const items = _tables.get('items');
    if (sqlLower.includes('stock_qty = stock_qty +')) {
      const qty = params[0];
      const id = params[params.length - 1];
      const item = items.find(i => i.id === id);
      if (item) item.stock_qty += qty;
    } else if (sqlLower.includes('stock_qty = stock_qty -')) {
      const qty = params[0];
      const id = params[params.length - 1];
      const item = items.find(i => i.id === id);
      if (item) item.stock_qty -= qty;
    }
    return { ok: true, changes: 1 };
  }

  // INSERT INTO sales
  if (sqlLower.includes('insert') && sqlLower.includes('into sales')) {
    const sale = {
      id: _autoIncrement,
      invoice_number: params[0],
      customer_name: params[1],
      customer_gstin: params[2],
      total_taxable: params[3],
      total_cgst: params[4],
      total_sgst: params[5],
      grand_total: params[6],
      amount_paid: params[7],
      payment_mode: params[8],
      status: 'Active',
      invoice_type: params[9],
      sale_date: params[10] ?? new Date().toISOString(),
    };
    _tables.get('sales').push(sale);
    return { ok: true, changes: 1, lastInsertRowid: _autoIncrement };
  }

  // INSERT INTO sale_items
  if (sqlLower.includes('insert') && sqlLower.includes('sale_items')) {
    const si = {
      id: _autoIncrement,
      sale_id: params[0],
      item_id: params[1],
      item_name: params[2],
      qty: params[3],
      price_per_unit: params[4],
      is_margin_applied: params[5],
      cgst_amount: params[6],
      sgst_amount: params[7],
      imei_number: params[8] ?? '',
      item_hsn: params[9] ?? '',
    };
    _tables.get('sale_items').push(si);
    return { ok: true, changes: 1, lastInsertRowid: _autoIncrement };
  }

  // INSERT INTO purchases
  if (sqlLower.includes('insert') && sqlLower.includes('purchases')) {
    const purchase = {
      id: _autoIncrement,
      item_id: params[0],
      qty: params[1],
      purchase_rate: params[2],
      supplier_name: params[3] ?? '',
    };
    _tables.get('purchases').push(purchase);
    return { ok: true, changes: 1, lastInsertRowid: _autoIncrement };
  }

  // INSERT INTO customers
  if (sqlLower.includes('insert') && sqlLower.includes('customers')) {
    const cust = {
      id: _autoIncrement,
      name: params[0],
      phone: params[1] ?? '',
      gstin: params[2] ?? '',
      total_purchases: params[3] ?? 0,
    };
    _tables.get('customers').push(cust);
    return { ok: true, changes: 1, lastInsertRowid: _autoIncrement };
  }

  // INSERT INTO expenses
  if (sqlLower.includes('insert') && sqlLower.includes('expenses')) {
    const expense = {
      id: _autoIncrement,
      description: params[0],
      amount: params[1],
      category: params[2],
      expense_date: params[3],
      notes: params[4] ?? '',
    };
    _tables.get('expenses').push(expense);
    return { ok: true, changes: 1, lastInsertRowid: _autoIncrement };
  }

  // INSERT INTO customer_payments
  if (sqlLower.includes('insert') && sqlLower.includes('customer_payments')) {
    const cp = {
      id: _autoIncrement,
      sale_id: params[0],
      amount: params[1],
      payment_mode: params[2],
    };
    _tables.get('customer_payments').push(cp);
    return { ok: true, changes: 1, lastInsertRowid: _autoIncrement };
  }

  // UPDATE sales
  if (sqlLower.includes('update') && sqlLower.includes('sales')) {
    const sales = _tables.get('sales');
    if (sqlLower.includes("status =") && params.length >= 2) {
      const id = params[params.length - 1];
      const sale = sales.find(s => s.id === id);
      if (sale) sale.status = params[0];
    }
    if (sqlLower.includes('amount_paid')) {
      const id = params[params.length - 1];
      const sale = sales.find(s => s.id === id);
      if (sale) sale.amount_paid = (sale.amount_paid || 0) + params[0];
    }
    return { ok: true, changes: 1 };
  }

  // ALTER TABLE (migrations — just succeed silently)
  if (sqlLower.includes('alter table')) {
    return { ok: true, changes: 0 };
  }

  return { ok: true, changes: 1, lastInsertRowid: _autoIncrement };
});

const mockDbInit = vi.fn().mockResolvedValue({ ok: true });

const mockDbBackup = vi.fn().mockResolvedValue({
  ok: true,
  items: [],
  purchases: [],
  sales: [],
  sale_items: [],
  settings: [],
});

// ── Mount mocks on window ────────────────────────────────────────────────────

beforeEach(() => {
  resetMockDB();
  _autoIncrement = 100;
  vi.clearAllMocks();

  // Mock window.api (Electron preload bridge)
  window.api = {
    db: {
      query: mockDbQuery,
      run: mockDbRun,
      init: mockDbInit,
      backup: mockDbBackup,
    },
    window: {
      minimize: vi.fn(),
      maximize: vi.fn(),
      close: vi.fn(),
    },
  };

  // Mock global helpers that src/main.js sets up
  window.getSettings = vi.fn().mockImplementation(async () => {
    const entries = {};
    for (const [k, v] of _settings) entries[k] = v;
    return entries;
  });

  window.applyTheme = vi.fn().mockResolvedValue(undefined);

  window.showToast = vi.fn();

  window.showConfirm = vi.fn().mockResolvedValue(true);

  window.setupCustomSelects = vi.fn();

  window.refreshNavBranding = vi.fn().mockResolvedValue(undefined);

  window.__showScreen = vi.fn();

  window.THEMES = {
    dark: {
      label: '🌑 Dark',
      fonts: { body: 'Inter', mono: 'JetBrains Mono', heading: 'Inter' },
      vars: {
        bg: '#0D0D0D', surface: '#1A1A1A', border: '#2A2A2A', text: '#E0E0E0', primary: '#00FFB2',
        success: '#00FFB2', danger: '#FF4444', warning: '#FF8C00',
      },
    },
    light: {
      label: '☀️ Light',
      fonts: { body: 'Inter', mono: 'JetBrains Mono', heading: 'Playfair Display' },
      vars: {
        bg: '#FAFAFA', surface: '#FFFFFF', border: '#E2E8F0', text: '#0F172A', primary: '#2563EB',
        success: '#10B981', danger: '#EF4444', warning: '#F59E0B',
      },
    },
  };

  // Mock crypto.subtle for SHA-256 hashing in lock screen
  if (!window.crypto?.subtle?.digest) {
    window.crypto = {
      subtle: {
        digest: vi.fn().mockImplementation(async (algo, data) => {
          // Return a simple mock buffer
          return new Uint8Array(32).buffer;
        }),
      },
    };
  }

  // Mock fetch for schema.sql loading
  window.fetch = vi.fn().mockResolvedValue({
    ok: true,
    text: () => Promise.resolve('-- mock schema'),
  });

  // Mock import.meta.url
  // (happy-dom should provide this, but ensure it exists)
});
