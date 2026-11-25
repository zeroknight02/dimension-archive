/* ==========================================================
   次元簿 · 创作者与人物资料库（6.6）
   人物是独立实体：同一个人可以出现在作品的不同角色里，
   作品与人物用 work_creators 表建立多对多关系。
   ========================================================== */

import { data, creators, creatorOf, worksOfCreator, workCreatorsOf, liveWorks, linkCreator, coverUrl, saveReviewImage, imageUrl, bucketOf, getWork } from '../core/repo.js';
import { CREATOR_ROLES, typeDef } from '../core/schema.js';
import { ui, go } from '../core/state.js';
import { icon, toast, openModal, confirmDialog, emptyState } from '../core/ui.js';
import { esc, initials, coverColor, ratingShort } from '../core/format.js';

export function creatorsView() {
  let html = '<header class="page-head">' +
    '<div class="head-left"><button class="icon-btn" data-action="back" aria-label="返回">' + icon('back', 20) + '</button>' +
    '<div><p class="eyebrow">人物库 · ' + creators.list().length + ' 位</p><h1 class="page-title">创作者</h1></div></div>' +
    '<div class="head-actions"><button class="icon-btn" data-action="creator-new" aria-label="新增人物">' + icon('plus', 20) + '</button></div>' +
    '</header>';

  html += '<div class="searchbar" style="margin-bottom:14px">' + icon('search', 16) +
    '<input id="creator-search" type="search" placeholder="搜索姓名、国家、角色" value="' + esc(ui.creatorQ || '') + '"></div>';

  html += '<div id="creator-body">' + creatorsBodyHTML() + '</div>';
  return html;
}

export function paintCreators() {
  const box = document.getElementById('creator-body');
  if (box) box.innerHTML = creatorsBodyHTML();
}

function creatorsBodyHTML() {
  const q = String(ui.creatorQ || '').trim().toLowerCase();
  let list = creators.list().slice();
  if (q) list = list.filter((c) => [c.name, c.country, (c.roles || []).join(' '), c.note].join(' ').toLowerCase().indexOf(q) >= 0);
  list.sort((a, b) => worksOfCreator(b.id).length - worksOfCreator(a.id).length || String(a.name).localeCompare(String(b.name), 'zh-Hans-CN'));

  if (!creators.list().length) {
    return emptyState('·', '还没有人物档案', '把作者、导演、声优单独建一条，就能看到「这个人的全部作品」。',
      '<button class="btn btn-primary btn-sm" data-action="creator-new">＋ 新建人物</button>');
  }
  if (!list.length) return emptyState('·', '没有匹配的人物', '换个关键词。');

  return '<div class="rows">' + list.map((c) => {
    const works = worksOfCreator(c.id);
    return '<button class="rowitem" data-action="creator-open" data-id="' + c.id + '">' +
      '<span class="logo-box">' + esc(String(c.name || '?').slice(0, 1)) + '</span>' +
      '<span class="rowitem-main"><b>' + esc(c.name) + '</b>' +
      '<i>' + esc([(c.roles || []).join(' / '), c.country, works.length ? works.length + ' 部作品' : '还没有关联作品'].filter(Boolean).join(' · ')) + '</i></span>' +
      '<span class="rowitem-side">' + icon('right', 16) + '</span></button>';
  }).join('') + '</div>';
}

function workOptions(selected) {
  return liveWorks().sort((a, b) => String(a.title).localeCompare(String(b.title), 'zh-Hans-CN'))
    .map((w) => '<option value="' + w.id + '"' + (selected === w.id ? ' selected' : '') + '>' + esc(w.title) + '（' + esc(typeDef(w.type).label) + '）</option>').join('');
}

