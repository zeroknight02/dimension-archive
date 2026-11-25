/* ==========================================================
   次元簿 · 应用入口
   路由、导航、事件分发、启动自检、离线注册。
   说明书 16.5 / 16.9 / 16.10
   ========================================================== */

import { loadAll, loadImages, buildSearchIndex, onChange } from './../core/repo.js';
import * as repo from './../core/repo.js';
import { loadPrefs, pref, ui, parseRoute, go } from './../core/state.js';
import { icon, toast, openModal, emptyState } from './../core/ui.js';
import { esc } from './../core/format.js';
import { checkTimeout, setAutoLock, isUnlocked } from './../core/crypto.js';
import { runDemoFromUrl, takeDemoNotice } from './../core/demo.js';
import { PRESET_CATEGORIES } from './../core/schema.js';
import { decorateSelects } from './../core/options.js';

import { homeView, actions as homeActions } from './../modules/dashboard.js';
import { worksView, workDetailView, worksSplitView, isSplit, paintWorks, actions as worksActions } from './../modules/works.js';
import { workFormView, bindWorkForm, actions as formActions } from './../modules/workForm.js';
import { albumView, albumBookView, bindShelfDrag, maybeInsert, actions as albumActions } from './../modules/album.js';
import { yearbookView, actions as yearbookActions } from './../modules/yearbook.js';
import { experiencesView, actions as expActions } from './../modules/experiences.js';
import { collectionsView, actions as collActions } from './../modules/collections.js';
import { resourcesView, actions as resActions } from './../modules/resources.js';
import { reviewsView, reviewDetailView, paintReviews, actions as reviewActions } from './../modules/reviews.js';
import { excerptsView, paintExcerpts, actions as excerptActions } from './../modules/excerpts.js';
import { accountsView, actions as accountActions } from './../modules/accounts.js';
import { taxonomyView, actions as taxActions } from './../modules/taxonomy.js';
import { searchView, paintSearch, actions as searchActions } from './../modules/search.js';
import { statsView, actions as statsActions } from './../modules/stats.js';
import { settingsView, trashView, paintStorage, actions as setActions } from './../modules/settings.js';

/* 第二阶段起的模块（P1 - P4） */
import { hubView, actions as hubActions } from './../modules/hubs.js';
import { creatorsView, creatorDetail, paintCreators, actions as creatorActions } from './../modules/creators.js';
import { physicalView, actions as physicalActions } from './../modules/physical.js';
import { financeView, actions as financeActions } from './../modules/finance.js';
import { loansView, actions as loanActions } from './../modules/loans.js';
import { plansView, actions as planActions } from './../modules/plans.js';
import { calendarView, timelineView, actions as calActions } from './../modules/calendar.js';
import { discoverView, actions as discActions } from './../modules/discover.js';
import { graphView, seriesDetail, bindGraph, actions as graphActions } from './../modules/graph.js';
import { assistantView, initAssistant, bindAI, paintAsk, actions as aiActions } from './../modules/assistant.js';
import { actions as gameActions, bindShotUpload } from './../modules/gamedata.js';
import { actions as trackActions } from './../modules/tracks.js';
import { periodicalsView, periodicalDetail, actions as perActions } from './../modules/periodicals.js';
import { musicView, actions as musicActions } from './../modules/music.js';
import { notesView, paintNotes, actions as noteActions } from './../modules/notes.js';
import { analyticsView, actions as anaActions } from './../modules/analytics.js';
import { galleryView, actions as galActions } from './../modules/gallery.js';
import { updatesView, actions as updActions } from './../modules/weekly.js';
import {
  extensionsView, initExtensions, installPublicAPI, disabledModules, actions as extActions
} from './../modules/extensions.js';

const ACTIONS = Object.assign({},
  homeActions, worksActions, formActions, albumActions, yearbookActions, expActions,
  collActions, resActions, reviewActions, excerptActions, accountActions, taxActions,
  searchActions, statsActions, setActions,
  hubActions, creatorActions, physicalActions, financeActions, loanActions, planActions,
  calActions, discActions, graphActions, aiActions, anaActions, galActions, extActions,
  gameActions, trackActions, perActions, musicActions, noteActions, updActions,
  {
    go: (el) => { if (el.dataset.to) go(el.dataset.to); },
    back: () => go(backTarget())
  }
);

