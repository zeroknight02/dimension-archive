/* ==========================================================
   次元簿 · 作品表单
   说明书 5.2.2 / 5.2.3 / 5.2.4 / 16.7
   专属字段按类型动态渲染，只展示与该类型相关的项；
   编辑时未显示的字段原样保留，不被误清空。
   ========================================================== */

import { data, getWork, detailsOf, saveWork, liveWorks, saveCoverPair, imageUrl } from '../core/repo.js';
import { TYPES, TYPE_MAP, GROUPS, FIELDS, FIELD_GROUPS, typeDef, statusOptions } from '../core/schema.js';
import { ui, go } from '../core/state.js';
import { icon, toast, openModal, groupIcon } from '../core/ui.js';
import { esc, initials, coverColor } from '../core/format.js';

let draft = null;
let saving = false;
/* 已应用到草稿的路由类型：手动换类型后同步更新，避免又被路由改回去 */
let appliedRoute = '';

export function startNew(typeId, silent, preset) {
  const type = TYPE_MAP[typeId] ? typeId : 'book';
  draft = {
    id: '',
    type,
    title: '',
    originalTitle: '',
    aliases: [],
    creator: '',
    year: '',
    rating: 0,
    status: 'wish',
    summary: '',
    note: '',
    source: '',
    categoryId: '',
    tagIds: [],
    cover: '',
    thumb: '',
    fields: {},
    isNew: true
  };
  /* 允许带预填值：期刊补录某期、从刊系新增一期都走这里 */
  if (preset) {
    Object.keys(preset).forEach((k) => {
      if (k === 'fields') draft.fields = Object.assign({}, draft.fields, preset.fields || {});
      else if (k in draft) draft[k] = preset[k];
      else draft[k] = preset[k];
    });
  }
  ui.editing = draft;
  if (!silent) go('#/new');
}

export function startEdit(id, silent) {
  const w = getWork(id);
  if (!w) { toast('作品不存在', 'error'); return; }
  draft = {
    id: w.id,
    type: w.type,
    title: w.title || '',
    originalTitle: w.originalTitle || '',
    aliases: (w.aliases || []).slice(),
    creator: w.creator || '',
    year: w.year || '',
    rating: w.rating || 0,
    status: w.status || 'wish',
    summary: w.summary || '',
    note: w.note || '',
    source: w.source || '',
    categoryId: w.categoryId || '',
    tagIds: (w.tagIds || []).slice(),
    cover: w.cover || '',
    thumb: w.thumb || '',
    fields: Object.assign({}, detailsOf(w.id)),
    isNew: false
  };
  ui.editing = draft;
  if (!silent) go('#/edit/' + id);
}


/* ---------------- 渲染 ---------------- */

function fieldInput(key, def, value) {
  const id = 'f-' + key;
  const label = '<span class="field-label">' + esc(def.l) + '</span>';
  if (def.t === 'select') {
    return '<label class="field">' + label +
      '<select class="select" data-field="' + key + '">' +
      '<option value="">未填</option>' +
      (def.o || []).map((o) => '<option value="' + esc(o) + '"' + (String(value) === o ? ' selected' : '') + '>' + esc(o) + '</option>').join('') +
      '</select></label>';
  }
  if (def.t === 'long') {
    return '<label class="field">' + label +
      '<textarea class="textarea" data-field="' + key + '" rows="3" placeholder="' + esc(def.ph || '') + '">' + esc(value) + '</textarea></label>';
  }
  const type = def.t === 'num' ? 'number' : def.t === 'date' ? 'date' : 'text';
  return '<label class="field">' + label +
    '<input class="input" id="' + id + '" type="' + type + '" data-field="' + key + '" value="' + esc(value) + '" ' +
    'placeholder="' + esc(def.ph || '') + '"' + (def.t === 'num' ? ' inputmode="decimal" step="any"' : '') + '></label>';
}

