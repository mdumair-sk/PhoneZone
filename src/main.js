// src/main.js
// ─────────────────────────────────────────────────────────────────────────────
// FoneHisab — Frontend entry point, router, shell
// ─────────────────────────────────────────────────────────────────────────────

import { initDatabase }    from './db/init.js';
import { renderDashboard } from './screens/dashboard.js';
import { renderPOS }       from './screens/pos.js';
import { renderInventory } from './screens/inventory.js';
import { renderCustomers } from './screens/customers.js';
import { renderExpenses }  from './screens/expenses.js';
import { renderReports }   from './screens/reports.js';
import { renderSettings }  from './screens/settings.js';

// ── Global helpers ────────────────────────────────────────────────────────────

/**
 * Fetches all rows from the settings table and returns a flat object.
 * @returns {Promise<Record<string,string>>}
 */
window.getSettings = async function getSettings() {
  try {
    const r = await window.api.db.query(`SELECT key, value FROM settings`);
    if (!r.ok) return {};
    return Object.fromEntries(r.rows.map(row => [row.key, row.value]));
  } catch (_) {
    return {};
  }
};

// ── Theme System ──────────────────────────────────────────────────────────────

window.THEMES = {
  dark: {
    label: '🌑 Dark',
    fonts: { body: 'Inter', mono: 'JetBrains Mono', heading: 'Syne' },
    vars: { bg:'#0D0D0D', surface:'#1A1A1A', border:'#2A2A2A', text:'#E0E0E0', primary:'#00FFB2' }
  },
  light: {
    label: '☀️ Light',
    fonts: { body: 'Inter', mono: 'JetBrains Mono', heading: 'Syne' },
    vars: { bg:'#F0F4F8', surface:'#FFFFFF', border:'#CBD5E1', text:'#1E293B', primary:'#2563EB' }
  },
  cyberpunk: {
    label: '⚡ Cyberpunk',
    fonts: { body: 'Orbitron', mono: 'Share Tech Mono', heading: 'Orbitron' },
    vars: { bg:'#0D0D0D', surface:'#111111', border:'#1E1E1E', text:'#E0E0E0', primary:'#00FFB2' }
  },
  nord: {
    label: '❄️ Nord',
    fonts: { body: 'Nunito', mono: 'JetBrains Mono', heading: 'Nunito' },
    vars: { bg:'#2E3440', surface:'#3B4252', border:'#434C5E', text:'#ECEFF4', primary:'#88C0D0' }
  },
  mocha: {
    label: '☕ Mocha',
    fonts: { body: 'Lato', mono: 'Fira Code', heading: 'Playfair Display' },
    vars: { bg:'#1C1917', surface:'#292524', border:'#3C3835', text:'#E7E5E4', primary:'#FB923C' }
  }
};

window.applyTheme = async function applyTheme(themeId) {
  let themeObj = window.THEMES[themeId];
  if (!themeObj) {
    try {
      const res = await window.api.db.query(`SELECT value FROM settings WHERE key = ?`, [`custom_theme_${themeId}`]);
      if (res.ok && res.rows.length) {
        themeObj = JSON.parse(res.rows[0].value);
      }
    } catch(e) {}
  }
  if (!themeObj) themeObj = window.THEMES.dark;

  document.documentElement.setAttribute('data-theme', themeId);
  
  // Update Variables
  let varsStyle = document.getElementById('fh-theme-vars');
  if (!varsStyle) {
    varsStyle = document.createElement('style');
    varsStyle.id = 'fh-theme-vars';
    document.head.appendChild(varsStyle);
  }
  const { bg, surface, border, text, primary } = themeObj.vars;
  varsStyle.textContent = `
    :root {
      --color-bg: ${bg};
      --color-surface: ${surface};
      --color-border: ${border};
      --color-text: ${text};
      --color-primary: ${primary};
    }
  `;

  // Update Fonts
  let fontsStyle = document.getElementById('fh-theme-fonts');
  if (!fontsStyle) {
    fontsStyle = document.createElement('style');
    fontsStyle.id = 'fh-theme-fonts';
    document.head.appendChild(fontsStyle);
  }
  if (themeObj.fonts) {
    const { body, mono, heading } = themeObj.fonts;
    const fBody = body.replace(/ /g, '+');
    const fMono = mono.replace(/ /g, '+');
    const fHead = heading.replace(/ /g, '+');
    
    fontsStyle.textContent = `
      @import url('https://fonts.googleapis.com/css2?family=${fBody}:wght@400;500;600;700&family=${fMono}:wght@400;500;600&family=${fHead}:wght@600;700;800&display=swap');
      body, html, .fh-input, .fh-btn, .fh-label { font-family: '${body}', sans-serif; }
      .mono, .fh-input[type="number"], .tabular-nums { font-family: '${mono}', monospace; }
      h1, h2, h3, .fh-card-title, .theme-heading-font { font-family: '${heading}', sans-serif; }
    `;
  }

  await window.api.db.run(
    `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`, 
    ['app_theme', themeId]
  );
};

