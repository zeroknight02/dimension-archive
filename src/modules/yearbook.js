/* ==========================================================
   次元簿 · 年度档案（保留设计）
   按册子（作品类型）归档到年份：年份跨页、印章、
   月度足迹、本年目录、年度报告卡。
   数据全部来自 work + experience_records 实时计算，
   不生成独立统计副本（说明书 2.3 / 10.x）。
   ========================================================== */

import { worksByType, detailsOf, experiencesOf, finishedDate, coverUrl, setting, saveSetting } from '../core/repo.js';
import { TYPE_MAP, typeDef, statusBucket } from '../core/schema.js';
import { ui, go } from '../core/state.js';
import { icon, toast, emptyState } from '../core/ui.js';
import { esc, ratingShort, initials, coverColor, fmtHours, ratingText } from '../core/format.js';
import { downloadBlob } from '../core/backup.js';

function hoursOf(w) {
  let h = 0;
  experiencesOf(w.id).forEach((e) => {
    const p = e.progress || {};
    if (p.hours) h += Number(p.hours) || 0;
  });
  if (!h) {
    const d = detailsOf(w.id);
    h = Number(d.playTime) || 0;
  }
  return h;
}

function yearOf(w) {
  const d = finishedDate(w);
  return d ? d.slice(0, 4) : 'earlier';
}

function groupsOf(type) {
  const map = {};
  worksByType(type).forEach((w) => {
    const y = yearOf(w);
    (map[y] = map[y] || []).push(w);
  });
  return Object.keys(map).sort((a, b) => {
    if (a === 'earlier') return -1;
    if (b === 'earlier') return 1;
    return Number(b) - Number(a);
  }).map((k) => ({ key: k, list: map[k] }));
}

function statsOf(list) {
  const done = list.filter((w) => statusBucket(w.status) === 'done');
  const hours = list.reduce((a, w) => a + hoursOf(w), 0);
  const rated = list.filter((w) => w.rating > 0);
  const avg = rated.length ? rated.reduce((a, w) => a + w.rating, 0) / rated.length : 0;
  const types = {};
  list.forEach((w) => { types[w.type] = (types[w.type] || 0) + 1; });
  const months = new Array(12).fill(0);
  list.forEach((w) => {
    const d = finishedDate(w) || (w.createdAt || '').slice(0, 10);
    const m = Number(d.slice(5, 7)) - 1;
    if (m >= 0 && m < 12) months[m]++;
  });
  let topM = 0;
  months.forEach((n, i) => { if (n > months[topM]) topM = i; });
  const best = list.filter((w) => w.rating > 0).sort((a, b) => b.rating - a.rating)[0] || list[0];
  const longest = list.slice().sort((a, b) => hoursOf(b) - hoursOf(a))[0];
  return {
    n: list.length,
    done: done.length,
    hours,
    avg,
    typeN: Object.keys(types).length,
    months,
    topM,
    topMN: months[topM],
    best,
    longest,
    rate: list.length ? Math.round(done.length / list.length * 100) : 0
  };
}

function stampCandidates(list) {
  const st = statsOf(list);
  const out = [
    { label: 'COMPLETED', big: String(st.done), unit: '部完成', color: '#C8102E' },
    { label: 'TIME SPENT', big: fmtHours(st.hours), unit: '小时', color: '#1A1A1A' },
    { label: 'FINISH RATE', big: st.rate + '%', unit: '完成率', color: '#1F5FBF' },
    { label: 'VARIETY', big: String(st.typeN), unit: '种类型', color: '#0E7C66' },
    { label: 'BUSIEST', big: (st.topM + 1) + '月', unit: st.topMN + ' 部', color: '#B26A00' }
  ];
  if (st.best) out.push({ label: 'HIGHEST', big: ratingShort(st.best.rating) || '—', unit: String(st.best.title).slice(0, 6), color: '#6B4FBB' });
  if (st.longest && hoursOf(st.longest)) out.push({ label: 'LONGEST', big: fmtHours(hoursOf(st.longest)), unit: String(st.longest.title).slice(0, 6), color: '#8A3B12' });
  return out;
}

