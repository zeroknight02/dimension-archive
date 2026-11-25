/* ==========================================================
   次元簿 · 摘抄
   说明书 5.6：摘抄库独立管理、可关联作品；不同作品类型
   显示不同定位字段；支持全文搜索与随机回顾。
   ========================================================== */

import { data, excerpts, liveWorks, getWork } from '../core/repo.js';
import { EXCERPT_TYPES, typeDef } from '../core/schema.js';
import { ui, go } from '../core/state.js';
import { icon, toast, openModal, confirmDialog, emptyState } from '../core/ui.js';
import { esc, todayISO, truncate } from '../core/format.js';
import { knowledgeTabs } from './reviews.js';

function positionFields(w, p) {
  const v = p || {};
  const def = w ? typeDef(w.type) : null;
  if (!def) {
    return '<label class="field"><span class="field-label">位置</span><input class="input" data-pos="note" value="' + esc(v.note || '') + '" placeholder="页码 / 集数 / 时间点"></label>';
  }
  if (def.mode === 'book' || def.mode === 'issue') {
    return '<div class="row2"><label class="field"><span class="field-label">章节</span><input class="input" data-pos="chapter" value="' + esc(v.chapter || '') + '"></label>' +
      '<label class="field"><span class="field-label">页码</span><input class="input" data-pos="page" value="' + esc(v.page || '') + '"></label></div>';
  }
  if (def.mode === 'series') {
    return '<div class="row2"><label class="field"><span class="field-label">季 / 集</span><input class="input" data-pos="episode" value="' + esc(v.episode || '') + '" placeholder="S01E03"></label>' +
      '<label class="field"><span class="field-label">时间点</span><input class="input" data-pos="time" value="' + esc(v.time || '') + '" placeholder="00:42:10"></label></div>';
  }
  return '<label class="field"><span class="field-label">位置</span><input class="input" data-pos="note" value="' + esc(v.note || '') + '" placeholder="曲目 / 章节 / 关卡"></label>';
}

export function excerptsView() {
  const base = excerpts.list();
  const all = base;

  let html = '<header class="page-head">' +
    '<div><p class="eyebrow">知识库 · ' + all.length + ' 条</p><h1 class="page-title">摘抄</h1></div>' +
    '<div class="head-actions">' +
    '<button class="icon-btn" data-action="new-excerpt" aria-label="新增摘抄">' + icon('plus', 20) + '</button>' +
    '</div></header>';

  html += knowledgeTabs('excerpts');

  const ft = ui.exType || 'all';
  const fw = ui.exWork || 'all';
  html += '<div class="toolbar" style="margin-bottom:12px">' +
    '<div class="searchbar">' + icon('search', 16) +
    '<input id="ex-search" type="search" placeholder="搜索摘抄、理解、作者" value="' + esc(ui.exQ || '') + '" autocomplete="off"></div>' +
    '<div class="row-flex">' +
    '<button class="chip' + (ui.exFav ? ' is-on' : '') + '" data-action="ex-fav">★ 精选</button>' +
    '<select class="select" data-change="ex-type" style="flex:1;min-height:36px">' +
    '<option value="all">全部类型</option>' +
    EXCERPT_TYPES.map((t) => '<option' + (ft === t ? ' selected' : '') + '>' + esc(t) + '</option>').join('') + '</select>' +
    '<select class="select" data-change="ex-work" style="flex:1;min-height:36px">' +
    '<option value="all">全部作品</option>' +
    liveWorks().sort((a, b) => String(a.title).localeCompare(String(b.title), 'zh-Hans-CN'))
      .map((w) => '<option value="' + w.id + '"' + (fw === w.id ? ' selected' : '') + '>' + esc(w.title) + '</option>').join('') +
    '</select></div></div>';

  html += '<div id="ex-body">' + excerptsBodyHTML() + '</div>';
  return html;
}

export function paintExcerpts() {
  const box = document.getElementById('ex-body');
  if (box) box.innerHTML = excerptsBodyHTML();
}

function excerptsBodyHTML() {
  const base = excerpts.list();
  const fav = !!ui.exFav;
  const fw = ui.exWork || 'all';
  const ft = ui.exType || 'all';
  const q = String(ui.exQ || '').trim().toLowerCase();
  const all = base.filter((e) => {
    if (fav && !e.fav) return false;
    if (fw !== 'all' && e.workId !== fw) return false;
    if (ft !== 'all' && e.type !== ft) return false;
    if (q && [e.content, e.insight, e.author, e.type].join(' ').toLowerCase().indexOf(q) < 0) return false;
    return true;
  }).sort((a, b) => String(b.date || b.createdAt).localeCompare(String(a.date || a.createdAt)));

  if (!all.length) {
    return emptyState('·', q || fav || fw !== 'all' || ft !== 'all' ? '没有匹配的摘抄' : '还没有摘抄',
      q || fav || fw !== 'all' || ft !== 'all' ? '换个关键词或筛选条件。' : '名句、台词、段落，随手记下；以后可以按作品和标签翻回来。',
      '<button class="btn btn-primary btn-sm" data-action="new-excerpt">＋ 添加第一条</button>');
  }

  return '<div class="ex-list">' + all.map((e) => {
    const w = e.workId ? getWork(e.workId) : null;
    const pos = [e.position && e.position.chapter, e.position && e.position.page ? 'p.' + e.position.page : '',
      e.position && e.position.episode, e.position && e.position.time, e.position && e.position.note].filter(Boolean).join(' · ');
    return '<div class="ex-card">' +
      '<button class="ex-star" data-action="ex-star" data-id="' + e.id + '" aria-label="精选">' + (e.fav ? '★' : '☆') + '</button>' +
      '<button class="ex-open" data-action="edit-excerpt" data-id="' + e.id + '">' +
      '<span class="ex-quote">' + esc(e.content) + '</span>' +
      (e.insight ? '<span class="ex-insight">' + esc(truncate(e.insight, 80)) + '</span>' : '') +
      '<span class="ex-meta">' +
      '<span class="badge">' + esc(e.type || '名句') + '</span>' +
      (w ? '<span>' + esc(w.title) + '</span>' : '<span>独立摘抄</span>') +
      (e.author ? '<span>' + esc(e.author) + '</span>' : '') +
      (pos ? '<span class="mono">' + esc(pos) + '</span>' : '') +
      '<span>' + esc(e.date || '') + '</span>' +
      '</span></button></div>';
  }).join('') + '</div>';
}

