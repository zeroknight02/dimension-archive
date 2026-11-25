/* ==========================================================
   次元簿 · 曲目单（说明书 6.4）
   专辑详情里的曲目表：序号、曲名、时长、喜爱、单曲评分、跳过标记。
   歌单在音乐中心维护，曲目本身只属于专辑。
   ========================================================== */

import { tracks, tracksOf, trackStats } from '../core/repo.js';
import { go } from '../core/state.js';
import { toast, openModal, confirmDialog } from '../core/ui.js';
import { esc } from '../core/format.js';

export function mmss(sec) {
  const n = Number(sec) || 0;
  const m = Math.floor(n / 60);
  const s = Math.round(n % 60);
  return m + ':' + String(s).padStart(2, '0');
}


function parseDuration(text) {
  const s = String(text || '').trim();
  if (!s) return 0;
  if (/^\d+$/.test(s)) return Number(s);
  const m = s.match(/^(\d+)\s*[:：]\s*(\d{1,2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const m2 = s.match(/^(\d+)\s*分\s*(\d{1,2})\s*秒?$/);
  if (m2) return Number(m2[1]) * 60 + Number(m2[2]);
  return 0;
}

export function tracksSection(w) {
  const list = tracksOf(w.id);
  const st = trackStats(w.id);

  let html = '<section class="section"><div class="section-head"><h2 class="section-title">曲目</h2>' +
    '<div class="row-flex" style="gap:6px">' +
    '<button class="btn btn-ghost btn-xs" data-action="trk-bulk" data-id="' + w.id + '">批量录入</button>' +
    '<button class="btn btn-ghost btn-xs" data-action="trk-new" data-id="' + w.id + '">＋ 单曲</button>' +
    '</div></div>';

  if (!list.length) {
    return html + '<p class="muted" style="font-size:12.5px">还没有曲目。粘贴歌词页或唱片背面的曲目单，一行一首即可。</p></section>';
  }

  html += '<p class="trk-sum">共 ' + st.total + ' 首' +
    (st.seconds ? ' · ' + Math.round(st.seconds / 60) + ' 分钟' : '') +
    (st.favs ? ' · 喜欢 ' + st.favs + ' 首' : '') +
    (st.avg ? ' · 平均 ' + st.avg + ' 分' : '') + '</p>';

  html += '<div class="trk-list">' + list.map((t, i) => {
    return '<div class="trk-row' + (t.fav ? ' is-fav' : '') + (t.skip ? ' is-skip' : '') + '">' +
      '<span class="trk-no">' + (t.disc > 1 ? t.disc + '-' : '') + (t.no || i + 1) + '</span>' +
      '<button class="trk-main" data-action="trk-edit" data-id="' + t.id + '">' +
      '<b>' + esc(t.title) + (t.skip ? '<i class="trk-tag">常跳过</i>' : '') + '</b>' +
      (t.artist ? '<i>' + esc(t.artist) + '</i>' : '') + '</button>' +
      '<span class="trk-dur">' + (t.duration ? mmss(t.duration) : '—') + '</span>' +
      '<button class="trk-heart' + (t.fav ? ' is-on' : '') + '" data-action="trk-fav" data-id="' + t.id + '" aria-label="喜欢">' +
      (t.fav ? '★' : '☆') + '</button>' +
      '</div>';
  }).join('') + '</div></section>';

  return html;
}

function trkEditor(workId, id) {
  const cur = id ? tracks.get(id) : null;
  const list = tracksOf(workId);
  const nextNo = list.reduce((a, t) => Math.max(a, t.no || 0), 0) + 1;
  const d = cur ? Object.assign({}, cur) : {
    id: '', workId, disc: 1, no: nextNo, title: '', artist: '', duration: 0, fav: false, rating: 0, skip: false, note: ''
  };

  openModal({
    title: cur ? '编辑曲目' : '添加曲目',
    body: '<div>' +
      '<label class="field"><span class="field-label">曲名</span><input class="input" id="trk-title" value="' + esc(d.title) + '"></label>' +
      '<div class="row2"><label class="field"><span class="field-label">碟号</span><input class="input" type="number" id="trk-disc" value="' + esc(d.disc || 1) + '"></label>' +
      '<label class="field"><span class="field-label">序号</span><input class="input" type="number" id="trk-no" value="' + esc(d.no || nextNo) + '"></label></div>' +
      '<div class="row2"><label class="field"><span class="field-label">时长（分:秒）</span><input class="input" id="trk-dur" value="' + esc(d.duration ? mmss(d.duration) : '') + '" placeholder="3:45"></label>' +
      '<label class="field"><span class="field-label">表演者（如与专辑不同）</span><input class="input" id="trk-artist" value="' + esc(d.artist) + '"></label></div>' +
      '<label class="field"><span class="field-label">单曲评分</span><select class="select" id="trk-rating">' +
      '<option value="0">不评分</option>' + [10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((v) =>
        '<option value="' + v + '"' + (Number(d.rating) === v ? ' selected' : '') + '>' + v + ' 分</option>').join('') + '</select></label>' +
      '<label class="switch" style="margin-bottom:8px"><input type="checkbox" id="trk-fav"' + (d.fav ? ' checked' : '') + '><i></i><span>喜欢这首</span></label>' +
      '<label class="switch" style="margin-bottom:8px"><input type="checkbox" id="trk-skip"' + (d.skip ? ' checked' : '') + '><i></i><span>通常跳过</span></label>' +
      (cur ? '<button type="button" class="btn btn-danger btn-sm" data-action="trk-del" data-id="' + cur.id + '">删除这首</button>' : '') +
      '</div>',
    actions: [{ label: '取消', value: null, variant: 'ghost' }, { label: '保存', value: 'ok', variant: 'primary' }],
    onMount: (root) => {
      root.querySelector('#trk-fav').addEventListener('change', (e) => { d.fav = e.target.checked; });
      root.querySelector('#trk-skip').addEventListener('change', (e) => { d.skip = e.target.checked; });
    }
  }).then(async (v) => {
    if (v !== 'ok') return;
    const val = (x) => { const el = document.getElementById(x); return el ? el.value : ''; };
    d.title = val('trk-title').trim();
    if (!d.title) { toast('曲名不能为空'); return; }
    d.disc = Number(val('trk-disc')) || 1;
    d.no = Number(val('trk-no')) || nextNo;
    d.duration = parseDuration(val('trk-dur'));
    d.artist = val('trk-artist');
    d.rating = Number(val('trk-rating')) || 0;
    const res = await tracks.save(d);
    if (!res.ok) { toast(res.error || '保存失败', 'error'); return; }
    toast('已保存');
    go('#/work/' + workId);
  });
}

function trkBulk(workId) {
  openModal({
    title: '批量录入曲目',
    desc: '一行一首。支持「曲名 3:45」「1. 曲名 3:45」「曲名 | 3:45 | 表演者」三种写法。',
    wide: true,
    body: '<label class="field"><span class="field-label">曲目单</span>' +
      '<textarea class="textarea" id="trk-lines" rows="10" placeholder="1. 晴天 4:29&#10;2. 七里香 4:59&#10;3. 夜曲 | 3:46 | 周杰伦"></textarea></label>',
    actions: [{ label: '取消', value: null, variant: 'ghost' }, { label: '导入', value: 'ok', variant: 'primary' }]
  }).then(async (v) => {
    if (v !== 'ok') return;
    const el = document.getElementById('trk-lines');
    const lines = String(el ? el.value : '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    let n = 0;
    let no = tracksOf(workId).length;
    for (const line of lines) {
      let parts = line.split(/[|｜\t]/).map((x) => x.trim()).filter(Boolean);
      if (parts.length === 1) {
        /* 「1. 曲名 3:45」或「曲名 3:45」 */
        const m = parts[0].match(/^(\d+)[.、)]\s*(.+?)(?:\s+(\d{1,2}[:：]\d{2}))?$/);
        if (m) parts = [m[2], m[3] || ''];
        else {
          const m2 = parts[0].match(/^(.+?)\s+(\d{1,2}[:：]\d{2})$/);
          if (m2) parts = [m2[1], m2[2]];
        }
      }
      const title = String(parts[0] || '').replace(/^\d+[.、)]\s*/, '').trim();
      if (!title) continue;
      no += 1;
      const res = await tracks.save({
        id: '', workId, disc: 1, no,
        title,
        duration: parseDuration(parts[1] || ''),
        artist: parts[2] || '',
        fav: false, rating: 0, skip: false, note: ''
      });
      if (res.ok) n++;
    }
    toast('已导入 ' + n + ' 首');
    go('#/work/' + workId);
  });
}

export const actions = {
  'trk-new': (el) => trkEditor(el.dataset.id, null),
  'trk-edit': (el) => {
    const t = tracks.get(el.dataset.id);
    if (t) trkEditor(t.workId, t.id);
  },
  'trk-bulk': (el) => trkBulk(el.dataset.id),
  'trk-fav': async (el) => {
    const t = tracks.get(el.dataset.id);
    if (!t) return;
    await tracks.save(Object.assign({}, t, { fav: !t.fav }));
    go('#/work/' + t.workId);
  },
  'trk-del': async (el) => {
    const t = tracks.get(el.dataset.id);
    if (!t) return;
    const ok = await confirmDialog({ title: '删除这首曲目？', confirmText: '删除', danger: true });
    if (!ok) return;
    await tracks.hardRemove(t.id);
    const m = document.querySelector('.modal-backdrop.is-on');
    if (m) m.remove();
    toast('已删除');
    go('#/work/' + t.workId);
  }
};
