-- 0. Database Initialization Pragmas
-- Must be executed immediately after opening the connection, before any queries.
PRAGMA journal_mode = WAL;   -- Write-Ahead Logging: prevents EBUSY lock errors under Electron IPC
PRAGMA foreign_keys = ON;    -- Enforce all FOREIGN KEY constraints

-- 1. Settings Store (Key-Value)
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT
);

-- 2. Inventory Items Master
CREATE TABLE IF NOT EXISTS items (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT    NOT NULL,
    category         TEXT    CHECK(category IN ('New Phone', 'Accessory', 'Used Phone', 'Repair Service')),
    stock_qty        INTEGER DEFAULT 0,
    purchase_price   REAL    DEFAULT 0.0,
    sell_price       REAL    DEFAULT 0.0,
    gst_rate         REAL    DEFAULT 18.0,
    is_margin_scheme INTEGER DEFAULT 0, -- 0 = Standard GST, 1 = Margin Scheme
    hsn_code         TEXT    NOT NULL DEFAULT '8471'  -- 6-8 digit HSN code
);

-- 3. Purchase Orders Log (Stock-In Ledger)
CREATE TABLE IF NOT EXISTS purchases (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id       INTEGER NOT NULL,
    qty           INTEGER NOT NULL,
    purchase_rate REAL    NOT NULL,
    supplier_name TEXT    DEFAULT '',
    purchase_date TEXT    DEFAULT (CURRENT_TIMESTAMP),
    FOREIGN KEY(item_id) REFERENCES items(id) ON DELETE CASCADE
);

-- 4. Sales Invoices Master
CREATE TABLE IF NOT EXISTS sales (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number  TEXT UNIQUE NOT NULL,  -- Format: YYYYMMDD-HHMMSS-NNN (NNN = 3-digit counter, resets daily)
    sale_date       TEXT    DEFAULT (CURRENT_TIMESTAMP),
    customer_name   TEXT    DEFAULT 'Walk-in Customer',
    customer_gstin  TEXT    DEFAULT '',
    total_taxable   REAL    NOT NULL,
    total_cgst      REAL    NOT NULL,
    total_sgst      REAL    NOT NULL,
    grand_total     REAL    NOT NULL,
    amount_paid     REAL    DEFAULT 0.0,
    payment_mode    TEXT    CHECK(payment_mode IN ('Cash', 'UPI', 'Card', 'Credit')) DEFAULT 'Cash',
    status          TEXT    CHECK(status IN ('Active', 'Voided', 'Refunded')) DEFAULT 'Active',
    invoice_type    TEXT    CHECK(invoice_type IN ('Tax Invoice', 'Estimate')) DEFAULT 'Tax Invoice'
);

-- 5. Sales Line Items (Stock-Out Ledger)
CREATE TABLE IF NOT EXISTS sale_items (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id           INTEGER NOT NULL,
    item_id           INTEGER,             -- Nullable; item may be deleted after sale
    item_name         TEXT    NOT NULL,    -- Snapshot of item name at time of sale
    qty               INTEGER NOT NULL,
    price_per_unit    REAL    NOT NULL,
    is_margin_applied INTEGER DEFAULT 0,
    cgst_amount       REAL    NOT NULL,
    sgst_amount       REAL    NOT NULL,
    imei_number       TEXT    DEFAULT '',  -- Optional 15-digit IMEI tracking
    item_hsn          TEXT    DEFAULT '',  -- Captured HSN snapshot
    FOREIGN KEY(sale_id) REFERENCES sales(id)  ON DELETE CASCADE,
    FOREIGN KEY(item_id) REFERENCES items(id)  ON DELETE SET NULL
);

-- 6. Customers Ledger
CREATE TABLE IF NOT EXISTS customers (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    name            TEXT    NOT NULL,
    phone           TEXT    DEFAULT '',
    gstin           TEXT    DEFAULT '',
    total_purchases REAL    DEFAULT 0,
    created_at      TEXT    DEFAULT CURRENT_TIMESTAMP
);

-- 7. Expenses Tracker
CREATE TABLE IF NOT EXISTS expenses (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    description     TEXT    NOT NULL,
    amount          REAL    NOT NULL,
    category        TEXT    DEFAULT 'General',
    expense_date    TEXT    DEFAULT CURRENT_TIMESTAMP,
    notes           TEXT    DEFAULT ''
);

-- 8. Customer Payments (Partial payments audit log)
CREATE TABLE IF NOT EXISTS customer_payments (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id         INTEGER NOT NULL,
    amount          REAL    NOT NULL,
    payment_mode    TEXT    CHECK(payment_mode IN ('Cash', 'UPI', 'Card', 'Credit')) DEFAULT 'Cash',
    payment_date    TEXT    DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(sale_id) REFERENCES sales(id) ON DELETE CASCADE
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_items_category      ON items(category);
CREATE INDEX IF NOT EXISTS idx_purchases_item_id   ON purchases(item_id);
CREATE INDEX IF NOT EXISTS idx_purchases_date      ON purchases(purchase_date);
CREATE INDEX IF NOT EXISTS idx_sales_date          ON sales(sale_date);
CREATE INDEX IF NOT EXISTS idx_sales_status        ON sales(status);
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id  ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_item_id  ON sale_items(item_id);
CREATE INDEX IF NOT EXISTS idx_customers_phone     ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_expenses_date       ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_customer_payments_sale_id ON customer_payments(sale_id);
