/* ==========================================================
   次元簿 · 首页仪表盘（5.1 / 7.6 / 11.3）
   区块：问候 / 统计 / 快捷 / 正在继续 / 本周追更 / 随机回顾 /
        会员到期 / 本月 / 提醒 / 今年目标
   正在继续的「+1」直接推进最近一条体验记录的进度。
   ========================================================== */

import {
  data, liveWorks, getWork, bucketOf, coverUrl, setting, dueReminders,
  latestExperience, experiencesOf, sessionsOf, detailsOf, progressLine, bumpProgress, finishedDate
} from '../core/repo.js';
import { typeDef } from '../core/schema.js';
import { pref, ui, go } from '../core/state.js';
import { icon, toast, openModal } from '../core/ui.js';
import { esc, initials, coverColor, ratingShort, truncate, fmtHours } from '../core/format.js';

const ALL_SECTIONS = ['hero', 'quick', 'doing', 'weekly', 'random', 'expiring', 'month', 'remind', 'goals'];

function sections() {
  const s = setting('homeSections', null);
  if (!s || !s.length) return ALL_SECTIONS;
  /* 兼容旧配置：最近添加/体验/写的已经删除，不再展示 */
  return s.filter((k) => ALL_SECTIONS.indexOf(k) >= 0);
}

function monthKey(d) { return String(d || '').slice(0, 7); }

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
function weekdayOf(date) { return WEEKDAYS[new Date(date).getDay()]; }

function detailWeekday(w) {
  const d = detailsOf(w.id);
  const raw = String(d.airWeekday || d.updateWeekday || '').replace(/^每周/, '').trim();
  return WEEKDAYS.indexOf(raw) >= 0 ? raw : '';
}

function sourceTags(w) {
  const d = detailsOf(w.id);
  const tags = [];
  const push = (v) => String(v || '').split(/[\/、,，·\s]+/).forEach((x) => {
    const t = x.trim();
    if (t && t.length <= 8 && tags.indexOf(t) < 0) tags.push(t);
  });
  push(d.watchPlatform);
  push(d.listenPlace);
  push(d.webPlatform);
  push(w.source);
  const link = String(d.link || w.link || '');
  const hostMap = [
    ['douban.com', '豆瓣'],
    ['bilibili.com', 'B站'],
    ['wikipedia.org', '维基'],
    ['bgm.tv', 'Bangumi'],
    ['imdb.com', 'IMDb'],
    ['youtube.com', 'YouTube'],
    ['spotify.com', 'Spotify']
  ];
  hostMap.forEach(([h, name]) => { if (link.indexOf(h) >= 0 && tags.indexOf(name) < 0) tags.push(name); });
  return tags.slice(0, 4);
}

function build() {
  const works = liveWorks();
  const year = new Date().getFullYear();
  const thisMonth = monthKey(new Date().toISOString());

  const b = { wish: 0, todo: 0, doing: 0, paused: 0, done: 0, dropped: 0, redoing: 0 };
  works.forEach((w) => { const k = bucketOf(w); b[k] = (b[k] || 0) + 1; });

  const exps = data.experiences.filter((e) => !e.deletedAt && getWork(e.workId));
  const monthExps = exps.filter((e) => monthKey(e.startDate) === thisMonth || monthKey(e.createdAt) === thisMonth);
  const yearDone = exps.filter((e) => String(e.endDate || e.startDate || '').slice(0, 4) === String(year) && bucketOf({ status: e.status }) === 'done');

  const doing = works.filter((w) => ['doing', 'redoing'].indexOf(bucketOf(w)) >= 0)
    .sort((a, c) => String(latestExperience(c.id) ? latestExperience(c.id).updatedAt : c.updatedAt || '')
      .localeCompare(String(latestExperience(a.id) ? latestExperience(a.id).updatedAt : a.updatedAt || '')));

  const now = Date.now();
  const expiring = [];
  data.accounts.filter((a) => !a.deletedAt && a.membershipEnd).forEach((a) => {
    const days = Math.ceil((new Date(a.membershipEnd + 'T00:00:00').getTime() - now) / 86400000);
    if (!isNaN(days) && days <= 30) expiring.push({ kind: 'account', name: a.platform, date: a.membershipEnd, days, id: a.id });
  });
  data.subscriptions.filter((s) => !s.deletedAt && s.endDate && s.active !== false).forEach((s) => {
    const days = Math.ceil((new Date(s.endDate + 'T00:00:00').getTime() - now) / 86400000);
    if (!isNaN(days) && days <= 30) expiring.push({ kind: 'sub', name: s.platform, date: s.endDate, days, id: s.id });
  });
  expiring.sort((a, b2) => a.days - b2.days);

  const due = dueReminders(7);
  const goals = pref('goalCount') || 0;

  return { works, b, exps, monthExps, yearDone, doing, expiring, due, goals, year };
}

