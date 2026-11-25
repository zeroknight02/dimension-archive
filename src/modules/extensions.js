/* ==========================================================
   次元簿 · 开放性与插件化（12.1 - 12.5）
   12.1 自定义作品类型  12.2 自定义字段  12.3 自定义模块
   12.4 插件化架构      12.5 开放数据接口
   自定义类型/字段在启动时合并进 schema，所以表单、筛选、
   统计会自动认得它们，不需要改渲染代码。
   ========================================================== */

import {
  data, setting, saveSetting, liveWorks, uid, loadAll
} from '../core/repo.js';
import { TYPES, TYPE_MAP, FIELDS } from '../core/schema.js';
import { ui, go } from '../core/state.js';
import { icon, toast, openModal, confirmDialog, emptyState } from '../core/ui.js';
import { esc } from '../core/format.js';
import * as backup from '../core/backup.js';

const BASE_TEMPLATES = ['book', 'movie', 'tv', 'game', 'album', 'comic', 'stage', 'magazine'];

/* ---------------- 启动时合并 ---------------- */

export function initExtensions() {
  const types = setting('customTypes', []) || [];
  types.forEach((t) => {
    if (!TYPE_MAP[t.id]) {
      TYPES.push(t);
      TYPE_MAP[t.id] = t;
    }
  });
  const fields = setting('customFields', {}) || {};
  Object.keys(fields).forEach((typeId) => {
    const t = TYPE_MAP[typeId];
    if (!t) return;
    fields[typeId].forEach((f) => {
      FIELDS[f.key] = { k: f.key, l: f.label, g: 'mine', t: f.kind || 'text', o: f.options || [] };
      if (t.fields.indexOf(f.key) < 0) t.fields.push(f.key);
    });
  });
}

export function customTypeList() {
  return setting('customTypes', []) || [];
}

export function customFieldMap() {
  return setting('customFields', {}) || {};
}

export function disabledModules() {
  return setting('disabledModules', []) || [];
}

/* ---------------- 页面 ---------------- */

export function extensionsView() {
  const tab = (['types', 'fields', 'modules', 'api'].indexOf(ui.route.id) >= 0) ? ui.route.id : (ui.extTab || 'types');
  let html = '<header class="page-head">' +
    '<div class="head-left"><button class="icon-btn" data-action="go" data-to="#/more" aria-label="返回工具">' + icon('back', 20) + '</button>' +
    '<div><p class="eyebrow">扩展 · 自定义与接口</p><h1 class="page-title">扩展</h1></div></div></header>';

  html += '<div class="segbar" style="margin-bottom:16px">' +
    [['types', '自定义类型'], ['fields', '自定义字段'], ['modules', '模块开关'], ['api', '开放接口']]
      .map((t) => '<button class="' + (tab === t[0] ? 'is-on' : '') + '" data-action="ext-tab" data-value="' + t[0] + '">' + t[1] + '</button>').join('') +
    '</div>';

  if (tab === 'types') return html + typesPanel();
  if (tab === 'fields') return html + fieldsPanel();
  if (tab === 'modules') return html + modulesPanel();
  return html + apiPanel();
}

function typesPanel() {
  const list = customTypeList();
  let html = '<p class="fan-hint">自定义类型基于一个内置模板：继承它的进度方式、状态集与字段，再改名字和颜色。' +
    '新增入口在「收藏册」主界面右上角。</p>' +
    '<div class="section-head"><h2 class="section-title">我的类型</h2></div>';

  if (!list.length) {
    return html + emptyState('·', '还没有自定义类型', '去收藏册右上角点「＋」，比如建「广播剧·商剧」「同人志」「桌游扩展」。',
      '<button class="btn btn-ghost btn-sm" data-action="go" data-to="#/album">去收藏册</button>');
  }

  return html + '<div class="rows">' + list.map((t) => '<div class="rowitem is-static">' +
    '<span class="row-icon" style="background:' + t.color + '22;color:' + t.color + '">' + icon('spark', 16) + '</span>' +
    '<span class="rowitem-main"><b>' + esc(t.label) + '</b>' +
    '<i>' + esc('继承自 ' + ((TYPE_MAP[t.base] || {}).label || t.base) + ' · ' + (liveWorks().filter((w) => w.type === t.id).length) + ' 部') + '</i></span>' +
    '<button class="btn btn-ghost btn-xs" data-action="ext-type-del" data-id="' + t.id + '">删除</button></div>').join('') + '</div>';
}

