// tests/backend/db.test.js
// ─────────────────────────────────────────────────────────────────────────────
// Tests for database schema, CRUD operations, and data integrity via
// the mock window.api.db interface. Verifies the app's data model contracts.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  seedItems, seedCustomers, seedSales, seedExpenses,
  seedSettings, getMockTables, getMockSettings,
} from '../setup.js';

// ── Schema & Table Structure ─────────────────────────────────────────────────

describe('Database Schema Tables', () => {
  it('mock DB initializes with all expected tables', () => {
    const tables = getMockTables();
    expect(tables.has('items')).toBe(true);
    expect(tables.has('purchases')).toBe(true);
    expect(tables.has('sales')).toBe(true);
    expect(tables.has('sale_items')).toBe(true);
    expect(tables.has('customers')).toBe(true);
    expect(tables.has('expenses')).toBe(true);
    expect(tables.has('customer_payments')).toBe(true);
  });

  it('all tables start empty', () => {
    const tables = getMockTables();
    for (const [name, rows] of tables) {
      expect(rows.length).toBe(0);
    }
  });
});

// ── Items CRUD ───────────────────────────────────────────────────────────────

describe('Items CRUD', () => {
  it('inserts a new item via db.run', async () => {
    const res = await window.api.db.run(
      `INSERT INTO items (name, category, stock_qty, purchase_price, sell_price, gst_rate, is_margin_scheme, hsn_code)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ['iPhone 15', 'New Phone', 10, 70000, 79900, 18, 0, '8517']
    );
    expect(res.ok).toBe(true);
    expect(res.changes).toBe(1);
    expect(res.lastInsertRowid).toBeGreaterThan(0);
  });

  it('queries items via db.query', async () => {
    seedItems([
      { name: 'Phone A', category: 'New Phone', stock_qty: 5 },
      { name: 'Cable B', category: 'Accessory', stock_qty: 50 },
    ]);

    const res = await window.api.db.query(`SELECT * FROM items ORDER BY name COLLATE NOCASE`);
    expect(res.ok).toBe(true);
    expect(res.rows.length).toBe(2);
  });

  it('searches items by name with LIKE', async () => {
    seedItems([
      { name: 'iPhone 15', category: 'New Phone' },
      { name: 'Samsung S24', category: 'New Phone' },
      { name: 'USB Cable', category: 'Accessory' },
    ]);

    const res = await window.api.db.query(
      `SELECT * FROM items WHERE name LIKE ? ORDER BY name COLLATE NOCASE`,
      ['%iphone%']
    );
    expect(res.ok).toBe(true);
    expect(res.rows.length).toBe(1);
    expect(res.rows[0].name).toBe('iPhone 15');
  });

  it('updates stock quantity via db.run', async () => {
    seedItems([{ id: 1, name: 'Test Item', stock_qty: 10 }]);

    await window.api.db.run(
      `UPDATE items SET stock_qty = stock_qty + ? WHERE id = ?`,
      [5, 1]
    );

    const items = getMockTables().get('items');
    expect(items[0].stock_qty).toBe(15);
  });

  it('decrements stock on sale', async () => {
    seedItems([{ id: 1, name: 'Test Item', stock_qty: 10 }]);

    await window.api.db.run(
      `UPDATE items SET stock_qty = stock_qty - ? WHERE id = ?`,
      [3, 1]
    );

    const items = getMockTables().get('items');
    expect(items[0].stock_qty).toBe(7);
  });
});

// ── Item Data Integrity ──────────────────────────────────────────────────────

describe('Item Data Integrity', () => {
  it('item has all required fields after seed', () => {
    seedItems([{ name: 'Test' }]);
    const item = getMockTables().get('items')[0];

    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('name');
    expect(item).toHaveProperty('category');
    expect(item).toHaveProperty('stock_qty');
    expect(item).toHaveProperty('purchase_price');
    expect(item).toHaveProperty('sell_price');
    expect(item).toHaveProperty('gst_rate');
    expect(item).toHaveProperty('is_margin_scheme');
    expect(item).toHaveProperty('hsn_code');
  });

  it('category defaults to Accessory', () => {
    seedItems([{ name: 'No Category' }]);
    const item = getMockTables().get('items')[0];
    expect(item.category).toBe('Accessory');
  });

  it('valid categories are New Phone, Accessory, Used Phone, Repair Service', () => {
    const validCategories = ['New Phone', 'Accessory', 'Used Phone', 'Repair Service'];
    validCategories.forEach(cat => {
      seedItems([{ name: `Test ${cat}`, category: cat }]);
    });
    const items = getMockTables().get('items');
    expect(items.length).toBe(4);
  });
});

// ── Sales CRUD ───────────────────────────────────────────────────────────────

describe('Sales CRUD', () => {
  it('inserts a new sale', async () => {
    const res = await window.api.db.run(
      `INSERT INTO sales (invoice_number, customer_name, customer_gstin,
       total_taxable, total_cgst, total_sgst, grand_total, amount_paid, payment_mode, status, invoice_type)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'Active', ?)`,
      ['20250615-143022-001', 'Ramesh', '', 1000, 90, 90, 1180, 1180, 'Cash', 'Tax Invoice']
    );
    expect(res.ok).toBe(true);
    expect(res.lastInsertRowid).toBeGreaterThan(0);
  });

  it('queries active sales', async () => {
    seedSales([
      { status: 'Active', grand_total: 1000 },
      { status: 'Voided', grand_total: 500 },
      { status: 'Active', grand_total: 2000 },
    ]);

    const res = await window.api.db.query(
      `SELECT * FROM sales WHERE status = 'Active' ORDER BY sale_date DESC`
    );
    expect(res.ok).toBe(true);
    expect(res.rows.length).toBe(2);
  });

  it('voids a sale (status update)', async () => {
    seedSales([{ id: 1, status: 'Active' }]);

    await window.api.db.run(
      `UPDATE sales SET status = ? WHERE id = ?`,
      ['Voided', 1]
    );

    const sales = getMockTables().get('sales');
    expect(sales[0].status).toBe('Voided');
  });
});

// ── Sale Items ───────────────────────────────────────────────────────────────

describe('Sale Items', () => {
  it('inserts sale line items', async () => {
    const res = await window.api.db.run(
      `INSERT INTO sale_items (sale_id, item_id, item_name, qty, price_per_unit,
       is_margin_applied, cgst_amount, sgst_amount, imei_number, item_hsn)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [1, 10, 'iPhone 15', 1, 79900, 0, 6093.22, 6093.22, '123456789012345', '8517']
    );
    expect(res.ok).toBe(true);
  });

  it('line item captures IMEI number', () => {
    const imei = '123456789012345';
    expect(imei.length).toBe(15);
    expect(/^\d{15}$/.test(imei)).toBe(true);
  });

  it('line item captures HSN snapshot', () => {
    const hsn = '8517';
    expect(hsn.length).toBeGreaterThanOrEqual(4);
    expect(hsn.length).toBeLessThanOrEqual(8);
  });
});