function stampSet(type, yearKey, list) {
  const cands = stampCandidates(list);
  const all = setting('ybStamp', {}) || {};
  const sk = type + ':' + yearKey;
  const off = Number(all[sk]) || 0;
  const out = [];
  for (let i = 0; i < 3 && i < cands.length; i++) out.push(cands[(off + i) % cands.length]);
  return out;
}

function artBox(w, cls) {
  const cover = coverUrl(w);
  return '<span class="' + cls + '" style="--cc:' + coverColor(w.title) + '">' +
    (cover ? '<img src="' + esc(cover) + '" alt="" loading="lazy">' : '<span class="ph">' + esc(initials(w.title)) + '</span>') +
    '</span>';
}

export function yearbookView(type) {
  const t = TYPE_MAP[type] ? type : (ui.album.type || 'book');
  const def = typeDef(t);
  const groups = groupsOf(t);

  let html = '<header class="page-head">' +
    '<div class="head-left"><button class="icon-btn" data-action="back" aria-label="返回">' + icon('back', 20) + '</button>' +
    '<div><p class="eyebrow">' + esc(def.label) + ' · ' + groups.length + ' 个年份</p>' +
    '<h1 class="page-title">年度档案</h1></div></div>' +
    '<div class="head-actions"><button class="icon-btn" data-action="album-open" data-value="' + t + '" aria-label="回到册子">' + icon('book', 19) + '</button></div>' +
    '</header>';

  if (!groups.length) {
    return html + emptyState('·', def.label + '还没有可归档的内容', '记几条' + def.label + '，这里会按完成年份排成一本年鉴。',
      '<button class="btn btn-primary btn-sm" data-action="new-work" data-value="' + t + '">＋ 记录一条</button>');
  }

  const curKey = ui.yearbook.year || groups[0].key;
  let idx = 0;
  groups.forEach((g, i) => { if (g.key === curKey) idx = i; });
  const g = groups[idx];

  return html + '<div class="yb-year" data-year="' + esc(g.key) + '">' +
    '<div class="yb-tabs">' +
    (idx > 0 ? '<button class="yb-tab-arrow" data-action="yb-year" data-value="' + esc(groups[idx - 1].key) + '" aria-label="上一年">' + icon('left', 16) + '</button>' : '') +
    groups.map((x, i) => '<button class="yb-tab' + (i === idx ? ' is-on' : '') + '" data-action="yb-year" data-value="' + esc(x.key) + '">' +
      (x.key === 'earlier' ? '更早' : esc(x.key)) + '</button>').join('') +
    (idx < groups.length - 1 ? '<button class="yb-tab-arrow" data-action="yb-year" data-value="' + esc(groups[idx + 1].key) + '" aria-label="下一年">' + icon('right', 16) + '</button>' : '') +
    '</div>' +
    sheetHTML(t, g, idx) +
    monthSheet(g, t) +
    indexSheet(g) +
    reportSheet(t, g) +
    '</div>';
}

