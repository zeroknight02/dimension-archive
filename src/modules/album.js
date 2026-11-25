/* ==========================================================
   次元簿 · 收藏册（保留设计）
   拟真书架 / 册子双页翻阅 / 纪念票根 / 标准卡 /
   入册音效与顺序 / 册子风格 / 每页张数
   作品数据来自 works + work_details + experience_records，
   本模块只负责展示层，不复制任何数据（说明书 11.1）。
   ========================================================== */

import { data, liveWorks, worksByType, getWork, detailsOf, latestExperience, finishedDate, workStatus, statusText, coverUrl, saveSpineArt, imageUrl, setting, saveSetting, emit } from '../core/repo.js';
import { downloadBlob } from '../core/backup.js';
import { TYPES, TYPE_MAP, typeDef, statusBucket } from '../core/schema.js';
import { pref, ui, go, isMobile } from '../core/state.js';
import { icon, toast, openModal, emptyState, groupIcon } from '../core/ui.js';
import { esc, ratingShort, initials, coverColor, progressText } from '../core/format.js';
import { openNewTypeModal } from './extensions.js';

/* ---------------- 配置 ---------------- */

export function albumCfg() {
  return {
    per: [1, 2, 4].indexOf(pref('album.per')) >= 0 ? pref('album.per') : 1,
    order: pref('album.order') === 'new' ? 'new' : 'seq',
    sound: pref('album.sound') !== false,
    style: 'astral',
    view: pref('album.view') || 'shelf',
    ticket: pref('album.ticket') || {},
    order2: pref('album.order2') || [],
    pos: pref('album.pos') || {}
  };
}

function saveCfg(patch) {
  Object.keys(patch).forEach((k) => pref('album.' + k, patch[k]));
}

const GROUP_ORDER = ['text', 'film', 'comic', 'stage', 'audio', 'game', 'custom'];

function typeOrder() {
  const saved = pref('album.order2') || [];
  const known = TYPES.map((t) => t.id);
  const out = saved.filter((id) => known.indexOf(id) >= 0);
  known.forEach((id) => { if (out.indexOf(id) < 0) out.push(id); });
  return out;
}

function orderedTypes() {
  const order = typeOrder();
  return order.map((id) => TYPE_MAP[id]).filter(Boolean);
}

/* ---------------- 数据视图 ---------------- */

function sortWorks(list, cfg) {
  const c = cfg || albumCfg();
  return list.slice().sort((a, b) => {
    const da = finishedDate(a) || '';
    const db = finishedDate(b) || '';
    if (da !== db) {
      if (!da) return 1;
      if (!db) return -1;
      return c.order === 'new' ? (da < db ? 1 : -1) : (da > db ? 1 : -1);
    }
    return c.order === 'new'
      ? String(b.createdAt).localeCompare(String(a.createdAt))
      : String(a.createdAt).localeCompare(String(b.createdAt));
  });
}

function isTicketType(typeId) {
  const t = TYPE_MAP[typeId];
  return !!t && (t.group === 'film' || t.group === 'stage');
}

function ticketMode(typeId) {
  const cfg = albumCfg();
  const v = cfg.ticket[typeId];
  if (v) return v === 'stub';
  return typeId === 'movie' || typeId === 'stage';
}

function spineArt(typeId) {
  const map = setting('spineArt', {}) || {};
  return imageUrl(map[typeId]);
}

/* ---------------- 书架 ---------------- */

function shelfLayout(n, avail) {
  const width = Math.max(240, avail || Math.min(window.innerWidth - 36, 760));
  const gap = width < 420 ? 4 : 5;
  /* 书脊厚度跟册子内容量有关：作品越多越厚，但不会为了填满层板被拉宽 */
  const bw = Math.round(74 + Math.min(6, Math.max(0, n - 1)) * 2);
  const per = Math.max(1, Math.floor((width + gap) / (bw + gap)));
  return { per, bw, gap };
}

function spineHTML(t, list, geom) {
  const years = {};
  list.forEach((w) => {
    const d = (finishedDate(w) || w.createdAt || '').slice(0, 4);
    if (d) years[d] = 1;
  });
  const yk = Object.keys(years).sort();
  const span = yk.length ? yk[0] + (yk.length > 1 ? '–' + yk[yk.length - 1] : '') : '';
  const cnt = list.length;
  const isAudio = t.group === 'audio';
  const isText = t.group === 'text';
  const isMag = t.id === 'magazine' || t.id === 'newspaper';
  const bw = Math.round(geom.bw * (isText ? 0.94 : isAudio ? 1.02 : 1));
  const bh = isAudio
    ? Math.round(geom.bw * 2.85)
    : Math.round(geom.bw * 3.02 * (isText ? 1.1 : 1) * (0.95 + Math.min(cnt, 12) * 0.005));
  const art = spineArt(t.id);

  /* 书脊上的实物装饰；黑胶在册子外侧，其余在书脊内部 */
  const innerDeco =
    t.group === 'comic' ? '<span class="spine-obi">' + esc(t.label) + '</span>' :
      t.group === 'stage' ? '<span class="spine-ticket"></span>' :
        t.group === 'game' ? '<span class="spine-case"></span>' :
          t.group === 'film' ? '<span class="spine-perf"></span>' :
            isMag ? '<span class="spine-mast">' + esc(t.label) + '</span>' :
              isAudio ? '' : '<span class="spine-bands"></span>';

  return '<button class="shelf-book" data-action="album-open" data-value="' + t.id + '"' +
    ' data-type="' + t.id + '" data-group="' + t.group + '" aria-label="' + esc(t.label) + '，长按拖动排序"' +
    ' style="--tc:' + t.color + ';--bw:' + bw + 'px;--bh:' + bh + 'px">' +
    (isAudio ? '<span class="spine-disc"></span>' : '') +
    '<span class="spine spine-' + t.group + (art ? ' has-art' : '') + '">' +
    (art ? '<span class="spine-art"><img src="' + esc(art) + '" alt="" loading="lazy"></span>' : '') +
    '<span class="spine-cap"></span>' +
    innerDeco +
    '<span class="spine-icon">' + groupIcon(t.group, 13) + '</span>' +
    '<span class="spine-title">' + esc(t.label) + '</span>' +
    '<span class="spine-foot">' +
    '<span class="spine-count">' + (cnt ? cnt + ' 张' : '空') + '</span>' +
    (span ? '<span class="spine-years">' + esc(span) + '</span>' : '') +
    '</span></span></button>';
}

