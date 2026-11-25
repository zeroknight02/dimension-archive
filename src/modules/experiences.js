/* ==========================================================
   次元簿 · 体验记录
   说明书 5.3：作品档案描述「这是什么」，体验记录描述
   「我什么时候、以什么方式、进行到什么程度」。
   同一作品可以有多条独立记录，互不覆盖。
   ========================================================== */

import { data, liveWorks, getWork, saveExperience, deleteExperience, statusText, workStatus, coverUrl } from '../core/repo.js';
import { typeDef, statusOptions } from '../core/schema.js';
import { ui, go } from '../core/state.js';
import { icon, toast, openModal, confirmDialog, emptyState } from '../core/ui.js';
import { esc, todayISO, ratingShort, initials, coverColor, progressText } from '../core/format.js';

let draft = null;

const EXP_TYPES = ['首次', '重读', '重看', '重温', '二刷', '三刷', '补完', '回顾'];

export function experiencesView() {
  const all = data.experiences.filter((e) => !e.deletedAt && getWork(e.workId))
    .sort((a, b) => String(b.startDate || '').localeCompare(String(a.startDate || '')) || String(b.createdAt).localeCompare(String(a.createdAt)));

  let html = '<header class="page-head">' +
    '<div><p class="eyebrow">体验记录 · ' + all.length + ' 条</p><h1 class="page-title">记录</h1></div>' +
    '<div class="head-actions"><button class="icon-btn" data-action="new-experience" aria-label="新增体验">' + icon('plus', 20) + '</button></div>' +
    '</header>';

  if (!all.length) {
    return html + emptyState('·', '还没有体验记录', '读完一本书、看完一部电影，都可以在这里记一条。',
      '<button class="btn btn-primary btn-sm" data-action="new-experience">＋ 记一次</button>');
  }

  const groups = {};
  all.forEach((e) => {
    const y = String(e.startDate || e.createdAt || '').slice(0, 4) || '未填日期';
    (groups[y] = groups[y] || []).push(e);
  });

  return html + Object.keys(groups).sort().reverse().map((y) =>
    '<section class="section"><div class="section-head"><h2 class="section-title">' + esc(y) + '</h2>' +
    '<span class="section-note">' + groups[y].length + ' 条</span></div>' +
    '<div class="rows">' + groups[y].map((e) => expRow(e)).join('') + '</div></section>').join('');
}

function expRow(e) {
  const w = getWork(e.workId);
  if (!w) return '';
  const def = typeDef(w.type);
  const prog = progressText(def, e.progress);
  const cover = coverUrl(w);
  return '<button class="rowitem" data-action="edit-experience" data-id="' + e.id + '">' +
    '<span class="cover" style="--cc:' + coverColor(w.title) + ';width:40px;flex:0 0 40px">' +
    (cover ? '<img src="' + esc(cover) + '" alt="" loading="lazy">' : '<b>' + esc(initials(w.title)) + '</b>') + '</span>' +
    '<span class="rowitem-main"><b>' + esc(w.title) + '</b>' +
    '<i>' + esc([e.startDate || '—', e.endDate || '', statusText(Object.assign({}, w, { status: e.status })), prog, e.rating ? '★ ' + ratingShort(e.rating) : ''].filter(Boolean).join(' · ')) + '</i></span>' +
    '<span class="rowitem-side">' + icon('right', 16) + '</span></button>';
}

/* ---------------- 表单 ---------------- */

export function startExperience(workId, expId) {
  const existing = expId ? data.experiences.find((e) => e.id === expId) : null;
  const w = existing ? getWork(existing.workId) : (workId ? getWork(workId) : null);
  if (!w && !existing) {
    toast('先选一部作品');
    go('#/works');
    return;
  }
  draft = existing
    ? Object.assign({}, existing, { progress: Object.assign({}, existing.progress) })
    : {
      id: '',
      workId: w.id,
      experienceType: '首次',
      status: workStatus(w) || 'todo',
      startDate: todayISO(),
      endDate: '',
      progress: {},
      rating: 0,
      note: ''
    };
  openExperienceModal();
}

function workSelect(currentId) {
  const list = liveWorks().sort((a, b) => String(a.title).localeCompare(String(b.title), 'zh-Hans-CN'));
  return '<select class="select" id="exp-work">' + list.map((w) =>
    '<option value="' + w.id + '"' + (w.id === currentId ? ' selected' : '') + '>' +
    esc(w.title) + '（' + esc(typeDef(w.type).label) + '）</option>').join('') + '</select>';
}

