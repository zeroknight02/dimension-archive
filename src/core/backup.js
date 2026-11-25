/* ==========================================================
   次元簿 · 备份与恢复
   说明书 3.5 / 5.10 / 15.1-15.4
   交换格式固定七个字段：app / formatVersion / schemaVersion /
   exportedAt / modules / checksum / data。任何情况下不得省略。
   附件单独打包进 ZIP，通过唯一 ID 与记录关联。
   ========================================================== */

import * as db from './db.js';
import { STORES, DB_VER } from './db.js';
import { APP_ID, FORMAT_VERSION } from './schema.js';
import { data, loadAll, nowISO } from './repo.js';
import { encryptWithPassword, decryptWithPassword } from './crypto.js';

export const MODULE_LABELS = {
  works: '作品档案',
  work_details: '类型专属信息',
  experience_records: '体验记录',
  collections: '收藏清单',
  resources: '数字资源',
  reviews: '评价与总结',
  excerpts: '摘抄',
  accounts: '账号资料',
  categories: '分类',
  tags: '标签',
  topics: '专题',
  work_relations: '作品关联',
  settings: '业务设置',
  creators: '人物档案',
  work_creators: '作品与人物',
  expenses: '消费记录',
  subscriptions: '订阅会员',
  loans: '借阅共享',
  goals: '目标计划',
  reminders: '提醒',
  physical_items: '实体收藏',
  series: '系列档案',
  links: '双向关联',
  rules: '自动化规则',
  episodes: '季与集',
  sessions: '会话记录',
  locations: '存放位置',
  filters: '筛选方案',
  status_log: '状态变更',
  achievements: '游戏成就',
  playthroughs: '多周目',
  tracks: '曲目',
  playlists: '歌单',
  notes: '独立笔记',
  note_versions: '笔记版本'
};

const ALL_MODULES = Object.keys(MODULE_LABELS);

/* ---------------- 摘要 ---------------- */

