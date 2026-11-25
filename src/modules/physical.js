/* ==========================================================
   次元簿 · 实体收藏管理中心（6.8）
   回答「这本实体书 / 这套碟放在哪」。存放位置是可复用的文本，
   同一位置自动聚合成一层，便于按空间盘点。
   ========================================================== */

import { data, physical, liveWorks, getWork, coverUrl, locations, locationTree, locationPath, saveReviewImage, imageUrl } from '../core/repo.js';
import { ITEM_CONDITIONS, ITEM_TYPES, ITEM_STATUSES } from '../core/schema.js';
import { ui, go } from '../core/state.js';
import { icon, toast, openModal, confirmDialog, emptyState } from '../core/ui.js';
import { esc, money, initials, coverColor } from '../core/format.js';

function groups() {
  const map = {};
  physical.list().forEach((it) => {
    const k = it.locationId ? (locationPath(it.locationId) || '未标位置') : ((it.location || '未标位置').trim() || '未标位置');
    (map[k] = map[k] || []).push(it);
  });
  return Object.keys(map).sort((a, b) => map[b].length - map[a].length)
    .map((k) => ({ key: k, list: map[k] }));
}

export function physicalView() {
  const all = physical.list();
  const total = all.reduce((a, it) => a + (Number(it.buyPrice) || 0), 0);
  const value = all.reduce((a, it) => a + (Number(it.valuation) || 0), 0);
  const signed = all.filter((it) => (it.condition || '').indexOf('签名') >= 0).length;

  let html = '<header class="page-head">' +
    '<div class="head-left"><button class="icon-btn" data-action="back" aria-label="返回">' + icon('back', 20) + '</button>' +
    '<div><p class="eyebrow">实体收藏 · ' + all.length + ' 件</p><h1 class="page-title">实体收藏</h1></div></div>' +
    '<div class="head-actions"><button class="icon-btn" data-action="item-new" aria-label="新增">' + icon('plus', 20) + '</button></div>' +
    '</header>';

  if (!all.length) {
    return html + emptyState('·', '还没有实体收藏', '纸质书、蓝光碟、唱片、手办，登记位置就不会再找不到。',
      '<button class="btn btn-primary btn-sm" data-action="item-new">＋ 登记一件</button>');
  }

  html += '<div class="row-flex" style="margin-bottom:12px">' +
    '<button class="btn btn-ghost btn-sm" data-action="loc-manage">管理存放位置</button></div>' +
    '<div class="stat-grid" style="margin-bottom:16px">' +
    '<div class="stat"><b>' + all.length + '</b><span>总件数</span></div>' +
    '<div class="stat"><b>' + groups().length + '</b><span>存放位置</span></div>' +
    '<div class="stat"><b>' + signed + '</b><span>签名 / 限量</span></div>' +
    '<div class="stat"><b>' + (total ? money(total) : '—') + '</b><span>购入合计</span></div>' +
    '</div>' +
    (value ? '<p class="fan-hint" style="margin-bottom:12px">当前估值合计 ' + money(value) +
      '。估值由你手动填写，不代表实际成交价格。</p>' : '');

  return html + groups().map((g) => '<section class="section">' +
    '<div class="section-head"><h2 class="section-title">' + esc(g.key) + '</h2>' +
    '<span class="section-note">' + g.list.length + ' 件</span></div>' +
    '<div class="rows">' + g.list.map((it) => {
      const w = it.workId ? getWork(it.workId) : null;
      const cover = w ? coverUrl(w) : '';
      const photo = it.photo ? imageUrl(it.photo) : '';
      return '<button class="rowitem" data-action="item-edit" data-id="' + it.id + '">' +
        '<span class="cover" style="--cc:' + coverColor(w ? w.title : it.title || '?') + ';width:36px;flex:0 0 36px">' +
        (photo ? '<img src="' + esc(photo) + '" alt="">' :
          cover ? '<img src="' + esc(cover) + '" alt="">' : '<b>' + esc(initials(w ? w.title : it.title || '?')) + '</b>') + '</span>' +
        '<span class="rowitem-main"><b>' + esc(it.title || (w && w.title) || '未命名') + '</b>' +
        '<i>' + esc([it.collectType, it.edition, it.condition, it.quantity > 1 ? '×' + it.quantity : '',
          it.valuation ? '估值 ' + money(it.valuation) : it.buyPrice ? money(it.buyPrice) : ''].filter(Boolean).join(' · ')) + '</i></span>' +
        '<span class="rowitem-side">' +
        (it.status && it.status !== '在藏' ? '<span class="badge ' + (it.status === '借出' ? 'is-warn' : 'is-error') + '">' + esc(it.status) + '</span>' : '') +
        icon('right', 15) + '</span></button>';
    }).join('') + '</div></section>').join('');
}

function flattenLocations() {
  const out = [];
  const walk = (nodes, prefix) => nodes.forEach((n) => {
    const label = prefix ? prefix + ' → ' + n.name : n.name;
    out.push({ id: n.id, label });
    walk(n.children || [], label);
  });
  walk(locationTree(), '');
  return out;
}