function typeChips(active) {
  return '<div class="type-picker">' + ['text', 'film', 'comic', 'stage', 'audio', 'game', 'custom'].map((g) => {
    const list = TYPES.filter((t) => t.group === g);
    if (!list.length) return '';
    return '<p class="tp-group">' + esc(GROUPS[g].label) + '</p><div class="chips">' +
      list.map((t) => '<button class="chip' + (active === t.id ? ' is-on' : '') + '" data-action="pick-type" data-value="' + t.id + '">' +
        esc(t.label) + '</button>').join('') + '</div>';
  }).join('') + '</div>';
}

/* 每种类型的关键字段：新增/编辑时放在最前面，只显示这个类型需要的项 */
function coreKeys(def) {
  const g = def.group;
  if (def.id === 'magazine' || def.id === 'newspaper') return ['magName', 'issueNo', 'issueDate', 'publisher', 'pages', 'price'];
  if (g === 'text') return ['publisher', 'pages', 'isbn', 'binding', 'price', 'format'];
  if (g === 'film') {
    return def.mode === 'series'
      ? ['channel', 'epCount', 'seasons', 'airWeekday', 'airStart', 'epRuntime']
      : ['releaseDate', 'runtime', 'screeningFormat', 'releaseRegion', 'cast'];
  }
  if (g === 'comic') return ['volumes', 'chapters', 'serialStatus', 'updateCycle', 'updateWeekday'];
  if (g === 'stage') return ['venue', 'location', 'shows', 'seat', 'releaseDate'];
  if (g === 'audio') {
    return def.mode === 'series'
      ? ['epCount', 'epRuntime', 'updateCycle', 'updateWeekday', 'platform']
      : ['albumType', 'tracks', 'label', 'releaseDate', 'musicGenre'];
  }
  if (g === 'game') {
    return def.mode === 'percent'
      ? ['platforms', 'gameType', 'playTime', 'completion', 'chineseSupport']
      : ['publisher', 'releaseDate', 'players', 'runtime', 'gameType'];
  }
  return [];
}

function yearLabel(def) {
  if (def.group === 'film') return '上映年份';
  if (def.group === 'stage') return '演出年份';
  if (def.group === 'audio') return '发行年份';
  if (def.group === 'game') return '发行年份';
  if (def.id === 'magazine' || def.id === 'newspaper') return '年份';
  return '出版年份';
}

