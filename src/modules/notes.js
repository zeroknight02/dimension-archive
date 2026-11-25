/* ==========================================================
   次元簿 · 独立笔记（说明书 8.1）
   不属于任何作品的长期笔记：阅读心得、理论、研究观察。
   每次改正文都会留一个历史版本，可回溯、可恢复。
   ========================================================== */

import {
  data, notes, noteVersions, versionsOf, saveNote, restoreNoteVersion,
  liveWorks, getWork, saveTag, tagByName
} from '../core/repo.js';
import { ui, go } from '../core/state.js';
import { icon, toast, openModal, confirmDialog, emptyState } from '../core/ui.js';
import { esc, todayISO, truncate } from '../core/format.js';
import { knowledgeTabs, mdToHtml } from './reviews.js';

function tagNames(ids) {
  return (ids || []).map((id) => (data.tags.find((t) => t.id === id) || {}).name).filter(Boolean);
}

function workNames(ids) {
  return (ids || []).map((id) => (getWork(id) || {}).title).filter(Boolean);
}

export function notesView() {
  const tagFilter = ui.noteTag || '';
  const all = notes.list();

  let html = '<header class="page-head">' +
    '<div><p class="eyebrow">知识库 · ' + all.length + ' 篇</p><h1 class="page-title">笔记</h1></div>' +
    '<div class="head-actions"><button class="icon-btn" data-action="new-note" aria-label="新建笔记">' + icon('plus', 20) + '</button></div>' +
    '</header>';

  html += knowledgeTabs('notes');

  html += '<div class="searchbar" style="margin-bottom:12px">' + icon('search', 16) +
    '<input id="note-search" type="search" placeholder="搜索标题、正文、标签" value="' + esc(ui.noteQ || '') + '" autocomplete="off"></div>';

  const tags = data.tags.filter((t) => notes.list().some((n) => (n.tagIds || []).indexOf(t.id) >= 0));
  if (tags.length) {
    html += '<div class="chips" style="margin-bottom:12px">' +
      '<button class="chip' + (!tagFilter ? ' is-on' : '') + '" data-action="note-tag" data-value="">全部</button>' +
      tags.map((t) => '<button class="chip' + (tagFilter === t.id ? ' is-on' : '') + '" data-action="note-tag" data-value="' + t.id + '">#' + esc(t.name) + '</button>').join('') +
      '</div>';
  }

  html += '<div id="note-body">' + notesBodyHTML() + '</div>';
  return html;
}

export function paintNotes() {
  const box = document.getElementById('note-body');
  if (box) box.innerHTML = notesBodyHTML();
}