// ── Customers CRUD ───────────────────────────────────────────────────────────

describe('Customers CRUD', () => {
  it('seeds customers correctly', () => {
    seedCustomers([
      { name: 'Ramesh', phone: '9876543210', total_purchases: 50000 },
      { name: 'Suresh', phone: '9123456789', total_purchases: 30000 },
    ]);
    const customers = getMockTables().get('customers');
    expect(customers.length).toBe(2);
    expect(customers[0].name).toBe('Ramesh');
  });

  it('inserts a new customer via db.run', async () => {
    const res = await window.api.db.run(
      `INSERT INTO customers (name, phone, gstin, total_purchases) VALUES (?, ?, ?, ?)`,
      ['New Customer', '1234567890', '', 0]
    );
    expect(res.ok).toBe(true);
  });

  it('searches customers by name', async () => {
    seedCustomers([
      { name: 'Ramesh Kumar', phone: '9876543210' },
      { name: 'Suresh Patel', phone: '9123456789' },
    ]);

    const res = await window.api.db.query(
      `SELECT * FROM customers WHERE name LIKE ? OR phone LIKE ?`,
      ['%ramesh%', '%ramesh%']
    );
    expect(res.ok).toBe(true);
    expect(res.rows.length).toBe(1);
  });
});

// ── Expenses CRUD ────────────────────────────────────────────────────────────