export function albumView() {
  const cfg = albumCfg();
  const all = liveWorks();
  const counts = {};
  all.forEach((w) => { counts[w.type] = (counts[w.type] || 0) + 1; });

  let html = '<header class="page-head">' +
    '<div><p class="eyebrow">作品档案 · 按类型装订</p><h1 class="page-title">收藏册</h1></div>' +
    '<div class="head-actions">' +
    '<button class="icon-btn" data-action="spine-art" aria-label="书脊背景">' + icon('image', 19) + '</button>' +
    '<button class="icon-btn" data-action="album-type-new" aria-label="添加类型">' + icon('plus', 20) + '</button>' +
    '</div></header>';

  const done = all.filter((w) => statusBucket(workStatus(w)) === 'done').length;
  const doing = all.filter((w) => statusBucket(workStatus(w)) === 'doing').length;
  const wish = all.filter((w) => ['wish', 'todo'].indexOf(statusBucket(workStatus(w))) >= 0).length;

  html += '<div class="ar-stats">共 <b>' + all.length + '</b> 部 · 已完成 <b>' + done +
    '</b> · 进行中 <b>' + doing + '</b> · 待体验 <b>' + wish + '</b></div>';

  if (!all.length) {
    return html + emptyState('·', '收藏册还是空的', '记下第一部作品，它会以一本册子的形式出现在书架上。',
      '<button class="btn btn-primary btn-sm" data-action="new-work">＋ 添加第一部作品</button>');
  }

  html += '<p class="fan-hint">每类是一本册子，点开左右翻；<b>长按册子可拖动排序</b>，右上角可以换书脊背景、添加类型。</p>';

  const avail = Math.min(window.innerWidth - (window.innerWidth >= 1024 ? 320 : 56), 820);
  const items = [];
  GROUP_ORDER.forEach((g) => {
    orderedTypes().filter((t) => t.group === g && (counts[t.id] || t.group === 'custom')).forEach((t) => {
      items.push({ t, list: sortWorks(worksByType(t.id)) });
    });
  });

  const geom = shelfLayout(items.length, avail);
  const per = Math.max(1, Math.min(items.length, geom.per));
  const rows = [];
  for (let i = 0; i < items.length; i += per) rows.push(items.slice(i, i + per));

  let tiers = rows.map((row, ri) => {
    const tallest = Math.max(...row.map((x) => x.list.length));
    const bw = Math.round(74 + Math.min(6, Math.max(0, tallest - 1)) * 2);
    return '<div class="shelf-tier" style="--gap:' + geom.gap + 'px" data-row="' + ri + '">' +
      row.map((x) => spineHTML(x.t, x.list, { bw, gap: geom.gap })).join('') +
      '</div>';
  }).join('');

  html += '<div class="shelf" id="shelf">' + tiers + '</div>';
  return html;
}

/* 列表视图：作品库同一套卡片，只是从收藏册进入 */

/* 长按拖动排序（pointer 事件；按住 380ms 进入拖动，拖动后不触发打开） */
let shelfCtx = null;
let lastDragAt = 0;

function shelfClearPress() {
  if (shelfCtx && shelfCtx.timer) clearTimeout(shelfCtx.timer);
  if (shelfCtx) { shelfCtx.timer = null; shelfCtx.press = null; }
}

function shelfBeginDrag(book) {
  if (!shelfCtx) return;
  shelfCtx.drag = { el: book, type: book.dataset.type, over: null };
  book.classList.add('is-dragging');
  lastDragAt = Date.now();
  if (navigator.vibrate) navigator.vibrate(12);
}

function shelfMoveTo(x, y) {
  if (!shelfCtx || !shelfCtx.drag) return;
  const el = document.elementFromPoint(x, y);
  const target = el && el.closest ? el.closest('.shelf-book') : null;
  shelfCtx.shelf.querySelectorAll('.is-drop-target').forEach((n) => n.classList.remove('is-drop-target'));
  if (target && target !== shelfCtx.drag.el) {
    target.classList.add('is-drop-target');
    shelfCtx.drag.over = target;
  } else {
    shelfCtx.drag.over = null;
  }
}

