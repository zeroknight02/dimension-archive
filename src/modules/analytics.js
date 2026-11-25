/* ==========================================================
   次元簿 · 高级数据分析（10.1 - 10.5）
   所有数字从原始记录实时聚合；没有数据时显示空态，不补造趋势。
   ========================================================== */

import { data, liveWorks, detailsOf, experiencesOf, finishedDate, bucketOf, coverUrl } from '../core/repo.js';
import { GROUPS, typeDef } from '../core/schema.js';
import { ui, go } from '../core/state.js';
import { icon, toast, emptyState } from '../core/ui.js';
import { esc, fmtHours, money, ratingShort, initials, coverColor } from '../core/format.js';
import { downloadBlob } from '../core/backup.js';

function hoursOf(w) {
  let h = 0;
  experiencesOf(w.id).forEach((e) => { if (e.progress && e.progress.hours) h += Number(e.progress.hours) || 0; });
  if (!h) h = Number(detailsOf(w.id).playTime) || 0;
  return h;
}

function years() {
  const set = new Set();
  liveWorks().forEach((w) => {
    const d = finishedDate(w) || (w.createdAt || '').slice(0, 10);
    if (d) set.add(d.slice(0, 4));
  });
  return [...set].sort().reverse();
}

function barChart(items, max, fmt) {
  return '<div class="barchart">' + items.map(([label, value]) => {
    const pct = max ? Math.round(value / max * 100) : 0;
    return '<div class="barrow"><span class="barlabel">' + esc(label) + '</span>' +
      '<span class="bartrack"><i style="width:' + pct + '%"></i></span>' +
      '<span class="barvalue">' + esc(fmt ? fmt(value) : String(value)) + '</span></div>';
  }).join('') + '</div>';
}

export function analyticsView() {
  const tab = (['dash', 'profile', 'year', 'compare', 'custom'].indexOf(ui.route.id) >= 0) ? ui.route.id : (ui.anaTab || 'dash');
  if (!liveWorks().length) {
    return '<header class="page-head"><div class="head-left"><button class="icon-btn" data-action="back" aria-label="返回">' + icon('back', 20) + '</button>' +
      '<div><p class="eyebrow">分析</p><h1 class="page-title">数据分析</h1></div></div></header>' +
      emptyState('·', '还没有可分析的数据', '所有图表都从你的记录实时计算，不显示演示数字。',
        '<button class="btn btn-primary btn-sm" data-action="new-work">＋ 添加作品</button>');
  }

  let html = '<header class="page-head">' +
    '<div class="head-left"><button class="icon-btn" data-action="back" aria-label="返回">' + icon('back', 20) + '</button>' +
    '<div><p class="eyebrow">分析 · ' + liveWorks().length + ' 部作品</p><h1 class="page-title">数据分析</h1></div></div></header>';

  html += '<div class="segbar" style="margin-bottom:16px">' +
    [['dash', '总览'], ['profile', '兴趣画像'], ['year', '年度报告'], ['compare', '数据对比'], ['custom', '自定义统计']]
      .map((t) => '<button class="' + (tab === t[0] ? 'is-on' : '') + '" data-action="ana-tab" data-value="' + t[0] + '">' + t[1] + '</button>').join('') +
    '</div>';

  if (tab === 'dash') return html + dashPanel();
  if (tab === 'profile') return html + profilePanel();
  if (tab === 'year') return html + yearPanel();
  if (tab === 'compare') return html + comparePanel();
  return html + customPanel();
}

/* ---------------- 10.1 总览 ---------------- */