export async function sha256Hex(text) {
  if (!crypto.subtle) return '';
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function sanitizeAccounts(rows, includeSecrets) {
  return rows.map((a) => {
    const copy = Object.assign({}, a);
    if (!includeSecrets) {
      delete copy.secret;
      copy.hasSecret = !!a.secret;
    }
    return copy;
  });
}

/* ---------------- 导出 ---------------- */

export async function collectData(opts) {
  const modules = (opts && opts.modules && opts.modules.length) ? opts.modules : ALL_MODULES.slice();
  const includeSecrets = !!(opts && opts.includeSecrets);
  const out = {};

  for (const name of modules) {
    if (!ALL_MODULES.includes(name)) continue;
    let rows = await db.getAll(name);
    if (name === 'accounts') rows = sanitizeAccounts(rows, includeSecrets);
    if (name === 'settings') rows = rows.filter((r) => r.k !== 'vault' || includeSecrets);
    out[name] = rows;
  }

  const attachments = opts && opts.withAttachments ? await db.getAll(STORES.attachments) : [];
  return { modules, data: out, attachments };
}

export async function buildPayload(opts) {
  const collected = await collectData(opts);
  const checksum = await sha256Hex(JSON.stringify(collected.data));
  return {
    app: APP_ID,
    formatVersion: FORMAT_VERSION,
    schemaVersion: DB_VER,
    exportedAt: new Date().toISOString(),
    modules: collected.modules,
    checksum,
    data: collected.data,
    _attachments: collected.attachments
  };
}

export async function exportJSON(opts) {
  const payload = await buildPayload(opts);
  const attachments = payload._attachments || [];
  delete payload._attachments;
  let text = JSON.stringify(payload, null, 2);
  let fileName = 'dimension-archive-' + payload.exportedAt.slice(0, 10) + '.json';

  if (opts && opts.password) {
    const pack = await encryptWithPassword(opts.password, text);
    text = JSON.stringify({
      app: APP_ID,
      formatVersion: FORMAT_VERSION,
      encrypted: true,
      exportedAt: payload.exportedAt,
      modules: payload.modules,
      checksum: payload.checksum,
      pack
    }, null, 2);
    fileName = 'dimension-archive-' + payload.exportedAt.slice(0, 10) + '.enc.json';
  }

  return {
    blob: new Blob([text], { type: 'application/json' }),
    fileName,
    summary: summarize(payload, attachments.length)
  };
}

export async function exportZIP(opts) {
  const payload = await buildPayload(Object.assign({}, opts, { withAttachments: true }));
  const attachments = payload._attachments || [];
  delete payload._attachments;
  let jsonText = JSON.stringify(payload, null, 2);
  let baseName = 'dimension-archive-' + payload.exportedAt.slice(0, 10);

  if (opts && opts.password) {
    const pack = await encryptWithPassword(opts.password, jsonText);
    jsonText = JSON.stringify({
      app: APP_ID,
      formatVersion: FORMAT_VERSION,
      encrypted: true,
      exportedAt: payload.exportedAt,
      modules: payload.modules,
      checksum: payload.checksum,
      pack
    }, null, 2);
    baseName += '-enc';
  }

  const files = [{ name: 'data.json', data: new TextEncoder().encode(jsonText) }];

  for (const a of attachments) {
    if (!a || !a.data) continue;
    let bytes;
    if (a.data instanceof Blob) bytes = new Uint8Array(await a.data.arrayBuffer());
    else if (a.data instanceof ArrayBuffer) bytes = new Uint8Array(a.data);
    else continue;
    const ext = (a.fileName && a.fileName.indexOf('.') > 0) ? a.fileName.slice(a.fileName.lastIndexOf('.')) : '.bin';
    files.push({ name: 'attachments/' + a.id + ext, data: bytes });
  }

  const manifest = {
    app: APP_ID,
    formatVersion: FORMAT_VERSION,
    exportedAt: payload.exportedAt,
    modules: payload.modules,
    checksum: payload.checksum,
    attachments: attachments.map((a) => a.id)
  };
  files.push({ name: 'manifest.json', data: new TextEncoder().encode(JSON.stringify(manifest, null, 2)) });

  return {
    blob: makeZip(files),
    fileName: baseName + '.zip',
    summary: summarize(payload, attachments.length)
  };
}

function summarize(payload, attachmentCount) {
  const counts = {};
  Object.keys(payload.data || {}).forEach((k) => { counts[k] = (payload.data[k] || []).length; });
  return {
    exportedAt: payload.exportedAt,
    modules: payload.modules || [],
    counts,
    attachmentCount: attachmentCount || 0,
    checksum: payload.checksum || ''
  };
}

/* ---------------- 导入 ---------------- */

export async function readBackupFile(file) {
  const name = (file.name || '').toLowerCase();
  let payload = null;
  let attachmentFiles = [];

  if (name.endsWith('.zip')) {
    const buf = new Uint8Array(await file.arrayBuffer());
    const entries = unzip(buf);
    const dataEntry = entries.find((e) => e.name === 'data.json');
    if (!dataEntry) return { ok: false, error: '压缩包里没有 data.json，可能不是次元簿的备份' };
    payload = JSON.parse(new TextDecoder().decode(dataEntry.data));
    attachmentFiles = entries.filter((e) => e.name.startsWith('attachments/'));
  } else {
    const text = await file.text();
    payload = JSON.parse(text);
  }

  if (payload && payload.encrypted) {
    return { ok: true, encrypted: true, payload, attachmentFiles };
  }
  return validatePayload(payload, attachmentFiles);
}

export function validatePayload(payload, attachmentFiles) {
  if (!payload || typeof payload !== 'object') return { ok: false, error: '备份文件内容无法解析' };
  if (payload.app !== APP_ID) return { ok: false, error: '这不是次元簿的备份（软件标识不符）' };
  if (!payload.data || typeof payload.data !== 'object') return { ok: false, error: '备份缺少 data 字段' };
  if (!payload.exportedAt) return { ok: false, error: '备份缺少导出时间' };
  return { ok: true, payload, attachmentFiles: attachmentFiles || [], encrypted: false };
}

export async function decryptBackup(payload, password) {
  try {
    const text = await decryptWithPassword(password, payload.pack);
    return validatePayload(JSON.parse(text));
  } catch (e) {
    return { ok: false, error: '口令不正确，或文件已损坏' };
  }
}

export async function verifyChecksum(payload) {
  if (!payload.checksum) return { ok: false, error: '备份缺少完整性校验值' };
  const actual = await sha256Hex(JSON.stringify(payload.data));
  return actual === payload.checksum
    ? { ok: true }
    : { ok: false, error: '完整性校验不通过，文件可能被修改或损坏' };
}

/* 合并时的冲突与重复识别（说明书 5.10 / 9.3） */
export function analyze(payload) {
  const incoming = payload.data || {};
  const conflict = {};
  const duplicateWorks = [];
  const existing = {
    works: new Map(data.works.map((w) => [w.id, w])),
    experience_records: new Map(data.experiences.map((x) => [x.id, x])),
    collections: new Map(data.collections.map((x) => [x.id, x])),
    resources: new Map(data.resources.map((x) => [x.id, x])),
    reviews: new Map(data.reviews.map((x) => [x.id, x])),
    excerpts: new Map(data.excerpts.map((x) => [x.id, x])),
    accounts: new Map(data.accounts.map((x) => [x.id, x])),
    categories: new Map(data.categories.map((x) => [x.id, x])),
    tags: new Map(data.tags.map((x) => [x.id, x])),
    topics: new Map(data.topics.map((x) => [x.id, x])),
    work_relations: new Map(data.relations.map((x) => [x.id, x]))
  };

  ALL_MODULES.forEach((m) => {
    const rows = incoming[m] || [];
    let added = 0;
    let same = 0;
    let changed = 0;
    rows.forEach((row) => {
      const id = row.id || row.workId || row.k;
      const cur = existing[m] && (existing[m].get(id) || existing[m].get(row.workId));
      if (!cur) added++;
      else if (JSON.stringify(cur) === JSON.stringify(row)) same++;
      else changed++;
    });
    conflict[m] = { total: rows.length, added, same, changed };
  });

  /* 作品重复：同类型 + 标题相同 */
  (incoming.works || []).forEach((w) => {
    const hit = data.works.find((x) => !x.deletedAt && x.type === w.type &&
      String(x.title).trim().toLowerCase() === String(w.title).trim().toLowerCase());
    if (hit && hit.id !== w.id) duplicateWorks.push({ incoming: w, existing: hit });
  });

  return { conflict, duplicateWorks };
}

export async function applyImport(payload, mode) {
  const incoming = payload.data || {};
  const report = { inserted: {}, updated: {}, skipped: {}, attachments: 0, errors: [] };

  if (mode === 'restore') {
    await db.clearAll();
  }

  /* 合并模式：同 ID 且更新时间更旧则跳过，避免用旧数据覆盖新数据 */
  const writeRows = async (storeName) => {
    const rows = incoming[storeName] || [];
    let put = [];
    let skip = 0;
    let upd = 0;
    for (const row of rows) {
      if (mode === 'merge') {
        const id = row.id || row.workId || row.k;
        const cur = await db.get(storeName, id);
        if (cur) {
          const a = cur.updatedAt || cur.createdAt || '';
          const b = row.updatedAt || row.createdAt || '';
          if (a && b && b < a) { skip++; continue; }
          upd++;
        }
      }
      put.push(row);
    }
    for (let i = 0; i < put.length; i += 200) {
      const chunk = put.slice(i, i + 200);
      const res = await db.putMany(storeName, chunk);
      if (!res.ok) report.errors.push(MODULE_LABELS[storeName] + '：' + (res.error || '写入失败'));
    }
    report.inserted[storeName] = put.length - (mode === 'merge' ? upd : 0);
    report.updated[storeName] = mode === 'merge' ? upd : 0;
    report.skipped[storeName] = skip;
  };

  for (const name of ALL_MODULES) {
    if (!incoming[name]) continue;
    await writeRows(name);
  }

  return report;
}

export async function writeAttachments(attachmentFiles) {
  let n = 0;
  for (const f of attachmentFiles || []) {
    const id = f.name.replace('attachments/', '').replace(/\.[^.]+$/, '');
    if (!id) continue;
    const mime = mimeFromName(f.name);
    const blob = new Blob([f.data], { type: mime });
    const res = await db.put(STORES.attachments, {
      id,
      data: blob,
      fileName: f.name.split('/').pop(),
      mimeType: mime,
      size: f.data.length,
      createdAt: nowISO()
    });
    if (res.ok) n++;
  }
  return n;
}

function mimeFromName(name) {
  const ext = String(name).toLowerCase().slice(String(name).lastIndexOf('.') + 1);
  const map = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
    gif: 'image/gif', svg: 'image/svg+xml', pdf: 'application/pdf',
    mp3: 'audio/mpeg', mp4: 'video/mp4', epub: 'application/epub+zip'
  };
  return map[ext] || 'application/octet-stream';
}