/* 详情页返回目标：优先回到来路，其次回所属主页 */
const PARENTS = {
  work: '#/works',
  review: '#/knowledge/reviews',
  creator: '#/creators',
  series: '#/graph',
  periodical: '#/periodicals',
  yearbook: '#/album'
};

function backTarget() {
  const n = ui.route.name;
  const prev = ui.prevRoute || '';
  if (prev && prev !== '#/' + n && prev.indexOf('#/new') !== 0 && prev.indexOf('#/edit') !== 0) return prev;
  return PARENTS[n] || '#/home';
}

/* ---------------- 导航 ---------------- */

const TABS = [
  { route: 'home', label: '总览', icon: 'home', to: '#/home' },
  { route: 'works', label: '档案馆', icon: 'book', to: '#/works' },
  { route: 'album', label: '收藏册', icon: 'shelf', to: '#/album' },
  { route: 'knowledge', label: '知识', icon: 'edit', to: '#/knowledge/reviews' },
  { route: 'more', label: '工具', icon: 'more', to: '#/more' }
];

const NAV_GROUPS = [
  {
    label: '档案',
    items: [
      { route: 'home', label: '总览', icon: 'home', to: '#/home' },
      { route: 'works', label: '档案馆', icon: 'book', to: '#/works' },
      { route: 'album', label: '收藏册', icon: 'shelf', to: '#/album' },
      { route: 'knowledge', label: '知识库', icon: 'edit', to: '#/knowledge/reviews', mod: 'knowledge' }
    ]
  },
  {
    label: '工具',
    items: [
      { route: 'assistant', label: '智能工具', icon: 'spark', to: '#/assistant', mod: 'assistant' },
      { route: 'accounts', label: '账号库', icon: 'lock', to: '#/accounts', mod: 'accounts' },
      { route: 'extensions', label: '扩展', icon: 'more', to: '#/extensions', mod: 'extensions' },
      { route: 'trash', label: '回收站', icon: 'trash', to: '#/trash' },
      { route: 'settings', label: '设置', icon: 'gear', to: '#/settings' }
    ]
  }
];

function isOff(mod) {
  return !!mod && disabledModules().indexOf(mod) >= 0;
}

/* 归入档案馆的功能页，高亮「档案馆」这个主导航 */
const WORK_ROUTES = ['works', 'work', 'new', 'edit', 'hub', 'creators', 'creator', 'physical', 'finance',
  'loans', 'plans', 'calendar', 'timeline', 'discover', 'graph', 'series', 'analytics', 'gallery',
  'stats', 'collections', 'resources', 'periodicals', 'periodical', 'updates'];

function activeOf(name) {
  if (WORK_ROUTES.indexOf(name) >= 0) return 'works';
  if (name === 'yearbook') return 'album';
  if (name === 'reviews' || name === 'excerpts' || name === 'notes' || name === 'review') return 'knowledge';
  return name;
}

function navHTML() {
  const active = activeOf(ui.route.name);
  return TABS.map((t) => '<a class="tab' + (t.route === active ? ' is-on' : '') + '" href="' + t.to + '" data-tab="' + t.route + '">' +
    icon(t.icon, 21) + '<span>' + t.label + '</span></a>').join('');
}

function sideHTML() {
  const active = activeOf(ui.route.name);
  return NAV_GROUPS.map((g) => {
    const items = g.items.filter((it) => !isOff(it.mod));
    if (!items.length) return '';
    return '<p class="nav-group">' + esc(g.label) + '</p>' +
      items.map((t) => '<a class="nav-link' + (t.route === active ? ' is-on' : '') + '" href="' + t.to + '">' +
        icon(t.icon, 18) + '<span>' + t.label + '</span></a>').join('');
  }).join('');
}

function moreView() {
  const items = [
    { label: '智能工具', icon: 'spark', desc: 'AI 整理、规则自动化与执行记录', to: '#/assistant' },
    { label: '账号库', icon: 'lock', desc: '加密保存账号与会员到期提醒', to: '#/accounts' },
    { label: '扩展', icon: 'more', desc: '自定义类型与字段、模块开关、开放接口', to: '#/extensions' },
    { label: '回收站', icon: 'trash', desc: '已删除的作品与恢复', to: '#/trash' },
    { label: '设置', icon: 'gear', desc: '主题、备份、导入导出与数据管理', to: '#/settings' }
  ].filter((i) => {
    const rec = NAV_GROUPS[1].items.find((x) => x.to === i.to);
    return !rec || !isOff(rec.mod);
  });

  return '<header class="page-head"><div><p class="eyebrow">工具与设置</p><h1 class="page-title">工具</h1></div></header>' +
    '<section class="section"><div class="rows">' + items.map((i) =>
      '<a class="rowitem" href="' + i.to + '"><span class="row-icon">' + icon(i.icon, 17) + '</span>' +
      '<span class="rowitem-main"><b>' + esc(i.label) + '</b><i>' + esc(i.desc) + '</i></span>' + icon('right', 16) + '</a>').join('') +
    '</section>' +
    '<p class="fan-hint" style="margin-top:16px">作品、收藏、追踪、研究、生活记录等功能都收在「档案馆」里，从底部第二个标签进入。</p>';
}

