/* ==========================================================
   次元簿 · 音乐中心（说明书 6.4）
   三个部分：收藏榜单、年度收听统计、歌单。
   统计只来自曲目、会话与完成记录，不做任何补造。
   ========================================================== */

import {
  data, liveWorks, getWork, playlists, playlistTracks, musicYears, musicYearStats,
  trackStats, tracksOf, coverUrl, finishedDate
} from '../core/repo.js';
import { typeDef } from '../core/schema.js';
import { ui, go } from '../core/state.js';
import { icon, toast, openModal, confirmDialog, emptyState } from '../core/ui.js';
import { esc, ratingShort, initials, coverColor } from '../core/format.js';
import { mmss } from './tracks.js';

function audioWorks() {
  return liveWorks().filter((w) => typeDef(w.type).group === 'audio' && typeDef(w.type).mode !== 'series');
}

function allTracks() {
  return data.tracks.slice();
}

export function musicView() {
  const tab = (['rank', 'year', 'playlists'].indexOf(ui.route.id) >= 0) ? ui.route.id : (ui.musicTab || 'rank');
  let html = '<header class="page-head">' +
    '<div class="head-left"><button class="icon-btn" data-action="back" aria-label="返回">' + icon('back', 20) + '</button>' +
    '<div><p class="eyebrow">音乐 · ' + audioWorks().length + ' 张专辑</p><h1 class="page-title">音乐中心</h1></div></div></header>';

  html += '<div class="segbar" style="margin-bottom:16px">' +
    [['rank', '收藏榜单'], ['year', '年度收听'], ['playlists', '歌单']]
      .map((t) => '<button class="' + (tab === t[0] ? 'is-on' : '') + '" data-action="music-tab" data-value="' + t[0] + '">' + t[1] + '</button>').join('') +
    '</div>';

  if (tab === 'rank') return html + rankPanel();
  if (tab === 'year') return html + yearPanel();
  return html + playlistsPanel();
}

/* ---------------- 榜单 ---------------- */

function rankPanel() {
  const albums = audioWorks();
  const ranked = albums.slice().sort((a, b) => (b.rating || 0) - (a.rating || 0) ||
    (trackStats(b.id).favs - trackStats(a.id).favs) || String(b.updatedAt).localeCompare(String(a.updatedAt)));

  const artists = {};
  albums.forEach((w) => {
    const k = String(w.creator || '未标注').trim() || '未标注';
    const a = artists[k] = artists[k] || { name: k, count: 0, sum: 0, rated: 0 };
    a.count += 1;
    if (w.rating) { a.sum += Number(w.rating); a.rated += 1; }
  });
  const artistRank = Object.keys(artists).map((k) => {
    const a = artists[k];
    return { name: k, count: a.count, avg: a.rated ? Math.round(a.sum / a.rated * 10) / 10 : 0 };
  }).sort((a, b) => b.avg - a.avg || b.count - a.count).slice(0, 10);

  const favTracks = allTracks().filter((t) => t.fav).map((t) => {
    const w = getWork(t.workId);
    return w ? { t, w } : null;
  }).filter(Boolean);

  let html = '<p class="fan-hint">榜单只看你自己打的分与标记，不参考任何外部流行度。</p>';

  if (!albums.length) {
    return html + emptyState('·', '还没有音乐档案', '建一张专辑，录几首曲目，榜单就会有内容。',
      '<button class="btn btn-primary btn-sm" data-action="new-work" data-value="album">＋ 添加专辑</button>');
  }

  html += '<section class="section"><div class="section-head"><h2 class="section-title">专辑榜</h2>' +
    '<span class="section-note">' + albums.length + ' 张</span></div>' +
    '<div class="rows">' + ranked.slice(0, 12).map((w, i) => {
      const st = trackStats(w.id);
      const cover = coverUrl(w);
      return '<button class="rowitem" data-action="open-work" data-id="' + w.id + '">' +
        '<span class="rowitem-n">' + (i + 1) + '</span>' +
        '<span class="rank-art" style="--cc:' + coverColor(w.title) + '">' +
        (cover ? '<img src="' + esc(cover) + '" alt="">' : esc(initials(w.title))) + '</span>' +
        '<span class="rowitem-main"><b>' + esc(w.title) + '</b>' +
        '<i>' + esc([w.creator, w.year, st.total ? st.total + ' 首' : '', st.favs ? '喜欢 ' + st.favs : ''].filter(Boolean).join(' · ')) + '</i></span>' +
        '<span class="rowitem-side">' + (w.rating ? '<span class="badge is-gold">★ ' + ratingShort(w.rating) + '</span>' : '') + '</span></button>';
    }).join('') + '</div></section>';

  html += '<section class="section"><div class="section-head"><h2 class="section-title">歌手 / 演奏者</h2>' +
    '<span class="section-note">按平均分</span></div>' +
    '<div class="rows">' + artistRank.map((a) => '<div class="rowitem is-static">' +
      '<span class="rowitem-main"><b>' + esc(a.name) + '</b><i>' + a.count + ' 张专辑</i></span>' +
      '<span class="rowitem-side">' + (a.avg ? '<span class="badge is-gold">★ ' + a.avg + '</span>' : '') + '</span></div>').join('') +
    '</div></section>';

  html += '<section class="section"><div class="section-head"><h2 class="section-title">收藏曲目</h2>' +
    '<span class="section-note">' + favTracks.length + ' 首</span></div>' +
    (favTracks.length
      ? '<div class="rows">' + favTracks.slice(0, 20).map((x) => '<button class="rowitem" data-action="open-work" data-id="' + x.w.id + '">' +
        '<span class="row-icon">' + icon('music', 15) + '</span>' +
        '<span class="rowitem-main"><b>' + esc(x.t.title) + '</b><i>' + esc(x.w.title) + (x.t.duration ? ' · ' + mmss(x.t.duration) : '') + '</i></span>' +
        '<span class="rowitem-side"><span class="trk-heart is-on">★</span></span></button>').join('') + '</div>'
      : '<p class="muted" style="font-size:12.5px">在专辑里点曲目右侧的星标，就会出现在这里。</p>') +
    '</section>';

  return html;
}

