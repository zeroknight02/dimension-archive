/* ==========================================================
   次元簿 · 随机发现与个性化推荐（7.7 / 9.4）
   随机：从待体验清单里抽一部，避免「收藏夹吃灰」。
   推荐：只用你自己的记录做规则推荐，理由必须写明，不编造外部数据。
   ========================================================== */

import { data, liveWorks, detailsOf, bucketOf, coverUrl, saveExperience } from '../core/repo.js';
import { TYPES, typeDef } from '../core/schema.js';
import { ui, go } from '../core/state.js';
import { icon, toast, emptyState } from '../core/ui.js';
import { esc, initials, coverColor } from '../core/format.js';

const SCOPES = [
  ['wish', '待体验'], ['all', '全部作品'], ['category', '某分类'], ['topic', '某专题'],
  ['tag', '某标签'], ['creator', '某创作者'], ['series', '某系列'], ['resource', '未体验资源']
];

function scopeOptions(scope) {
  if (scope === 'category') return data.categories.map((c) => [c.id, c.name]);
  if (scope === 'topic') return data.topics.map((t) => [t.id, t.title]);
  if (scope === 'tag') return data.tags.map((t) => [t.id, '#' + t.name]);
  if (scope === 'creator') return data.creators.filter((c) => !c.deletedAt).map((c) => [c.id, c.name]);
  if (scope === 'series') return data.series.map((x) => [x.id, x.name]);
  return [];
}

function candidates(scope) {
  const st = ui.discScope || { kind: 'wish', id: '', type: 'all', tag: '' };
  let pool = liveWorks();
  if (st.kind === 'wish') pool = pool.filter((w) => ['wish', 'todo'].indexOf(bucketOf(w)) >= 0);
  else if (st.kind === 'category') pool = pool.filter((w) => w.categoryId === st.id);
  else if (st.kind === 'topic') {
    const t = data.topics.find((x) => x.id === st.id);
    pool = pool.filter((w) => t && (t.workIds || []).indexOf(w.id) >= 0);
  } else if (st.kind === 'tag') pool = pool.filter((w) => (w.tagIds || []).indexOf(st.id) >= 0);
  else if (st.kind === 'creator') {
    const ids = new Set(data.workCreators.filter((x) => x.creatorId === st.id).map((x) => x.workId));
    pool = pool.filter((w) => ids.has(w.id));
  } else if (st.kind === 'series') {
    const sr = data.series.find((x) => x.id === st.id);
    pool = pool.filter((w) => sr && (sr.workIds || []).indexOf(w.id) >= 0);
  } else if (st.kind === 'resource') {
    const ids = new Set(data.resources.filter((r) => !r.deletedAt).map((r) => r.workId));
    pool = pool.filter((w) => ids.has(w.id) && bucketOf(w) !== 'done');
  }
  if (st.type && st.type !== 'all') pool = pool.filter((w) => w.type === st.type);
  if (st.tag) pool = pool.filter((w) => (w.tagIds || []).indexOf(st.tag) >= 0);
  return pool;
}

function tagNamesOf(w) {
  return (w.tagIds || []).map((id) => {
    const t = data.tags.find((x) => x.id === id);
    return t ? t.name : '';
  }).filter(Boolean);
}

