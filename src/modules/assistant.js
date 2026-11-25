/* ==========================================================
   次元簿 · 自动化与智能管理（第九章）
   9.1 智能录入 / 9.2 标签建议 / 9.3 重复检测 /
   9.5 本地问答 / 9.6 自动化规则中心
   全部为本地确定性规则，不调用任何在线模型，答案可复核。
   ========================================================== */

import {
  data, liveWorks, getWork, saveWork, detailsOf, bucketOf, finishedDate, onWorkSaved,
  rules, saveTag, tagByName, topics, reminders, experiencesOf, reviews, setting,
  mergeWorks, addLink, entityKey
} from '../core/repo.js';
import { TYPES, typeDef, RULE_TRIGGERS, RULE_ACTIONS } from '../core/schema.js';
import { ui, go } from '../core/state.js';
import { icon, toast, openModal, confirmDialog, emptyState, promptDialog } from '../core/ui.js';
import { esc, todayISO, fmtHours, ratingShort } from '../core/format.js';
import {
  llmConfig, saveLLMConfig, clearLLMKey, chat, buildContext, contextToText, maskKey, LLM_DEFAULTS
} from '../core/llm.js';
import * as vault from '../core/crypto.js';

export function assistantView() {
  const tab = (['import', 'tags', 'dupe', 'ask', 'ai', 'rules'].indexOf(ui.route.id) >= 0) ? ui.route.id : (ui.aiTab || 'import');
  const cfg = llmConfig();
  let html = '<header class="page-head">' +
    '<div class="head-left"><button class="icon-btn" data-action="go" data-to="#/more" aria-label="返回工具">' + icon('back', 20) + '</button>' +
    '<div><p class="eyebrow">自动化 · 本地规则</p><h1 class="page-title">智能工具</h1></div></div></header>';

  html += '<div class="segbar" style="margin-bottom:16px">' +
    [['import', '批量录入'], ['tags', '标签建议'], ['dupe', '重复检测'], ['ask', '本地问答'], ['ai', '联网 AI'], ['rules', '规则']]
      .map((t) => '<button class="' + (tab === t[0] ? 'is-on' : '') + '" data-action="ai-tab" data-value="' + t[0] + '">' + t[1] + '</button>').join('') +
    '</div>';

  if (tab === 'import') return html + importPanel();
  if (tab === 'tags') return html + tagPanel();
  if (tab === 'dupe') return html + dupePanel();
  if (tab === 'ask') return html + askPanel();
  if (tab === 'ai') return html + aiPanel(cfg);
  return html + rulesPanel();
}

/* ---------------- 9.1 批量录入 ---------------- */

function importPanel() {
  const text = ui.aiImportText || '';
  const parsed = parseBulk(text);

  let html = '<p class="fan-hint">一行一部作品。支持「标题 | 作者 | 年份 | 类型」四段，也认《书名》和 4 位年份；' +
    '类型写中文名即可（如 电影、小说），不写就按第一段猜。</p>' +
    '<label class="field"><span class="field-label">粘贴内容</span>' +
    '<textarea class="textarea" id="ai-import" rows="9" placeholder="三体 | 刘慈欣 | 2008 | 小说&#10;《沙丘》 弗兰克·赫伯特 1965&#10;星际穿越 2014">' + esc(text) + '</textarea></label>';

  if (text.trim()) {
    html += '<div class="section-head"><h2 class="section-title">解析结果</h2>' +
      '<span class="section-note">' + parsed.length + ' 条</span></div>';
    if (!parsed.length) {
      html += '<p class="muted" style="font-size:12.5px">没解析出内容，检查一下格式。</p>';
    } else {
      html += '<div class="rows">' + parsed.map((p) => '<div class="rowitem is-static">' +
        '<span class="row-icon">' + icon('book', 15) + '</span>' +
        '<span class="rowitem-main"><b>' + esc(p.title) + '</b>' +
        '<i>' + esc([p.creator, p.year, typeDef(p.type).label].filter(Boolean).join(' · ')) + '</i></span></div>').join('') + '</div>' +
        '<button class="btn btn-primary btn-block" data-action="ai-import-run" style="margin-top:14px">导入这 ' + parsed.length + ' 部</button>';
    }
  }

  return html;
}

function guessType(title, typeText) {
  if (typeText) {
    const hit = TYPES.find((t) => t.label === typeText.trim() || t.id === typeText.trim());
    if (hit) return hit.id;
  }
  const s = String(title || '');
  if (/[第]?\d+\s*集|剧/.test(s)) return 'tv';
  return 'book';
}

export function parseBulk(text) {
  return String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean).map((line) => {
    let parts = line.split(/[|｜\t]/).map((x) => x.trim()).filter(Boolean);
    if (parts.length < 2) {
      const m = line.match(/^《(.+?)》\s*(.*)$/);
      if (m) {
        parts = [m[1]].concat(m[2].split(/\s+/).filter(Boolean));
      } else {
        parts = line.split(/\s{2,}/).filter(Boolean);
        if (parts.length < 2) parts = line.split(/\s+/);
      }
    }
    const title = String(parts[0] || '').replace(/^《|》$/g, '').trim();
    let creator = '';
    let year = '';
    let typeText = '';
    parts.slice(1).forEach((p) => {
      if (/^(19|20)\d{2}$/.test(p)) year = p;
      else if (TYPES.some((t) => t.label === p || t.id === p)) typeText = p;
      else if (!creator) creator = p;
    });
    return { title, creator, year, type: guessType(title, typeText) };
  }).filter((p) => p.title);
}

/* ---------------- 9.2 标签建议 ---------------- */

const STOP = ['的', '之', '与', '和', '上', '下', '第', '部', '集', '卷', '版'];