function quickActions() {
  return '<div class="quick-row">' +
    [['new-work', 'plus', '记录作品'], ['new-experience', 'clock', '记一次体验'],
      ['new-excerpt', 'tag', '加摘抄'], ['new-review', 'edit', '写总结'],
      ['new-resource', 'folder', '登记资源'], ['new-account', 'lock', '加账号']]
      .map((q) => '<button class="quick" data-action="' + q[0] + '"><span class="quick-ico">' + icon(q[1], 19) + '</span>' +
        '<span>' + q[2] + '</span></button>').join('') +
    '</div>';
}

/* ---------------- 正在继续 ---------------- */

function doingRow(w) {
  const def = typeDef(w.type);
  const ex = latestExperience(w.id);
  const cover = coverUrl(w);
  const line = progressLine(w, ex ? ex.progress : null);
  return '<div class="doing-row" data-doing="' + w.id + '">' +
    '<button class="doing-open" data-action="open-work" data-id="' + w.id + '">' +
    '<span class="doing-art" style="--cc:' + coverColor(w.title) + '">' +
    (cover ? '<img src="' + esc(cover) + '" alt="" loading="lazy">' : '<b>' + esc(initials(w.title)) + '</b>') +
    '</span>' +
    '<span class="doing-main"><i>' + esc(def.label) + '</i><b>' + esc(w.title) + '</b>' +
    '<span class="doing-prog">' + esc(line) + '</span></span>' +
    '</button>' +
    '<button class="doing-plus" data-action="progress-plus" data-id="' + w.id + '" aria-label="进度加 1" title="进度 +1">+1</button>' +
    '</div>';
}

function doingBox(s) {
  if (!s.doing.length) {
    return '<p class="fan-hint">现在没有进行中的作品。开始读一本书、追一部剧，它会出现在这里，点 +1 记录进度。</p>';
  }
  return '<div class="doing-list">' + s.doing.slice(0, 8).map(doingRow).join('') + '</div>' +
    (s.doing.length > 8 ? '<a class="btn btn-ghost btn-xs" style="margin-top:10px" href="#/works">还有 ' + (s.doing.length - 8) + ' 部，去档案馆看全部</a>' : '');
}

/* ---------------- 本周追更 ---------------- */

function weeklySummary() {
  const today = weekdayOf(new Date());
  const list = liveWorks().filter((w) => ['doing', 'redoing'].indexOf(bucketOf(w)) >= 0);
  const cycleAuto = (w) => String(detailsOf(w.id).updateCycle || '') === '日更';
  const todayList = list.filter((w) => detailWeekday(w) === today || cycleAuto(w));
  return { today, todayList, weekCount: list.filter((w) => !!detailWeekday(w)).length };
}

function weeklyCard() {
  const { today, todayList, weekCount } = weeklySummary();
  return '<a class="weekly-card" href="#/updates">' +
    '<span class="weekly-icon">' + icon('calendar', 22) + '</span>' +
    '<span class="weekly-main"><b>本周追更</b>' +
    '<i>' + esc(today) + (todayList.length ? ' · ' + todayList.length + ' 部有更新' : ' · 今天没有更新') +
    (weekCount ? ' · 排期 ' + weekCount + ' 部' : '') + '</i></span>' +
    '<span class="weekly-go">' + icon('right', 18) + '</span></a>' +
    (todayList.length
      ? '<div class="weekly-today">' + todayList.slice(0, 3).map((w) => '<span class="tagpill">' + esc(w.title) + '</span>').join('') + '</div>'
      : '');
}

/* ---------------- 随机回顾 ---------------- */