function fieldsPanel() {
  const fields = customFieldMap();
  const types = TYPES.slice();

  let html = '<p class="fan-hint">字段会出现在对应类型的表单「我的信息」里，也会进入搜索与导出。</p>' +
    '<div class="section-head"><h2 class="section-title">我的字段</h2>' +
    '<button class="btn btn-ghost btn-sm" data-action="ext-field-new">＋ 新建字段</button></div>';

  const rows = [];
  Object.keys(fields).forEach((typeId) => {
    fields[typeId].forEach((f) => {
      const t = TYPE_MAP[typeId];
      rows.push({ typeId, f, typeLabel: t ? t.label : typeId });
    });
  });

  if (!rows.length) return html + emptyState('·', '还没有自定义字段', '比如给「游戏」加一个「联机好友」字段。');

  return html + '<div class="rows">' + rows.map((r) => '<div class="rowitem is-static">' +
    '<span class="row-icon">' + icon('tag', 15) + '</span>' +
    '<span class="rowitem-main"><b>' + esc(r.f.label) + '</b>' +
    '<i>' + esc(r.typeLabel + ' · ' + (r.f.kind || 'text') + ' · ' + r.f.key) + '</i></span>' +
    '<button class="btn btn-ghost btn-xs" data-action="ext-field-del" data-type="' + r.typeId + '" data-id="' + r.f.key + '">删除</button></div>').join('') + '</div>';
}

const MODULES = [
  ['works', '档案馆'], ['album', '收藏册'], ['collections', '待体验'],
  ['resources', '资源库'], ['knowledge', '知识库'], ['accounts', '账号库'], ['taxonomy', '分类专题'],
  ['stats', '数据统计'], ['plans', '目标提醒'], ['finance', '消费订阅'], ['loans', '借还'],
  ['calendar', '日历'], ['graph', '关系图谱'], ['analytics', '数据分析'], ['gallery', '展馆'],
  ['assistant', '智能工具'], ['discover', '发现'], ['updates', '本周追更']
];

function modulesPanel() {
  const off = disabledModules();
  return '<p class="fan-hint">关掉的模块从导航与首页快捷入口消失，数据不会删除，随时可以打开。</p>' +
    '<div class="rows">' + MODULES.map(([k, label]) =>
      '<div class="rowitem is-static"><span class="rowitem-main"><b>' + label + '</b></span>' +
      '<label class="switch"><input type="checkbox" data-action="ext-module-toggle" data-value="' + k + '"' + (off.indexOf(k) < 0 ? ' checked' : '') + '><i></i></label></div>').join('') +
    '</div>';
}

function apiPanel() {
  const snippet = 'const api = window.DimensionArchive;\n' +
    'const works = await api.query.works();\n' +
    'api.on("workSaved", (e) => console.log("saved", e.work.title));\n' +
    'api.registerField("game", { key: "coop", label: "联机好友", kind: "text" });';

  return '<p class="fan-hint">所有扩展都在本机运行。开放接口只暴露当前的 window 对象，不会上传数据。</p>' +
    '<div class="kv" style="margin-bottom:16px">' +
    '<div class="kv-row"><span>版本</span><b>v' + (window.DimensionArchive ? window.DimensionArchive.version : '—') + '</b></div>' +
    '<div class="kv-row"><span>已注册模块</span><b>' + (window.DimensionArchive ? Object.keys(window.DimensionArchive.modules).length : 0) + ' 个</b></div>' +
    '<div class="kv-row"><span>可查询表</span><b>works / excerpts / reviews / creators …</b></div>' +
    '</div>' +
    '<pre class="code-block">' + esc(snippet) + '</pre>' +
    '<div class="row-flex" style="margin-top:14px">' +
    '<button class="btn btn-primary btn-sm" data-action="ext-copy-api">复制示例代码</button>' +
    '<button class="btn btn-ghost btn-sm" data-action="ext-export-all">导出全量 JSON</button>' +
    '</div>' +
    '<p class="fan-hint" style="margin-top:14px">接口文档见 README 的「开放接口」一节。</p>';
}