function shelfFinishDrag() {
  shelfClearPress();
  if (!shelfCtx || !shelfCtx.drag) return;
  const { el, type, over } = shelfCtx.drag;
  shelfCtx.drag = null;
  lastDragAt = Date.now();
  el.classList.remove('is-dragging');
  shelfCtx.shelf.querySelectorAll('.is-drop-target').forEach((n) => n.classList.remove('is-drop-target'));
  if (!over) return;
  const order = typeOrder();
  const from = order.indexOf(type);
  const to = order.indexOf(over.dataset.type);
  if (from < 0 || to < 0 || from === to) return;
  order.splice(from, 1);
  order.splice(to, 0, type);
  saveCfg({ order2: order });
  toast('书架顺序已更新');
  emit();
}

export function bindShelfDrag(root) {
  const shelf = root.querySelector('#shelf');
  if (!shelf) return;
  shelfCtx = { shelf, press: null, timer: null, drag: null };

  shelf.addEventListener('pointerdown', (e) => {
    const book = e.target.closest('.shelf-book');
    if (!book) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    shelfClearPress();
    const x = e.clientX;
    const y = e.clientY;
    shelfCtx.timer = setTimeout(() => {
      shelfCtx.timer = null;
      shelfCtx.press = null;
      shelfBeginDrag(book);
      shelfMoveTo(x, y);
    }, 380);
    shelfCtx.press = { book, x, y };
  });

  shelf.addEventListener('pointermove', (e) => {
    if (shelfCtx && shelfCtx.drag) { e.preventDefault(); shelfMoveTo(e.clientX, e.clientY); return; }
    if (!shelfCtx || !shelfCtx.press) return;
    if (Math.abs(e.clientX - shelfCtx.press.x) > 8 || Math.abs(e.clientY - shelfCtx.press.y) > 8) shelfClearPress();
  }, { passive: false });

  shelf.addEventListener('pointerup', () => { if (shelfCtx && shelfCtx.drag) shelfFinishDrag(); else shelfClearPress(); });
  shelf.addEventListener('pointercancel', () => shelfFinishDrag());
  shelf.addEventListener('pointerleave', () => { if (shelfCtx && !shelfCtx.drag) shelfClearPress(); });
  shelf.addEventListener('dragstart', (e) => e.preventDefault());
  shelf.addEventListener('click', (e) => {
    /* 拖动结束的那次 click 不应该打开册子 */
    if (Date.now() - lastDragAt < 600) { e.preventDefault(); e.stopPropagation(); }
  }, true);
}

/* 手指移出书架再松开也能正常结束拖动 */
document.addEventListener('pointerup', () => { if (shelfCtx && shelfCtx.drag) shelfFinishDrag(); });
document.addEventListener('pointercancel', () => { if (shelfCtx && shelfCtx.drag) shelfFinishDrag(); });

/* ---------------- 册子 ---------------- */

function bookList(type) {
  return sortWorks(worksByType(type));
}

function cardHTML(w) {
  const rate = w.rating ? ratingShort(w.rating) : '';
  const ex = latestExperience(w.id);
  const prog = ex ? progressText(typeDef(w.type), ex.progress) : '';
  const cover = coverUrl(w);
  return '<button class="bk-item" data-action="open-work" data-id="' + w.id + '">' +
    '<span class="bk-cover" style="--cc:' + coverColor(w.title) + '">' +
    (cover ? '<img src="' + esc(cover) + '" alt="" loading="lazy">' : '<span class="ph">' + esc(initials(w.title)) + '</span>') +
    '</span>' +
    '<span class="bk-info">' +
    '<b>' + esc(w.title) + '</b>' +
    '<span>' + esc([w.creator, w.year].filter(Boolean).join(' · ') || '—') + '</span>' +
    (prog ? '<span class="bk-date">' + esc(prog) + '</span>' : '') +
    '<span class="bk-meta"><span class="st st-' + workStatus(w) + '">' + esc(statusText(w)) + '</span>' +
    (rate ? '<span class="bk-rate">★ ' + rate + '</span>' : '') +
    '</span></span></button>';
}