function notesBodyHTML() {
  const tagFilter = ui.noteTag || '';
  const q = String(ui.noteQ || '').trim().toLowerCase();
  const all = notes.list()
    .filter((n) => !tagFilter || (n.tagIds || []).indexOf(tagFilter) >= 0)
    .filter((n) => {
      if (!q) return true;
      const tagText = tagNames(n.tagIds).join(' ');
      const workText = workNames(n.workIds).join(' ');
      return [n.title, n.body, tagText, workText].join(' ').toLowerCase().indexOf(q) >= 0;
    })
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) ||
      String(b.updatedAt).localeCompare(String(a.updatedAt)));

  if (!all.length) {
    return emptyState('·', q ? '没有匹配的笔记' : '还没有独立笔记',
      q ? '换个关键词。' : '不属于任何作品的长期观察、理论梳理、研究笔记都放这里，改动会自动留版本。',
      '<button class="btn btn-primary btn-sm" data-action="new-note">＋ 写第一篇</button>');
  }

  return '<div class="note-list">' + all.map((n) => {
    const vc = versionsOf(n.id).length;
    const ws = workNames(n.workIds);
    return '<button class="note-card" data-action="edit-note" data-id="' + n.id + '">' +
      '<span class="note-top">' +
      (n.pinned ? '<span class="badge is-violet">置顶</span>' : '') +
      '<span class="note-date">' + esc((n.updatedAt || '').slice(0, 10)) + '</span>' +
      (vc ? '<span class="note-ver">' + vc + ' 个历史版本</span>' : '') +
      '</span>' +
      '<b class="note-title">' + esc(n.title || '未命名笔记') + '</b>' +
      '<span class="note-body">' + esc(truncate(String(n.body || '').replace(/[#>*`]/g, ''), 140)) + '</span>' +
      '<span class="note-meta">' +
      tagNames(n.tagIds).map((t) => '<span class="tagpill">#' + esc(t) + '</span>').join('') +
      (ws.length ? '<span>' + esc(ws.slice(0, 2).join('、') + (ws.length > 2 ? ' 等' : '')) + '</span>' : '<span>未关联作品</span>') +
      '</span></button>';
  }).join('') + '</div>';
}

export function openNoteEditor(id) {
  const cur = id ? notes.get(id) : null;
  const d = cur ? Object.assign({}, cur, {
    tagIds: (cur.tagIds || []).slice(),
    workIds: (cur.workIds || []).slice(),
    creatorIds: (cur.creatorIds || []).slice()
  }) : {
    id: '', title: '', body: '', categoryId: '', tagIds: [], workIds: [], creatorIds: [],
    pinned: false, date: todayISO()
  };

  const versions = cur ? versionsOf(cur.id) : [];
  const catOptions = '<option value="">未分类</option>' + data.categories.map((c) =>
    '<option value="' + c.id + '"' + (d.categoryId === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('');

  const body = '<div class="note-editor">' +
    '<label class="field"><span class="field-label">标题</span><input class="input" id="nt-title" value="' + esc(d.title) + '" placeholder="这篇笔记讲什么"></label>' +
    '<label class="field"><span class="field-label">正文（Markdown：## 标题、**粗体**、- 列表、> 引用）</span>' +
    '<textarea class="textarea note-textarea" id="nt-body" rows="14">' + esc(d.body) + '</textarea></label>' +
    '<div class="row2"><label class="field"><span class="field-label">知识分类</span><select class="select" id="nt-cat">' + catOptions + '</select></label>' +
    '<label class="field"><span class="field-label">标签</span><input class="input" id="nt-tags" value="' + esc(tagNames(d.tagIds).join(' ')) + '" placeholder="空格分隔"></label></div>' +
    '<label class="field"><span class="field-label">关联作品（可多选，按住 Ctrl / ⌘）</span>' +
    '<select class="select note-multi" id="nt-works" multiple size="5">' +
    liveWorks().sort((a, b) => String(a.title).localeCompare(String(b.title), 'zh-Hans-CN')).map((w) =>
      '<option value="' + w.id + '"' + (d.workIds.indexOf(w.id) >= 0 ? ' selected' : '') + '>' + esc(w.title) + '</option>').join('') +
    '</select></label>' +
    '<label class="field"><span class="field-label">关联人物（可多选）</span>' +
    '<select class="select note-multi" id="nt-creators" multiple size="4">' +
    data.creators.filter((c) => !c.deletedAt).map((c) =>
      '<option value="' + c.id + '"' + (d.creatorIds.indexOf(c.id) >= 0 ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') +
    '</select></label>' +
    '<label class="switch" style="margin-bottom:10px"><input type="checkbox" id="nt-pin"' + (d.pinned ? ' checked' : '') + '><i></i><span>置顶</span></label>' +
    '<div class="rev-preview" id="nt-preview"></div>' +
    (versions.length
      ? '<details class="fold" style="margin-top:12px"><summary class="section-head"><h2 class="section-title">历史版本</h2>' +
        '<span class="section-note">' + versions.length + ' 个</span></summary>' +
        '<div class="rows">' + versions.map((v) =>
          '<div class="rowitem is-static"><span class="rowitem-main"><b>' + esc(v.title || '未命名') + '</b>' +
          '<i>' + esc(String(v.savedAt).slice(0, 16).replace('T', ' ')) + ' · ' + esc(truncate(String(v.body || '').replace(/[#>*`]/g, ''), 46)) + '</i></span>' +
          '<span class="rowitem-side"><button class="btn btn-ghost btn-xs" data-action="note-restore" data-id="' + v.id + '" data-note="' + d.id + '">恢复</button></span></div>').join('') +
        '</div></details>'
      : '') +
    (cur ? '<button type="button" class="btn btn-danger btn-sm" data-action="del-note" data-id="' + cur.id + '">删除这篇</button>' : '') +
    '</div>';

  openModal({
    title: cur ? '编辑笔记' : '新建笔记',
    wide: true,
    body,
    actions: [{ label: '取消', value: null, variant: 'ghost' }, { label: '保存', value: 'save', variant: 'primary' }],
    onMount: (root) => {
      const bind = (sel, key, ev) => {
        const el = root.querySelector(sel);
        if (!el) return;
        el.addEventListener(ev || 'input', () => { d[key] = el.value; });
      };
      bind('#nt-title', 'title');
      bind('#nt-cat', 'categoryId', 'change');
      const bodyEl = root.querySelector('#nt-body');
      const paint = () => {
        const pv = root.querySelector('#nt-preview');
        if (pv) pv.innerHTML = d.body ? mdToHtml(d.body) : '';
      };
      if (bodyEl) {
        bodyEl.addEventListener('input', () => { d.body = bodyEl.value; paint(); });
      }
      root.querySelector('#nt-pin').addEventListener('change', (e) => { d.pinned = e.target.checked; });
      paint();
    }
  }).then(async (v) => {
    if (v !== 'save') return;
    const title = (document.getElementById('nt-title') || {}).value || '';
    const bodyText = (document.getElementById('nt-body') || {}).value || '';
    if (!title.trim() && !bodyText.trim()) { toast('写点什么再保存'); return; }
    d.title = title.trim() || bodyText.trim().slice(0, 18);
    d.body = bodyText;
    d.categoryId = (document.getElementById('nt-cat') || {}).value || '';
    d.pinned = !!(document.getElementById('nt-pin') || {}).checked;

    const tagText = (document.getElementById('nt-tags') || {}).value || '';
    const names = tagText.split(/[\s,，]+/).map((x) => x.trim()).filter(Boolean);
    const ids = [];
    for (const name of names) {
      let t = tagByName(name);
      if (!t) t = (await saveTag({ name })).row;
      if (t) ids.push(t.id);
    }
    d.tagIds = ids;
    d.workIds = [...((document.getElementById('nt-works') || {}).selectedOptions || [])].map((o) => o.value);
    d.creatorIds = [...((document.getElementById('nt-creators') || {}).selectedOptions || [])].map((o) => o.value);

    const res = await saveNote(d);
    if (!res.ok) { toast(res.error || '保存失败', 'error'); return; }
    toast('已保存');
    go('#/knowledge/notes');
  });
}

export const actions = {
  'new-note': () => openNoteEditor(null),
  'edit-note': (el) => openNoteEditor(el.dataset.id),
  'note-tag': (el) => { ui.noteTag = el.dataset.value || ''; go('#/knowledge/notes'); },
  'note-restore': async (el) => {
    const ok = await confirmDialog({
      title: '恢复到这个版本？',
      desc: '当前内容会先存为一个历史版本，然后被替换。',
      confirmText: '恢复'
    });
    if (!ok) return;
    const res = await restoreNoteVersion(el.dataset.note, el.dataset.id);
    if (!res.ok) { toast(res.error || '恢复失败', 'error'); return; }
    const m = document.querySelector('.modal-backdrop.is-on');
    if (m) m.remove();
    toast('已恢复，可继续编辑');
    openNoteEditor(el.dataset.note);
  },
  'del-note': async (el) => {
    const id = el.dataset.id;
    const ok = await confirmDialog({ title: '删除这篇笔记？', desc: '历史版本会一起删除，无法恢复。', confirmText: '删除', danger: true });
    if (!ok) return;
    for (const v of versionsOf(id)) await noteVersions.hardRemove(v.id);
    await notes.remove(id);
    const m = document.querySelector('.modal-backdrop.is-on');
    if (m) m.remove();
    toast('已删除');
    go('#/knowledge/notes');
  }
};
