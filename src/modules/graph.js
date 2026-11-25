/* ==========================================================
   次元簿 · 文化网络：图谱 / 系列 / 双向关联（8.2 / 8.3 / 8.6）
   图谱是把已有的作品—标签—人物关系画出来，不生成新数据；
   系列档案负责「同一世界观 / 同一系列」的归拢；
   双向关联是任意两个对象之间的显式连线，详情页可见回链。
   ========================================================== */

import { data, liveWorks, getWork, series, links, addLink, creators, creatorOf, workCreatorsOf, topics, coverUrl, entityKey, bucketOf, detailsOf } from '../core/repo.js';
import { TYPES, RELATION_TYPES, typeDef } from '../core/schema.js';
import { ui, go } from '../core/state.js';
import { icon, toast, openModal, confirmDialog, emptyState } from '../core/ui.js';
import { esc, initials, coverColor } from '../core/format.js';

/* ---------------- 8.3 图谱 ---------------- */

export function graphView() {
  const tab = (['map', 'series', 'links'].indexOf(ui.route.id) >= 0) ? ui.route.id : (ui.graphTab || 'map');
  let html = '<header class="page-head">' +
    '<div class="head-left"><button class="icon-btn" data-action="back" aria-label="返回">' + icon('back', 20) + '</button>' +
    '<div><p class="eyebrow">文化网络 · ' + liveWorks().length + ' 个作品节点</p><h1 class="page-title">关系</h1></div></div>' +
    '</header>';

  html += '<div class="segbar" style="margin-bottom:16px">' +
    [['map', '知识图谱'], ['series', '系列档案'], ['links', '双向关联']].map((t) =>
      '<button class="' + (tab === t[0] ? 'is-on' : '') + '" data-action="graph-tab" data-value="' + t[0] + '">' + t[1] + '</button>').join('') +
    '</div>';

  if (tab === 'map') return html + mapPanel();
  if (tab === 'series') return html + seriesPanel();
  return html + linksPanel();
}