function pickRandom(s) {
  if (ui.randomClosed) return null;
  if (ui.randomId) {
    const hit = getWork(ui.randomId);
    if (hit) return hit;
  }
  const pool = s.works.filter((w) => bucketOf(w) !== 'wish' || w.rating);
  if (!pool.length) return null;
  const w = pool[Math.floor(Math.random() * pool.length)];
  ui.randomId = w.id;
  return w;
}

function randomCard(w) {
  if (!w) return '';
  const def = typeDef(w.type);
  const d = detailsOf(w.id);
  const ex = latestExperience(w.id);
  const cover = coverUrl(w);
  const hours = experiencesOf(w.id).reduce((a, e) => a + (Number(e.progress && e.progress.hours) || 0), 0) || Number(d.playTime) || 0;
  const prog = progressLine(w, ex ? ex.progress : null);
  const country = d.releaseRegion || d.country || d.region || d.location || d.pubPlace || '';
  const tags = sourceTags(w);
  const statusLabel = bucketOf(w) === 'done' ? '已看完' : bucketOf(w) === 'dropped' ? '已搁置' : bucketOf(w) === 'paused' ? '暂停中' : '在追';

  return '<article class="rr-card" id="rr-card" data-action="random-card" title="点击查看卡牌">' +
    '<div class="rr-art-wrap">' +
    '<div class="rr-art" style="--cc:' + coverColor(w.title) + '">' +
    (cover ? '<img src="' + esc(cover) + '" alt="">' : '<span class="ph">' + esc(initials(w.title)) + '</span>') +
    '</div><span class="rr-art-tag">' + esc(def.label) + '</span></div>' +
    '<div class="rr-body">' +
    '<div class="rr-head"><span class="rr-status">' + esc(statusLabel) + '</span>' +
    '<b class="rr-title">' + esc(w.title) + '</b>' +
    (w.creator || w.year ? '<span class="rr-by">' + esc([w.creator, w.year].filter(Boolean).join(' ')) + '</span>' : '') +
    (w.rating ? '<span class="rr-rate">' + ratingShort(w.rating) + '/10</span>' : '') + '</div>' +
    '<div class="rr-meta">' +
    (prog && prog !== '还没记录进度' ? '<span>' + esc(prog) + '</span>' : '') +
    (d.epCount ? '<span>总集数 ' + esc(d.epCount) + '</span>' : '') +
    (d.seasons ? '<span>共 ' + esc(d.seasons) + ' 季</span>' : '') +
    (country ? '<span>国家/地区 ' + esc(country) + '</span>' : '') +
    (hours ? '<span>投入时长 ' + esc(fmtHours(hours)) + ' 小时</span>' : '') +
    (d.runtime ? '<span>' + esc(d.runtime) + ' 分钟</span>' : '') +
    (d.pages ? '<span>' + esc(d.pages) + ' 页</span>' : '') +
    (d.tracks ? '<span>' + esc(d.tracks) + ' 首</span>' : '') +
    '</div>' +
    (w.note || w.summary ? '<p class="rr-note">' + esc(truncate(w.note || w.summary, 90)) + '</p>' : '') +
    '<div class="rr-tags"><span class="tagpill is-type">' + esc(def.label) + '</span>' +
    tags.map((t) => '<span class="tagpill">' + esc(t) + '</span>').join('') + '</div>' +
    '<div class="rr-foot"><span class="rr-dates">收录于 ' + esc(String(w.createdAt || '').slice(0, 10)) +
    ' · 更新于 ' + esc(String(w.updatedAt || '').slice(0, 10)) + '</span>' +
    '<span class="rr-btns"><button class="btn btn-ghost btn-xs" data-action="random-close">关闭</button>' +
    '<button class="btn btn-soft btn-xs" data-action="edit-work" data-id="' + w.id + '">编辑</button></span></div>' +
    '</div></article>';
}

