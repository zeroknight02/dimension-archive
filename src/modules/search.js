/* ==========================================================
   次元簿 · 全局搜索
   说明书 5.9：覆盖作品、体验、资源、总结、摘抄、账号、专题；
   结果按类型分组并显示命中数量；完全本地，不联网。
   ========================================================== */

import { data, searchKeys, getWork, coverUrl, buildSearchIndex } from '../core/repo.js';
import { TYPES } from '../core/schema.js';
import { typeDef } from '../core/schema.js';
import { ui, go } from '../core/state.js';
import { icon, emptyState } from '../core/ui.js';
import { esc, initials, coverColor, truncate } from '../core/format.js';

export function searchView() {
  /* 数据可能在启动后变化（新增作品、载入示例），进搜索页时重建索引 */
  buildSearchIndex();
  const q = String(ui.search || '');
  let html = '<header class="page-head">' +
    '<div><p class="eyebrow">搜索</p><h1 class="page-title">找点什么</h1></div></header>' +
    '<div class="searchbar" style="margin-bottom:18px">' + icon('search', 17) +
    '<input id="global-search" type="search" placeholder="标题、创作者、标签、摘抄、笔记" value="' + esc(q) + '" autocomplete="off"></div>';
  html += '<div id="search-body">' + searchBodyHTML() + '</div>';
  return html;
}

export function paintSearch() {
  const box = document.getElementById('search-body');
  if (box) box.innerHTML = searchBodyHTML();
}