function mapPanel() {
  const works = liveWorks().slice().sort((a, b) => (b.rating || 0) - (a.rating || 0) || String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 36);
  if (!works.length) return emptyState('·', '还没有节点', '添加作品后，这里会把作品、标签、人物连成一张图。');

  const W = 720;
  const H = 520;
  const cx = W / 2;
  const cy = H / 2;
  const tags = [];
  const creatorsUsed = [];
  const tagIndex = {};
  const creatorIndex = {};

  works.forEach((w) => {
    (w.tagIds || []).forEach((id) => {
      const t = data.tags.find((x) => x.id === id);
      if (t && !tagIndex[t.name]) { tagIndex[t.name] = tags.length; tags.push(t.name); }
    });
    workCreatorsOf(w.id).forEach((wc) => {
      const c = creatorOf(wc.creatorId);
      if (c && !creatorIndex[c.id]) { creatorIndex[c.id] = creatorsUsed.length; creatorsUsed.push(c); }
    });
  });

  const tagPos = tags.slice(0, 10).map((name, i) => {
    const ang = (i / Math.max(1, Math.min(10, tags.length))) * Math.PI * 2 - Math.PI / 2;
    return { name, x: cx + Math.cos(ang) * 218, y: cy + Math.sin(ang) * 168 };
  });
  const workPos = works.map((w, i) => {
    const ang = (i / works.length) * Math.PI * 2 - Math.PI / 2;
    const r = 96 + (i % 3) * 26;
    return { w, x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * (r * 0.78) };
  });

  const nodeFilter = ui.graphNodes || 'all';
  const creatorPos = creatorsUsed.slice(0, 12).map((c, i) => {
    const ang = (i / Math.max(1, Math.min(12, creatorsUsed.length))) * Math.PI * 2 + Math.PI / 8;
    return { c, x: cx + Math.cos(ang) * 290, y: cy + Math.sin(ang) * 214 };
  });

  let lines = '';
  if (nodeFilter === 'all' || nodeFilter === 'tag') {
    workPos.forEach((p) => {
      (p.w.tagIds || []).forEach((id) => {
        const t = data.tags.find((x) => x.id === id);
        if (!t) return;
        const tp = tagPos.find((x) => x.name === t.name);
        if (!tp) return;
        lines += '<line x1="' + p.x.toFixed(1) + '" y1="' + p.y.toFixed(1) + '" x2="' + tp.x.toFixed(1) + '" y2="' + tp.y.toFixed(1) + '"/>';
      });
    });
  }
  if (nodeFilter === 'all' || nodeFilter === 'creator') {
    workPos.forEach((p) => {
      workCreatorsOf(p.w.id).forEach((wc) => {
        const cp = creatorPos.find((x) => x.c.id === wc.creatorId);
        if (!cp) return;
        lines += '<line class="is-creator" x1="' + p.x.toFixed(1) + '" y1="' + p.y.toFixed(1) +
          '" x2="' + cp.x.toFixed(1) + '" y2="' + cp.y.toFixed(1) + '"/>';
      });
    });
  }

  let nodes = '';
  if (nodeFilter === 'all' || nodeFilter === 'tag') tagPos.forEach((t) => {
    nodes += '<g class="gnode is-tag"><circle cx="' + t.x.toFixed(1) + '" cy="' + t.y.toFixed(1) + '" r="5"/>' +
      '<text x="' + t.x.toFixed(1) + '" y="' + (t.y - 9).toFixed(1) + '" text-anchor="middle">#' + esc(t.name) + '</text></g>';
  });
  if (nodeFilter === 'all' || nodeFilter === 'creator') creatorPos.forEach((cp) => {
    nodes += '<g class="gnode is-creator"><circle cx="' + cp.x.toFixed(1) + '" cy="' + cp.y.toFixed(1) + '" r="4"/>' +
      '<text x="' + cp.x.toFixed(1) + '" y="' + (cp.y - 8).toFixed(1) + '" text-anchor="middle">' + esc(cp.c.name) + '</text></g>';
  });
  workPos.forEach((p) => {
    const r = 5 + Math.min(6, (p.w.rating || 0) / 2);
    nodes += '<g class="gnode is-work" data-action="open-work" data-id="' + p.w.id + '">' +
      '<circle cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="' + r.toFixed(1) + '" style="--gc:' + typeDef(p.w.type).color + '"/>' +
      '<text x="' + p.x.toFixed(1) + '" y="' + (p.y + r + 11).toFixed(1) + '" text-anchor="middle">' +
      esc(String(p.w.title).slice(0, 6)) + '</text></g>';
  });

  const z = ui.graphZoom || { k: 1, x: 0, y: 0 };
  return '<p class="fan-hint">点圆点打开作品；按住拖动可平移，按钮缩放。连线只表示已存在的关系，不推断。</p>' +
    '<div class="chips" style="margin-bottom:10px">' +
    [['all', '全部节点'], ['tag', '标签视角'], ['creator', '人物视角'], ['work', '仅作品']].map((n) =>
      '<button class="chip' + (nodeFilter === n[0] ? ' is-on' : '') + '" data-action="graph-nodes" data-value="' + n[0] + '">' + n[1] + '</button>').join('') +
    '<button class="chip" data-action="graph-zoom" data-value="in">＋</button>' +
    '<button class="chip" data-action="graph-zoom" data-value="out">－</button>' +
    '<button class="chip" data-action="graph-zoom" data-value="reset">复位</button>' +
    '</div>' +
    '<div class="graph-wrap"><svg class="graph" id="graph-svg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="作品与标签的关系图">' +
    '<g id="graph-root" transform="translate(' + z.x + ' ' + z.y + ') scale(' + z.k + ')">' +
    '<g class="glines">' + lines + '</g>' + nodes + '</g></svg></div>' +
    '<div class="row-flex" style="margin-top:10px;font-size:11px;color:var(--text-3);gap:14px">' +
    '<span>' + works.length + ' 个作品</span><span>' + tags.length + ' 个标签</span>' +
    '<span>' + creatorsUsed.length + ' 位人物</span></div>';
}

/* ---------------- 8.6 系列档案 ---------------- */

