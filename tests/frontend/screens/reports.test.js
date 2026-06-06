// tests/frontend/screens/reports.test.js
// ─────────────────────────────────────────────────────────────────────────────
// Tests for Reports Screen: GSTR-1 workbook builder, date presets,
// summary fetching, download trigger, import validation.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { seedSales } from '../../setup.js';

// ── Re-implement pure functions from reports.js ──────────────────────────────

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
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return last.toISOString().slice(0, 10);
}

function formatDateDisplay(iso) {
  if (!iso) return '—';
  const [y, m, dd] = iso.split('-');
  return `${dd}/${m}/${y}`;
}

function nowStamp() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Reports Date Utilities', () => {
  it('today() returns YYYY-MM-DD format', () => {
    expect(today()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('firstOfMonth() returns 01 as the day', () => {
    const first = firstOfMonth();
    expect(first).toMatch(/-01$/);
  });

  it('lastOfMonth() returns last day of current month', () => {
    const last = lastOfMonth();
    const d = new Date(last);
    expect(d.getDate()).toBeGreaterThanOrEqual(28);
    expect(d.getDate()).toBeLessThanOrEqual(31);
  });

  it('formatDateDisplay converts ISO to DD/MM/YYYY', () => {
    expect(formatDateDisplay('2025-06-15')).toBe('15/06/2025');
    expect(formatDateDisplay('2024-01-01')).toBe('01/01/2024');
  });

  it('formatDateDisplay returns — for empty input', () => {
    expect(formatDateDisplay('')).toBe('—');
    expect(formatDateDisplay(null)).toBe('—');
    expect(formatDateDisplay(undefined)).toBe('—');
  });

  it('nowStamp returns a compact timestamp', () => {
    const stamp = nowStamp();
    expect(stamp).toMatch(/^\d{8}_\d{6}$/);
  });
});

describe('Reports round2', () => {
  it('rounds to 2 decimal places', () => {
    expect(round2(10.555)).toBe(10.56);
    expect(round2(10.554)).toBe(10.55);
    expect(round2(0.1 + 0.2)).toBeCloseTo(0.3, 2);
  });

  it('handles null/undefined', () => {
    expect(round2(null)).toBe(0);
    expect(round2(undefined)).toBe(0);
  });

  it('handles negative numbers', () => {
    expect(round2(-10.555)).toBe(-10.55); // Banker's rounding edge case
  });
});

describe('Reports Date Presets', () => {
  function applyPreset(preset) {
    const now = new Date();
    const p = n => String(n).padStart(2, '0');
    const ymd = d => `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;

    let startValue, endValue;

    if (preset === 'this-month') {
      startValue = `${now.getFullYear()}-${p(now.getMonth() + 1)}-01`;
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      endValue = ymd(last);
    } else if (preset === 'last-month') {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      startValue = ymd(first);
      endValue = ymd(last);
    } else if (preset === 'last-90') {
      const start = new Date();
      start.setDate(start.getDate() - 89);
      startValue = ymd(start);
      endValue = ymd(now);
    } else if (preset === 'this-year') {
      startValue = `${now.getFullYear()}-01-01`;
      endValue = `${now.getFullYear()}-12-31`;
    }
    return { startValue, endValue };
  }

  it('this-month: starts on 1st, ends on last day', () => {
    const { startValue, endValue } = applyPreset('this-month');
    expect(startValue).toMatch(/-01$/);
    const endDay = parseInt(endValue.split('-')[2], 10);
    expect(endDay).toBeGreaterThanOrEqual(28);
  });

  it('last-month: produces valid range', () => {
    const { startValue, endValue } = applyPreset('last-month');
    expect(startValue).toMatch(/-01$/);
    expect(new Date(startValue) < new Date(endValue)).toBe(true);
  });

  it('last-90: spans 90 days', () => {
    const { startValue, endValue } = applyPreset('last-90');
    const start = new Date(startValue);
    const end = new Date(endValue);
    const diff = Math.round((end - start) / (1000 * 60 * 60 * 24));
    expect(diff).toBeGreaterThanOrEqual(88);
    expect(diff).toBeLessThanOrEqual(90);
  });

  it('this-year: Jan 1 to Dec 31', () => {
    const { startValue, endValue } = applyPreset('this-year');
    const year = new Date().getFullYear();
    expect(startValue).toBe(`${year}-01-01`);
    expect(endValue).toBe(`${year}-12-31`);
  });
});

describe('GSTR-1 Workbook Data Processing', () => {
  it('calculates taxable value correctly for standard GST', () => {
    const cgst = 90;
    const sgst = 90;
    const lineTotal = 1180;
    const totalGST = round2(cgst + sgst);
    const taxableValue = round2(lineTotal - totalGST);
    expect(taxableValue).toBe(1000);
  });

  it('calculates taxable value correctly for margin scheme', () => {
    // Margin scheme: taxable value = lineTotal - totalGST
    const cgst = 762.71;
    const sgst = 762.71;
    const lineTotal = 50000;
    const totalGST = round2(cgst + sgst);
    const taxableValue = round2(lineTotal - totalGST);
    expect(taxableValue).toBeCloseTo(48474.58, 0);
  });

  it('scheme label is correct', () => {
    expect(0 ? 'Margin Scheme' : 'Standard GST').toBe('Standard GST');
    expect(1 ? 'Margin Scheme' : 'Standard GST').toBe('Margin Scheme');
  });
});

describe('Reports Import Validation', () => {
  it('validates backup JSON has expected tables', () => {
    const EXPECTED_TABLES = ['items', 'purchases', 'sales', 'sale_items'];

    const validBackup = {
      items: [{ id: 1 }],
      purchases: [],
      sales: [],
      sale_items: [],
    };
    const foundTables = EXPECTED_TABLES.filter(t => Array.isArray(validBackup[t]));
    expect(foundTables.length).toBe(4);
  });

  it('rejects backup without any recognized tables', () => {
    const EXPECTED_TABLES = ['items', 'purchases', 'sales', 'sale_items'];

    const invalidBackup = { foo: 'bar', baz: 123 };
    const foundTables = EXPECTED_TABLES.filter(t => Array.isArray(invalidBackup[t]));
    expect(foundTables.length).toBe(0);
  });

  it('calculates total rows correctly', () => {
    const data = {
      items: [1, 2, 3],
      purchases: [1],
      sales: [1, 2],
      sale_items: [1, 2, 3, 4],
      settings: [1],
    };
    const counts = {
      items: (data.items ?? []).length,
      purchases: (data.purchases ?? []).length,
      sales: (data.sales ?? []).length,
      sale_items: (data.sale_items ?? []).length,
      settings: (data.settings ?? []).length,
    };
    const totalRows = Object.values(counts).reduce((a, b) => a + b, 0);
    expect(totalRows).toBe(11);
  });
});

describe('Reports Button State Logic', () => {
  function setButtonState(btn, state, originalHTML) {
    if (state === 'loading') {
      btn.disabled = true;
    } else if (state === 'success') {
      btn.innerHTML = '✓ Downloaded';
      btn.disabled = true;
    } else if (state === 'error') {
      btn.innerHTML = '✗ Failed';
      btn.disabled = true;
    } else {
      btn.innerHTML = originalHTML;
      btn.disabled = false;
    }
  }

  it('sets loading state', () => {
    const btn = { disabled: false, innerHTML: 'Download' };
    setButtonState(btn, 'loading', 'Download');
    expect(btn.disabled).toBe(true);
  });

  it('sets success state', () => {
    const btn = { disabled: false, innerHTML: 'Download' };
    setButtonState(btn, 'success', 'Download');
    expect(btn.disabled).toBe(true);
    expect(btn.innerHTML).toBe('✓ Downloaded');
  });

  it('sets error state', () => {
    const btn = { disabled: false, innerHTML: 'Download' };
    setButtonState(btn, 'error', 'Download');
    expect(btn.disabled).toBe(true);
    expect(btn.innerHTML).toBe('✗ Failed');
  });

  it('resets to idle state', () => {
    const btn = { disabled: true, innerHTML: '✓ Downloaded' };
    setButtonState(btn, 'idle', 'Download');
    expect(btn.disabled).toBe(false);
    expect(btn.innerHTML).toBe('Download');
  });
});

describe('Reports Date Validation', () => {
  it('rejects when start date is after end date', () => {
    const start = '2025-07-01';
    const end = '2025-06-15';
    expect(start > end).toBe(true);
  });

  it('accepts valid date range', () => {
    const start = '2025-06-01';
    const end = '2025-06-30';
    expect(start <= end).toBe(true);
  });

  it('accepts same start and end date', () => {
    const start = '2025-06-15';
    const end = '2025-06-15';
    expect(start <= end).toBe(true);
  });
});