function suggestTags(w) {
  const out = [];
  const title = String(w.title || '');
  /* 同类型里高频标签 */
  const freq = {};
  liveWorks().filter((x) => x.type === w.type && x.id !== w.id).forEach((x) => {
    (x.tagIds || []).forEach((id) => {
      const t = data.tags.find((y) => y.id === id);
      if (t) freq[t.name] = (freq[t.name] || 0) + 1;
    });
  });
  Object.keys(freq).sort((a, b) => freq[b] - freq[a]).slice(0, 4).forEach((name) => {
    out.push({ name, why: '同类作品里有 ' + freq[name] + ' 部用了这个标签' });
  });
  /* 标题关键词：2 字以上的中文片段，命中已有标签优先 */
  data.tags.forEach((t) => {
    if (out.some((o) => o.name === t.name)) return;
    if (t.name.length >= 2 && title.indexOf(t.name) >= 0) out.push({ name: t.name, why: '标题里出现了这个词' });
  });
  return out.slice(0, 6);
}

function tagPanel() {
  const targets = liveWorks().filter((w) => !(w.tagIds || []).length).slice(0, 8);
  let html = '<p class="fan-hint">只对还没有标签的作品给出建议，依据是同类作品的标签习惯与标题用词，最终由你决定。</p>';

  if (!targets.length) {
    return html + emptyState('·', '没有需要建议的作品', '所有作品都已经有标签了。');
  }

  return html + targets.map((w) => {
    const sug = suggestTags(w);
    return '<section class="section"><div class="section-head"><h2 class="section-title">' + esc(w.title) + '</h2>' +
      '<span class="section-note">' + typeDef(w.type).label + '</span></div>' +
      (sug.length ? '<div class="sug-list">' + sug.map((s) =>
        '<div class="sug-row"><span><b>#' + esc(s.name) + '</b><i>' + esc(s.why) + '</i></span>' +
        '<button class="btn btn-ghost btn-xs" data-action="ai-tag-apply" data-id="' + w.id + '" data-value="' + esc(s.name) + '">加上</button></div>').join('') + '</div>'
        : '<p class="muted" style="font-size:12px">没有足够的同类数据，建议手动打标签。</p>') +
      '</section>';
  }).join('');
}

/* ---------------- 9.3 重复检测 ---------------- */

function sim(a, b) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[\s《》「」()（）\-_:：·.,，。]/g, '');
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 1;
  const short = x.length < y.length ? x : y;
  const long = x.length < y.length ? y : x;
  if (long.indexOf(short) >= 0 && short.length >= 2) return 0.92;
  let hit = 0;
  for (const ch of new Set(short)) if (long.indexOf(ch) >= 0) hit++;
  return hit / new Set(short).size * 0.6;
}

export function duplicatePairs() {
  const works = liveWorks();
  const pairs = [];
  for (let i = 0; i < works.length; i++) {
    for (let j = i + 1; j < works.length; j++) {
      const a = works[i];
      const b = works[j];
      let s = sim(a.title, b.title);
      if (a.originalTitle && b.originalTitle && sim(a.originalTitle, b.originalTitle) > 0.9) s = Math.max(s, 0.9);
      if (a.type === b.type) s += 0.12; else s -= 0.2;
      if (a.year && b.year && a.year === b.year) s += 0.08;
      if (s >= 0.8) pairs.push({ a, b, score: Math.min(1, s) });
    }
  }
  return pairs.sort((x, y) => y.score - x.score).slice(0, 30);
}

function dupePanel() {
  const pairs = duplicatePairs();
  let html = '<p class="fan-hint">按标题相似度 + 同类型 + 同年份打分，列出 80% 以上的组合。合并会被删除的那条仍可在回收站恢复。</p>';

  if (!pairs.length) {
    return html + emptyState('·', '没有发现重复', '当前 ' + liveWorks().length + ' 部作品的标题都足够区分。');
  }

  return html + '<div class="rows">' + pairs.map((p, i) =>
    '<div class="rowitem is-static">' +
    '<span class="row-icon">' + icon('warning', 15) + '</span>' +
    '<span class="rowitem-main"><b>' + esc(p.a.title) + ' / ' + esc(p.b.title) + '</b>' +
    '<i>' + esc([typeDef(p.a.type).label, p.a.year, p.b.year, '相似度 ' + Math.round(p.score * 100) + '%'].filter(Boolean).join(' · ')) + '</i></span>' +
    '<span class="rowitem-side">' +
    '<button class="btn btn-ghost btn-xs" data-action="ai-dupe-open" data-id="' + p.a.id + '">A</button>' +
    '<button class="btn btn-ghost btn-xs" data-action="ai-dupe-open" data-id="' + p.b.id + '" style="margin-left:4px">B</button>' +
    '<button class="btn btn-ghost btn-xs" data-action="ai-dupe-version" data-a="' + p.a.id + '" data-b="' + p.b.id + '" style="margin-left:4px">标为版本</button>' +
    '<button class="btn btn-soft btn-xs" data-action="ai-dupe-merge" data-a="' + p.a.id + '" data-b="' + p.b.id + '" style="margin-left:4px">合并到 A</button>' +
    '</span></div>').join('') + '</div>';
}

/* ---------------- 9.5 本地问答 ---------------- */