function dashPanel() {
  const works = liveWorks();
  const done = works.filter((w) => bucketOf(w) === 'done');
  const hours = works.reduce((a, w) => a + hoursOf(w), 0);
  const spend = data.expenses.filter((e) => !e.deletedAt).reduce((a, e) => a + (Number(e.amount) || 0), 0);
  const rated = works.filter((w) => w.rating > 0);
  const avg = rated.length ? rated.reduce((a, w) => a + w.rating, 0) / rated.length : 0;

  const byYear = {};
  works.forEach((w) => {
    const y = (finishedDate(w) || (w.createdAt || '')).slice(0, 4);
    if (y) byYear[y] = (byYear[y] || 0) + 1;
  });
  const yearItems = Object.keys(byYear).sort().map((y) => [y, byYear[y]]);

  const byGroup = {};
  works.forEach((w) => {
    const g = typeDef(w.type).group;
    byGroup[GROUPS[g].label] = (byGroup[GROUPS[g].label] || 0) + 1;
  });
  const groupItems = Object.keys(byGroup).sort((a, b) => byGroup[b] - byGroup[a]).map((k) => [k, byGroup[k]]);

  const topRated = rated.slice().sort((a, b) => b.rating - a.rating).slice(0, 5);

  return '<div class="stat-grid" style="margin-bottom:18px">' +
    '<div class="stat"><b>' + works.length + '</b><span>作品</span></div>' +
    '<div class="stat"><b>' + done.length + '</b><span>完成</span></div>' +
    '<div class="stat"><b>' + fmtHours(hours) + '</b><span>小时</span></div>' +
    '<div class="stat"><b>' + (spend ? money(spend) : '—') + '</b><span>消费</span></div>' +
    '</div>' +
    '<section class="section"><div class="section-head"><h2 class="section-title">按年份收录</h2></div>' +
    barChart(yearItems, Math.max(...yearItems.map((x) => x[1]), 1)) + '</section>' +
    '<section class="section"><div class="section-head"><h2 class="section-title">按大类</h2></div>' +
    barChart(groupItems, Math.max(...groupItems.map((x) => x[1]), 1)) + '</section>' +
    '<section class="section"><div class="section-head"><h2 class="section-title">评分最高</h2>' +
    '<span class="section-note">平均 ' + (avg ? ratingShort(avg) : '—') + '</span></div>' +
    (topRated.length ? '<div class="rows">' + topRated.map((w) => {
      const cover = coverUrl(w);
      return '<button class="rowitem" data-action="open-work" data-id="' + w.id + '">' +
        '<span class="cover" style="--cc:' + coverColor(w.title) + ';width:34px;flex:0 0 34px">' +
        (cover ? '<img src="' + esc(cover) + '" alt="">' : '<b>' + esc(initials(w.title)) + '</b>') + '</span>' +
        '<span class="rowitem-main"><b>' + esc(w.title) + '</b><i>' + esc(typeDef(w.type).label) + '</i></span>' +
        '<span class="rowitem-side">★ ' + ratingShort(w.rating) + '</span></button>';
    }).join('') + '</div>' : '<p class="muted" style="font-size:12.5px">还没有评分。</p>') +
    '</section>';
}

/* ---------------- 10.2 兴趣画像 ---------------- */

function profilePanel() {
  const works = liveWorks();
  const byGroup = {};
  const byEra = {};
  const byTag = {};
  const byCreator = {};

  works.forEach((w) => {
    const g = typeDef(w.type).group;
    byGroup[GROUPS[g].label] = (byGroup[GROUPS[g].label] || 0) + 1;
    const y = Number(w.year) || 0;
    if (y) {
      const era = y < 1990 ? '1990 前' : y < 2000 ? '1990s' : y < 2010 ? '2000s' : y < 2020 ? '2010s' : '2020 后';
      byEra[era] = (byEra[era] || 0) + 1;
    }
    (w.tagIds || []).forEach((id) => {
      const t = data.tags.find((x) => x.id === id);
      if (t) byTag[t.name] = (byTag[t.name] || 0) + 1;
    });
    if (w.creator) byCreator[w.creator] = (byCreator[w.creator] || 0) + 1;
  });

  const pick = (obj, n) => Object.keys(obj).sort((a, b) => obj[b] - obj[a]).slice(0, n).map((k) => [k, obj[k]]);
  const rated = works.filter((w) => w.rating > 0);
  const high = rated.filter((w) => w.rating >= 9).length;
  const low = rated.filter((w) => w.rating <= 6).length;

  const items = pick(byGroup, 7);
  const max = Math.max(...items.map((x) => x[1]), 1);

  return '<p class="fan-hint">画像只描述「你记了什么」，不做心理推断。</p>' +
    '<section class="section"><div class="section-head"><h2 class="section-title">口味构成</h2></div>' +
    '<div class="radar">' + items.map(([label, v]) => {
      const pct = Math.round(v / max * 100);
      return '<div class="radar-row"><span>' + esc(label) + '</span>' +
        '<span class="radar-track"><i style="width:' + pct + '%"></i></span>' +
        '<b>' + v + '</b></div>';
    }).join('') + '</div></section>' +
    '<section class="section"><div class="section-head"><h2 class="section-title">年代偏好</h2></div>' +
    barChart(pick(byEra, 6), Math.max(...Object.values(byEra), 1)) + '</section>' +
    '<section class="section"><div class="section-head"><h2 class="section-title">最常用标签</h2></div>' +
    (Object.keys(byTag).length ? '<div class="chips">' + pick(byTag, 12).map(([k, v]) =>
      '<span class="badge">#' + esc(k) + ' · ' + v + '</span>').join('') + '</div>'
      : '<p class="muted" style="font-size:12.5px">还没有标签。</p>') + '</section>' +
    '<section class="section"><div class="section-head"><h2 class="section-title">反复出现的创作者</h2></div>' +
    (Object.keys(byCreator).length ? barChart(pick(byCreator, 8), Math.max(...Object.values(byCreator), 1)) : '<p class="muted" style="font-size:12.5px">还没有创作者信息。</p>') + '</section>' +
    '<section class="section"><div class="section-head"><h2 class="section-title">评分习惯</h2></div>' +
    '<div class="kv">' +
    '<div class="kv-row"><span>已评分</span><b>' + rated.length + ' 部</b></div>' +
    '<div class="kv-row"><span>9 分及以上</span><b>' + high + ' 部</b></div>' +
    '<div class="kv-row"><span>6 分及以下</span><b>' + low + ' 部</b></div>' +
    '</div></section>';
}