/* 恢复后校验：记录数量与关联关系（说明书 15.2） */
export async function verifyAfterImport() {
  await loadAll();
  const works = data.works.filter((w) => !w.deletedAt);
  const workIds = new Set(works.map((w) => w.id));
  let orphanExperiences = 0;
  data.experiences.forEach((e) => { if (!e.deletedAt && !workIds.has(e.workId)) orphanExperiences++; });
  let orphanExcerpts = 0;
  data.excerpts.forEach((e) => { if (!e.deletedAt && e.workId && !workIds.has(e.workId)) orphanExcerpts++; });
  let orphanReviews = 0;
  data.reviews.forEach((r) => { if (!r.deletedAt && r.workId && !workIds.has(r.workId)) orphanReviews++; });
  return {
    ok: orphanExperiences === 0 && orphanExcerpts === 0 && orphanReviews === 0,
    counts: {
      works: works.length,
      experiences: data.experiences.filter((e) => !e.deletedAt).length,
      excerpts: data.excerpts.filter((e) => !e.deletedAt).length,
      reviews: data.reviews.filter((r) => !r.deletedAt).length,
      resources: data.resources.filter((r) => !r.deletedAt).length
    },
    orphans: { experiences: orphanExperiences, excerpts: orphanExcerpts, reviews: orphanReviews }
  };
}