export function answerQuestion(q) {
  const s = String(q || '').trim();
  if (!s) return null;
  const now = new Date();
  const year = now.getFullYear();
  const works = liveWorks();
  const doneWorks = works.filter((w) => bucketOf(w) === 'done');
  const inYear = (d) => String(d || '').slice(0, 4) === String(year);

  if (/几个(标签|分类)|多少(标签|分类)/.test(s)) {
    return { text: '目前有 ' + data.tags.length + ' 个标签、' + data.categories.length + ' 个分类、' + data.topics.length + ' 个专题。' };
  }
  if (/花了多少钱|消费|支出/.test(s)) {
    const total = data.expenses.filter((e) => !e.deletedAt && inYear(e.date)).reduce((a, e) => a + (Number(e.amount) || 0), 0);
    return { text: year + ' 年文化消费合计 ¥' + Math.round(total) + '，共 ' + data.expenses.filter((e) => inYear(e.date)).length + ' 笔。', link: '#/finance/expenses' };
  }
  if (/多少小时|时长/.test(s)) {
    let h = 0;
    data.experiences.filter((e) => !e.deletedAt).forEach((e) => { if (e.progress && e.progress.hours) h += Number(e.progress.hours) || 0; });
    return { text: '体验记录里累计 ' + fmtHours(h) + ' 小时。' };
  }
  if (/最高分|最好|最爱/.test(s)) {
    const best = works.filter((w) => w.rating > 0).sort((a, b) => b.rating - a.rating)[0];
    return best ? { text: '评分最高的是《' + best.title + '》，' + ratingShort(best.rating) + ' 分。', link: '#/work/' + best.id } : { text: '还没有打过分的作品。' };
  }
  if (/读|看|玩|听/.test(s) && /几|多少/.test(s)) {
    const isRead = /读/.test(s);
    const isGame = /玩/.test(s);
    const isListen = /听/.test(s);
    let pool = works;
    if (isRead) pool = works.filter((w) => ['text'].indexOf(typeDef(w.type).group) >= 0);
    else if (isGame) pool = works.filter((w) => typeDef(w.type).group === 'game');
    else if (isListen) pool = works.filter((w) => typeDef(w.type).group === 'audio');
    else pool = works.filter((w) => ['film', 'comic'].indexOf(typeDef(w.type).group) >= 0);
    const doneThisYear = pool.filter((w) => bucketOf(w) === 'done' && inYear(finishedDate(w) || w.updatedAt));
    return { text: year + ' 年完成的这类作品有 ' + doneThisYear.length + ' 部，累计收录 ' + pool.length + ' 部。' };
  }
  if (/借|还/.test(s)) {
    const open = data.loans.filter((l) => !l.deletedAt && !l.returnedAt);
    return { text: '还有 ' + open.length + ' 条借还没归还。', link: '#/loans' };
  }
  if (/提醒|待办|到期/.test(s)) {
    const open = data.reminders.filter((r) => !r.deletedAt && !r.done);
    return { text: '有 ' + open.length + ' 条未完成提醒，最近一条是「' + (open[0] ? open[0].title : '无') + '」。', link: '#/plans' };
  }
  return {
    text: '这个问题我还答不上来。我能回答：作品数量、评分最高、今年完成多少、花了多少钱、时长、借还、提醒。' +
      '（本地规则匹配，不是大模型，答案只来自你自己的记录。）'
  };
}

function askPanel() {
  const q = ui.aiQ || '';
  const samples = ['今年读了几本书', '花了多少钱', '评分最高的是哪部', '还有多少没还', '多少小时', '有几个标签'];

  return '<p class="fan-hint">问句按关键词匹配本地数据，不联网、不生成不存在的内容；回答会标明依据。</p>' +
    '<div class="searchbar" style="margin-bottom:12px">' + icon('search', 16) +
    '<input id="ai-ask" type="search" placeholder="比如：今年读了几本书" value="' + esc(q) + '"></div>' +
    '<div class="chips" style="margin-bottom:16px">' + samples.map((x) =>
      '<button class="chip" data-action="ai-ask-sample" data-value="' + esc(x) + '">' + esc(x) + '</button>').join('') + '</div>' +
    '<div id="ask-body">' + askBodyHTML() + '</div>';
}

function askBodyHTML() {
  const q = String(ui.aiQ || '').trim();
  const ans = q ? answerQuestion(q) : null;
  return ans ? '<div class="card"><p style="font-size:14px;line-height:1.8">' + esc(ans.text) + '</p>' +
    (ans.link ? '<button class="btn btn-ghost btn-sm" data-action="go" data-to="' + ans.link + '" style="margin-top:10px">去看明细</button>' : '') + '</div>'
    : '<p class="muted" style="font-size:12.5px">输入问题或点上面的例子。</p>';
}

/* 输入时只更新回答区，保持输入框焦点 */
export function paintAsk() {
  const box = document.getElementById('ask-body');
  if (box) box.innerHTML = askBodyHTML();
}

/* ---------------- 9.5 联网 AI 助手 ---------------- */

const AI_TASKS = [
  { value: 'digest', label: '归纳长篇笔记', hint: '把选中的作品与总结按主题整理，指出反复出现的关注点。' },
  { value: 'review', label: '起草一篇总结', hint: '基于选中的作品写一篇可继续修改的总结草稿。' },
  { value: 'compare', label: '作品对比', hint: '对比两到多部作品的异同，给出判断依据。' },
  { value: 'interest', label: '兴趣分析', hint: '只做描述性统计，不评价性格。' },
  { value: 'report', label: '年度报告草稿', hint: '用本年度真实记录写一份报告初稿。' }
];

function aiScopeText() {
  const ids = ui.aiWorks || [];
  if (!ids.length) return '未选择作品';
  const names = ids.map((id) => (getWork(id) || {}).title).filter(Boolean);
  return names.length + ' 部：' + names.slice(0, 4).join('、') + (names.length > 4 ? ' 等' : '');
}

