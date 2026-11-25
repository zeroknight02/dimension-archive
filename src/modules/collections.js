/* ==========================================================
   次元簿 · 待体验与收藏清单
   说明书 5.4：待体验清单是作品档案的一个管理视图，
   不是独立作品库，不得因此建立重复作品。
   ========================================================== */

import { data, collections, liveWorks, getWork, coverUrl, saveExperience, saveTag, tagByName, topics } from '../core/repo.js';
import { COLLECTION_LISTS, TYPES, typeDef } from '../core/schema.js';
import { ui, go } from '../core/state.js';
import { icon, toast, openModal, confirmDialog, emptyState } from '../core/ui.js';
import { esc, todayISO, initials, coverColor } from '../core/format.js';

const PRIORITY = [['high', '高'], ['mid', '中'], ['low', '低']];

function tagNames(ids) {
  return (ids || []).map((id) => (data.tags.find((t) => t.id === id) || {}).name).filter(Boolean);
}

function priorityLabel(p) {
  const hit = PRIORITY.find((x) => x[0] === p);
  return hit ? hit[1] : '中';
}

export function collectionsView() {
  const tab = ui.collectionsTab || 'wish';
  const all = collections.list().filter((c) => getWork(c.workId));
  const typeFilter = ui.collType || 'all';
  const list = all.filter((c) => (c.listType || 'wish') === tab)
    .filter((c) => {
      if (typeFilter === 'all') return true;
      const w = getWork(c.workId);
      return w && w.type === typeFilter;
    })
    .sort((a, b) => {
      const pr = { high: 0, mid: 1, low: 2 };
      const d = (pr[a.priority] || 1) - (pr[b.priority] || 1);
      if (d) return d;
      return String(a.plannedDate || '9999').localeCompare(String(b.plannedDate || '9999'));
    });

  let html = '<header class="page-head">' +
    '<div><p class="eyebrow">收藏清单 · ' + all.length + ' 条</p><h1 class="page-title">待体验</h1></div>' +
    '<div class="head-actions"><button class="icon-btn" data-action="new-collection" aria-label="新增">' + icon('plus', 20) + '</button></div>' +
    '</header>';

  html += '<div class="segbar" style="margin-bottom:14px">' +
    COLLECTION_LISTS.map((c) => '<button class="' + (tab === c.value ? 'is-on' : '') + '" data-action="coll-tab" data-value="' + c.value + '">' +
      c.label + ' <b class="num">' + all.filter((x) => (x.listType || 'wish') === c.value).length + '</b></button>').join('') +
    '</div>';

  html += '<div class="row-flex" style="gap:8px;margin-bottom:12px">' +
    '<select class="select" data-change="coll-type" style="flex:1;min-height:34px"><option value="all">全部类型</option>' +
    TYPES.filter((t) => all.some((c) => (getWork(c.workId) || {}).type === t.id)).map((t) =>
      '<option value="' + t.id + '"' + (typeFilter === t.id ? ' selected' : '') + '>' + esc(t.label) + '</option>').join('') +
    '</select>' +
    '<button class="btn btn-ghost btn-sm" data-action="coll-random">' + icon('spark', 14) + ' 随机抽一条</button>' +
    '<button class="btn btn-ghost btn-sm" data-action="coll-topics">批量入专题</button>' +
    '</div>';

  if (!list.length) {
    return html + emptyState('·', '这个清单还是空的', '把想读、想看、想玩的先放进来，体验完再自动流转成记录。',
      '<button class="btn btn-primary btn-sm" data-action="new-collection">＋ 添加一条</button>');
  }

  return html + '<div class="rows">' + list.map((c) => {
    const w = getWork(c.workId);
    const cover = coverUrl(w);
    return '<div class="rowitem is-static">' +
      '<button class="rowitem-hit" data-action="edit-collection" data-id="' + c.id + '" aria-label="编辑"></button>' +
      '<span class="cover" style="--cc:' + coverColor(w.title) + ';width:40px;flex:0 0 40px">' +
      (cover ? '<img src="' + esc(cover) + '" alt="" loading="lazy">' : '<b>' + esc(initials(w.title)) + '</b>') + '</span>' +
      '<span class="rowitem-main"><b>' + esc(w.title) + '</b>' +
      '<i>' + esc([typeDef(w.type).label, priorityLabel(c.priority) + '优先', c.plannedDate ? '计划 ' + c.plannedDate : '', c.source || ''].filter(Boolean).join(' · ')) + '</i></span>' +
      '<span class="rowitem-side"><button class="btn btn-soft btn-xs" data-action="coll-start" data-id="' + c.id + '">开始</button></span>' +
      '</div>';
  }).join('') + '</div>';
}