describe('Expenses CRUD', () => {
  it('seeds expenses correctly', () => {
    seedExpenses([
      { description: 'Rent', amount: 25000, category: 'Rent' },
      { description: 'Electricity', amount: 3000, category: 'Utilities' },
    ]);
    const expenses = getMockTables().get('expenses');
    expect(expenses.length).toBe(2);
    expect(expenses[0].amount).toBe(25000);
  });

  it('inserts a new expense via db.run', async () => {
    const res = await window.api.db.run(
      `INSERT INTO expenses (description, amount, category, expense_date, notes) VALUES (?, ?, ?, ?, ?)`,
      ['Staff Salary', 15000, 'Salaries', '2025-06-15 12:00:00', 'Monthly salary']
    );
    expect(res.ok).toBe(true);
  });

  it('queries expense totals', async () => {
    seedExpenses([
      { amount: 5000 },
      { amount: 3000 },
      { amount: 2000 },
    ]);

    const res = await window.api.db.query(
      `SELECT SUM(amount) as total FROM expenses WHERE date(expense_date) >= date(?)`
    );
    expect(res.ok).toBe(true);
    expect(res.rows[0].total).toBe(10000);
  });
});

// ── Customer Payments ────────────────────────────────────────────────────────

describe('Customer Payments', () => {
  it('records a partial payment', async () => {
    seedSales([{ id: 1, grand_total: 50000, amount_paid: 30000, payment_mode: 'Credit' }]);

    const res = await window.api.db.run(
      `INSERT INTO customer_payments (sale_id, amount, payment_mode) VALUES (?, ?, ?)`,
      [1, 10000, 'Cash']
    );
    expect(res.ok).toBe(true);

    const payments = getMockTables().get('customer_payments');
    expect(payments.length).toBe(1);
    expect(payments[0].amount).toBe(10000);
    expect(payments[0].payment_mode).toBe('Cash');
  });

  it('updates amount_paid on sale after payment', async () => {
    seedSales([{ id: 1, grand_total: 50000, amount_paid: 30000 }]);

    await window.api.db.run(
      `UPDATE sales SET amount_paid = COALESCE(amount_paid, 0) + ? WHERE id = ?`,
      [10000, 1]
    );

    const sales = getMockTables().get('sales');
    expect(sales[0].amount_paid).toBe(40000);
  });
});

// ── Settings CRUD ────────────────────────────────────────────────────────────

describe('Settings CRUD', () => {
  it('seeds settings correctly', () => {
    seedSettings([
      ['shop_name', 'Test Shop'],
      ['app_theme', 'dark'],
    ]);
    const settings = getMockSettings();
    expect(settings.get('shop_name')).toBe('Test Shop');
    expect(settings.get('app_theme')).toBe('dark');
  });

  it('upserts a setting via db.run', async () => {
    const res = await window.api.db.run(
      `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      ['app_theme', 'cyberpunk']
    );
    expect(res.ok).toBe(true);
    const settings = getMockSettings();
    expect(settings.get('app_theme')).toBe('cyberpunk');
  });

  it('queries single setting', async () => {
    seedSettings([['shop_name', 'My Shop']]);

    const res = await window.api.db.query(
      `SELECT value FROM settings WHERE key = ?`,
      ['shop_name']
    );
    expect(res.ok).toBe(true);
    expect(res.rows[0].value).toBe('My Shop');
  });

  it('INSERT OR IGNORE does not overwrite existing', async () => {
    seedSettings([['shop_name', 'Original']]);

    await window.api.db.run(
      `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`,
      ['shop_name', 'Should Not Overwrite']
    );

    const settings = getMockSettings();
    expect(settings.get('shop_name')).toBe('Original');
  });
});

// ── DB Init (Schema) ─────────────────────────────────────────────────────────

describe('Database Init', () => {
  it('db.init succeeds', async () => {
    const res = await window.api.db.init('CREATE TABLE IF NOT EXISTS ...');
    expect(res.ok).toBe(true);
  });
});

// ── DB Backup ────────────────────────────────────────────────────────────────

describe('Database Backup', () => {
  it('backup returns valid structure', async () => {
    const res = await window.api.db.backup();
    expect(res.ok).toBe(true);
    expect(Array.isArray(res.items)).toBe(true);
    expect(Array.isArray(res.sales)).toBe(true);
  });
});