// ── Toast system ──────────────────────────────────────────────────────────────

let _toastContainer = null;

function ensureToastContainer() {
  if (_toastContainer && document.body.contains(_toastContainer)) return _toastContainer;
  _toastContainer = document.createElement('div');
  Object.assign(_toastContainer.style, {
    position:      'fixed',
    top:           '20px',
    right:         '20px',
    display:       'flex',
    flexDirection: 'column',
    gap:           '8px',
    zIndex:        '99999',
    pointerEvents: 'none',
  });
  document.body.appendChild(_toastContainer);
  return _toastContainer;
}

const TOAST_COLORS = {
  success: { bg: '#00FFB2', fg: '#0D0D0D' },
  error:   { bg: '#FF4444', fg: '#FFFFFF' },
  info:    { bg: '#38bdf8', fg: '#0D0D0D' },
  warning: { bg: '#FF8C00', fg: '#0D0D0D' },
};

/**
 * Global toast. type = 'success' | 'error' | 'info' | 'warning'
 * @param {string} message
 * @param {'success'|'error'|'info'|'warning'} type
 */
window.showToast = function showToast(message, type = 'success') {
  const { bg, fg } = TOAST_COLORS[type] ?? TOAST_COLORS.success;
  const wrap       = ensureToastContainer();

  const toast = document.createElement('div');
  toast.textContent = message;
  Object.assign(toast.style, {
    background:    bg,
    color:         fg,
    padding:       '10px 18px',
    borderRadius:  '6px',
    fontSize:      '12px',
    fontWeight:    '600',
    letterSpacing: '0.05em',
    boxShadow:     `0 4px 20px ${bg}66`,
    opacity:       '0',
    transform:     'translateY(-8px)',
    transition:    'opacity 0.18s ease, transform 0.18s ease',
    pointerEvents: 'auto',
    maxWidth:      '320px',
    lineHeight:    '1.4',
    fontFamily:    'inherit',
  });
  wrap.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.style.opacity   = '1';
      toast.style.transform = 'translateY(0)';
    });
  });

  // Fade out and remove
  const dismiss = () => {
    toast.style.opacity   = '0';
    toast.style.transform = 'translateY(-8px)';
    setTimeout(() => toast.remove(), 200);
  };
  setTimeout(dismiss, 3000);
  toast.addEventListener('click', dismiss);
};

// ── Confirm modal system ──────────────────────────────────────────────────────

/**
 * Shows a confirmation modal. Returns Promise<boolean>.
 * @param {string} title
 * @param {string} message
 * @param {string} confirmLabel
 * @param {'danger'|'warn'|'primary'} confirmStyle
 */
window.showConfirm = function showConfirm(
  title,
  message,
  confirmLabel  = 'Confirm',
  confirmStyle  = 'danger'
) {
  return new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'fh-modal-backdrop';
    backdrop.innerHTML = `
      <div class="fh-modal" style="max-width:440px;width:92%;">
        <div style="
          font-size:15px;font-weight:700;margin-bottom:14px;
          letter-spacing:0.02em;
        ">${message ? escHtml(title) : '⚠ Confirm Action'}</div>
        ${message ? `
          <p style="font-size:13px;opacity:0.75;line-height:1.65;margin-bottom:22px;">
            ${escHtml(message)}
          </p>` : ''}
        <div style="display:flex;gap:10px;justify-content:flex-end;">
          <button id="confirm-cancel" class="fh-btn fh-btn-ghost">Cancel</button>
          <button id="confirm-ok" class="fh-btn fh-btn-${confirmStyle}">
            ${escHtml(confirmLabel)}
          </button>
        </div>
      </div>`;

    document.body.appendChild(backdrop);

    backdrop.querySelector('#confirm-cancel').addEventListener('click', () => {
      backdrop.remove();
      resolve(false);
    });
    backdrop.querySelector('#confirm-ok').addEventListener('click', () => {
      backdrop.remove();
      resolve(true);
    });
    backdrop.addEventListener('click', e => {
      if (e.target === backdrop) { backdrop.remove(); resolve(false); }
    });
  });
};