/* ---------------- 渲染 ---------------- */

function viewFor(r) {
  switch (r.name) {
    case 'home': return homeView();
    case 'works': return isSplit() ? worksSplitView() : worksView();
    case 'work': return isSplit() ? worksSplitView(r.id) : workDetailView(r.id);
    case 'new':
    case 'edit': return workFormView();
    case 'album': return r.id ? albumBookView(r.id) : albumView();
    case 'yearbook': return yearbookView(r.id || ui.album.type);
    case 'experiences': return experiencesView();
    case 'collections': return collectionsView();
    case 'resources': return resourcesView();
    case 'knowledge':
      if (r.id === 'notes') return notesView();
      if (r.id === 'excerpts') return excerptsView();
      return reviewsView();
    case 'reviews': return reviewsView();
    case 'notes': return notesView();
    case 'excerpts': return excerptsView();
    case 'accounts': return accountsView();
    case 'taxonomy': return taxonomyView();
    case 'search': return searchView();
    case 'stats': return statsView();
    case 'settings': return settingsView();
    case 'trash': return trashView();
    case 'more': return moreView();
    case 'updates': return updatesView();
    case 'hub': return hubView(r.id);
    case 'creators': return creatorsView();
    case 'creator': return creatorDetail(r.id);
    case 'physical': return physicalView();
    case 'finance': return financeView();
    case 'loans': return loansView();
    case 'plans': return plansView();
    case 'calendar': return calendarView();
    case 'timeline': return timelineView();
    case 'discover': return discoverView();
    case 'graph': return graphView();
    case 'series': return seriesDetail(r.id);
    case 'assistant': return assistantView();
    case 'analytics': return analyticsView();
    case 'gallery': return galleryView();
    case 'extensions': return extensionsView();
    case 'review': return reviewDetailView(r.id);
    case 'periodicals': return periodicalsView();
    case 'periodical': return periodicalDetail(r.id);
    case 'music': return musicView();
    default: return homeView();
  }
}

export function render(opts) {
  const o = opts || {};
  if (!ui.booted) return;
  const r = ui.route;
  const view = document.getElementById('view');
  if (!view) return;
  const y = window.scrollY;

  let html;
  try {
    html = viewFor(r);
  } catch (e) {
    console.error(e);
    html = '<div class="card"><h2 class="section-title">这一页出错了</h2>' +
      '<p class="muted" style="font-size:12.5px;margin-top:6px">' + esc(e.message || String(e)) + '</p>' +
      '<p class="muted" style="font-size:12.5px;margin-top:6px">数据没有丢失，可以返回上一页继续。</p>' +
      '<div style="margin-top:12px"><button class="btn btn-ghost btn-sm" data-action="go" data-to="#/home">回到首页</button></div></div>';
  }

  const wide = (r.name === 'album' && !r.id) || ((r.name === 'works' || r.name === 'work') && isSplit());
  view.innerHTML = '<div class="page' + (wide ? ' is-wide' : '') + (wide ? ' split-page' : '') + '">' + html + '</div>';
  document.getElementById('tabbar').innerHTML = navHTML();
  const navDesk = document.getElementById('nav-desktop');
  if (navDesk) navDesk.innerHTML = sideHTML();

  if (o.keepScroll) window.scrollTo(0, y);
  else window.scrollTo(0, 0);

  afterRender();
  decorateSelects(document.getElementById('view'));
}

