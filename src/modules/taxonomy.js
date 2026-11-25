/* ==========================================================
   次元簿 · 分类、标签与专题
   说明书 5.7：分类为树形，标签为扁平多值，专题是策展集合。
   删除标签只解除关联，不删除作品。
   ========================================================== */

import { data, saveCategory, removeCategory, categoryTree, saveTag, removeTag, topics, liveWorks, worksWithTag, saveWork, detailsOf } from '../core/repo.js';
import { ui, go } from '../core/state.js';
import { icon, toast, openModal, confirmDialog, emptyState, promptDialog } from '../core/ui.js';
import { esc, initials, coverColor } from '../core/format.js';
import { saveCoverPair, imageUrl } from '../core/repo.js';

export function taxonomyView() {
  const tab = ui.taxonomyTab || 'cats';
  let html = '<header class="page-head">' +
    '<div><p class="eyebrow">管理 · 分类 ' + data.categories.length + ' · 标签 ' + data.tags.length + ' · 专题 ' + data.topics.length + '</p>' +
    '<h1 class="page-title">分类与专题</h1></div></header>';

  html += '<div class="segbar" style="margin-bottom:14px">' +
    [['cats', '分类'], ['tags', '标签'], ['topics', '专题']].map((t) =>
      '<button class="' + (tab === t[0] ? 'is-on' : '') + '" data-action="tax-tab" data-value="' + t[0] + '">' + t[1] + '</button>').join('') +
    '</div>';

  if (tab === 'cats') return html + catsPanel();
  if (tab === 'tags') return html + tagsPanel();
  return html + topicsPanel();
}

function catsPanel() {
  const tree = categoryTree();
  const addBtn = '<button class="btn btn-ghost btn-sm" data-action="cat-add">＋ 新建分类</button>';

  if (!tree.length) {
    return emptyState('·', '还没有分类', '分类是树形的，比如「文学 → 科幻 → 中国科幻」。', addBtn);
  }

  const render = (nodes, depth) => nodes.map((n) => {
    const count = liveWorks().filter((w) => w.categoryId === n.id).length;
    return '<div class="cat-node" style="--d:' + depth + '">' +
      '<span class="cat-dot"></span>' +
      '<span class="cat-name">' + esc(n.name) + '<i>' + count + ' 部</i></span>' +
      '<button class="icon-btn sm" data-action="cat-add" data-value="' + n.id + '" aria-label="加子类">' + icon('plus', 15) + '</button>' +
      '<button class="icon-btn sm" data-action="cat-rename" data-id="' + n.id + '" aria-label="改名">' + icon('edit', 15) + '</button>' +
      '<button class="icon-btn sm" data-action="cat-del" data-id="' + n.id + '" aria-label="删除">' + icon('trash', 15) + '</button>' +
      '</div>' + render(n.children || [], depth + 1);
  }).join('');

  return '<div class="cat-tree">' + render(tree, 0) + '</div>' +
    '<div style="margin-top:16px">' + addBtn + '</div>';
}

function tagsPanel() {
  const tags = data.tags.slice().sort((a, b) => worksWithTag(b.id).length - worksWithTag(a.id).length);

  if (!tags.length) {
    return emptyState('·', '还没有标签', '标签是扁平的，一部作品可以有多个。',
      '<button class="btn btn-ghost btn-sm" data-action="tag-add">＋ 新建标签</button>');
  }

  return '<div class="tag-cloud">' + tags.map((t) => {
    const n = worksWithTag(t.id).length;
    return '<button class="tag-item" data-action="tag-open" data-id="' + t.id + '">' +
      '<b>#' + esc(t.name) + '</b><i>' + n + '</i></button>';
  }).join('') + '</div>' +
    '<div style="margin-top:16px"><button class="btn btn-ghost btn-sm" data-action="tag-add">＋ 新建标签</button></div>';
}

