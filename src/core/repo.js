/* ==========================================================
   次元簿 · 仓储层（数据访问唯一入口）
   说明书 2.3 / 14.3 / 14.4
   业务模块只能通过这里读写数据，不得直接操作其它模块的表结构。
   内存中维护一份镜像用于渲染与统计，写入以 IndexedDB 事务提交为准。
   ========================================================== */

import * as db from './db.js';
import { STORES } from './db.js';
import { typeDef, statusBucket, statusLabel } from './schema.js';

export const data = {
  works: [],
  details: {},
  experiences: [],
  collections: [],
  resources: [],
  reviews: [],
  excerpts: [],
  accounts: [],
  categories: [],
  tags: [],
  topics: [],
  relations: [],
  creators: [],
  workCreators: [],
  expenses: [],
  subscriptions: [],
  loans: [],
  goals: [],
  reminders: [],
  physical: [],
  series: [],
  links: [],
  rules: [],
  episodes: [],
  sessions: [],
  locations: [],
  filters: [],
  statusLog: [],
  achievements: [],
  playthroughs: [],
  tracks: [],
  playlists: [],
  notes: [],
  noteVersions: [],
  settings: {},
  loaded: false,
  writeError: ''
};

const listeners = new Set();

/* 插件钩子（12.4）：业务模块可注册回调，不必互相 import */
const hooks = { workSaved: [], experienceSaved: [] };

export function onWorkSaved(fn) {
  hooks.workSaved.push(fn);
  return () => {
    const i = hooks.workSaved.indexOf(fn);
    if (i >= 0) hooks.workSaved.splice(i, 1);
  };
}

export function onExperienceSaved(fn) {
  hooks.experienceSaved.push(fn);
  return () => {
    const i = hooks.experienceSaved.indexOf(fn);
    if (i >= 0) hooks.experienceSaved.splice(i, 1);
  };
}

export function fire(event, payload) {
  (hooks[event] || []).forEach((fn) => {
    try { fn(payload); } catch (e) { console.error(e); }
  });
}


export function emit() {
  listeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
}

/* 数据变更订阅：界面入口在这里挂 render，任何 save/remove 后都能自动刷新 */
export function onChange(fn) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

export function uid(prefix) {
  const p = prefix || 'r';
  let rand;
  if (window.crypto && window.crypto.randomUUID) {
    rand = window.crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  } else {
    rand = Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
  }
  return p + '_' + Date.now().toString(36) + '_' + rand;
}

export function nowISO() {
  return new Date().toISOString();
}

/* ---------------- 初始化 ---------------- */

export async function loadAll() {
  const ok = await db.ready();
  if (!ok) { data.loaded = false; return false; }

  const [works, details, experiences, collections, resources, reviews, excerpts, accounts,
    categories, tags, topics, relations, settings, creators, workCreators, expenses, subscriptions,
    loans, goals, reminders, physical, series, links, rules,
    episodes, sessions, locations, filters, statusLog,
    achievements, playthroughs, tracks, playlists, notes, noteVersions] = await Promise.all([
    db.getAll(STORES.works),
    db.getAll(STORES.details),
    db.getAll(STORES.experiences),
    db.getAll(STORES.collections),
    db.getAll(STORES.resources),
    db.getAll(STORES.reviews),
    db.getAll(STORES.excerpts),
    db.getAll(STORES.accounts),
    db.getAll(STORES.categories),
    db.getAll(STORES.tags),
    db.getAll(STORES.topics),
    db.getAll(STORES.relations),
    db.getAll(STORES.settings),
    db.getAll(STORES.creators),
    db.getAll(STORES.work_creators),
    db.getAll(STORES.expenses),
    db.getAll(STORES.subscriptions),
    db.getAll(STORES.loans),
    db.getAll(STORES.goals),
    db.getAll(STORES.reminders),
    db.getAll(STORES.physical),
    db.getAll(STORES.series),
    db.getAll(STORES.links),
    db.getAll(STORES.rules),
    db.getAll(STORES.episodes),
    db.getAll(STORES.sessions),
    db.getAll(STORES.locations),
    db.getAll(STORES.filters),
    db.getAll(STORES.statusLog),
    db.getAll(STORES.achievements),
    db.getAll(STORES.playthroughs),
    db.getAll(STORES.tracks),
    db.getAll(STORES.playlists),
    db.getAll(STORES.notes),
    db.getAll(STORES.noteVersions)
  ]);

  data.works = works;
  data.details = {};
  details.forEach((d) => { data.details[d.workId] = d; });
  data.experiences = experiences;
  data.collections = collections;
  data.resources = resources;
  data.reviews = reviews;
  data.excerpts = excerpts;
  data.accounts = accounts;
  data.categories = categories;
  data.tags = tags;
  data.topics = topics;
  data.relations = relations;
  data.creators = creators;
  data.workCreators = workCreators;
  data.expenses = expenses;
  data.subscriptions = subscriptions;
  data.loans = loans;
  data.goals = goals;
  data.reminders = reminders;
  data.physical = physical;
  data.series = series;
  data.links = links;
  data.rules = rules;
  data.episodes = episodes;
  data.sessions = sessions;
  data.locations = locations;
  data.filters = filters;
  data.statusLog = statusLog;
  data.achievements = achievements;
  data.playthroughs = playthroughs;
  data.tracks = tracks;
  data.playlists = playlists;
  data.notes = notes;
  data.noteVersions = noteVersions;
  data.settings = {};
  settings.forEach((s) => { data.settings[s.k] = s.value; });
  data.loaded = true;
  data.writeError = '';
  emit();
  return true;
}

/* ---------------- 设置（业务设置，非界面偏好） ---------------- */

export function setting(key, fallback) {
  const v = data.settings[key];
  return v === undefined ? fallback : v;
}

export async function saveSetting(key, value) {
  const res = await db.put(STORES.settings, { k: key, value, updatedAt: nowISO() });
  if (!res.ok) { data.writeError = res.error || '写入失败'; return false; }
  data.settings[key] = value;
  return true;
}

/* ---------------- 作品 ---------------- */

export function liveWorks() {
  return data.works.filter((w) => !w.deletedAt);
}

export function getWork(id) {
  return data.works.find((w) => w.id === id && !w.deletedAt) || null;
}

export function detailsOf(workId) {
  const d = data.details[workId];
  return d && d.fields ? d.fields : {};
}



/* 作品状态：优先作品自身状态，其次最近一条体验记录 */
export function workStatus(w) {
  if (w.status) return w.status;
  const ex = latestExperience(w.id);
  return ex ? ex.status : 'wish';
}

export function statusText(w) {
  const t = typeDef(w.type);
  return statusLabel(t.statusSet, workStatus(w));
}

export function bucketOf(w) {
  return statusBucket(workStatus(w));
}

