const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  db: {
    /**
     * Run a SELECT query.
     * @param {string} sql
     * @param {any[]} params
     * @returns {Promise<{ ok: boolean, rows?: object[], error?: string }>}
     */
    query: (sql, params = []) => ipcRenderer.invoke('db:query', sql, params),

    /**
     * Run an INSERT / UPDATE / DELETE statement.
     * @param {string} sql
     * @param {any[]} params
     * @returns {Promise<{ ok: boolean, changes?: number, lastInsertRowid?: number, error?: string }>}
     */
    run: (sql, params = []) => ipcRenderer.invoke('db:run', sql, params),

    /**
     * Execute the full schema SQL (called once on app start).
     * @param {string} sql
     * @returns {Promise<{ ok: boolean, error?: string }>}
     */
    init: (sql) => ipcRenderer.invoke('db:init', sql),

    /**
     * Export a JSON backup of all tables.
     * @param {string} [savePath] — if omitted, a save dialog is shown
     * @returns {Promise<{ ok: boolean, path?: string, error?: string }>}
     */
    backup: (savePath) => ipcRenderer.invoke('db:backup', savePath),
  },
  window: {
    minimize: () => ipcRenderer.send('win:minimize'),
    maximize: () => ipcRenderer.send('win:maximize'),
    close: () => ipcRenderer.send('win:close'),
  },
});
