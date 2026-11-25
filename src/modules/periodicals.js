/* ==========================================================
   次元簿 · 刊系档案（说明书 5.2.3）
   同一刊名的每一期仍是独立作品档案；刊系只是按刊名做的聚合视图，
   不复制数据，也不把多期压成一条记录。
   ========================================================== */

import * as repo from '../core/repo.js';
import { periodicalGroups } from '../core/repo.js';
import { typeDef } from '../core/schema.js';
import { icon, toast, emptyState, openModal } from '../core/ui.js';
import { esc } from '../core/format.js';
import { startNew } from './workForm.js';

function groupByKey(key) {
  return periodicalGroups().find((g) => g.key === key) || null;
}

export function periodicalsView() {
  const groups = periodicalGroups();
  const totalIssues = groups.reduce((a, g) => a + g.count, 0);
  const totalMissing = groups.reduce((a, g) => a + g.missing.length, 0);

  let html = '<header class="page-head">' +
    '<div class="head-left"><button class="icon-btn" data-action="back" aria-label="返回">' + icon('back', 20) + '</button>' +
    '<div><p class="eyebrow">期刊 · ' + groups.length + ' 个刊系</p><h1 class="page-title">刊系档案</h1></div></div>' +
    '<div class="head-actions"><button class="icon-btn" data-action="per-new" aria-label="新增一期">' + icon('plus', 20) + '</button></div>' +
    '</header>';

  html += '<p class="fan-hint">每一期都是独立档案，按（年 + 期号）排序；同一刊名自动归到一个刊系里。' +
    '缺期按连续期号推算，只作提示，不会替你补记录。</p>';

  if (!groups.length) {
    return html + emptyState('·', '还没有期刊或报纸', '先建一期，刊名相同的其它期会自动归到一起。',
      '<button class="btn btn-primary btn-sm" data-action="per-new">＋ 新增一期</button>');
  }

  html += '<div class="stat-grid" style="margin-bottom:16px">' +
    '<div class="stat"><b>' + groups.length + '</b><span>刊系</span></div>' +
    '<div class="stat"><b>' + totalIssues + '</b><span>已收录期数</span></div>' +
    '<div class="stat"><b>' + totalMissing + '</b><span>疑似缺期</span></div>' +
    '</div>';

  html += '<div class="per-grid">' + groups.map((g) => {
    const def = typeDef(g.type);
    return '<a class="per-card" href="#/periodical/' + encodeURIComponent(g.key) + '">' +
      '<span class="per-top"><i class="per-kind" style="--tc:' + def.color + '">' + icon('book', 12) + esc(def.label) + '</i>' +
      (g.missing.length ? '<span class="badge is-warn">缺 ' + g.missing.length + '</span>' : '') + '</span>' +
      '<b class="per-name">' + esc(g.name) + '</b>' +
      '<span class="per-meta">' + esc([g.first + '–' + g.last, g.count + ' 期', g.done + ' 期已读'].filter(Boolean).join(' · ')) + '</span>' +
      '<span class="per-last">' + (g.latest ? '最近：' + esc([g.latest.year, g.latest.no ? '第 ' + g.latest.no + ' 期' : '', g.latest.work.status === 'done' ? '已读' : ''].filter(Boolean).join(' · ')) : '') + '</span>' +
      '<span class="per-bar"><i style="width:' + (g.count ? Math.round(g.done / g.count * 100) : 0) + '%"></i></span>' +
      '</a>';
  }).join('') + '</div>';

  return html;
}

