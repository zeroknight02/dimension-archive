/* ==========================================================
   次元簿 · 数字资源库
   说明书 6.7：回答「我已经拥有或保存了什么」，
   与待体验清单严格分离。大型文件只存元数据与位置说明。
   ========================================================== */

import { data, resources, liveWorks, getWork, experiencesOf, bucketOf } from '../core/repo.js';
import { RESOURCE_FORMATS, RESOURCE_STATUS, RESOURCE_FORMS, typeDef } from '../core/schema.js';
import { ui, go } from '../core/state.js';
import { icon, toast, openModal, confirmDialog, emptyState } from '../core/ui.js';
import { esc, fmtSize } from '../core/format.js';

/* 6.7.2 规定的八个自动视图 */
const AUTO_VIEWS = [
  ['all', '全部'],
  ['unviewedVideo', '已下载未看'],
  ['unread', '已下载未读'],
  ['unlisten', '已下载未听'],
  ['bought', '已购买未体验'],
  ['wanted', '已收藏未获取'],
  ['unsorted', '已获取待整理'],
  ['keptAfterDone', '已体验仍保留'],
  ['missing', '丢失待检查']
];

function isDone(workId) {
  const w = workId ? getWork(workId) : null;
  if (!w) return false;
  if (bucketOf(w) === 'done') return true;
  return experiencesOf(w.id).some((e) => bucketOf({ status: e.status }) === 'done');
}

function groupOf(workId) {
  const w = workId ? getWork(workId) : null;
  return w ? typeDef(w.type).group : '';
}

function matchView(r, view) {
  const g = groupOf(r.workId);
  const done = isDone(r.workId);
  switch (view) {
    case 'all': return true;
    case 'unviewedVideo': return ['已下载', '已保存'].indexOf(r.status) >= 0 && g === 'film' && !done;
    case 'unread': return ['已下载', '已保存'].indexOf(r.status) >= 0 && g === 'text' && !done;
    case 'unlisten': return ['已下载', '已保存'].indexOf(r.status) >= 0 && g === 'audio' && !done;
    case 'bought': return r.status === '已购买' && !done;
    case 'wanted': return ['在线收藏', '计划获取'].indexOf(r.status) >= 0;
    case 'unsorted': return ['已下载', '已保存'].indexOf(r.status) >= 0 && !r.workId;
    case 'keptAfterDone': return done && r.exists !== '否' && ['已下载', '已保存', '已购买'].indexOf(r.status) >= 0;
    case 'missing': return ['已丢失', '待检查'].indexOf(r.status) >= 0;
    default: return true;
  }
}

export function resourcesView() {
  const view = ui.resourceView || 'all';
  const all = resources.list();
  const list = all.filter((r) => matchView(r, view));

  let html = '<header class="page-head">' +
    '<div><p class="eyebrow">数字资源 · ' + all.length + ' 条</p><h1 class="page-title">资源库</h1></div>' +
    '<div class="head-actions"><button class="icon-btn" data-action="new-resource" aria-label="登记资源">' + icon('plus', 20) + '</button></div>' +
    '</header>';

  html += '<p class="notice" style="margin-bottom:12px"><span>' + icon('info', 15) + '</span><span>' +
    '这里只记录「文件在哪」。仅记录位置不等于备份了文件；只有通过总结插图 / 实体照片等方式主动导入的附件才会存进数据库。' +
    '大型视频与安装包建议只记元数据与位置。</span></p>';

  html += '<div class="chips" style="margin-bottom:14px">' +
    AUTO_VIEWS.map((v) => '<button class="chip' + (view === v[0] ? ' is-on' : '') + '" data-action="res-view" data-value="' + v[0] + '">' + v[1] + '</button>').join('') +
    '</div>';

  if (!all.length) {
    return html + emptyState('·', '还没有登记资源', '记下你下载、购买或收藏的文件位置。看没看过在作品档案里，这里是「有没有」。',
      '<button class="btn btn-primary btn-sm" data-action="new-resource">＋ 登记一条</button>');
  }
  if (!list.length) return html + emptyState('·', '这个视图没有资源', '同一份资源可以出现在多个视图里，换个视图看看。');

  return html + '<div class="rows">' + list.map((r) => {
    const w = r.workId ? getWork(r.workId) : null;
    return '<button class="rowitem" data-action="edit-resource" data-id="' + r.id + '">' +
      '<span class="res-badge">' + esc(r.format || '文件') + '</span>' +
      '<span class="rowitem-main"><b>' + esc(r.name || (w && w.title) || '未命名资源') + '</b>' +
      '<i>' + esc([w ? w.title : '未关联作品', r.status, r.size ? fmtSize(r.size) : '', r.path || r.fileName || ''].filter(Boolean).join(' · ')) + '</i></span>' +
      '<span class="rowitem-side">' + (r.exists === '否' ? '<span class="badge is-warn">不存在</span>' : icon('right', 16)) + '</span></button>';
  }).join('') + '</div>';
}

function workOptions(currentId) {
  return '<option value="">不关联作品</option>' + liveWorks()
    .sort((a, b) => String(a.title).localeCompare(String(b.title), 'zh-Hans-CN'))
    .map((w) => '<option value="' + w.id + '"' + (w.id === currentId ? ' selected' : '') + '>' + esc(w.title) + '</option>').join('');
}