function ticketHTML(w) {
  const d = detailsOf(w.id);
  const isStage = typeDef(w.type).group === 'stage';
  const date = finishedDate(w) || (w.createdAt || '').slice(0, 10);
  const dateTxt = date ? date.replace(/-/g, '.') : '—';
  const timeBits = [];
  if (d.runtime) timeBits.push(d.runtime + ' MIN');
  if (isStage && d.shows) timeBits.push('第 ' + d.shows + ' 场');
  const venue = isStage ? (d.venue || '') : (d.cinema || d.watchPlace || '');
  const seat = isStage ? (d.seat || '') : (d.watchPlace || '');
  const cover = coverUrl(w);
  const note = String(w.note || '').replace(/\s+/g, ' ').trim();
  let serial = 0;
  const s = String(w.id || w.title || '');
  for (let i = 0; i < s.length; i++) serial = (serial * 31 + s.charCodeAt(i)) % 100000;
  const serialTxt = ('00000' + serial).slice(-5);

  let bars = '';
  for (let i = 0; i < 84; i++) {
    const wd = 1 + ((i * 7 + (i % 5) * 3) % 3);
    const gap = (i % 4 === 0) ? 2 : 1;
    bars += '<i style="width:' + wd + 'px;margin-right:' + gap + 'px"></i>';
  }

  return '<div class="tk">' +
    '<div class="tk-top"><span class="tk-brand">' + (isStage ? 'PERFORMANCE · 观演纪念' : 'CINEMA · 观影纪念') + '</span>' +
    '<span class="tk-serial">NO. ' + serialTxt + '</span></div>' +
    '<div class="tk-still' + (cover ? '' : ' is-pat') + '">' +
    (cover ? '<img src="' + esc(cover) + '" alt="">' : '<i></i><i></i><i></i>') +
    '<span class="tk-still-tag">' + (isStage ? 'STAGE' : 'STILL') + '</span></div>' +
    '<div class="tk-main"><h3 class="tk-title">' + esc(w.title) + '</h3>' +
    (w.originalTitle ? '<p class="tk-orig">' + esc(w.originalTitle) + '</p>' : '') +
    '<p class="tk-by">' + esc([w.creator, w.year].filter(Boolean).join(' / ') || '—') + '</p></div>' +
    '<div class="tk-grid">' +
    '<div class="tk-cell"><span>DATE</span><b>' + esc(dateTxt) + '</b></div>' +
    '<div class="tk-cell"><span>TIME</span><b>' + esc(timeBits.join(' · ') || '—') + '</b></div>' +
    '<div class="tk-cell"><span>' + (isStage ? 'THEATRE' : 'VENUE') + '</span><b>' + esc(venue || '—') + '</b></div>' +
    '<div class="tk-cell"><span>' + (isStage ? 'SEAT' : 'FORMAT') + '</span><b>' + esc(seat || '—') + '</b></div>' +
    (d.ticketPrice ? '<div class="tk-cell"><span>PRICE</span><b>¥' + esc(d.ticketPrice) + '</b></div>' : '') +
    '</div>' +
    (note ? '<p class="tk-note">' + esc(note.slice(0, 64)) + (note.length > 64 ? '…' : '') + '</p>' : '') +
    '<div class="tk-big" aria-hidden="true">' + esc(String(w.year || date.slice(0, 4) || '')) + '</div>' +
    '<div class="tk-tear"><i></i><i></i></div>' +
    '<div class="tk-foot"><span class="tk-bars">' + bars + '</span>' +
    '<span class="tk-admit">ADMIT ONE</span>' +
    '<b class="tk-rate">' + (w.rating ? ratingShort(w.rating) : '—') + '</b></div></div>';
}

function bookCard(w, type, per) {
  if (isTicketType(type) && ticketMode(type)) {
    /* 一页只放一张时用完整票根，多张时缩成 mini 以免字太小 */
    const mini = per > 1 ? ' mini' : '';
    return '<div class="bk-item is-tk" data-action="open-work" data-id="' + w.id + '">' +
      ticketHTML(w).replace('class="tk"', 'class="tk' + mini + '"') + '</div>';
  }
  return cardHTML(w);
}

function pageHTML(list, pageNo, per, type) {
  const start = pageNo * per;
  const slice = list.slice(start, start + per);
  const body = slice.length
    ? '<div class="bk-cards per-' + per + '">' + slice.map((w) => bookCard(w, type, per)).join('') + '</div>'
    : '<div class="bk-blank"><span>' + (pageNo === 0 ? '这一册还空着' : '') + '</span></div>';
  return '<div class="bk-inner">' + body +
    '<span class="bk-folio">' + (slice.length ? (start + 1) + '–' + (start + slice.length) : '') + '</span></div>';
}

function pageMetrics(type) {
  const cfg = albumCfg();
  const tMode = isTicketType(type) && ticketMode(type);
  const per = tMode ? 1 : cfg.per;
  const single = isMobile();
  return { per, single, perView: single ? per : per * 2, tMode };
}

export function albumBookView(type) {
  const t = TYPE_MAP[type] ? type : (liveWorks()[0] ? liveWorks()[0].type : 'book');
  const def = typeDef(t);
  const cfg = albumCfg();
  const m = pageMetrics(t);
  const list = bookList(t);
  const total = Math.max(1, Math.ceil(list.length / m.perView));
  const pos = cfg.pos[t] || 0;
  const page = Math.min(Math.max(0, pos), total - 1);
  ui.album = { type: t, page };

  let html = '<header class="page-head bk-head">' +
    '<div class="head-left"><button class="icon-btn" data-action="go" data-to="#/album" aria-label="返回收藏册">' + icon('back', 20) + '</button>' +
    '<div><p class="eyebrow">' + list.length + ' 张 · 第 ' + (page + 1) + ' / ' + total + ' 翻</p>' +
    '<h1 class="page-title">' + esc(def.label) + '</h1></div></div>' +
    '<div class="head-actions">' +
    '<button class="icon-btn" data-action="album-settings" data-value="' + t + '" aria-label="册子设置">' + icon('gear', 18) + '</button>' +
    '<button class="icon-btn" data-action="yearbook-open" data-value="' + t + '" aria-label="年度档案">' + icon('stamp', 19) + '</button>' +
    '</div></header>';

  html += '<div class="bk-bar"><span>' + (cfg.order === 'new' ? '最新优先' : '顺序入册') +
    ' · 每页 ' + m.per + ' 张' + (m.single ? '' : ' · 双页') + '</span>' +
    '<span>' + (isTicketType(t) ? (ticketMode(t) ? '票根模式' : '卡片模式') : '卡片模式') + '</span></div>';

  if (!list.length) {
    return html + emptyState('·', '这一册还没有内容', '记一条' + def.label + '，它就会入册。',
      '<button class="btn btn-primary btn-sm" data-action="new-work" data-value="' + t + '">＋ 记录一条</button>');
  }

  html += '<div class="bk' + (m.single ? ' is-single' : '') + (m.tMode ? ' is-ticket' : '') + '" id="bk" data-album="' + cfg.style + '" data-type="' + t + '">' +
    '<div class="bk-spread">' +
    '<div class="bk-page left">' + pageHTML(list, page * m.perView, m.per, t) + '</div>' +
    (m.single ? '' : '<div class="bk-page right">' + pageHTML(list, page * m.perView + m.per, m.per, t) + '</div>') +
    '<div class="bk-leaf"></div>' +
    '</div>' +
    '<button class="bk-mark" data-action="book-jump" aria-label="快速翻阅">' +
    '<span>' + (page >= total - 1 && total > 1 ? '开头' : '末尾') + '</span></button>' +
    '<button class="bk-nav prev" data-action="book-prev" aria-label="上一页"' + (page === 0 ? ' disabled' : '') + '>' + icon('left', 20) + '</button>' +
    '<button class="bk-nav next" data-action="book-next" aria-label="下一页"' + (page >= total - 1 ? ' disabled' : '') + '>' + icon('right', 20) + '</button>' +
    '</div>';

  html += '<div class="book-ins" id="book-ins"></div>';
  return html;
}