function escHtml(v) {
  return String(v ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Nav config ────────────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { id: 'dashboard', icon: '🏠', label: 'Dashboard' },
  { id: 'pos',       icon: '🧾', label: 'Billing'   },
  { id: 'customers', icon: '👥', label: 'Customers' },
  { id: 'inventory', icon: '📦', label: 'Inventory' },
  { id: 'expenses',  icon: '💸', label: 'Expenses'  },
  { id: 'reports',   icon: '📊', label: 'Reports'   },
  { id: 'settings',  icon: '⚙️', label: 'Settings'  },
];

// ── Router ────────────────────────────────────────────────────────────────────

let _currentScreen = null;

window.__showScreen = function showScreen(name) {
  _currentScreen = name;

  // Nav highlight
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('nav-item--active', el.dataset.screen === name);
  });

  const content = document.getElementById('content');
  if (!content) return;

  switch (name) {
    case 'dashboard': renderDashboard(content); break;
    case 'pos':       renderPOS(content);       break;
    case 'customers': renderCustomers(content); break;
    case 'inventory': renderInventory(content); break;
    case 'expenses':  renderExpenses(content);  break;
    case 'reports':   renderReports(content);   break;
    case 'settings':  renderSettings(content);  break;
    default:          content.innerHTML = '';
  }
};

// ── Global CSS ────────────────────────────────────────────────────────────────