export function openResourceEditor(id, presetWorkId) {
  const cur = id ? resources.get(id) : null;
  const d = cur ? Object.assign({}, cur) : {
    id: '', workId: presetWorkId || '', name: '', format: 'PDF', size: '', status: '已下载',
    form: '本地文件', source: '', acquiredAt: '', device: '', path: '', fileName: '', exists: '是', note: ''
  };

  const body = '<div>' +
    '<label class="field"><span class="field-label">资源名称</span><input class="input" id="r-name" value="' + esc(d.name) + '" placeholder="如：三体全集.epub"></label>' +
    '<label class="field"><span class="field-label">关联作品</span><select class="select" id="r-work">' + workOptions(d.workId) + '</select></label>' +
    '<div class="row2"><label class="field"><span class="field-label">格式</span><select class="select" id="r-format">' +
    RESOURCE_FORMATS.map((f) => '<option' + (d.format === f ? ' selected' : '') + '>' + f + '</option>').join('') + '</select></label>' +
    '<label class="field"><span class="field-label">大小（MB）</span><input class="input" type="number" step="0.1" id="r-size" value="' + esc(d.size ? Math.round(d.size / 1048576 * 10) / 10 : '') + '"></label></div>' +
    '<div class="row2"><label class="field"><span class="field-label">状态</span><select class="select" id="r-status">' +
    RESOURCE_STATUS.map((s) => '<option' + (d.status === s ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></label>' +
    '<label class="field"><span class="field-label">形式</span><select class="select" id="r-form">' +
    RESOURCE_FORMS.map((s) => '<option' + (d.form === s ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></label></div>' +
    '<div class="row2"><label class="field"><span class="field-label">获取日期</span><input class="input" type="date" id="r-acq" value="' + esc(d.acquiredAt) + '"></label>' +
    '<label class="field"><span class="field-label">文件仍存在</span><select class="select" id="r-exists">' +
    ['是', '否', '未检查'].map((s) => '<option' + (d.exists === s ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></label></div>' +
    '<label class="field"><span class="field-label">存储设备 / 位置说明</span><input class="input" id="r-path" value="' + esc(d.path) + '" placeholder="移动硬盘 A / 书房抽屉"></label>' +
    '<label class="field"><span class="field-label">文件名</span><input class="input" id="r-file" value="' + esc(d.fileName) + '"></label>' +
    '<label class="field"><span class="field-label">来源</span><input class="input" id="r-source" value="' + esc(d.source) + '" placeholder="购买 / 下载 / 朋友给的"></label>' +
    '<label class="field"><span class="field-label">备注</span><textarea class="textarea" id="r-note" rows="2">' + esc(d.note) + '</textarea></label>' +
    '<p class="notice"><span>' + icon('info', 15) + '</span><span>记录位置不等于备份了文件。浏览器无法遍历你的磁盘，这份记录只是索引。</span></p>' +
    (cur ? '<button type="button" class="btn btn-danger btn-sm" data-action="del-resource" data-id="' + cur.id + '">删除这条资源</button>' : '') +
    '</div>';

  openModal({
    title: cur ? '编辑资源' : '登记资源',
    body,
    wide: true,
    actions: [{ label: '取消', value: null, variant: 'ghost' }, { label: '保存', value: 'save', variant: 'primary' }],
    onMount: (root) => {
      const bind = (sel, key) => {
        const el = root.querySelector(sel);
        el.addEventListener('input', () => { d[key] = el.value; });
        el.addEventListener('change', () => { d[key] = el.value; });
      };
      bind('#r-name', 'name');
      bind('#r-work', 'workId');
      bind('#r-format', 'format');
      bind('#r-status', 'status');
      bind('#r-form', 'form');
      bind('#r-acq', 'acquiredAt');
      bind('#r-exists', 'exists');
      bind('#r-path', 'path');
      bind('#r-file', 'fileName');
      bind('#r-source', 'source');
      bind('#r-note', 'note');
      const sizeEl = root.querySelector('#r-size');
      sizeEl.addEventListener('input', () => { d.size = Math.round((Number(sizeEl.value) || 0) * 1048576); });
    }
  }).then(async (v) => {
    if (v !== 'save') return;
    const res = await resources.save(d);
    if (!res.ok) { toast(res.error || '保存失败', 'error'); return; }
    toast('已保存');
    go('#/resources');
  });
}

export const actions = {
  'res-view': (el) => { ui.resourceView = el.dataset.value; go('#/resources'); },
  'new-resource': (el) => openResourceEditor(null, el && el.dataset.value ? el.dataset.value : ''),
  'edit-resource': (el) => openResourceEditor(el.dataset.id),
  'del-resource': async (el) => {
    const ok = await confirmDialog({ title: '删除这条资源记录？', desc: '只删索引，不动你磁盘上的文件。', confirmText: '删除', danger: true });
    if (!ok) return;
    await resources.remove(el.dataset.id);
    const modal = document.querySelector('.modal-backdrop.is-on');
    if (modal) modal.remove();
    toast('已删除');
    go('#/resources');
  }
};