/* ---------------- 表单 ---------------- */

export function openNewTypeModal(backTo) {
  const body = '<div>' +
    '<label class="field"><span class="field-label">类型名称</span><input class="input" id="ct-label" placeholder="同人志"></label>' +
    '<label class="field"><span class="field-label">继承模板</span><select class="select" id="ct-base">' +
    BASE_TEMPLATES.map((id) => '<option value="' + id + '">' + esc(TYPE_MAP[id].label) + '</option>').join('') + '</select></label>' +
    '<label class="field"><span class="field-label">颜色</span><input class="input" type="color" id="ct-color" value="#7658D6" style="height:44px;padding:4px"></label>' +
    '</div>';

  openModal({
    title: '新建自定义类型',
    desc: '创建后会作为一本新册子出现在收藏册书架上。',
    body,
    actions: [{ label: '取消', value: null, variant: 'ghost' }, { label: '创建', value: 'ok', variant: 'primary' }]
  }).then(async (v) => {
    if (v !== 'ok') return;
    const label = document.getElementById('ct-label').value.trim();
    const base = document.getElementById('ct-base').value;
    const color = document.getElementById('ct-color').value;
    if (!label) { toast('名称不能为空', 'error'); return; }
    const tpl = TYPE_MAP[base];
    const id = 'custom_' + uid('t').slice(-6);
    const def = Object.assign({}, tpl, {
      id, label, color, group: 'custom', icon: 'spark',
      fields: (tpl.fields || []).slice(), base
    });
    const list = customTypeList().concat([def]);
    await saveSetting('customTypes', list);
    initExtensions();
    toast('已创建「' + label + '」');
    go(backTo || '#/extensions/types');
  });
}

function newFieldModal() {
  const body = '<div>' +
    '<label class="field"><span class="field-label">归属类型</span><select class="select" id="cf-type">' +
    TYPES.map((t) => '<option value="' + t.id + '">' + esc(t.label) + '</option>').join('') + '</select></label>' +
    '<div class="row2"><label class="field"><span class="field-label">字段名称</span><input class="input" id="cf-label" placeholder="联机好友"></label>' +
    '<label class="field"><span class="field-label">字段键（英文）</span><input class="input" id="cf-key" placeholder="coop"></label></div>' +
    '<label class="field"><span class="field-label">输入方式</span><select class="select" id="cf-kind">' +
    [['text', '单行文本'], ['num', '数字'], ['date', '日期'], ['long', '多行文本'], ['select', '下拉选项']].map((x) =>
      '<option value="' + x[0] + '">' + x[1] + '</option>').join('') + '</select></label>' +
    '<label class="field"><span class="field-label">下拉选项（逗号分隔，仅下拉需要）</span><input class="input" id="cf-options" placeholder="有, 没有"></label>' +
    '</div>';

  openModal({
    title: '新建自定义字段',
    body,
    wide: true,
    actions: [{ label: '取消', value: null, variant: 'ghost' }, { label: '创建', value: 'ok', variant: 'primary' }]
  }).then(async (v) => {
    if (v !== 'ok') return;
    const typeId = document.getElementById('cf-type').value;
    const label = document.getElementById('cf-label').value.trim();
    let key = document.getElementById('cf-key').value.trim();
    const kind = document.getElementById('cf-kind').value;
    const options = document.getElementById('cf-options').value.split(/[,，]/).map((x) => x.trim()).filter(Boolean);
    if (!label) { toast('字段名称不能为空', 'error'); return; }
    if (!key) key = 'c_' + uid('f').slice(-6);
    key = key.replace(/[^A-Za-z0-9_]/g, '');
    const map = Object.assign({}, customFieldMap());
    map[typeId] = (map[typeId] || []).concat([{ key, label, kind, options }]);
    await saveSetting('customFields', map);
    initExtensions();
    toast('已创建，刷新后出现在表单里');
    go('#/extensions/fields');
  });
}

