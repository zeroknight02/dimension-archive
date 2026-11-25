/* ==========================================================
   次元簿 · 日历中心与个人文化时间轴（7.5 / 8.5）
   日历把体验、提醒、消费、借还、发行与演出日期叠在同一天格里，
   支持日 / 周 / 月三种视图与按事件类型筛选。
   时间轴按月回顾「那段时间在看什么、写了什么」。
   两类视图都只读聚合，不复制数据。
   ========================================================== */

import { data, liveWorks, getWork, detailsOf, experiencesOf } from '../core/repo.js';
import { typeDef } from '../core/schema.js';
import { ui, go } from '../core/state.js';
import { icon, emptyState } from '../core/ui.js';
import { esc, todayISO, money, fmtDate } from '../core/format.js';

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

const FILTERS = [
  ['all', '全部'],
  ['exp', '体验'],
  ['rem', '提醒'],
  ['money', '消费'],
  ['loan', '借还'],
  ['release', '发行 / 演出'],
  ['sub', '订阅']
];

const KIND_LABEL = { exp: '体验', rem: '提醒', money: '消费', loan: '借还', release: '发行', sub: '订阅' };

function iso(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function parseISO(s) {
  const d = new Date((s || todayISO()) + 'T00:00:00');
  return isNaN(d.getTime()) ? new Date() : d;
}

function addDays(s, n) {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return iso(d);
}

function startOfWeek(s) {
  const d = parseISO(s);
  d.setDate(d.getDate() - d.getDay());
  return iso(d);
}

/* 发行 / 演出日期来自作品专属字段，只读，不另建事件表 */
function releaseEvents() {
  const out = {};
  liveWorks().forEach((w) => {
    const d = detailsOf(w.id);
    const def = typeDef(w.type);
    [['releaseDate', '发行'], ['issueDate', '出版'], ['airStart', '开播'], ['premiere', '首演']].forEach(([k, label]) => {
      const v = String(d[k] || '');
      if (!/^\d{4}-\d{2}-\d{2}/.test(v)) return;
      const key = v.slice(0, 10);
      (out[key] = out[key] || []).push({
        kind: 'release', label: label + ' · ' + w.title, id: w.id, tone: 'gold', sub: def.label
      });
    });
  });
  return out;
}

function baseEvents() {
  const map = {};
  const push = (date, ev) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ''))) return;
    (map[date] = map[date] || []).push(ev);
  };

  data.experiences.filter((e) => !e.deletedAt).forEach((e) => {
    const w = getWork(e.workId);
    if (!w) return;
    if (e.startDate) push(e.startDate, { kind: 'exp', label: '开始 · ' + w.title, id: w.id, tone: 'ok' });
    if (e.endDate) push(e.endDate, { kind: 'exp', label: '完成 · ' + w.title, id: w.id, tone: 'violet' });
  });
  data.reminders.filter((r) => !r.deletedAt && !r.done).forEach((r) => {
    if (r.date) push(r.date, { kind: 'rem', label: '提醒 · ' + r.title, id: r.id, tone: 'warn' });
  });
  data.expenses.filter((e) => !e.deletedAt).forEach((e) => {
    if (e.date) push(e.date, { kind: 'money', label: (e.category || '消费') + ' ' + money(e.amount), id: e.id, tone: '' });
  });
  data.loans.filter((l) => !l.deletedAt && !l.returnedAt).forEach((l) => {
    if (l.dueDate) push(l.dueDate, { kind: 'loan', label: '应还 · ' + (l.title || '借阅'), id: l.id, tone: 'error' });
  });

  data.subscriptions.filter((x) => !x.deletedAt && x.endDate).forEach((x) => {
    push(x.endDate, { kind: 'sub', label: '订阅到期 · ' + (x.platform || '会员'), id: x.id, tone: 'warn' });
  });

  const rel = releaseEvents();
  Object.keys(rel).forEach((k) => { rel[k].forEach((ev) => push(k, ev)); });
  return map;
}