function topicsPanel() {
  if (!data.topics.length) {
    return emptyState('·', '还没有专题', '专题是你自己策的展，比如「2026 年读完的书」。',
      '<button class="btn btn-ghost btn-sm" data-action="topic-add">＋ 新建专题</button>');
  }
  return '<div class="topic-grid">' + data.topics.slice().sort((a, b) => (a.order || 0) - (b.order || 0)).map((t) => {
    const n = (t.workIds || []).length;
    const cover = t.cover ? imageUrl(t.cover) : '';
    return '<button class="topic-card" data-action="topic-open" data-id="' + t.id + '">' +
      '<span class="topic-cover" style="--cc:' + coverColor(t.title) + '">' +
      (cover ? '<img src="' + esc(cover) + '" alt="">' : '<b>' + esc(initials(t.title)) + '</b>') + '</span>' +
      '<span class="topic-main"><b>' + esc(t.title) + '</b>' +
      '<i>' + n + ' 部作品</i>' +
      (t.description ? '<span>' + esc(t.description) + '</span>' : '') + '</span></button>';
  }).join('') + '</div>' +
    '<div style="margin-top:16px"><button class="btn btn-ghost btn-sm" data-action="topic-add">＋ 新建专题</button></div>';
}

/* ---------------- 弹窗 ---------------- */

async function addCategory(parentId) {
  const name = await promptDialog({ title: '新建分类', label: '分类名称', placeholder: '科幻' });
  if (!name) return;
  const res = await saveCategory({ name, parentId: parentId || '', order: data.categories.length });
  if (!res.ok) { toast(res.error || '保存失败', 'error'); return; }
  toast('已创建');
  go('#/taxonomy');
}

async function renameCategory(id) {
  const cur = data.categories.find((c) => c.id === id);
  if (!cur) return;
  const name = await promptDialog({ title: '重命名', label: '分类名称', value: cur.name });
  if (!name) return;
  await saveCategory(Object.assign({}, cur, { name }));
  toast('已更新');
  go('#/taxonomy');
}

async function addTag() {
  const name = await promptDialog({ title: '新建标签', label: '标签名', placeholder: '科幻' });
  if (!name) return;
  const res = await saveTag({ name });
  if (!res.ok) { toast(res.error || '保存失败', 'error'); return; }
  toast('已创建');
  go('#/taxonomy');
}

function openTag(id) {
  const t = data.tags.find((x) => x.id === id);
  if (!t) return;
  const list = worksWithTag(id);
  openModal({
    title: '#' + t.name,
    desc: list.length + ' 部作品',
    body: (list.length ? '<div class="rows">' + list.map((w) =>
      '<button class="rowitem" data-action="open-work" data-id="' + w.id + '">' +
      '<span class="rowitem-main"><b>' + esc(w.title) + '</b><i>' + esc(w.creator || '') + '</i></span>' + icon('right', 15) + '</button>').join('') + '</div>'
      : '<p class="muted">还没有作品用这个标签。</p>') +
      '<label class="field" style="margin-top:14px"><span class="field-label">合并到其它标签</span><select class="select" id="tag-merge">' +
      '<option value="">不合并</option>' + data.tags.filter((x) => x.id !== id).map((x) =>
        '<option value="' + x.id + '">#' + esc(x.name) + '</option>').join('') + '</select></label>',
    actions: [
      { label: '删除标签', value: 'del', variant: 'danger' },
      { label: '关闭', value: null, variant: 'ghost' }
    ]
  }).then(async (v) => {
    const sel = document.getElementById('tag-merge');
    if (sel && sel.value) {
      await mergeTag(id, sel.value);
      toast('已合并');
      go('#/taxonomy');
      return;
    }
    if (v !== 'del') return;
    const ok = await confirmDialog({ title: '删除标签 #' + t.name + '？', desc: '只解除与作品的关联，作品本身不会被删除。', confirmText: '删除', danger: true });
    if (!ok) return;
    await removeTag(id);
    toast('已删除标签');
    go('#/taxonomy');
  });
}

async function mergeTag(fromId, toId) {
  const target = data.tags.find((x) => x.id === toId);
  if (!target) return;
  for (const w of liveWorks()) {
    if ((w.tagIds || []).indexOf(fromId) < 0) continue;
    const tagIds = w.tagIds.filter((x) => x !== fromId);
    if (tagIds.indexOf(toId) < 0) tagIds.push(toId);
    await saveWork(Object.assign({}, w, { tagIds }), detailsOf(w.id));
  }
  await removeTag(fromId);
}

