/* ==========================================================
   次元簿 · 专业化文化管理中心
   说明书 6.1 阅读 / 6.2 影视追踪 / 6.3 游戏 / 6.4 音乐 / 6.5 漫画动漫
   五个中心共用一套渲染骨架，差异全部来自数据：
   类型集合、状态集、进度模式、专属字段都在 schema 里定义。
   ========================================================== */

import { data, liveWorks, detailsOf, experiencesOf, latestExperience, finishedDate, workStatus, statusText, bucketOf, coverUrl, readingStats } from '../core/repo.js';
import { HUB_GROUPS, typeDef } from '../core/schema.js';
import { ui, go } from '../core/state.js';
import { icon, emptyState } from '../core/ui.js';
import { esc, progressText, initials, coverColor, ratingShort, fmtHours } from '../core/format.js';


const HUB_INTRO = {
  reading: '在读、读完、想读，以及每个月读了多少页。',
  screen: '想看、在追、看完，按更新日把在追的排在前面。',
  game: '在玩、通关、全成就，时长与平台一目了然。',
  music: '专辑与单曲，谁在循环、哪年出的、什么厂牌。',
  comic: '连载进度、更新频率、追到第几话。'
};

function typesOf(kind) {
  const g = HUB_GROUPS[kind];
  return g ? g.types : [];
}

export function hubWorks(kind) {
  const set = typesOf(kind);
  return liveWorks().filter((w) => set.indexOf(w.type) >= 0);
}

function hubStats(list) {
  const b = { wish: 0, doing: 0, done: 0, dropped: 0, paused: 0 };
  list.forEach((w) => {
    const k = bucketOf(w);
    if (k === 'todo' || k === 'wish') b.wish++;
    else if (k === 'doing' || k === 'redoing') b.doing++;
    else if (k === 'done') b.done++;
    else if (k === 'dropped') b.dropped++;
    else if (k === 'paused') b.paused++;
  });
  const hours = list.reduce((a, w) => {
    let h = 0;
    experiencesOf(w.id).forEach((e) => { if (e.progress && e.progress.hours) h += Number(e.progress.hours) || 0; });
    if (!h) h = Number(detailsOf(w.id).playTime) || 0;
    return a + h;
  }, 0);
  const pages = list.reduce((a, w) => a + (Number(detailsOf(w.id).pages) || 0), 0);
  const rated = list.filter((w) => w.rating > 0);
  const avg = rated.length ? rated.reduce((a, w) => a + w.rating, 0) / rated.length : 0;
  return { n: list.length, b, hours, pages, avg };
}

function hubMeta(kind, w) {
  const d = detailsOf(w.id);
  const def = typeDef(w.type);
  const ex = latestExperience(w.id);
  const prog = ex ? progressText(def, ex.progress) : '';
  if (kind === 'reading') {
    const rs = readingStats(w.id);
    return [prog, d.pages ? d.pages + ' 页' : '', d.words ? d.words + ' 万字' : '',
      rs.days ? '日均 ' + rs.perDay + ' 页 · 连续 ' + rs.streak + ' 天' : '',
      d.publisher, d.serialStatus].filter(Boolean);
  }
  if (kind === 'screen') {
    return [prog, d.channel, d.airWeekday, d.epCount ? '共 ' + d.epCount + ' 集' : '',
      d.runtime ? d.runtime + ' 分钟' : ''].filter(Boolean);
  }
  if (kind === 'game') {
    const h = ex && ex.progress && ex.progress.hours ? ex.progress.hours : d.playTime;
    return [prog, h ? fmtHours(h) + ' 小时' : '', d.platforms, d.chineseSupport,
      d.achievementsTotal ? d.achievementsTotal + ' 成就' : ''].filter(Boolean);
  }
  if (kind === 'music') {
    return [d.tracks ? d.tracks + ' 首' : '', d.label, d.albumType, d.releaseDate, w.creator].filter(Boolean);
  }
  return [prog, d.serialStatus, d.updateCycle, d.epCount ? '共 ' + d.epCount + ' 话' : '',
    d.volumes ? '共 ' + d.volumes + ' 卷' : ''].filter(Boolean);
}