function aiMessages() {
  const task = ui.aiTask || 'digest';
  const inc = ui.aiInc || {};
  const ids = (ui.aiWorks || []).filter((id) => getWork(id));
  const ctx = buildContext(ids, {
    repo: { liveWorks, getWork, detailsOf, experiencesOf, data },
    withDetails: inc.details !== false,
    withExperience: inc.exp !== false,
    withReviews: inc.reviews !== false,
    withExcerpts: inc.excerpts !== false
  });
  const bodyText = contextToText(ctx);

  const year = ui.aiYear || String(new Date().getFullYear());
  const stats = localStatsText(year);

  const t = AI_TASKS.find((x) => x.value === task) || AI_TASKS[0];
  const role = '你是一名严谨的个人文化档案助手。只依据用户提供的记录作答，不虚构作品、不补造数据、不做心理诊断。' +
    '如果材料不足，直接说明缺什么。输出使用简体中文，结构清晰，可用小标题与列表。';

  let ask = t.label + '。\n\n' + t.hint;
  if (task === 'report') ask += '\n年份：' + year + ' 年。以下是本地统计：\n' + stats;
  if (task === 'interest') ask += '\n以下是本地统计：\n' + stats + '\n只描述记录里呈现的偏好与变化，不下性格结论。';
  if (task === 'compare') ask += '\n请至少比较 2 部作品；如果只选了 1 部，请说明无法对比。';
  if (task === 'review') ask += '\n写成一篇 600–1000 字的总结草稿，保留可编辑的段落结构。';
  if (task === 'digest') ask += '\n按主题分节，每节说明依据来自哪些作品。';
  if ((ui.aiQ || '').trim()) ask += '\n补充要求：' + ui.aiQ.trim();

  const user = ask + '\n\n【用户记录】\n' + (bodyText || '（没有选择任何作品）');
  return [
    { role: 'system', content: role },
    { role: 'user', content: user }
  ];
}

function localStatsText(year) {
  const works = liveWorks();
  const done = works.filter((w) => bucketOf(w) === 'done');
  const yearDone = done.filter((w) => String(finishedDate(w) || '').slice(0, 4) === String(year));
  const byType = {};
  works.forEach((w) => {
    const l = typeDef(w.type).label;
    byType[l] = (byType[l] || 0) + 1;
  });
  const spend = data.expenses.filter((e) => !e.deletedAt && String(e.date || '').slice(0, 4) === String(year))
    .reduce((a, e) => a + (Number(e.amount) || 0), 0);
  const rate = works.filter((w) => w.rating > 0);
  const avg = rate.length ? Math.round(rate.reduce((a, w) => a + Number(w.rating), 0) / rate.length * 10) / 10 : 0;
  return [
    '收录 ' + works.length + ' 部，已完成 ' + done.length + ' 部，' + year + ' 年完成 ' + yearDone.length + ' 部。',
    '类型分布：' + Object.keys(byType).sort((a, b) => byType[b] - byType[a]).slice(0, 8).map((k) => k + ' ' + byType[k]).join('、'),
    '平均评分 ' + avg + '，打分作品 ' + rate.length + ' 部。',
    '本年文化消费 ' + Math.round(spend) + ' 元。',
    '总结 ' + data.reviews.length + ' 篇，摘抄 ' + data.excerpts.length + ' 条。'
  ].join('\n');
}

function aiPanel(cfg) {
  const ids = ui.aiWorks || [];
  const task = ui.aiTask || 'digest';
  const inc = ui.aiInc || { details: true, exp: true, reviews: true, excerpts: true };
  const busy = !!ui.aiBusy;
  const works = liveWorks().slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 24);

  let html = '<div class="ai-status ' + (cfg.enabled ? 'is-on' : '') + '">' +
    '<span class="ai-dot"></span>' +
    '<div class="ai-status-main"><b>' + (cfg.enabled ? '联网 AI 已开启' : '联网 AI 默认关闭') + '</b>' +
    '<i>' + esc(cfg.enabled ? (cfg.model + ' · 密钥' + maskKey()) : '开启后才会向外发送数据；关闭时本地功能不受影响') + '</i></div>' +
    '<button class="btn btn-ghost btn-sm" data-action="ai-config">配置</button></div>';

  html += '<div class="notice is-warn"><span>' + icon('lock', 15) + '</span><span>' +
    '主密码、账号库、密钥永不外发。每次发送前都会列出完整的外发内容，需你确认；' +
    'AI 输出会标为「AI 生成」，保存后可自行修改并转为「AI 生成 · 已改」。</span></div>';

  html += '<section class="section"><div class="section-head"><h2 class="section-title">选择作品</h2>' +
    '<span class="section-note">' + aiScopeText() + '</span></div>' +
    (works.length
      ? '<div class="chips">' + works.map((w) => '<button class="chip' + (ids.indexOf(w.id) >= 0 ? ' is-on' : '') +
        '" data-action="ai-pick" data-id="' + w.id + '">' + esc(w.title) + '</button>').join('') + '</div>'
      : '<p class="muted" style="font-size:12.5px">还没有作品可选。</p>') +
    (ids.length ? '<div class="row-flex" style="margin-top:10px"><button class="btn btn-ghost btn-xs" data-action="ai-clear">清空选择</button></div>' : '') +
    '</section>';

  html += '<section class="section"><div class="section-head"><h2 class="section-title">包含内容</h2>' +
    '<span class="section-note">越少越安全</span></div><div class="ai-inc">' +
    [['details', '档案字段'], ['exp', '体验记录'], ['reviews', '我的总结'], ['excerpts', '摘抄']].map(([k, label]) =>
      '<label class="switch switch-row"><input type="checkbox" data-inc="' + k + '"' + (inc[k] !== false ? ' checked' : '') + '><i></i><span>' + label + '</span></label>').join('') +
    '</div></section>';

  html += '<section class="section"><div class="section-head"><h2 class="section-title">任务</h2></div>' +
    '<label class="field"><select class="select" id="ai-task">' +
    AI_TASKS.map((t) => '<option value="' + t.value + '"' + (task === t.value ? ' selected' : '') + '>' + t.label + '</option>').join('') +
    '</select></label>' +
    (task === 'report' || task === 'interest' ? '<label class="field"><span class="field-label">统计年份</span>' +
      '<input class="input" type="number" id="ai-year" value="' + esc(ui.aiYear || new Date().getFullYear()) + '"></label>' : '') +
    '<label class="field"><span class="field-label">补充要求（选填）</span>' +
    '<textarea class="textarea" id="ai-q" rows="3" placeholder="比如：多写一点叙事结构，不要复述剧情。">' + esc(ui.aiQ || '') + '</textarea></label>' +
    '<div class="row-flex"><button class="btn btn-ghost btn-sm" data-action="ai-preview">预览将外发的数据</button>' +
    '<button class="btn btn-primary btn-sm" data-action="ai-run"' + (busy ? ' disabled' : '') + '>' +
    (busy ? '发送中…' : '发送给模型') + '</button></div></section>';

  if (ui.aiPreview) {
    html += '<section class="section"><div class="section-head"><h2 class="section-title">外发内容</h2>' +
      '<span class="section-note">原样发送，无隐藏字段</span></div>' +
      '<pre class="code-block ai-preview">' + esc(ui.aiPreview) + '</pre></section>';
  }

  if (ui.aiOut) {
    html += '<section class="section"><div class="section-head"><h2 class="section-title">AI 输出</h2>' +
      '<span class="section-note">' + (ui.aiOutEdited ? '已手动修改' : 'AI 生成') + '</span></div>' +
      '<textarea class="textarea ai-out" id="ai-out" rows="14">' + esc(ui.aiOut) + '</textarea>' +
      '<div class="row-flex" style="margin-top:10px">' +
      '<button class="btn btn-primary btn-sm" data-action="ai-save">保存为总结</button>' +
      '<button class="btn btn-ghost btn-sm" data-action="ai-copy">复制全文</button>' +
      '<button class="btn btn-ghost btn-sm" data-action="ai-discard">丢弃</button></div>' +
      '<p class="muted" style="font-size:11.5px;margin-top:8px">保存后会标为「' +
      (ui.aiOutEdited ? 'AI 生成 · 已改' : 'AI 生成') + '」，原始记录不会被覆盖。</p></section>';
  }

  html += '<p class="muted" style="font-size:11.5px">接口使用 OpenAI 兼容的 /chat/completions。' +
    '若只想本地使用，请继续用「本地问答」，它不联网。</p>';

  return html;
}

