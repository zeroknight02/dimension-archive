/* ==========================================================
   次元簿 · 作品档案库
   说明书 5.2：一部作品只有一份主档案；列表支持筛选、排序、
   三种视图、分页、批量操作与重复检测入口。
   ========================================================== */

import { data, liveWorks, getWork, detailsOf, experiencesOf, workStatus, statusText, bucketOf, coverUrl, classNamesFor, deleteWork, relatedCounts, saveWork, emit, resources, saveTag, tagByName, workCreatorsOf, creatorOf, seriesOf, physical, loans, backlinksOf, copyWork, thumbUrl, episodes as epStore, episodesOf, episodeStats, sessions as sesStore, readingStats, statusHistory, savedFilters, notesOfWork, collections, creators, periodicalGroups } from '../core/repo.js';
import { TYPES, GROUPS, FIELDS, typeDef } from '../core/schema.js';
import { pref, ui, go } from '../core/state.js';
import { icon, toast, openModal, confirmDialog, emptyState, chips, groupIcon } from '../core/ui.js';
import { esc, ratingShort, initials, coverColor, progressText, todayISO } from '../core/format.js';
import { achievementsSection, playthroughsSection, shotsSection } from './gamedata.js';
import { tracksSection } from './tracks.js';

const PAGE = 36;

const FILTER_DEFAULTS = {
  type: 'all', status: 'all', tag: 'all', year: 'all', rating: 'all', sort: 'updated',
  /* 6.9 高级筛选 */
  creator: '', country: '', ratingMin: '', ratingMax: '',
  hasSummary: '', hasExcerpt: '', hasResource: '', hasPhysical: '', ebook: '', scope: 'all'
};

export function filterState() {
  return Object.assign({}, FILTER_DEFAULTS, pref('works') || {}, ui.filter || {});
}

export function activeAdvCount() {
  const f = filterState();
  let n = 0;
  ['creator', 'country', 'ratingMin', 'ratingMax', 'hasSummary', 'hasExcerpt', 'hasResource', 'hasPhysical', 'ebook']
    .forEach((k) => { if (f[k]) n++; });
  if (f.scope && f.scope !== 'all') n++;
  return n;
}