function seriesPanel() {
  const all = series.list();
  let html = '<div class="section-head"><h2 class="section-title">系列</h2>' +
    '<button class="btn btn-ghost btn-sm" data-action="series-new">＋ 新建系列</button></div>';

  if (!all.length) {
    return html + emptyState('·', '还没有系列档案', '同一世界观、同一作者的多部作品，可以归到一个系列里，写下设定与阅读顺序。');
  }

  return html + '<div class="rows">' + all.map((s) => {
    const n = (s.workIds || []).length;
    return '<button class="rowitem" data-action="series-open" data-id="' + s.id + '">' +
      '<span class="logo-box">' + esc(String(s.name || '?').slice(0, 1)) + '</span>' +
      '<span class="rowitem-main"><b>' + esc(s.name) + '</b>' +
      '<i>' + esc([n + ' 部作品', s.type ? typeDef(s.type).label : '', s.description].filter(Boolean).join(' · ')) + '</i></span>' +
      icon('right', 15) + '</button>';
  }).join('') + '</div>';
}

export function seriesDetail(id) {
  const s = series.get(id);
  if (!s) return '<div class="page"><p class="muted">系列不存在。</p></div>';
  const raw = (s.workIds || []).map((x) => getWork(x)).filter(Boolean);
  const mode = s.orderMode === 'story' ? 'story' : 'publish';
  const storyOrder = s.storyOrder || [];
  const list = raw.slice().sort((a, b) => {
    if (mode === 'story') {
      const ia = storyOrder.indexOf(a.id);
      const ib = storyOrder.indexOf(b.id);
      if (ia >= 0 || ib >= 0) return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    }
    /* 发行顺序：先看作品里的丛书序号，再看年份，最后按系列内的原始加入顺序 */
    const sa = Number(detailsOf(a.id).seriesNo) || 0;
    const sb = Number(detailsOf(b.id).seriesNo) || 0;
    if (sa || sb) return (sa || 999) - (sb || 999);
    const ya = String(a.year || '');
    const yb = String(b.year || '');
    if (ya !== yb) return ya.localeCompare(yb);
    return raw.indexOf(a) - raw.indexOf(b);
  });
  const doneCount = raw.filter((w) => bucketOf(w) === 'done').length;

  let html = '<header class="page-head">' +
    '<div class="head-left"><button class="icon-btn" data-action="graph-tab" data-value="series" aria-label="返回">' + icon('back', 20) + '</button>' +
    '<div><p class="eyebrow">系列 · ' + list.length + ' 部</p><h1 class="page-title">' + esc(s.name) + '</h1></div></div>' +
    '<div class="head-actions"><button class="icon-btn" data-action="series-edit" data-id="' + s.id + '" aria-label="编辑">' + icon('edit', 18) + '</button></div>' +
    '</header>';

  if (s.description) html += '<p class="prose" style="font-size:13px;color:var(--text-2);white-space:pre-wrap;margin-bottom:14px">' + esc(s.description) + '</p>';
  if (s.worldNote) {
    html += '<section class="section"><div class="section-head"><h2 class="section-title">世界观与设定</h2></div>' +
      '<div class="card"><p style="font-size:13px;line-height:1.85;white-space:pre-wrap;color:var(--text-2)">' + esc(s.worldNote) + '</p></div></section>';
  }

  html += '<section class="section"><div class="section-head"><h2 class="section-title">作品顺序</h2>' +
    '<span class="section-note">已体验 ' + doneCount + ' / ' + raw.length + '</span></div>' +
    '<div class="chips" style="margin-bottom:10px">' +
    [['publish', '按发行顺序'], ['story', '按故事时间线']].map((m) =>
      '<button class="chip' + (mode === m[0] ? ' is-on' : '') + '" data-action="series-order" data-id="' + s.id + '" data-value="' + m[0] + '">' + m[1] + '</button>').join('') +
    '</div>' +
    (list.length ? '<div class="rows">' + list.map((w, i) => {
      const cover = coverUrl(w);
      const done = bucketOf(w) === 'done';
      return '<button class="rowitem" data-action="open-work" data-id="' + w.id + '">' +
        '<span class="rowitem-n mono">' + (i + 1) + '</span>' +
        '<span class="cover" style="--cc:' + coverColor(w.title) + ';width:34px;flex:0 0 34px">' +
        (cover ? '<img src="' + esc(cover) + '" alt="">' : '<b>' + esc(initials(w.title)) + '</b>') + '</span>' +
        '<span class="rowitem-main"><b>' + esc(w.title) + '</b><i>' + esc([typeDef(w.type).label, w.year].filter(Boolean).join(' · ')) + '</i></span>' +
        '<span class="rowitem-side">' + (done
          ? '<span class="badge is-violet">已体验</span>'
          : '<span class="badge is-warn">未体验</span>') + icon('right', 15) + '</span></button>';
    }).join('') + '</div>' : '<p class="muted" style="font-size:12.5px">还没有作品。</p>') +
    '</section>';

  return html;
}