function workOptions(currentId) {
  return liveWorks().sort((a, b) => String(a.title).localeCompare(String(b.title), 'zh-Hans-CN'))
    .map((w) => '<option value="' + w.id + '"' + (w.id === currentId ? ' selected' : '') + '>' + esc(w.title) + '</option>').join('');
}

export function openCollectionEditor(id) {
  const cur = id ? collections.get(id) : null;
  const d = cur ? Object.assign({}, cur, { tagIds: (cur.tagIds || []).slice() }) : {
    id: '', workId: liveWorks()[0] ? liveWorks()[0].id : '', listType: ui.collectionsTab || 'wish',
    priority: 'mid', plannedDate: '', source: '', reason: '', note: '', tagIds: []
  };
  if (!liveWorks().length) { toast('先添加一部作品'); go('#/new'); return; }

  const body = '<div>' +
    '<label class="field"><span class="field-label">作品</span><select class="select" id="c-work">' + workOptions(d.workId) + '</select></label>' +
    '<div class="row2"><label class="field"><span class="field-label">清单</span><select class="select" id="c-list">' +
    COLLECTION_LISTS.map((x) => '<option value="' + x.value + '"' + (d.listType === x.value ? ' selected' : '') + '>' + esc(x.label) + '</option>').join('') +
    '</select></label>' +
    '<label class="field"><span class="field-label">优先级</span><select class="select" id="c-priority">' +
    PRIORITY.map((p) => '<option value="' + p[0] + '"' + (d.priority === p[0] ? ' selected' : '') + '>' + p[1] + '</option>').join('') +
    '</select></label></div>' +
    '<div class="row2"><label class="field"><span class="field-label">计划体验日期</span><input class="input" type="date" id="c-date" value="' + esc(d.plannedDate) + '"></label>' +
    '<label class="field"><span class="field-label">来源</span><input class="input" id="c-source" value="' + esc(d.source) + '" placeholder="朋友推荐 / 榜单"></label></div>' +
    '<label class="field"><span class="field-label">收藏原因</span><textarea class="textarea" id="c-reason" rows="2">' + esc(d.reason) + '</textarea></label>' +
    '<label class="field"><span class="field-label">标签</span><input class="input" id="c-tags" value="' + esc(tagNames(d.tagIds).join(' ')) + '" placeholder="空格分隔"></label>' +
    '<label class="field"><span class="field-label">备注</span><textarea class="textarea" id="c-note" rows="2">' + esc(d.note) + '</textarea></label>' +
    (cur ? '<button type="button" class="btn btn-danger btn-sm" data-action="del-collection" data-id="' + cur.id + '">从清单移除</button>' : '') +
    '</div>';

  openModal({
    title: cur ? '编辑清单项' : '加入清单',
    body,
    actions: [{ label: '取消', value: null, variant: 'ghost' }, { label: '保存', value: 'save', variant: 'primary' }],
    onMount: (root) => {
      const get = (sel) => root.querySelector(sel);
      get('#c-work').addEventListener('change', (e) => { d.workId = e.target.value; });
      get('#c-list').addEventListener('change', (e) => { d.listType = e.target.value; });
      get('#c-priority').addEventListener('change', (e) => { d.priority = e.target.value; });
      get('#c-date').addEventListener('change', (e) => { d.plannedDate = e.target.value; });
      get('#c-source').addEventListener('input', (e) => { d.source = e.target.value; });
      get('#c-reason').addEventListener('input', (e) => { d.reason = e.target.value; });
      get('#c-note').addEventListener('input', (e) => { d.note = e.target.value; });
    }
  }).then(async (v) => {
    if (v !== 'save') return;
    const tagText = (document.getElementById('c-tags') || {}).value || '';
    const ids = [];
    for (const name of tagText.split(/[\s,，]+/).map((x) => x.trim()).filter(Boolean)) {
      let t = tagByName(name);
      if (!t) t = (await saveTag({ name })).row;
      if (t) ids.push(t.id);
    }
    d.tagIds = ids;
    const res = await collections.save(d);
    if (!res.ok) { toast(res.error || '保存失败', 'error'); return; }
    toast('已保存');
    go('#/collections');
  });
}