function locManageModal() {
  const rows = flattenLocations();
  const body = '<div>' +
    (rows.length ? '<div class="rows">' + rows.map((x) =>
      '<div class="rowitem is-static"><span class="rowitem-main"><b>' + esc(x.label) + '</b></span>' +
      '<button class="btn btn-ghost btn-xs" data-action="loc-del" data-id="' + x.id + '">删除</button></div>').join('') + '</div>'
      : '<p class="muted" style="font-size:12.5px">还没有位置。建议按「房间 → 柜子 → 层」建。</p>') +
    '<label class="field" style="margin-top:14px"><span class="field-label">上级位置</span><select class="select" id="loc-parent">' +
    '<option value="">作为顶层</option>' + rows.map((x) => '<option value="' + x.id + '">' + esc(x.label) + '</option>').join('') + '</select></label>' +
    '<label class="field"><span class="field-label">新位置名称</span><input class="input" id="loc-name" placeholder="书房 / 一号书柜 / 第二层"></label>' +
    '</div>';

  openModal({
    title: '存放位置',
    desc: '位置是树形结构，移动藏品只改引用，不动历史记录。',
    wide: true,
    body,
    actions: [
      { label: '关闭', value: null, variant: 'ghost' },
      { label: '添加', value: 'add', variant: 'primary' }
    ]
  }).then(async (v) => {
    if (v !== 'add') return;
    const name = document.getElementById('loc-name');
    const parent = document.getElementById('loc-parent');
    if (!name || !name.value.trim()) { toast('名称不能为空'); return; }
    const res = await locations.save({ id: '', name: name.value.trim(), parentId: parent ? parent.value : '', order: 0 });
    toast(res.ok ? '已添加' : '添加失败');
    go('#/physical');
  });
}

function workOptions(sel) {
  return '<option value="">不关联作品</option>' + liveWorks().sort((a, b) => String(a.title).localeCompare(String(b.title), 'zh-Hans-CN'))
    .map((w) => '<option value="' + w.id + '"' + (w.id === sel ? ' selected' : '') + '>' + esc(w.title) + '</option>').join('');
}