/* ---------------- 极简 ZIP（store 方式，无需第三方库） ---------------- */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function dosTime(d) {
  const time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() / 2) & 31);
  const date = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
  return { time, date };
}

export function makeZip(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const d = new Date();
  const { time, date } = dosTime(d);

  const enc = new TextEncoder();
  files.forEach((f) => {
    const nameBytes = enc.encode(f.name);
    const crc = crc32(f.data);
    const head = new Uint8Array(30 + nameBytes.length);
    const dv = new DataView(head.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(4, 20, true);
    dv.setUint16(6, 0x0800, true);
    dv.setUint16(8, 0, true);
    dv.setUint16(10, time, true);
    dv.setUint16(12, date, true);
    dv.setUint32(14, crc, true);
    dv.setUint32(18, f.data.length, true);
    dv.setUint32(22, f.data.length, true);
    dv.setUint16(26, nameBytes.length, true);
    dv.setUint16(28, 0, true);
    head.set(nameBytes, 30);

    chunks.push(head, f.data);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, f.data.length, true);
    cv.setUint32(24, f.data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);
    central.push(cd);

    offset += head.length + f.data.length;
  });

  const cdStart = offset;
  let cdSize = 0;
  central.forEach((c) => { chunks.push(c); cdSize += c.length; });

  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdStart, true);
  chunks.push(end);

  return new Blob(chunks, { type: 'application/zip' });
}

export function unzip(buf) {
  const out = [];
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  /* 找 EOCD */
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0 && i > buf.length - 66000; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('ZIP 结构异常');
  const count = dv.getUint16(eocd + 10, true);
  let ptr = dv.getUint32(eocd + 16, true);

  for (let i = 0; i < count; i++) {
    if (dv.getUint32(ptr, true) !== 0x02014b50) break;
    const method = dv.getUint16(ptr + 10, true);
    const compSize = dv.getUint32(ptr + 20, true);
    const nameLen = dv.getUint16(ptr + 28, true);
    const extraLen = dv.getUint16(ptr + 30, true);
    const commentLen = dv.getUint16(ptr + 32, true);
    const localOff = dv.getUint32(ptr + 42, true);
    const name = new TextDecoder().decode(buf.subarray(ptr + 46, ptr + 46 + nameLen));

    const lNameLen = dv.getUint16(localOff + 26, true);
    const lExtraLen = dv.getUint16(localOff + 28, true);
    const dataStart = localOff + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(dataStart, dataStart + compSize);

    /* 本程序只写 store(0)；读取时兼容 deflate(8) 由浏览器解压 */
    if (method === 0) out.push({ name, data: raw });
    else out.push({ name, data: raw, compressed: true, method });

    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

export function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    a.remove();
  }, 1500);
}