/* 可打印的收藏卡牌 */
function cardHTML(w) {
  const def = typeDef(w.type);
  const d = detailsOf(w.id);
  const exps = experiencesOf(w.id);
  const cover = coverUrl(w);
  const hours = exps.reduce((a, e) => a + (Number(e.progress && e.progress.hours) || 0), 0) || Number(d.playTime) || 0;
  const country = d.releaseRegion || d.country || d.region || d.location || d.pubPlace || '';
  const startDate = exps.map((e) => e.startDate).filter(Boolean).sort()[0] || '';
  const endDates = exps.map((e) => e.endDate).filter(Boolean).sort();
  const endDate = finishedDate(w) || endDates[endDates.length - 1] || '';
  const sesMinutes = sessionsOf(w.id).reduce((a, x) => a + (Number(x.minutes) || 0), 0);
  const watch = hours ? fmtHours(hours) + ' 小时'
    : sesMinutes ? fmtHours(sesMinutes / 60) + ' 小时'
      : (d.runtime ? d.runtime + ' 分钟' : '—');

  /* 按类别决定「时长 / 开始 / 结束」的叫法与第一组第三项 */
  const group = typeDef(w.type).group;
  const mode = typeDef(w.type).mode;
  const unit = typeDef(w.type).itemUnit || '集';
  const labels = group === 'text' || group === 'comic'
    ? { time: '阅读时长', start: '开始读', end: '读完' }
    : group === 'audio'
      ? { time: '收听时长', start: '开始听', end: '听完' }
      : group === 'game'
        ? { time: '游玩时长', start: '开始玩', end: '玩完' }
        : { time: '观看时长', start: '开始看', end: '看完' };
  let extra = null;
  if (mode === 'series') extra = { label: unit === '期' ? '期数' : '集数', value: d.epCount ? d.epCount + ' ' + unit : '—' };
  else if (mode === 'issue') {
    const lp = exps[0] && exps[0].progress ? exps[0].progress : {};
    const no = lp.issueNo || d.issueNo || '';
    extra = { label: '期号', value: no ? '第 ' + no + ' 期' : '—' };
  } else if (mode === 'book') {
    if (d.pages) extra = { label: '页数', value: d.pages + ' 页' };
    else if (d.chapters) extra = { label: '话数', value: d.chapters + ' 话' };
    else {
      const lp = exps[0] && exps[0].progress ? exps[0].progress : {};
      if (lp.chapterTotal) extra = { label: '章数', value: lp.chapterTotal + ' 章' };
    }
  } else if (group === 'audio') extra = { label: '曲目', value: d.tracks ? d.tracks + ' 首' : '—' };
  else if (group === 'game' && mode === 'percent') extra = { label: '完成度', value: d.completion ? d.completion + '%' : '—' };
  else if (group === 'stage') extra = { label: '场次', value: d.shows ? d.shows + ' 场' : '—' };
  const cellHTML = (label, value) => '<div><i>' + label + '</i><b>' + esc(value || '—') + '</b></div>';
  const tags = sourceTags(w);
  let serial = 0;
  const s = String(w.id || w.title || '');
  for (let i = 0; i < s.length; i++) serial = (serial * 31 + s.charCodeAt(i)) % 100000;
  const serialTxt = ('00000' + serial).slice(-5);

  return '<div class="card-stage"><article class="gcard">' +
    '<div class="gcard-frame">' +
    '<div class="gcard-art" style="--cc:' + coverColor(w.title) + '">' +
    (cover ? '<img src="' + esc(cover) + '" alt="">' : '<span class="ph">' + esc(initials(w.title)) + '</span>') +
    '</div>' +
    '<div class="gcard-info">' +
    '<div class="gcard-kicker">DIMENSION ARCHIVE<span>NO. ' + serialTxt + '</span></div>' +
    '<h3 class="gcard-title">' + esc(w.title) + '</h3>' +
    '<p class="gcard-sub">' + esc([w.creator, w.year].filter(Boolean).join(' · ') || '—') + '</p>' +
    '<div class="gcard-stats">' +
    '<div class="gcard-group">' +
    cellHTML('评分', w.rating ? ratingShort(w.rating) + ' / 10' : '—') +
    cellHTML('国家/地区', country || '—') +
    (extra ? cellHTML(extra.label, extra.value) : '') +
    '</div>' +
    '<div class="gcard-group">' +
    cellHTML(labels.time, watch) +
    cellHTML(labels.start, startDate || '—') +
    cellHTML(labels.end, endDate || '—') +
    '</div>' +
    '</div>' +
    (w.note || w.summary ? '<p class="gcard-note">' + esc(truncate(w.note || w.summary, 120)) + '</p>' : '') +
    '<div class="gcard-tags">' + [def.label].concat(tags).map((t) => '<span>' + esc(t) + '</span>').join('') + '</div>' +
    '</div></div>' +
    '<footer class="gcard-foot"><span>收录 ' + esc(String(w.createdAt || '').slice(0, 10)) + '</span>' +
    '<span>次元簿 · ' + esc(String(w.updatedAt || '').slice(0, 10)) + '</span></footer>' +
    '</article></div>';
}