export function discoverView() {
  const st = ui.discScope || { kind: 'wish', id: '', type: 'all', tag: '' };
  const pool = candidates();
  const picked = ui.discPick ? pool.find((w) => w.id === ui.discPick) : null;
  const opts = scopeOptions(st.kind);

  let html = '<header class="page-head">' +
    '<div class="head-left"><button class="icon-btn" data-action="back" aria-label="返回">' + icon('back', 20) + '</button>' +
    '<div><p class="eyebrow">发现 · ' + pool.length + ' 个候选</p><h1 class="page-title">今天看什么</h1></div></div></header>';

  html += '<div class="row-flex" style="gap:8px;margin-bottom:10px">' +
    '<select class="select" data-change="disc-scope" style="flex:1;min-height:36px">' +
    SCOPES.map((x) => '<option value="' + x[0] + '"' + (st.kind === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select>' +
    (opts.length ? '<select class="select" data-change="disc-target" style="flex:1;min-height:36px">' +
      opts.map((o) => '<option value="' + o[0] + '"' + (st.id === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>' : '') +
    '</div>';

  html += '<div class="row-flex" style="gap:8px;margin-bottom:16px">' +
    '<select class="select" data-change="disc-type" style="flex:1;min-height:34px"><option value="all">全部类型</option>' +
    TYPES.filter((t) => liveWorks().some((w) => w.type === t.id)).map((t) =>
      '<option value="' + t.id + '"' + (st.type === t.id ? ' selected' : '') + '>' + esc(t.label) + '</option>').join('') + '</select>' +
    '<select class="select" data-change="disc-tag" style="flex:1;min-height:34px"><option value="">全部标签</option>' +
    data.tags.map((t) => '<option value="' + t.id + '"' + (st.tag === t.id ? ' selected' : '') + '>#' + esc(t.name) + '</option>').join('') + '</select>' +
    '</div>';

  if (!pool.length) {
    return html + emptyState('·', '没有可以抽的', '先去档案馆加几部想看的。',
      '<button class="btn btn-primary btn-sm" data-action="new-work">＋ 添加作品</button>');
  }

  if (picked) {
    const cover = coverUrl(picked);
    const d = detailsOf(picked.id);
    html += '<section class="disc-card">' +
      '<span class="disc-art" style="--cc:' + coverColor(picked.title) + '">' +
      (cover ? '<img src="' + esc(cover) + '" alt="">' : '<b>' + esc(initials(picked.title)) + '</b>') + '</span>' +
      '<h2 class="disc-title">' + esc(picked.title) + '</h2>' +
      '<p class="disc-sub">' + esc([typeDef(picked.type).label, picked.creator, picked.year].filter(Boolean).join(' · ')) + '</p>' +
      (d.summary ? '<p class="disc-sum">' + esc(d.summary) + '</p>' : '') +
      '<div class="disc-actions">' +
      '<button class="btn btn-ghost btn-sm" data-action="disc-roll">换一个</button>' +
      '<button class="btn btn-ghost btn-sm" data-action="disc-start" data-id="' + picked.id + '">开始体验</button>' +
      '<button class="btn btn-primary btn-sm" data-action="open-work" data-id="' + picked.id + '">看档案</button>' +
      '</div></section>';
  } else {
    html += '<div class="disc-empty"><p class="muted">按一下，从 ' + pool.length + ' 部里随机挑一部。</p>' +
      '<button class="btn btn-primary" data-action="disc-roll">' + icon('spark', 16) + ' 抽一部</button></div>';
  }

  html += recommendPanel();
  return html;
}

/* ---------------- 9.4 规则推荐 ---------------- */

function recommendPanel() {
  const works = liveWorks();
  const rated = works.filter((w) => w.rating >= 8);
  const tagScore = {};
  rated.forEach((w) => {
    tagNamesOf(w).forEach((t) => { tagScore[t] = (tagScore[t] || 0) + w.rating; });
  });
  const topTags = Object.keys(tagScore).sort((a, b) => tagScore[b] - tagScore[a]).slice(0, 3);

  const seen = new Set();
  const rows = [];

  /* 规则一：和你高分作品同标签，但还没看 */
  works.filter((w) => !w.rating && ['wish', 'todo'].indexOf(bucketOf(w)) >= 0).forEach((w) => {
    const hit = tagNamesOf(w).filter((t) => topTags.indexOf(t) >= 0);
    if (hit.length && rows.length < 6 && !seen.has(w.id)) {
      seen.add(w.id);
      rows.push({ w, reason: '和你偏爱的标签「' + hit.join('、') + '」一致' });
    }
  });

  /* 规则二：同创作者，你给过高分 */
  const favCreators = {};
  rated.forEach((w) => { if (w.creator) favCreators[w.creator] = (favCreators[w.creator] || 0) + 1; });
  Object.keys(favCreators).sort((a, b) => favCreators[b] - favCreators[a]).slice(0, 3).forEach((c) => {
    works.filter((w) => w.creator === c && !w.rating).forEach((w) => {
      if (rows.length < 8 && !seen.has(w.id)) {
        seen.add(w.id);
        rows.push({ w, reason: '你给「' + c + '」的作品打过高分' });
      }
    });
  });

  /* 规则三：同类型里评分最高但你还没看 */
  const byType = {};
  works.filter((w) => w.rating >= 8.5).forEach((w) => {
    byType[w.type] = byType[w.type] || [];
    byType[w.type].push(w);
  });

  let html = '<section class="section" style="margin-top:26px"><div class="section-head">' +
    '<h2 class="section-title">基于你的记录</h2><span class="section-note">本地规则，不联网</span></div>';

  if (!rows.length) {
    return html + '<p class="muted" style="font-size:12.5px;line-height:1.8">' +
      (rated.length ? '暂时没有可推荐的：同标签、同作者的作品你都看过了。' : '先给几部作品打分，这里会按你的口味推荐。') + '</p></section>';
  }

  html += '<div class="rows">' + rows.map((x) => {
    const cover = coverUrl(x.w);
    return '<button class="rowitem" data-action="open-work" data-id="' + x.w.id + '">' +
      '<span class="cover" style="--cc:' + coverColor(x.w.title) + ';width:36px;flex:0 0 36px">' +
      (cover ? '<img src="' + esc(cover) + '" alt="">' : '<b>' + esc(initials(x.w.title)) + '</b>') + '</span>' +
      '<span class="rowitem-main"><b>' + esc(x.w.title) + '</b><i>' + esc(x.reason) + '</i></span>' +
      icon('right', 15) + '</button>';
  }).join('') + '</div></section>';

  return html;
}

export const actions = {
  'disc-scope': (el) => {
    const kind = el.dataset.value;
    const opts = scopeOptions(kind);
    ui.discScope = { kind, id: opts.length ? opts[0][0] : '', type: 'all', tag: '' };
    ui.discPick = '';
    go('#/discover');
  },
  'disc-target': (el) => {
    ui.discScope = Object.assign({ kind: 'wish', id: '', type: 'all', tag: '' }, ui.discScope || {}, { id: el.value });
    ui.discPick = '';
    go('#/discover');
  },
  'disc-type': (el) => {
    ui.discScope = Object.assign({ kind: 'wish', id: '', type: 'all', tag: '' }, ui.discScope || {}, { type: el.value });
    ui.discPick = '';
    go('#/discover');
  },
  'disc-tag': (el) => {
    ui.discScope = Object.assign({ kind: 'wish', id: '', type: 'all', tag: '' }, ui.discScope || {}, { tag: el.value });
    ui.discPick = '';
    go('#/discover');
  },
  'disc-roll': () => {
    const pool = candidates();
    if (!pool.length) { toast('没有候选'); return; }
    ui.discSeen = ui.discSeen || [];
    const fresh = pool.filter((w) => ui.discSeen.indexOf(w.id) < 0);
    const from = fresh.length ? fresh : pool;
    const pick = from[Math.floor(Math.random() * from.length)];
    ui.discPick = pick.id;
    ui.discSeen = [pick.id].concat(ui.discSeen.filter((x) => x !== pick.id)).slice(0, 5);
    go('#/discover');
  },
  'disc-start': async (el) => {
    const id = el.dataset.id;
    const res = await saveExperience({
      workId: id, experienceType: '首次', status: 'doing',
      startDate: new Date().toISOString().slice(0, 10), endDate: '', progress: {}, rating: 0, note: ''
    });
    if (!res.ok) { toast('创建记录失败', 'error'); return; }
    toast('已开始体验');
    go('#/work/' + id);
  }
};