export const actions = {
  'coll-tab': (el) => { ui.collectionsTab = el.dataset.value; go('#/collections'); },
  'new-collection': () => openCollectionEditor(null),
  'edit-collection': (el) => openCollectionEditor(el.dataset.id),
  'del-collection': async (el) => {
    const ok = await confirmDialog({ title: '从清单移除？', desc: '作品档案与体验记录不受影响。', confirmText: '移除', danger: true });
    if (!ok) return;
    await collections.remove(el.dataset.id);
    const modal = document.querySelector('.modal-backdrop.is-on');
    if (modal) modal.remove();
    toast('已移除');
    go('#/collections');
  },
  'coll-random': () => {
    const tab = ui.collectionsTab || 'wish';
    const pool = collections.list().filter((c) => (c.listType || 'wish') === tab && getWork(c.workId));
    if (!pool.length) { toast('清单是空的'); return; }
    const pick = pool[Math.floor(Math.random() * pool.length)];
    toast('抽到：' + (getWork(pick.workId) || {}).title);
    go('#/work/' + pick.workId);
  },
  'coll-topics': () => {
    const tab = ui.collectionsTab || 'wish';
    const pool = collections.list().filter((c) => (c.listType || 'wish') === tab && getWork(c.workId));
    if (!pool.length) { toast('清单是空的'); return; }
    if (!data.topics.length) { toast('先去「分类专题」建一个专题'); go('#/taxonomy'); return; }
    openModal({
      title: '批量加入专题',
      desc: '当前清单里的 ' + pool.length + ' 部作品会一起加入所选专题。',
      body: '<label class="field"><span class="field-label">专题</span><select class="select" id="ct-topic">' +
        data.topics.map((t) => '<option value="' + t.id + '">' + esc(t.title) + '</option>').join('') + '</select></label>',
      actions: [{ label: '取消', value: null, variant: 'ghost' }, { label: '加入', value: 'ok', variant: 'primary' }]
    }).then(async (v) => {
      if (v !== 'ok') return;
      const sel = document.getElementById('ct-topic');
      const t = data.topics.find((x) => x.id === (sel ? sel.value : ''));
      if (!t) return;
      const ids = (t.workIds || []).slice();
      let n = 0;
      pool.forEach((c) => { if (ids.indexOf(c.workId) < 0) { ids.push(c.workId); n++; } });
      await topics.save(Object.assign({}, t, { workIds: ids }));
      toast('已加入 ' + n + ' 部');
    });
  },
  'coll-start': async (el) => {
    const c = collections.get(el.dataset.id);
    if (!c) return;
    const w = getWork(c.workId);
    const res = await saveExperience({
      workId: c.workId,
      experienceType: '首次',
      status: 'doing',
      startDate: todayISO(),
      endDate: '',
      progress: {},
      rating: 0,
      note: c.reason || ''
    });
    if (!res.ok) { toast('创建记录失败', 'error'); return; }
    await collections.remove(c.id);
    toast('已开始，清单项已归档');
    go('#/work/' + w.id);
  }
};