export function filteredWorks() {
  const f = filterState();
  const q = String(ui.worksQ || '').trim().toLowerCase();
  let list = liveWorks();

  if (f.type !== 'all') list = list.filter((w) => w.type === f.type);
  if (f.status !== 'all') {
    list = list.filter((w) => {
      const b = bucketOf(w);
      return f.status === 'open' ? ['wish', 'todo'].indexOf(b) >= 0 : b === f.status;
    });
  }
  if (f.tag !== 'all') list = list.filter((w) => (w.tagIds || []).indexOf(f.tag) >= 0);
  if (f.year !== 'all') list = list.filter((w) => String(w.year || '') === String(f.year));
  if (f.rating !== 'all') {
    const min = Number(f.rating) || 0;
    list = list.filter((w) => (w.rating || 0) >= min);
  }
  if (f.creator) {
    const c = String(f.creator).toLowerCase();
    list = list.filter((w) => String(w.creator || '').toLowerCase().indexOf(c) >= 0);
  }
  if (f.country) {
    const c = String(f.country).toLowerCase();
    list = list.filter((w) => {
      const ids = data.workCreators.filter((x) => x.workId === w.id).map((x) => x.creatorId);
      return ids.some((id) => {
        const p = data.creators.find((x) => x.id === id);
        return p && String(p.country || '').toLowerCase().indexOf(c) >= 0;
      });
    });
  }
  if (f.ratingMin !== '' && f.ratingMin != null) {
    const min = Number(f.ratingMin) || 0;
    list = list.filter((w) => (Number(w.rating) || 0) >= min);
  }
  if (f.ratingMax !== '' && f.ratingMax != null) {
    const max = Number(f.ratingMax);
    if (!isNaN(max)) list = list.filter((w) => (Number(w.rating) || 0) <= max);
  }
  if (f.hasSummary === '1') {
    const ids = new Set(data.reviews.filter((r) => !r.deletedAt).map((r) => r.workId));
    list = list.filter((w) => ids.has(w.id));
  }
  if (f.hasExcerpt === '1') {
    const ids = new Set(data.excerpts.filter((x) => !x.deletedAt).map((x) => x.workId));
    list = list.filter((w) => ids.has(w.id));
  }
  if (f.hasResource === '1') {
    const ids = new Set(data.resources.filter((r) => !r.deletedAt).map((r) => r.workId));
    list = list.filter((w) => ids.has(w.id));
  }
  if (f.hasPhysical === '1') {
    const ids = new Set(data.physical.filter((p2) => !p2.deletedAt).map((p2) => p2.workId));
    list = list.filter((w) => ids.has(w.id));
  }
  if (f.ebook === '1') {
    list = list.filter((w) => {
      const d = detailsOf(w.id);
      const fmt = String(d.format || '');
      const res = data.resources.some((r) => !r.deletedAt && r.workId === w.id &&
        ['PDF', 'EPUB', 'MOBI', 'AZW3', 'TXT', 'DOCX'].indexOf(String(r.format || '').toUpperCase()) >= 0);
      return fmt.indexOf('电子') >= 0 || res;
    });
  }
  if (f.scope === 'undone') list = list.filter((w) => bucketOf(w) !== 'done');
  if (f.scope === 'done') list = list.filter((w) => bucketOf(w) === 'done');

  if (q) {
    list = list.filter((w) => {
      const tags = (w.tagIds || []).map((id) => {
        const t = data.tags.find((x) => x.id === id);
        return t ? t.name : '';
      }).join(' ');
      const hay = [w.title, w.originalTitle, (w.aliases || []).join(' '), w.creator, w.year, tags].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }

  const sort = f.sort;
  list = list.slice().sort((a, b) => {
    if (sort === 'title') return String(a.title).localeCompare(String(b.title), 'zh-Hans-CN');
    if (sort === 'rating') return (b.rating || 0) - (a.rating || 0) || String(b.updatedAt).localeCompare(String(a.updatedAt));
    if (sort === 'created') return String(b.createdAt).localeCompare(String(a.createdAt));
    if (sort === 'year') return String(b.year || '').localeCompare(String(a.year || ''));
    return String(b.updatedAt).localeCompare(String(a.updatedAt));
  });
  return list;
}

/* ---------------- 卡片 ---------------- */

export function workCard(w, view, opts) {
  const o = opts || {};
  const cover = thumbUrl(w);
  const rate = w.rating ? ratingShort(w.rating) : '';
  const st = statusText(w);
  const sel = !!o.selected;
  const cls = 'wcard' + (view === 'list' ? ' is-list' : view === 'compact' ? ' is-compact' : '') + (sel ? ' is-selected' : '');
  const coverHTML = '<span class="wcard-cover" style="--cc:' + coverColor(w.title) + '">' +
    (cover ? '<img src="' + esc(cover) + '" alt="" loading="lazy">' : '<span class="ph">' + esc(initials(w.title)) + '</span>') +
    (o.selectable ? '<span class="wcard-check">' + (sel ? icon('check', 13) : '') + '</span>' : '') +
    '</span>';

  if (view === 'compact') {
    return '<button class="' + cls + '" data-action="open-work" data-id="' + w.id + '">' +
      coverHTML + '<b>' + esc(w.title) + '</b>' +
      '<span class="st st-' + workStatus(w) + '">' + esc(st) + '</span>' +
      '<span class="wcard-rate">' + (rate ? '★ ' + rate : '—') + '</span></button>';
  }
  if (view === 'list') {
    return '<button class="' + cls + '" data-action="open-work" data-id="' + w.id + '">' +
      coverHTML +
      '<span class="wcard-body"><span class="wcard-top"><i class="wtype" style="--tc:' + typeDef(w.type).color + '">' +
      groupIcon(typeDef(w.type).group, 12) + esc(typeDef(w.type).label) + '</i>' +
      '<span class="st st-' + workStatus(w) + '">' + esc(st) + '</span></span>' +
      '<b class="wcard-title">' + esc(w.title) + '</b>' +
      '<span class="wcard-sub">' + esc([w.creator, w.year].filter(Boolean).join(' · ') || '—') + '</span>' +
      '<span class="wcard-foot">' + (rate ? '<span class="wcard-rate">★ ' + rate + '</span>' : '') +
      classNamesFor(w).slice(1, 3).map((x) => '<span class="tagpill">' + esc(x) + '</span>').join('') +
      '</span></span></button>';
  }
  return '<button class="' + cls + '" data-action="open-work" data-id="' + w.id + '">' +
    coverHTML +
    '<span class="wcard-body"><span class="wcard-top"><i class="wtype" style="--tc:' + typeDef(w.type).color + '">' +
    esc(typeDef(w.type).label) + '</i><span class="st st-' + workStatus(w) + '">' + esc(st) + '</span></span>' +
    '<b class="wcard-title">' + esc(w.title) + '</b>' +
    '<span class="wcard-sub">' + esc([w.creator, w.year].filter(Boolean).join(' · ') || '—') + '</span>' +
    '<span class="wcard-foot">' + (rate ? '<span class="wcard-rate">★ ' + rate + '</span>' : '<span class="wcard-rate is-none">未评分</span>') +
    '</span></span></button>';
}

/* ---------------- 档案馆：功能入口 ---------------- */

function hubCounts() {
  const all = liveWorks();
  return {
    collections: collections.list().filter((c) => getWork(c.workId)).length,
    physical: data.physical.filter((p) => !p.deletedAt).length,
    periodicals: all.filter((w) => w.type === 'magazine' || w.type === 'newspaper').length,
    resources: data.resources.filter((r) => !r.deletedAt).length,
    creators: creators.list().length,
    rated: all.filter((w) => w.rating > 0).length
  };
}

function hubRail() {
  const c = hubCounts();
  const groups = [
    {
      label: '收藏与整理',
      items: [
        { label: '待体验', icon: 'star', to: '#/collections', meta: c.collections ? c.collections + ' 条' : '清单' },
        { label: '实体收藏', icon: 'layers', to: '#/physical', meta: c.physical ? c.physical + ' 件' : '书架与柜子' },
        { label: '刊系', icon: 'book', to: '#/periodicals', meta: c.periodicals ? c.periodicals + ' 期' : '按刊归档' },
        { label: '资源库', icon: 'folder', to: '#/resources', meta: c.resources ? c.resources + ' 个' : '电子文件' },
        { label: '收藏展馆', icon: 'grid', to: '#/gallery', meta: '海报墙' }
      ]
    },
    {
      label: '研究与分析',
      items: [
        { label: '人物库', icon: 'user', to: '#/creators', meta: c.creators ? c.creators + ' 人' : '作者与导演' },
        { label: '分类专题', icon: 'tag', to: '#/taxonomy', meta: '分类 / 标签' },
        { label: '关系图谱', icon: 'link', to: '#/graph', meta: '系列与关联' },
        { label: '数据分析', icon: 'chart', to: '#/analytics', meta: '对比与洞察' },
        { label: '基础统计', icon: 'chart', to: '#/stats', meta: '年度概览' },
        { label: '专业中心', icon: 'spark', to: '#/hub/reading', meta: '分类型追踪' },
        { label: '音乐中心', icon: 'music', to: '#/music/rank', meta: '专辑榜单' }
      ]
    },
    {
      label: '生活与时间',
      items: [
        { label: '消费订阅', icon: 'chart', to: '#/finance/expenses', meta: '花销与会员' },
        { label: '借还', icon: 'link', to: '#/loans', meta: '借出 / 借入' },
        { label: '目标提醒', icon: 'clock', to: '#/plans', meta: '年度目标' },
        { label: '日历', icon: 'calendar', to: '#/calendar', meta: '按天回看' },
        { label: '时间轴', icon: 'shelf', to: '#/timeline', meta: '收藏轨迹' },
        { label: '发现', icon: 'spark', to: '#/discover', meta: '抽一部' }
      ]
    }
  ];

  return '<section class="archive-rail">' + groups.map((g) =>
    '<div class="rail-group"><p class="rail-label">' + esc(g.label) + '</p><div class="rail-items">' +
    g.items.map((i) => '<a class="rail-item" href="' + i.to + '">' +
      '<span class="rail-ico">' + icon(i.icon, 16) + '</span>' +
      '<span class="rail-txt"><b>' + esc(i.label) + '</b><i>' + esc(i.meta) + '</i></span></a>').join('') +
    '</div></div>').join('') + '</section>';
}

/* ---------------- 列表页 ---------------- */

function worksBodyHTML() {
  const f = filterState();
  const view = pref('works.view') || 'grid';
  const list = filteredWorks();
  const shown = ui.worksLimit || PAGE;

  if (!liveWorks().length) {
    return emptyState('·', '还没有作品', '从一部书、一部电影开始，之后所有体验、摘抄、总结都会挂在它下面。',
      '<button class="btn btn-primary btn-sm" data-action="new-work">＋ 添加第一部作品</button>');
  }
  if (!list.length) {
    return emptyState('·', '没有符合条件的作品', '换个类型、状态或关键词看看。',
      '<button class="btn btn-ghost btn-sm" data-action="works-clear">清除筛选</button>');
  }

  let html = '';
  const active = ui.worksQ || f.type !== 'all' || f.status !== 'all' || f.tag !== 'all' || f.year !== 'all';
  if (active) {
    html += '<div class="row-flex" style="margin-bottom:12px"><button class="btn btn-ghost btn-sm" data-action="save-filter">' +
      icon('star', 14) + ' 保存当前筛选</button></div>';
  }

  const slice = list.slice(0, shown);
  html += '<div class="wgrid is-' + view + '">' + slice.map((w) =>
    workCard(w, view, { selectable: ui.selectMode, selected: !!(ui.selected && ui.selected[w.id]) })).join('') + '</div>';

  if (list.length > shown) {
    html += '<div class="loadmore"><button class="btn btn-ghost btn-sm" data-action="works-more">再加载 ' +
      Math.min(PAGE, list.length - shown) + ' 部（还有 ' + (list.length - shown) + '）</button></div>';
  }
  return html;
}

/* 搜索框输入时只重绘结果区，输入框本身不重建 */
export function paintWorks() {
  const body = document.getElementById('works-body');
  if (body) {
    body.innerHTML = worksBodyHTML();
    const cnt = document.getElementById('works-count');
    if (cnt) cnt.textContent = filteredWorks().length;
    return;
  }
  const items = document.getElementById('split-items');
  if (items) {
    const list = filteredWorks();
    items.innerHTML = splitItemsHTML(list, ui.splitWorkId);
    const cnt = document.getElementById('works-count');
    if (cnt) cnt.textContent = list.length;
  }
}

export function worksView() {
  const f = filterState();
  const view = pref('works.view') || 'grid';
  const list = filteredWorks();

  let html = '<header class="page-head">' +
    '<div><p class="eyebrow">作品与典藏 · <span id="works-count">' + list.length + '</span> 部</p><h1 class="page-title">档案馆</h1></div>' +
    '<div class="head-actions">' +
    '<button class="icon-btn' + (ui.selectMode ? ' is-on' : '') + '" data-action="works-select" aria-label="批量选择">' + icon('check', 19) + '</button>' +
    '<button class="icon-btn" data-action="works-view" data-value="' + (view === 'grid' ? 'list' : view === 'list' ? 'compact' : 'grid') + '" aria-label="切换视图">' +
    icon(view === 'grid' ? 'list' : view === 'list' ? 'grid' : 'grid', 19) + '</button>' +
    '</div></header>';

  html += hubRail();

  const saved = savedFilters.list();
  if (saved.length) {
    html += '<div class="chips" style="margin-bottom:12px">' + saved.map((f2) =>
      '<button class="chip" data-action="apply-filter" data-id="' + f2.id + '">☆ ' + esc(f2.name) + '</button>').join('') + '</div>';
  }

  html += '<div class="toolbar">' +
    '<div class="searchbar">' + icon('search', 16) +
    '<input id="works-search" type="search" placeholder="搜索标题、原名、创作者、标签" autocomplete="off" value="' + esc(ui.worksQ || '') + '">' +
    '</div>' +
    '<div class="row-flex">' +
    '<select class="select" data-change="works-type" style="flex:1;min-height:38px">' +
    '<option value="all">全部类型</option>' +
    ['text', 'film', 'comic', 'stage', 'audio', 'game'].map((g) =>
      '<optgroup label="' + esc(GROUPS[g].label) + '">' +
      TYPES.filter((t) => t.group === g).map((t) =>
        '<option value="' + t.id + '"' + (f.type === t.id ? ' selected' : '') + '>' + esc(t.label) + '</option>').join('') +
      '</optgroup>').join('') +
    '</select>' +
    '<select class="select" data-change="works-sort" style="flex:1;min-height:38px">' +
    [['updated', '最近更新'], ['created', '最近添加'], ['rating', '评分最高'], ['title', '标题'], ['year', '年份']]
      .map((o) => '<option value="' + o[0] + '"' + (f.sort === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') +
    '</select>' +
    '</div>' +
    chips([['all', '全部'], ['open', '待体验'], ['doing', '进行中'], ['done', '已完成'], ['dropped', '已放弃']], f.status, 'works-status') +
    '<div class="row-flex" style="margin-top:10px">' +
    '<button class="btn btn-ghost btn-sm" data-action="adv-filter">' + icon('filter', 14) + ' 高级筛选' +
    (activeAdvCount() ? '<b class="adv-count">' + activeAdvCount() + '</b>' : '') + '</button>' +
    (activeAdvCount() ? '<button class="btn btn-ghost btn-xs" data-action="adv-clear">清除高级条件</button>' : '') +
    '</div></div>';

  html += '<div id="works-body">' + worksBodyHTML() + '</div>';
  return html;
}

/* ---------------- 6.9 高级筛选 ---------------- */

function openAdvancedFilters() {
  const f = filterState();
  const box = (key, label) =>
    '<label class="switch" style="margin-bottom:8px"><input type="checkbox" data-flag="' + key + '"' +
    (f[key] === '1' ? ' checked' : '') + '><i></i><span>' + label + '</span></label>';

  openModal({
    title: '高级筛选',
    desc: '条件之间是「并且」关系；保存后会出现在档案馆的筛选方案里。',
    wide: true,
    body: '<div>' +
      '<div class="row2"><label class="field"><span class="field-label">创作者包含</span><input class="input" id="af-creator" value="' + esc(f.creator) + '"></label>' +
      '<label class="field"><span class="field-label">创作者国家 / 地区</span><input class="input" id="af-country" value="' + esc(f.country) + '" placeholder="中国 / 日本"></label></div>' +
      '<div class="row2"><label class="field"><span class="field-label">评分下限</span><input class="input" type="number" step="0.5" id="af-min" value="' + esc(f.ratingMin) + '"></label>' +
      '<label class="field"><span class="field-label">评分上限</span><input class="input" type="number" step="0.5" id="af-max" value="' + esc(f.ratingMax) + '"></label></div>' +
      '<label class="field"><span class="field-label">体验状态</span><select class="select" id="af-scope">' +
      [['all', '不限'], ['undone', '仅未完成'], ['done', '仅已完成']].map((x) =>
        '<option value="' + x[0] + '"' + (f.scope === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') +
      '</select></label>' +
      '<div class="row2" style="margin-top:6px"><div>' + box('hasSummary', '有总结') + box('hasExcerpt', '有摘抄') + '</div>' +
      '<div>' + box('hasResource', '有数字资源') + box('hasPhysical', '有实体收藏') + '</div></div>' +
      box('ebook', '有电子版') +
      '</div>',
    actions: [{ label: '取消', value: null, variant: 'ghost' }, { label: '应用', value: 'ok', variant: 'primary' }]
  }).then((v) => {
    if (v !== 'ok') return;
    const val = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
    const flags = {};
    document.querySelectorAll('[data-flag]').forEach((el) => { flags[el.dataset.flag] = el.checked ? '1' : ''; });
    ui.filter = Object.assign({}, filterState(), {
      creator: val('af-creator').trim(),
      country: val('af-country').trim(),
      ratingMin: val('af-min'),
      ratingMax: val('af-max'),
      scope: val('af-scope')
    }, flags);
    delete ui.filter.rating;
    pref('works', ui.filter);
    ui.worksLimit = 36;
    go('#/works');
  });
}

/* ---------------- 详情页 ---------------- */

export function workDetailView(id) {
  const w = getWork(id);
  if (!w) {
    return '<div class="page"><header class="page-head"><div><h1 class="page-title">作品不存在</h1></div></header>' +
      '<p class="muted">它可能已被删除。回收站里还能找到。</p>' +
      '<div style="margin-top:16px"><button class="btn btn-ghost btn-sm" data-action="go" data-to="#/works">返回档案馆</button></div></div>';
  }
  return workDetailHTML(w);
}

function syncSplitUrl(id) {
  /* 双栏内切换不重新渲染整页，但地址要跟着走，刷新/返回才对得上 */
  try { history.replaceState(null, '', '#/work/' + id); } catch (e) { /* ignore */ }
}

/* 16.2 平板双栏：左侧列表 + 右侧详情 */
export function isSplit() {
  return window.matchMedia && window.matchMedia('(min-width: 768px) and (max-width: 1023px)').matches;
}

function splitItemsHTML(list, sel) {
  if (!list.length) return '<p class="muted" style="font-size:12.5px;padding:10px">没有符合条件的作品。</p>';
  return list.slice(0, 200).map((w) => {
    const cover = thumbUrl(w);
    return '<button class="split-item' + (w.id === sel ? ' is-on' : '') + '" data-action="split-open" data-id="' + w.id + '">' +
      '<span class="split-art" style="--cc:' + coverColor(w.title) + '">' +
      (cover ? '<img src="' + esc(cover) + '" alt="">' : esc(initials(w.title))) + '</span>' +
      '<span class="split-main"><b>' + esc(w.title) + '</b><i>' + esc([typeDef(w.type).label, w.creator].filter(Boolean).join(' · ')) + '</i></span>' +
      '<span class="st st-' + workStatus(w) + '">' + esc(statusText(w)) + '</span></button>';
  }).join('');
}

export function worksSplitView(id) {
  const list = filteredWorks();
  const sel = (id && getWork(id)) ? id : (ui.splitWorkId && getWork(ui.splitWorkId) ? ui.splitWorkId : (list[0] ? list[0].id : ''));
  ui.splitWorkId = sel;

  let html = '<div class="split">' +
    '<aside class="split-list">' +
    '<div class="split-head"><div><p class="eyebrow">档案馆 · <span id="works-count">' + list.length + '</span> 部</p><h1 class="split-title">档案馆</h1></div>' +
    '<span class="row-flex" style="gap:2px">' +
    '<button class="icon-btn' + (activeAdvCount() ? ' is-on' : '') + '" data-action="adv-filter" aria-label="高级筛选">' + icon('filter', 18) + '</button>' +
    '<button class="icon-btn" data-action="new-work" aria-label="添加">' + icon('plus', 19) + '</button></span></div>' +
    '<div class="searchbar" style="margin-bottom:10px">' + icon('search', 15) +
    '<input id="works-search" type="search" placeholder="搜索作品" value="' + esc(ui.worksQ || '') + '"></div>' +
    '<div class="chips" style="margin-bottom:10px">' +
    [['all', '全部'], ['open', '待体验'], ['doing', '进行中'], ['done', '已完成']].map((c) =>
      '<button class="chip' + ((filterState().status === c[0]) ? ' is-on' : '') + '" data-action="works-status" data-value="' + c[0] + '">' + c[1] + '</button>').join('') +
    '</div>' +
    '<div class="split-items" id="split-items">' + splitItemsHTML(list, sel) + '</div></aside>' +
    '<section class="split-detail" id="split-detail">' +
    (sel ? workDetailHTML(getWork(sel)) : '<p class="muted">左侧选一部作品。</p>') +
    '</section></div>';
  return html;
}

function workDetailHTML(w) {
  if (!w) return '<p class="muted">作品不存在。</p>';
  const def = typeDef(w.type);
  const d = detailsOf(w.id);
  const cover = coverUrl(w);
  const exps = experiencesOf(w.id);
  const reviews = data.reviews.filter((r) => r.workId === w.id && !r.deletedAt);
  const excerpts = data.excerpts.filter((r) => r.workId === w.id && !r.deletedAt);
  const res = data.resources.filter((r) => r.workId === w.id && !r.deletedAt);

  let html = '<header class="page-head">' +
    '<div class="head-left"><button class="icon-btn" data-action="back" aria-label="返回">' + icon('back', 20) + '</button>' +
    '<div><p class="eyebrow">' + esc(def.label) + ' · ' + esc(def.group === 'custom' ? '自定义' : GROUPS[def.group].label) + '</p>' +
    '<h1 class="page-title">' + esc(w.title) + '</h1></div></div>' +
    '<div class="head-actions">' +
    (def.group === 'film' || def.group === 'stage' ? '<button class="icon-btn" data-action="ticket" data-id="' + w.id + '" aria-label="查看票根">' + icon('stamp', 19) + '</button>' : '') +
    '<button class="icon-btn" data-action="edit-work" data-id="' + w.id + '" aria-label="编辑">' + icon('edit', 18) + '</button>' +
    '<button class="icon-btn" data-action="more-work" data-id="' + w.id + '" aria-label="更多">' + icon('more', 19) + '</button>' +
    '</div></header>';

  html += '<section class="wdetail">' +
    '<div class="wdetail-art">' +
    (cover ? '<img src="' + esc(cover) + '" alt="">' : '<span class="ph" style="--cc:' + coverColor(w.title) + '">' + esc(initials(w.title)) + '</span>') +
    '</div>' +
    '<div class="wdetail-main">' +
    '<div class="row-flex" style="gap:6px;margin-bottom:8px">' +
    '<span class="st st-' + workStatus(w) + '">' + esc(statusText(w)) + '</span>' +
    (w.rating ? '<span class="badge is-gold">★ ' + ratingShort(w.rating) + '</span>' : '') +
    (w.year ? '<span class="badge">' + esc(w.year) + '</span>' : '') +
    '</div>' +
    (d.originalTitle || w.originalTitle ? '<p class="muted" style="font-size:12.5px;margin-bottom:4px">' + esc(d.originalTitle || w.originalTitle) + '</p>' : '') +
    '<p class="wdetail-by">' + esc([w.creator].filter(Boolean).join(' · ') || '—') + '</p>' +
    (w.summary ? '<p class="wdetail-sum">' + esc(w.summary) + '</p>' : '') +
    '<div class="row-flex" style="gap:6px;margin-top:10px">' +
    (w.aliases || []).map((a) => '<span class="tagpill">' + esc(a) + '</span>').join('') +
    classNamesFor(w).map((x) => '<span class="tagpill">' + esc(x) + '</span>').join('') +
    '</div></div></section>';

  /* 最近一次体验 */
  const latest = exps[0];
  if (latest) {
    const prog = progressText(def, latest.progress);
    html += '<section class="section"><div class="section-head"><h2 class="section-title">当前进度</h2>' +
      '<button class="btn btn-ghost btn-sm" data-action="new-experience" data-value="' + w.id + '">＋ 记一次</button></div>' +
      '<div class="card"><div class="row-flex" style="justify-content:space-between">' +
      '<span>' + esc(latest.startDate || '—') + (latest.endDate ? ' → ' + esc(latest.endDate) : '') + '</span>' +
      '<span class="st st-' + latest.status + '">' + esc(statusText(Object.assign({}, w, { status: latest.status }))) + '</span></div>' +
      (prog ? '<p class="muted" style="margin-top:6px;font-size:12.5px">' + esc(prog) + '</p>' : '') +
      (latest.note ? '<p style="margin-top:8px;font-size:13px;color:var(--text-2)">' + esc(latest.note) + '</p>' : '') +
      '</div></section>';
  }

  /* 分类型专属字段 */
  const fields = Object.keys(d).filter((k) => d[k] !== '' && d[k] != null);
  if (fields.length) {
    html += '<section class="section"><div class="section-head"><h2 class="section-title">档案信息</h2>' +
      '<span class="section-note">' + fields.length + ' 项</span></div>' +
      '<div class="kv">' + fields.map((k) => {
        const f = FIELDS[k] || { l: k };
        return '<div class="kv-row"><span>' + esc(f.l) + '</span><b>' + esc(String(d[k])) + '</b></div>';
      }).join('') + '</div></section>';
  }

  /* 人物 */
  const creators = workCreatorsOf(w.id);
  html += '<section class="section"><div class="section-head"><h2 class="section-title">人物</h2>' +
    '<button class="btn btn-ghost btn-xs" data-action="work-add-creator" data-id="' + w.id + '">＋ 关联</button></div>' +
    (creators.length ? '<div class="chips">' + creators.map((x) => {
      const c = creatorOf(x.creatorId);
      if (!c) return '';
      return '<a class="chip" href="#/creator/' + c.id + '">' + esc(c.name) + ' · ' + esc(x.role) + '</a>';
    }).join('') + '</div>'
      : '<p class="muted" style="font-size:12.5px">还没有关联人物。作者、导演、声优都可以单独建档。</p>') +
    '</section>';

  /* 系列 */
  const sr = seriesOf(w.id);
  if (sr) {
    html += '<section class="section"><div class="section-head"><h2 class="section-title">所属系列</h2></div>' +
      '<a class="sec-link" href="#/series/' + sr.id + '"><b>' + esc(sr.name) + '</b><i>' +
      ((sr.workIds || []).length) + ' 部作品</i>' + icon('right', 16) + '</a></section>';
  }

  /* 实体与借还 */
  const items = data.physical.filter((it) => it.workId === w.id && !it.deletedAt);
  const openLoans = data.loans.filter((l) => l.workId === w.id && !l.deletedAt && !l.returnedAt);
  if (items.length || openLoans.length) {
    html += '<section class="section"><div class="section-head"><h2 class="section-title">实体与借还</h2></div><div class="kv">' +
      items.map((it) => '<div class="kv-row"><span>' + esc(it.location || '未标位置') + '</span><b>' +
        esc([it.edition, it.condition].filter(Boolean).join(' · ') || '已登记') + '</b></div>').join('') +
      openLoans.map((l) => '<div class="kv-row"><span>' + (l.direction === 'in' ? '借自' : '借给') + ' ' + esc(l.counterpart || '—') + '</span><b>' +
        (l.dueDate ? '应还 ' + esc(l.dueDate) : '未定归还日') + '</b></div>').join('') +
      '</div></section>';
  }

  /* 6.2 季 / 集 两级结构 */
  if (def.mode === 'series') {
    const eps = episodesOf(w.id);
    const es = episodeStats(w.id);
    html += '<section class="section"><div class="section-head"><h2 class="section-title">季与集</h2>' +
      '<button class="btn btn-ghost btn-xs" data-action="ep-manage" data-id="' + w.id + '">管理</button></div>' +
      (eps.length
        ? '<div class="card"><div class="row-flex" style="justify-content:space-between;margin-bottom:8px">' +
          '<span style="font-size:12.5px">已看 ' + es.seen + ' / ' + es.total + ' 集</span><b class="mono">' + es.pct + '%</b></div>' +
          '<div class="bar"><i style="width:' + es.pct + '%"></i></div>' +
          '<div class="ep-strip">' + eps.slice(0, 40).map((e) =>
            '<button class="ep-dot' + (e.watched ? ' is-on' : '') + '" data-action="ep-toggle" data-id="' + e.id + '" title="S' + (e.season || 1) + 'E' + e.no + '">' + e.no + '</button>').join('') +
          '</div></div>'
        : '<p class="muted" style="font-size:12.5px">还没有建季与集。点「管理」按季录入，之后可以逐集标记与评分。</p>') +
      '</section>';
  }

  /* 5.2.3 期刊：同刊名的其它期 */
  if (w.type === 'magazine' || w.type === 'newspaper') {
    const g = periodicalGroups().find((x) => x.issues.some((it) => it.work.id === w.id));
    if (g) {
      const others = g.issues.filter((it) => it.work.id !== w.id);
      html += '<section class="section"><div class="section-head"><h2 class="section-title">刊系</h2>' +
        '<a class="btn btn-ghost btn-xs" href="#/periodical/' + encodeURIComponent(g.key) + '">全部 ' + g.count + ' 期</a></div>' +
        '<div class="kv" style="margin-bottom:10px">' +
        '<div class="kv-row"><span>刊名</span><b>' + esc(g.name) + '</b></div>' +
        '<div class="kv-row"><span>收录跨度</span><b>' + esc((g.first || '—') + '–' + (g.last || '—')) + '</b></div>' +
        (g.missing.length ? '<div class="kv-row"><span>疑似缺期</span><b>' + g.missing.map((m) => m.year + ' 年第 ' + m.no + ' 期').join('、') + '</b></div>' : '') +
        '</div>' +
        (others.length
          ? '<div class="chips">' + others.slice(0, 12).map((it) => '<a class="chip" href="#/work/' + it.work.id + '">' +
            esc([it.year, it.no ? '第 ' + it.no + ' 期' : ''].filter(Boolean).join(' · ')) + '</a>').join('') + '</div>'
          : '<p class="muted" style="font-size:12.5px">这是该刊系目前唯一一期。</p>') +
        '</section>';
    }
  }

  /* 6.3 游戏：成就、多周目、截图 */
  if (def.group === 'game') {
    html += achievementsSection(w);
    html += playthroughsSection(w);
    html += shotsSection(w);
  }

  /* 6.4 音乐：曲目单 */
  if (w.type === 'album' || w.type === 'single') {
    html += tracksSection(w);
  }

  /* 6.1 / 6.4 按天记录：文字与游戏看页数/时长，音乐只看时长 */
  if (['text', 'game', 'audio'].indexOf(def.group) >= 0) {
    const rs = readingStats(w.id);
    const isGame = def.group === 'game';
    const isAudio = def.group === 'audio';
    html += '<section class="section"><div class="section-head"><h2 class="section-title">' +
      (isAudio ? '收听记录' : isGame ? '游玩会话' : '阅读会话') + '</h2>' +
      '<button class="btn btn-ghost btn-xs" data-action="sess-new" data-id="' + w.id + '">＋ 记一次</button></div>' +
      (rs.days
        ? '<div class="kv">' +
          '<div class="kv-row"><span>记录天数</span><b>' + rs.days + ' 天 · 连续 ' + rs.streak + ' 天</b></div>' +
          '<div class="kv-row"><span>' + (def.group === 'text' ? '总页数' : '总时长') + '</span><b>' +
          (def.group === 'text' ? rs.pages + ' 页' : rs.minutes + ' 分钟') + '</b></div>' +
          '<div class="kv-row"><span>' + (def.group === 'text' ? '日均页数' : '日均时长') + '</span><b>' +
          (def.group === 'text' ? rs.perDay + ' 页/天' : Math.round(rs.minutes / Math.max(1, rs.days)) + ' 分钟/天') + '</b></div>' +
          (def.group === 'text' && rs.speed ? '<div class="kv-row"><span>阅读速度</span><b>' + rs.speed + ' 页/小时</b></div>' : '') +
          '</div>'
        : '<p class="muted" style="font-size:12.5px">还没有按天记录。记几次之后能看到日均与连续天数。</p>') +
      '</section>';
  }

  html += '<section class="section"><div class="section-head"><h2 class="section-title">体验记录</h2>' +
    '<span class="section-note">' + exps.length + ' 条</span></div>' +
    (exps.length ? '<div class="rows">' + exps.map((e) => {
      const p = progressText(def, e.progress);
      return '<button class="rowitem" data-action="edit-experience" data-id="' + e.id + '">' +
        '<span class="rowitem-main"><b>' + esc(e.startDate || '—') + (e.endDate ? ' → ' + esc(e.endDate) : '') +
        '</b><i>' + esc([statusText(Object.assign({}, w, { status: e.status })), p, e.rating ? '★ ' + ratingShort(e.rating) : ''].filter(Boolean).join(' · ')) + '</i></span>' +
        '<span class="rowitem-side">' + icon('right', 16) + '</span></button>';
    }).join('') + '</div>'
      : '<p class="muted" style="font-size:12.5px">还没有体验记录。每次阅读、观看、游玩都可以单独记一条。</p>') +
    '</section>';

  const notes = notesOfWork(w.id);
  if (notes.length) {
    html += '<section class="section"><div class="section-head"><h2 class="section-title">相关笔记</h2>' +
      '<span class="section-note">' + notes.length + ' 篇</span></div><div class="rows">' +
      notes.map((n) => '<button class="rowitem" data-action="edit-note" data-id="' + n.id + '">' +
        '<span class="row-icon">' + icon('edit', 15) + '</span>' +
        '<span class="rowitem-main"><b>' + esc(n.title || '未命名笔记') + '</b><i>' +
        esc(String(n.body || '').replace(/[#>*`]/g, '').slice(0, 40)) + '</i></span>' + icon('right', 15) + '</button>').join('') +
      '</div></section>';
  }

  html += '<section class="section"><div class="sec-row">' +
    secLink('总结与评价', reviews.length, 'go', '#/knowledge/reviews') +
    secLink('摘抄', excerpts.length, 'go', '#/knowledge/excerpts') +
    secLink('数字资源', res.length, 'go', '#/resources') +
    '</div></section>';

  if (w.note) {
    html += '<section class="section"><div class="section-head"><h2 class="section-title">个人备注</h2></div>' +
      '<p class="prose" style="font-size:13.5px;color:var(--text-2);white-space:pre-wrap">' + esc(w.note) + '</p></section>';
  }

  const hist = statusHistory(w.id).slice(0, 8);
  if (hist.length) {
    html += '<section class="section"><div class="section-head"><h2 class="section-title">状态变更</h2>' +
      '<span class="section-note">' + hist.length + ' 次</span></div><div class="rows">' +
      hist.map((h) => '<div class="rowitem is-static"><span class="rowitem-main"><b>' +
        esc(h.from || '—') + ' → ' + esc(h.to || '—') + '</b><i>' + esc(String(h.at).slice(0, 16).replace('T', ' ')) + '</i></span></div>').join('') +
      '</div></section>';
  }

  const backs = backlinksOf('work:' + w.id);
  html += '<section class="section"><div class="section-head"><h2 class="section-title">关联</h2>' +
    '<a class="btn btn-ghost btn-xs" href="#/graph/links">管理</a></div>' +
    '<div class="rows">' +
    relatedRows(w.id) +
    backs.filter((b) => b.type !== 'work').map((b) => '<a class="rowitem" href="' +
      (b.type === 'excerpt' ? '#/knowledge/excerpts' : b.type === 'review' ? '#/knowledge/reviews' :
        b.type === 'creator' ? '#/creator/' + b.id : b.type === 'topic' ? '#/taxonomy' : '#/graph/series') + '">' +
      '<span class="rowitem-main"><b>' + esc(b.type === 'excerpt' ? '一条摘抄' : b.type === 'review' ? '一篇总结' : b.type === 'creator' ? '一位人物' : '一个对象') + '</b>' +
      '<i>' + esc(b.relation || '相关') + '</i></span>' + icon('right', 15) + '</a>').join('') +
    '</div></section>';

  return html;
}

function secLink(title, count, action, to) {
  return '<button class="sec-link" data-action="' + action + '" data-to="' + to + '">' +
    '<span><b>' + esc(title) + '</b><i>' + count + ' 条</i></span>' + icon('right', 16) + '</button>';
}

function relatedRows(workId) {
  const rels = data.relations.filter((r) => r.sourceWorkId === workId || r.targetWorkId === workId);
  if (!rels.length) return '<p class="muted" style="font-size:12.5px">还没有关联作品。系列、续作、改编都可以在这里挂上。</p>';
  return rels.map((r) => {
    const otherId = r.sourceWorkId === workId ? r.targetWorkId : r.sourceWorkId;
    const other = getWork(otherId);
    if (!other) return '';
    return '<button class="rowitem" data-action="open-work" data-id="' + other.id + '">' +
      '<span class="rowitem-main"><b>' + esc(other.title) + '</b><i>' + esc(r.relationType || '相关') + '</i></span>' +
      icon('right', 16) + '</button>';
  }).join('');
}

/* ---------------- 季 / 集管理 ---------------- */

function epManage(workId) {
  const w = getWork(workId);
  const eps = episodesOf(workId);
  const seasons = {};
  eps.forEach((e) => { const k = e.season || 1; (seasons[k] = seasons[k] || []).push(e); });

  const body = '<div>' +
    (Object.keys(seasons).length
      ? Object.keys(seasons).sort((a, b) => a - b).map((k) =>
        '<p class="field-label">第 ' + k + ' 季 · ' + seasons[k].filter((e) => e.watched).length + '/' + seasons[k].length + '</p>' +
        '<div class="ep-list">' + seasons[k].map((e) =>
          '<div class="ep-row"><span>第 ' + e.no + ' 集</span>' +
          '<button class="btn btn-ghost btn-xs" data-action="ep-toggle" data-id="' + e.id + '">' + (e.watched ? '已看' : '标记已看') + '</button></div>').join('') + '</div>').join('')
      : '<p class="muted" style="font-size:12.5px">还没有季。先在下面建一季。</p>') +
    '<div class="row2" style="margin-top:14px">' +
    '<label class="field"><span class="field-label">季</span><input class="input" type="number" id="ep-season" value="1"></label>' +
    '<label class="field"><span class="field-label">本季集数</span><input class="input" type="number" id="ep-count" value="12"></label></div>' +
    '<button type="button" class="btn btn-primary btn-sm" data-action="ep-add-season" data-id="' + workId + '">添加这一季</button>' +
    '</div>';

  openModal({
    title: '追剧进度',
    desc: w ? w.title : '',
    wide: true,
    body,
    actions: [{ label: '完成', value: null, variant: 'primary' }]
  });
}

/* ---------------- 删除与更多 ---------------- */

export function openMoreMenu(workId) {
  const w = getWork(workId);
  if (!w) return;
  openModal({
    title: w.title,
    desc: '选择一个操作',
    body: '<div class="menu-list">' +
      '<button class="menu-item" data-action="new-experience" data-value="' + w.id + '">' + icon('clock', 18) + '记一次体验</button>' +
      '<button class="menu-item" data-action="new-review" data-value="' + w.id + '">' + icon('edit', 18) + '写一篇总结</button>' +
      '<button class="menu-item" data-action="new-excerpt" data-value="' + w.id + '">' + icon('tag', 18) + '添加摘抄</button>' +
      '<button class="menu-item" data-action="new-resource" data-value="' + w.id + '">' + icon('folder', 18) + '登记数字资源</button>' +
      '<button class="menu-item" data-action="copy-work" data-id="' + w.id + '">' + icon('layers', 18) + '复制一份档案</button>' +
      '<button class="menu-item is-danger" data-action="delete-work" data-id="' + w.id + '">' + icon('trash', 18) + '删除作品</button>' +
      '</div>',
    actions: [{ label: '关闭', value: null, variant: 'ghost' }]
  });
}

export async function askDeleteWork(id) {
  const w = getWork(id);
  if (!w) return;
  const c = relatedCounts(id);
  const rows = [
    ['体验记录', c.experiences], ['摘抄', c.excerpts], ['总结', c.reviews],
    ['数字资源', c.resources], ['收藏清单', c.collections], ['专题引用', c.topics], ['作品关联', c.relations]
  ].filter((r) => r[1] > 0);

  const body = '<p style="font-size:13px;color:var(--text-2);margin-bottom:10px">删除后作品进入回收站，关联数据不会被级联删除。</p>' +
    (rows.length
      ? '<div class="kv">' + rows.map((r) => '<div class="kv-row"><span>' + r[0] + '</span><b>' + r[1] + ' 条</b></div>').join('') + '</div>'
      : '<p class="muted" style="font-size:12.5px">这部作品没有关联数据。</p>');

  const ok = await confirmDialog({
    title: '删除「' + w.title + '」？',
    desc: '受影响的数据如下，确认后可在回收站恢复。',
    body,
    confirmText: '删除',
    danger: true
  });
  if (!ok) return;
  const res = await deleteWork(id);
  if (!res.ok) { toast(res.error || '删除失败', 'error'); return; }
  toast('已移入回收站');
  go('#/works');
}

/* ---------------- 批量操作 ---------------- */

function selectedIds() {
  return Object.keys(ui.selected || {}).filter((k) => ui.selected[k]);
}


/* ---------------- 动作 ---------------- */

export const actions = {
  'sess-new': (el) => {
    const workId = el.dataset.id;
    const w = getWork(workId);
    const group = w ? typeDef(w.type).group : 'text';
    const isGame = group === 'game';
    const isAudio = group === 'audio';
    openModal({
      title: isAudio ? '记一次收听' : isGame ? '记一次游玩' : '记一次阅读',
      body: '<div class="row2"><label class="field"><span class="field-label">日期</span>' +
        '<input class="input" type="date" id="ss-date" value="' + todayISO() + '"></label>' +
        (isAudio ? '' : '<label class="field"><span class="field-label">' + (isGame ? '页数 / 章节' : '页数') + '</span>' +
        '<input class="input" type="number" id="ss-pages" value=""></label>') + '</div>' +
        '<label class="field"><span class="field-label">时长（分钟）</span><input class="input" type="number" id="ss-min" value=""></label>' +
        '<label class="field"><span class="field-label">备注</span><input class="input" id="ss-note"></label>',
      actions: [{ label: '取消', value: null, variant: 'ghost' }, { label: '保存', value: 'ok', variant: 'primary' }]
    }).then(async (v) => {
      if (v !== 'ok') return;
      const val = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
      const date = val('ss-date');
      const pages = Number(val('ss-pages')) || 0;
      const minutes = Number(val('ss-min')) || 0;
      const note = val('ss-note');
      if (!date || (!pages && !minutes)) { toast('至少填页数或时长'); return; }
      await sesStore.save({ id: '', workId, date, pages, minutes, note });
      toast('已记录');
      go('#/work/' + workId);
    });
  },
  'ep-manage': (el) => epManage(el.dataset.id),
  'ep-toggle': async (el) => {
    const cur = epStore.get(el.dataset.id);
    if (!cur) return;
    await epStore.save(Object.assign({}, cur, { watched: !cur.watched, date: !cur.watched ? todayISO() : '' }));
    go('#/work/' + cur.workId);
  },
  'ep-add-season': (el) => {
    const workId = el.dataset.id;
    const n = Number(document.getElementById('ep-count').value) || 0;
    const season = Number(document.getElementById('ep-season').value) || 1;
    if (n <= 0) { toast('集数要大于 0'); return; }
    (async () => {
      const existing = episodesOf(workId).filter((e) => (e.season || 1) === season);
      for (let i = 1; i <= n; i++) {
        if (existing.some((e) => e.no === i)) continue;
        await epStore.save({ id: '', workId, season, no: i, watched: false, date: '', rating: 0, note: '' });
      }
      toast('已添加 ' + season + ' 季 ' + n + ' 集');
      go('#/work/' + workId);
    })();
  },
  'work-add-creator': (el) => {
    const workId = el.dataset.id;
    import('./creators.js').then((m) => {
      const list = data.creators.filter((c) => !c.deletedAt);
      if (!list.length) { toast('先去人物库建一个人物'); go('#/creators'); return; }
      openModal({
        title: '关联人物',
        desc: '选择已有的人物，并指定在这部作品里的角色。',
        body: '<label class="field"><span class="field-label">人物</span><select class="select" id="wc-person">' +
          list.map((c) => '<option value="' + c.id + '">' + esc(c.name) + '</option>').join('') + '</select></label>' +
          '<label class="field"><span class="field-label">角色</span><input class="input" id="wc-role" value="作者"></label>',
        actions: [{ label: '取消', value: null, variant: 'ghost' }, { label: '关联', value: 'ok', variant: 'primary' }]
      }).then(async (v) => {
        if (v !== 'ok') return;
        const pid = document.getElementById('wc-person');
        const role = document.getElementById('wc-role');
        const { linkCreator } = await import('../core/repo.js');
        await linkCreator(workId, pid.value, role.value || '作者');
        toast('已关联');
        go('#/work/' + workId);
      });
    });
  },
  'split-open': (el) => {
    const id = el.dataset.id;
    ui.splitWorkId = id;
    const box = document.getElementById('split-detail');
    if (box) box.innerHTML = workDetailHTML(getWork(id));
    document.querySelectorAll('.split-item').forEach((x) => x.classList.toggle('is-on', x.dataset.id === id));
    syncSplitUrl(id);
    if (window.__afterRender) window.__afterRender();
  },
  'open-work': (el) => {
    if (ui.selectMode) {
      const id = el.dataset.id;
      ui.selected = ui.selected || {};
      ui.selected[id] = !ui.selected[id];
      el.classList.toggle('is-selected', !!ui.selected[id]);
      const check = el.querySelector('.wcard-check');
      if (check) check.innerHTML = ui.selected[id] ? icon('check', 13) : '';
      const bar = document.querySelector('.batchbar b');
      if (bar) bar.textContent = selectedIds().length;
      return;
    }
    if (isSplit() && ui.route.name === 'works') {
      ui.splitWorkId = el.dataset.id;
      const box = document.getElementById('split-detail');
      if (box) box.innerHTML = workDetailHTML(getWork(el.dataset.id));
      document.querySelectorAll('.split-item').forEach((x) => x.classList.toggle('is-on', x.dataset.id === el.dataset.id));
      syncSplitUrl(el.dataset.id);
      if (window.__afterRender) window.__afterRender();
      return;
    }
    go('#/work/' + el.dataset.id);
  },
  'works-view': (el) => { pref('works.view', el.dataset.value); emit(); },
  'works-status': (el) => {
    ui.filter = Object.assign(filterState(), { status: el.dataset.value });
    pref('works', ui.filter);
    go('#/works');
  },
  'works-clear': () => {
    ui.worksQ = '';
    ui.filter = Object.assign({}, FILTER_DEFAULTS);
    pref('works', ui.filter);
    go('#/works');
  },
  'works-more': () => { ui.worksLimit = (ui.worksLimit || PAGE) + PAGE; emit(); },
  'adv-filter': () => openAdvancedFilters(),
  'adv-clear': () => {
    ui.filter = Object.assign({}, filterState(), {
      creator: '', country: '', ratingMin: '', ratingMax: '',
      hasSummary: '', hasExcerpt: '', hasResource: '', hasPhysical: '', ebook: '', scope: 'all'
    });
    pref('works', ui.filter);
    go('#/works');
  },
  'save-filter': async () => {
    const name = await import('../core/ui.js').then((m) => m.promptDialog({
      title: '保存筛选方案',
      label: '方案名称',
      placeholder: '已下载未看的电影'
    }));
    if (!name) return;
    const f = filterState();
    await savedFilters.save({ id: '', name, query: f, pinned: false });
    toast('已保存');
    go('#/works');
  },
  'apply-filter': (el) => {
    const f = savedFilters.get(el.dataset.id);
    if (!f) return;
    ui.filter = Object.assign({}, FILTER_DEFAULTS, f.query || {});
    ui.worksQ = (f.query && f.query.q) || '';
    pref('works', ui.filter);
    go('#/works');
  },
  'del-filter': async (el) => {
    await savedFilters.hardRemove(el.dataset.id);
    go('#/works');
  },
  'works-select': () => {
    ui.selectMode = !ui.selectMode;
    ui.selected = {};
    emit();
  },
  'more-work': (el) => openMoreMenu(el.dataset.id),
  'delete-work': (el) => askDeleteWork(el.dataset.id),
  'copy-work': async (el) => {
    const res = await copyWork(el.dataset.id);
    if (!res.ok) { toast(res.error || '复制失败', 'error'); return; }
    const m = document.querySelector('.modal-backdrop.is-on');
    if (m) m.remove();
    toast('已复制，体验记录不随之复制');
    go('#/work/' + res.work.id);
  },
  'batch-tag': () => {
    const ids = selectedIds();
    if (!ids.length) { toast('还没选作品'); return; }
    openModal({
      title: '批量打标签',
      desc: '输入标签名，多个用空格分隔；已有的会直接复用。',
      body: '<label class="field"><span class="field-label">标签</span><input class="input" id="batch-tags" placeholder="科幻 悬疑 已读完"></label>',
      actions: [
        { label: '取消', value: null, variant: 'ghost' },
        { label: '添加', value: 'ok', variant: 'primary' }
      ]
    }).then(async (v) => {
      if (v !== 'ok') return;
      const input = document.getElementById('batch-tags');
      const names = String(input ? input.value : '').split(/[\s,，]+/).filter(Boolean);
      if (!names.length) return;
      for (const name of names) {
        let tag = tagByName(name);
        if (!tag) {
          const r = await saveTag({ name, usageCount: 0 });
          tag = r.row;
        }
        for (const id of ids) {
          const w = getWork(id);
          if (!w) continue;
          const tagIds = (w.tagIds || []).slice();
          if (tagIds.indexOf(tag.id) < 0) tagIds.push(tag.id);
          await saveWork(Object.assign({}, w, { tagIds }), detailsOf(w.id));
        }
      }
      ui.selectMode = false;
      ui.selected = {};
      toast('已为 ' + ids.length + ' 部作品加标签');
      emit();
    });
  },
  'batch-category': () => {
    const ids = selectedIds();
    if (!ids.length) { toast('还没选作品'); return; }
    const cats = data.categories;
    if (!cats.length) {
      toast('还没有分类，先去「分类·标签·专题」建一个');
      go('#/taxonomy');
      return;
    }
    openModal({
      title: '批量归入分类',
      body: '<label class="field"><span class="field-label">分类</span><select class="select" id="batch-cat">' +
        cats.map((c) => '<option value="' + c.id + '">' + esc(c.name) + '</option>').join('') + '</select></label>',
      actions: [{ label: '取消', value: null, variant: 'ghost' }, { label: '应用', value: 'ok', variant: 'primary' }]
    }).then(async (v) => {
      if (v !== 'ok') return;
      const sel = document.getElementById('batch-cat');
      const cid = sel ? sel.value : '';
      for (const id of ids) {
        const w = getWork(id);
        if (w) await saveWork(Object.assign({}, w, { categoryId: cid }), detailsOf(w.id));
      }
      ui.selectMode = false;
      ui.selected = {};
      toast('已归入分类');
      emit();
    });
  },
  'batch-delete': async () => {
    const ids = selectedIds();
    if (!ids.length) { toast('还没选作品'); return; }
    const ok = await confirmDialog({
      title: '删除 ' + ids.length + ' 部作品？',
      desc: '都会进入回收站，关联数据保留。',
      confirmText: '删除',
      danger: true
    });
    if (!ok) return;
    for (const id of ids) await deleteWork(id);
    ui.selectMode = false;
    ui.selected = {};
    toast('已移入回收站');
    emit();
  },
  'export-csv': () => {
    const rows = [['标题', '类型', '创作者', '年份', '状态', '评分', '标签', '创建时间']];
    filteredWorks().forEach((w) => {
      rows.push([w.title, typeDef(w.type).label, w.creator || '', w.year || '',
        statusText(w), w.rating || '', classNamesFor(w).join(' '), (w.createdAt || '').slice(0, 10)]);
    });
    const csv = rows.map((r) => r.map((c) => {
      const t = String(c == null ? '' : c);
      return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
    }).join(',')).join('\r\n');
    import('../core/backup.js').then((b) => {
      b.downloadBlob(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }), 'works-' + new Date().toISOString().slice(0, 10) + '.csv');
      toast('已导出 ' + (rows.length - 1) + ' 部作品');
    });
  }
};
