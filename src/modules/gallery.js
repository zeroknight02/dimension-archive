/* ==========================================================
   次元簿 · 收藏展馆与输出（11.1 - 11.4）
   11.1 展馆：把高分与高时长的作品摆成一面墙
   11.2 3D 书架：CSS 透视书架，可旋转视角
   11.3 自定义主页：选择首页显示哪些区块
   11.4 专题导出：把专题排成一张图或一段 HTML
   ========================================================== */

import { data, liveWorks, detailsOf, experiencesOf, coverUrl, getWork, topics, setting, saveSetting } from '../core/repo.js';
import { typeDef } from '../core/schema.js';
import { ui, go } from '../core/state.js';
import { icon, toast, emptyState, confirmDialog } from '../core/ui.js';
import { esc, initials, coverColor, ratingShort } from '../core/format.js';
import { downloadBlob } from '../core/backup.js';

function hoursOf(w) {
  let h = 0;
  experiencesOf(w.id).forEach((e) => { if (e.progress && e.progress.hours) h += Number(e.progress.hours) || 0; });
  if (!h) h = Number(detailsOf(w.id).playTime) || 0;
  return h;
}

export function galleryView() {
  const tab = (['hall', 'shelf3d', 'home', 'export'].indexOf(ui.route.id) >= 0) ? ui.route.id : (ui.galleryTab || 'hall');
  let html = '<header class="page-head">' +
    '<div class="head-left"><button class="icon-btn" data-action="back" aria-label="返回">' + icon('back', 20) + '</button>' +
    '<div><p class="eyebrow">展馆 · ' + liveWorks().length + ' 件藏品</p><h1 class="page-title">收藏展馆</h1></div></div>' +
    '</header>';

  html += '<div class="segbar" style="margin-bottom:16px">' +
    [['hall', '精选墙'], ['shelf3d', '3D 书架'], ['home', '主页布局'], ['export', '专题输出']]
      .map((t) => '<button class="' + (tab === t[0] ? 'is-on' : '') + '" data-action="gal-tab" data-value="' + t[0] + '">' + t[1] + '</button>').join('') +
    '</div>';

  if (tab === 'hall') return html + hallPanel();
  if (tab === 'shelf3d') return html + shelf3dPanel();
  if (tab === 'home') return html + homeLayoutPanel();
  return html + exportPanel();
}

/* ---------------- 11.1 精选墙 ---------------- */

function hallPanel() {
  const rated = liveWorks().filter((w) => w.rating > 0).sort((a, b) => b.rating - a.rating).slice(0, 12);
  if (!rated.length) {
    return emptyState('·', '展馆还没有展品', '给作品打分后，高分作品会自动挂到这面墙上。',
      '<button class="btn btn-primary btn-sm" data-action="go" data-to="#/works">去档案馆</button>');
  }
  const cover = (w) => coverUrl(w);

  const view = ui.hallView || 'wall';
  const head = '<p class="fan-hint">按评分自动布展，不需要手工挑。</p>' +
    '<div class="chips" style="margin-bottom:12px">' +
    [['wall', '封面墙'], ['grid', '网格'], ['list', '列表']].map((v) =>
      '<button class="chip' + (view === v[0] ? ' is-on' : '') + '" data-action="hall-view" data-value="' + v[0] + '">' + v[1] + '</button>').join('') +
    (view === 'wall' ? '<button class="chip" data-action="hall-density">密度：' + (ui.hallDense ? '紧凑' : '舒展') + '</button>' : '') +
    '</div>';

  if (view === 'list') {
    return head + '<div class="rows">' + rated.map((w) => '<button class="rowitem" data-action="open-work" data-id="' + w.id + '">' +
      '<span class="hall-rate" style="position:static;margin-right:6px">★ ' + ratingShort(w.rating) + '</span>' +
      '<span class="rowitem-main"><b>' + esc(w.title) + '</b><i>' +
      esc([typeDef(w.type).label, w.year].filter(Boolean).join(' · ')) + '</i></span>' + icon('right', 15) + '</button>').join('') + '</div>';
  }

  const cls = view === 'grid' ? 'hall is-grid' : 'hall' + (ui.hallDense ? ' is-dense' : '');
  return head + '<div class="' + cls + '">' + rated.map((w, i) => {
      const c = cover(w);
      return '<button class="hall-item r' + (i % 4) + '" data-action="open-work" data-id="' + w.id + '">' +
        '<span class="hall-art" style="--cc:' + coverColor(w.title) + '">' +
        (c ? '<img src="' + esc(c) + '" alt="" loading="lazy">' : '<b>' + esc(initials(w.title)) + '</b>') +
        '<span class="hall-rate">★ ' + ratingShort(w.rating) + '</span></span>' +
        '<span class="hall-cap">' + esc(w.title) + '</span>' +
        '<span class="hall-sub">' + esc([typeDef(w.type).label, w.year].filter(Boolean).join(' · ')) + '</span></button>';
    }).join('') + '</div>';
}