function aiConfigModal() {
  const cfg = llmConfig();
  openModal({
    title: '联网 AI 配置',
    desc: '密钥用主密码加密后保存在本机，和账号密码同级处理。',
    wide: true,
    body: '<div>' +
      '<label class="switch" style="margin-bottom:12px"><input type="checkbox" id="llm-on"' + (cfg.enabled ? ' checked' : '') + '><i></i><span>开启联网 AI</span></label>' +
      '<label class="field"><span class="field-label">接口地址</span><input class="input" id="llm-base" value="' + esc(cfg.baseUrl) + '" placeholder="https://api.openai.com/v1"></label>' +
      '<label class="field"><span class="field-label">模型</span><input class="input" id="llm-model" value="' + esc(cfg.model) + '" placeholder="gpt-4o-mini"></label>' +
      '<label class="field"><span class="field-label">API 密钥（留空表示不修改）</span>' +
      '<input class="input" id="llm-key" type="password" autocomplete="off" placeholder="' + esc(cfg.hasKey ? '已保存，留空保持不变' : 'sk-...') + '"></label>' +
      (vault.isUnlocked() ? '' : '<p class="notice is-warn"><span>' + icon('lock', 15) + '</span><span>账号库当前锁定，保存密钥前需要先解锁。' +
        '可以先去账号库解锁，再回来配置。</span></p>') +
      (cfg.hasKey ? '<button type="button" class="btn btn-danger btn-sm" data-action="ai-key-del">删除已保存的密钥</button>' : '') +
      '</div>',
    actions: [{ label: '取消', value: null, variant: 'ghost' }, { label: '保存', value: 'ok', variant: 'primary' }]
  }).then(async (v) => {
    if (v !== 'ok') return;
    const val = (id) => { const el = document.getElementById(id); return el ? el.value : ''; };
    const on = document.getElementById('llm-on');
    const res = await saveLLMConfig({
      enabled: !!(on && on.checked),
      baseUrl: val('llm-base') || LLM_DEFAULTS.baseUrl,
      model: val('llm-model') || LLM_DEFAULTS.model,
      apiKey: val('llm-key')
    });
    if (!res.ok) { toast(res.error, 'error'); return; }
    toast('已保存');
    go('#/assistant/ai');
  });
}

/* 供 main 在渲染后绑定：输出框的编辑状态 */
export function bindAI(root) {
  const out = root.querySelector('#ai-out');
  if (out) {
    out.addEventListener('input', () => {
      ui.aiOut = out.value;
      ui.aiOutEdited = true;
    });
  }
  const task = root.querySelector('#ai-task');
  if (task) {
    task.addEventListener('change', () => {
      ui.aiTask = task.value;
      ui.aiOut = '';
      ui.aiOutEdited = false;
      go('#/assistant/ai');
    });
  }
  const year = root.querySelector('#ai-year');
  if (year) {
    year.addEventListener('input', () => { ui.aiYear = year.value; });
  }
  const q = root.querySelector('#ai-q');
  if (q) {
    q.addEventListener('input', () => { ui.aiQ = q.value; });
  }
  root.querySelectorAll('[data-inc]').forEach((el) => {
    el.addEventListener('change', () => {
      ui.aiInc = Object.assign({}, ui.aiInc || {}, { [el.dataset.inc]: el.checked });
    });
  });
}

/* ---------------- 9.6 规则中心 ---------------- */