function sheetHTML(t, g, idx) {
  const st = statsOf(g.list);
  const stamps = stampSet(t, g.key, g.list);
  const label = g.key === 'earlier' ? '更早' : g.key;

  const left = '<div class="yb-left">' +
    (g.key !== 'earlier' ? '<span class="yb-redstamp">YEAR<br>REVIEW</span>' : '') +
    '<p class="yb-kicker">YEAR IN REVIEW</p>' +
    '<div class="yb-yearnum">' + esc(label) + '</div>' +
    '<div class="yb-statgrid">' +
    '<div><b>' + st.n + '</b><span>收录</span></div>' +
    '<div><b>' + st.done + '</b><span>完成</span></div>' +
    '<div><b>' + fmtHours(st.hours) + '</b><span>小时</span></div>' +
    '<div><b>' + (st.avg ? ratingShort(st.avg) : '—') + '</b><span>均分</span></div>' +
    '</div>' +
    '<div class="yb-stamps">' + stamps.map((s, i) =>
      '<button class="yb-seal s' + i + '" data-action="yb-stamp" data-value="' + esc(g.key) + '" ' +
      'style="--sc:' + s.color + '" title="换一枚"><span class="seal-in"><b>' + esc(s.big) + '</b>' +
      '<i>' + esc(s.unit) + '</i><em>' + esc(s.label) + '</em></span></button>').join('') +
    '</div>' +
    '<p class="yb-hint">点印章换一枚 · 数据全部按完成日期归档</p>' +
    '</div>';

  const favs = g.list.filter((w) => w.rating > 0)
    .sort((a, b) => b.rating - a.rating || hoursOf(b) - hoursOf(a))
    .slice(0, 3);

  const right = '<div class="yb-right">' +
    '<p class="yb-kicker">FAVORITES OF THE YEAR</p>' +
    (favs.length ? '<div class="yb-favs">' + favs.map((w, i) =>
      '<button class="yb-fav r' + (i + 1) + '" data-action="open-work" data-id="' + w.id + '">' +
      '<span class="yb-fav-rank">0' + (i + 1) + '</span>' +
      artBox(w, 'yb-fav-art') +
      '<span class="yb-fav-main"><b>' + esc(w.title) + '</b>' +
      '<i>' + esc(typeDef(w.type).label) + ' · ' + esc(finishedDate(w) || '—') + '</i>' +
      '<span class="yb-fav-foot"><em>' + ratingText(w.rating) + '</em>' +
      '<span class="yb-pips lv' + Math.min(5, Math.max(1, Math.ceil((w.rating || 0) / 2))) +
      (w.rating >= 9.5 ? ' is-shiny' : '') + '">' +
      new Array(Math.min(5, Math.max(1, Math.ceil((w.rating || 0) / 2))) + 1).join('<i></i>') +
      '</span>' + (!coverUrl(w) ? '<span class="yb-nocover">无封面</span>' : '') +
      '</span></span>' +
      (i === 0 ? '<span class="yb-no1">FAVORITE OF THE YEAR · No.1</span>' : '') +
      '</button>').join('') + '</div>'
      : '<p class="yb-empty">这一年还没有打分的作品。</p>') +
    '</div>';

  return '<section class="yb-sheet yb-spread is-live">' + left + right + '</section>';
}

function monthSheet(g, t) {
  const st = statsOf(g.list);
  const cur = ui.yearbook.month;
  let listHTML = '<p class="yb-hint">点一个月，展开当月入册的全部。</p>';
  if (cur) {
    const items = g.list.filter((w) => {
      const d = finishedDate(w) || (w.createdAt || '').slice(0, 10);
      return Number(d.slice(5, 7)) === cur;
    });
    listHTML = '<div class="yb-monthlist"><p class="yb-sub">' + cur + ' 月 · ' + items.length + ' 条</p>' +
      (items.length ? items.map((w) =>
        '<button class="yb-row" data-action="open-work" data-id="' + w.id + '">' +
        artBox(w, 'yb-row-art') +
        '<span class="yb-row-main"><b>' + esc(w.title) + '</b>' +
        '<i>' + esc(typeDef(w.type).label) + ' · ' + esc(finishedDate(w) || '—') + '</i></span>' +
        '<em>' + (w.rating ? ratingShort(w.rating) : '') + '</em></button>').join('')
        : '<p class="yb-empty">这个月没有记录。</p>') + '</div>';
  }

  return '<section class="yb-sheet">' +
    '<p class="yb-kicker">MONTH BY MONTH · 月份足迹</p>' +
    '<div class="yb-months">' + st.months.map((n, i) =>
      '<button class="yb-month' + (n ? ' has' : '') + (cur === i + 1 ? ' is-on' : '') +
      '" data-action="yb-month" data-value="' + (i + 1) + '">' +
      '<b>' + (i + 1) + '</b>' +
      '<span class="yb-dots">' + new Array(Math.min(n, 5) + 1).join('<i></i>') + '</span>' +
      '<em>' + (n || '') + '</em></button>').join('') +
    '</div>' + listHTML + '</section>';
}

const IDX = 24;