/* ---------------- 11.2 3D 书架 ---------------- */

function shelf3dPanel() {
  const works = liveWorks().slice().sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 16);
  if (!works.length) return emptyState('·', '书架是空的', '添加作品后，这里会立起一排书。');

  return '<p class="fan-hint">把鼠标移到书上会微微前倾；点「转视角」可以看侧面。</p>' +
    '<div class="shelf3d-wrap"><div class="shelf3d" id="shelf3d">' +
    '<div class="shelf3d-row">' + works.map((w) => {
      const t = typeDef(w.type);
      return '<button class="b3d" data-action="open-work" data-id="' + w.id + '" style="--bc:' + t.color + ';--h:' + (150 + Math.min(70, (Number(detailsOf(w.id).pages) || 200) / 6)) + 'px">' +
        '<span class="b3d-face"><span class="b3d-title">' + esc(w.title) + '</span></span>' +
        '<span class="b3d-side"></span></button>';
    }).join('') + '</div><div class="shelf3d-board"></div></div></div>' +
    '<div class="row-flex" style="justify-content:center;margin-top:14px">' +
    '<button class="btn btn-ghost btn-sm" data-action="gal-rotate">转视角</button></div>';
}

/* ---------------- 11.3 自定义主页 ---------------- */

const HOME_SECTIONS = [
  { key: 'hero', label: '作品规模与完成率' },
  { key: 'quick', label: '快捷操作' },
  { key: 'doing', label: '正在继续（进度 +1）' },
  { key: 'weekly', label: '本周追更' },
  { key: 'random', label: '随机回顾' },
  { key: 'expiring', label: '会员到期提醒' },
  { key: 'month', label: '本月数据' },
  { key: 'remind', label: '临近提醒' },
  { key: 'goals', label: '年度目标进度' }
];

export function homeSections() {
  const cur = setting('homeSections', null);
  const keys = HOME_SECTIONS.map((s) => s.key);
  if (!cur) return keys;
  return cur.filter((k) => keys.indexOf(k) >= 0);
}

function homeLayoutPanel() {
  const on = homeSections();
  return '<p class="fan-hint">选择首页显示哪些区块。关掉只是不显示，数据照常记录。</p>' +
    '<div class="rows">' + HOME_SECTIONS.map((s) =>
      '<div class="rowitem is-static"><span class="rowitem-main"><b>' + esc(s.label) + '</b></span>' +
      '<label class="switch"><input type="checkbox" data-action="gal-home-toggle" data-value="' + s.key + '"' + (on.indexOf(s.key) >= 0 ? ' checked' : '') + '><i></i></label></div>').join('') +
    '</div>' +
    '<button class="btn btn-primary btn-block" data-action="gal-home-save" style="margin-top:16px">保存并回首页</button>';
}

/* ---------------- 11.4 专题输出 ---------------- */

function exportPanel() {
  const list = topics.list();
  if (!list.length) {
    return emptyState('·', '还没有专题可以导出', '先建一个专题，把作品放进去。',
      '<button class="btn btn-primary btn-sm" data-action="go" data-to="#/taxonomy">去建专题</button>');
  }
  return '<p class="fan-hint">导出为图片或 HTML 片段，方便自己留存或放进笔记软件。不生成在线链接。</p>' +
    '<div class="rows">' + list.map((t) => '<div class="rowitem is-static">' +
      '<span class="row-icon">' + icon('layers', 16) + '</span>' +
      '<span class="rowitem-main"><b>' + esc(t.title) + '</b><i>' + (t.workIds || []).length + ' 部作品</i></span>' +
      '<span class="rowitem-side"><button class="btn btn-ghost btn-xs" data-action="gal-topic-png" data-id="' + t.id + '">图片</button>' +
      '<button class="btn btn-ghost btn-xs" data-action="gal-topic-html" data-id="' + t.id + '" style="margin-left:4px">HTML</button></span></div>').join('') +
    '</div>';
}