function injectGlobalStyles() {
  if (document.getElementById('fh-global-style')) return;
  const s = document.createElement('style');
  s.id = 'fh-global-style';
  s.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Syne:wght@600;700;800&display=swap');

    *, *::before, *::after { box-sizing: border-box; }

    html, body {
      margin: 0; padding: 0; height: 100%;
      font-family: 'Inter', sans-serif;
      font-size: 13.5px;
      line-height: 1.55;
      -webkit-font-smoothing: antialiased;
      background: var(--color-bg);
      color: var(--color-text);
    }

    /* Utility for tabular numeric data */
    .mono, .fh-input[type="number"] {
      font-family: 'JetBrains Mono', monospace;
    }

    :root, [data-theme="dark"] {
      --color-bg:       #0D0D0D;
      --color-surface:  #1A1A1A;
      --color-border:   #2A2A2A;
      --color-text:     #E0E0E0;
      --color-primary:  #00FFB2;
    }
    
    [data-theme="light"] {
      --color-bg:       #F0F4F8;
      --color-surface:  #FFFFFF;
      --color-border:   #CBD5E1;
      --color-text:     #1E293B;
      --color-primary:  #2563EB;
    }

    /* Sidenav overrides for Light Theme (Dark nav + light content) */
    [data-theme="light"] aside {
      --color-surface:  #1E293B;
      --color-text:     #F1F5F9;
      --color-border:   #334155;
    }

    [data-theme="cyberpunk"] {
      --color-bg:       #0D0D0D;
      --color-surface:  #111111;
      --color-border:   #1E1E1E;
      --color-text:     #E0E0E0;
      --color-primary:  #00FFB2;
    }

    /* Scrollbar */
    ::-webkit-scrollbar              { width: 4px; height: 4px; }
    ::-webkit-scrollbar-track        { background: transparent; }
    ::-webkit-scrollbar-thumb        { background: var(--color-border); border-radius: 2px; }
    ::-webkit-scrollbar-thumb:hover  { background: var(--color-primary); }

    /* Nav */
    .nav-item--active {
      border-left-color: var(--color-primary) !important;
      background: rgba(0,255,178,0.07) !important;
      color: var(--color-primary) !important;
      opacity: 1 !important;
    }
    [data-theme="light"] .nav-item--active {
      border-left-color: var(--color-primary) !important;
      background: rgba(37, 99, 235, 0.15) !important; /* Blue tint */
      color: #FFFFFF !important;
    }

    /* Modal */
    .fh-modal-backdrop {
      position: fixed; inset: 0;
      background: rgba(0,0,0,0.72);
      display: flex; align-items: center; justify-content: center;
      z-index: 9000;
      backdrop-filter: blur(5px);
      animation: fhFadeIn 0.15s ease;
    }
    .fh-modal {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: 10px;
      padding: 28px 32px;
      animation: fhSlideUp 0.18s ease;
    }
    [data-theme="light"] .fh-modal {
      border: none;
      box-shadow: 0 8px 30px rgba(0,0,0,0.08);
    }

    /* Shared input / button / card */
    .fh-input {
      width: 100%;
      background: var(--color-bg);
      border: 1px solid var(--color-border);
      color: var(--color-text);
      border-radius: 5px;
      padding: 9px 12px;
      font-family: inherit;
      font-size: 13.5px;
      outline: none;
      transition: border-color 0.15s;
      box-sizing: border-box;
    }
    .fh-input:focus       { border-color: var(--color-primary); }
    .fh-input::placeholder { opacity: 0.3; }
    .fh-input:disabled    { opacity: 0.4; cursor: not-allowed; }
    select.fh-input option { background: var(--color-surface); color: var(--color-text); }

    .fh-btn {
      display: inline-flex; align-items: center; gap: 8px;
      padding: 9px 18px; border-radius: 5px; border: none;
      cursor: pointer; font-family: inherit; font-size: 12px;
      font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase;
      transition: opacity 0.15s, transform 0.1s; white-space: nowrap;
    }
    .fh-btn:hover:not(:disabled) { opacity: 0.82; }
    .fh-btn:active:not(:disabled) { transform: scale(0.97); }
    .fh-btn:disabled { opacity: 0.4; cursor: not-allowed; }

    .fh-btn-primary { background: var(--color-primary); color: #0D0D0D; }
    [data-theme="light"] .fh-btn-primary { color: #FFFFFF; }
    
    .fh-btn-ghost   {
      background: transparent; color: var(--color-text);
      border: 1px solid var(--color-border);
    }
    .fh-btn-danger  { background: #FF4444; color: #fff; }
    .fh-btn-warn    { background: #FF8C00; color: #0D0D0D; }

    .fh-card {
      background: var(--color-surface);
      border: 1px solid var(--color-border);
      border-radius: 8px;
      padding: 24px;
      margin-bottom: 20px;
    }
    [data-theme="light"] .fh-card {
      border: none;
      box-shadow: 0 2px 12px rgba(0,0,0,0.04);
    }

    .fh-card-title {
      font-size: 11px;
      letter-spacing: 0.18em;
      text-transform: uppercase;
      color: var(--color-primary);
      margin-bottom: 18px;
      font-weight: 600;
    }
    .fh-field        { margin-bottom: 16px; }
    .fh-label {
      display: block;
      font-size: 10px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      opacity: 0.45;
      margin-bottom: 6px;
    }

    /* Animations */
    @keyframes fhFadeIn  { from { opacity: 0; }                       to { opacity: 1; } }
    @keyframes fhSlideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
    @keyframes fhShake   {
      0%, 100% { transform: translateX(0); }
      20%      { transform: translateX(-8px); }
      40%      { transform: translateX(8px); }
      60%      { transform: translateX(-5px); }
      80%      { transform: translateX(5px); }
    }
    @keyframes fhSpin    { to { transform: rotate(360deg); } }
    @keyframes fhToastIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
  `;
  document.head.appendChild(s);
}

// ── App shell ─────────────────────────────────────────────────────────────────

function buildShell() {
  document.body.innerHTML = `
    <div id="shell" style="
      display: flex;
      height: 100vh;
      overflow: hidden;
      background: var(--color-bg);
      color: var(--color-text);
    ">
      <!-- Sidenav -->
      <aside style="
        width: 250px; min-width: 250px;
        background: var(--color-surface);
        border-right: 1px solid var(--color-border);
        display: flex; flex-direction: column;
        z-index: 50;
      ">
        <!-- Logo -->
        <div style="padding: 24px 20px 20px; flex-shrink: 0;">
          <div id="nav-shop-name" class="theme-heading-font" style="font-size: 22px; font-weight: 800;
            color: var(--color-primary); letter-spacing: 0.02em; line-height: 1.15;
            display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
            overflow: hidden; text-overflow: ellipsis; word-break: break-word; max-width: 210px; transition: font-size 0.2s;">
            FoneHisab
          </div>
          <div id="nav-shop-sub" class="theme-heading-font" style="
            font-size: 10px; letter-spacing: 0.2em; font-weight: 700;
            opacity: 0.5; margin-top: 3px; text-transform: uppercase;
          ">Shop Manager</div>
        </div>

        <!-- Nav links -->
        <nav style="flex: 1; padding: 10px 0;">
          ${NAV_ITEMS.map(item => `
            <button
              class="nav-item"
              data-screen="${item.id}"
              onclick="window.__showScreen('${item.id}')"
              style="
                width: 100%; display: flex; align-items: center; gap: 12px;
                padding: 11px 18px; border: none; background: transparent;
                cursor: pointer; text-align: left; font-family: inherit;
                font-size: 13px; letter-spacing: 0.05em;
                color: var(--color-text);
                border-left: 3px solid transparent;
                transition: background 0.15s, border-color 0.15s, color 0.15s;
                opacity: 0.6;
              "
              onmouseover="if(!this.classList.contains('nav-item--active')){
                this.style.opacity='1';
                this.style.background='rgba(255,255,255,0.03)';}"
              onmouseout="if(!this.classList.contains('nav-item--active')){
                this.style.opacity='0.6';
                this.style.background='transparent';}"
            >
              <span style="font-size: 15px; line-height: 1; flex-shrink: 0;">${item.icon}</span>
              <span>${item.label}</span>
            </button>`).join('')}
        </nav>

        <!-- Version -->
        <div style="
          padding: 14px 18px;
          font-size: 10px; opacity: 0.18;
          letter-spacing: 0.1em; text-transform: uppercase;
          border-top: 1px solid var(--color-border);
        ">v1.0.0</div>
      </aside>

      <!-- Content -->
      <main id="content" style="flex: 1; overflow-y: auto; overflow-x: hidden;"></main>
    </div>
  `;
}

window.refreshNavBranding = async function updateNavBranding() {
  const s = await window.getSettings();
  const titleEl = document.getElementById('nav-shop-name');
  const subEl   = document.getElementById('nav-shop-sub');
  if (!titleEl || !subEl) return;
  
  if (s.shop_name && s.shop_name.trim() !== '') {
    const name = s.shop_name.trim();
    titleEl.textContent = name;
    subEl.textContent   = 'Powered by FoneHisab';
    
    // Dynamic scaling for long names
    const len = name.length;
    if (len >= 24) {
      titleEl.style.fontSize = '12px';
    } else if (len >= 18) {
      titleEl.style.fontSize = '14px';
    } else if (len >= 14) {
      titleEl.style.fontSize = '16px';
    } else if (len >= 10) {
      titleEl.style.fontSize = '18px';
    } else {
      titleEl.style.fontSize = '22px';
    }
  } else {
    titleEl.textContent = 'FoneHisab';
    subEl.textContent   = 'Shop Manager';
    titleEl.style.fontSize = '22px';
  }
};

// ── Lock screen ───────────────────────────────────────────────────────────────

async function sha256hex(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function showLockScreen(storedHash) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.id = 'lock-overlay';
    Object.assign(overlay.style, {
      position:       'fixed',
      inset:          '0',
      background:     'var(--color-bg)',
      zIndex:         '99998',
      display:        'flex',
      alignItems:     'center',
      justifyContent: 'center',
      flexDirection:  'column',
      animation:      'fhFadeIn 0.3s ease',
    });

    overlay.innerHTML = `
      <div style="
        background: var(--color-surface);
        border: 1px solid var(--color-border);
        border-radius: 12px;
        padding: 40px 44px;
        width: 360px;
        text-align: center;
      ">
        <div style="font-size: 36px; margin-bottom: 16px;">🔐</div>
        <div class="theme-heading-font" style="
          font-size: 20px; font-weight: 700;
          letter-spacing: 0.04em;
          color: var(--color-primary);
          margin-bottom: 6px;
        ">FoneHisab</div>
        <div style="
          font-size: 11px; opacity: 0.35;
          letter-spacing: 0.12em; text-transform: uppercase;
          margin-bottom: 28px;
        ">Enter password to continue</div>

        <input id="lock-pw" type="password" class="fh-input"
          placeholder="Master password"
          style="text-align: center; letter-spacing: 0.1em; font-size: 14px;
            margin-bottom: 12px;" />

        <div id="lock-error" style="
          color: #FF4444; font-size: 11px; min-height: 16px;
          margin-bottom: 14px; letter-spacing: 0.06em;
        "></div>

        <button id="lock-unlock" class="fh-btn fh-btn-primary"
          style="width: 100%; justify-content: center; padding: 12px; font-size: 13px;">
          Unlock
        </button>
      </div>
    `;
    document.body.appendChild(overlay);

    const pwInput  = overlay.querySelector('#lock-pw');
    const errEl    = overlay.querySelector('#lock-error');
    const unlockBtn = overlay.querySelector('#lock-unlock');

    const attempt = async () => {
      const pw = pwInput.value;
      if (!pw) { errEl.textContent = 'Enter your password.'; return; }

      unlockBtn.disabled    = true;
      unlockBtn.textContent = '…';

      const hash = await sha256hex(pw);
      if (hash === storedHash) {
        overlay.style.transition = 'opacity 0.25s ease';
        overlay.style.opacity    = '0';
        setTimeout(() => { overlay.remove(); resolve(); }, 260);
      } else {
        errEl.textContent         = 'Incorrect password.';
        pwInput.value             = '';
        unlockBtn.disabled        = false;
        unlockBtn.textContent     = 'Unlock';
        // Shake animation on the card
        const card = overlay.querySelector('div > div');
        card.style.animation = 'none';
        card.offsetHeight; // reflow
        card.style.animation = 'fhShake 0.4s ease';
      }
    };

    unlockBtn.addEventListener('click', attempt);
    pwInput.addEventListener('keydown', e => { if (e.key === 'Enter') attempt(); });

    // Focus after mount
    setTimeout(() => pwInput.focus(), 60);
  });
}

// ── Bootstrap ─────────────────────────────────────────────────────────────────

(async () => {
  injectGlobalStyles();

  // 1. Load schema (idempotent CREATE TABLE IF NOT EXISTS)
  try {
    const schemaRes = await fetch(new URL('./db/schema.sql', import.meta.url));
    const sql       = await schemaRes.text();
    await window.api.db.init(sql);
    
    // Migration: Add amount_paid if missing
    try {
      await window.api.db.run(`ALTER TABLE sales ADD COLUMN amount_paid REAL DEFAULT 0.0`);
      // Backfill amount_paid
      await window.api.db.run(`UPDATE sales SET amount_paid = grand_total WHERE payment_mode != 'Credit'`);
      await window.api.db.run(`UPDATE sales SET amount_paid = 0.0 WHERE payment_mode = 'Credit'`);
    } catch(e) {
      // Ignored if column already exists
    }
  } catch (e) {
    console.error('[FoneHisab] Schema init error:', e);
  }

  // 2. Seed default settings (INSERT OR IGNORE)
  const defaults = [
    ['shop_name',              ''],
    ['shop_address',           ''],
    ['shop_gstin',             ''],
    ['default_gst_rate',       '18.0'],
    ['app_theme',              'dark'],
    ['master_password',        ''],
    ['invoice_daily_counter',  '0'],
    ['invoice_counter_date',   ''],
  ];
  for (const [key, value] of defaults) {
    await window.api.db.run(
      `INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`, [key, value]
    );
  }

  // 3. Load settings + apply theme before painting
  const settings = await window.getSettings();
  const theme    = settings.app_theme || 'dark';
  await window.applyTheme(theme);

  // 4. Build shell (sets up DOM)
  buildShell();
  await window.refreshNavBranding();

  // 5. Lock screen (if password set)
  const storedHash = (settings.master_password ?? '').trim();
  if (storedHash) {
    await showLockScreen(storedHash);
  }

  // 6. Navigate to default screen
  window.__showScreen('dashboard');
})();