function progressFields(w, p) {
  const def = typeDef(w.type);
  const v = p || {};
  if (def.mode === 'book') {
    const unit = v.unit || 'chapter';
    return '<div class="set-row"><span class="set-label">进度单位</span><div class="set-opts">' +
      [['chapter', def.itemUnit || '章'], ['volume', def.volumeUnit || '卷'], ['page', '页']].map((u) =>
        '<button type="button" class="set-opt' + (unit === u[0] ? ' is-on' : '') + '" data-action="exp-unit" data-value="' + u[0] + '">' + esc(u[1]) + '</button>').join('') +
      '</div></div>' +
      (unit === 'volume'
        ? '<div class="row2"><label class="field"><span class="field-label">已到第几卷</span><input class="input" type="number" data-prog="volumeCur" value="' + esc(v.volumeCur || '') + '"></label>' +
        '<label class="field"><span class="field-label">总卷数</span><input class="input" type="number" data-prog="volumeTotal" value="' + esc(v.volumeTotal || '') + '"></label></div>'
        : unit === 'page'
          ? '<div class="row2"><label class="field"><span class="field-label">读到第几页</span><input class="input" type="number" data-prog="pageCur" value="' + esc(v.pageCur || '') + '"></label>' +
          '<label class="field"><span class="field-label">总页数</span><input class="input" type="number" data-prog="pageTotal" value="' + esc(v.pageTotal || '') + '"></label></div>'
          : '<div class="row2"><label class="field"><span class="field-label">已到第几' + esc(def.itemUnit || '章') + '</span><input class="input" type="number" data-prog="chapterCur" value="' + esc(v.chapterCur || '') + '"></label>' +
          '<label class="field"><span class="field-label">总' + esc(def.itemUnit || '章') + '数</span><input class="input" type="number" data-prog="chapterTotal" value="' + esc(v.chapterTotal || '') + '"></label></div>');
  }
  if (def.mode === 'series') {
    return '<div class="row2"><label class="field"><span class="field-label">第几季</span><input class="input" type="number" data-prog="seasonCur" value="' + esc(v.seasonCur || '') + '"></label>' +
      '<label class="field"><span class="field-label">总季数</span><input class="input" type="number" data-prog="seasonTotal" value="' + esc(v.seasonTotal || '') + '"></label></div>' +
      '<div class="row2"><label class="field"><span class="field-label">看到第几' + esc(def.itemUnit || '集') + '</span><input class="input" type="number" data-prog="epCur" value="' + esc(v.epCur || '') + '"></label>' +
      '<label class="field"><span class="field-label">总' + esc(def.itemUnit || '集') + '数</span><input class="input" type="number" data-prog="epTotal" value="' + esc(v.epTotal || '') + '"></label></div>';
  }
  if (def.mode === 'percent') {
    return '<div class="row2"><label class="field"><span class="field-label">完成度（%）</span><input class="input" type="number" data-prog="percent" min="0" max="100" value="' + esc(v.percent || '') + '"></label>' +
      '<label class="field"><span class="field-label">时长（小时）</span><input class="input" type="number" step="0.5" data-prog="hours" value="' + esc(v.hours || '') + '"></label></div>';
  }
  if (def.mode === 'issue') {
    return '<div class="row2"><label class="field"><span class="field-label">年份</span><input class="input" type="number" data-prog="issueYear" value="' + esc(v.issueYear || '') + '"></label>' +
      '<label class="field"><span class="field-label">期号</span><input class="input" data-prog="issueNo" value="' + esc(v.issueNo || '') + '"></label></div>';
  }
  return '<p class="muted" style="font-size:12px">这类作品没有进度概念，记录日期与心得即可。</p>';
}

