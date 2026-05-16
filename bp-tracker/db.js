const IDB_NAME = 'bp-tracker-idb';
const IDB_VERSION = 1;
const IDB_STORE = 'sqlite';
const IDB_KEY = 'db';
const SQL_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/';

export class BPDatabase {
  constructor() { this._db = null; }

  async init() {
    const SQL = await initSqlJs({ locateFile: f => `${SQL_CDN}${f}` });
    const saved = await this._idbLoad();
    this._db = saved ? new SQL.Database(saved) : new SQL.Database();
    this._createSchema();
  }

  _createSchema() {
    this._db.run(`CREATE TABLE IF NOT EXISTS observations (id TEXT PRIMARY KEY, systolic INTEGER NOT NULL, diastolic INTEGER NOT NULL, pulse INTEGER, arm TEXT NOT NULL DEFAULT 'left', position TEXT NOT NULL DEFAULT 'sitting', notes TEXT, measured_at TEXT NOT NULL, fhir_json TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
    this._flush();
  }

  insert({ id, systolic, diastolic, pulse, arm, position, notes, measured_at, fhir }) {
    const stmt = this._db.prepare(`INSERT INTO observations (id, systolic, diastolic, pulse, arm, position, notes, measured_at, fhir_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    stmt.run([id, systolic, diastolic, pulse ?? null, arm, position, notes || null, measured_at, JSON.stringify(fhir)]);
    stmt.free();
    this._flush();
  }

  getAll() {
    const stmt = this._db.prepare('SELECT * FROM observations ORDER BY measured_at DESC');
    const rows = [];
    while (stmt.step()) { const row = stmt.getAsObject(); row.fhir = JSON.parse(row.fhir_json); rows.push(row); }
    stmt.free();
    return rows;
  }

  delete(id) { this._db.run('DELETE FROM observations WHERE id = ?', [id]); this._flush(); }

  exportFhir() { return this.getAll().map(r => r.fhir); }

  _flush() { this._idbSave(this._db.export()).catch(console.error); }

  _idbOpen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = e => e.target.result.createObjectStore(IDB_STORE, { keyPath: 'k' });
      req.onsuccess = e => resolve(e.target.result);
      req.onerror = () => reject(req.error);
    });
  }

  async _idbLoad() {
    try {
      const idb = await this._idbOpen();
      return new Promise(resolve => {
        const req = idb.transaction(IDB_STORE, 'readonly').objectStore(IDB_STORE).get(IDB_KEY);
        req.onsuccess = () => resolve(req.result?.v ?? null);
        req.onerror = () => resolve(null);
      });
    } catch { return null; }
  }

  async _idbSave(data) {
    const idb = await this._idbOpen();
    return new Promise((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put({ k: IDB_KEY, v: data });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  }
}