function rulesPanel() {
  const all = rules.list();
  const logs = setting('ruleLogs', []) || [];
  const logHTML = logs.length
    ? '<section class="section" style="margin-top:22px"><div class="section-head"><h2 class="section-title">执行日志</h2>' +
      '<span class="section-note">最近 ' + logs.length + ' 次</span></div>' +
      '<p class="muted" style="font-size:11.5px;margin-bottom:8px">回滚只撤销规则写入的内容，不会动你手动改过的其它字段。</p>' +
      '<div class="rows">' + logs.slice(0, 12).map((l) =>
        '<div class="rowitem is-static">' +
        '<span class="rowitem-main"><b>' + esc(l.workTitle || '—') + '</b>' +
        '<i>' + esc(String(l.at).slice(0, 16).replace('T', ' ') + ' · ' + (l.actions || []).map((a) => a.label).join('、')) + '</i></span>' +
        '<span class="rowitem-side"><button class="btn btn-ghost btn-xs" data-action="rule-log-undo" data-id="' + l.id + '">回滚</button></span>' +
        '</div>').join('') + '</div></section>'
    : '';
  let html = '<p class="fan-hint">规则在你保存作品或体验记录时执行，动作都是本地操作，可随时关闭。</p>' +
    '<div class="section-head"><h2 class="section-title">规则</h2>' +
    '<button class="btn btn-ghost btn-sm" data-action="rule-new">＋ 新建规则</button></div>';

  if (!all.length) {
    return html + emptyState('·', '还没有自动化规则', '比如「评分 ≥ 9 时自动加标签 神作」「状态变已完成时加入年度精选专题」。') + logHTML;
  }

  return html + '<div class="rows">' + all.map((r) =>
    '<div class="rowitem is-static">' +
    '<span class="row-icon">' + icon('spark', 15) + '</span>' +
    '<span class="rowitem-main"><b>' + esc(r.name) + '</b>' +
    '<i>' + esc(ruleText(r)) + '</i></span>' +
    '<span class="rowitem-side">' +
    '<label class="switch"><input type="checkbox" data-action="rule-toggle" data-id="' + r.id + '"' + (r.enabled !== false ? ' checked' : '') + '><i></i></label>' +
    '<button class="btn btn-ghost btn-xs" data-action="rule-edit" data-id="' + r.id + '" style="margin-left:6px">编辑</button>' +
    '</span></div>').join('') + '</div>' + logHTML;
}

function ruleText(r) {
  const trig = (RULE_TRIGGERS.find((t) => t.value === r.trigger) || {}).label || r.trigger;
  const act = (RULE_ACTIONS.find((a) => a.value === r.action) || {}).label || r.action;
  return trig + (r.threshold ? ' ' + r.threshold : '') + ' → ' + act + (r.value ? '：' + r.value : '');
}

export function openRule(id) {
  const cur = id ? rules.get(id) : null;
  const d = cur ? Object.assign({}, cur) : { id: '', name: '', trigger: 'status_done', threshold: '', action: 'add_tag', value: '', enabled: true };

  const body = '<div>' +
    '<label class="field"><span class="field-label">规则名称</span><input class="input" id="rl-name" value="' + esc(d.name) + '"></label>' +
    '<div class="row2"><label class="field"><span class="field-label">触发时机</span><select class="select" id="rl-trigger">' +
    RULE_TRIGGERS.map((t) => '<option value="' + t.value + '"' + (d.trigger === t.value ? ' selected' : '') + '>' + t.label + '</option>').join('') +
    '</select></label>' +
    '<label class="field"><span class="field-label">阈值（评分类才需要）</span><input class="input" type="number" step="0.5" id="rl-th" value="' + esc(d.threshold) + '"></label></div>' +
    '<div class="row2"><label class="field"><span class="field-label">动作</span><select class="select" id="rl-action">' +
    RULE_ACTIONS.map((a) => '<option value="' + a.value + '"' + (d.action === a.value ? ' selected' : '') + '>' + a.label + '</option>').join('') +
    '</select></label>' +
    '<label class="field"><span class="field-label">动作参数</span><input class="input" id="rl-value" value="' + esc(d.value) + '" placeholder="标签名 / 专题名 / 状态"></label></div>' +
    (cur ? '<button type="button" class="btn btn-danger btn-sm" data-action="rule-del" data-id="' + cur.id + '">删除规则</button>' : '') +
    '</div>';

  openModal({
    title: cur ? '编辑规则' : '新建规则',
    body,
    wide: true,
    actions: [{ label: '取消', value: null, variant: 'ghost' }, { label: '保存', value: 'save', variant: 'primary' }],
    onMount: (root) => {
      root.querySelector('#rl-name').addEventListener('input', (e) => { d.name = e.target.value; });
      root.querySelector('#rl-trigger').addEventListener('change', (e) => { d.trigger = e.target.value; });
      root.querySelector('#rl-th').addEventListener('input', (e) => { d.threshold = e.target.value; });
      root.querySelector('#rl-action').addEventListener('change', (e) => { d.action = e.target.value; });
      root.querySelector('#rl-value').addEventListener('input', (e) => { d.value = e.target.value; });
    }
  }).then(async (v) => {
    if (v !== 'save') return;
    if (!String(d.name || '').trim()) { toast('给规则起个名字'); return; }
    const res = await rules.save(d);
    if (!res.ok) { toast(res.error || '保存失败', 'error'); return; }
    toast('已保存');
    go('#/assistant/rules');
  });
}

/* 回滚期间暂停规则，避免「撤销 → 重新触发规则 → 又加回来」 */
let undoing = false;

/* 9.6 执行日志与单次回滚：只记录本模块能安全撤销的动作 */
async function readRuleLogs() {
  const { setting } = await import('../core/repo.js');
  return setting('ruleLogs', []) || [];
}

async function pushRuleLog(entry) {
  const { saveSetting } = await import('../core/repo.js');
  const list = await readRuleLogs();
  list.unshift(entry);
  await saveSetting('ruleLogs', list.slice(0, 40));
}