export function bookFlip(dir) {
  const el = document.getElementById('bk');
  if (!el || el.dataset.flipping) return;
  const type = el.dataset.type;
  const m = pageMetrics(type);
  const cfg = albumCfg();
  const list = bookList(type);
  const total = Math.max(1, Math.ceil(list.length / m.perView));
  const i = ui.album.page;
  const target = i + dir;
  if (target < 0 || target >= total) return;

  const leaf = el.querySelector('.bk-leaf');
  if (!leaf) { setPage(type, target); return; }

  let front;
  let back;
  if (m.single) {
    const leftEl = el.querySelector('.bk-page.left');
    if (leftEl) leftEl.innerHTML = pageHTML(list, target * m.perView, m.per, type);
    if (dir > 0) {
      front = pageHTML(list, i * m.perView, m.per, type);
      back = pageHTML(list, target * m.perView, m.per, type);
      leaf.className = 'bk-leaf is-next';
    } else {
      front = pageHTML(list, target * m.perView, m.per, type);
      back = pageHTML(list, i * m.perView, m.per, type);
      leaf.className = 'bk-leaf is-prev';
    }
  } else if (dir > 0) {
    front = pageHTML(list, i * m.perView + m.per, m.per, type);
    back = pageHTML(list, (i + 1) * m.perView, m.per, type);
    leaf.className = 'bk-leaf is-next';
  } else {
    front = pageHTML(list, (i - 1) * m.perView + m.per, m.per, type);
    back = pageHTML(list, i * m.perView, m.per, type);
    leaf.className = 'bk-leaf is-prev';
  }

  leaf.innerHTML = '<div class="leaf-face front">' + front + '</div>' +
    '<div class="leaf-face back">' + back + '</div>';
  el.dataset.flipping = '1';
  requestAnimationFrame(() => leaf.classList.add('go'));
  playFlipSound(cfg.sound);

  setTimeout(() => {
    setPage(type, target);
  }, 620);
}

function setPage(type, page) {
  ui.album.page = page;
  const pos = Object.assign({}, pref('album.pos') || {});
  pos[type] = page;
  pref('album.pos', pos);
  renderBook();
}

function renderBook() {
  const type = ui.album.type;
  const view = document.getElementById('view');
  if (!view) return;
  const y = window.scrollY;
  view.innerHTML = '<div class="page">' + albumBookView(type) + '</div>';
  window.scrollTo(0, y);
  maybeInsert();
}

/* ---------------- 音效（WebAudio 合成，无外部资源） ---------------- */

let audioCtx = null;

function tone(freq, dur, gain, type, delay) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!audioCtx) audioCtx = new AC();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const t0 = audioCtx.currentTime + (delay || 0);
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type || 'triangle';
    o.frequency.setValueAtTime(freq, t0);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g);
    g.connect(audioCtx.destination);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  } catch (e) { /* 静默失败 */ }
}

export function playFlipSound(on) {
  if (!on) return;
  tone(760, 0.05, 0.035, 'triangle', 0);
  tone(420, 0.07, 0.028, 'triangle', 0.05);
}

function playSettleSound(on) {
  if (!on) return;
  tone(150, 0.16, 0.09, 'sine', 0);
  tone(1500, 0.04, 0.03, 'square', 0.02);
}

/* ---------------- 新卡入册演出 ---------------- */

let insPlaying = false;

function pendingWork() {
  const base = Number(pref('album.baseline')) || 0;
  if (!base) {
    const seen0 = Object.assign({}, pref('album.seen') || {});
    liveWorks().forEach((w) => { seen0[w.id] = Date.now(); });
    pref('album.seen', seen0);
    pref('album.baseline', Date.now());
    return null;
  }
  const seen = pref('album.seen') || {};
  const list = liveWorks().filter((w) => new Date(w.createdAt).getTime() > base)
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  for (const w of list) if (!seen[w.id]) return w;
  return null;
}