export function workFormView() {
  /* 路由决定草稿身份：编辑页必须对应同一 id，新建页不能沿用编辑草稿 */
  const routeType = (ui.route.name === 'new' && ui.route.id && TYPE_MAP[ui.route.id]) ? ui.route.id : '';
  if (ui.route.name === 'edit' && ui.route.id) {
    if (!draft || draft.id !== ui.route.id) { startEdit(ui.route.id, true); appliedRoute = ''; }
  } else if (ui.route.name === 'new') {
    if (!draft || draft.id) {
      startNew(routeType || (draft && draft.type) || 'book', true);
      appliedRoute = routeType;
    } else if (routeType && routeType !== appliedRoute) {
      startNew(routeType, true);
      appliedRoute = routeType;
    }
  } else if (!draft) {
    startNew('book', true);
    appliedRoute = '';
  }
  const isNew = !draft.id;
  const def = typeDef(draft.type);
  const d = draft.fields || {};
  const cover = draft.cover ? imageUrl(draft.cover) : '';
  const core = coreKeys(def).filter((k) => FIELDS[k]);

  let html = '<header class="page-head">' +
    '<div class="head-left"><button class="icon-btn" data-action="' + (isNew ? 'go" data-to="#/home' : 'cancel-edit') + '" aria-label="返回">' + icon('close', 20) + '</button>' +
    '<div><p class="eyebrow">' + (isNew ? '新增' + def.label : '编辑' + def.label) + '</p>' +
    '<h1 class="page-title">' + (isNew ? '记录' + esc(def.label) : esc(draft.title)) + '</h1></div></div>' +
    '<div class="head-actions"><button class="btn btn-primary btn-sm" data-action="save-work" id="save-work-btn">保存</button></div>' +
    '</header>';

  html += '<form class="wform" id="work-form" autocomplete="off" onsubmit="return false">';

  html += '<section class="section"><div class="section-head"><h2 class="section-title">基本信息</h2>' +
    '<span class="section-note">带 * 为必填</span></div>';

  html += '<label class="field"><span class="field-label">作品类型<span class="req">*</span></span>' +
    '<button type="button" class="select type-open" data-action="open-type">' +
    groupIcon(def.group, 15) + '<span>' + esc(def.label) + '</span>' + icon('down', 15) + '</button></label>';

  html += '<label class="field"><span class="field-label">' + (def.id === 'magazine' || def.id === 'newspaper' ? '本期名称' : '名称') + '<span class="req">*</span></span>' +
    '<input class="input" id="w-title" data-bind="title" value="' + esc(draft.title) + '" placeholder="' +
    (def.id === 'magazine' ? '如：三联生活周刊 2026 年第 12 期' : '作品主标题') + '" maxlength="120" autocomplete="off"></label>';

  html += '<div class="row2">' +
    '<label class="field"><span class="field-label">' + esc(def.creator || '创作者') + '</span>' +
    '<input class="input" data-bind="creator" value="' + esc(draft.creator) + '" placeholder="选填" maxlength="60"></label>' +
    '<label class="field"><span class="field-label">' + yearLabel(def) + '</span>' +
    '<input class="input" data-bind="year" type="number" inputmode="numeric" value="' + esc(draft.year) + '" placeholder="2026"></label>' +
    '</div>';

  html += '<label class="field"><span class="field-label">原文名称</span>' +
    '<input class="input" data-bind="originalTitle" value="' + esc(draft.originalTitle) + '" placeholder="外文原名，用于去重与检索"></label>';

  html += '<label class="field"><span class="field-label">别名</span>' +
    '<input class="input" data-bind="aliases" value="' + esc((draft.aliases || []).join(' / ')) + '" placeholder="多个译名用空格或 / 分隔"></label>';

  html += '<div class="row2">' +
    '<label class="field"><span class="field-label">状态</span><select class="select" data-bind="status">' +
    statusOptions(def.statusSet).map((o) => '<option value="' + o.value + '"' + (draft.status === o.value ? ' selected' : '') + '>' + esc(o.label) + '</option>').join('') +
    '</select></label>' +
    '<label class="field"><span class="field-label">个人评分</span>' +
    '<select class="select" data-bind="rating">' +
    '<option value="0">未评分</option>' +
    [10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6, 5.5, 5, 4, 3, 2, 1].map((v) =>
      '<option value="' + v + '"' + (Number(draft.rating) === v ? ' selected' : '') + '>' + v + ' 分</option>').join('') +
    '</select></label></div>';

  html += '</section>';

  /* 类型专属关键信息：随类型切换，不共用一套模板 */
  if (core.length) {
    html += '<section class="section"><div class="section-head"><h2 class="section-title">' + esc(def.label) + '信息</h2>' +
      '<span class="section-note">只显示' + esc(def.label) + '需要的字段</span></div>' +
      '<div class="field-grid">' + core.map((k) => fieldInput(k, FIELDS[k], d[k] === undefined ? '' : d[k])).join('') + '</div>' +
      '</section>';
  }

  html += '<label class="field"><span class="field-label">封面</span>' +
    '<div class="cover-pick">' +
    '<span class="cover-pick-prev" style="--cc:' + coverColor(draft.title) + '">' +
    (cover ? '<img src="' + esc(cover) + '" alt="">' : '<b>' + esc(initials(draft.title)) + '</b>') +
    '</span>' +
    '<label class="btn btn-ghost btn-sm">' + (cover ? '更换封面' : '选择图片') +
    '<input type="file" accept="image/*" data-cover hidden></label>' +
    (cover ? '<button type="button" class="btn btn-ghost btn-sm" data-action="clear-cover">移除</button>' : '') +
    '</div></label>';

  html += '<label class="field"><span class="field-label">简介</span>' +
    '<textarea class="textarea" data-bind="summary" rows="3" placeholder="作品概要，可以留空">' + esc(draft.summary) + '</textarea></label>';

  html += '<label class="field"><span class="field-label">个人备注</span>' +
    '<textarea class="textarea" data-bind="note" rows="2" placeholder="只给自己看的说明">' + esc(draft.note) + '</textarea></label>';

  /* 其余专属字段：按 作品 / 制作 / 我的 分组，默认展开第一组 */
  const typeFields = def.fields || [];
  ['work', 'prod', 'mine'].forEach((g, gi) => {
    const keys = typeFields.filter((k) => FIELDS[k] && FIELDS[k].g === g && core.indexOf(k) < 0);
    if (!keys.length) return;
    const filled = keys.filter((k) => d[k] !== undefined && String(d[k]).trim() !== '').length;
    html += '<details class="section fold" ' + (gi === 0 || filled ? 'open' : '') + '>' +
      '<summary class="section-head"><h2 class="section-title">' + esc(FIELD_GROUPS[g]) + '信息</h2>' +
      '<span class="section-note">' + (filled ? filled + ' / ' : '') + keys.length + ' 项</span></summary>' +
      '<div class="field-grid">' + keys.map((k) => fieldInput(k, FIELDS[k], d[k] === undefined ? '' : d[k])).join('') + '</div>' +
      '</details>';
  });

  /* 分类与标签 */
  html += '<details class="section fold" open><summary class="section-head"><h2 class="section-title">分类与标签</h2>' +
    '<span class="section-note">' + (draft.tagIds || []).length + ' 个标签</span></summary>' +
    '<label class="field"><span class="field-label">分类</span><select class="select" data-bind="categoryId">' +
    '<option value="">未分类</option>' +
    data.categories.map((c) => '<option value="' + c.id + '"' + (draft.categoryId === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>').join('') +
    '</select></label>' +
    '<label class="field"><span class="field-label">标签</span>' +
    '<input class="input" data-bind="tags" value="' + esc(tagNames(draft.tagIds)) + '" placeholder="空格分隔，如：科幻 已读完"></label>' +
    '</details>';

  html += '</form>';
  html += '<div class="form-foot"><button class="btn btn-primary btn-block" data-action="save-work">保存作品</button></div>';
  html += '<div style="height:24px"></div>';
  return html;
}

function tagNames(ids) {
  return (ids || []).map((id) => {
    const t = data.tags.find((x) => x.id === id);
    return t ? t.name : '';
  }).filter(Boolean).join(' ');
}

/* ---------------- 表单事件绑定 ---------------- */

export function bindWorkForm(root) {
  const form = root.querySelector('#work-form');
  if (!form || !draft) return;

  form.addEventListener('input', (e) => {
    ui.dirty = true;
    const el = e.target;
    if (el.dataset.bind) {
      const key = el.dataset.bind;
      if (key === 'aliases') {
        draft.aliases = String(el.value).split(/[\s/、,，]+/).filter(Boolean);
      } else if (key === 'tags') {
        draft.pendingTags = String(el.value);
      } else if (key === 'rating') {
        draft.rating = Number(el.value) || 0;
      } else {
        draft[key] = el.value;
      }
    }
    if (el.dataset.field) {
      draft.fields[el.dataset.field] = el.value;
    }
  });
  form.addEventListener('change', (e) => {
    ui.dirty = true;
    const el = e.target;
    if (el.dataset.bind === 'status') draft.status = el.value;
    if (el.dataset.bind === 'categoryId') draft.categoryId = el.value;
    if (el.dataset.bind === 'rating') draft.rating = Number(el.value) || 0;
    if (el.dataset.field) draft.fields[el.dataset.field] = el.value;
    if (el.dataset.cover !== undefined) {
      const file = el.files && el.files[0];
      el.value = '';
      if (!file) return;
      toast('处理中…');
      saveCoverPair(file).then((pair) => {
        if (!pair.cover) { toast('封面保存失败', 'error'); return; }
        draft.cover = pair.cover;
        draft.thumb = pair.thumb;
        renderForm();
        toast('封面已更新');
      }).catch((err) => toast(err.message || '封面处理失败', 'error'));
    }
  });
}

function renderForm() {
  const view = document.getElementById('view');
  if (!view) return;
  const y = window.scrollY;
  view.innerHTML = '<div class="page">' + workFormView() + '</div>';
  window.scrollTo(0, y);
  bindWorkForm(view);
}

/* ---------------- 类型选择 ---------------- */

function openTypePicker() {
  openModal({
    title: '作品类型',
    desc: '类型决定专属字段与状态集。选错了随时可以改。',
    wide: true,
    body: typeChips(draft.type),
    actions: [{ label: '完成', value: null, variant: 'primary' }]
  });
}

/* ---------------- 保存与重复检测 ---------------- */

function normalize(s) {
  return String(s || '').toLowerCase().replace(/[\s《》「」()（）\-_:：·.,，。]/g, '');
}

function similar(a, b) {
  const x = normalize(a);
  const y = normalize(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const short = x.length < y.length ? x : y;
  const long = x.length < y.length ? y : x;
  if (long.indexOf(short) >= 0 && short.length >= Math.min(2, long.length)) return 0.9;
  let hit = 0;
  for (const ch of new Set(short)) if (long.indexOf(ch) >= 0) hit++;
  return hit / new Set(short).size * 0.6;
}

function findDuplicates(w) {
  return liveWorks().filter((x) => x.id !== w.id).map((x) => {
    let score = similar(w.title, x.title);
    if (w.originalTitle && x.originalTitle && normalize(w.originalTitle) === normalize(x.originalTitle)) score = Math.max(score, 0.95);
    if (w.type === x.type) score += 0.15;
    else score -= 0.25;
    if (w.year && x.year && String(w.year) === String(x.year)) score += 0.1;
    if (w.creator && x.creator && normalize(w.creator) === normalize(x.creator)) score += 0.1;
    return { work: x, score: Math.min(1, score) };
  }).filter((x) => x.score >= 0.62).sort((a, b) => b.score - a.score).slice(0, 3);
}

async function ensureTags(names) {
  const ids = [];
  for (const name of names) {
    if (!name) continue;
    let tag = data.tags.find((t) => t.name === name);
    if (!tag) {
      const { saveTag } = await import('../core/repo.js');
      const r = await saveTag({ name });
      tag = r.row;
    }
    if (tag) ids.push(tag.id);
  }
  return ids;
}

export async function saveCurrent() {
  if (!draft || saving) return;
  const title = String(draft.title || '').trim();
  if (!title) {
    toast('名称不能为空', 'error');
    const input = document.getElementById('w-title');
    if (input) { input.focus(); input.classList.add('is-error'); }
    return;
  }
  const btn = document.getElementById('save-work-btn');
  if (btn) btn.disabled = true;
  saving = true;

  try {
    if (draft.isNew || !draft.id) {
      const cand = Object.assign({}, draft, { id: '' });
      const dups = findDuplicates(cand);
      if (dups.length) {
        const keep = await dupPrompt(title, dups);
        if (keep === 'cancel') { saving = false; if (btn) btn.disabled = false; return; }
        if (keep === 'merge') {
          saving = false;
          if (btn) btn.disabled = false;
          go('#/work/' + dups[0].work.id);
          toast('已打开已有档案，请手动补充信息');
          return;
        }
      }
    }

    const tags = draft.pendingTags !== undefined
      ? draft.pendingTags.split(/[\s,，]+/).filter(Boolean)
      : tagNames(draft.tagIds).split(/\s+/).filter(Boolean);
    const tagIds = await ensureTags(tags);

    const work = {
      id: draft.id || '',
      type: draft.type,
      title,
      originalTitle: draft.originalTitle || '',
      aliases: draft.aliases || [],
      creator: draft.creator || '',
      year: draft.year || '',
      rating: Number(draft.rating) || 0,
      status: draft.status || 'wish',
      summary: draft.summary || '',
      note: draft.note || '',
      source: draft.source || (draft.fields && draft.fields.source) || '',
      categoryId: draft.categoryId || '',
      tagIds,
      cover: draft.cover || '',
      thumb: draft.thumb || ''
    };

    const res = await saveWork(work, draft.fields || {});
    if (!res.ok) {
      toast(res.error || '保存失败，内容已保留，请重试', 'error');
      saving = false;
      if (btn) btn.disabled = false;
      return;
    }
    const isNew = !draft.id;
    const savedId = res.work.id;
    draft = null;
    ui.editing = null;
    toast(isNew ? '已入册' : '已保存');
    if (isNew) {
      /* 新作品进收藏册时播放入册演出 */
      const t = res.work.type;
      go('#/album/' + t);
    } else {
      go('#/work/' + savedId);
    }
  } catch (e) {
    toast('保存失败：' + (e.message || '未知错误'), 'error');
    saving = false;
    if (btn) btn.disabled = false;
  } finally {
    saving = false;
  }
}

function dupPrompt(title, dups) {
  return new Promise((resolve) => {
    const body = '<p style="font-size:13px;color:var(--text-2);margin-bottom:12px">' +
      '数据库里已有相似档案。请确认是同一部作品，还是不同的作品。</p>' +
      dups.map((x) => '<div class="dup-row"><b>' + esc(x.work.title) + '</b>' +
        '<span>' + esc(typeDef(x.work.type).label) + ' · ' + esc(x.work.creator || '—') + ' · ' + esc(x.work.year || '—') +
        ' · 相似度 ' + Math.round(x.score * 100) + '%</span>' +
        '<button type="button" class="btn btn-ghost btn-xs" data-action="open-dup" data-id="' + x.work.id + '">查看</button></div>').join('');

    openModal({
      title: '可能重复：「' + title + '」',
      body,
      actions: [
        { label: '取消', value: 'cancel', variant: 'ghost' },
        { label: '仍然新建', value: 'create', variant: 'ghost' },
        { label: '打开已有档案', value: 'merge', variant: 'primary' }
      ]
    }).then((v) => resolve(v || 'cancel'));
  });
}

/* ---------------- 动作 ---------------- */

export const actions = {
  'new-work': (el) => startNew(el && el.dataset.value ? el.dataset.value : (ui.route.id || 'book')),
  'edit-work': (el) => startEdit(el.dataset.id),
  'save-work': () => saveCurrent(),
  'open-type': () => openTypePicker(),
  'pick-type': (el) => {
    if (!draft) return;
    draft.type = el.dataset.value;
    const def = typeDef(draft.type);
    const opts = statusOptions(def.statusSet);
    if (!opts.some((o) => o.value === draft.status)) draft.status = opts[0] ? opts[0].value : 'wish';
    appliedRoute = (ui.route.name === 'new' && ui.route.id) ? ui.route.id : '';
    const modal = document.querySelector('.modal-backdrop.is-on');
    if (modal) modal.remove();
    renderForm();
  },
  'clear-cover': () => {
    if (!draft) return;
    draft.cover = '';
    renderForm();
  },
  'cancel-edit': () => {
    draft = null;
    ui.editing = null;
    go('#/works');
  },
  'open-dup': (el) => {
    const modal = document.querySelector('.modal-backdrop.is-on');
    if (modal) modal.remove();
    go('#/work/' + el.dataset.id);
  }
};
