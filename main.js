const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');

// REPLACE THIS WITH YOUR OWN SECRET KEY BEFORE SHIPPING (min 32 chars recommended)
const SECRET_KEY = 'REPLACE_WITH_YOUR_SECRET_KEY_MIN_32_CHARS';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let db;

function openDatabase() {
  const Database = require('better-sqlite3');
  const dbPath = path.join(app.getPath('userData'), 'shop.db');
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 680,
    frame: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.removeMenu();

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, 'dist/renderer/index.html'));
  }
}

// ── License System ────────────────────────────────────────────────────────────

function getMachineFingerprint() {
  const hostname = os.hostname();
  const cpu = os.cpus()[0].model;
  const interfaces = os.networkInterfaces();
  let mac = '';
  for (const name of Object.keys(interfaces)) {
    const iface = interfaces[name].find(i => !i.internal && i.mac && i.mac !== '00:00:00:00:00:00');
    if (iface) { mac = iface.mac; break; }
  }
  const userDataPath = app.getPath('userData');
  const raw = `${hostname}|${cpu}|${mac}|${userDataPath}`;
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function verifyLicense(licenseObj) {
  if (!licenseObj || typeof licenseObj !== 'object') return { valid: false, reason: 'Invalid license format.' };
  const { machine_id, issued_at, expires_at, shop_name, sig } = licenseObj;
  if (!machine_id || !sig) return { valid: false, reason: 'Missing required license fields.' };

  const fingerprint = getMachineFingerprint();
  if (machine_id !== fingerprint) return { valid: false, reason: 'License is not authorized for this machine.' };

  if (expires_at) {
    const exp = new Date(expires_at).getTime();
    if (isNaN(exp) || Date.now() > exp) return { valid: false, reason: 'License has expired.' };
  }

  // Verify HMAC (Ensure we re-stringify exactly as generated)
  const dataToSign = JSON.stringify({ machine_id, issued_at, expires_at, shop_name });
  const expectedSig = crypto.createHmac('sha256', SECRET_KEY).update(dataToSign).digest('hex');
  if (sig !== expectedSig) return { valid: false, reason: 'License signature is invalid.' };

  return { valid: true };
}

function checkLicense() {
  const licPath = path.join(app.getPath('userData'), 'license.lic');
  if (!fs.existsSync(licPath)) return { valid: false, reason: 'License file missing.' };
  try {
    const raw = fs.readFileSync(licPath, 'utf8');
    const obj = JSON.parse(raw);
    return verifyLicense(obj);
  } catch (e) {
    return { valid: false, reason: 'Failed to read or parse license file.' };
  }
}

function createLockWindow(reason) {
  const win = new BrowserWindow({
    width: 500,
    height: 520,
    frame: false,
    resizable: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'assets', 'lock-preload.js'),
    },
  });
  win.loadFile(path.join(__dirname, 'assets', 'lock.html'));
  
  // Optional: pass reason to window via IPC if needed
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('lock:reason', reason);
  });
}

// ── IPC Handlers ──────────────────────────────────────────────────────────────

// SELECT — returns array of row objects
ipcMain.handle('db:query', (_event, sql, params = []) => {
  try {
    const stmt = db.prepare(sql);
    return { ok: true, rows: stmt.all(...params) };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// INSERT / UPDATE / DELETE — returns { changes, lastInsertRowid }
ipcMain.handle('db:run', (_event, sql, params = []) => {
  try {
    const stmt = db.prepare(sql);
    const info = stmt.run(...params);
    return { ok: true, changes: info.changes, lastInsertRowid: info.lastInsertRowid };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// Schema init — executes the full schema SQL string
ipcMain.handle('db:init', (_event, sql) => {
  try {
    db.exec(sql);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// JSON backup — dumps all tables; optionally saves to a user-chosen path
ipcMain.handle('db:backup', async (_event, savePath) => {
  try {
    const tables = ['settings', 'items', 'purchases', 'sales', 'sale_items'];
    const dump = {};
    for (const table of tables) {
      dump[table] = db.prepare(`SELECT * FROM ${table}`).all();
    }
    const json = JSON.stringify(dump, null, 2);

    let targetPath = savePath;
    if (!targetPath) {
      const { canceled, filePath } = await dialog.showSaveDialog({
        title: 'Save Backup',
        defaultPath: `fonehisab-backup-${Date.now()}.json`,
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (canceled) return { ok: false, error: 'Cancelled' };
      targetPath = filePath;
    }

    fs.writeFileSync(targetPath, json, 'utf8');
    return { ok: true, path: targetPath };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// ── Window Controls ─────────────────────────────────────────────────────────────

ipcMain.on('win:minimize', (event) => {
  const webContents = event.sender;
  const win = BrowserWindow.fromWebContents(webContents);
  if (win) win.minimize();
});

ipcMain.on('win:maximize', (event) => {
  const webContents = event.sender;
  const win = BrowserWindow.fromWebContents(webContents);
  if (win) {
    if (win.isMaximized()) win.restore();
    else win.maximize();
  }
});

ipcMain.on('win:close', (event) => {
  const webContents = event.sender;
  const win = BrowserWindow.fromWebContents(webContents);
  if (win) win.close();
});

// ── App Events ────────────────────────────────────────────────────────────────

// Add License IPCs
ipcMain.handle('license:getFingerprint', () => getMachineFingerprint());
ipcMain.handle('license:activate', (_event, jsonStr) => {
  try {
    const obj = JSON.parse(jsonStr);
    const res = verifyLicense(obj);
    if (!res.valid) return res;
    
    // valid! write to disk
    const licPath = path.join(app.getPath('userData'), 'license.lic');
    fs.writeFileSync(licPath, JSON.stringify(obj, null, 2), 'utf8');
    
    // Restart app
    setTimeout(() => {
      app.relaunch();
      app.exit();
    }, 1000);
    return { valid: true };
  } catch (err) {
    return { valid: false, reason: 'Invalid JSON format.' };
  }
});

app.whenReady().then(() => {
  const lic = checkLicense();
  if (lic.valid) {
    openDatabase();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  } else {
    createLockWindow(lic.reason);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