/* ---------------- 年度收听 ---------------- */

function yearPanel() {
  const years = musicYears();
  const year = ui.musicYear && years.indexOf(String(ui.musicYear)) >= 0 ? String(ui.musicYear) : years[0];
  const s = musicYearStats(year);

  let html = '<div class="chips" style="margin-bottom:14px">' + years.slice(0, 10).map((y) =>
    '<button class="chip' + (String(year) === y ? ' is-on' : '') + '" data-action="music-year" data-value="' + y + '">' + y + ' 年</button>').join('') +
    '</div>';

  html += '<div class="stat-grid" style="margin-bottom:16px">' +
    '<div class="stat"><b>' + (s.hours || 0) + '</b><span>累计小时</span></div>' +
    '<div class="stat"><b>' + s.albums + '</b><span>听完专辑</span></div>' +
    '<div class="stat"><b>' + s.sessions + '</b><span>收听记录</span></div>' +
    '<div class="stat"><b>' + s.released + '</b><span>本年发行</span></div>' +
    '</div>';

  if (!s.hours && !s.albums && !s.sessions) {
    html += emptyState('·', year + ' 年还没有收听数据', '在专辑详情里「记一次收听」，或把状态改为已听过，统计就会自动出现。');
  } else {
    if (s.topArtist) {
      html += '<div class="card" style="margin-bottom:16px"><p class="eyebrow">最常听</p>' +
        '<p style="font-size:17px;margin-top:4px">' + esc(s.topArtist) + '</p>' +
        '<p class="muted" style="font-size:12px;margin-top:4px">按本年度听完的专辑数统计。</p></div>';
    }
    if (s.byArtist && Object.keys(s.byArtist).length) {
      const max = Math.max.apply(null, Object.keys(s.byArtist).map((k) => s.byArtist[k]));
      html += '<section class="section"><div class="section-head"><h2 class="section-title">听过谁</h2></div><div class="radar">' +
        Object.keys(s.byArtist).sort((a, b) => s.byArtist[b] - s.byArtist[a]).slice(0, 8).map((k) =>
          '<div class="radar-row"><span>' + esc(k) + '</span><span class="radar-track"><i style="width:' +
          Math.round(s.byArtist[k] / max * 100) + '%"></i></span><b>' + s.byArtist[k] + '</b></div>').join('') +
        '</div></section>';
    }
    if (s.top.length) {
      html += '<section class="section"><div class="section-head"><h2 class="section-title">年度专辑</h2>' +
        '<span class="section-note">按你的评分</span></div><div class="rows">' +
        s.top.map((w) => '<button class="rowitem" data-action="open-work" data-id="' + w.id + '">' +
          '<span class="rowitem-main"><b>' + esc(w.title) + '</b><i>' + esc([w.creator, finishedDate(w)].filter(Boolean).join(' · ')) + '</i></span>' +
          '<span class="rowitem-side">' + (w.rating ? '<span class="badge is-gold">★ ' + ratingShort(w.rating) + '</span>' : '') + '</span></button>').join('') +
        '</div></section>';
    }
    if (s.favTracks.length) {
      html += '<section class="section"><div class="section-head"><h2 class="section-title">常听的曲子</h2></div><div class="rows">' +
        s.favTracks.map((x) => '<div class="rowitem is-static"><span class="row-icon">' + icon('music', 15) + '</span>' +
          '<span class="rowitem-main"><b>' + esc(x.track.title) + '</b><i>' + esc(x.work.title) + '</i></span></div>').join('') +
        '</div></section>';
    }
  }

  html += '<p class="muted" style="font-size:11.5px">统计口径：会话记录的分钟数按日期归年；专辑按完成日期归年。没有记录就是 0，不会估算。</p>';
  return html;
}