function indexSheet(g) {
  const sorted = g.list.slice().sort((a, b) => String(finishedDate(b)).localeCompare(String(finishedDate(a))));
  const max = Math.max(1, Math.ceil(sorted.length / IDX));
  const page = Math.min(Math.max(1, ui.yearbook.index || 1), max);
  const slice = sorted.slice((page - 1) * IDX, page * IDX);

  return '<section class="yb-sheet">' +
    '<div class="yb-indexhead"><p class="yb-kicker">INDEX · 本年目录</p>' +
    (max > 1 ? '<div class="yb-pager">' +
      '<button data-action="yb-index" data-value="' + (page - 1) + '"' + (page <= 1 ? ' disabled' : '') + '>' + icon('left', 13) + '</button>' +
      '<span>' + page + ' / ' + max + '</span>' +
      '<button data-action="yb-index" data-value="' + (page + 1) + '"' + (page >= max ? ' disabled' : '') + '>' + icon('right', 13) + '</button>' +
      '</div>' : '') +
    '</div>' +
    '<div class="yb-index">' + slice.map((w, i) =>
      '<button class="yb-row" data-action="open-work" data-id="' + w.id + '">' +
      '<span class="yb-row-n">' + ((page - 1) * IDX + i + 1) + '</span>' +
      '<span class="yb-row-main"><b>' + esc(w.title) + '</b>' +
      '<i>' + esc(typeDef(w.type).label) + ' · ' + esc(w.creator || '—') + '</i></span>' +
      '<span class="yb-row-date">' + esc(finishedDate(w) || '—') + '</span>' +
      '<em>' + (w.rating ? ratingShort(w.rating) : '') + '</em></button>').join('') +
    '</div></section>';
}

function reportSheet(t, g) {
  return '<section class="yb-sheet yb-report">' +
    '<div class="yb-indexhead"><p class="yb-kicker">REPORT CARD · 年度报告卡</p>' +
    '<button class="btn btn-ghost btn-sm" data-action="yb-report" data-value="' + esc(g.key) + '">保存图片</button></div>' +
    '<p class="yb-hint">把 ' + esc(g.key === 'earlier' ? '更早' : g.key) + ' 年「' + esc(typeDef(t).label) +
    '」整理成一张长图，存到相册或发给朋友都不会带上其它记录。</p>' +
    '<div class="yb-report-ops"><button class="btn btn-primary btn-sm" data-action="yb-report" data-value="' + esc(g.key) + '">' +
    icon('download', 14) + ' 生成并保存</button></div></section>';
}

/* ---------------- 报告卡绘制 ---------------- */