export function periodicalDetail(key) {
  const g = key ? groupByKey(key) : null;
  if (!g) {
    return '<header class="page-head"><div><h1 class="page-title">刊系不存在</h1></div></header>' +
      '<p class="muted">它可能还没有任何一期，或者刚被删除。</p>' +
      '<div style="margin-top:16px"><button class="btn btn-ghost btn-sm" data-action="go" data-to="#/periodicals">返回刊系</button></div>';
  }

  const def = typeDef(g.type);
  const byYear = {};
  g.issues.forEach((it) => { (byYear[it.year || '未标年份'] = byYear[it.year || '未标年份'] || []).push(it); });

  let html = '<header class="page-head">' +
    '<div class="head-left"><button class="icon-btn" data-action="back" aria-label="返回">' + icon('back', 20) + '</button>' +
    '<div><p class="eyebrow">' + esc(def.label) + ' · 刊系</p><h1 class="page-title">' + esc(g.name) + '</h1></div></div>' +
    '<div class="head-actions"><button class="icon-btn" data-action="per-add" data-key="' + esc(g.key) + '" aria-label="新增一期">' + icon('plus', 20) + '</button></div>' +
    '</header>';

  html += '<div class="stat-grid" style="margin-bottom:16px">' +
    '<div class="stat"><b>' + g.count + '</b><span>收录期数</span></div>' +
    '<div class="stat"><b>' + esc(g.first || '—') + '–' + esc(g.last || '—') + '</b><span>年份跨度</span></div>' +
    '<div class="stat"><b>' + g.missing.length + '</b><span>疑似缺期</span></div>' +
    '</div>';

  html += Object.keys(byYear).sort().map((y) => {
    const yearRow = byYear[y];
    const nums = yearRow.filter((x) => x.no > 0).map((x) => x.no).sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < nums.length; i++) {
      for (let n = nums[i - 1] + 1; n < nums[i]; n++) gaps.push(n);
    }
    return '<section class="section"><div class="section-head"><h2 class="section-title">' + esc(y) + '</h2>' +
      '<span class="section-note">' + yearRow.length + ' 期' + (gaps.length ? ' · 缺 ' + gaps.join('、') : '') + '</span></div>' +
      '<div class="issue-grid">' +
      yearRow.map((it) => {
        const done = repo.bucketOf(it.work) === 'done';
        return '<a class="issue' + (done ? ' is-done' : '') + '" href="#/work/' + it.work.id + '">' +
          '<b>' + (it.no ? '第 ' + it.no + ' 期' : '未标期号') + '</b>' +
          '<i>' + esc([it.date || '', (repo.detailsOf(it.work).volumeNo ? '卷 ' + repo.detailsOf(it.work).volumeNo : '')].filter(Boolean).join(' · ') || '—') + '</i>' +
          '<span>' + esc(repo.statusText(it.work)) + '</span>' +
          '</a>';
      }).join('') +
      gaps.map((n) => '<button class="issue is-missing" data-action="per-fill" data-key="' + esc(g.key) + '" data-year="' + esc(y) + '" data-no="' + n + '">' +
        '<b>第 ' + n + ' 期</b><i>缺</i><span>补录</span></button>').join('') +
      '</div></section>';
  }).join('');

  /* 未标年份的期单独列 */
  if (byYear['未标年份']) {
    html += '<p class="muted" style="font-size:12px">有 ' + byYear['未标年份'].length + ' 期没有年份，建议补上出版日期，否则无法判断缺期。</p>';
  }

  return html;
}

function addIssue(key, year, no) {
  const g = key ? groupByKey(key) : null;
  const type = g ? g.type : 'magazine';
  const name = g ? g.name : '';
  startNew(type, false, {
    title: name,
    year: year || String(new Date().getFullYear()),
    fields: { magName: name, issueNo: no || '' , issueDate: (year || new Date().getFullYear()) + '-01-01' }
  });
}

export const actions = {
  'per-new': () => {
    openModal({
      title: '新增一期',
      desc: '刊名相同的期会自动归入同一刊系。',
      body: '<div>' +
        '<div class="row2"><label class="field"><span class="field-label">刊名</span><input class="input" id="per-name" placeholder="读者 / 三联生活周刊"></label>' +
        '<label class="field"><span class="field-label">类型</span><select class="select" id="per-type"><option value="magazine">期刊</option><option value="newspaper">报纸</option></select></label></div>' +
        '<div class="row2"><label class="field"><span class="field-label">年份</span><input class="input" type="number" id="per-year" value="' + new Date().getFullYear() + '"></label>' +
        '<label class="field"><span class="field-label">期号</span><input class="input" type="number" id="per-no" placeholder="12"></label></div>' +
        '</div>',
      actions: [{ label: '取消', value: null, variant: 'ghost' }, { label: '继续填写', value: 'ok', variant: 'primary' }]
    }).then((v) => {
      if (v !== 'ok') return;
      const name = (document.getElementById('per-name') || {}).value || '';
      if (!name.trim()) { toast('刊名不能为空'); return; }
      const type = (document.getElementById('per-type') || {}).value || 'magazine';
      const year = (document.getElementById('per-year') || {}).value || '';
      const no = (document.getElementById('per-no') || {}).value || '';
      startNew(type, false, {
        title: name.trim(),
        year,
        fields: { magName: name.trim(), issueNo: no, issueDate: year ? year + '-01-01' : '' }
      });
    });
  },
  'per-add': (el) => addIssue(el.dataset.key, '', ''),
  'per-fill': (el) => addIssue(el.dataset.key, el.dataset.year, el.dataset.no)
};
