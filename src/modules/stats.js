/* ==========================================================
   次元簿 · 数据统计
   说明书 10.x / 2.3：所有数字从原始记录实时计算，
   不设硬编码演示数据，数据不足时不补造趋势。
   ========================================================== */

import { data, liveWorks, detailsOf, bucketOf } from '../core/repo.js';
import { GROUPS, typeDef } from '../core/schema.js';
import { ui } from '../core/state.js';
import { emptyState } from '../core/ui.js';
import { esc, fmtHours, ratingShort } from '../core/format.js';

function yearsOf() {
  const set = new Set();
  liveWorks().forEach((w) => { if (w.year) set.add(String(w.year)); });
  return [...set].sort().reverse();
}

function hoursOf(w) {
  let h = 0;
  data.experiences.filter((e) => e.workId === w.id && !e.deletedAt).forEach((e) => {
    if (e.progress && e.progress.hours) h += Number(e.progress.hours) || 0;
  });
  if (!h) h = Number(detailsOf(w.id).playTime) || 0;
  return h;
}

function build() {
  const works = liveWorks();
  const bucket = { wish: 0, todo: 0, doing: 0, paused: 0, done: 0, dropped: 0, redoing: 0 };
  works.forEach((w) => { const b = bucketOf(w); bucket[b] = (bucket[b] || 0) + 1; });

  const byType = {};
  works.forEach((w) => { byType[w.type] = (byType[w.type] || 0) + 1; });

  const byGroup = {};
  works.forEach((w) => {
    const g = typeDef(w.type).group;
    byGroup[g] = (byGroup[g] || 0) + 1;
  });

  const ratings = new Array(10).fill(0);
  works.forEach((w) => {
    if (w.rating > 0) {
      const idx = Math.min(9, Math.max(0, Math.ceil(w.rating) - 1));
      ratings[idx]++;
    }
  });

  const now = new Date();
  const months = new Array(12).fill(0);
  works.forEach((w) => {
    const t = new Date(w.createdAt || '');
    if (isNaN(t.getTime())) return;
    if (t.getFullYear() === now.getFullYear()) months[t.getMonth()]++;
  });

  const hours = works.reduce((a, w) => a + hoursOf(w), 0);
  const rated = works.filter((w) => w.rating > 0);
  const avg = rated.length ? rated.reduce((a, w) => a + w.rating, 0) / rated.length : 0;

  /* 近 12 个月累计收藏曲线 */
  const curve = [];
  let total = 0;
  const sorted = works.slice().sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));
  const start = new Date(now.getFullYear(), now.getMonth() - 11, 1);
  const buckets = new Array(12).fill(0);
  sorted.forEach((w) => {
    const t = new Date(w.createdAt || '');
    if (isNaN(t.getTime())) return;
    const idx = (t.getFullYear() - start.getFullYear()) * 12 + (t.getMonth() - start.getMonth());
    if (idx >= 0 && idx < 12) buckets[idx]++;
  });
  const before = sorted.filter((w) => {
    const t = new Date(w.createdAt || '');
    return !isNaN(t.getTime()) && t < start;
  }).length;
  total = before;
  buckets.forEach((n) => { total += n; curve.push(total); });

  return {
    works, bucket, byType, byGroup, ratings, months, hours, avg, rated: rated.length, curve,
    reviews: data.reviews.filter((r) => !r.deletedAt).length,
    excerpts: data.excerpts.filter((e) => !e.deletedAt).length,
    resources: data.resources.filter((r) => !r.deletedAt).length,
    accounts: data.accounts.filter((a) => !a.deletedAt).length
  };
}

function sparkline(values) {
  if (!values.length) return '';
  const w = 320;
  const h = 76;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => [i * step, h - (v / max) * (h - 8) - 4]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = line + ' L' + w + ' ' + h + ' L0 ' + h + ' Z';
  return '<svg class="spark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none" role="img" aria-label="近 12 个月收藏累计">' +
    '<defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">' +
    '<stop offset="0" stop-color="var(--violet)" stop-opacity=".34"/>' +
    '<stop offset="1" stop-color="var(--violet)" stop-opacity="0"/></linearGradient></defs>' +
    '<path d="' + area + '" fill="url(#sg)"/>' +
    '<path d="' + line + '" fill="none" stroke="var(--violet)" stroke-width="1.8" stroke-linejoin="round"/>' +
    '<circle cx="' + pts[pts.length - 1][0].toFixed(1) + '" cy="' + pts[pts.length - 1][1].toFixed(1) + '" r="3" fill="var(--violet)"/>' +
    '</svg>';
}

function bars(items, max) {
  return '<div class="barchart">' + items.map((it) => {
    const pct = max ? Math.round(it[1] / max * 100) : 0;
    return '<div class="barrow"><span class="barlabel">' + esc(it[0]) + '</span>' +
      '<span class="bartrack"><i style="width:' + pct + '%"></i></span>' +
      '<span class="barvalue">' + it[1] + '</span></div>';
  }).join('') + '</div>';
}