function openExperienceModal() {
  const w = getWork(draft.workId);
  const def = typeDef(w.type);
  const isNew = !draft.id;

  const body = '<div class="exp-form">' +
    '<label class="field"><span class="field-label">作品</span>' + workSelect(draft.workId) + '</label>' +
    '<div class="row2"><label class="field"><span class="field-label">体验类型</span><select class="select" id="exp-type">' +
    EXP_TYPES.map((t) => '<option' + (draft.experienceType === t ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></label>' +
    '<label class="field"><span class="field-label">状态</span><select class="select" id="exp-status">' +
    statusOptions(def.statusSet).map((o) => '<option value="' + o.value + '"' + (draft.status === o.value ? ' selected' : '') + '>' + esc(o.label) + '</option>').join('') +
    '</select></label></div>' +
    '<div class="row2"><label class="field"><span class="field-label">开始日期</span><input class="input" type="date" id="exp-start" value="' + esc(draft.startDate) + '"></label>' +
    '<label class="field"><span class="field-label">结束日期</span><input class="input" type="date" id="exp-end" value="' + esc(draft.endDate) + '"></label></div>' +
    '<div id="exp-progress">' + progressFields(w, draft.progress) + '</div>' +
    '<label class="field"><span class="field-label">本次评分</span><select class="select" id="exp-rating">' +
    '<option value="0">未评分</option>' +
    [10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((v) => '<option value="' + v + '"' + (Number(draft.rating) === v ? ' selected' : '') + '>' + v + ' 分</option>').join('') +
    '</select></label>' +
    '<label class="field"><span class="field-label">本次心得</span><textarea class="textarea" id="exp-note" rows="3" placeholder="这一遍看/读到了什么">' + esc(draft.note) + '</textarea></label>' +
    (isNew ? '' : '<button type="button" class="btn btn-danger btn-sm" data-action="del-experience" data-id="' + draft.id + '">删除这条记录</button>') +
    '</div>';

  openModal({
    title: isNew ? '记一次体验' : '编辑体验记录',
    desc: w.title + ' · ' + def.label,
    body,
    wide: true,
    actions: [
      { label: '取消', value: null, variant: 'ghost' },
      { label: '保存', value: 'save', variant: 'primary' }
    ],
    onMount: (root) => {
      const bindProg = () => {
        root.querySelectorAll('[data-prog]').forEach((el) => {
          el.addEventListener('input', () => {
            draft.progress[el.dataset.prog] = el.value === '' ? '' : Number(el.value) || el.value;
          });
        });
      };
      bindProg();
      root.querySelector('#exp-type').addEventListener('change', (e) => { draft.experienceType = e.target.value; });
      root.querySelector('#exp-status').addEventListener('change', (e) => { draft.status = e.target.value; });
      root.querySelector('#exp-start').addEventListener('change', (e) => { draft.startDate = e.target.value; });
      root.querySelector('#exp-end').addEventListener('change', (e) => { draft.endDate = e.target.value; });
      root.querySelector('#exp-rating').addEventListener('change', (e) => { draft.rating = Number(e.target.value) || 0; });
      root.querySelector('#exp-note').addEventListener('input', (e) => { draft.note = e.target.value; });
      root.querySelector('#exp-work').addEventListener('change', (e) => {
        draft.workId = e.target.value;
        const nw = getWork(draft.workId);
        root.querySelector('#exp-progress').innerHTML = progressFields(nw, draft.progress);
        bindProg();
      });
      root.querySelectorAll('[data-action="exp-unit"]').forEach((b) => {
        b.addEventListener('click', () => {
          root.querySelectorAll('[data-action="exp-unit"]').forEach((x) => x.classList.remove('is-on'));
          b.classList.add('is-on');
          draft.progress.unit = b.dataset.value;
          const nw = getWork(draft.workId);
          root.querySelector('#exp-progress').innerHTML = progressFields(nw, draft.progress);
          bindProg();
        });
      });
    }
  }).then(async (v) => {
    if (v !== 'save') { draft = null; return; }
    const res = await saveExperience(draft);
    draft = null;
    if (!res.ok) { toast(res.error || '保存失败', 'error'); return; }
    toast('已记录');
    go('#/work/' + res.record.workId);
  });
}

export const actions = {
  'new-experience': (el) => startExperience(el.dataset.value, null),
  'edit-experience': (el) => startExperience(null, el.dataset.id),
  'del-experience': async (el) => {
    const rec = data.experiences.find((e) => e.id === el.dataset.id);
    const ok = await confirmDialog({ title: '删除这条体验记录？', desc: '作品的其它记录不受影响。', confirmText: '删除', danger: true });
    if (!ok) return;
    await deleteExperience(el.dataset.id);
    const modal = document.querySelector('.modal-backdrop.is-on');
    if (modal) modal.remove();
    draft = null;
    toast('已删除');
    go(rec ? '#/work/' + rec.workId : '#/works');
  }
};