export function openSeries(id) {
  const cur = id ? series.get(id) : null;
  const d = cur ? Object.assign({}, cur, { workIds: (cur.workIds || []).slice() }) : {
    id: '', name: '', type: '', description: '', worldNote: '', workIds: []
  };

  const body = '<div>' +
    '<label class="field"><span class="field-label">系列名称</span><input class="input" id="sr-name" value="' + esc(d.name) + '" placeholder="三体三部曲"></label>' +
    '<label class="field"><span class="field-label">主要类型</span><select class="select" id="sr-type">' +
    '<option value="">不限定</option>' + TYPES.map((t) => '<option value="' + t.id + '"' + (d.type === t.id ? ' selected' : '') + '>' + esc(t.label) + '</option>').join('') +
    '</select></label>' +
    '<label class="field"><span class="field-label">简介</span><textarea class="textarea" id="sr-desc" rows="2">' + esc(d.description) + '</textarea></label>' +
    '<label class="field"><span class="field-label">世界观 / 设定笔记</span><textarea class="textarea" id="sr-world" rows="4" placeholder="时间线、势力、阅读顺序建议">' + esc(d.worldNote) + '</textarea></label>' +
    '<p class="field-label">包含作品（' + d.workIds.length + '）</p>' +
    '<div class="pick-list">' + liveWorks().sort((a, b) => String(a.title).localeCompare(String(b.title), 'zh-Hans-CN')).map((w) =>
      '<label class="pick-row"><input type="checkbox" data-w="' + w.id + '"' + (d.workIds.indexOf(w.id) >= 0 ? ' checked' : '') + '>' +
      '<span>' + esc(w.title) + '</span></label>').join('') + '</div>' +
    '</div>';

  openModal({
    title: cur ? '编辑系列' : '新建系列',
    wide: true,
    body,
    actions: [{ label: '取消', value: null, variant: 'ghost' }, { label: '保存', value: 'save', variant: 'primary' }],
    onMount: (root) => {
      root.querySelector('#sr-name').addEventListener('input', (e) => { d.name = e.target.value; });
      root.querySelector('#sr-type').addEventListener('change', (e) => { d.type = e.target.value; });
      root.querySelector('#sr-desc').addEventListener('input', (e) => { d.description = e.target.value; });
      root.querySelector('#sr-world').addEventListener('input', (e) => { d.worldNote = e.target.value; });
      root.querySelectorAll('[data-w]').forEach((cb) => {
        cb.addEventListener('change', () => {
          const id2 = cb.dataset.w;
          if (cb.checked) { if (d.workIds.indexOf(id2) < 0) d.workIds.push(id2); }
          else d.workIds = d.workIds.filter((x) => x !== id2);
        });
      });
    }
  }).then(async (v) => {
    if (v !== 'save') return;
    if (!String(d.name || '').trim()) { toast('系列名不能为空', 'error'); return; }
    const res = await series.save(d);
    if (!res.ok) { toast(res.error || '保存失败', 'error'); return; }
    toast('已保存');
    go('#/series/' + res.row.id);
  });
}

/* ---------------- 8.2 双向关联 ---------------- */