export function openItemEditor(id) {
  const cur = id ? physical.get(id) : null;
  const d = cur ? Object.assign({}, cur) : {
    id: '', workId: '', title: '', locationId: '', edition: '', quantity: 1, condition: '良好',
    buyPrice: '', buyDate: '', note: '', collectType: '纸质书', channel: '', status: '在藏',
    appearance: '', storageNote: '', source: '', valuation: '', photo: ''
  };

  const body = '<div>' +
    '<label class="field"><span class="field-label">关联作品</span><select class="select" id="it-work">' + workOptions(d.workId) + '</select></label>' +
    '<label class="field"><span class="field-label">名称（不关联作品时手填）</span><input class="input" id="it-title" value="' + esc(d.title) + '"></label>' +
    '<label class="field"><span class="field-label">存放位置</span><select class="select" id="it-loc">' +
    '<option value="">未指定</option>' +
    flattenLocations().map((x) => '<option value="' + x.id + '"' + (d.locationId === x.id ? ' selected' : '') + '>' + esc(x.label) + '</option>').join('') +
    '</select></label>' +
    '<div class="row2"><label class="field"><span class="field-label">收藏类型</span><select class="select" id="it-type">' +
    ITEM_TYPES.map((t) => '<option' + (d.collectType === t ? ' selected' : '') + '>' + esc(t) + '</option>').join('') + '</select></label>' +
    '<label class="field"><span class="field-label">版本</span><input class="input" id="it-edition" value="' + esc(d.edition) + '" placeholder="首版 / 台版 / 蓝光"></label></div>' +
    '<div class="row2"><label class="field"><span class="field-label">当前状态</span><select class="select" id="it-status">' +
    ITEM_STATUSES.map((t) => '<option' + (d.status === t ? ' selected' : '') + '>' + esc(t) + '</option>').join('') + '</select></label>' +
    '<label class="field"><span class="field-label">购买渠道</span><input class="input" id="it-channel" value="' + esc(d.channel) + '" placeholder="书店 / 展会 / 二手"></label></div>' +
    '<div class="row2"><label class="field"><span class="field-label">数量</span><input class="input" type="number" id="it-qty" value="' + esc(d.quantity) + '"></label>' +
    '<label class="field"><span class="field-label">品相</span><select class="select" id="it-cond">' +
    ITEM_CONDITIONS.map((c) => '<option' + (d.condition === c ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select></label></div>' +
    '<div class="row2"><label class="field"><span class="field-label">购入价</span><input class="input" type="number" id="it-price" value="' + esc(d.buyPrice) + '"></label>' +
    '<label class="field"><span class="field-label">购入日期</span><input class="input" type="date" id="it-date" value="' + esc(d.buyDate) + '"></label></div>' +
    '<div class="row2"><label class="field"><span class="field-label">当前估值（自己填）</span><input class="input" type="number" id="it-value" value="' + esc(d.valuation) + '"></label>' +
    '<label class="field"><span class="field-label">收藏来源</span><input class="input" id="it-source" value="' + esc(d.source) + '" placeholder="自购 / 赠予 / 淘换"></label></div>' +
    '<label class="field"><span class="field-label">外观情况</span><input class="input" id="it-appear" value="' + esc(d.appearance) + '" placeholder="书脊轻微磨损 / 未拆封"></label>' +
    '<label class="field"><span class="field-label">保管情况</span><input class="input" id="it-keep" value="' + esc(d.storageNote) + '" placeholder="防潮箱 / 避免日晒"></label>' +
    '<label class="field"><span class="field-label">实物照片</span>' +
    '<div class="cover-pick"><span class="cover-pick-prev">' +
    (d.photo ? '<img src="' + esc(imageUrl(d.photo)) + '" alt="">' : '<b>' + esc(initials(d.title || '物')) + '</b>') + '</span>' +
    '<label class="btn btn-ghost btn-sm">选择图片<input type="file" accept="image/*" id="it-photo" hidden></label>' +
    (d.photo ? '<button type="button" class="btn btn-ghost btn-sm" data-action="item-photo-clear" data-id="' + (cur ? cur.id : '') + '">移除</button>' : '') +
    '</div></label>' +
    '<label class="field"><span class="field-label">备注</span><textarea class="textarea" id="it-note" rows="2">' + esc(d.note) + '</textarea></label>' +
    '<p class="muted" style="font-size:11px;margin-bottom:8px">估值仅作个人记录，不代表实际成交价格。</p>' +
    (cur ? '<button type="button" class="btn btn-danger btn-sm" data-action="item-del" data-id="' + cur.id + '">删除这条</button>' : '') +
    '</div>';

  openModal({
    title: cur ? '编辑实体收藏' : '登记实体收藏',
    body,
    wide: true,
    actions: [{ label: '取消', value: null, variant: 'ghost' }, { label: '保存', value: 'save', variant: 'primary' }],
    onMount: (root) => {
      const bind = (sel, key, num) => {
        const el = root.querySelector(sel);
        if (!el) return;
        el.addEventListener('input', () => { d[key] = num ? (Number(el.value) || 0) : el.value; });
        el.addEventListener('change', () => { d[key] = num ? (Number(el.value) || 0) : el.value; });
      };
      bind('#it-work', 'workId');
      bind('#it-title', 'title');
      bind('#it-loc', 'locationId');
      bind('#it-edition', 'edition');
      bind('#it-qty', 'quantity', true);
      bind('#it-cond', 'condition');
      bind('#it-price', 'buyPrice', true);
      bind('#it-date', 'buyDate');
      bind('#it-note', 'note');
      bind('#it-type', 'collectType');
      bind('#it-status', 'status');
      bind('#it-channel', 'channel');
      bind('#it-value', 'valuation', true);
      bind('#it-source', 'source');
      bind('#it-appear', 'appearance');
      bind('#it-keep', 'storageNote');
      const photo = root.querySelector('#it-photo');
      if (photo) photo.addEventListener('change', async () => {
        const f = (photo.files || [])[0];
        photo.value = '';
        if (!f) return;
        try {
          const img = await saveReviewImage(f);
          if (img) {
            d.photo = img.id;
            const prev = root.querySelector('.cover-pick-prev');
            if (prev) prev.innerHTML = '<img src="' + imageUrl(img.id) + '" alt="">';
          }
        } catch (e) { toast(e.message || '图片处理失败', 'error'); }
      });
    }
  }).then(async (v) => {
    if (v !== 'save') return;
    if (!d.workId && !String(d.title || '').trim()) { toast('至少填名称或关联作品'); return; }
    const res = await physical.save(d);
    if (!res.ok) { toast(res.error || '保存失败', 'error'); return; }
    toast('已保存');
    go('#/physical');
  });
}

export const actions = {
  'item-photo-clear': async (el) => {
    const it = el.dataset.id ? physical.get(el.dataset.id) : null;
    if (!it) return;
    await physical.save(Object.assign({}, it, { photo: '' }));
    toast('已移除照片');
    go('#/physical');
  },
  'loc-manage': () => locManageModal(),
  'loc-del': async (el) => {
    const ok = await confirmDialog({ title: '删除这个位置？', desc: '子位置会一起删除，藏品改为「未指定」。', confirmText: '删除', danger: true });
    if (!ok) return;
    await locations.hardRemove(el.dataset.id);
    toast('已删除');
    go('#/physical');
  },
  'item-new': () => openItemEditor(null),
  'item-edit': (el) => openItemEditor(el.dataset.id),
  'item-del': async (el) => {
    const ok = await confirmDialog({ title: '删除这条实体收藏记录？', confirmText: '删除', danger: true });
    if (!ok) return;
    await physical.remove(el.dataset.id);
    const m = document.querySelector('.modal-backdrop.is-on');
    if (m) m.remove();
    toast('已删除');
    go('#/physical');
  }
};