function visible(ev, filter) {
  if (!filter || filter === 'all') return true;
  return ev.kind === filter;
}

function eventsOn(map, dateStr) {
  return (map[dateStr] || []).filter((e) => visible(e, ui.cal.filter));
}

function monthMatrix(y, m) {
  const first = new Date(y, m, 1);
  const startDow = first.getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function headBar(title, sub) {
  return '<header class="page-head">' +
    '<div class="head-left"><button class="icon-btn" data-action="back" aria-label="返回">' + icon('back', 20) + '</button>' +
    '<div><p class="eyebrow">' + esc(sub) + '</p><h1 class="page-title">' + esc(title) + '</h1></div></div>' +
    '<div class="head-actions">' +
    '<button class="icon-btn" data-action="cal-today" aria-label="回到今天">' + icon('calendar', 18) + '</button>' +
    '<button class="icon-btn" data-action="cal-prev" aria-label="上一段">' + icon('left', 18) + '</button>' +
    '<button class="icon-btn" data-action="cal-next" aria-label="下一段">' + icon('right', 18) + '</button>' +
    '</div></header>';
}

export function calendarView() {
  const now = new Date();
  if (!ui.cal.year) { ui.cal.year = now.getFullYear(); ui.cal.month = now.getMonth(); }
  if (!ui.cal.anchor) ui.cal.anchor = todayISO();
  const mode = ui.cal.mode || 'month';
  const filter = ui.cal.filter || 'all';
  const map = baseEvents();

  let html = '';
  if (mode === 'day') {
    const sel = ui.cal.anchor;
    html += headBar(fmtDate(sel, 'cn'), '日历 · 日视图');
  } else if (mode === 'week') {
    const s = startOfWeek(ui.cal.anchor);
    const e = addDays(s, 6);
    const range = (s.slice(5, 7) + '/' + s.slice(8)) + ' – ' + (e.slice(5, 7) + '/' + e.slice(8));
    html += headBar(range, '日历 · ' + s.slice(0, 4) + ' 年 ' + Number(s.slice(5, 7)) + ' 月');
  } else {
    const y = ui.cal.year;
    const m = ui.cal.month;
    html += headBar((m + 1) + ' 月', '日历 · ' + y + ' 年');
  }

  /* 视图与筛选 */
  html += '<div class="row-flex cal-tools">' +
    '<div class="segbar">' + [['day', '日'], ['week', '周'], ['month', '月']].map((v) =>
      '<button class="' + (mode === v[0] ? 'is-on' : '') + '" data-action="cal-mode" data-value="' + v[0] + '">' + v[1] + '</button>').join('') +
    '</div>' +
    '<div class="chips">' + FILTERS.map((f) =>
      '<button class="chip' + (filter === f[0] ? ' is-on' : '') + '" data-action="cal-filter" data-value="' + f[0] + '">' + f[1] + '</button>').join('') +
    '</div></div>';

  if (mode === 'month') {
    const y = ui.cal.year;
    const m = ui.cal.month;
    const sel = ui.cal.selected || '';
    const today = todayISO();

    html += '<div class="cal">' +
      '<div class="cal-week">' + WEEK.map((w) => '<span>' + w + '</span>').join('') + '</div>' +
      '<div class="cal-grid">' + monthMatrix(y, m).map((d) => {
        if (!d) return '<span class="cal-cell is-empty"></span>';
        const dateStr = y + '-' + String(m + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
        const ev = eventsOn(map, dateStr);
        const dots = ev.slice(0, 3).map((e) => '<i class="cal-dot ' + (e.tone ? 'is-' + e.tone : '') + '"></i>').join('');
        return '<button class="cal-cell' + (dateStr === today ? ' is-today' : '') + (dateStr === sel ? ' is-sel' : '') +
          '" data-action="cal-day" data-value="' + dateStr + '">' +
          '<b>' + d + '</b><span class="cal-dots">' + dots + '</span></button>';
      }).join('') + '</div></div>';

    html += '<div class="cal-legend">' +
      '<span><i class="cal-dot is-ok"></i>开始</span><span><i class="cal-dot is-violet"></i>完成</span>' +
      '<span><i class="cal-dot is-warn"></i>提醒</span><span><i class="cal-dot"></i>消费</span>' +
      '<span><i class="cal-dot is-gold"></i>发行 / 演出</span><span><i class="cal-dot is-warn"></i>订阅到期</span></div>';

    if (sel) html += dayList(map, sel);
    else html += '<p class="fan-hint">点任意一天，查看当天的体验、提醒、消费与发行事件。</p>';
  }

  if (mode === 'week') {
    const s = startOfWeek(ui.cal.anchor);
    const days = [];
    for (let i = 0; i < 7; i++) days.push(addDays(s, i));
    html += '<div class="cal-week-grid">' + days.map((d, i) => {
      const ev = eventsOn(map, d);
      const isToday = d === todayISO();
      return '<div class="cal-wcol' + (isToday ? ' is-today' : '') + '">' +
        '<p class="cal-wday">' + WEEK[i] + '</p>' +
        '<button class="cal-wdate" data-action="cal-open-day" data-value="' + d + '">' + Number(d.slice(8)) + '</button>' +
        '<div class="cal-wev">' + (ev.length
          ? ev.slice(0, 4).map((e) => '<button class="cal-chip is-' + e.kind + '" data-action="cal-event" data-kind="' + e.kind + '" data-id="' + e.id + '">' +
            esc(e.label) + '</button>').join('') +
            (ev.length > 4 ? '<span class="cal-more">+' + (ev.length - 4) + '</span>' : '')
          : '<span class="cal-none">—</span>') + '</div></div>';
    }).join('') + '</div>';
  }

  if (mode === 'day') {
    html += dayList(map, ui.cal.anchor, true);
  }

  return html;
}

function dayList(map, date, big) {
  const ev = eventsOn(map, date);
  return '<section class="section" style="margin-top:' + (big ? '6px' : '14px') + '">' +
    '<div class="section-head"><h2 class="section-title">' + (big ? '当天记录' : fmtDate(date, 'cn')) + '</h2>' +
    '<span class="section-note">' + ev.length + ' 条</span></div>' +
    (ev.length
      ? '<div class="rows">' + ev.map((e) => '<button class="rowitem" data-action="cal-event" data-kind="' + e.kind + '" data-id="' + e.id + '">' +
        '<span class="row-icon cal-kind is-' + e.kind + '">' + icon(e.kind === 'exp' ? 'book' : e.kind === 'rem' ? 'clock' : e.kind === 'money' ? 'chart' : e.kind === 'loan' ? 'link' : 'star', 15) + '</span>' +
        '<span class="rowitem-main"><b>' + esc(e.label) + '</b>' +
        '<i>' + esc([KIND_LABEL[e.kind], e.sub].filter(Boolean).join(' · ')) + '</i></span>' +
        icon('right', 15) + '</button>').join('') + '</div>'
      : '<p class="muted" style="font-size:12.5px">这一天没有记录。</p>') +
    '</section>';
}

/* ---------------- 8.5 时间轴 ---------------- */

export function timelineView() {
  const t = ui.timeline || { year: '', month: '', kinds: { start: true, finish: true, collect: true, buy: true }, tag: '' };
  const kinds = t.kinds || {};
  const items = [];

  const push = (date, kind, title, sub, action, id, workId) => {
    if (!date) return;
    items.push({ date: String(date).slice(0, 10), kind, title, sub, action, id, workId });
  };

  liveWorks().forEach((w) => {
    const label = typeDef(w.type).label;
    experiencesOf(w.id).forEach((e) => {
      if (kinds.start !== false && e.startDate) push(e.startDate, 'start', w.title, '开始 · ' + label, 'open-work', w.id, w.id);
      if (kinds.finish !== false && e.endDate) push(e.endDate, 'finish', w.title, '完成 · ' + label, 'open-work', w.id, w.id);
    });
    if (kinds.collect !== false) {
      const c = data.collections.filter((x) => x.workId === w.id && !x.deletedAt)[0];
      if (c) push(c.createdAt || c.addedAt || '', 'collect', w.title, '加入清单 · ' + label, 'open-work', w.id, w.id);
    }
  });

  if (kinds.buy !== false) {
    data.expenses.filter((e) => !e.deletedAt && e.workId).forEach((e) => {
      const w = getWork(e.workId);
      if (!w) return;
      push(e.date, 'buy', w.title, '购买 · ' + (e.category || '消费') + ' ' + money(e.amount), 'open-work', w.id, w.id);
    });
  }

  data.reviews.filter((r) => !r.deletedAt).forEach((r) => {
    const w = r.workId ? getWork(r.workId) : null;
    push(r.date || (r.createdAt || '').slice(0, 10), 'review', r.title || '总结',
      (w ? '关于《' + w.title + '》' : '独立文章') + ' · ' + (r.type || ''), 'read-review', r.id, w ? w.id : '');
  });
  data.excerpts.filter((e) => !e.deletedAt).forEach((e) => {
    push(e.date || (e.createdAt || '').slice(0, 10), 'excerpt', String(e.content || '').slice(0, 28), '摘抄', 'edit-excerpt', e.id, e.workId || '');
  });

  const years = [...new Set(items.map((i) => i.date.slice(0, 4)).filter(Boolean))].sort().reverse();
  const tags = data.tags.filter((x) => items.some((i) => i.workId && i.workId === (getWork(i.workId) || {}).id &&
    ((getWork(i.workId) || {}).tagIds || []).indexOf(x.id) >= 0));
  const selectedTag = t.tag || '';

  const filtered = items.filter((i) => {
    if (t.year && i.date.slice(0, 4) !== String(t.year)) return false;
    if (t.month && i.date.slice(5, 7) !== String(t.month).padStart(2, '0')) return false;
    if (selectedTag) {
      const w = i.workId ? getWork(i.workId) : null;
      if (!w || (w.tagIds || []).indexOf(selectedTag) < 0) return false;
    }
    return true;
  });

  const groups = {};
  filtered.forEach((i) => {
    const k = i.date.slice(0, 7);
    (groups[k] = groups[k] || []).push(i);
  });
  const keys = Object.keys(groups).sort().reverse();

  let html = '<header class="page-head">' +
    '<div class="head-left"><button class="icon-btn" data-action="back" aria-label="返回">' + icon('back', 20) + '</button>' +
    '<div><p class="eyebrow">时间轴 · ' + filtered.length + ' / ' + items.length + ' 条</p><h1 class="page-title">文化时间轴</h1></div></div></header>';

  html += '<div class="row-flex tl-tools" style="gap:8px;margin-bottom:10px">' +
    '<select class="select" data-change="tl-year" style="flex:1;min-height:34px"><option value="">全部年份</option>' +
    years.map((y) => '<option value="' + y + '"' + (String(t.year) === y ? ' selected' : '') + '>' + y + ' 年</option>').join('') + '</select>' +
    '<select class="select" data-change="tl-month" style="flex:1;min-height:34px"><option value="">全部月份</option>' +
    Array.from({ length: 12 }, (_, i) => i + 1).map((m) =>
      '<option value="' + m + '"' + (String(t.month) === String(m) ? ' selected' : '') + '>' + m + ' 月</option>').join('') + '</select>' +
    '<select class="select" data-change="tl-tag" style="flex:1;min-height:34px"><option value="">全部标签</option>' +
    tags.map((x) => '<option value="' + x.id + '"' + (selectedTag === x.id ? ' selected' : '') + '>#' + esc(x.name) + '</option>').join('') + '</select>' +
    '</div>';

  html += '<div class="chips" style="margin-bottom:14px">' +
    [['start', '开始'], ['finish', '完成'], ['collect', '收藏'], ['buy', '购买'], ['review', '总结'], ['excerpt', '摘抄']].map((k) =>
      '<button class="chip' + (kinds[k[0]] !== false ? ' is-on' : '') + '" data-action="tl-kind" data-value="' + k[0] + '">' + k[1] + '</button>').join('') +
    '</div>';

  if (!keys.length) {
    return html + emptyState('·', '这段时间没有记录', '换个月份、放宽事件类型，或者先去记录一部作品。');
  }

  return html + keys.map((k) => {
    const [yy, mm] = k.split('-');
    return '<section class="section"><div class="section-head">' +
      '<h2 class="section-title">' + yy + ' 年 ' + Number(mm) + ' 月</h2>' +
      '<span class="section-note">' + groups[k].length + ' 条</span></div>' +
      '<div class="tl">' + groups[k].sort((a, b) => String(b.date).localeCompare(String(a.date))).map((i) =>
        '<button class="tl-item" data-action="' + i.action + '" data-id="' + i.id + '">' +
        '<span class="tl-dot is-' + i.kind + '"></span>' +
        '<span class="tl-body"><b>' + esc(i.title) + '</b><i>' + esc(i.sub) + ' · ' + esc(i.date.slice(5)) + '</i></span></button>').join('') +
      '</div></section>';
  }).join('');
}

function shift(delta) {
  const mode = ui.cal.mode || 'month';
  if (mode === 'month') {
    let m = ui.cal.month + delta;
    let y = ui.cal.year;
    if (m < 0) { m = 11; y--; }
    if (m > 11) { m = 0; y++; }
    ui.cal.year = y;
    ui.cal.month = m;
  } else if (mode === 'week') {
    ui.cal.anchor = addDays(ui.cal.anchor, delta * 7);
  } else {
    ui.cal.anchor = addDays(ui.cal.anchor, delta);
  }
  go('#/calendar');
}

export const actions = {
  'cal-mode': (el) => {
    ui.cal.mode = el.dataset.value;
    if (ui.cal.mode === 'month') {
      const d = parseISO(ui.cal.anchor);
      ui.cal.year = d.getFullYear();
      ui.cal.month = d.getMonth();
    }
    go('#/calendar');
  },
  'cal-filter': (el) => { ui.cal.filter = el.dataset.value; go('#/calendar'); },
  'cal-prev': () => shift(-1),
  'cal-next': () => shift(1),
  'cal-today': () => {
    const d = new Date();
    ui.cal.anchor = todayISO();
    ui.cal.year = d.getFullYear();
    ui.cal.month = d.getMonth();
    ui.cal.selected = todayISO();
    go('#/calendar');
  },
  'cal-day': (el) => {
    ui.cal.selected = ui.cal.selected === el.dataset.value ? '' : el.dataset.value;
    go('#/calendar');
  },
  'cal-open-day': (el) => {
    ui.cal.anchor = el.dataset.value;
    ui.cal.mode = 'day';
    go('#/calendar');
  },
  'tl-kind': (el) => {
    ui.timeline = ui.timeline || { kinds: {} };
    ui.timeline.kinds = Object.assign({ start: true, finish: true, collect: true, buy: true, review: true, excerpt: true }, ui.timeline.kinds || {});
    const k = el.dataset.value;
    ui.timeline.kinds[k] = ui.timeline.kinds[k] === false;
    go('#/timeline');
  },
  'cal-event': (el) => {
    const kind = el.dataset.kind;
    const id = el.dataset.id;
    if (kind === 'exp' || kind === 'release') go('#/work/' + id);
    else if (kind === 'rem') go('#/plans');
    else if (kind === 'money') go('#/finance/expenses');
    else if (kind === 'loan') go('#/loans');
    else if (kind === 'sub') go('#/finance/subs');
  }
};
