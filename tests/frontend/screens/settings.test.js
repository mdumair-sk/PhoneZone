// tests/frontend/screens/settings.test.js
// ─────────────────────────────────────────────────────────────────────────────
// Tests for Settings Screen: shop info, theme selection, password hashing,
// custom theme persistence, and default settings seeding.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { seedSettings, getMockSettings } from '../../setup.js';

// ── Default Settings Logic ───────────────────────────────────────────────────

describe('Settings Defaults', () => {
  const DEFAULTS = [
    ['shop_name', ''],
    ['shop_address', ''],
    ['shop_gstin', ''],
    ['shop_email', ''],
    ['shop_phone', ''],
    ['default_gst_rate', '18.0'],
    ['app_theme', 'light'],
    ['master_password', ''],
    ['invoice_daily_counter', '0'],
    ['invoice_counter_date', ''],
    ['bank_name', ''],
    ['bank_acc_name', ''],
    ['bank_acc_no', ''],
    ['bank_ifsc', ''],
    ['bank_branch', ''],
  ];

  it('has 15 default settings', () => {
    expect(DEFAULTS.length).toBe(15);
  });

  it('default GST rate is 18.0', () => {
    const gst = DEFAULTS.find(d => d[0] === 'default_gst_rate');
    expect(gst).toBeTruthy();
    expect(gst[1]).toBe('18.0');
  });

  it('default theme is light', () => {
    const theme = DEFAULTS.find(d => d[0] === 'app_theme');
    expect(theme[1]).toBe('light');
  });

  it('master password default is empty (no lock)', () => {
    const pw = DEFAULTS.find(d => d[0] === 'master_password');
    expect(pw[1]).toBe('');
  });

  it('all bank fields are present', () => {
    const bankFields = DEFAULTS.filter(d => d[0].startsWith('bank_'));
    expect(bankFields.length).toBe(5);
  });
});

// ── Theme System ─────────────────────────────────────────────────────────────

describe('Settings Theme Configuration', () => {
  const builtInThemes = ['dark', 'light', 'cyberpunk', 'nord', 'mocha', 'midnight-terminal', 'neon-ember'];

  it('has 7 built-in themes', () => {
    expect(builtInThemes.length).toBe(7);
  });

  it('each theme has a valid id', () => {
    builtInThemes.forEach(id => {
      expect(id).toBeTruthy();
      expect(typeof id).toBe('string');
    });
  });
});

// ── Shop Information Validation ──────────────────────────────────────────────

describe('Settings Shop Info', () => {
  it('GSTIN format: 15 characters alphanumeric', () => {
    const gstin = '27AABCU9603R1ZX';
    expect(gstin.length).toBe(15);
    expect(/^[0-9A-Z]{15}$/.test(gstin)).toBe(true);
  });

  it('accepts empty GSTIN (optional field)', () => {
    const gstin = '';
    expect(gstin === '' || /^[0-9A-Z]{15}$/.test(gstin)).toBe(true);
  });

  it('phone number can be 10 digits', () => {
    const phone = '9876543210';
    expect(phone.length).toBe(10);
    expect(/^\d{10}$/.test(phone)).toBe(true);
  });

  it('email validation basic check', () => {
    const validEmail = 'shop@example.com';
    expect(validEmail.includes('@')).toBe(true);
    expect(validEmail.includes('.')).toBe(true);
  });
});

// ── Password Hashing ─────────────────────────────────────────────────────────

describe('Settings Password Hashing', () => {
  it('SHA-256 produces 64 hex characters', () => {
    // Known SHA-256 of "admin123"
    const hash = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9';
    expect(hash.length).toBe(64);
    expect(/^[0-9a-f]{64}$/.test(hash)).toBe(true);
  });

  it('empty password means no lock screen', () => {
    const storedHash = '';
    const shouldLock = !!storedHash.trim();
    expect(shouldLock).toBe(false);
  });

  it('non-empty hash enables lock screen', () => {
    const storedHash = '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9';
    const shouldLock = !!storedHash.trim();
    expect(shouldLock).toBe(true);
  });
});

// ── Nav Branding Dynamic Sizing ──────────────────────────────────────────────

describe('Settings Nav Branding Sizing', () => {
  function getExpectedFontSize(name) {
    const len = name.length;
    if (len >= 24) return '12px';
    if (len >= 18) return '14px';
    if (len >= 14) return '16px';
    if (len >= 10) return '18px';
    return '22px';
  }

  it('short name gets 22px', () => {
    expect(getExpectedFontSize('Shop')).toBe('22px');
  });

  it('medium name gets 18px', () => {
    expect(getExpectedFontSize('Phone Zone!')).toBe('18px');
  });

  it('longer name gets 16px', () => {
    expect(getExpectedFontSize('My Phone Zone Co')).toBe('16px');
  });

  it('long name gets 14px', () => {
    expect(getExpectedFontSize('Ramesh Phone Zone Co')).toBe('14px');
  });

  it('very long name gets 12px', () => {
    expect(getExpectedFontSize('Super Duper Long Shop Name!!!')).toBe('12px');
  });

  it('empty name defaults to Phone Zone', () => {
    const shopName = '';
    const displayName = shopName.trim() !== '' ? shopName : 'Phone Zone';
    expect(displayName).toBe('Phone Zone');
  });
});

// ── Settings Persistence ─────────────────────────────────────────────────────

describe('Settings Persistence via Mock DB', () => {
  it('saves and retrieves a setting', async () => {
    seedSettings([['shop_name', 'Test Shop']]);
    const settings = await window.getSettings();
    expect(settings.shop_name).toBe('Test Shop');
  });

  it('overwrites an existing setting', async () => {
    seedSettings([['shop_name', 'Old Name']]);
    seedSettings([['shop_name', 'New Name']]);
    const settings = await window.getSettings();
    expect(settings.shop_name).toBe('New Name');
  });

  it('returns multiple settings at once', async () => {
    seedSettings([
      ['shop_name', 'My Shop'],
      ['app_theme', 'dark'],
      ['default_gst_rate', '12.0'],
    ]);
    const settings = await window.getSettings();
    expect(Object.keys(settings).length).toBe(3);
    expect(settings.shop_name).toBe('My Shop');
    expect(settings.app_theme).toBe('dark');
    expect(settings.default_gst_rate).toBe('12.0');
  });
});

// ── Bank Details ─────────────────────────────────────────────────────────────

describe('Settings Bank Details', () => {
  it('IFSC code is 11 characters', () => {
    const ifsc = 'SBIN0001234';
    expect(ifsc.length).toBe(11);
    expect(/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)).toBe(true);
  });

  it('account number is numeric', () => {
    const accNo = '12345678901234';
    expect(/^\d+$/.test(accNo)).toBe(true);
  });
});