/* 规则执行：由 main 在启动时注册 */
export async function runRules(payload) {
  if (undoing) return;
  const list = rules.list().filter((r) => r.enabled !== false);
  if (!list.length) return;
  const w = payload.work;
  if (!w) return;

  const runId = 'run_' + Date.now().toString(36);
  const applied = [];

  for (const r of list) {
    let hit = false;
    if (r.trigger === 'work_saved') hit = true;
    if (r.trigger === 'status_done') hit = bucketOf(w) === 'done';
    if (r.trigger === 'rating_high') hit = (Number(w.rating) || 0) >= (Number(r.threshold) || 9);
    if (!hit) continue;

    if (r.action === 'add_tag' && r.value) {
      let tag = tagByName(r.value);
      if (!tag) tag = (await saveTag({ name: r.value })).row;
      if (tag && (w.tagIds || []).indexOf(tag.id) < 0) {
        await saveWork(Object.assign({}, w, { tagIds: (w.tagIds || []).concat([tag.id]) }), detailsOf(w.id));
        applied.push({ type: 'tag', tagId: tag.id, label: '加标签 #' + tag.name });
      }
    }
    if (r.action === 'add_to_topic' && r.value) {
      const t = data.topics.find((x) => x.title === r.value);
      if (t && (t.workIds || []).indexOf(w.id) < 0) {
        await topics.save(Object.assign({}, t, { workIds: (t.workIds || []).concat([w.id]) }));
        applied.push({ type: 'topic', topicId: t.id, label: '加入专题「' + t.title + '」' });
      }
    }
    if (r.action === 'remind' && r.value) {
      const rem = await reminders.save({ id: '', title: r.value + '：' + w.title, date: todayISO(), repeat: 'none', note: '由规则生成' });
      if (rem && rem.ok) applied.push({ type: 'reminder', reminderId: rem.row.id, label: '创建提醒「' + rem.row.title + '」' });
    }
    if (r.action === 'log' && r.value) {
      await saveWork(Object.assign({}, w, { note: [w.note || '', r.value].filter(Boolean).join('\n') }), detailsOf(w.id));
      applied.push({ type: 'note', label: '记一条备注' });
    }
  }

  if (applied.length) {
    await pushRuleLog({
      id: runId,
      at: new Date().toISOString(),
      workId: w.id,
      workTitle: w.title,
      actions: applied
    });
  }
}

async function undoRuleRun(logId) {
  const logs = await readRuleLogs();
  const entry = logs.find((x) => x.id === logId);
  if (!entry) return { ok: false, error: '找不到这次执行' };
  const { getWork, saveWork, detailsOf, topics, reminders, tags, saveSetting } = await import('../core/repo.js');
  const { data } = await import('../core/repo.js');
  const w = getWork(entry.workId);
  let undone = 0;
  undoing = true;

  for (const a of (entry.actions || []).slice().reverse()) {
    if (a.type === 'tag' && w) {
      const tagIds = (w.tagIds || []).filter((x) => x !== a.tagId);
      if (tagIds.length !== (w.tagIds || []).length) {
        await saveWork(Object.assign({}, w, { tagIds }), detailsOf(w.id));
        w.tagIds = tagIds;
        undone++;
      }
    }
    if (a.type === 'topic') {
      const t = data.topics.find((x) => x.id === a.topicId);
      if (t && (t.workIds || []).indexOf(entry.workId) >= 0) {
        await topics.save(Object.assign({}, t, { workIds: t.workIds.filter((x) => x !== entry.workId) }));
        undone++;
      }
    }
    if (a.type === 'reminder') {
      const r = data.reminders.find((x) => x.id === a.reminderId);
      if (r) { await reminders.remove(r.id); undone++; }
    }
    if (a.type === 'note' && w && String(w.note || '').indexOf('\n') >= 0) {
      const lines = String(w.note || '').split('\n');
      lines.pop();
      await saveWork(Object.assign({}, w, { note: lines.join('\n') }), detailsOf(w.id));
      undone++;
    }
  }

  undoing = false;
  const rest = logs.filter((x) => x.id !== logId);
  await saveSetting('ruleLogs', rest);
  return { ok: true, undone };
}

export function initAssistant() {
  onWorkSaved((payload) => { runRules(payload); });
}

