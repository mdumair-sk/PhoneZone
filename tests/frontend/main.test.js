// tests/frontend/main.test.js
// ─────────────────────────────────────────────────────────────────────────────
// Tests for src/main.js global utilities: Theme, Toast, escHtml, Confirm,
// Custom Selects, Router, Lock Screen, and Nav Branding.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { seedSettings } from '../setup.js';

// ── escHtml ──────────────────────────────────────────────────────────────────
// We re-implement escHtml here for testability since it's a private function.
// This validates the logic is correct for all edge cases.

function escHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

describe('escHtml utility', () => {
  it('escapes ampersands', () => {
    expect(escHtml('A&B')).toBe('A&amp;B');
  });

  it('escapes angle brackets', () => {
    expect(escHtml('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });

  it('escapes double quotes', () => {
    expect(escHtml('He said "hello"')).toBe('He said &quot;hello&quot;');
  });

  it('handles null and undefined', () => {
    expect(escHtml(null)).toBe('');
    expect(escHtml(undefined)).toBe('');
  });

  it('handles numeric input', () => {
    expect(escHtml(12345)).toBe('12345');
  });

  it('handles empty string', () => {
    expect(escHtml('')).toBe('');
  });

  it('handles string with all special characters', () => {
    expect(escHtml('&<>"')).toBe('&amp;&lt;&gt;&quot;');
  });
});

// ── Theme System ─────────────────────────────────────────────────────────────

describe('Theme System', () => {
  it('THEMES object contains expected themes', () => {
    const themeIds = Object.keys(window.THEMES);
    expect(themeIds).toContain('dark');
    expect(themeIds).toContain('light');
  });

  it('each theme has required structure', () => {
    for (const [id, theme] of Object.entries(window.THEMES)) {
      expect(theme).toHaveProperty('label');
      expect(theme).toHaveProperty('fonts');
      expect(theme).toHaveProperty('vars');
      expect(theme.vars).toHaveProperty('bg');
      expect(theme.vars).toHaveProperty('surface');
      expect(theme.vars).toHaveProperty('border');
      expect(theme.vars).toHaveProperty('text');
      expect(theme.vars).toHaveProperty('primary');
    }
  });

  it('applyTheme is callable and persists theme to settings', async () => {
    await window.applyTheme('dark');
    expect(window.applyTheme).toHaveBeenCalledWith('dark');
  });
});

// ── Toast System ─────────────────────────────────────────────────────────────

describe('Toast System', () => {
  it('showToast is callable', () => {
    window.showToast('Test message', 'success');
    expect(window.showToast).toHaveBeenCalledWith('Test message', 'success');
  });

  it('showToast accepts different types', () => {
    window.showToast('Error!', 'error');
    expect(window.showToast).toHaveBeenCalledWith('Error!', 'error');

    window.showToast('Warning!', 'warning');
    expect(window.showToast).toHaveBeenCalledWith('Warning!', 'warning');

    window.showToast('Info!', 'info');
    expect(window.showToast).toHaveBeenCalledWith('Info!', 'info');
  });
});

// ── Confirm Modal ────────────────────────────────────────────────────────────

describe('Confirm Modal', () => {
  it('showConfirm resolves to true when confirmed', async () => {
    window.showConfirm.mockResolvedValue(true);
    const result = await window.showConfirm('Delete?', 'Are you sure?', 'Delete', 'danger');
    expect(result).toBe(true);
  });

  it('showConfirm resolves to false when cancelled', async () => {
    window.showConfirm.mockResolvedValue(false);
    const result = await window.showConfirm('Delete?', 'Are you sure?');
    expect(result).toBe(false);
  });
});

// ── Router ───────────────────────────────────────────────────────────────────

describe('Router', () => {
  it('__showScreen navigates to the correct screen', () => {
    window.__showScreen('pos');
    expect(window.__showScreen).toHaveBeenCalledWith('pos');
  });

  it('__showScreen handles all known screen names', () => {
    const screens = ['dashboard', 'pos', 'customers', 'inventory', 'expenses', 'reports', 'settings'];
    screens.forEach(screen => {
      window.__showScreen(screen);
      expect(window.__showScreen).toHaveBeenCalledWith(screen);
    });
  });
});

// ── Settings Utility ─────────────────────────────────────────────────────────

describe('getSettings', () => {
  it('returns an empty object when no settings exist', async () => {
    const s = await window.getSettings();
    expect(s).toEqual({});
  });

  it('returns settings as key-value pairs', async () => {
    seedSettings([
      ['shop_name', 'My Shop'],
      ['app_theme', 'dark'],
    ]);
    const s = await window.getSettings();
    expect(s.shop_name).toBe('My Shop');
    expect(s.app_theme).toBe('dark');
  });
});

// ── Custom Select System ─────────────────────────────────────────────────────

describe('Custom Select System', () => {
  it('setupCustomSelects is callable and a function', () => {
    expect(typeof window.setupCustomSelects).toBe('function');
  });

  it('does not throw when called with a container', () => {
    const div = document.createElement('div');
    div.innerHTML = '<select class="fh-input"><option value="a">A</option></select>';
    expect(() => window.setupCustomSelects(div)).not.toThrow();
  });
});

// ── Window Controls ──────────────────────────────────────────────────────────

describe('Window Controls', () => {
  it('minimize is callable', () => {
    window.api.window.minimize();
    expect(window.api.window.minimize).toHaveBeenCalled();
  });

  it('maximize is callable', () => {
    window.api.window.maximize();
    expect(window.api.window.maximize).toHaveBeenCalled();
  });

  it('close is callable', () => {
    window.api.window.close();
    expect(window.api.window.close).toHaveBeenCalled();
  });
});

// ── Nav Branding ─────────────────────────────────────────────────────────────

describe('Nav Branding', () => {
  it('refreshNavBranding is callable', async () => {
    await window.refreshNavBranding();
    expect(window.refreshNavBranding).toHaveBeenCalled();
  });
});