async function saveReport(type, yearKey) {
  const groups = groupsOf(type);
  const g = groups.find((x) => x.key === yearKey);
  if (!g) { toast('这一年的数据不见了', 'error'); return; }
  toast('正在生成图片…');
  const st = statsOf(g.list);
  const W = 760;
  const H = 1080;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');

  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#17132F');
  grad.addColorStop(0.55, '#211B40');
  grad.addColorStop(1, '#2A2250');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  /* 星点 */
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = 'rgba(242,237,255,' + (0.04 + Math.random() * 0.18) + ')';
    const r = Math.random() < 0.9 ? 1.2 : 1.9;
    ctx.beginPath();
    ctx.arc(Math.random() * W, Math.random() * H, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const P = 58;
  ctx.fillStyle = 'rgba(242,237,255,.56)';
  ctx.font = '600 13px -apple-system, sans-serif';
  ctx.fillText('DIMENSION ARCHIVE · 次元簿', P, 74);
  ctx.fillStyle = '#F2D79B';
  ctx.font = '600 12px -apple-system, sans-serif';
  ctx.fillText(typeDef(type).label + ' · YEAR IN REVIEW', P, 100);

  ctx.fillStyle = '#F2EDFF';
  ctx.font = '700 118px ui-monospace, monospace';
  ctx.fillText(yearKey === 'earlier' ? '—' : yearKey, P - 4, 218);

  ctx.fillStyle = 'rgba(242,237,255,.14)';
  ctx.fillRect(P, 250, W - P * 2, 1);

  const cells = [
    ['收录', String(st.n)],
    ['完成', String(st.done)],
    ['小时', fmtHours(st.hours)],
    ['均分', st.avg ? ratingShort(st.avg) : '—']
  ];
  cells.forEach((c, i) => {
    const x = P + i * ((W - P * 2) / 4);
    ctx.fillStyle = '#F2EDFF';
    ctx.font = '700 40px ui-monospace, monospace';
    ctx.fillText(c[1], x, 330);
    ctx.fillStyle = 'rgba(242,237,255,.5)';
    ctx.font = '400 13px -apple-system, sans-serif';
    ctx.fillText(c[0], x, 356);
  });

  const favs = g.list.filter((w) => w.rating > 0)
    .sort((a, b) => b.rating - a.rating).slice(0, 3);
  ctx.fillStyle = 'rgba(242,237,255,.5)';
  ctx.font = '600 12px -apple-system, sans-serif';
  ctx.fillText('FAVORITES', P, 420);
  favs.forEach((w, i) => {
    const y = 452 + i * 64;
    ctx.fillStyle = 'rgba(242,237,255,.06)';
    ctx.fillRect(P, y, W - P * 2, 54);
    ctx.fillStyle = '#B9A2FF';
    ctx.font = '700 14px ui-monospace, monospace';
    ctx.fillText('0' + (i + 1), P + 16, y + 34);
    ctx.fillStyle = '#F2EDFF';
    ctx.font = '600 19px -apple-system, "PingFang SC", sans-serif';
    ctx.fillText(String(w.title).slice(0, 16), P + 60, y + 26);
    ctx.fillStyle = 'rgba(242,237,255,.5)';
    ctx.font = '400 12px -apple-system, sans-serif';
    ctx.fillText([typeDef(w.type).label, finishedDate(w)].filter(Boolean).join(' · '), P + 60, y + 45);
    ctx.fillStyle = '#F2EDFF';
    ctx.font = '700 18px ui-monospace, monospace';
    ctx.textAlign = 'right';
    ctx.fillText(ratingShort(w.rating), W - P - 16, y + 34);
    ctx.textAlign = 'left';
  });

  /* 月份条 */
  const baseY = 690;
  ctx.fillStyle = 'rgba(242,237,255,.5)';
  ctx.font = '600 12px -apple-system, sans-serif';
  ctx.fillText('MONTH BY MONTH', P, baseY - 18);
  const maxN = Math.max(1, ...st.months);
  st.months.forEach((n, i) => {
    const bw = (W - P * 2 - 11 * 8) / 12;
    const x = P + i * (bw + 8);
    const h = Math.round((n / maxN) * 96);
    ctx.fillStyle = n ? 'rgba(185,162,255,.82)' : 'rgba(242,237,255,.10)';
    ctx.fillRect(x, baseY + 96 - h, bw, Math.max(3, h));
    ctx.fillStyle = 'rgba(242,237,255,.42)';
    ctx.font = '400 10px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(String(i + 1), x + bw / 2, baseY + 114);
    ctx.textAlign = 'left';
  });

  ctx.fillStyle = 'rgba(242,237,255,.34)';
  ctx.font = '400 12px -apple-system, sans-serif';
  ctx.fillText('数据来自本机记录 · 仅供个人留存', P, H - 52);

  await new Promise((resolve) => setTimeout(resolve, 60));
  cv.toBlob((blob) => {
    if (!blob) { toast('生成失败', 'error'); return; }
    downloadBlob(blob, 'dimension-archive-' + (yearKey === 'earlier' ? 'early' : yearKey) + '-' + type + '.png');
    toast('报告卡已保存');
  }, 'image/png');
}

export const actions = {
  'yearbook-open': (el) => {
    ui.yearbook = { type: el.dataset.value, year: '', month: 0, index: 1 };
    go('#/yearbook/' + el.dataset.value);
  },
  'yb-year': (el) => {
    ui.yearbook.year = el.dataset.value;
    ui.yearbook.month = 0;
    ui.yearbook.index = 1;
    go('#/yearbook/' + ui.yearbook.type);
  },
  'yb-month': (el) => {
    const m = Number(el.dataset.value);
    ui.yearbook.month = ui.yearbook.month === m ? 0 : m;
    go('#/yearbook/' + ui.yearbook.type);
  },
  'yb-index': (el) => {
    ui.yearbook.index = Number(el.dataset.value);
    go('#/yearbook/' + ui.yearbook.type);
  },
  'yb-stamp': async (el) => {
    const all = Object.assign({}, setting('ybStamp', {}) || {});
    const sk = ui.yearbook.type + ':' + el.dataset.value;
    all[sk] = (Number(all[sk]) || 0) + 1;
    await saveSetting('ybStamp', all);
    go('#/yearbook/' + ui.yearbook.type);
  },
  'yb-report': (el) => saveReport(ui.yearbook.type, el.dataset.value)
};