/* ---------------- 12.4 插件注册表 / 12.5 数据接口 ---------------- */

export function installPublicAPI(ctx) {
  const api = {
    version: '3.0.0',
    modules: {},
    registerModule(name, mod) {
      api.modules[name] = mod;
      return true;
    },
    registerType(def) {
      if (!def || !def.id || !def.label) return false;
      TYPES.push(def);
      TYPE_MAP[def.id] = def;
      return true;
    },
    registerField(typeId, def) {
      const t = TYPE_MAP[typeId];
      if (!t || !def || !def.key) return false;
      FIELDS[def.key] = { k: def.key, l: def.label || def.key, g: 'mine', t: def.kind || 'text', o: def.options || [] };
      if (t.fields.indexOf(def.key) < 0) t.fields.push(def.key);
      return true;
    },
    on(event, fn) {
      const repo = ctx.repo;
      if (event === 'workSaved') return repo.onWorkSaved(fn);
      if (event === 'experienceSaved') return repo.onExperienceSaved(fn);
      return () => {};
    },
    query: {
      works: () => liveWorks(),
      work: (id) => ctx.repo.getWork(id),
      details: (id) => ctx.repo.detailsOf(id),
      excerpts: () => data.excerpts.filter((e) => !e.deletedAt),
      reviews: () => data.reviews.filter((r) => !r.deletedAt),
      creators: () => data.creators.filter((c) => !c.deletedAt),
      tags: () => data.tags.slice()
    },
    exportJSON: () => backup.exportJSON({}),
    exportZIP: () => backup.exportZIP({}),
    reload: () => loadAll()
  };
  window.DimensionArchive = api;
  return api;
}

export const actions = {
  'ext-tab': (el) => { ui.extTab = el.dataset.value; go('#/extensions/' + el.dataset.value); },
  'ext-type-del': async (el) => {
    const id = el.dataset.id;
    const used = liveWorks().filter((w) => w.type === id).length;
    const ok = await confirmDialog({
      title: '删除这个自定义类型？',
      desc: used ? '有 ' + used + ' 部作品正在使用它。删除后这些作品会显示为未知类型，但数据仍在。' : '删除后不能恢复类型定义，已有数据不受影响。',
      confirmText: '删除',
      danger: true
    });
    if (!ok) return;
    const list = customTypeList().filter((t) => t.id !== id);
    await saveSetting('customTypes', list);
    toast('已删除，刷新后生效');
    go('#/extensions/types');
  },
  'ext-field-new': () => newFieldModal(),
  'ext-field-del': async (el) => {
    const typeId = el.dataset.type;
    const key = el.dataset.id;
    const ok = await confirmDialog({ title: '删除这个字段？', desc: '字段从表单里消失，已填写的内容仍保存在数据里。', confirmText: '删除', danger: true });
    if (!ok) return;
    const map = Object.assign({}, customFieldMap());
    map[typeId] = (map[typeId] || []).filter((f) => f.key !== key);
    await saveSetting('customFields', map);
    toast('已删除，刷新后生效');
    go('#/extensions/fields');
  },
  'ext-module-toggle': async (el) => {
    const key = el.dataset.value;
    let off = disabledModules().slice();
    if (el.checked) off = off.filter((x) => x !== key);
    else if (off.indexOf(key) < 0) off.push(key);
    await saveSetting('disabledModules', off);
    toast(el.checked ? '已显示' : '已隐藏');
    go('#/extensions/modules');
  },
  'ext-copy-api': async () => {
    const code = 'const api = window.DimensionArchive;\nconst works = await api.query.works();\napi.on("workSaved", (e) => console.log(e.work.title));';
    try {
      await navigator.clipboard.writeText(code);
      toast('已复制');
    } catch (e) {
      toast('复制失败，可手动选中', 'error');
    }
  },
  'ext-export-all': async () => {
    const out = await backup.exportJSON({});
    backup.downloadBlob(out.blob, out.fileName);
    toast('已导出');
  }
};
