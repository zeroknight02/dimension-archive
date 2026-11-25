/* ==========================================================
   次元簿 · 数据库层（IndexedDB，唯一核心业务数据库）
   说明书 2.2.1 / 2.4 / 14.1 / 14.4 / 14.7
   只负责打开、事务、读写与版本迁移，不含界面与业务规则。
   ========================================================== */

import { SCHEMA_VERSION } from './schema.js';

export const DB_NAME = 'dimension-archive-db';
export const DB_VER = SCHEMA_VERSION;

export const STORES = {
  works: 'works',
  details: 'work_details',
  experiences: 'experience_records',
  collections: 'collections',
  resources: 'resources',
  reviews: 'reviews',
  excerpts: 'excerpts',
  accounts: 'accounts',
  categories: 'categories',
  tags: 'tags',
  topics: 'topics',
  relations: 'work_relations',
  attachments: 'attachments',
  settings: 'settings',
  metadata: 'metadata',
  /* 第六至十二章新增 */
  creators: 'creators',
  work_creators: 'work_creators',
  expenses: 'expenses',
  subscriptions: 'subscriptions',
  loans: 'loans',
  goals: 'goals',
  reminders: 'reminders',
  physical: 'physical_items',
  series: 'series',
  links: 'links',
  rules: 'rules',
  episodes: 'episodes',
  sessions: 'sessions',
  locations: 'locations',
  filters: 'filters',
  statusLog: 'status_log',
  /* 6.3 / 6.4 / 5.5 补充 */
  achievements: 'achievements',
  playthroughs: 'playthroughs',
  tracks: 'tracks',
  playlists: 'playlists',
  notes: 'notes',
  noteVersions: 'note_versions'
};

const ALL_STORES = Object.keys(STORES).map((k) => STORES[k]);

/* 表结构：keyPath + 索引 */
const SCHEMA = {
  works: { key: 'id', idx: [['type', 'type'], ['title', 'title'], ['updatedAt', 'updatedAt'], ['status', 'status'], ['rating', 'rating'], ['deletedAt', 'deletedAt']] },
  work_details: { key: 'workId', idx: [['type', 'type']] },
  experience_records: { key: 'id', idx: [['workId', 'workId'], ['startDate', 'startDate'], ['status', 'status'], ['deletedAt', 'deletedAt']] },
  collections: { key: 'id', idx: [['workId', 'workId'], ['listType', 'listType'], ['deletedAt', 'deletedAt']] },
  resources: { key: 'id', idx: [['workId', 'workId'], ['status', 'status'], ['deletedAt', 'deletedAt']] },
  reviews: { key: 'id', idx: [['workId', 'workId'], ['type', 'type'], ['deletedAt', 'deletedAt']] },
  excerpts: { key: 'id', idx: [['workId', 'workId'], ['type', 'type'], ['deletedAt', 'deletedAt']] },
  accounts: { key: 'id', idx: [['platform', 'platform'], ['category', 'category'], ['deletedAt', 'deletedAt']] },
  categories: { key: 'id', idx: [['parentId', 'parentId'], ['name', 'name']] },
  tags: { key: 'id', idx: [['name', 'name']] },
  topics: { key: 'id', idx: [['title', 'title']] },
  work_relations: { key: 'id', idx: [['sourceWorkId', 'sourceWorkId'], ['targetWorkId', 'targetWorkId']] },
  attachments: { key: 'id', idx: [['owner', ['ownerType', 'ownerId']], ['createdAt', 'createdAt']] },
  settings: { key: 'k', idx: [] },
  metadata: { key: 'k', idx: [] },
  creators: { key: 'id', idx: [['name', 'name'], ['deletedAt', 'deletedAt']] },
  work_creators: { key: 'id', idx: [['workId', 'workId'], ['creatorId', 'creatorId'], ['role', 'role']] },
  expenses: { key: 'id', idx: [['date', 'date'], ['category', 'category'], ['workId', 'workId'], ['deletedAt', 'deletedAt']] },
  subscriptions: { key: 'id', idx: [['platform', 'platform'], ['endDate', 'endDate'], ['deletedAt', 'deletedAt']] },
  loans: { key: 'id', idx: [['workId', 'workId'], ['direction', 'direction'], ['deletedAt', 'deletedAt']] },
  goals: { key: 'id', idx: [['year', 'year'], ['deletedAt', 'deletedAt']] },
  reminders: { key: 'id', idx: [['date', 'date'], ['done', 'done'], ['deletedAt', 'deletedAt']] },
  physical_items: { key: 'id', idx: [['workId', 'workId'], ['location', 'location'], ['deletedAt', 'deletedAt']] },
  series: { key: 'id', idx: [['name', 'name']] },
  links: { key: 'id', idx: [['source', 'source'], ['target', 'target']] },
  rules: { key: 'id', idx: [['enabled', 'enabled']] },
  episodes: { key: 'id', idx: [['workId', 'workId'], ['season', 'season']] },
  sessions: { key: 'id', idx: [['workId', 'workId'], ['date', 'date']] },
  locations: { key: 'id', idx: [['parentId', 'parentId']] },
  filters: { key: 'id', idx: [['name', 'name']] },
  status_log: { key: 'id', idx: [['workId', 'workId'], ['at', 'at']] },
  achievements: { key: 'id', idx: [['workId', 'workId'], ['done', 'done']] },
  playthroughs: { key: 'id', idx: [['workId', 'workId'], ['no', 'no']] },
  tracks: { key: 'id', idx: [['workId', 'workId'], ['disc', 'disc']] },
  playlists: { key: 'id', idx: [['name', 'name']] },
  notes: { key: 'id', idx: [['title', 'title'], ['updatedAt', 'updatedAt'], ['deletedAt', 'deletedAt']] },
  note_versions: { key: 'id', idx: [['noteId', 'noteId'], ['savedAt', 'savedAt']] }
};

