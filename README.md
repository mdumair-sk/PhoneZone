# Phone Zone — Offline Desktop POS

A premium, production-grade offline Point-of-Sale and inventory manager specifically designed for mobile phone retail shops. Built with **Electron + Vite + Vanilla CSS (Custom Design System) + better-sqlite3**.

![Phone Zone Interface](https://via.placeholder.com/1000x600.png?text=Phone+Zone+POS)

---

## Key Features

- **Immersive Fullscreen UI**: Automatically opens in a maximized window on launch.
- **Dynamic Dashboard**: Real-time sales metrics, weekly revenue charts (SVG), low stock alerts, and quick actions.
- **Advanced POS System**:
  - Lightning-fast barcode scanner support (via keyboard input buffering).
  - Smart customer auto-suggest by Name or Phone number.
  - Complex tax calculations including Standard GST (18%) and Margin Scheme (for used phones).
  - Cart management with editable quantities and stock validation.
- **Customer Ledger & Credit Tracking**:
  - Automatically profiles walk-in customers and returning customers.
  - Tracks overall purchases and active Credit balances.
  - **Partial Payment Engine**: Log partial upfront payments on credit invoices and track subsequent installments with a full audit log of payment modes (Cash, UPI, Card).
- **Inventory Management**: Track "New Phone", "Used Phone", "Accessory", and "Repair Service" stock with detailed purchase history logging.
- **Expense Tracker**: Keep a running ledger of operational expenses (Rent, Utilities, Salaries) with monthly totals.
- **Security & Licensing**: 
  - Master Password protection for the entire application.
  - Machine-Lock Fingerprinting: App is tied to the hardware via HMAC-SHA256 licensing (requires `license.lic`).
- **Premium Theming Engine**:
  - Built-in Themes: 🌑 Dark, ☀️ Light, ⚡ Cyberpunk, ❄️ Nord, and 🌙 Midnight.
  - Dynamically changes CSS variables, body fonts, and monospace fonts instantly.

---

## Prerequisites

| Tool        | Version  |
|-------------|----------|
| Node.js     | 20.x LTS |
| npm         | 9+       |
| Windows     | 10 / 11  |

> Linux/macOS can run the dev server but the `.exe` build target requires Windows (or a Windows cross-compile environment).

---

## Quick Start (Development)

```bash
# 1. Install dependencies
npm install

# 2. Rebuild native modules against Electron's Node ABI (required for better-sqlite3)
npx electron-rebuild

# 3. Start Vite dev server + Electron window
npm run dev
```

The app opens automatically. Hot-reload works for renderer changes. Electron main process changes require a full restart.

---

## Building the Windows Installer

```bash
# Compile renderer + package into a Windows NSIS installer
npm run dist
```

Output: `dist-installer/Phone Zone Setup x.x.x.exe`

> **Before building**, replace `assets/icon.ico` with a real
> **256 × 256 pixel `.ico` file** (multi-resolution recommended: 16/32/48/256 px).
> A missing or invalid icon will cause electron-builder to fail.

---

## Database Location

SQLite database file: `%APPDATA%\phone-zone\shop.db`

Full path example: `C:\Users\<YourName>\AppData\Roaming\phone-zone\shop.db`

To open it manually: use [DB Browser for SQLite](https://sqlitebrowser.org/).

---

## Backup & Recovery

- **Reports → Download JSON Backup** — exports all tables to a timestamped `.json` file.
- **Reports → Download GSTR-1 Excel** — exports active sales in GSTR-1 format for a date range.
- The JSON backup can be used to restore data if the database file is lost.

---

## Tax Calculation Reference

| Scheme         | Formula |
|----------------|---------|
| Standard GST   | `taxableBase = unitPrice ÷ (1 + rate/100)` |
| Margin Scheme  | `taxableBase = (unitPrice − purchasePrice) ÷ (1 + rate/100)` |

CGST = SGST = totalGST ÷ 2

Margin scheme applies **only** to Used Phones and must be toggled per line item.

---

## Architecture Overview

```text
phone-zone/
├── main.js               # Electron main process (IPC, Hardware Fingerprint, Window)
├── preload.js            # Context bridge (window.api.db)
├── vite.config.js
├── src/
│   ├── index.html        # Shell HTML
│   ├── main.js           # Frontend entry, Router, Theme Engine, Licensing Modal
│   ├── styles/
│   │   └── main.css      # Custom CSS variables, themes, utilities, components
│   ├── db/
│   │   ├── schema.sql    # Idempotent DB schema (sales, items, customers, expenses, customer_payments)
│   └── screens/
│       ├── dashboard.js  # Sales metrics, Charts, Alerts
│       ├── pos.js        # Billing, Cart, Auto-suggest, Checkout
│       ├── inventory.js  # Stock management
│       ├── customers.js  # Ledger, Partial Payments resolution
│       ├── expenses.js   # Monthly operational expense logging
│       ├── reports.js    # GSTR-1 export, JSON backup
│       └── settings.js   # Shop branding, Themes, Security
└── dist/                 # Vite build output (auto-generated)
```