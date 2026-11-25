/* ==========================================================
   次元簿 · 下拉选项管理
   原生 <select> 不能在列表末尾插入按钮，所以给每个下拉框
   右侧配一个「＋」入口：可新增、改名、删除选项。
   自定义选项按字段键存在 settings.selectOptions 里，
   渲染后自动注入，跨页面/跨表单共用同一套选项。
   ========================================================== */

import { setting, saveSetting } from './repo.js';
import { openModal, toast } from './ui.js';
import { esc } from './format.js';

/* 结构性下拉：选项由程序控制，允许改名但不建议新增 */
const NO_ADD = {
  'bind:status': '状态由作品类型决定，可改名但不宜新增',
  'bind:rating': '评分档位固定，可改名但不宜新增',
  'change:works-sort': '排序方式由程序控制',
  'change:works-type': '作品类型请到收藏册右上角管理',
  'change:sf-type': '类型筛选跟随作品类型',
  'change:sf-year': '年份来自已有作品',
  'change:sf-tag': '标签来自已有标签',
  'change:ex-work': '作品列表由数据生成',
  'change:coll-type': '类型筛选跟随作品类型',
  'id:ct-base': '继承模板由程序提供',
  'id:cf-type': '归属类型由作品类型决定',
  'id:cf-kind': '输入方式由程序提供',
  'id:bk-style': '册子风格已固定'
};

/* 实体选择器：值是已有记录，不能凭空新增，直接不挂按钮 */
const SKIP = new Set([
  'id:c-work', 'id:exp-work', 'id:ex-work', 'id:it-work', 'id:ln-work', 'id:lw-work',
  'id:r-work', 'id:rv-work', 'id:nt-works', 'id:nt-creators', 'id:wc-person',
  'id:loc-parent', 'id:it-loc', 'id:tag-merge', 'id:ct-topic',
  'id:batch-cat', 'id:ex-cat', 'id:nt-cat'
]);

function keyOf(sel) {
  if (sel.dataset.optkey) return sel.dataset.optkey;
  if (sel.dataset.field) return 'field:' + sel.dataset.field;
  if (sel.dataset.bind) return 'bind:' + sel.dataset.bind;
  if (sel.dataset.change) return 'change:' + sel.dataset.change;
  if (sel.id) return 'id:' + sel.id;
  return '';
}

function labelOf(sel, key) {
  const field = sel.closest('.field');
  if (field) {
    const lab = field.querySelector('.field-label');
    if (lab) return lab.textContent.replace(/\*$/, '').trim();
  }
  const setRow = sel.closest('.set-row');
  if (setRow) {
    const lab = setRow.querySelector('.set-label');
    if (lab) return lab.textContent.trim();
  }
  const aria = sel.getAttribute('aria-label');
  if (aria) return aria;
  return key.replace(/^(field|bind|change|id):/, '');
}

function store() {
  return setting('selectOptions', {}) || {};
}

/* 把保存的选项注入一个 select（幂等） */
export function applySelectOptions(sel, key) {
  const k = key || keyOf(sel);
  if (!k) return;
  const cfg = (store()[k]) || {};

  /* 先移除上一次注入的自定义项，避免重复 */
  Array.from(sel.options).forEach((o) => { if (o.dataset.added === '1') o.remove(); });

  /* 内置项改名 */
  Array.from(sel.options).forEach((o) => {
    if (o.dataset.added === '1') return;
    const over = cfg.labels && cfg.labels[o.value];
    if (over) o.textContent = over;
  });

  /* 追加自定义项 */
  (cfg.extra || []).forEach((x) => {
    if (Array.from(sel.options).some((o) => o.value === x.value)) return;
    const o = document.createElement('option');
    o.value = x.value;
    o.textContent = x.label;
    o.dataset.added = '1';
    sel.appendChild(o);
  });
}

/* 给一个 select 套上「＋」按钮并注入选项 */
function decorateOne(sel) {
  if (!sel || sel.dataset.optReady === '1') return;
  const key = keyOf(sel);
  if (!key || SKIP.has(key)) return;
  sel.dataset.optReady = '1';
  applySelectOptions(sel, key);

  const wrap = document.createElement('span');
  wrap.className = 'sel-wrap';
  sel.parentNode.insertBefore(wrap, sel);
  wrap.appendChild(sel);

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'sel-opt-btn';
  btn.title = '增加 / 修改选项';
  btn.setAttribute('aria-label', '增加或修改选项');
  btn.textContent = '＋';
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openOptionsEditor(key, labelOf(sel, key));
  });
  wrap.appendChild(btn);
}

/* 扫描整页（含弹窗）里的所有下拉框 */
export function decorateSelects(root) {
  const scope = root || document;
  const list = [];
  if (scope.matches && scope.matches('select')) list.push(scope);
  scope.querySelectorAll && scope.querySelectorAll('select').forEach((s) => list.push(s));
  list.forEach(decorateOne);
}