function markSeen(id) {
  const seen = Object.assign({}, pref('album.seen') || {});
  seen[id] = Date.now();
  const keys = Object.keys(seen);
  if (keys.length > 400) {
    keys.sort((a, b) => seen[a] - seen[b]).slice(0, keys.length - 400).forEach((k) => { delete seen[k]; });
  }
  pref('album.seen', seen);
}

export function maybeInsert() {
  if (ui.route.name !== 'album' || !ui.route.id) return;
  if (insPlaying) return;
  const w = pendingWork();
  if (!w) return;
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    markSeen(w.id);
    return;
  }
  const host = document.getElementById('book-ins');
  if (!host) return;
  const tier = w.rating >= 9 ? 3 : (w.rating > 8 ? 2 : 1);
  insPlaying = true;
  host.className = 'book-ins is-on tier-' + tier;
  const cover = coverUrl(w);
  host.innerHTML = '<div class="ins-veil"></div>' +
    '<div class="ins-stage"><div class="ins-slot"></div>' +
    '<div class="ins-card" style="--cc:' + coverColor(w.title) + '">' +
    (cover ? '<img src="' + esc(cover) + '" alt="">' : '<span class="ph">' + esc(initials(w.title)) + '</span>') +
    '</div>' +
    (tier === 1 ? '<span class="ins-zap z1">✦</span><span class="ins-zap z2">✦</span>' : '') +
    '<span class="ins-cap">' + esc(w.title) + ' · 已入册</span></div>';
  setTimeout(() => {
    host.className = 'book-ins';
    host.innerHTML = '';
    insPlaying = false;
    if (ui.route.name === 'album' && ui.route.id) markSeen(w.id);
  }, 2600);
  setTimeout(() => playSettleSound(albumCfg().sound), 1500);
}

/* ---------------- 票根查看与保存 ---------------- */

export function openTicket(workId) {
  const w = getWork(workId);
  if (!w) return;
  const cover = coverUrl(w);
  openModal({
    title: '',
    cls: 'ticket-modal',
    body: '<div class="tk-stage">' + ticketHTML(w) + '</div>',
    actions: [
      { label: '关闭', value: null, variant: 'ghost' },
      { label: '保存图片', value: 'save', variant: 'primary' }
    ]
  }).then((v) => {
    if (v !== 'save') return;
    saveTicketNode(w, cover);
  });
}

async function saveTicketNode(w, cover) {
  const node = document.querySelector('.tk-stage .tk');
  if (!node) return;
  toast('正在生成图片…');
  try {
    const canvas = await drawTicketCanvas(w, cover);
    canvas.toBlob((blob) => {
      if (!blob) { toast('生成失败', 'error'); return; }
      downloadBlob(blob, 'ticket-' + (w.title || 'stub') + '-' + (finishedDate(w) || '').slice(0, 10) + '.png');
      toast('票根已保存');
    }, 'image/png');
  } catch (e) {
    toast('生成失败，可直接截图保存', 'error');
  }
}