let dbPromise = null;
let openError = null;


function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (!window.indexedDB) {
      openError = '当前浏览器不支持 IndexedDB，无法保存数据';
      resolve(null);
      return;
    }
    let req;
    try {
      req = window.indexedDB.open(DB_NAME, DB_VER);
    } catch (e) {
      openError = '数据库打开失败：' + e.message;
      resolve(null);
      return;
    }

    req.onupgradeneeded = (ev) => {
      const db = req.result;
      const tx = req.transaction;
      /* 说明书 14.7：按版本顺序建表，不删除旧字段、不清空旧数据 */
      for (const name of Object.keys(SCHEMA)) {
        const def = SCHEMA[name];
        let store;
        if (!db.objectStoreNames.contains(name)) {
          store = db.createObjectStore(name, { keyPath: def.key });
        } else {
          store = tx.objectStore(name);
        }
        def.idx.forEach(([idxName, keyPath]) => {
          if (!store.indexNames.contains(idxName)) {
            try { store.createIndex(idxName, keyPath, { unique: false }); } catch (e) { /* 已有同名索引 */ }
          }
        });
      }
      const meta = tx.objectStore(STORES.metadata);
      meta.put({ k: 'schema', schemaVersion: DB_VER, fromVersion: ev.oldVersion, migratedAt: new Date().toISOString() });
    };

    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        try { db.close(); } catch (e) { /* ignore */ }
        window.dispatchEvent(new Event('db-versionchange'));
      };
      db.onerror = () => { /* 由具体事务处理 */ };
      resolve(db);
    };
    req.onerror = () => {
      openError = '数据库打开失败：' + (req.error && req.error.message ? req.error.message : '未知原因');
      resolve(null);
    };
    req.onblocked = () => {
      openError = '数据库被其它标签页占用，请关闭其它标签页后重试';
      resolve(null);
    };
  });
  return dbPromise;
}

export async function ready() {
  await openDB();
  return !openError;
}

function ask(mode, stores, fn) {
  return openDB().then((db) => {
    if (!db) return { ok: false, error: openError || '数据库不可用' };
    return new Promise((resolve) => {
      let tx;
      try {
        tx = db.transaction(stores, mode);
      } catch (e) {
        resolve({ ok: false, error: e.message });
        return;
      }
      let out;
      let failed = null;
      tx.oncomplete = () => resolve({ ok: true, value: out });
      tx.onerror = () => resolve({ ok: false, error: (tx.error && tx.error.message) || '事务失败' });
      tx.onabort = () => resolve({ ok: false, error: failed || (tx.error && tx.error.message) || '事务被中止' });
      try {
        const req = fn(tx, (v) => { out = v; });
        if (req && req.then) req.catch((e) => { failed = e.message; try { tx.abort(); } catch (e2) { /* ignore */ } });
      } catch (e) {
        failed = e.message;
        try { tx.abort(); } catch (e2) { /* ignore */ }
      }
    });
  }).catch((e) => ({ ok: false, error: e.message }));
}

function wrap(req, tx, set) {
  req.onsuccess = () => set(req.result);
  return req;
}

/* ---------------- 基础读写 ---------------- */

export function getAll(store) {
  return ask('readonly', store, (tx, set) => wrap(tx.objectStore(store).getAll(), tx, (r) => set(r || [])))
    .then((r) => (r.ok ? r.value : []));
}

export function get(store, key) {
  return ask('readonly', store, (tx, set) => wrap(tx.objectStore(store).get(key), tx, (r) => set(r || null)))
    .then((r) => (r.ok ? r.value : null));
}

export function count(store) {
  return ask('readonly', store, (tx, set) => wrap(tx.objectStore(store).count(), tx, (r) => set(r || 0)))
    .then((r) => (r.ok ? r.value : 0));
}

export function put(store, row) {
  return ask('readwrite', store, (tx) => { tx.objectStore(store).put(row); });
}

export function putMany(store, rows) {
  return ask('readwrite', store, (tx) => {
    const os = tx.objectStore(store);
    (rows || []).forEach((r) => os.put(r));
  });
}

export function del(store, key) {
  return ask('readwrite', store, (tx) => { tx.objectStore(store).delete(key); });
}

export function clear(store) {
  return ask('readwrite', store, (tx) => { tx.objectStore(store).clear(); });
}

/* 一个事务里跨表写入：说明书 2.4 多表写入必须同事务 */
export function tx(storeNames, mode, fn) {
  return ask(mode, storeNames, (txObj, set) => {
    const result = fn(txObj);
    set(result);
  });
}


/* ---------------- 统计与维护 ---------------- */

export async function storageEstimate() {
  if (!navigator.storage || !navigator.storage.estimate) return null;
  try {
    const est = await navigator.storage.estimate();
    return { usage: est.usage || 0, quota: est.quota || 0 };
  } catch (e) {
    return null;
  }
}

export async function persistState() {
  if (!navigator.storage || !navigator.storage.persisted) return { supported: false, persisted: false };
  try {
    const persisted = await navigator.storage.persisted();
    return { supported: true, persisted };
  } catch (e) {
    return { supported: false, persisted: false };
  }
}

export async function requestPersist() {
  if (!navigator.storage || !navigator.storage.persist) return { supported: false, persisted: false };
  try {
    const persisted = await navigator.storage.persist();
    return { supported: true, persisted };
  } catch (e) {
    return { supported: true, persisted: false };
  }
}


/* 清空全部业务数据（仅由设置页在二次确认后调用） */
export function clearAll() {
  return ask('readwrite', ALL_STORES, (txObj) => {
    ALL_STORES.forEach((n) => txObj.objectStore(n).clear());
  });
}