export function hubView(kind) {
  const k = HUB_GROUPS[kind] ? kind : 'reading';
  const g = HUB_GROUPS[k];
  const all = hubWorks(k);
  const st = hubStats(all);
  let tab = ui.hubTab && ui.hubTab[k] ? ui.hubTab[k] : 'doing';
  /* 默认落在有内容的标签，别一进来就是空列表 */
  if (!ui.hubTab || !ui.hubTab[k]) {
    if (!st.b.doing && st.b.done) tab = 'done';
    else if (!st.b.doing && !st.b.done && st.b.wish) tab = 'wish';
  }

  let list = all.slice();
  if (tab === 'doing') list = list.filter((w) => ['doing', 'redoing'].indexOf(bucketOf(w)) >= 0);
  else if (tab === 'done') list = list.filter((w) => bucketOf(w) === 'done');
  else if (tab === 'wish') list = list.filter((w) => ['wish', 'todo'].indexOf(bucketOf(w)) >= 0);
  else if (tab === 'dropped') list = list.filter((w) => ['dropped', 'paused'].indexOf(bucketOf(w)) >= 0);

  /* 在追的按更新日排序，其余按完成/更新时间 */
  if (tab === 'doing') {
    const order = { 周一: 1, 周二: 2, 周三: 3, 周四: 4, 周五: 5, 周六: 6, 周日: 7 };
    list.sort((a, b) => {
      const wa = String(detailsOf(a.id).airWeekday || detailsOf(a.id).updateWeekday || '');
      const wb = String(detailsOf(b.id).airWeekday || detailsOf(b.id).updateWeekday || '');
      const oa = order[wa.replace('每周', '周')] || 9;
      const ob = order[wb.replace('每周', '周')] || 9;
      return oa - ob;
    });
  } else {
    list.sort((a, b) => String(finishedDate(b) || b.updatedAt).localeCompare(String(finishedDate(a) || a.updatedAt)));
  }

  let html = '<header class="page-head">' +
    '<div class="head-left"><button class="icon-btn" data-action="go" data-to="#/works" aria-label="返回档案馆">' + icon('back', 20) + '</button>' +
    '<div><p class="eyebrow">' + esc(g.label) + '中心 · ' + all.length + ' 部</p>' +
    '<h1 class="page-title">' + esc(g.label) + '</h1></div></div>' +
    '<div class="head-actions"><button class="icon-btn" data-action="new-work" data-value="' + (g.types[0] || 'book') + '" aria-label="新增">' + icon('plus', 20) + '</button></div>' +
    '</header>';

  html += '<p class="fan-hint">' + esc(HUB_INTRO[k]) + '</p>';

  html += '<div class="stat-grid" style="margin-bottom:16px">' +
    '<div class="stat"><b>' + st.n + '</b><span>收录</span></div>' +
    '<div class="stat"><b>' + st.b.doing + '</b><span>进行中</span></div>' +
    '<div class="stat"><b>' + st.b.done + '</b><span>已完成</span></div>' +
    '<div class="stat"><b>' + (st.hours ? fmtHours(st.hours) : (st.pages ? st.pages : (st.avg ? ratingShort(st.avg) : '0'))) + '</b>' +
    '<span>' + (st.hours ? '小时' : (st.pages ? '总页数' : '平均分')) + '</span></div>' +
    '</div>';

  html += '<div class="segbar" style="margin-bottom:14px">' +
    [['doing', '在追 ' + st.b.doing], ['done', '已完成 ' + st.b.done], ['wish', '想体验 ' + st.b.wish], ['dropped', '搁置 ' + (st.b.paused + st.b.dropped)]]
      .map((t) => '<button class="' + (tab === t[0] ? 'is-on' : '') + '" data-action="hub-tab" data-value="' + t[0] + '">' + t[1] + '</button>').join('') +
    '</div>';

  if (!all.length) {
    return html + emptyState('·', '这一块还没有内容', '把' + g.label + '类的作品记进来，这里会按状态自动归类。',
      '<button class="btn btn-primary btn-sm" data-action="new-work" data-value="' + (g.types[0] || 'book') + '">＋ 添加</button>');
  }
  if (!list.length) return html + emptyState('·', '这个分组是空的', '换个状态看看。');

  return html + '<div class="rows">' + list.map((w) => {
    const cover = coverUrl(w);
    const meta = hubMeta(k, w);
    return '<button class="rowitem" data-action="open-work" data-id="' + w.id + '">' +
      '<span class="cover" style="--cc:' + coverColor(w.title) + ';width:42px;flex:0 0 42px">' +
      (cover ? '<img src="' + esc(cover) + '" alt="" loading="lazy">' : '<b>' + esc(initials(w.title)) + '</b>') + '</span>' +
      '<span class="rowitem-main"><b>' + esc(w.title) + '</b>' +
      '<i>' + esc(meta.join(' · ') || '—') + '</i></span>' +
      '<span class="rowitem-side">' +
      '<span class="st st-' + workStatus(w) + '">' + esc(statusText(w)) + '</span>' +
      (w.rating ? '<span class="hub-rate">★ ' + ratingShort(w.rating) + '</span>' : '') +
      '</span></button>';
  }).join('') + '</div>';
}

export const actions = {
  'hub-tab': (el) => {
    const kind = ui.route.id || 'reading';
    ui.hubTab = ui.hubTab || {};
    ui.hubTab[kind] = el.dataset.value;
    go('#/hub/' + kind);
  }
};