/* ---------------- 页面 ---------------- */

export function homeView() {
  const s = build();
  const SEC = sections();
  const has = (k) => SEC.indexOf(k) >= 0;
  const total = s.works.length;
  const hour = new Date().getHours();
  const greet = hour < 6 ? '夜深了' : hour < 11 ? '早上好' : hour < 14 ? '中午好' : hour < 19 ? '下午好' : '晚上好';

  let html = '<header class="home-head">' +
    '<div><p class="eyebrow">' + esc(greet) + ' · 你的文化档案</p>' +
    '<h1 class="page-title">次元簿</h1></div>' +
    '<div class="head-actions">' +
    '<button class="icon-btn" data-action="go" data-to="#/search" aria-label="搜索">' + icon('search', 20) + '</button>' +
    '<button class="icon-btn" data-action="go" data-to="#/settings" aria-label="设置">' + icon('gear', 20) + '</button>' +
    '</div></header>';

  if (!total) {
    return html + '<section class="home-empty">' +
      '<div class="home-orbit" aria-hidden="true"><span class="orbit-ring"></span><span class="orbit-star"></span>' +
      '<span class="orbit-book"><img src="assets/icons/brand-96.png" alt=""></span></div>' +
      '<h2>从第一部作品开始</h2>' +
      '<p>记下一本书、一部电影或一款游戏。之后每一次阅读、观看与游玩，都会挂在它的档案下面，慢慢长成你自己的文化地图。</p>' +
      '<button class="btn btn-primary" data-action="new-work">＋ 添加第一部作品</button>' +
      '<button class="btn btn-ghost btn-sm" style="margin-top:10px" data-action="demo-load">先载入示例看看</button>' +
      '<p class="home-empty-note">数据只保存在这台设备，不需要注册，也不会联网上传。</p>' +
      '</section>' + quickActions();
  }

  if (has('hero')) {
    const donePct = total ? Math.round((s.b.done || 0) / total * 100) : 0;
    html += '<section class="hero">' +
      '<div class="hero-main"><p class="hero-kicker">作品总数</p>' +
      '<div class="hero-num">' + total + '</div>' +
      '<p class="hero-sub">已完成 <b>' + (s.b.done || 0) + '</b> · 进行中 <b>' + ((s.b.doing || 0) + (s.b.redoing || 0)) +
      '</b> · 待体验 <b>' + ((s.b.wish || 0) + (s.b.todo || 0)) + '</b></p></div>' +
      '<div class="hero-ring" style="--p:' + donePct + '">' +
      '<svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" class="ring-bg"/>' +
      '<circle cx="60" cy="60" r="52" class="ring-fg" stroke-dasharray="' + (donePct * 3.267) + ' 327"/></svg>' +
      '<span><b>' + donePct + '%</b><i>完成率</i></span></div>' +
      '</section>';
  }

  if (has('quick')) html += quickActions();

  if (has('doing')) {
    html += '<section class="section" id="doing-section"><div class="section-head"><h2 class="section-title">正在继续</h2>' +
      '<span class="section-note">' + s.doing.length + ' 部 · 点 +1 记录进度</span></div>' +
      '<div id="doing-box">' + doingBox(s) + '</div></section>';
  }

  if (has('weekly')) {
    html += '<section class="section"><div class="section-head"><h2 class="section-title">本周追更</h2></div>' +
      weeklyCard() + '</section>';
  }

  if (has('random')) {
    const rw = pickRandom(s);
    html += '<section class="section"><div class="section-head"><h2 class="section-title">随机回顾</h2>' +
      '<button class="btn btn-ghost btn-xs" data-action="random-shuffle">' + icon('spark', 13) + ' 换一张</button></div>' +
      (rw ? randomCard(rw) : '<p class="fan-hint">没有可回顾的作品，先去记一部。</p>') + '</section>';
  }

  if (has('expiring') && s.expiring.length) {
    html += '<section class="section"><div class="section-head"><h2 class="section-title">会员到期</h2>' +
      '<span class="section-note">30 天内</span></div><div class="rows">' +
      s.expiring.map((x) => '<a class="rowitem" href="' + (x.kind === 'account' ? '#/accounts' : '#/finance/subs') + '">' +
        '<span class="logo-box">' + esc(String(x.name || '?').slice(0, 1)) + '</span>' +
        '<span class="rowitem-main"><b>' + esc(x.name) + '</b><i>' + esc(x.date) + '</i></span>' +
        '<span class="rowitem-side"><span class="badge ' + (x.days < 0 ? 'is-error' : x.days <= 7 ? 'is-warn' : '') + '">' +
        (x.days < 0 ? '已过期' : x.days === 0 ? '今天' : x.days + ' 天') + '</span></span></a>').join('') +
      '</div></section>';
  }

  if (has('month')) {
    html += '<section class="section"><div class="section-head"><h2 class="section-title">本月</h2>' +
      '<span class="section-note">' + s.year + ' 年</span></div>' +
      '<div class="stat-grid">' +
      '<div class="stat"><b>' + s.monthExps.length + '</b><span>本月新增体验</span></div>' +
      '<div class="stat"><b>' + s.yearDone.length + '</b><span>今年完成</span></div>' +
      '<div class="stat"><b>' + (s.b.wish + s.b.todo) + '</b><span>待体验</span></div>' +
      '<div class="stat"><b>' + data.excerpts.filter((e) => !e.deletedAt).length + '</b><span>摘抄</span></div>' +
      '</div></section>';
  }

  if (has('remind') && s.due.length) {
    html += '<section class="section"><div class="section-head"><h2 class="section-title">提醒</h2>' +
      '<a class="btn btn-ghost btn-xs" href="#/plans">全部</a></div><div class="rows">' +
      s.due.slice(0, 4).map((x) => '<a class="rowitem" href="#/plans">' +
        '<span class="row-icon">' + icon('clock', 16) + '</span>' +
        '<span class="rowitem-main"><b>' + esc(x.r.title) + '</b><i>' + esc(x.r.date || '') + '</i></span>' +
        '<span class="rowitem-side"><span class="badge ' + (x.diff < 0 ? 'is-error' : x.diff <= 2 ? 'is-warn' : '') + '">' +
        (x.diff < 0 ? '逾期 ' + (-x.diff) + ' 天' : x.diff === 0 ? '今天' : x.diff + ' 天后') + '</span></span></a>').join('') +
      '</div></section>';
  }

  if (has('goals') && s.goals) {
    const pct = Math.min(100, Math.round(s.yearDone.length / s.goals * 100));
    html += '<section class="section"><div class="section-head"><h2 class="section-title">今年目标</h2>' +
      '<span class="section-note">' + s.yearDone.length + ' / ' + s.goals + '</span></div>' +
      '<div class="card"><div class="bar"><i style="width:' + pct + '%"></i></div>' +
      '<p class="muted" style="font-size:11.5px;margin-top:8px">完成 ' + pct + '%，还差 ' + Math.max(0, s.goals - s.yearDone.length) + ' 部。</p></div></section>';
  }

  return html;
}

export const actions = {
  'random-card': () => {
    const w = ui.randomId ? getWork(ui.randomId) : null;
    if (!w) return;
    openModal({
      title: '',
      cls: 'card-modal',
      body: cardHTML(w),
      actions: [{ label: '关闭', value: null, variant: 'ghost' }, { label: '打印卡牌', value: 'print', variant: 'primary' }]
    }).then((v) => { if (v === 'print') window.print(); });
  },
  'progress-plus': async (el) => {
    const id = el.dataset.id;
    el.disabled = true;
    const res = await bumpProgress(id, 1);
    el.disabled = false;
    if (!res.ok) { toast(res.error || '进度更新失败', 'error'); return; }
    const row = el.closest('[data-doing]');
    const line = row ? row.querySelector('.doing-prog') : null;
    if (line) line.textContent = progressLine(res.work || getWork(id), res.progress);
    el.classList.add('is-hit');
    setTimeout(() => el.classList.remove('is-hit'), 320);
  },
  'random-close': () => {
    ui.randomClosed = true;
    const card = document.getElementById('rr-card');
    if (card) card.remove();
  },
  'random-shuffle': () => {
    ui.randomClosed = false;
    ui.randomId = '';
    go('#/home');
  }
};