function searchBodyHTML() {
  const q = String(ui.search || '').trim();
  if (!q) {
    return '<p class="muted" style="font-size:12.5px;line-height:1.8">' +
      '搜索会同时查作品名称、原名、别名、创作者、标签，以及摘抄与总结正文。' +
      '全部在本地完成，不会联网。</p>';
  }

  const keys = searchKeys(q);
  const f = ui.searchFilter || { type: 'all', year: 'all', tag: 'all' };
  const groups = {
    work: [], excerpt: [], review: [], account: [], topic: [], note: []
  };
  keys.forEach((k) => {
    const i = k.indexOf(':');
    const kind = k.slice(0, i);
    const id = k.slice(i + 1);
    if (groups[kind]) groups[kind].push(id);
  });

  /* 体验记录与资源按关联作品命中 */
  const hitWorks = new Set(groups.work);
  const expIds = data.experiences.filter((e) => !e.deletedAt && hitWorks.has(e.workId)).map((e) => e.id);
  const resIds = data.resources.filter((r) => !r.deletedAt && hitWorks.has(r.workId)).map((r) => r.id);
  groups.experience = expIds;
  groups.resource = resIds;

  /* 作品组按类型 / 年份 / 标签进一步筛选 */
  groups.work = groups.work.filter((id) => {
    const w = getWork(id);
    if (!w) return false;
    if (f.type !== 'all' && w.type !== f.type) return false;
    if (f.year !== 'all' && String(w.year || '') !== String(f.year)) return false;
    if (f.tag !== 'all') {
      const t = data.tags.find((x) => x.id === f.tag);
      if (!t || (w.tagIds || []).indexOf(f.tag) < 0) return false;
    }
    return true;
  });

  const total = Object.keys(groups).reduce((a, k) => a + groups[k].length, 0);
  if (!total) {
    return emptyState('·', '没有找到「' + truncate(q, 16) + '」', '试试更短的关键词，或者检查有没有打错字。');
  }

  const years = [...new Set(data.works.map((w) => w.year).filter(Boolean))].sort().reverse().slice(0, 30);
  let html = '<div class="row-flex" style="gap:8px;margin-bottom:14px">' +
    '<select class="select" data-change="sf-type" style="flex:1;min-height:34px"><option value="all">全部类型</option>' +
    TYPES.filter((t) => data.works.some((w) => w.type === t.id)).map((t) =>
      '<option value="' + t.id + '"' + (f.type === t.id ? ' selected' : '') + '>' + esc(t.label) + '</option>').join('') + '</select>' +
    '<select class="select" data-change="sf-year" style="flex:1;min-height:34px"><option value="all">全部年份</option>' +
    years.map((y) => '<option value="' + esc(y) + '"' + (String(f.year) === String(y) ? ' selected' : '') + '>' + esc(y) + '</option>').join('') + '</select>' +
    '<select class="select" data-change="sf-tag" style="flex:1;min-height:34px"><option value="all">全部标签</option>' +
    data.tags.map((t) => '<option value="' + t.id + '"' + (f.tag === t.id ? ' selected' : '') + '>#' + esc(t.name) + '</option>').join('') + '</select>' +
    '</div>' +
    '<p class="muted" style="font-size:12px;margin-bottom:14px">共命中 ' + total + ' 条</p>';

  return html +
    section('作品', groups.work, (id) => {
      const w = getWork(id);
      if (!w) return '';
      const cover = coverUrl(w);
      return row('open-work', id,
        '<span class="cover" style="--cc:' + coverColor(w.title) + ';width:34px;flex:0 0 34px">' +
        (cover ? '<img src="' + esc(cover) + '" alt="">' : '<b>' + esc(initials(w.title)) + '</b>') + '</span>',
        w.title, [typeDef(w.type).label, w.creator, w.year].filter(Boolean).join(' · '));
    }) +
    section('摘抄', groups.excerpt, (id) => {
      const e = data.excerpts.find((x) => x.id === id);
      if (!e) return '';
      const w = e.workId ? getWork(e.workId) : null;
      return row('edit-excerpt', id, '', truncate(e.content, 40), [w ? w.title : '独立摘抄', e.type].filter(Boolean).join(' · '));
    }) +
    section('总结', groups.review, (id) => {
      const r = data.reviews.find((x) => x.id === id);
      if (!r) return '';
      return row('edit-review', id, '', r.title || '未命名', truncate(String(r.body || '').replace(/[#>*`]/g, ''), 46));
    }) +
    section('体验记录', groups.experience, (id) => {
      const e = data.experiences.find((x) => x.id === id);
      if (!e) return '';
      const w = getWork(e.workId);
      return row('edit-experience', id, '', w ? w.title : '记录', [e.startDate, e.endDate].filter(Boolean).join(' → '));
    }) +
    section('数字资源', groups.resource, (id) => {
      const r = data.resources.find((x) => x.id === id);
      if (!r) return '';
      const w = r.workId ? getWork(r.workId) : null;
      return row('edit-resource', id, '', r.name || '资源', [w ? w.title : '', r.format, r.status].filter(Boolean).join(' · '));
    }) +
    section('账号', groups.account, (id) => {
      const a = data.accounts.find((x) => x.id === id);
      if (!a) return '';
      return row('edit-account', id, '', a.platform || '账号', [a.category, a.username].filter(Boolean).join(' · '));
    }) +
    section('专题', groups.topic, (id) => {
      const t = data.topics.find((x) => x.id === id);
      if (!t) return '';
      return row('topic-open', id, '', t.title, (t.workIds || []).length + ' 部作品');
    }) +
    section('笔记', groups.note, (id) => {
      const n = data.notes.find((x) => x.id === id);
      if (!n) return '';
      return row('edit-note', id, '', n.title || '未命名笔记',
        truncate(String(n.body || '').replace(/[#>*`]/g, ''), 46));
    });
}

function section(title, ids, render) {
  if (!ids.length) return '';
  return '<section class="section"><div class="section-head"><h2 class="section-title">' + title + '</h2>' +
    '<span class="section-note">' + ids.length + ' 条</span></div>' +
    '<div class="rows">' + ids.slice(0, 20).map(render).join('') + '</div></section>';
}

function row(action, id, lead, title, sub) {
  return '<button class="rowitem" data-action="' + action + '" data-id="' + id + '">' + (lead || '') +
    '<span class="rowitem-main"><b>' + esc(title) + '</b><i>' + esc(sub || '') + '</i></span>' +
    '<span class="rowitem-side">' + icon('right', 15) + '</span></button>';
}

export const actions = {
  'open-search': () => go('#/search')
};