function workOptions(current) {
  return '<option value="">不关联作品</option>' + liveWorks()
    .sort((a, b) => String(a.title).localeCompare(String(b.title), 'zh-Hans-CN'))
    .map((w) => '<option value="' + w.id + '"' + (w.id === current ? ' selected' : '') + '>' + esc(w.title) + '</option>').join('');
}

export function openExcerptEditor(id, presetWorkId) {
  const cur = id ? excerpts.get(id) : null;
  const d = cur ? Object.assign({}, cur, { position: Object.assign({}, cur.position) }) : {
    id: '', workId: presetWorkId || '', content: '', author: '', type: '名句',
    position: {}, date: todayISO(), insight: '', tags: []
  };
  const w = d.workId ? getWork(d.workId) : null;

  const body = '<div>' +
    '<label class="field"><span class="field-label">摘抄内容</span>' +
    '<textarea class="textarea" id="ex-content" rows="4" placeholder="原文照录">' + esc(d.content) + '</textarea></label>' +
    '<div class="row2"><label class="field"><span class="field-label">类型</span><select class="select" id="ex-type">' +
    EXCERPT_TYPES.map((t) => '<option' + (d.type === t ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></label>' +
    '<label class="field"><span class="field-label">日期</span><input class="input" type="date" id="ex-date" value="' + esc(d.date) + '"></label></div>' +
    '<div class="row2"><label class="field"><span class="field-label">关联作品</span><select class="select" id="ex-work">' + workOptions(d.workId) + '</select></label>' +
    '<label class="field"><span class="field-label">作者 / 角色</span><input class="input" id="ex-author" value="' + esc(d.author) + '"></label></div>' +
    '<div id="ex-pos">' + positionFields(w, d.position) + '</div>' +
    '<label class="field"><span class="field-label">个人理解</span><textarea class="textarea" id="ex-insight" rows="3" placeholder="为什么记下它">' + esc(d.insight) + '</textarea></label>' +
    '<label class="switch" style="margin-bottom:10px"><input type="checkbox" id="ex-fav"' + (d.fav ? ' checked' : '') + '><i></i><span>加入精选</span></label>' +
    (cur ? '<button type="button" class="btn btn-danger btn-sm" data-action="del-excerpt" data-id="' + cur.id + '">删除这条</button>' : '') +
    '</div>';

  openModal({
    title: cur ? '编辑摘抄' : '添加摘抄',
    body,
    wide: true,
    actions: [{ label: '取消', value: null, variant: 'ghost' }, { label: '保存', value: 'save', variant: 'primary' }],
    onMount: (root) => {
      const bindPos = () => {
        root.querySelectorAll('[data-pos]').forEach((el) => {
          el.addEventListener('input', () => { d.position[el.dataset.pos] = el.value; });
        });
      };
      bindPos();
      const bind = (sel, key) => {
        const el = root.querySelector(sel);
        el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => { d[key] = el.value; });
      };
      bind('#ex-content', 'content');
      bind('#ex-type', 'type');
      bind('#ex-date', 'date');
      bind('#ex-author', 'author');
      bind('#ex-insight', 'insight');
      const favEl = root.querySelector('#ex-fav');
      if (favEl) favEl.addEventListener('change', () => { d.fav = favEl.checked; });
      root.querySelector('#ex-work').addEventListener('change', (e) => {
        d.workId = e.target.value;
        const nw = d.workId ? getWork(d.workId) : null;
        root.querySelector('#ex-pos').innerHTML = positionFields(nw, d.position);
        bindPos();
      });
    }
  }).then(async (v) => {
    if (v !== 'save') return;
    if (!String(d.content || '').trim()) { toast('摘抄内容不能为空'); return; }
    const res = await excerpts.save(d);
    if (!res.ok) { toast(res.error || '保存失败', 'error'); return; }
    toast('已保存');
    go('#/knowledge/excerpts');
  });
}

export const actions = {
  'ex-fav': () => { ui.exFav = !ui.exFav; go('#/knowledge/excerpts'); },
  'ex-star': async (el) => {
    const e = excerpts.get(el.dataset.id);
    if (!e) return;
    await excerpts.save(Object.assign({}, e, { fav: !e.fav }));
    go('#/knowledge/excerpts');
  },
  'new-excerpt': (el) => openExcerptEditor(null, el && el.dataset.value ? el.dataset.value : ''),
  'edit-excerpt': (el) => openExcerptEditor(el.dataset.id),
  'del-excerpt': async (el) => {
    const ok = await confirmDialog({ title: '删除这条摘抄？', confirmText: '删除', danger: true });
    if (!ok) return;
    await excerpts.remove(el.dataset.id);
    const modal = document.querySelector('.modal-backdrop.is-on');
    if (modal) modal.remove();
    toast('已删除');
    go('#/knowledge/excerpts');
  }
};