export function openCreator(id) {
  const cur = id ? creatorOf(id) : null;
  const d = cur ? Object.assign({}, cur, { roles: (cur.roles || []).slice(), aliases: (cur.aliases || []).slice() }) : {
    id: '', name: '', originalName: '', aliases: [], roles: ['作者'], country: '', birth: '',
    note: '', link: '', repWorks: '', rating: 0, photo: ''
  };

  const body = '<div>' +
    '<label class="field"><span class="field-label">姓名 / 名称</span><input class="input" id="cr-name" value="' + esc(d.name) + '" placeholder="刘慈欣"></label>' +
    '<div class="row2"><label class="field"><span class="field-label">原文姓名</span><input class="input" id="cr-original" value="' + esc(d.originalName) + '" placeholder="Liu Cixin"></label>' +
    '<label class="field"><span class="field-label">别名（空格分隔）</span><input class="input" id="cr-alias" value="' + esc((d.aliases || []).join(' ')) + '"></label></div>' +
    '<p class="field-label">身份角色（可多选）</p>' +
    '<div class="chips" id="cr-roles">' + CREATOR_ROLES.map((r) =>
      '<button type="button" class="chip' + (d.roles.indexOf(r) >= 0 ? ' is-on' : '') + '" data-role="' + esc(r) + '">' + esc(r) + '</button>').join('') + '</div>' +
    '<div class="row2" style="margin-top:12px">' +
    '<label class="field"><span class="field-label">国家 / 地区</span><input class="input" id="cr-country" value="' + esc(d.country) + '"></label>' +
    '<label class="field"><span class="field-label">生卒 / 年份</span><input class="input" id="cr-birth" value="' + esc(d.birth) + '" placeholder="1963"></label></div>' +
    '<div class="row2"><label class="field"><span class="field-label">代表作</span><input class="input" id="cr-rep" value="' + esc(d.repWorks) + '" placeholder="三体 / 球状闪电"></label>' +
    '<label class="field"><span class="field-label">个人评价</span><select class="select" id="cr-rating">' +
    '<option value="0">不评分</option>' + [10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((v) =>
      '<option value="' + v + '"' + (Number(d.rating) === v ? ' selected' : '') + '>' + v + ' 分</option>').join('') + '</select></label></div>' +
    '<label class="field"><span class="field-label">外部链接</span><input class="input" id="cr-link" value="' + esc(d.link) + '" placeholder="https://"></label>' +
    '<label class="field"><span class="field-label">照片</span>' +
    '<div class="cover-pick"><span class="cover-pick-prev">' +
    (d.photo ? '<img src="' + esc(imageUrl(d.photo)) + '" alt="">' : '<b>' + esc(initials(d.name || '?')) + '</b>') + '</span>' +
    '<label class="btn btn-ghost btn-sm">选择图片<input type="file" accept="image/*" id="cr-photo" hidden></label></div></label>' +
    '<label class="field"><span class="field-label">简介 / 备注</span><textarea class="textarea" id="cr-note" rows="3">' + esc(d.note) + '</textarea></label>' +
    (cur ? '<button type="button" class="btn btn-danger btn-sm" data-action="creator-del" data-id="' + cur.id + '">删除人物</button>' : '') +
    '</div>';

  openModal({
    title: cur ? '编辑人物' : '新建人物',
    wide: true,
    body,
    actions: [{ label: '取消', value: null, variant: 'ghost' }, { label: '保存', value: 'save', variant: 'primary' }],
    onMount: (root) => {
      root.querySelector('#cr-name').addEventListener('input', (e) => { d.name = e.target.value; });
      root.querySelector('#cr-country').addEventListener('input', (e) => { d.country = e.target.value; });
      root.querySelector('#cr-birth').addEventListener('input', (e) => { d.birth = e.target.value; });
      root.querySelector('#cr-link').addEventListener('input', (e) => { d.link = e.target.value; });
      root.querySelector('#cr-note').addEventListener('input', (e) => { d.note = e.target.value; });
      root.querySelector('#cr-original').addEventListener('input', (e) => { d.originalName = e.target.value; });
      root.querySelector('#cr-alias').addEventListener('input', (e) => {
        d.aliases = e.target.value.split(/[\s,，/]+/).map((x) => x.trim()).filter(Boolean);
      });
      root.querySelector('#cr-rep').addEventListener('input', (e) => { d.repWorks = e.target.value; });
      root.querySelector('#cr-rating').addEventListener('change', (e) => { d.rating = Number(e.target.value) || 0; });
      const photo = root.querySelector('#cr-photo');
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
      root.querySelectorAll('[data-role]').forEach((b) => {
        b.addEventListener('click', () => {
          const r = b.dataset.role;
          b.classList.toggle('is-on');
          if (d.roles.indexOf(r) >= 0) d.roles = d.roles.filter((x) => x !== r);
          else d.roles.push(r);
        });
      });
    }
  }).then(async (v) => {
    if (v !== 'save') return;
    if (!String(d.name || '').trim()) { toast('姓名不能为空', 'error'); return; }
    const res = await creators.save(d);
    if (!res.ok) { toast(res.error || '保存失败', 'error'); return; }
    toast('已保存');
    go('#/creators');
  });
}

export function creatorDetail(id) {
  const c = creatorOf(id);
  if (!c) return '<div class="page"><p class="muted">人物不存在或已删除。</p></div>';
  const works = worksOfCreator(c.id);
  const roles = (c.roles || []).join(' / ');
  const doneWorks = works.filter((w) => bucketOf(w) === 'done');
  const wishWorks = works.filter((w) => ['wish', 'todo'].indexOf(bucketOf(w)) >= 0);
  const workIds = new Set(works.map((w) => w.id));
  const relReviews = data.reviews.filter((r) => !r.deletedAt && workIds.has(r.workId));
  const relExcerpts = data.excerpts.filter((r) => !r.deletedAt && workIds.has(r.workId));
  const dist = {};
  works.forEach((w) => { if (w.rating) dist[w.rating] = (dist[w.rating] || 0) + 1; });
  const distKeys = Object.keys(dist).map(Number).sort((a, b) => b - a);

  let html = '<header class="page-head">' +
    '<div class="head-left"><button class="icon-btn" data-action="go" data-to="#/creators" aria-label="返回">' + icon('back', 20) + '</button>' +
    '<div><p class="eyebrow">' + esc(roles || '人物') + '</p><h1 class="page-title">' + esc(c.name) + '</h1></div></div>' +
    '<div class="head-actions"><button class="icon-btn" data-action="creator-edit" data-id="' + c.id + '" aria-label="编辑">' + icon('edit', 18) + '</button></div>' +
    '</header>';

  html += '<section class="wdetail">' +
    '<div class="wdetail-art">' +
    (c.photo ? '<img src="' + esc(imageUrl(c.photo)) + '" alt="">' :
      '<span class="ph" style="--cc:' + coverColor(c.name) + '">' + esc(initials(c.name)) + '</span>') +
    '</div><div class="wdetail-main">' +
    '<div class="row-flex" style="gap:6px;margin-bottom:6px">' +
    (c.rating ? '<span class="badge is-gold">★ ' + ratingShort(c.rating) + '</span>' : '') +
    (c.country ? '<span class="badge">' + esc(c.country) + '</span>' : '') +
    (c.birth ? '<span class="badge">' + esc(c.birth) + '</span>' : '') +
    '</div>' +
    (c.originalName ? '<p class="wdetail-by">' + esc(c.originalName) + '</p>' : '') +
    ((c.aliases || []).length ? '<p class="wdetail-by">别名：' + esc((c.aliases || []).join('、')) + '</p>' : '') +
    (c.repWorks ? '<p class="wdetail-sum">代表作：' + esc(c.repWorks) + '</p>' : '') +
    '<div class="kv" style="margin-top:10px">' +
    '<div class="kv-row"><span>关联作品</span><b>' + works.length + ' 部</b></div>' +
    '<div class="kv-row"><span>已体验 / 待体验</span><b>' + doneWorks.length + ' / ' + wishWorks.length + '</b></div>' +
    (c.link ? '<div class="kv-row"><span>链接</span><b><a href="' + esc(c.link) + '" target="_blank" rel="noopener">打开</a></b></div>' : '') +
    '</div></div></section>';

  if (c.note) html += '<p class="prose" style="font-size:13px;color:var(--text-2);white-space:pre-wrap;margin:16px 0 18px">' + esc(c.note) + '</p>';

  if (distKeys.length) {
    const max = Math.max(...distKeys.map((k) => dist[k]));
    html += '<section class="section"><div class="section-head"><h2 class="section-title">评分分布</h2>' +
      '<span class="section-note">' + distKeys.reduce((a, k) => a + dist[k], 0) + ' 部打分</span></div><div class="radar">' +
      distKeys.map((k) => '<div class="radar-row"><span>' + k + ' 分</span>' +
        '<span class="radar-track"><i style="width:' + Math.round(dist[k] / max * 100) + '%"></i></span><b>' + dist[k] + '</b></div>').join('') +
      '</div></section>';
  }

  if (relReviews.length || relExcerpts.length) {
    html += '<section class="section"><div class="section-head"><h2 class="section-title">相关总结与摘抄</h2>' +
      '<span class="section-note">' + (relReviews.length + relExcerpts.length) + ' 条</span></div><div class="rows">' +
      relReviews.slice(0, 4).map((r) => '<button class="rowitem" data-action="read-review" data-id="' + r.id + '">' +
        '<span class="row-icon">' + icon('edit', 15) + '</span><span class="rowitem-main"><b>' + esc(r.title || '总结') + '</b>' +
        '<i>' + esc((getWork(r.workId) || {}).title || '') + '</i></span>' + icon('right', 15) + '</button>').join('') +
      relExcerpts.slice(0, 3).map((x) => '<button class="rowitem" data-action="edit-excerpt" data-id="' + x.id + '">' +
        '<span class="row-icon">' + icon('tag', 15) + '</span><span class="rowitem-main"><b>' + esc(String(x.content || '').slice(0, 30)) + '</b>' +
        '<i>摘抄</i></span>' + icon('right', 15) + '</button>').join('') +
      '</div></section>';
  }

  html += '<section class="section"><div class="section-head"><h2 class="section-title">作品</h2>' +
    '<button class="btn btn-ghost btn-sm" data-action="creator-link" data-id="' + c.id + '">＋ 关联作品</button></div>' +
    (works.length ? '<div class="rows">' + works.map((w) => {
      const rel = workCreatorsOf(w.id).filter((x) => x.creatorId === c.id).map((x) => x.role).join(' / ');
      const cover = coverUrl(w);
      return '<button class="rowitem" data-action="open-work" data-id="' + w.id + '">' +
        '<span class="cover" style="--cc:' + coverColor(w.title) + ';width:38px;flex:0 0 38px">' +
        (cover ? '<img src="' + esc(cover) + '" alt="">' : '<b>' + esc(initials(w.title)) + '</b>') + '</span>' +
        '<span class="rowitem-main"><b>' + esc(w.title) + '</b><i>' + esc([rel, typeDef(w.type).label, w.year].filter(Boolean).join(' · ')) + '</i></span>' +
        icon('right', 15) + '</button>';
    }).join('') + '</div>'
      : '<p class="muted" style="font-size:12.5px">还没有关联作品。可以在作品详情里挂人物，也可以在这里直接关联。</p>') +
    '</section>';

  return html;
}

function linkWorkModal(creatorId) {
  const c = creatorOf(creatorId);
  if (!c) return;
  const body = '<label class="field"><span class="field-label">作品</span><select class="select" id="lw-work">' + workOptions('') + '</select></label>' +
    '<label class="field"><span class="field-label">在这部作品里的角色</span><select class="select" id="lw-role">' +
    CREATOR_ROLES.map((r) => '<option>' + esc(r) + '</option>').join('') + '</select></label>';
  openModal({
    title: '关联作品',
    desc: c.name,
    body,
    actions: [{ label: '取消', value: null, variant: 'ghost' }, { label: '关联', value: 'ok', variant: 'primary' }]
  }).then(async (v) => {
    if (v !== 'ok') return;
    const w = document.getElementById('lw-work');
    const r = document.getElementById('lw-role');
    if (!w || !w.value) return;
    await linkCreator(w.value, creatorId, r ? r.value : '作者');
    toast('已关联');
    go('#/creator/' + creatorId);
  });
}

export const actions = {
  'creator-new': () => openCreator(null),
  'creator-edit': (el) => openCreator(el.dataset.id),
  'creator-open': (el) => go('#/creator/' + el.dataset.id),
  'creator-link': (el) => linkWorkModal(el.dataset.id),
  'creator-del': async (el) => {
    const ok = await confirmDialog({ title: '删除这位人物？', desc: '与作品的关联会一起解除，作品本身不受影响。', confirmText: '删除', danger: true });
    if (!ok) return;
    await creators.remove(el.dataset.id);
    const modal = document.querySelector('.modal-backdrop.is-on');
    if (modal) modal.remove();
    toast('已删除');
    go('#/creators');
  }
};