function entityLabel(key) {
  if (!key) return '';
  const i = key.indexOf(':');
  const type = key.slice(0, i);
  const id = key.slice(i + 1);
  if (type === 'work') { const w = getWork(id); return w ? w.title : '（已删除作品）'; }
  if (type === 'excerpt') { const e = data.excerpts.find((x) => x.id === id); return e ? '摘抄：' + String(e.content).slice(0, 16) : '（摘抄）'; }
  if (type === 'review') { const r = data.reviews.find((x) => x.id === id); return r ? '总结：' + (r.title || '未命名') : '（总结）'; }
  if (type === 'creator') { const c = creatorOf(id); return c ? c.name : '（人物）'; }
  if (type === 'topic') { const t = topics.get(id); return t ? '专题：' + t.title : '（专题）'; }
  if (type === 'series') { const s = series.get(id); return s ? '系列：' + s.name : '（系列）'; }
  return key;
}

function linksPanel() {
  const all = links.list();
  let html = '<div class="section-head"><h2 class="section-title">双向关联</h2>' +
    '<button class="btn btn-ghost btn-sm" data-action="link-new">＋ 新建关联</button></div>' +
    '<p class="fan-hint">关联是双向的：从 A 连到 B，B 的详情页也能看到 A。</p>';

  if (!all.length) {
    return html + emptyState('·', '还没有关联', '比如把一篇总结和它分析的作品连起来，或者把两位作者关联成「同作者」。');
  }

  return html + '<div class="rows">' + all.map((l) =>
    '<div class="rowitem is-static">' +
    '<span class="row-icon">' + icon('link', 16) + '</span>' +
    '<span class="rowitem-main"><b>' + esc(entityLabel(l.source)) + '</b>' +
    '<i>' + esc((l.relation || '相关') + ' → ' + entityLabel(l.target)) + '</i></span>' +
    '<button class="btn btn-ghost btn-xs" data-action="link-del" data-id="' + l.id + '">删除</button></div>').join('') + '</div>';
}

function entityOptions(type) {
  if (type === 'work') return liveWorks().map((w) => ({ v: entityKey('work', w.id), l: w.title }));
  if (type === 'excerpt') return data.excerpts.filter((e) => !e.deletedAt).map((e) => ({ v: entityKey('excerpt', e.id), l: String(e.content).slice(0, 24) }));
  if (type === 'review') return data.reviews.filter((r) => !r.deletedAt).map((r) => ({ v: entityKey('review', r.id), l: r.title || '未命名' }));
  if (type === 'creator') return creators.list().map((c) => ({ v: entityKey('creator', c.id), l: c.name }));
  if (type === 'topic') return topics.list().map((t) => ({ v: entityKey('topic', t.id), l: t.title }));
  if (type === 'series') return series.list().map((s) => ({ v: entityKey('series', s.id), l: s.name }));
  return [];
}

export function openLinkEditor() {
  const types = [['work', '作品'], ['excerpt', '摘抄'], ['review', '总结'], ['creator', '人物'], ['topic', '专题'], ['series', '系列']];
  const body = '<div>' +
    '<div class="row2"><label class="field"><span class="field-label">起点类型</span><select class="select" id="lk-st">' +
    types.map((t) => '<option value="' + t[0] + '">' + t[1] + '</option>').join('') + '</select></label>' +
    '<label class="field"><span class="field-label">起点</span><select class="select" id="lk-s"></select></label></div>' +
    '<div class="row2"><label class="field"><span class="field-label">终点类型</span><select class="select" id="lk-tt">' +
    types.map((t) => '<option value="' + t[0] + '">' + t[1] + '</option>').join('') + '</select></label>' +
    '<label class="field"><span class="field-label">终点</span><select class="select" id="lk-t"></select></label></div>' +
    '<label class="field"><span class="field-label">关系</span><select class="select" id="lk-rel">' +
    RELATION_TYPES.map((r) => '<option>' + r + '</option>').join('') + '</select></label>' +
    '</div>';

  openModal({
    title: '新建关联',
    body,
    wide: true,
    actions: [{ label: '取消', value: null, variant: 'ghost' }, { label: '关联', value: 'ok', variant: 'primary' }],
    onMount: (root) => {
      const fill = (typeSel, targetSel) => {
        const list = entityOptions(typeSel.value);
        targetSel.innerHTML = list.map((o) => '<option value="' + o.v + '">' + esc(o.l) + '</option>').join('') || '<option value="">（没有可选项）</option>';
      };
      const st = root.querySelector('#lk-st');
      const tt = root.querySelector('#lk-tt');
      fill(st, root.querySelector('#lk-s'));
      fill(tt, root.querySelector('#lk-t'));
      st.addEventListener('change', () => fill(st, root.querySelector('#lk-s')));
      tt.addEventListener('change', () => fill(tt, root.querySelector('#lk-t')));
    }
  }).then(async (v) => {
    if (v !== 'ok') return;
    const s = document.getElementById('lk-s');
    const t = document.getElementById('lk-t');
    const rel = document.getElementById('lk-rel');
    if (!s || !t || !s.value || !t.value) { toast('两端都要选'); return; }
    const row = await addLink(s.value, t.value, rel ? rel.value : '相关');
    toast(row ? '已关联' : '关联失败', row ? 'ok' : 'error');
    go('#/graph/links');
  });
}