export function statsView() {
  const s = build();
  const total = s.works.length;

  let html = '<header class="page-head">' +
    '<div><p class="eyebrow">数据 · ' + new Date().getFullYear() + ' 年</p><h1 class="page-title">统计</h1></div>' +
    '</header>';

  if (!total) {
    return html + emptyState('·', '还没有可统计的数据', '统计完全来自你录入的记录，这里不会显示任何演示数字。',
      '<button class="btn btn-primary btn-sm" data-action="new-work">＋ 添加第一部作品</button>');
  }

  html += '<div class="stat-grid">' +
    '<div class="stat"><b>' + total + '</b><span>作品总数</span></div>' +
    '<div class="stat"><b>' + (s.bucket.done || 0) + '</b><span>已完成</span></div>' +
    '<div class="stat"><b>' + ((s.bucket.doing || 0) + (s.bucket.redoing || 0)) + '</b><span>进行中</span></div>' +
    '<div class="stat"><b>' + ((s.bucket.wish || 0) + (s.bucket.todo || 0)) + '</b><span>待体验</span></div>' +
    '</div>';

  html += '<section class="section" style="margin-top:22px"><div class="section-head">' +
    '<h2 class="section-title">近 12 个月收藏累计</h2><span class="section-note">按添加时间</span></div>' +
    '<div class="card">' + sparkline(s.curve) +
    '<div class="spark-foot"><span>' + s.curve.length + ' 个月</span><span>当前 ' + total + ' 部</span></div></div></section>';

  html += '<section class="section"><div class="section-head"><h2 class="section-title">大类分布</h2>' +
    '<span class="section-note">按作品数</span></div>' +
    bars(Object.keys(s.byGroup).map((g) => [GROUPS[g].label, s.byGroup[g]]).sort((a, b) => b[1] - a[1]),
      Math.max(...Object.keys(s.byGroup).map((g) => s.byGroup[g]))) +
    '</section>';

  const topTypes = Object.keys(s.byType).map((id) => [typeDef(id).label, s.byType[id]])
    .sort((a, b) => b[1] - a[1]).slice(0, 8);
  html += '<section class="section"><div class="section-head"><h2 class="section-title">类型排行</h2>' +
    '<span class="section-note">前 8 类</span></div>' + bars(topTypes, Math.max(...topTypes.map((t) => t[1]))) + '</section>';

  html += '<section class="section"><div class="section-head"><h2 class="section-title">状态构成</h2></div>' +
    '<div class="status-strip">' + [
      ['已完成', s.bucket.done || 0, 'var(--violet)'],
      ['进行中', (s.bucket.doing || 0) + (s.bucket.redoing || 0), 'var(--ok)'],
      ['待体验', (s.bucket.wish || 0) + (s.bucket.todo || 0), 'var(--text-3)'],
      ['暂停', s.bucket.paused || 0, 'var(--warn)'],
      ['已放弃', s.bucket.dropped || 0, 'var(--error)']
    ].map((x) => {
      const pct = total ? Math.round(x[1] / total * 100) : 0;
      return '<div class="status-seg" style="--c:' + x[2] + '"><i style="flex:' + Math.max(0.001, x[1]) + '"></i>' +
        '<span>' + x[0] + ' <b>' + x[1] + '</b> · ' + pct + '%</span></div>';
    }).join('') + '</div></section>';

  const maxR = Math.max(1, ...s.ratings);
  html += '<section class="section"><div class="section-head"><h2 class="section-title">评分分布</h2>' +
    '<span class="section-note">' + s.rated + ' 部已评分 · 平均 ' + (s.avg ? ratingShort(s.avg) : '—') + '</span></div>' +
    '<div class="histogram">' + s.ratings.map((n, i) =>
      '<div class="hist-col"><i style="height:' + Math.round(n / maxR * 100) + '%"></i>' +
      '<span>' + (i + 1) + '</span></div>').join('') + '</div></section>';

  html += '<section class="section"><div class="section-head"><h2 class="section-title">' + new Date().getFullYear() + ' 年各月新增</h2></div>' +
    '<div class="months-bar">' + s.months.map((n, i) =>
      '<div class="mb-col"><i style="height:' + Math.round(n / Math.max(1, ...s.months) * 100) + '%"></i>' +
      '<span>' + (i + 1) + '</span></div>').join('') + '</div></section>';

  html += '<section class="section"><div class="section-head"><h2 class="section-title">内容产出</h2></div>' +
    '<div class="stat-grid">' +
    '<div class="stat"><b>' + s.reviews + '</b><span>总结</span></div>' +
    '<div class="stat"><b>' + s.excerpts + '</b><span>摘抄</span></div>' +
    '<div class="stat"><b>' + s.resources + '</b><span>数字资源</span></div>' +
    '<div class="stat"><b>' + (s.hours ? fmtHours(s.hours) : '0') + '</b><span>记录时长（小时）</span></div>' +
    '</div></section>';

  html += '<p class="fan-hint" style="margin-top:20px">口径说明：作品按主档案计数；完成/进行中按作品状态计；' +
    '时长来自体验记录里手填的小时数，没填就不计入。所有数字都可点击回到对应列表。</p>';

  return html;
}

export const actions = {};