/* 选项保存后，把已渲染的下拉框全部刷新一遍 */
export function refreshSelectOptions() {
  document.querySelectorAll('select[data-opt-ready="1"]').forEach((sel) => {
    const key = keyOf(sel);
    if (!key) return;
    const cur = sel.value;
    applySelectOptions(sel, key);
    /* 当前值若被删除，退回第一项 */
    if (cur && !Array.from(sel.options).some((o) => o.value === cur)) {
      sel.value = sel.options[0] ? sel.options[0].value : '';
    }
  });
}

/* ---------------- 编辑器 ---------------- */

export function openOptionsEditor(key, label) {
  const cfg = (store()[key]) || {};
  const rows = [];

  /* 现有选项（含已改名） */
  Array.from(document.querySelectorAll('select[data-opt-ready="1"]')).some((sel) => {
    if (keyOf(sel) !== key) return false;
    Array.from(sel.options).forEach((o) => {
      rows.push({
        value: o.value,
        label: o.textContent,
        custom: o.dataset.added === '1',
        selected: o.selected
      });
    });
    return true;
  });

  if (!rows.length) { toast('没有找到这个下拉框的选项'); return; }
  const noAdd = NO_ADD[key] || '';

  let html = '<p class="fan-hint" style="margin-bottom:10px">' +
    (noAdd ? esc(noAdd) + '。' : '新增的选项会出现在所有使用「' + esc(label) + '」的下拉框里。') +
    '改名只影响显示文字，不会改动已有记录。</p>' +
    '<div class="opt-list" id="opt-list"></div>' +
    (noAdd ? '' :
      '<div class="opt-add-row"><input class="input" id="opt-new" placeholder="新增选项名称" maxlength="24">' +
      '<button type="button" class="btn btn-soft btn-sm" id="opt-add">添加</button></div>');

  openModal({
    title: '管理选项 · ' + label,
    desc: '改完点保存生效',
    body: html,
    actions: [{ label: '取消', value: null, variant: 'ghost' }, { label: '保存', value: 'ok', variant: 'primary' }],
    onMount: (root) => {
      const listBox = root.querySelector('#opt-list');
      const paint = () => {
        listBox.innerHTML = rows.map((r, i) =>
          '<div class="opt-row" data-i="' + i + '">' +
          '<input class="input opt-label" data-i="' + i + '" value="' + esc(r.label) + '" maxlength="24">' +
          (r.custom
            ? '<button type="button" class="btn btn-ghost btn-xs opt-del" data-i="' + i + '">删除</button>'
            : '<span class="opt-built">内置</span>') +
          '</div>').join('');
        listBox.querySelectorAll('.opt-label').forEach((inp) => {
          inp.addEventListener('input', () => { rows[Number(inp.dataset.i)].label = inp.value; });
        });
        listBox.querySelectorAll('.opt-del').forEach((btn) => {
          btn.addEventListener('click', () => {
            rows.splice(Number(btn.dataset.i), 1);
            paint();
          });
        });
      };
      paint();

      const addBtn = root.querySelector('#opt-add');
      if (addBtn) addBtn.addEventListener('click', () => {
        const inp = root.querySelector('#opt-new');
        const text = String(inp.value || '').trim();
        if (!text) return;
        let value = 'opt_' + Date.now().toString(36) + Math.floor(Math.random() * 100);
        rows.push({ value, label: text, custom: true });
        inp.value = '';
        paint();
        listBox.scrollTop = listBox.scrollHeight;
      });
    }
  }).then(async (v) => {
    if (v !== 'ok') return;
    const old = store();
    const prev = old[key] || {};
    const labels = Object.assign({}, prev.labels || {});
    const orig = Object.assign({}, prev.orig || {});
    const extra = [];
    rows.forEach((r) => {
      if (r.custom) {
        extra.push({ value: r.value, label: r.label.trim() || r.value });
      } else if (!orig[r.value]) {
        /* 第一次改名时记下原始文字，便于恢复 */
        const base = (prev.labels && prev.labels[r.value]) || r.label;
        orig[r.value] = base;
      }
    });
    /* 内置项改名：与已经展示的文字不同才记录 */
    rows.forEach((r) => {
      if (r.custom) return;
      if (orig[r.value] && r.label.trim() && r.label.trim() !== orig[r.value]) labels[r.value] = r.label.trim();
      else if (orig[r.value] && r.label.trim() === orig[r.value]) delete labels[r.value];
    });
    const next = Object.assign({}, old, { [key]: { labels, orig, extra } });
    await saveSetting('selectOptions', next);
    refreshSelectOptions();
    toast('选项已更新');
  });
}
