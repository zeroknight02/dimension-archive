/* ==========================================================
   次元簿 · 旧版数据迁移（一次性）
   说明书 2.6 / 15.2：升级不得让用户丢数据。
   同源下仍能找到旧库 record_app_01_db 时，把旧记录转成新结构。
   旧库只读，绝不修改；导入前先出预览，由用户确认。
   ========================================================== */

import { saveWork, saveExperience, reviews, excerpts, saveTag, tagByName, putAttachment, loadImages } from './repo.js';
import { TYPE_MAP, typeDef } from './schema.js';

const LEGACY_DB = 'record_app_01_db';
const LEGACY_STORES = ['records', 'attachments', 'metadata'];

function openLegacy() {
  return new Promise((resolve) => {
    let req;
    try { req = indexedDB.open(LEGACY_DB); } catch (e) { resolve(null); return; }
    let created = false;
    req.onupgradeneeded = () => { created = true; try { req.transaction.abort(); } catch (e) { /* ignore */ } };
    req.onsuccess = () => {
      if (created) { try { req.result.close(); } catch (e) { /* ignore */ } resolve(null); return; }
      resolve(req.result);
    };
    req.onerror = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

function readAll(db, name) {
  return new Promise((resolve) => {
    if (!db || !db.objectStoreNames.contains(name)) { resolve([]); return; }
    try {
      const req = db.transaction(name, 'readonly').objectStore(name).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => resolve([]);
    } catch (e) { resolve([]); }
  });
}

export async function probeLegacy() {
  const db = await openLegacy();
  if (!db) return { found: false };
  const records = await readAll(db, 'records');
  const images = await readAll(db, 'attachments');
  try { db.close(); } catch (e) { /* ignore */ }
  return { found: true, records: records.length, images: images.length, raw: records };
}

/* 旧版进度 → 新版扁平 progress */
function mapProgress(type, p) {
  const def = typeDef(type);
  const src = p && typeof p === 'object' ? p : {};
  const out = {};
  const num = (v) => {
    const n = Number(v);
    return isFinite(n) ? n : 0;
  };
  if (def.mode === 'book') {
    const unit = src.unit === 'volume' ? 'volume' : src.unit === 'page' ? 'page' : 'chapter';
    out.unit = unit;
    const ch = src.chapter && typeof src.chapter === 'object' ? src.chapter : src;
    const vol = src.volume && typeof src.volume === 'object' ? src.volume : {};
    const pg = src.page && typeof src.page === 'object' ? src.page : {};
    out.chapterCur = num(ch.current);
    out.chapterTotal = num(ch.total);
    out.volumeCur = num(vol.current);
    out.volumeTotal = num(vol.total);
    out.pageCur = num(pg.current);
    out.pageTotal = num(pg.total);
  } else if (def.mode === 'series') {
    const segs = Array.isArray(src.segments) ? src.segments : [];
    const last = segs[segs.length - 1] || src;
    out.seasonCur = num(last.n || src.season || 1);
    out.seasonTotal = segs.length || num(src.seasonTotal) || 0;
    const done = segs.filter((s) => s && (s.done || (num(s.total) > 0 && num(s.current) >= num(s.total)))).length;
    out.epCur = num(last.current);
    out.epTotal = num(last.total);
    out.seasonsDone = done;
  } else if (def.mode === 'percent') {
    out.percent = Math.max(0, Math.min(100, Math.round(num(src.percent))));
    out.hours = num(src.hours || src.playTime);
  } else if (def.mode === 'issue') {
    out.issueYear = String(src.year || '');
    out.issueNo = String(src.issueNo || '');
  }
  return out;
}

const FIELD_KEYS = new Set(Object.keys({
  publisher: 1, imprint: 1, subtitle: 1, series: 1, seriesNo: 1, editionNo: 1, printNo: 1, pubPlace: 1,
  pages: 1, words: 1, binding: 1, bookSize: 1, isbn: 1, issn: 1, price: 1, paper: 1, illustrated: 1,
  firstEdition: 1, sheets: 1, outOfPrint: 1, translator: 1, editor: 1, language: 1, serialStatus: 1,
  format: 1, readingDevice: 1, source: 1, purchaseChannel: 1, buyPrice: 1, buyDate: 1, runtime: 1,
  releaseDate: 1, releaseRegion: 1, screeningFormat: 1, ageRating: 1, productionCompany: 1, distributor: 1,
  boxoffice: 1, budget: 1, premiere: 1, aspect: 1, color: 1, screenwriter: 1, cast: 1, composer: 1,
  cinema: 1, watchPlace: 1, watchPlatform: 1, subtitle2: 1, seasons: 1, epCount: 1, epRuntime: 1,
  channel: 1, airWeekday: 1, airStart: 1, airEnd: 1, airPeriod: 1, themeSong: 1, studio: 1,
  originalWork: 1, basedOn: 1, charDesign: 1, artDirector: 1, musicProd: 1, cv: 1, venue: 1,
  location: 1, tour: 1, shows: 1, seat: 1, ticketPrice: 1, stageManager: 1, lighting: 1, costume: 1,
  posterDesign: 1, organizer: 1, albumType: 1, tracks: 1, trackList: 1, discs: 1, label: 1,
  recordPlace: 1, recordingStudio: 1, mastering: 1, lyricist: 1, arranger: 1, albumLanguage: 1,
  signed: 1, listenPlace: 1, subPrice: 1, platforms: 1, engine: 1, languages: 1, chineseSupport: 1,
  dlcCount: 1, onlinePlayers: 1, difficulty: 1, completionistHours: 1, modSupport: 1, vrSupport: 1,
  playTime: 1, firstPlatform: 1, achievementsTotal: 1, controller: 1, cloudSave: 1, lastPlayed: 1,
  issueNo: 1, editorInChief: 1, subscribeFrom: 1, subscribeEnd: 1, link: 1, host: 1
}));

function cleanFields(meta) {
  const out = {};
  Object.keys(meta || {}).forEach((k) => {
    if (!FIELD_KEYS.has(k)) return;
    const v = meta[k];
    if (v === '' || v == null) return;
    out[k] = String(v).slice(0, 200);
  });
  return out;
}

function normalizeLegacy(r) {
  const type = TYPE_MAP[r.type] ? r.type : 'book';
  const status = ['wish', 'todo', 'doing', 'paused', 'done', 'dropped', 'redoing'].indexOf(r.status) >= 0 ? r.status : 'wish';
  const created = r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString();
  return {
    work: {
      id: '',
      type,
      title: String(r.title || '').trim(),
      originalTitle: String(r.originalTitle || '').trim(),
      aliases: Array.isArray(r.aliases) ? r.aliases.slice(0, 10).map(String) : [],
      creator: String(r.creator || '').trim(),
      year: String(r.year || '').trim(),
      rating: Math.max(0, Math.min(10, Number(r.rating) || 0)),
      status,
      summary: '',
      note: [r.notes || '', (r.notesLog || []).map((n) => (n.date ? n.date + ' ' : '') + (n.text || '')).join('\n')]
        .filter(Boolean).join('\n').slice(0, 2000),
      source: String((r.meta && r.meta.source) || ''),
      categoryId: '',
      tagIds: [],
      cover: r.cover || '',
      createdAt: created,
      updatedAt: created
    },
    fields: cleanFields(r.meta),
    tags: Array.isArray(r.tags) ? r.tags.slice(0, 20).map(String).filter(Boolean) : [],
    progress: mapProgress(type, r.progress),
    finishedAt: r.finishedAt || '',
    review: String(r.review || '').trim(),
    quotes: Array.isArray(r.quotes) ? r.quotes.filter((q) => q && q.text) : [],
    hasProgress: !!(r.progress && Object.keys(r.progress).length)
  };
}

export function summarizeLegacy(raw) {
  const items = raw.map(normalizeLegacy).filter((x) => x.work.title);
  const byType = {};
  let reviews = 0;
  let excerpts = 0;
  items.forEach((x) => {
    byType[x.work.type] = (byType[x.work.type] || 0) + 1;
    if (x.review) reviews++;
    excerpts += x.quotes.length;
  });
  return {
    total: items.length,
    byType,
    reviews,
    excerpts,
    untitled: raw.length - items.length,
    items
  };
}

export async function importLegacy(raw, opts) {
  const o = Object.assign({ works: true, experiences: true, reviews: true, excerpts: true, images: true }, opts || {});
  const s = summarizeLegacy(raw);
  const report = { works: 0, experiences: 0, reviews: 0, excerpts: 0, tags: 0, images: 0, skipped: 0 };

  /* 旧图片按原 ID 复制，保证封面引用不断 */
  if (o.images) {
    const db = await openLegacy();
    const imgs = await readAll(db, 'attachments');
    try { db.close(); } catch (e) { /* ignore */ }
    for (const im of imgs) {
      if (!im || !im.id || !im.data) continue;
      const blob = im.data instanceof Blob ? im.data : null;
      if (!blob) continue;
      const row = await putAttachment(im.id, blob, { fileName: im.id, mimeType: blob.type, size: blob.size, ownerType: 'legacy' });
      if (row) report.images++;
    }
    await loadImages();
  }

  for (const item of s.items) {
    if (!o.works) continue;
    const tagIds = [];
    for (const name of item.tags) {
      let tag = tagByName(name);
      if (!tag) {
        const r = await saveTag({ name });
        tag = r.row;
        if (tag) report.tags++;
      }
      if (tag) tagIds.push(tag.id);
    }
    const res = await saveWork(Object.assign({}, item.work, { tagIds }), item.fields);
    if (!res.ok) { report.skipped++; continue; }
    report.works++;
    const workId = res.work.id;

    if (o.experiences && (item.hasProgress || item.finishedAt || item.work.status !== 'wish')) {
      const r2 = await saveExperience({
        workId,
        experienceType: '首次',
        status: item.work.status,
        startDate: (item.work.createdAt || '').slice(0, 10),
        endDate: item.finishedAt || '',
        progress: item.progress,
        rating: item.work.rating,
        note: ''
      });
      if (r2.ok) report.experiences++;
    }
    if (o.reviews && item.review) {
      const r3 = await reviews.save({
        workId,
        type: '观后感',
        title: item.work.title + ' · 旧版总结',
        body: item.review,
        rating: item.work.rating,
        date: item.finishedAt || (item.work.createdAt || '').slice(0, 10),
        tags: [],
        source: 'import'
      });
      if (r3.ok) report.reviews++;
    }
    if (o.excerpts) {
      for (const q of item.quotes) {
        const r4 = await excerpts.save({
          workId,
          content: String(q.text).slice(0, 600),
          type: '名句',
          author: item.work.creator,
          position: q.page ? { page: String(q.page) } : {},
          date: item.finishedAt || (item.work.createdAt || '').slice(0, 10),
          insight: '',
          tags: []
        });
        if (r4.ok) report.excerpts++;
      }
    }
  }
  return report;
}