function afterRender() {
  const r = ui.route;
  if (r.name === 'new' || r.name === 'edit') bindWorkForm(document.getElementById('view'));
  if (r.name === 'album' && !r.id) bindShelfDrag(document.getElementById('view'));
  if (r.name === 'album' && r.id) {
    bindBookSwipe();
    maybeInsert();
  }
  if (r.name === 'settings') paintStorage();
  if (r.name === 'graph') bindGraph(document.getElementById('view'));
  if ((r.name === 'works' || r.name === 'work') && isSplit()) bindShotUpload(document.getElementById('view'));
  if (r.name === 'assistant') bindAI(document.getElementById('view'));
  if (r.name === 'assistant' && ui.route.id === 'ai') {
    const box = document.getElementById('view');
    if (box) box.scrollTop = 0;
  }
  if (r.name === 'works') {
    const el = document.getElementById('works-search');
    if (el && ui.focusSearch) { el.focus(); ui.focusSearch = false; }
  }
  if (r.name === 'search') {
    const el = document.getElementById('global-search');
    if (el) el.focus();
  }
  if (r.name === 'assistant') {
    const imp = document.getElementById('ai-import');
    if (imp) {
      imp.addEventListener('input', () => { ui.aiImportText = imp.value; });
      imp.addEventListener('change', () => { ui.aiImportText = imp.value; });
    }
    const ask = document.getElementById('ai-ask');
    if (ask) {
      ask.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); ask.blur(); }
      });
      ask.addEventListener('input', () => {
        ui.aiQ = ask.value;
        clearTimeout(ui._askTimer);
        ui._askTimer = setTimeout(() => { paintAsk(); }, 340);
      });
    }
  }
}

window.__afterRender = afterRender;

function bindBookSwipe() {
  const bk = document.getElementById('bk');
  if (!bk) return;
  let sx = 0;
  let sy = 0;
  let tracking = false;
  bk.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    sx = e.touches[0].clientX;
    sy = e.touches[0].clientY;
    tracking = true;
  }, { passive: true });
  bk.addEventListener('touchend', (e) => {
    if (!tracking) return;
    tracking = false;
    const t = e.changedTouches[0];
    const dx = t.clientX - sx;
    const dy = t.clientY - sy;
    if (Math.abs(dx) < 46 || Math.abs(dy) > Math.abs(dx) * 0.8) return;
    if (dx < 0) ACTIONS['book-next']();
    else ACTIONS['book-prev']();
  }, { passive: true });
}

/* ---------------- 事件 ---------------- */

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const name = el.dataset.action;
  const fn = ACTIONS[name];
  if (!fn) return;
  e.preventDefault();
  fn(el, e);
});

document.addEventListener('change', (e) => {
  const el = e.target;
  if (el.dataset && el.dataset.change === 'works-type') {
    ui.filter = Object.assign({}, ui.filter, { type: el.value });
    pref('works', Object.assign({}, pref('works') || {}, ui.filter));
    ui.worksLimit = 36;
    paintWorks();
  }
  if (el.dataset && el.dataset.change === 'works-sort') {
    ui.filter = Object.assign({}, ui.filter, { sort: el.value });
    pref('works', Object.assign({}, pref('works') || {}, ui.filter));
    paintWorks();
  }
  if (el.dataset && /^sf-(type|year|tag)$/.test(el.dataset.change || '')) {
    const k = el.dataset.change.slice(3);
    ui.searchFilter = Object.assign({ type: 'all', year: 'all', tag: 'all' }, ui.searchFilter || {}, { [k]: el.value });
    paintSearch();
  }
  if (el.dataset && el.dataset.change === 'coll-type') { ui.collType = el.value; go('#/collections'); }
  if (el.dataset && /^disc-(scope|target|type|tag)$/.test(el.dataset.change || '')) {
    const k = el.dataset.change;
    const act = { 'disc-scope': 'disc-scope', 'disc-target': 'disc-target', 'disc-type': 'disc-type', 'disc-tag': 'disc-tag' }[k];
    if (ACTIONS[act]) ACTIONS[act]({ dataset: { value: el.value } });
  }
  if (el.dataset && /^tl-(year|month|tag)$/.test(el.dataset.change || '')) {
    const k = el.dataset.change.slice(3);
    ui.timeline = Object.assign({ year: '', month: '', tag: '', kinds: { start: true, finish: true, collect: true, buy: true, review: true, excerpt: true } }, ui.timeline || {});
    ui.timeline[k] = el.value;
    go('#/timeline');
  }
  if (el.dataset && el.dataset.change === 'ex-type') { ui.exType = el.value; paintExcerpts(); }
  if (el.dataset && el.dataset.change === 'ex-work') { ui.exWork = el.value; paintExcerpts(); }
  if (el.dataset && el.dataset.change === 'rev-type') { ui.revType = el.value; paintReviews(); }
  if (el.dataset && el.dataset.change === 'ana-a') { ui.anaA = el.value; go('#/analytics/compare'); }
  if (el.dataset && el.dataset.change === 'ana-b') { ui.anaB = el.value; go('#/analytics/compare'); }
  if (el.dataset && el.dataset.change === 'ana-dim') { ui.anaDim = el.value; go('#/analytics/custom'); }
  if (el.dataset && el.dataset.change === 'ana-measure') { ui.anaMeasure = el.value; go('#/analytics/custom'); }
});