async function exportTopicPNG(id) {
  const t = topics.get(id);
  if (!t) return;
  const works = (t.workIds || []).map((x) => getWork(x)).filter(Boolean);
  const W = 760;
  const rowH = 92;
  const H = 250 + Math.max(1, works.length) * rowH + 60;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, '#17132F');
  g.addColorStop(1, '#241C48');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const P = 52;
  ctx.fillStyle = 'rgba(242,237,255,.5)';
  ctx.font = '600 12px -apple-system, sans-serif';
  ctx.fillText('DIMENSION ARCHIVE · 专题', P, 62);
  ctx.fillStyle = '#F2EDFF';
  ctx.font = '700 34px "Songti SC", "Noto Serif SC", serif';
  ctx.fillText(String(t.title).slice(0, 18), P, 118);
  if (t.description) {
    ctx.fillStyle = 'rgba(242,237,255,.6)';
    ctx.font = '400 14px -apple-system, sans-serif';
    ctx.fillText(String(t.description).slice(0, 40), P, 148);
  }
  ctx.fillStyle = 'rgba(242,237,255,.14)';
  ctx.fillRect(P, 172, W - P * 2, 1);

  works.forEach((w, i) => {
    const y = 196 + i * rowH;
    ctx.fillStyle = 'rgba(242,237,255,.05)';
    ctx.fillRect(P, y, W - P * 2, rowH - 16);
    ctx.fillStyle = '#B9A2FF';
    ctx.font = '700 14px ui-monospace, monospace';
    ctx.fillText(String(i + 1).padStart(2, '0'), P + 16, y + 34);
    ctx.fillStyle = '#F2EDFF';
    ctx.font = '600 19px -apple-system, "PingFang SC", sans-serif';
    ctx.fillText(String(w.title).slice(0, 18), P + 56, y + 32);
    ctx.fillStyle = 'rgba(242,237,255,.52)';
    ctx.font = '400 12px -apple-system, sans-serif';
    ctx.fillText([typeDef(w.type).label, w.creator, w.year].filter(Boolean).join(' · '), P + 56, y + 54);
    if (w.rating) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#F2D79B';
      ctx.font = '700 16px ui-monospace, monospace';
      ctx.fillText(ratingShort(w.rating), W - P - 16, y + 40);
      ctx.textAlign = 'left';
    }
  });

  await new Promise((r) => setTimeout(r, 30));
  cv.toBlob((blob) => {
    if (!blob) { toast('生成失败', 'error'); return; }
    downloadBlob(blob, 'topic-' + String(t.title).slice(0, 12) + '.png');
    toast('已导出图片');
  }, 'image/png');
}

function exportTopicHTML(id) {
  const t = topics.get(id);
  if (!t) return;
  const works = (t.workIds || []).map((x) => getWork(x)).filter(Boolean);
  const html = '<!DOCTYPE html><html lang="zh-CN"><meta charset="utf-8"><title>' + esc(t.title) + '</title>' +
    '<style>body{background:#17132F;color:#F2EDFF;font:16px/1.8 -apple-system,"PingFang SC",sans-serif;max-width:720px;margin:60px auto;padding:0 24px}' +
    'h1{font-family:"Songti SC",serif;font-size:34px;margin-bottom:8px}p.d{color:#9C93B8;margin-bottom:32px}' +
    'li{margin:10px 0;color:#C4B9E0}small{color:#8F85AC}</style>' +
    '<h1>' + esc(t.title) + '</h1><p class="d">' + esc(t.description || '') + '</p><ol>' +
    works.map((w) => '<li><b>' + esc(w.title) + '</b> <small>' + esc([typeDef(w.type).label, w.year].filter(Boolean).join(' · ')) + '</small></li>').join('') +
    '</ol><p><small>导出自次元簿 · 本机数据</small></p></html>';
  downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), 'topic-' + String(t.title).slice(0, 12) + '.html');
  toast('已导出 HTML');
}

export const actions = {
  'gal-tab': async (el) => {
    const v = el.dataset.value;
    if (v === 'shelf3d' && !setting('shelf3dOk', false)) {
      const ok = await confirmDialog({
        title: '开启 3D 书架？',
        desc: '3D 只是展示层，不影响基础管理。移动端会自动降级为 2D；性能较弱的设备可能略卡。',
        confirmText: '开启'
      });
      if (!ok) return;
      await saveSetting('shelf3dOk', true);
    }
    ui.galleryTab = v;
    go('#/gallery/' + v);
  },
  'hall-view': (el) => { ui.hallView = el.dataset.value; go('#/gallery/hall'); },
  'hall-density': () => { ui.hallDense = !ui.hallDense; go('#/gallery/hall'); },
  'gal-rotate': () => {
    const el = document.getElementById('shelf3d');
    if (!el) return;
    el.classList.toggle('is-side');
  },
  'gal-home-toggle': (el) => {
    const key = el.dataset.value;
    let cur = homeSections().slice();
    if (el.checked) { if (cur.indexOf(key) < 0) cur.push(key); }
    else cur = cur.filter((x) => x !== key);
    el.dataset.pending = JSON.stringify(cur);
    ui.homeSectionsDraft = cur;
  },
  'gal-home-save': async () => {
    const list = ui.homeSectionsDraft || homeSections();
    await saveSetting('homeSections', list);
    toast('已保存');
    go('#/home');
  },
  'gal-topic-png': (el) => exportTopicPNG(el.dataset.id),
  'gal-topic-html': (el) => exportTopicHTML(el.dataset.id)
};