export function experiencesOf(workId) {
  return data.experiences
    .filter((e) => e.workId === workId && !e.deletedAt)
    .sort((a, b) => (b.startDate || '').localeCompare(a.startDate || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
}

export function latestExperience(workId) {
  return experiencesOf(workId)[0] || null;
}

/* ---------------- 进度推进（总览「正在继续」的 +1 按钮） ---------------- */

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

/* 按类型模式给出当前进度条目：{cur,total,unit,label} */
export function progressParts(work, progress) {
  const p = progress || {};
  const def = typeDef((work && work.type) || 'book');
  if (def.mode === 'book') {
    const unit = p.unit || (p.pageCur !== undefined ? 'page' : p.volumeCur !== undefined ? 'volume' : 'chapter');
    if (unit === 'page') return { cur: Number(p.pageCur) || 0, total: Number(p.pageTotal) || 0, unit: '页', label: '第' };
    if (unit === 'volume') return { cur: Number(p.volumeCur) || 0, total: Number(p.volumeTotal) || 0, unit: '卷', label: '第' };
    return { cur: Number(p.chapterCur) || 0, total: Number(p.chapterTotal) || 0, unit: def.itemUnit || '章', label: '第' };
  }
  if (def.mode === 'series') {
    return { cur: Number(p.epCur) || 0, total: Number(p.epTotal) || 0, unit: '集', label: '第',
      season: Number(p.seasonCur) || 0, seasonTotal: Number(p.seasonTotal) || 0 };
  }
  if (def.mode === 'issue') return { cur: Number(p.issueNo) || 0, total: 0, unit: '期', label: '第' };
  if (def.mode === 'percent') return { cur: Number(p.percent) || 0, total: 100, unit: '%', label: '' };
  if (def.mode === 'single') return { cur: Number(p.percent) || 0, total: 100, unit: '%', label: '' };
  return { cur: 0, total: 0, unit: def.itemUnit || '', label: '' };
}

export function progressLine(work, progress) {
  const def = typeDef((work && work.type) || 'book');
  const x = progressParts(work, progress);
  const hours = progress && progress.hours ? ' · ' + (Math.round(Number(progress.hours) * 10) / 10) + ' 小时' : '';
  if (def.mode === 'single') {
    return Number(progress && progress.percent) > 0 ? '完成 ' + (Number(progress.percent) || 0) + '%' + hours : '还没记录进度';
  }
  if (!x.cur) return '还没记录进度';
  if (def.mode === 'percent') return '完成 ' + x.cur + '%' + hours;
  if (def.mode === 'issue') return '第 ' + x.cur + ' 期';
  const head = x.unit === '集' && x.season ? 'S' + x.season + ' · ' : '';
  return head + '第 ' + x.cur + ' ' + x.unit + ' / 共 ' + (x.total || '?') + ' ' + x.unit;
}

/* 推进一步；没有体验记录时自动建一条「进行中」 */
export async function bumpProgress(workId, step) {
  const w = getWork(workId);
  if (!w) return { ok: false, error: '作品不存在' };
  const def = typeDef(w.type);
  const ex = latestExperience(workId);
  const p = Object.assign({}, (ex && ex.progress) || {});
  const delta = Number(step) || 1;

  if (def.mode === 'book') {
    const unit = p.unit || (p.pageCur !== undefined ? 'page' : p.volumeCur !== undefined ? 'volume' : 'chapter');
    p.unit = unit;
    if (unit === 'page') {
      const total = Number(p.pageTotal) || 0;
      p.pageCur = (Number(p.pageCur) || 0) + delta;
      if (total) p.pageCur = Math.min(total, p.pageCur);
    } else if (unit === 'volume') {
      const total = Number(p.volumeTotal) || 0;
      p.volumeCur = (Number(p.volumeCur) || 0) + delta;
      if (total) p.volumeCur = Math.min(total, p.volumeCur);
    } else {
      const total = Number(p.chapterTotal) || 0;
      p.chapterCur = (Number(p.chapterCur) || 0) + delta;
      if (total) p.chapterCur = Math.min(total, p.chapterCur);
    }
  } else if (def.mode === 'series') {
    const total = Number(p.epTotal) || 0;
    let cur = (Number(p.epCur) || 0) + delta;
    if (total && cur > total) {
      const st = Number(p.seasonTotal) || 0;
      const sc = Number(p.seasonCur) || 1;
      if (!st || sc < st) { p.seasonCur = sc + 1; cur = 1; }
      else cur = total;
    }
    p.epCur = cur;
    if (!p.seasonCur) p.seasonCur = 1;
  } else if (def.mode === 'issue') {
    p.issueNo = String((Number(p.issueNo) || 0) + delta);
    if (!p.issueYear) p.issueYear = String(new Date().getFullYear());
  } else if (def.mode === 'percent') {
    p.percent = Math.min(100, (Number(p.percent) || 0) + delta);
  } else if (def.mode === 'single') {
    /* 电影、舞台、专辑这类没有章节的作品，用 10% 一档推进 */
    p.percent = Math.min(100, (Number(p.percent) || 0) + delta * 10);
  }

  /* 保持作品原有状态（电影等类型没有「进行中」这一档，不能硬塞 doing） */
  const status = (ex && ex.status) || w.status || 'doing';
  const rec = ex
    ? Object.assign({}, ex, { progress: p, status })
    : { workId, experienceType: '首次', status: 'doing', startDate: todayStr(), endDate: '', rating: 0, note: '', progress: p };
  const res = await saveExperience(rec);
  if (!res.ok) return res;
  return { ok: true, progress: p, work: getWork(workId) };
}


/* 完成日期：体验记录的结束日期，没有就用作品更新时间 */
export function finishedDate(w) {
  const ex = experiencesOf(w.id).find((e) => statusBucket(e.status) === 'done');
  if (ex && (ex.endDate || ex.startDate)) return ex.endDate || ex.startDate;
  if (statusBucket(workStatus(w)) === 'done') return (w.updatedAt || '').slice(0, 10);
  return '';
}

export async function saveWork(work, fields) {
  const prev = getWork(work.id);
  const ts = nowISO();
  const row = Object.assign({}, prev || {}, work, {
    createdAt: (prev && prev.createdAt) || work.createdAt || ts,
    updatedAt: ts
  });
  if (!row.id) row.id = uid('w');

  const detailRow = {
    workId: row.id,
    type: row.type,
    fields: fields || {},
    updatedAt: ts
  };

  const res = await db.tx([STORES.works, STORES.details], 'readwrite', (tx) => {
    tx.objectStore(STORES.works).put(row);
    tx.objectStore(STORES.details).put(detailRow);
  });

  if (!res.ok) {
    data.writeError = res.error || '写入失败';
    return { ok: false, error: data.writeError, work: row };
  }
  data.writeError = '';
  const i = data.works.findIndex((w) => w.id === row.id);
  if (i >= 0) data.works[i] = row; else data.works.push(row);
  if (prev && prev.status && row.status && prev.status !== row.status) {
    logStatus(row.id, prev.status, row.status);
  }
  data.details[row.id] = detailRow;
  emit();
  fire('workSaved', { work: row, fields: detailRow.fields, isNew: !prev });
  return { ok: true, work: row };
}

/* 软删除：标记 deletedAt，关联数据保留供恢复 */
export async function deleteWork(id) {
  const w = getWork(id);
  if (!w) return { ok: false, error: '作品不存在' };
  const row = Object.assign({}, w, { deletedAt: nowISO(), updatedAt: nowISO() });
  const res = await db.put(STORES.works, row);
  if (!res.ok) return { ok: false, error: res.error };
  const i = data.works.findIndex((x) => x.id === id);
  if (i >= 0) data.works[i] = row;
  emit();
  return { ok: true };
}

export async function restoreWork(id) {
  const w = data.works.find((x) => x.id === id);
  if (!w) return false;
  const row = Object.assign({}, w, { deletedAt: null, updatedAt: nowISO() });
  const res = await db.put(STORES.works, row);
  if (!res.ok) return false;
  Object.assign(w, row);
  emit();
  return true;
}

export function deletedWorks() {
  return data.works.filter((w) => w.deletedAt).sort((a, b) => (b.deletedAt || '').localeCompare(a.deletedAt || ''));
}

/* ---------------- 体验记录 ---------------- */

export async function saveExperience(rec) {
  const ts = nowISO();
  const prev = data.experiences.find((e) => e.id === rec.id);
  const row = Object.assign({}, prev || {}, rec, {
    id: rec.id || uid('e'),
    createdAt: (prev && prev.createdAt) || ts,
    updatedAt: ts
  });
  const res = await db.put(STORES.experiences, row);
  if (!res.ok) return { ok: false, error: res.error };
  const i = data.experiences.findIndex((e) => e.id === row.id);
  if (i >= 0) data.experiences[i] = row; else data.experiences.push(row);
  if (prev && prev.status && row.status && prev.status !== row.status) {
    logStatus(row.workId, prev.status, row.status);
  }
  /* 状态回写到作品，保证列表口径一致 */
  await syncWorkStatus(row.workId);
  emit();
  fire('experienceSaved', { record: row, work: getWork(row.workId) });
  return { ok: true, record: row };
}

export async function deleteExperience(id) {
  const rec = data.experiences.find((e) => e.id === id);
  if (!rec) return false;
  const row = Object.assign({}, rec, { deletedAt: nowISO(), updatedAt: nowISO() });
  const res = await db.put(STORES.experiences, row);
  if (!res.ok) return false;
  const i = data.experiences.findIndex((e) => e.id === id);
  if (i >= 0) data.experiences[i] = row;
  await syncWorkStatus(rec.workId);
  emit();
  return true;
}

async function syncWorkStatus(workId) {
  const w = getWork(workId);
  if (!w) return;
  const ex = latestExperience(workId);
  if (!ex) return;
  if (w.status === ex.status) return;
  const row = Object.assign({}, w, { status: ex.status, updatedAt: w.updatedAt });
  const res = await db.put(STORES.works, row);
  if (res.ok) {
    const i = data.works.findIndex((x) => x.id === workId);
    if (i >= 0) data.works[i] = row;
  }
}

/* ---------------- 通用表读写 ---------------- */

function simpleStore(storeName, listKey, idPrefix) {
  return {
    async save(obj) {
      const ts = nowISO();
      const prev = data[listKey].find((x) => x.id === obj.id);
      const row = Object.assign({}, prev || {}, obj, {
        id: obj.id || uid(idPrefix),
        createdAt: (prev && prev.createdAt) || ts,
        updatedAt: ts
      });
      const res = await db.put(storeName, row);
      if (!res.ok) return { ok: false, error: res.error };
      const i = data[listKey].findIndex((x) => x.id === row.id);
      if (i >= 0) data[listKey][i] = row; else data[listKey].push(row);
      emit();
      return { ok: true, row };
    },
    async remove(id) {
      const prev = data[listKey].find((x) => x.id === id);
      if (!prev) return false;
      const row = Object.assign({}, prev, { deletedAt: nowISO(), updatedAt: nowISO() });
      const res = await db.put(storeName, row);
      if (!res.ok) return false;
      const i = data[listKey].findIndex((x) => x.id === id);
      if (i >= 0) data[listKey][i] = row;
      emit();
      return true;
    },
    async hardRemove(id) {
      const res = await db.del(storeName, id);
      if (!res.ok) return false;
      const i = data[listKey].findIndex((x) => x.id === id);
      if (i >= 0) data[listKey].splice(i, 1);
      emit();
      return true;
    },
    list() {
      return data[listKey].filter((x) => !x.deletedAt);
    },
    get(id) {
      return data[listKey].find((x) => x.id === id) || null;
    }
  };
}

export const collections = simpleStore(STORES.collections, 'collections', 'c');
export const resources = simpleStore(STORES.resources, 'resources', 'res');
export const reviews = simpleStore(STORES.reviews, 'reviews', 'rv');
export const excerpts = simpleStore(STORES.excerpts, 'excerpts', 'ex');
export const accounts = simpleStore(STORES.accounts, 'accounts', 'acc');
export const topics = simpleStore(STORES.topics, 'topics', 'tp');
export const relations = simpleStore(STORES.relations, 'relations', 'rel');
export const creators = simpleStore(STORES.creators, 'creators', 'per');
export const expenses = simpleStore(STORES.expenses, 'expenses', 'exp');
export const subscriptions = simpleStore(STORES.subscriptions, 'subscriptions', 'sub');
export const loans = simpleStore(STORES.loans, 'loans', 'loan');
export const goals = simpleStore(STORES.goals, 'goals', 'goal');
export const reminders = simpleStore(STORES.reminders, 'reminders', 'rem');
export const physical = simpleStore(STORES.physical, 'physical', 'item');
export const series = simpleStore(STORES.series, 'series', 'sr');
export const rules = simpleStore(STORES.rules, 'rules', 'rule');
export const links = simpleStore(STORES.links, 'links', 'lnk');
export const achievements = simpleStore(STORES.achievements, 'achievements', 'ach');
export const playthroughs = simpleStore(STORES.playthroughs, 'playthroughs', 'pt');
export const tracks = simpleStore(STORES.tracks, 'tracks', 'trk');
export const playlists = simpleStore(STORES.playlists, 'playlists', 'pl');
export const notes = simpleStore(STORES.notes, 'notes', 'note');
export const noteVersions = simpleStore(STORES.noteVersions, 'noteVersions', 'nv');
export const episodes = simpleStore(STORES.episodes, 'episodes', 'ep');
export const sessions = simpleStore(STORES.sessions, 'sessions', 'ses');
export const locations = simpleStore(STORES.locations, 'locations', 'loc');
export const savedFilters = simpleStore(STORES.filters, 'filters', 'flt');
export const statusLog = simpleStore(STORES.statusLog, 'statusLog', 'sl');

/* 5.3.2 状态变更必须留痕 */
export async function logStatus(workId, from, to) {
  if (!workId || from === to) return null;
  return statusLog.save({ id: '', workId, from: from || '', to: to || '', at: nowISO() });
}

export function statusHistory(workId) {
  return data.statusLog.filter((x) => x.workId === workId).sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

/* 5.2.4 复制作品：只复制档案与专属字段，不复制体验 */
export async function copyWork(id) {
  const w = getWork(id);
  if (!w) return { ok: false, error: '作品不存在' };
  const row = Object.assign({}, w, {
    id: '',
    title: w.title + '（副本）',
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
    statusLog: undefined
  });
  const res = await saveWork(row, Object.assign({}, detailsOf(id)));
  return res;
}

/* 6.2 季 / 集 */
export function episodesOf(workId) {
  return data.episodes.filter((e) => e.workId === workId).sort((a, b) => (a.season || 1) - (b.season || 1) || (a.no || 0) - (b.no || 0));
}

export function episodeStats(workId) {
  const list = episodesOf(workId);
  const total = list.length;
  const seen = list.filter((e) => e.watched).length;
  return { total, seen, pct: total ? Math.round(seen / total * 100) : 0 };
}

/* 6.1 阅读 / 游玩会话：按天记录页数与分钟 */
export function sessionsOf(workId) {
  return data.sessions.filter((s) => s.workId === workId).sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

export function readingStats(workId) {
  const list = sessionsOf(workId);
  if (!list.length) return { days: 0, pages: 0, minutes: 0, perDay: 0, speed: 0, streak: 0 };
  const pages = list.reduce((a, s) => a + (Number(s.pages) || 0), 0);
  const minutes = list.reduce((a, s) => a + (Number(s.minutes) || 0), 0);
  const days = new Set(list.map((s) => s.date)).size;
  const perDay = days ? Math.round(pages / days * 10) / 10 : 0;
  const speed = minutes ? Math.round(pages / (minutes / 60) * 10) / 10 : 0;
  /* 连续天数：从最近一天往前推 */
  const dates = [...new Set(list.map((s) => s.date))].sort().reverse();
  let streak = 0;
  const d = new Date();
  for (let i = 0; i < 400; i++) {
    const key = d.toISOString().slice(0, 10);
    if (dates.indexOf(key) >= 0) { streak++; d.setDate(d.getDate() - 1); }
    else if (i === 0) { d.setDate(d.getDate() - 1); }
    else break;
  }
  return { days, pages, minutes, perDay, speed, streak };
}

/* 6.8.1 存放位置树 */
export function locationTree() {
  const map = {};
  data.locations.forEach((l) => { map[l.id] = Object.assign({ children: [] }, l); });
  const roots = [];
  Object.keys(map).forEach((id) => {
    const n = map[id];
    if (n.parentId && map[n.parentId]) map[n.parentId].children.push(n);
    else roots.push(n);
  });
  const sortRec = (arr) => {
    arr.sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.name).localeCompare(String(b.name), 'zh-Hans-CN'));
    arr.forEach((x) => sortRec(x.children));
  };
  sortRec(roots);
  return roots;
}

export function locationPath(id) {
  const chain = [];
  let cur = data.locations.find((l) => l.id === id);
  while (cur) { chain.unshift(cur.name); cur = data.locations.find((l) => l.id === cur.parentId); }
  return chain.join(' → ');
}


/* 作品—人物关系单独维护，支持一人多角色、一部作品多人 */
export function workCreatorsOf(workId) {
  return data.workCreators.filter((x) => x.workId === workId);
}

export function creatorOf(creatorId) {
  return data.creators.find((c) => c.id === creatorId && !c.deletedAt) || null;
}

export function worksOfCreator(creatorId) {
  const ids = new Set(data.workCreators.filter((x) => x.creatorId === creatorId).map((x) => x.workId));
  return liveWorks().filter((w) => ids.has(w.id));
}

export async function linkCreator(workId, creatorId, role) {
  const exists = data.workCreators.find((x) => x.workId === workId && x.creatorId === creatorId && x.role === role);
  if (exists) return exists;
  const row = { id: uid('wc'), workId, creatorId, role: role || '作者', createdAt: nowISO() };
  const res = await db.put(STORES.work_creators, row);
  if (!res.ok) return null;
  data.workCreators.push(row);
  emit();
  return row;
}


/* 统一关联：source/target 形如 "work:xxx"（8.2 双向关联） */
export function entityKey(type, id) {
  return type + ':' + id;
}

export function linksOf(key) {
  return data.links.filter((l) => !l.deletedAt && (l.source === key || l.target === key));
}

export function backlinksOf(key) {
  return linksOf(key).map((l) => {
    const other = l.source === key ? l.target : l.source;
    const i = other.indexOf(':');
    return { type: other.slice(0, i), id: other.slice(i + 1), relation: l.relation, id2: l.id };
  });
}

export async function addLink(source, target, relation) {
  if (!source || !target || source === target) return null;
  const dup = data.links.find((l) => l.source === source && l.target === target && !l.deletedAt);
  if (dup) return dup;
  const row = { id: uid('lnk'), source, target, relation: relation || '相关', createdAt: nowISO() };
  const res = await db.put(STORES.links, row);
  if (!res.ok) return null;
  data.links.push(row);
  emit();
  return row;
}

/* 系列档案（8.6） */
export function seriesOf(workId) {
  return data.series.find((s) => (s.workIds || []).indexOf(workId) >= 0) || null;
}


/* 消费统计（7.1） */

/* 提醒（7.6）：到期与逾期 */
export function dueReminders(days) {
  const span = days == null ? 7 : days;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return data.reminders.filter((r) => !r.deletedAt && !r.done && r.date).map((r) => {
    const d = new Date(r.date + 'T00:00:00');
    const diff = Math.round((d - today) / 86400000);
    return { r, diff };
  }).filter((x) => x.diff <= span).sort((a, b) => a.diff - b.diff);
}

/* 自定义类型与字段（12.1 / 12.2），存在 settings 里 */
export function customTypes() {
  return setting('customTypes', []) || [];
}

export function customFields() {
  return setting('customFields', {}) || {};
}



/* 分类 / 标签结构不同，单独处理 */
export async function saveCategory(row) {
  const ts = nowISO();
  const prev = data.categories.find((x) => x.id === row.id);
  const next = Object.assign({}, prev || {}, row, { id: row.id || uid('cat'), createdAt: (prev && prev.createdAt) || ts, updatedAt: ts });
  const res = await db.put(STORES.categories, next);
  if (!res.ok) return { ok: false, error: res.error };
  const i = data.categories.findIndex((x) => x.id === next.id);
  if (i >= 0) data.categories[i] = next; else data.categories.push(next);
  emit();
  return { ok: true, row: next };
}

export async function removeCategory(id) {
  const kids = data.categories.filter((c) => c.parentId === id);
  for (const k of kids) await removeCategory(k.id);
  const res = await db.del(STORES.categories, id);
  if (!res.ok) return false;
  data.categories = data.categories.filter((c) => c.id !== id);
  /* 解除作品引用，不删除作品 */
  for (const w of data.works.filter((x) => x.categoryId === id)) {
    const row = Object.assign({}, w, { categoryId: '' });
    await db.put(STORES.works, row);
    w.categoryId = '';
  }
  emit();
  return true;
}

export function categoryTree() {
  const map = {};
  data.categories.forEach((c) => { map[c.id] = Object.assign({ children: [] }, c); });
  const roots = [];
  Object.keys(map).forEach((id) => {
    const node = map[id];
    if (node.parentId && map[node.parentId]) map[node.parentId].children.push(node);
    else roots.push(node);
  });
  const sortRec = (list) => {
    list.sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.name).localeCompare(String(b.name), 'zh-Hans-CN'));
    list.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

export async function saveTag(row) {
  const prev = data.tags.find((x) => x.id === row.id || (row.name && x.name === row.name));
  const next = Object.assign({}, prev || {}, row, { id: (prev && prev.id) || row.id || uid('tag') });
  const res = await db.put(STORES.tags, next);
  if (!res.ok) return { ok: false, error: res.error };
  const i = data.tags.findIndex((x) => x.id === next.id);
  if (i >= 0) data.tags[i] = next; else data.tags.push(next);
  emit();
  return { ok: true, row: next };
}

export function tagByName(name) {
  return data.tags.find((t) => t.name === name) || null;
}


/* 标签用法：作品只存 tagIds，删除标签只解除关联 */
export async function removeTag(id) {
  const res = await db.del(STORES.tags, id);
  if (!res.ok) return false;
  data.tags = data.tags.filter((t) => t.id !== id);
  for (const w of data.works) {
    if ((w.tagIds || []).indexOf(id) >= 0) {
      const row = Object.assign({}, w, { tagIds: w.tagIds.filter((x) => x !== id) });
      await db.put(STORES.works, row);
      w.tagIds = row.tagIds;
    }
  }
  emit();
  return true;
}

/* ---------------- 附件（Blob 单独存放，业务表只存索引） ---------------- */

export async function putAttachment(id, blob, meta) {
  const row = Object.assign({
    id,
    data: blob,
    createdAt: nowISO()
  }, meta || {});
  const res = await db.put(STORES.attachments, row);
  return res.ok ? row : null;
}




/* ---------------- 汇总查询 ---------------- */

export function worksByType(type) {
  return liveWorks().filter((w) => w.type === type);
}


export function worksWithTag(tagId) {
  return liveWorks().filter((w) => (w.tagIds || []).indexOf(tagId) >= 0);
}

export function classNamesFor(w) {
  const out = [];
  if (w.categoryId) {
    let cur = data.categories.find((c) => c.id === w.categoryId);
    const chain = [];
    while (cur) { chain.unshift(cur.name); cur = data.categories.find((c) => c.id === cur.parentId); }
    if (chain.length) out.push(chain.join(' / '));
  }
  (w.tagIds || []).forEach((id) => {
    const t = data.tags.find((x) => x.id === id);
    if (t) out.push('#' + t.name);
  });
  return out;
}

export function reviewCountOf(workId) {
  return data.reviews.filter((r) => r.workId === workId && !r.deletedAt).length;
}

export function excerptCountOf(workId) {
  return data.excerpts.filter((r) => r.workId === workId && !r.deletedAt).length;
}

export function resourceCountOf(workId) {
  return data.resources.filter((r) => r.workId === workId && !r.deletedAt).length;
}

/* 删除前的关联数据数量（说明书 5.2.4 必须展示） */
export function relatedCounts(workId) {
  return {
    experiences: experiencesOf(workId).length,
    excerpts: excerptCountOf(workId),
    reviews: reviewCountOf(workId),
    resources: resourceCountOf(workId),
    collections: data.collections.filter((c) => c.workId === workId && !c.deletedAt).length,
    topics: data.topics.filter((t) => (t.workIds || []).indexOf(workId) >= 0).length,
    relations: data.relations.filter((r) => r.sourceWorkId === workId || r.targetWorkId === workId).length
  };
}

/* 全文检索：本地倒排 + 子串兜底，不依赖网络（说明书 5.9 / 14.6） */

let searchRows = [];
let gramIndex = new Map();

function grams(text) {
  const clean = String(text || '').toLowerCase().replace(/\s+/g, '');
  const out = new Set();
  for (let i = 0; i < clean.length - 1; i++) out.add(clean.slice(i, i + 2));
  return out;
}

export function buildSearchIndex() {
  searchRows = [];
  gramIndex = new Map();
  const push = (key, text) => {
    const hay = String(text || '').toLowerCase();
    if (!hay.trim()) return;
    searchRows.push({ key, hay });
    grams(hay).forEach((g) => {
      let set = gramIndex.get(g);
      if (!set) { set = new Set(); gramIndex.set(g, set); }
      set.add(key);
    });
  };

  liveWorks().forEach((w) => {
    const tagNames = (w.tagIds || []).map((id) => {
      const t = data.tags.find((x) => x.id === id);
      return t ? t.name : '';
    });
    push('work:' + w.id, [w.title, w.originalTitle, (w.aliases || []).join(' '), w.creator, w.year, tagNames.join(' ')].join(' '));
  });
  data.excerpts.filter((e) => !e.deletedAt).forEach((e) => push('excerpt:' + e.id, [e.content, e.author, e.insight].join(' ')));
  data.reviews.filter((r) => !r.deletedAt).forEach((r) => push('review:' + r.id, [r.title, r.body].join(' ')));
  data.accounts.filter((a) => !a.deletedAt).forEach((a) => push('account:' + a.id, [a.platform, a.username, a.purpose].join(' ')));
  data.topics.forEach((t) => push('topic:' + t.id, [t.title, t.description].join(' ')));
  data.notes.filter((n) => !n.deletedAt).forEach((n) => push('note:' + n.id, [n.title, n.body].join(' ')));
}

export function searchKeys(q) {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return [];
  const clean = s.replace(/\s+/g, '');
  const keys = new Set();

  /* 先用倒排缩小范围 */
  let pool = null;
  for (let i = 0; i < clean.length - 1; i++) {
    const set = gramIndex.get(clean.slice(i, i + 2));
    if (!set) continue;
    pool = pool ? new Set([...pool].filter((k) => set.has(k))) : new Set(set);
  }

  const rows = pool
    ? searchRows.filter((r) => pool.has(r.key))
    : searchRows;

  /* 再用子串校验，避免切词带来的误命中 */
  rows.forEach((r) => { if (r.hay.indexOf(clean) >= 0) keys.add(r.key); });

  /* 多词查询：全部分词命中才算 */
  const words = s.split(/\s+/).filter(Boolean);
  if (words.length > 1) {
    const hits = searchRows.filter((r) => words.every((w) => r.hay.indexOf(w) >= 0));
    hits.forEach((r) => keys.add(r.key));
  }
  return [...keys];
}

/* ---------------- 封面与图片（Blob → object URL 缓存） ---------------- */

export const imageUrls = new Map();

export async function loadImages() {
  const list = await db.getAll(STORES.attachments);
  list.forEach((a) => {
    if (!a || !a.data) return;
    if (!(a.data instanceof Blob)) return;
    if (imageUrls.has(a.id)) return;
    /* 附件文件按需取，不在启动时全部转成 URL（大文件会拖慢首屏） */
    if (a.ownerType === 'file') return;
    if (a.mimeType && !/^image\//.test(a.mimeType)) return;
    try { imageUrls.set(a.id, URL.createObjectURL(a.data)); } catch (e) { /* ignore */ }
  });
  return imageUrls.size;
}

export function imageUrl(id) {
  if (!id) return '';
  return imageUrls.get(id) || '';
}

export function coverUrl(w) {
  if (!w) return '';
  return imageUrl(w.cover);
}

/* 压缩后存入 IndexedDB：单张封面目标 ≤ 500KB（说明书 5.2.5） */
export function compressImage(file, maxSide, quality) {
  const max = maxSide || 900;
  const q = quality || 0.82;
  return new Promise((resolve, reject) => {
    if (!/^image\//.test(file.type || '')) { reject(new Error('请选择图片文件')); return; }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const scale = Math.min(1, max / Math.max(width, height));
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob((blob) => {
        if (!blob) { reject(new Error('图片处理失败')); return; }
        resolve(blob);
      }, 'image/jpeg', q);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片读取失败')); };
    img.src = url;
  });
}

export async function saveCover(file) {
  const blob = await compressImage(file, 900, 0.82);
  const id = uid('img');
  const row = await putAttachment(id, blob, {
    fileName: file.name || 'cover.jpg',
    mimeType: blob.type,
    size: blob.size,
    ownerType: 'cover'
  });
  if (!row) return '';
  imageUrls.set(id, URL.createObjectURL(blob));
  return id;
}

/* 5.2.5 列表用缩略图，详情页用原图 */
export async function saveCoverPair(file) {
  const full = await saveCover(file);
  if (!full) return { cover: '', thumb: '' };
  try {
    const small = await compressImage(file, 240, 0.72);
    const tid = uid('thm');
    const row = await putAttachment(tid, small, {
      fileName: 'thumb.jpg', mimeType: small.type, size: small.size, ownerType: 'thumb'
    });
    if (row) imageUrls.set(tid, URL.createObjectURL(small));
    return { cover: full, thumb: row ? tid : '' };
  } catch (e) {
    return { cover: full, thumb: '' };
  }
}

export function thumbUrl(w) {
  if (!w) return '';
  return imageUrl(w.thumb) || imageUrl(w.cover);
}

export async function saveSpineArt(file) {
  const blob = await compressImage(file, 560, 0.8);
  const id = uid('spine');
  const row = await putAttachment(id, blob, {
    fileName: file.name || 'spine.jpg',
    mimeType: blob.type,
    size: blob.size,
    ownerType: 'spine'
  });
  if (!row) return '';
  imageUrls.set(id, URL.createObjectURL(blob));
  return id;
}


/* 5.7 题材分类需要预设；只在第一次初始化时写入，之后由用户增删 */
export async function seedPresetCategories(presets) {
  if (setting('seededCategories', false)) return 0;
  if (data.categories.length) { await saveSetting('seededCategories', true); return 0; }
  const ts = nowISO();
  const rows = presets.map((name, i) => ({
    id: uid('cat'), name, parentId: '', order: i, createdAt: ts, updatedAt: ts
  }));
  const res = await db.putMany(STORES.categories, rows);
  if (!res.ok) return 0;
  rows.forEach((r) => data.categories.push(r));
  await saveSetting('seededCategories', true);
  emit();
  return rows.length;
}


/* ==========================================================
   6.3 成就与多周目
   ========================================================== */

export function achievementsOf(workId) {
  return data.achievements.filter((a) => a.workId === workId)
    .sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.name).localeCompare(String(b.name), 'zh-Hans-CN'));
}

export function achievementStats(workId) {
  const list = achievementsOf(workId);
  const done = list.filter((a) => a.done).length;
  const hidden = list.filter((a) => a.hidden).length;
  const hiddenDone = list.filter((a) => a.hidden && a.done).length;
  const total = list.length;
  return {
    total, done, hidden, hiddenDone,
    left: total - done,
    pct: total ? Math.round(done / total * 100) : 0,
    full: total > 0 && done === total
  };
}

export function playthroughsOf(workId) {
  return data.playthroughs.filter((p) => p.workId === workId)
    .sort((a, b) => (a.no || 1) - (b.no || 1));
}

export function playthroughStats(workId) {
  const list = playthroughsOf(workId);
  const hours = list.reduce((a, p) => a + (Number(p.hours) || 0), 0);
  const last = list.slice().sort((a, b) => String(b.endDate || '').localeCompare(String(a.endDate || '')))[0] || null;
  return { count: list.length, hours: Math.round(hours * 10) / 10, last };
}

/* ==========================================================
   6.4 曲目与歌单
   ========================================================== */

export function tracksOf(workId) {
  return data.tracks.filter((t) => t.workId === workId)
    .sort((a, b) => (a.disc || 1) - (b.disc || 1) || (a.no || 0) - (b.no || 0));
}

export function trackStats(workId) {
  const list = tracksOf(workId);
  const seconds = list.reduce((a, t) => a + (Number(t.duration) || 0), 0);
  const favs = list.filter((t) => t.fav).length;
  const rated = list.filter((t) => Number(t.rating) > 0);
  const avg = rated.length ? Math.round(rated.reduce((a, t) => a + Number(t.rating), 0) / rated.length * 10) / 10 : 0;
  return { total: list.length, seconds, favs, avg };
}

export function playlistTracks(pl) {
  return (pl && pl.trackIds || []).map((id) => data.tracks.find((t) => t.id === id)).filter(Boolean);
}

/* 6.4 年度收听统计：来自按天会话与完成记录，不补造数据 */
export function musicYearStats(year) {
  const y = String(year);
  const albums = liveWorks().filter((w) => typeDef(w.type).group === 'audio');
  const audioIds = new Set(albums.map((w) => w.id));
  /* 只统计音乐类作品的会话，阅读与游戏时长不能算进收听 */
  const sessions = data.sessions.filter((s) => audioIds.has(s.workId) && String(s.date || '').slice(0, 4) === y);
  const minutes = sessions.reduce((a, s) => a + (Number(s.minutes) || 0), 0);
  const doneAlbums = albums.filter((w) => {
    const d = finishedDate(w);
    return d && String(d).slice(0, 4) === y;
  });
  const byArtist = {};
  doneAlbums.forEach((w) => {
    const k = w.creator || '未标注';
    byArtist[k] = (byArtist[k] || 0) + 1;
  });
  const topArtist = Object.keys(byArtist).sort((a, b) => byArtist[b] - byArtist[a])[0] || '';
  const favTracks = data.tracks.filter((t) => t.fav).map((t) => {
    const w = getWork(t.workId);
    return { track: t, work: w };
  }).filter((x) => x.work && typeDef(x.work.type).group === 'audio').slice(0, 8);
  const yearAlbums = albums.filter((w) => String(w.year || '') === y);
  return {
    minutes: Math.round(minutes),
    hours: Math.round(minutes / 60 * 10) / 10,
    sessions: sessions.length,
    albums: doneAlbums.length,
    topArtist,
    byArtist,
    released: yearAlbums.length,
    favTracks,
    top: doneAlbums.slice().sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 6)
  };
}

export function musicYears() {
  const set = new Set();
  data.sessions.forEach((s) => { if (s.date) set.add(String(s.date).slice(0, 4)); });
  liveWorks().forEach((w) => {
    if (typeDef(w.type).group !== 'audio') return;
    const d = finishedDate(w);
    if (d) set.add(String(d).slice(0, 4));
    if (w.year) set.add(String(w.year));
  });
  const now = String(new Date().getFullYear());
  set.add(now);
  return [...set].filter(Boolean).sort().reverse();
}

/* ==========================================================
   5.2.3 期刊：按刊名归集成刊系
   ========================================================== */

export function periodicalName(w) {
  const d = detailsOf(w.id);
  const name = String(d.magName || w.title || '').trim();
  return name || '未命名刊系';
}

export function issueNumberOf(w) {
  const d = detailsOf(w.id);
  const raw = String(d.issueNo || '').match(/\d+/);
  return raw ? Number(raw[0]) : 0;
}

export function issueYearOf(w) {
  const d = detailsOf(w.id);
  const fromField = String(d.issueDate || '').slice(0, 4);
  return fromField || String(w.year || '').slice(0, 4);
}

export function periodicalGroups() {
  const map = {};
  liveWorks().filter((w) => typeDef(w.type).group === 'text' && ['magazine', 'newspaper'].indexOf(w.type) >= 0)
    .forEach((w) => {
      const name = periodicalName(w);
      const key = w.type + '::' + name;
      if (!map[key]) {
        map[key] = { key, name, type: w.type, issues: [] };
      }
      map[key].issues.push({
        work: w,
        year: issueYearOf(w),
        no: issueNumberOf(w),
        date: detailsOf(w.id).issueDate || ''
      });
    });

  return Object.keys(map).map((k) => {
    const g = map[k];
    g.issues.sort((a, b) => String(a.year).localeCompare(String(b.year)) || (a.no || 0) - (b.no || 0));

    /* 缺期检测：同一年的连续期号出现断档，且断档不超过 3 期时提示 */
    const missing = [];
    const byYear = {};
    g.issues.forEach((it) => { (byYear[it.year] = byYear[it.year] || []).push(it.no); });
    Object.keys(byYear).sort().forEach((y) => {
      const nums = byYear[y].filter((n) => n > 0).sort((a, b) => a - b);
      for (let i = 1; i < nums.length; i++) {
        const gap = nums[i] - nums[i - 1];
        if (gap > 1 && gap <= 4) {
          for (let n = nums[i - 1] + 1; n < nums[i]; n++) missing.push({ year: y, no: n });
        }
      }
    });

    const years = [...new Set(g.issues.map((x) => x.year).filter(Boolean))].sort();
    const done = g.issues.filter((x) => bucketOf(x.work) === 'done').length;
    return {
      key: g.key,
      name: g.name,
      type: g.type,
      issues: g.issues,
      missing,
      years,
      first: years[0] || '',
      last: years[years.length - 1] || '',
      count: g.issues.length,
      done,
      latest: g.issues[g.issues.length - 1] || null
    };
  }).sort((a, b) => String(b.last).localeCompare(String(a.last)) || a.name.localeCompare(b.name, 'zh-Hans-CN'));
}


/* ==========================================================
   5.5 总结插图与附件
   图片压缩后存 Blob，业务记录只存附件 ID 与图注。
   ========================================================== */

export async function saveReviewImage(file) {
  const blob = await compressImage(file, 1600, 0.86);
  const id = uid('rimg');
  const row = await putAttachment(id, blob, {
    fileName: file.name || 'image.jpg',
    mimeType: blob.type,
    size: blob.size,
    ownerType: 'review-image'
  });
  if (!row) return null;
  imageUrls.set(id, URL.createObjectURL(blob));
  return { id, name: file.name || '图片', size: blob.size, mimeType: blob.type };
}

/* 附件原样保存，单件上限 25MB，避免数据库失控 */
export const FILE_LIMIT = 25 * 1024 * 1024;

export async function saveAttachmentFile(file) {
  if (file.size > FILE_LIMIT) {
    throw new Error('单个附件不能超过 25MB');
  }
  const id = uid('file');
  const blob = file.slice(0, file.size, file.type || 'application/octet-stream');
  const row = await putAttachment(id, blob, {
    fileName: file.name || 'attachment',
    mimeType: file.type || 'application/octet-stream',
    size: file.size,
    ownerType: 'file'
  });
  if (!row) return null;
  return { id, name: file.name || 'attachment', size: file.size, mimeType: file.type || '' };
}

const fileBlobs = new Map();

export async function attachmentBlob(id) {
  if (fileBlobs.has(id)) return fileBlobs.get(id);
  const row = await db.get(STORES.attachments, id);
  if (!row || !row.data) return null;
  fileBlobs.set(id, row.data);
  return row.data;
}

export async function attachmentUrl(id) {
  if (!id) return '';
  if (imageUrls.has(id)) return imageUrls.get(id);
  if (fileBlobs.has(id)) return fileBlobs.get(id);
  const blob = await attachmentBlob(id);
  if (!blob) return '';
  const url = URL.createObjectURL(blob);
  fileBlobs.set(id, url);
  return url;
}

export async function deleteAttachments(ids) {
  for (const id of ids || []) {
    if (!id) continue;
    try { await db.del(STORES.attachments, id); } catch (e) { /* ignore */ }
    imageUrls.delete(id);
    fileBlobs.delete(id);
  }
}

export function humanSize(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return n + ' B';
  if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB';
  return (n / 1024 / 1024).toFixed(1) + ' MB';
}


/* ==========================================================
   8.1 独立笔记与版本历史
   每次正文发生变化时，先把上一版写入 note_versions，
   再保存新内容；单条笔记最多保留 30 个历史版本。
   ========================================================== */

export async function saveNote(note) {
  const prev = note.id ? notes.get(note.id) : null;
  const body = String(note.body || '');
  if (prev && String(prev.body || '') && prev.body !== body) {
    await noteVersions.save({
      id: '',
      noteId: prev.id,
      title: prev.title || '',
      body: prev.body,
      savedAt: prev.updatedAt || nowISO()
    });
  }
  const res = await notes.save(note);
  if (!res.ok) return res;

  /* 只留最近 30 版 */
  const list = data.noteVersions.filter((v) => v.noteId === res.row.id)
    .sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
  for (const old of list.slice(30)) await noteVersions.hardRemove(old.id);
  return res;
}

export function versionsOf(noteId) {
  return data.noteVersions.filter((v) => v.noteId === noteId)
    .sort((a, b) => String(b.savedAt).localeCompare(String(a.savedAt)));
}

export async function restoreNoteVersion(noteId, versionId) {
  const note = notes.get(noteId);
  const ver = noteVersions.get(versionId);
  if (!note || !ver) return { ok: false, error: '版本不存在' };
  return saveNote(Object.assign({}, note, { title: ver.title || note.title, body: ver.body }));
}

export function notesOfWork(workId) {
  return data.notes.filter((n) => !n.deletedAt && (n.workIds || []).indexOf(workId) >= 0);
}


/* ==========================================================
   9.3 疑似重复的合并：把 B 的关联记录迁到 A，再软删除 B
   不合并附件与专属字段，避免覆盖用户已经改好的档案。
   ========================================================== */

export async function mergeWorks(fromId, toId) {
  if (!fromId || !toId || fromId === toId) return { ok: false, error: '需要两部不同的作品' };
  const from = getWork(fromId);
  const to = getWork(toId);
  if (!from || !to) return { ok: false, error: '作品不存在' };

  const pairs = [
    [STORES.experiences, 'experiences'], [STORES.reviews, 'reviews'], [STORES.excerpts, 'excerpts'],
    [STORES.resources, 'resources'], [STORES.collections, 'collections'], [STORES.physical, 'physical'],
    [STORES.achievements, 'achievements'], [STORES.playthroughs, 'playthroughs'], [STORES.tracks, 'tracks'],
    [STORES.episodes, 'episodes'], [STORES.sessions, 'sessions'], [STORES.statusLog, 'statusLog']
  ];
  const counts = {};

  for (const [store, key] of pairs) {
    const rows = data[key].filter((r) => r.workId === fromId);
    for (const r of rows) {
      const next = Object.assign({}, r, { workId: toId, updatedAt: nowISO() });
      const res = await db.put(store, next);
      if (res.ok) {
        const i = data[key].findIndex((x) => x.id === r.id);
        if (i >= 0) data[key][i] = next;
        counts[key] = (counts[key] || 0) + 1;
      }
    }
  }

  /* 双向关联：把 from 的端点换成 to */
  const fromKey = 'work:' + fromId;
  const toKey = 'work:' + toId;
  for (const l of data.links.filter((x) => x.source === fromKey || x.target === fromKey)) {
    const next = Object.assign({}, l, {
      source: l.source === fromKey ? toKey : l.source,
      target: l.target === fromKey ? toKey : l.target
    });
    if (next.source === next.target) {
      await db.del(STORES.links, l.id);
      data.links = data.links.filter((x) => x.id !== l.id);
      continue;
    }
    const res = await db.put(STORES.links, next);
    if (res.ok) {
      const i = data.links.findIndex((x) => x.id === l.id);
      if (i >= 0) data.links[i] = next;
      counts.links = (counts.links || 0) + 1;
    }
  }

  /* 人物关系：同一人同一角色只留一条 */
  for (const wc of data.workCreators.filter((x) => x.workId === fromId)) {
    const dup = data.workCreators.find((x) => x.workId === toId && x.creatorId === wc.creatorId && x.role === wc.role);
    if (dup) {
      await db.del(STORES.work_creators, wc.id);
      data.workCreators = data.workCreators.filter((x) => x.id !== wc.id);
    } else {
      const next = Object.assign({}, wc, { workId: toId });
      const res = await db.put(STORES.work_creators, next);
      if (res.ok) {
        const i = data.workCreators.findIndex((x) => x.id === wc.id);
        if (i >= 0) data.workCreators[i] = next;
        counts.workCreators = (counts.workCreators || 0) + 1;
      }
    }
  }

  /* 专题里去掉 from，保留 to */
  for (const t of data.topics.filter((x) => (x.workIds || []).indexOf(fromId) >= 0)) {
    const ids = t.workIds.filter((x) => x !== fromId);
    if (ids.indexOf(toId) < 0) ids.push(toId);
    await topics.save(Object.assign({}, t, { workIds: ids }));
    counts.topics = (counts.topics || 0) + 1;
  }

  await deleteWork(fromId);
  emit();
  return { ok: true, counts };
}


/* 14.5 附件占用统计与未引用清理 */
export async function attachmentStats() {
  const all = await db.getAll(STORES.attachments);
  const byType = {};
  let size = 0;
  all.forEach((a) => {
    const k = a.ownerType || 'other';
    byType[k] = byType[k] || { count: 0, size: 0 };
    byType[k].count += 1;
    byType[k].size += Number(a.size) || (a.data && a.data.size) || 0;
    size += Number(a.size) || (a.data && a.data.size) || 0;
  });
  return { total: all.length, size, byType };
}

export async function cleanupUnusedAttachments() {
  const all = await db.getAll(STORES.attachments);
  const used = new Set();
  const add = (id) => { if (id) used.add(id); };
  data.works.forEach((w) => {
    add(w.cover); add(w.thumb);
    (w.shots || []).forEach((x) => add(x && x.id));
  });
  data.reviews.forEach((r) => {
    (r.images || []).forEach((x) => add(x && x.id));
    (r.files || []).forEach((x) => add(x && x.id));
  });
  data.physical.forEach((p2) => add(p2.photo));
  const spines = data.settings.spineArt || {};
  Object.keys(spines).forEach((k) => add(spines[k]));

  let removed = 0;
  let freed = 0;
  for (const a of all) {
    if (used.has(a.id)) continue;
    const res = await db.del(STORES.attachments, a.id);
    if (res.ok) {
      removed += 1;
      freed += Number(a.size) || (a.data && a.data.size) || 0;
      imageUrls.delete(a.id);
    }
  }
  return { removed, freed };
}