/* ---------------- 10.3 年度报告 ---------------- */

function yearPanel() {
  const list = years();
  const y = String(ui.anaYear || list[0] || new Date().getFullYear());
  const pool = liveWorks().filter((w) => String(finishedDate(w) || (w.createdAt || '')).slice(0, 4) === y);
  const st = {
    n: pool.length,
    done: pool.filter((w) => bucketOf(w) === 'done').length,
    hours: pool.reduce((a, w) => a + hoursOf(w), 0),
    spend: data.expenses.filter((e) => String(e.date || '').slice(0, 4) === y).reduce((a, e) => a + (Number(e.amount) || 0), 0)
  };
  const best = pool.filter((w) => w.rating > 0).sort((a, b) => b.rating - a.rating)[0];

  return '<div class="chips" style="margin-bottom:16px">' + (list.length ? list : [y]).map((x) =>
    '<button class="chip' + (x === y ? ' is-on' : '') + '" data-action="ana-year" data-value="' + x + '">' + x + '</button>').join('') + '</div>' +
    '<div class="stat-grid" style="margin-bottom:18px">' +
    '<div class="stat"><b>' + st.n + '</b><span>收录</span></div>' +
    '<div class="stat"><b>' + st.done + '</b><span>完成</span></div>' +
    '<div class="stat"><b>' + fmtHours(st.hours) + '</b><span>小时</span></div>' +
    '<div class="stat"><b>' + (st.spend ? money(st.spend) : '—') + '</b><span>消费</span></div>' +
    '</div>' +
    (best ? '<div class="card" style="margin-bottom:16px"><p class="eyebrow">年度最佳</p>' +
      '<p style="font-size:17px;font-family:var(--serif);margin:4px 0 6px">' + esc(best.title) + '</p>' +
      '<p class="muted" style="font-size:12px">' + esc([best.creator, typeDef(best.type).label, '★ ' + ratingShort(best.rating)].filter(Boolean).join(' · ')) + '</p>' +
      '<button class="btn btn-ghost btn-sm" data-action="open-work" data-id="' + best.id + '" style="margin-top:10px">打开</button></div>' : '') +
    '<button class="btn btn-primary btn-block" data-action="ana-year-export" data-value="' + esc(y) + '">' + icon('download', 15) + ' 导出年度报告长图</button>' +
    '<p class="fan-hint" style="margin-top:10px">导出的图片只包含这一年的汇总数字，不含具体条目的私密备注。</p>';
}