/* 搜索框：只重绘结果区，不动输入框本身 —— 否则手机键盘会在第一个字后收起 */
const LIVE_SEARCH = {
  'works-search': (v) => { ui.worksQ = v; ui.worksLimit = 36; paintWorks(); },
  'global-search': (v) => { ui.search = v; paintSearch(); },
  'creator-search': (v) => { ui.creatorQ = v; paintCreators(); },
  'rev-search': (v) => { ui.revQ = v; paintReviews(); },
  'ex-search': (v) => { ui.exQ = v; paintExcerpts(); },
  'note-search': (v) => { ui.noteQ = v; paintNotes(); }
};

let searchTimer = null;
document.addEventListener('input', (e) => {
  const el = e.target;
  const fn = el && el.id ? LIVE_SEARCH[el.id] : null;
  if (!fn) return;
  const v = el.value;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => fn(v), 160);
});

document.addEventListener('keydown', (e) => {
  const typing = /input|textarea|select/i.test(e.target.tagName || '') || e.target.isContentEditable;

  if (e.key === 'Escape') {
    const modal = document.querySelector('.modal-backdrop.is-on');
    if (!modal && ui.route.name !== 'home') {
      const back = document.querySelector('[data-action="back"], [data-action="go"][data-to="#/album"]');
      if (back) return;
    }
  }

  if (typing || e.metaKey || e.ctrlKey || e.altKey) return;

  if (e.key === '/') {
    e.preventDefault();
    go('#/search');
    setTimeout(() => {
      const el = document.getElementById('global-search');
      if (el) el.focus();
    }, 60);
    return;
  }
  if (e.key === 'n' || e.key === 'N') {
    e.preventDefault();
    ACTIONS['new-work']({ dataset: {} });
    return;
  }
  if (e.key === 'f' || e.key === 'F') {
    e.preventDefault();
    go('#/works');
    setTimeout(() => {
      const el = document.getElementById('works-search');
      if (el) el.focus();
    }, 80);
    return;
  }
  if (e.key === '?') {
    e.preventDefault();
    openModal({
      title: '键盘快捷键',
      body: '<div class="kv">' +
        '<div class="kv-row"><span>搜索</span><b>/</b></div>' +
        '<div class="kv-row"><span>新建作品</span><b>N</b></div>' +
        '<div class="kv-row"><span>打开档案馆并聚焦搜索</span><b>F</b></div>' +
        '<div class="kv-row"><span>关闭弹窗</span><b>Esc</b></div>' +
        '<div class="kv-row"><span>本帮助</span><b>?</b></div></div>',
      actions: [{ label: '关闭', value: null, variant: 'ghost' }]
    });
  }
});

let resizeTimer = null;
let lastWidth = window.innerWidth;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    const w = window.innerWidth;
    const crossed = (lastWidth >= 768) !== (w >= 768) || (lastWidth >= 1024) !== (w >= 1024);
    lastWidth = w;
    const name = ui.route.name;
    /* 横竖屏 / 窗口缩放：双栏与单栏要正确切换，且保留当前选中 */
    if (crossed || ['album', 'works', 'work'].indexOf(name) >= 0) render({ keepScroll: true });
  }, 260);
});

window.addEventListener('hashchange', () => {
  const prev = ui.route;
  const r = parseRoute();
  ui.prevRoute = '#/' + prev.name + (prev.id ? '/' + prev.id : '');
  ui.route = r;
  if (['works', 'home', 'album', 'settings'].indexOf(prev.name) >= 0 && r.name !== prev.name) {
    ui.returnTo = '#/' + prev.name + (prev.id ? '/' + prev.id : '');
  }
  if (r.name === 'album' && !r.id) ui.album = { type: '', page: 0, q: '' };
  if (r.name === 'yearbook') {
    if (ui.yearbook.type !== r.id) ui.yearbook = { type: r.id || '', year: '', month: 0, index: 1 };
  }
  if (r.name !== 'works') ui.selectMode = false;
  if (isUnlocked()) checkTimeout();
  ui.editing = null;
  render();
});