function openTopic(id) {
  const cur = id ? data.topics.find((t) => t.id === id) : null;
  const d = cur ? Object.assign({}, cur, { workIds: (cur.workIds || []).slice() }) : { id: '', title: '', description: '', workIds: [], order: 0, cover: '' };

  const body = '<div>' +
    '<label class="field"><span class="field-label">专题名称</span><input class="input" id="tp-title" value="' + esc(d.title) + '" placeholder="2026 年读完的书"></label>' +
    '<label class="field"><span class="field-label">简介</span><textarea class="textarea" id="tp-desc" rows="2">' + esc(d.description) + '</textarea></label>' +
    '<div class="row2"><label class="field"><span class="field-label">排序（小的在前）</span><input class="input" type="number" id="tp-order" value="' + esc(d.order || 0) + '"></label>' +
    '<label class="field"><span class="field-label">封面</span>' +
    '<div class="cover-pick"><span class="cover-pick-prev" style="--cc:' + coverColor(d.title) + '">' +
    (d.cover ? '<img src="' + esc(imageUrl(d.cover)) + '" alt="">' : '<b>' + esc(initials(d.title)) + '</b>') + '</span>' +
    '<label class="btn btn-ghost btn-sm">选择图片<input type="file" accept="image/*" id="tp-cover" hidden></label></div></label></div>' +
    '<p class="field-label">收录作品（' + d.workIds.length + '）</p>' +
    '<div class="pick-list">' + liveWorks().sort((a, b) => String(a.title).localeCompare(String(b.title), 'zh-Hans-CN')).map((w) =>
      '<label class="pick-row"><input type="checkbox" data-work="' + w.id + '"' + (d.workIds.indexOf(w.id) >= 0 ? ' checked' : '') + '>' +
      '<span>' + esc(w.title) + '</span></label>').join('') + '</div>' +
    (cur ? '<button type="button" class="btn btn-danger btn-sm" data-action="topic-del" data-id="' + cur.id + '">删除专题</button>' : '') +
    '</div>';

  openModal({
    title: cur ? '编辑专题' : '新建专题',
    body,
    wide: true,
    actions: [{ label: '取消', value: null, variant: 'ghost' }, { label: '保存', value: 'save', variant: 'primary' }],
    onMount: (root) => {
      root.querySelector('#tp-title').addEventListener('input', (e) => { d.title = e.target.value; });
      root.querySelector('#tp-desc').addEventListener('input', (e) => { d.description = e.target.value; });
      root.querySelector('#tp-order').addEventListener('input', (e) => { d.order = Number(e.target.value) || 0; });
      const cov = root.querySelector('#tp-cover');
      if (cov) cov.addEventListener('change', async () => {
        const f = cov.files && cov.files[0];
        cov.value = '';
        if (!f) return;
        const pair = await saveCoverPair(f);
        if (pair.cover) {
          d.cover = pair.cover;
          toast('封面已更新');
          const prev = root.querySelector('.cover-pick-prev');
          if (prev) prev.innerHTML = '<img src="' + imageUrl(pair.cover) + '" alt="">';
        }
      });
      root.querySelectorAll('[data-work]').forEach((cb) => {
        cb.addEventListener('change', () => {
          const id2 = cb.dataset.work;
          if (cb.checked) { if (d.workIds.indexOf(id2) < 0) d.workIds.push(id2); }
          else d.workIds = d.workIds.filter((x) => x !== id2);
        });
      });
    }
  }).then(async (v) => {
    if (v !== 'save') return;
    if (!String(d.title || '').trim()) { toast('专题名称不能为空', 'error'); return; }
    const res = await topics.save(d);
    if (!res.ok) { toast(res.error || '保存失败', 'error'); return; }
    toast('已保存');
    go('#/taxonomy');
  });
}

export const actions = {
  'tax-tab': (el) => { ui.taxonomyTab = el.dataset.value; go('#/taxonomy'); },
  'cat-add': (el) => addCategory(el.dataset.value),
  'cat-rename': (el) => renameCategory(el.dataset.id),
  'cat-del': async (el) => {
    const ok = await confirmDialog({ title: '删除这个分类？', desc: '子分类会一起删除；作品不会被删除，只会解除分类。', confirmText: '删除', danger: true });
    if (!ok) return;
    await removeCategory(el.dataset.id);
    toast('已删除');
    go('#/taxonomy');
  },
  'tag-add': () => addTag(),
  'tag-open': (el) => openTag(el.dataset.id),
  'topic-add': () => openTopic(null),
  'topic-open': (el) => openTopic(el.dataset.id),
  'topic-del': async (el) => {
    const ok = await confirmDialog({ title: '删除这个专题？', desc: '作品本身不受影响。', confirmText: '删除', danger: true });
    if (!ok) return;
    await topics.hardRemove(el.dataset.id);
    const modal = document.querySelector('.modal-backdrop.is-on');
    if (modal) modal.remove();
    toast('已删除');
    go('#/taxonomy');
  }
};
