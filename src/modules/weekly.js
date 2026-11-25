/* ==========================================================
   次元簿 · 本周追更
   周表只做「提示」：每天按类型分组，显示 日期 / 标题 / 类型 / 更新频率，
   不带进度、不可点开详情。今天高亮；没设置更新日的可就地补设。
   ========================================================== */

import { liveWorks, bucketOf, detailsOf, saveWork, getWork } from '../core/repo.js';
import { typeDef } from '../core/schema.js';
import { ui, go } from '../core/state.js';
import { icon, toast, openModal, emptyState } from '../core/ui.js';
import { esc, todayISO } from '../core/format.js';

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function startOfWeek(offset) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - d.getDay() + (offset || 0) * 7);
  return d;
}

function ymd(d) {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

export function weekdayDetail(w) {
  const d = detailsOf(w.id);
  const raw = String(d.airWeekday || d.updateWeekday || '').replace(/^每周/, '').trim();
  return WEEKDAYS.indexOf(raw) >= 0 ? raw : '';
}

function cycleOf(w) {
  const d = detailsOf(w.id);
  return String(d.updateCycle || (weekdayDetail(w) ? '周更' : '') || '不定期');
}

function trackedWorks() {
  return liveWorks().filter((w) => ['doing', 'redoing'].indexOf(bucketOf(w)) >= 0 ||
    String(detailsOf(w.id).serialStatus || '') === '连载中');
}

export function updatesView() {
  const offset = Number(ui.weekOffset) || 0;
  const start = startOfWeek(offset);
  const today = todayISO();
  const list = trackedWorks();

  const byDay = WEEKDAYS.map(() => []);
  const unset = [];
  list.forEach((w) => {
    const day = weekdayDetail(w);
    if (day) byDay[WEEKDAYS.indexOf(day)].push(w);
    else if (String(detailsOf(w.id).updateCycle || '') === '日更') byDay.forEach((arr) => arr.push(w));
    else unset.push(w);
  });

  const weekLabel = (() => {
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    return ymd(start).slice(5).replace('-', '.') + ' – ' + ymd(end).slice(5).replace('-', '.');
  })();

  let html = '<header class="page-head">' +
    '<div class="head-left"><button class="icon-btn" data-action="back" aria-label="返回">' + icon('back', 20) + '</button>' +
    '<div><p class="eyebrow">追更排期 · ' + weekLabel + '</p><h1 class="page-title">本周追更</h1></div></div>' +
    '<div class="head-actions">' +
    '<button class="icon-btn" data-action="upd-prev" aria-label="上一周">' + icon('left', 19) + '</button>' +
    '<button class="icon-btn" data-action="upd-next" aria-label="下一周">' + icon('right', 19) + '</button>' +
    '</div></header>';

  html += '<div class="row-flex" style="gap:8px;margin-bottom:14px">' +
    (offset ? '<button class="btn btn-ghost btn-sm" data-action="upd-today">回到本周</button>' : '<span class="badge is-violet">本周</span>') +
    '<span class="fan-hint" style="margin:0">这里只是更新提示，不进入详情；按作品编辑里的「播出日 / 更新日」排表。</span></div>';

  if (!list.length) {
    return html + emptyState('·', '还没有在追的作品', '把状态改成「进行中」，并在作品编辑里填上更新日，周表就会自动排出来。',
      '<button class="btn btn-primary btn-sm" data-action="go" data-to="#/works">去档案馆</button>');
  }

  if (unset.length) {
    html += '<section class="section"><div class="section-head"><h2 class="section-title">还没设置更新日</h2>' +
      '<span class="section-note">' + unset.length + ' 部 · 点星期立即保存</span></div>' +
      '<div class="rows">' + unset.map((w) => '<div class="rowitem is-static">' +
        '<span class="rowitem-main"><b>' + esc(w.title) + '</b><i>' + esc(typeDef(w.type).label) + '</i></span>' +
        '<span class="upd-pick-wrap"><button class="icon-btn upd-pick" data-action="upd-pick" data-id="' + w.id + '" aria-label="设置更新日" title="设置更新日">' +
        icon('calendar', 18) + '</button></span></div>').join('') + '</div></section>';
  }


  html += '<div class="week-list">';
  WEEKDAYS.forEach((label, i) => {
    const date = new Date(start);
    date.setDate(date.getDate() + i);
    const iso = ymd(date);
    const items = byDay[i];
    const isToday = iso === today;
    const folded = (ui.weekCollapsed || []).indexOf(label) >= 0;

    /* 同一天按类型分组：电视剧放一起、期刊放一起、纪录片放一起 */
    const groups = [];
    const map = new Map();
    items.forEach((w) => {
      const key = typeDef(w.type).label;
      if (!map.has(key)) {
        const g = { label: key, list: [] };
        map.set(key, g);
        groups.push(g);
      }
      map.get(key).list.push(w);
    });

    html += '<section class="week-day2' + (isToday ? ' is-today' : '') + (folded ? ' is-folded' : '') + (items.length ? '' : ' is-empty') + '">' +
      '<header><b>' + label + '</b><i>' + iso.slice(5).replace('-', '.') + '</i>' +
      (!items.length ? '<span class="week-none">没有更新</span>' : '') +
      '<span class="week-head-right">' +
      (isToday ? '<em>今天</em>' : '') +
      (items.length ? '<button type="button" class="week-fold" data-action="week-fold" data-value="' + label + '" ' +
      'aria-label="' + (folded ? '展开' : '折叠') + '" aria-expanded="' + (!folded) + '">' +
      icon(folded ? 'down' : 'up', 16) + '</button>' : '') + '</span></header>';

    if (items.length) {
      html += '<div class="week-groups">';
      groups.forEach((g) => {
        html += '<div class="week-group"><p class="week-group-title">' + esc(g.label) + '</p>' +
          '<div class="week-items">' + g.list.map((w) =>
            '<div class="week-item"><b>' + esc(w.title) + '</b>' +
            '<span>' + esc(g.label + ' · ' + cycleOf(w)) + '</span></div>').join('') + '</div></div>';
      });
      html += '</div>';
    }
    html += '</section>';
  });
  html += '</div>';
  html += '<div style="height:calc(var(--tab-h) + 30px)"></div>';

  return html;
}

export const actions = {
  'week-fold': (el) => {
    const day = el.dataset.value;
    const arr = (ui.weekCollapsed || []).slice();
    const i = arr.indexOf(day);
    if (i >= 0) arr.splice(i, 1); else arr.push(day);
    ui.weekCollapsed = arr;
    const folded = arr.indexOf(day) >= 0;
    const sec = el.closest('.week-day2');
    if (sec) sec.classList.toggle('is-folded', folded);
    el.innerHTML = icon(folded ? 'down' : 'up', 16);
    el.setAttribute('aria-expanded', String(!folded));
    el.setAttribute('aria-label', folded ? '展开' : '折叠');
  },
  'upd-pick': (el) => {
    const w = getWork(el.dataset.id);
    if (!w) return;
    openModal({
      title: '设置更新日',
      desc: '「' + w.title + '」每周哪天更新？选好后会排进周表。',
      body: '<div class="weekday-pick">' + WEEKDAYS.map((d) =>
        '<button type="button" class="weekday-btn" data-day="' + d + '">' + d + '</button>').join('') + '</div>',
      actions: [{ label: '取消', value: null, variant: 'ghost' }],
      onMount: (root, close) => {
        root.querySelectorAll('[data-day]').forEach((btn) => {
          btn.addEventListener('click', () => close(btn.dataset.day));
        });
      }
    }).then(async (day) => {
      if (!day) return;
      const fields = Object.assign({}, detailsOf(w.id), { updateWeekday: day });
      const res = await saveWork(Object.assign({}, w), fields);
      if (!res.ok) { toast(res.error || '保存失败', 'error'); return; }
      toast('「' + w.title + '」更新日已设为 ' + day);
      go('#/updates');
    });
  },
  'upd-prev': () => { ui.weekOffset = (Number(ui.weekOffset) || 0) - 1; go('#/updates'); },
  'upd-next': () => { ui.weekOffset = (Number(ui.weekOffset) || 0) + 1; go('#/updates'); },
  'upd-today': () => { ui.weekOffset = 0; go('#/updates'); }
};