async function exportYearReport(y) {
  const pool = liveWorks().filter((w) => String(finishedDate(w) || (w.createdAt || '')).slice(0, 4) === String(y));
  const st = {
    n: pool.length,
    done: pool.filter((w) => bucketOf(w) === 'done').length,
    hours: pool.reduce((a, w) => a + hoursOf(w), 0)
  };
  const top = pool.filter((w) => w.rating > 0).sort((a, b) => b.rating - a.rating).slice(0, 5);

  const W = 760;
  const H = 980;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#17132F');
  g.addColorStop(1, '#2A2250');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 80; i++) {
    ctx.fillStyle = 'rgba(242,237,255,' + (0.03 + Math.random() * 0.14).toFixed(3) + ')';
    ctx.beginPath();
    ctx.arc(Math.random() * W, Math.random() * H, Math.random() < 0.9 ? 1.1 : 1.9, 0, Math.PI * 2);
    ctx.fill();
  }
  const P = 56;
  ctx.fillStyle = 'rgba(242,237,255,.55)';
  ctx.font = '600 13px -apple-system, sans-serif';
  ctx.fillText('DIMENSION ARCHIVE · 次元簿', P, 70);
  ctx.fillStyle = '#F2D79B';
  ctx.font = '600 12px -apple-system, sans-serif';
  ctx.fillText('YEAR IN REVIEW', P, 96);
  ctx.fillStyle = '#F2EDFF';
  ctx.font = '700 96px ui-monospace, monospace';
  ctx.fillText(String(y), P - 4, 196);
  ctx.fillStyle = 'rgba(242,237,255,.14)';
  ctx.fillRect(P, 224, W - P * 2, 1);

  [['收录', st.n], ['完成', st.done], ['小时', Math.round(st.hours)]].forEach((c, i) => {
    const x = P + i * ((W - P * 2) / 3);
    ctx.fillStyle = '#F2EDFF';
    ctx.font = '700 38px ui-monospace, monospace';
    ctx.fillText(String(c[1]), x, 292);
    ctx.fillStyle = 'rgba(242,237,255,.5)';
    ctx.font = '400 13px -apple-system, sans-serif';
    ctx.fillText(c[0], x, 316);
  });

  ctx.fillStyle = 'rgba(242,237,255,.5)';
  ctx.font = '600 12px -apple-system, sans-serif';
  ctx.fillText('TOP RATED', P, 372);
  top.forEach((w, i) => {
    const yy = 400 + i * 58;
    ctx.fillStyle = 'rgba(242,237,255,.06)';
    ctx.fillRect(P, yy, W - P * 2, 48);
    ctx.fillStyle = '#B9A2FF';
    ctx.font = '700 13px ui-monospace, monospace';
    ctx.fillText('0' + (i + 1), P + 14, yy + 30);
    ctx.fillStyle = '#F2EDFF';
    ctx.font = '600 17px -apple-system, "PingFang SC", sans-serif';
    ctx.fillText(String(w.title).slice(0, 18), P + 52, yy + 30);
    ctx.textAlign = 'right';
    ctx.font = '700 16px ui-monospace, monospace';
    ctx.fillText(ratingShort(w.rating), W - P - 14, yy + 30);
    ctx.textAlign = 'left';
  });
  ctx.fillStyle = 'rgba(242,237,255,.32)';
  ctx.font = '400 12px -apple-system, sans-serif';
  ctx.fillText('数据来自本机记录 · 仅个人留存', P, H - 46);

  await new Promise((r) => setTimeout(r, 40));
  cv.toBlob((blob) => {
    if (!blob) { toast('生成失败', 'error'); return; }
    downloadBlob(blob, 'dimension-archive-' + y + '-year.png');
    toast('已导出');
  }, 'image/png');
}

/* ---------------- 10.4 数据对比 ---------------- */