/* 用 Canvas 绘制票根，避免引入外部截图库 */
function drawTicketCanvas(w, cover) {
  return new Promise((resolve, reject) => {
    const d = detailsOf(w.id);
    const isStage = typeDef(w.type).group === 'stage';
    const W = 620;
    const H = 1102;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const ctx = cv.getContext('2d');
    const paper = '#F4F1EA';
    const ink = '#14110F';
    ctx.fillStyle = paper;
    ctx.fillRect(0, 0, W, H);

    const P = 34;
    ctx.fillStyle = ink;
    ctx.font = '700 15px -apple-system, "PingFang SC", sans-serif';
    ctx.fillText(isStage ? 'PERFORMANCE · 观演纪念' : 'CINEMA · 观影纪念', P, 62);
    ctx.font = '600 14px ui-monospace, monospace';
    ctx.textAlign = 'right';
    let serial = 0;
    const s = String(w.id || w.title || '');
    for (let i = 0; i < s.length; i++) serial = (serial * 31 + s.charCodeAt(i)) % 100000;
    ctx.fillText('NO. ' + ('00000' + serial).slice(-5), W - P, 62);
    ctx.textAlign = 'left';
    ctx.fillRect(P, 74, W - P * 2, 3);

    /* 主图 */
    const imgY = 96;
    const imgH = 250;
    if (cover) {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => { drawRest(img); };
        img.onerror = () => { drawRest(null); };
        img.src = cover;
        return;
      } catch (e) { /* 继续无图分支 */ }
    }
    drawRest(null);

    function drawRest(img) {
      if (img) {
        const scale = Math.max((W - P * 2) / img.width, imgH / img.height);
        const iw = img.width * scale;
        const ih = img.height * scale;
        ctx.save();
        ctx.beginPath();
        ctx.rect(P, imgY, W - P * 2, imgH);
        ctx.clip();
        ctx.drawImage(img, P + (W - P * 2 - iw) / 2, imgY + (imgH - ih) / 2, iw, ih);
        ctx.restore();
      } else {
        ctx.fillStyle = '#211B40';
        ctx.fillRect(P, imgY, W - P * 2, imgH);
        for (let i = 0; i < 3; i++) {
          ctx.fillStyle = i === 1 ? '#4A3B6E' : '#2B2450';
          ctx.fillRect(P + i * (W - P * 2) / 3 + 2, imgY, (W - P * 2) / 3 - 4, imgH);
        }
      }
      ctx.fillStyle = ink;
      ctx.fillRect(P, imgY + imgH - 22, 84, 22);
      ctx.fillStyle = paper;
      ctx.font = '700 11px -apple-system, sans-serif';
      ctx.fillText(isStage ? 'STAGE' : 'STILL', P + 10, imgY + imgH - 6);

      /* 标题 */
      let y = imgY + imgH + 52;
      ctx.fillStyle = ink;
      ctx.font = '700 38px "Songti SC", "Noto Serif SC", serif';
      const title = String(w.title || '').slice(0, 14);
      ctx.fillText(title, P, y);
      y += 30;
      if (w.originalTitle) {
        ctx.font = '400 15px -apple-system, sans-serif';
        ctx.fillStyle = 'rgba(20,17,15,.62)';
        ctx.fillText(String(w.originalTitle).slice(0, 40), P, y);
        y += 24;
      }
      ctx.font = '400 15px -apple-system, sans-serif';
      ctx.fillStyle = 'rgba(20,17,15,.78)';
      ctx.fillText([w.creator, w.year].filter(Boolean).join(' / ') || '—', P, y);
      y += 26;

      /* 数据格 */
      const date = finishedDate(w) || (w.createdAt || '').slice(0, 10);
      const cells = [
        ['DATE', date ? date.replace(/-/g, '.') : '—'],
        ['TIME', [d.runtime ? d.runtime + ' MIN' : '', isStage && d.shows ? '第 ' + d.shows + ' 场' : ''].filter(Boolean).join(' · ') || '—'],
        [isStage ? 'THEATRE' : 'VENUE', (isStage ? d.venue : (d.cinema || d.watchPlace)) || '—'],
        [isStage ? 'SEAT' : 'FORMAT', (isStage ? d.seat : d.watchPlace) || '—']
      ];
      const gw = (W - P * 2) / 2;
      const gh = 66;
      const gy = y;
      ctx.fillRect(P, gy, W - P * 2, 3);
      cells.forEach((c, i) => {
        const cx = P + (i % 2) * gw;
        const cy = gy + 3 + Math.floor(i / 2) * gh;
        ctx.fillStyle = paper;
        ctx.fillRect(cx + 1, cy + 1, gw - 2, gh - 2);
        ctx.fillStyle = 'rgba(20,17,15,.56)';
        ctx.font = '600 9px -apple-system, sans-serif';
        ctx.fillText(c[0], cx + 12, cy + 22);
        ctx.fillStyle = ink;
        ctx.font = '600 17px -apple-system, sans-serif';
        ctx.fillText(String(c[1]).slice(0, 18), cx + 12, cy + 46);
        ctx.strokeStyle = 'rgba(20,17,15,.14)';
        ctx.strokeRect(cx + 1, cy + 1, gw - 2, gh - 2);
      });
      const gEnd = gy + 3 + gh * 2;
      ctx.fillStyle = ink;
      ctx.fillRect(P, gEnd, W - P * 2, 3);

      /* 备注 */
      let ny = gEnd + 34;
      const note = String(w.note || '').replace(/\s+/g, ' ').slice(0, 78);
      if (note) {
        ctx.fillStyle = 'rgba(20,17,15,.8)';
        ctx.font = '400 14px -apple-system, sans-serif';
        ctx.fillText(note, P, ny);
        ny += 20;
      }

      /* 撕口 */
      const tearY = H - 150;
      ctx.strokeStyle = 'rgba(20,17,15,.42)';
      ctx.setLineDash([8, 7]);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(P, tearY);
      ctx.lineTo(W - P, tearY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = paper;
      ctx.beginPath();
      ctx.arc(0, tearY, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(W, tearY, 16, 0, Math.PI * 2);
      ctx.fill();

      /* 条码 */
      let bx = P;
      ctx.fillStyle = ink;
      for (let i = 0; i < 70 && bx < W - P - 150; i++) {
        const wd = 1 + ((i * 7 + (i % 5) * 3) % 3);
        ctx.fillRect(bx, H - 118, wd, 56);
        bx += wd + ((i % 4 === 0) ? 2 : 1);
      }
      ctx.font = '600 10px -apple-system, sans-serif';
      ctx.fillText('ADMIT ONE', W - P - 92, H - 78);
      ctx.textAlign = 'right';
      ctx.font = '700 18px ui-monospace, monospace';
      ctx.fillText(String(w.rating ? ratingShort(w.rating) : '—'), W - P, H - 52);
      ctx.textAlign = 'left';

      /* 年份水印 */
      ctx.fillStyle = 'rgba(20,17,15,.07)';
      ctx.font = '700 150px ui-monospace, monospace';
      ctx.fillText(String(w.year || date.slice(0, 4) || ''), W - 190, H - 210);

      resolve(cv);
    }
  });
}

/* ---------------- 册子设置 ---------------- */

export function openAlbumSettings(type) {
  const t = TYPE_MAP[type] ? type : (liveWorks()[0] ? liveWorks()[0].type : 'book');
  const cfg = albumCfg();
  function row(key, label, opts) {
    return '<div class="set-row"><span class="set-label">' + label + '</span>' +
      '<div class="set-opts">' + opts.map((o) => {
        const [v, txt, on] = o;
        return '<button class="set-opt' + (on ? ' is-on' : '') + '" data-action="album-set" ' +
          'data-key="' + key + '" data-value="' + esc(v) + '">' + esc(txt) + '</button>';
      }).join('') + '</div></div>';
  }
  const body = '<div class="bk-settings">' +
    row('per', '每页张数', [[1, '1 张', cfg.per === 1], [2, '2 张', cfg.per === 2], [4, '4 张', cfg.per === 4]]) +
    row('order', '入册顺序', [['seq', '顺序入册', cfg.order === 'seq'], ['new', '最新优先', cfg.order === 'new']]) +
    row('sound', '入册音效', [['1', '开启', cfg.sound], ['0', '关闭', !cfg.sound]]) +
    (isTicketType(t)
      ? row('ticket', '本册显示', [
        ['stub', '纪念票根', ticketMode(t)],
        ['card', '标准卡', !ticketMode(t)]
      ])
      : '') +
    '</div>';

  openModal({
    title: '册子设置',
    desc: typeDef(t).label + ' · 只影响收藏册的翻阅方式',
    body,
    actions: [{ label: '完成', value: null, variant: 'primary' }]
  });
}

/* ---------------- 书脊背景 ---------------- */

export function openSpinePicker() {
  const types = orderedTypes().filter((t) => worksByType(t.id).length);
  if (!types.length) { toast('还没有入册的作品'); return; }
  const rows = types.map((t) => {
    const src = spineArt(t.id);
    return '<div class="sa-row"><span class="sa-prev" style="--tc:' + t.color + '">' +
      (src ? '<img src="' + esc(src) + '" alt="">' : '<i>' + esc(t.label.slice(0, 1)) + '</i>') +
      '</span><span class="sa-name">' + esc(t.label) + '</span>' +
      '<label class="btn btn-ghost btn-sm sa-pick">' + (src ? '换图' : '选图') +
      '<input type="file" accept="image/*" data-spine="' + t.id + '" hidden></label>' +
      (src ? '<button class="btn btn-ghost btn-sm" data-action="spine-clear" data-value="' + t.id + '">移除</button>' : '') +
      '</div>';
  }).join('');

  openModal({
    title: '书脊背景',
    desc: '给每本册子的书脊换一张图，竖图效果最好；不选就用类型色。图片只存在这台设备。',
    cls: 'sa-modal',
    body: '<div class="sa-list">' + rows + '</div>',
    actions: [{ label: '完成', value: null, variant: 'primary' }],
    onMount: (root) => {
      root.querySelectorAll('[data-spine]').forEach((input) => {
        input.addEventListener('change', async () => {
          const file = input.files && input.files[0];
          input.value = '';
          if (!file) return;
          toast('处理中…');
          try {
            const id = await saveSpineArt(file);
            if (!id) { toast('保存失败', 'error'); return; }
            const map = Object.assign({}, setting('spineArt', {}) || {});
            map[input.dataset.spine] = id;
            await saveSetting('spineArt', map);
            emit();
          } catch (e) {
            toast(e.message || '图片读取失败', 'error');
          }
        });
      });
    }
  });
}

/* ---------------- 动作 ---------------- */

export const actions = {
  'album-open': (el) => {
    if (Date.now() - lastDragAt < 600) return;
    go('#/album/' + el.dataset.value);
  },
  'album-type-new': () => openNewTypeModal('#/album'),
  'album-settings': (el) => openAlbumSettings(el.dataset.value),
  'album-set': (el) => {
    const key = el.dataset.key;
    const val = el.dataset.value;
    if (key === 'ticket') {
      const t = ui.album.type || (liveWorks()[0] && liveWorks()[0].type) || 'movie';
      const map = Object.assign({}, pref('album.ticket') || {});
      map[t] = val;
      pref('album.ticket', map);
      document.querySelectorAll('[data-action="album-set"][data-key="ticket"]').forEach((b) => {
        b.classList.toggle('is-on', b.dataset.value === val);
      });
      renderBook();
      return;
    }
    if (key === 'per') saveCfg({ per: Number(val) });
    else if (key === 'order') saveCfg({ order: val });
    else if (key === 'sound') saveCfg({ sound: val === '1' });

    document.querySelectorAll('[data-action="album-set"][data-key="' + key + '"]').forEach((b) => {
      b.classList.toggle('is-on', b.dataset.value === val);
    });
    if (ui.route.name === 'album' && ui.route.id) renderBook();
    else if (ui.route.name === 'album') emit();
  },
  'book-next': () => bookFlip(1),
  'book-prev': () => bookFlip(-1),
  'book-jump': () => {
    const m = pageMetrics(ui.album.type);
    const total = Math.max(1, Math.ceil(bookList(ui.album.type).length / m.perView));
    setPage(ui.album.type, ui.album.page >= total - 1 ? 0 : total - 1);
  },
  'spine-art': () => openSpinePicker(),
  'spine-clear': async (el) => {
    const map = Object.assign({}, setting('spineArt', {}) || {});
    delete map[el.dataset.value];
    await saveSetting('spineArt', map);
    emit();
    toast('已恢复类型色');
  },
  ticket: (el) => openTicket(el.dataset.id)
};

/* 供外部调用 */