/* 16.7 未保存修改：关闭 / 刷新前提示 */
window.addEventListener('beforeunload', (e) => {
  if ((ui.route.name === 'new' || ui.route.name === 'edit') && ui.dirty) {
    e.preventDefault();
    e.returnValue = '';
    return '';
  }
  return null;
});

/* ---------------- 主题 ---------------- */

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#17132F' : '#FAF7FF');
}

/* ---------------- 启动 ---------------- */

async function boot() {
  loadPrefs();
  applyTheme(pref('theme') || 'dark');
  setAutoLock(pref('autoLock') === 0 ? 0 : (pref('autoLock') || 10));

  ui.route = parseRoute();
  const view = document.getElementById('view');
  view.innerHTML = '<div class="boot"><span class="boot-ring"></span><p>正在打开档案…</p></div>';

  const ok = await loadAll();
  if (!ok) {
    ui.booted = true;
    view.innerHTML = '<div class="page">' + emptyState('·', '数据库打不开',
      '浏览器可能处于无痕模式，或站点存储被禁用。换用普通窗口再试，或检查浏览器设置。',
      '<button class="btn btn-ghost btn-sm" onclick="location.reload()">重试</button>') + '</div>';
    return;
  }

  /* 示例数据：?demo=1 载入、?demo=0 清除；执行后会自行刷新 */
  if (await runDemoFromUrl()) return;

  initExtensions();
  await loadImages();
  buildSearchIndex();
  installPublicAPI({ repo });
  initAssistant();
  ui.booted = true;
  window.__BOOT_OK = true;

  /* 弹窗/动态内容里新出现的下拉框也要自动挂上「＋」选项管理 */
  let optTimer = null;
  const optObserver = new MutationObserver(() => {
    clearTimeout(optTimer);
    optTimer = setTimeout(() => decorateSelects(document), 40);
  });
  optObserver.observe(document.body, { childList: true, subtree: true });
  decorateSelects(document);

  /* 数据一有变动就刷新当前页（表单页除外，避免输入被冲掉） */
  onChange(() => {
    if (!ui.booted) return;
    if (ui.suspendRender) return;
    if (ui.route.name === 'new' || ui.route.name === 'edit') return;
    render({ keepScroll: true });
  });

  document.getElementById('tabbar').innerHTML = navHTML();
  const navDesk = document.getElementById('nav-desktop');
  if (navDesk) navDesk.innerHTML = sideHTML();

  render();

  /* 首次启动补上题材分类预设（不阻塞首屏） */
  repo.seedPresetCategories(PRESET_CATEGORIES).catch(() => {});

  const demoNotice = takeDemoNotice();
  if (demoNotice) setTimeout(() => toast(demoNotice), 700);

  /* 备份提醒：超过 14 天未导出 */
  const last = Number(pref('backupAt')) || 0;
  if (last && Date.now() - last > 14 * 86400000 && !pref('backupNudgeOff')) {
    setTimeout(() => { toast('已经两周没备份了，可在设置里导出'); }, 1600);
    pref('backupNudgeOff', true);
  }

  /* Service Worker：只在 https / localhost 下注册 */
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    try {
      const reg = await navigator.serviceWorker.register('./service-worker.js', { scope: './' });
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            openModal({
              title: '有新版本',
              desc: '更新会在你确认后应用，当前编辑不会被强制刷新。',
              body: '<p class="muted" style="font-size:12.5px">你正在录入的内容不会丢失。</p>',
              actions: [
                { label: '稍后', value: null, variant: 'ghost' },
                { label: '刷新更新', value: 'ok', variant: 'primary' }
              ]
            }).then((v) => {
              if (v === 'ok' && reg.waiting) {
                reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                setTimeout(() => location.reload(), 400);
              }
            });
          }
        });
      });
    } catch (e) { /* 离线能力失败不影响使用 */ }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && isUnlocked()) checkTimeout();
  });
}

boot().catch((e) => {
  console.error(e);
  const view = document.getElementById('view');
  if (view) {
    view.innerHTML = '<div class="page"><div class="card"><h2 class="section-title">启动失败</h2>' +
      '<p class="muted" style="font-size:12.5px;margin-top:6px">' + esc(e.message || String(e)) + '</p></div></div>';
  }
});