function comparePanel() {
  const list = years();
  const a = String(ui.anaA || list[1] || list[0] || '');
  const b = String(ui.anaB || list[0] || '');

  function agg(year) {
    const pool = liveWorks().filter((w) => String(finishedDate(w) || (w.createdAt || '')).slice(0, 4) === year);
    return {
      n: pool.length,
      done: pool.filter((w) => bucketOf(w) === 'done').length,
      hours: Math.round(pool.reduce((x, w) => x + hoursOf(w), 0)),
      spend: data.expenses.filter((e) => String(e.date || '').slice(0, 4) === year).reduce((x, e) => x + (Number(e.amount) || 0), 0),
      avg: (() => {
        const r = pool.filter((w) => w.rating > 0);
        return r.length ? r.reduce((x, w) => x + w.rating, 0) / r.length : 0;
      })()
    };
  }
  const A = agg(a);
  const B = agg(b);

  const rows = [
    ['收录', A.n, B.n],
    ['完成', A.done, B.done],
    ['小时', A.hours, B.hours],
    ['平均分', A.avg ? ratingShort(A.avg) : '—', B.avg ? ratingShort(B.avg) : '—'],
    ['消费', A.spend ? money(A.spend) : '—', B.spend ? money(B.spend) : '—']
  ];

  return '<div class="row2" style="margin-bottom:16px">' +
    '<label class="field"><span class="field-label">对比年份 A</span><select class="select" data-change="ana-a">' +
    (list.length ? list : [a]).map((x) => '<option value="' + x + '"' + (x === a ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></label>' +
    '<label class="field"><span class="field-label">对比年份 B</span><select class="select" data-change="ana-b">' +
    (list.length ? list : [b]).map((x) => '<option value="' + x + '"' + (x === b ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></label>' +
    '</div>' +
    '<table class="table stack"><thead><tr><th>指标</th><th>' + esc(a) + '</th><th>' + esc(b) + '</th><th>变化</th></tr></thead><tbody>' +
    rows.map(([k, x, y]) => {
      let delta = '';
      if (typeof x === 'number' && typeof y === 'number') {
        const d = y - x;
        delta = (d > 0 ? '+' : '') + Math.round(d * 10) / 10;
      }
      return '<tr><td data-th="指标">' + esc(k) + '</td><td data-th="' + esc(a) + '">' + esc(String(x)) + '</td>' +
        '<td data-th="' + esc(b) + '">' + esc(String(y)) + '</td><td data-th="变化">' + esc(delta || '—') + '</td></tr>';
    }).join('') + '</tbody></table>';
}

/* ---------------- 10.5 自定义统计 ---------------- */

const DIMS = [
  { value: 'type', label: '按类型' },
  { value: 'group', label: '按大类' },
  { value: 'status', label: '按状态' },
  { value: 'year', label: '按发行年份' },
  { value: 'tag', label: '按标签' },
  { value: 'creator', label: '按创作者' },
  { value: 'month', label: '按收录月份' }
];

const MEASURES = [
  { value: 'count', label: '作品数' },
  { value: 'avg', label: '平均分' },
  { value: 'hours', label: '总时长' },
  { value: 'pages', label: '总页数' }
];

function customPanel() {
  const dim = ui.anaDim || 'type';
  const measure = ui.anaMeasure || 'count';
  const works = liveWorks();
  const buckets = {};

  const keyOf = (w) => {
    if (dim === 'type') return typeDef(w.type).label;
    if (dim === 'group') return GROUPS[typeDef(w.type).group].label;
    if (dim === 'status') return typeDef(w.type).label + ' · ' + (w.status || '未填');
    if (dim === 'year') return w.year ? String(w.year) : '未填';
    if (dim === 'creator') return w.creator || '未填';
    if (dim === 'month') return (w.createdAt || '').slice(0, 7) || '未填';
    if (dim === 'tag') {
      const names = (w.tagIds || []).map((id) => {
        const t = data.tags.find((x) => x.id === id);
        return t ? t.name : '';
      }).filter(Boolean);
      return names.length ? names : ['无标签'];
    }
    return '其他';
  };

  const val = (w) => {
    if (measure === 'avg') return w.rating || 0;
    if (measure === 'hours') return hoursOf(w);
    if (measure === 'pages') return Number(detailsOf(w.id).pages) || 0;
    return 1;
  };

  works.forEach((w) => {
    const keys = [].concat(keyOf(w));
    keys.forEach((k) => {
      if (!buckets[k]) buckets[k] = { sum: 0, n: 0 };
      buckets[k].sum += val(w);
      buckets[k].n++;
    });
  });

  const rows = Object.keys(buckets).map((k) => {
    const b = buckets[k];
    const v = measure === 'avg' ? (b.n ? b.sum / b.n : 0) : b.sum;
    return [k, Math.round(v * 10) / 10, b.n];
  }).sort((x, y) => y[1] - x[1]).slice(0, 15);

  const max = Math.max(...rows.map((r) => r[1]), 1);
  const fmt = (v) => measure === 'avg' ? ratingShort(v) : String(Math.round(v));

  return '<div class="row2" style="margin-bottom:16px">' +
    '<label class="field"><span class="field-label">分组维度</span><select class="select" data-change="ana-dim">' +
    DIMS.map((d) => '<option value="' + d.value + '"' + (d.value === dim ? ' selected' : '') + '>' + d.label + '</option>').join('') + '</select></label>' +
    '<label class="field"><span class="field-label">度量</span><select class="select" data-change="ana-measure">' +
    MEASURES.map((m) => '<option value="' + m.value + '"' + (m.value === measure ? ' selected' : '') + '>' + m.label + '</option>').join('') + '</select></label>' +
    '</div>' +
    (rows.length ? barChart(rows.map((r) => [r[0], r[1]]), max, fmt) : '<p class="muted">没有数据。</p>') +
    '<p class="fan-hint" style="margin-top:14px">「按标签」时一部作品会同时计入多个标签，所以合计会大于作品数。</p>';
}

export const actions = {
  'ana-tab': (el) => { ui.anaTab = el.dataset.value; go('#/analytics/' + el.dataset.value); },
  'ana-year': (el) => { ui.anaYear = el.dataset.value; go('#/analytics/year'); },
  'ana-year-export': (el) => exportYearReport(el.dataset.value)
};