/* ---------------- 歌单 ---------------- */

function playlistsPanel() {
  const list = playlists.list();
  let html = '<p class="fan-hint">歌单只引用已有曲目，不复制；换专辑里的曲名会同步更新。</p>' +
    '<div class="row-flex" style="margin-bottom:14px"><button class="btn btn-primary btn-sm" data-action="pl-new">＋ 新建歌单</button></div>';

  if (!list.length) {
    return html + emptyState('·', '还没有歌单', '比如「深夜通勤」「写作背景」「年度十佳」。');
  }

  return html + '<div class="rows">' + list.map((pl) => {
    const ts = playlistTracks(pl);
    const secs = ts.reduce((a, t) => a + (Number(t.duration) || 0), 0);
    return '<button class="rowitem" data-action="pl-edit" data-id="' + pl.id + '">' +
      '<span class="row-icon">' + icon('music2', 16) + '</span>' +
      '<span class="rowitem-main"><b>' + esc(pl.name) + '</b>' +
      '<i>' + esc([ts.length + ' 首', secs ? Math.round(secs / 60) + ' 分钟' : '', pl.desc].filter(Boolean).join(' · ')) + '</i></span>' +
      icon('right', 15) + '</button>';
  }).join('') + '</div>';
}

function plEditor(id) {
  const cur = id ? playlists.get(id) : null;
  const d = cur ? Object.assign({}, cur, { trackIds: (cur.trackIds || []).slice() }) : { id: '', name: '', desc: '', trackIds: [] };

  const albums = audioWorks();
  const rows = albums.map((w) => {
    const ts = tracksOf(w.id);
    if (!ts.length) return '';
    return '<p class="pl-group">' + esc(w.title) + '</p>' + ts.map((t) =>
      '<label class="pl-row"><input type="checkbox" data-track="' + t.id + '"' + (d.trackIds.indexOf(t.id) >= 0 ? ' checked' : '') + '>' +
      '<span>' + esc(t.title) + '</span><i>' + (t.duration ? mmss(t.duration) : '') + '</i></label>').join('');
  }).join('');

  openModal({
    title: cur ? '编辑歌单' : '新建歌单',
    wide: true,
    body: '<div>' +
      '<label class="field"><span class="field-label">名称</span><input class="input" id="pl-name" value="' + esc(d.name) + '"></label>' +
      '<label class="field"><span class="field-label">说明</span><input class="input" id="pl-desc" value="' + esc(d.desc) + '" placeholder="什么时候听"></label>' +
      '<p class="field-label" style="margin:12px 0 6px">选择曲目</p>' +
      (rows ? '<div class="pl-pick">' + rows + '</div>' : '<p class="muted" style="font-size:12.5px">还没有任何曲目，先去专辑里录入。</p>') +
      '</div>',
    actions: [{ label: '取消', value: null, variant: 'ghost' },
      ...(cur ? [{ label: '删除', value: 'del', variant: 'danger' }] : []),
      { label: '保存', value: 'ok', variant: 'primary' }]
  }).then(async (v) => {
    if (v === 'del' && cur) {
      const ok = await confirmDialog({ title: '删除歌单？', desc: '只会删歌单，曲目本身不受影响。', confirmText: '删除', danger: true });
      if (!ok) return;
      await playlists.hardRemove(cur.id);
      toast('已删除');
      go('#/music/playlists');
      return;
    }
    if (v !== 'ok') return;
    const name = (document.getElementById('pl-name') || {}).value || '';
    if (!name.trim()) { toast('歌单名称不能为空'); return; }
    d.name = name.trim();
    d.desc = (document.getElementById('pl-desc') || {}).value || '';
    d.trackIds = [...document.querySelectorAll('.pl-pick [data-track]')].filter((el) => el.checked).map((el) => el.dataset.track);
    const res = await playlists.save(d);
    if (!res.ok) { toast(res.error || '保存失败', 'error'); return; }
    toast('已保存');
    go('#/music/playlists');
  });
}

export const actions = {
  'music-tab': (el) => { ui.musicTab = el.dataset.value; go('#/music/' + el.dataset.value); },
  'music-year': (el) => { ui.musicYear = el.dataset.value; go('#/music/year'); },
  'pl-new': () => plEditor(null),
  'pl-edit': (el) => plEditor(el.dataset.id)
};