export const actions = {
  'rule-log-undo': async (el) => {
    const res = await undoRuleRun(el.dataset.id);
    toast(res.ok ? ('已回滚 ' + res.undone + ' 项改动') : res.error, res.ok ? '' : 'error');
    go('#/assistant/rules');
  },
  'ai-config': () => aiConfigModal(),
  'ai-key-del': async () => {
    await clearLLMKey();
    const m = document.querySelector('.modal-backdrop.is-on');
    if (m) m.remove();
    toast('已删除密钥');
    go('#/assistant/ai');
  },
  'ai-pick': (el) => {
    const id = el.dataset.id;
    const ids = (ui.aiWorks || []).slice();
    const i = ids.indexOf(id);
    if (i >= 0) ids.splice(i, 1); else ids.push(id);
    ui.aiWorks = ids;
    ui.aiPreview = '';
    go('#/assistant/ai');
  },
  'ai-clear': () => { ui.aiWorks = []; ui.aiPreview = ''; go('#/assistant/ai'); },
  'ai-preview': () => {
    const msgs = aiMessages();
    ui.aiPreview = msgs.map((m) => '【' + (m.role === 'system' ? '系统指令' : '发送内容') + '】\n' + m.content).join('\n\n');
    go('#/assistant/ai');
  },
  'ai-run': async () => {
    const cfg = llmConfig();
    if (!cfg.enabled) { toast('先在配置里开启联网 AI', 'error'); return; }
    if (!(ui.aiWorks || []).length) { toast('至少选一部作品，或先确认要发送的统计范围'); return; }
    const msgs = aiMessages();
    const chars = msgs.reduce((a, m) => a + m.content.length, 0);
    const inc = ui.aiInc || {};
    const scope = [
      (ui.aiWorks || []).length + ' 部作品',
      inc.exp !== false ? '体验记录' : '',
      inc.reviews !== false ? '总结' : '',
      inc.excerpts !== false ? '摘抄' : ''
    ].filter(Boolean).join('、');
    const ok = await confirmDialog({
      title: '确认把这些内容发送出去？',
      desc: '外发内容会提交给你配置的模型服务商，本机不再保留副本。',
      body: '<div class="kv"><div class="kv-row"><span>范围</span><b>' + esc(scope) + '</b></div>' +
        '<div class="kv-row"><span>字符数</span><b>' + chars + '</b></div>' +
        '<div class="kv-row"><span>模型</span><b>' + esc(cfg.model) + '</b></div></div>' +
        '<p class="muted" style="font-size:11.5px;margin-top:10px">主密码、账号库与密钥不在发送范围内。可以先用「预览将外发的数据」逐字核对。</p>',
      confirmText: '确认发送'
    });
    if (!ok) return;
    ui.aiPreview = msgs.map((m) => '【' + (m.role === 'system' ? '系统指令' : '发送内容') + '】\n' + m.content).join('\n\n');
    ui.aiBusy = true;
    ui.aiOut = '';
    ui.aiOutEdited = false;
    go('#/assistant/ai');
    try {
      const res = await chat(msgs);
      ui.aiBusy = false;
      ui.aiOut = res.text;
      toast('已返回，可继续编辑');
    } catch (e) {
      ui.aiBusy = false;
      toast(e.message || '请求失败', 'error');
    }
    go('#/assistant/ai');
  },
  'ai-save': async () => {
    if (!ui.aiOut) return;
    const title = await promptDialog({
      title: '保存为总结',
      label: '标题',
      value: 'AI 草稿 · ' + new Date().toISOString().slice(0, 10),
      confirmText: '保存'
    });
    if (!title) return;
    const first = (ui.aiWorks || [])[0] || '';
    const res = await reviews.save({
      id: '',
      workId: first,
      type: '笔记',
      title,
      body: ui.aiOut,
      rating: 0,
      date: todayISO(),
      sections: {},
      images: [],
      files: [],
      source: ui.aiOutEdited ? 'ai-edited' : 'ai',
      aiMeta: {
        model: llmConfig().model,
        at: new Date().toISOString(),
        edited: !!ui.aiOutEdited,
        task: ui.aiTask || 'digest',
        works: (ui.aiWorks || []).slice()
      }
    });
    if (!res.ok) { toast(res.error || '保存失败', 'error'); return; }
    ui.aiOut = '';
    ui.aiOutEdited = false;
    toast('已保存，来源已标注');
    go('#/review/' + res.row.id);
  },
  'ai-copy': async () => {
    try {
      await navigator.clipboard.writeText(ui.aiOut || '');
      toast('已复制');
    } catch (e) {
      toast('复制失败，请手动选中', 'error');
    }
  },
  'ai-discard': () => { ui.aiOut = ''; ui.aiOutEdited = false; go('#/assistant/ai'); },
  'ai-tab': (el) => {
    ui.aiTab = el.dataset.value;
    go('#/assistant/' + el.dataset.value);
  },
  'ai-import-run': async () => {
    const parsed = parseBulk(ui.aiImportText || '');
    if (!parsed.length) { toast('没有可导入的内容'); return; }
    let n = 0;
    for (const p of parsed) {
      const res = await saveWork({ id: '', type: p.type, title: p.title, creator: p.creator, year: p.year, status: 'wish', rating: 0 }, {});
      if (res.ok) n++;
    }
    ui.aiImportText = '';
    toast('已导入 ' + n + ' 部');
    go('#/works');
  },
  'ai-tag-apply': async (el) => {
    const w = getWork(el.dataset.id);
    if (!w) return;
    let tag = tagByName(el.dataset.value);
    if (!tag) tag = (await saveTag({ name: el.dataset.value })).row;
    if (!tag) { toast('创建标签失败', 'error'); return; }
    await saveWork(Object.assign({}, w, { tagIds: (w.tagIds || []).concat([tag.id]) }), detailsOf(w.id));
    toast('已加标签');
    go('#/assistant/tags');
  },
  'ai-ask-sample': (el) => {
    ui.aiQ = el.dataset.value;
    go('#/assistant/ask');
  },
  'ai-dupe-open': (el) => go('#/work/' + el.dataset.id),
  'ai-dupe-version': async (el) => {
    const a = getWork(el.dataset.a);
    const b = getWork(el.dataset.b);
    if (!a || !b) return;
    await addLink(entityKey('work', a.id), entityKey('work', b.id), '同一作品的不同版本');
    toast('已标为同一作品的不同版本，两侧详情页都能看到');
    go('#/work/' + a.id);
  },
  'ai-dupe-merge': async (el) => {
    const a = getWork(el.dataset.a);
    const b = getWork(el.dataset.b);
    if (!a || !b) return;
    const ok = await confirmDialog({
      title: '合并「' + b.title + '」到「' + a.title + '」？',
      desc: '体验、总结、摘抄、资源、实体、成就等关联会迁到 A，B 进入回收站。专属字段以 A 为准，不会被覆盖。',
      confirmText: '合并',
      danger: true
    });
    if (!ok) return;
    const res = await mergeWorks(b.id, a.id);
    if (!res.ok) { toast(res.error || '合并失败', 'error'); return; }
    const n = Object.keys(res.counts).reduce((x, k) => x + res.counts[k], 0);
    toast('已合并，迁移 ' + n + ' 条关联');
    go('#/work/' + a.id);
  },
  'rule-new': () => openRule(null),
  'rule-edit': (el) => openRule(el.dataset.id),
  'rule-del': async (el) => {
    const ok = await confirmDialog({ title: '删除这条规则？', confirmText: '删除', danger: true });
    if (!ok) return;
    await rules.remove(el.dataset.id);
    const m = document.querySelector('.modal-backdrop.is-on');
    if (m) m.remove();
    toast('已删除');
    go('#/assistant/rules');
  },
  'rule-toggle': async (el) => {
    const r = rules.get(el.dataset.id);
    if (!r) return;
    await rules.save(Object.assign({}, r, { enabled: el.checked }));
    toast(el.checked ? '规则已启用' : '规则已停用');
  }
};