export const actions = {
  'graph-nodes': (el) => { ui.graphNodes = el.dataset.value; go('#/graph'); },
  'graph-zoom': (el) => {
    const cur = ui.graphZoom || { k: 1, x: 0, y: 0 };
    const v = el.dataset.value;
    if (v === 'reset') ui.graphZoom = { k: 1, x: 0, y: 0 };
    else ui.graphZoom = Object.assign({}, cur, {
      k: Math.max(0.5, Math.min(2.4, cur.k + (v === 'in' ? 0.2 : -0.2)))
    });
    go('#/graph');
  },
  'graph-tab': (el) => {
    const v = el.dataset.value;
    ui.graphTab = v;
    if (v === 'series') go('#/graph/series');
    else if (v === 'links') go('#/graph/links');
    else go('#/graph');
  },
  'series-new': () => openSeries(null),
  'series-edit': (el) => openSeries(el.dataset.id),
  'series-order': async (el) => {
    const s2 = series.get(el.dataset.id);
    if (!s2) return;
    await series.save(Object.assign({}, s2, { orderMode: el.dataset.value }));
    go('#/series/' + s2.id);
  },
  'series-open': (el) => go('#/series/' + el.dataset.id),
  'link-new': () => openLinkEditor(),
  'link-del': async (el) => {
    const ok = await confirmDialog({ title: '删除这条关联？', confirmText: '删除', danger: true });
    if (!ok) return;
    await links.hardRemove(el.dataset.id);
    toast('已删除');
    go('#/graph/links');
  }
};


/* 图谱平移：渲染后绑定，缩放由按钮控制 */
export function bindGraph(root) {
  const svg = root.querySelector('#graph-svg');
  const g = root.querySelector('#graph-root');
  if (!svg || !g) return;
  let dragging = false;
  let sx = 0;
  let sy = 0;
  let start = null;

  svg.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.gnode.is-work')) return;
    dragging = true;
    sx = e.clientX;
    sy = e.clientY;
    start = Object.assign({}, ui.graphZoom || { k: 1, x: 0, y: 0 });
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove', (e) => {
    if (!dragging || !start) return;
    const nx = start.x + (e.clientX - sx);
    const ny = start.y + (e.clientY - sy);
    g.setAttribute('transform', 'translate(' + nx + ' ' + ny + ') scale(' + start.k + ')');
    ui.graphZoom = { k: start.k, x: nx, y: ny };
  });
  const stop = () => { dragging = false; start = null; };
  svg.addEventListener('pointerup', stop);
  svg.addEventListener('pointercancel', stop);
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const cur = ui.graphZoom || { k: 1, x: 0, y: 0 };
    const k = Math.max(0.5, Math.min(2.4, cur.k + (e.deltaY > 0 ? -0.12 : 0.12)));
    ui.graphZoom = Object.assign({}, cur, { k });
    g.setAttribute('transform', 'translate(' + cur.x + ' ' + cur.y + ') scale(' + k + ')');
  }, { passive: false });
}
