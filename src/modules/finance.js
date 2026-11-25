/* ==========================================================
   次元簿 · 文化消费与订阅（7.1 / 7.2）
   7.1 记「为文化花了多少」，可按类别与月份看结构；
   7.2 记「每月固定扣多少」，按周期折算成月均，到期前提醒。
   金额按币种分开统计，不做汇率换算（无联网汇率，不编造）。
   ========================================================== */

import { data, expenses, subscriptions, liveWorks, getWork } from '../core/repo.js';
import { EXPENSE_CATEGORIES, SUB_CYCLES, PAY_METHODS } from '../core/schema.js';
import { ui, go } from '../core/state.js';
import { setting, saveSetting } from '../core/repo.js';
import { icon, toast, openModal, confirmDialog, emptyState } from '../core/ui.js';
import { esc, money, todayISO } from '../core/format.js';

function moneyList(map) {
  const keys = Object.keys(map).filter((k) => map[k]);
  if (!keys.length) return '—';
  return keys.map((k) => money(map[k], k === 'CNY' ? '¥' : k + ' ')).join(' / ');
}

function monthlyCost(sub) {
  const a = Number(sub.amount) || 0;
  if (sub.cycle === 'year') return a / 12;
  if (sub.cycle === 'quarter') return a / 3;
  return a;
}

function daysTo(date) {
  if (!date) return null;
  const t = new Date(date + 'T00:00:00').getTime();
  if (isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / 86400000);
}

export function financeView() {
  const tab = (ui.route.id === 'subs' || ui.route.id === 'expenses') ? ui.route.id : (ui.financeTab || 'expenses');
  let html = '<header class="page-head">' +
    '<div class="head-left"><button class="icon-btn" data-action="back" aria-label="返回">' + icon('back', 20) + '</button>' +
    '<div><p class="eyebrow">生活管理 · 文化消费</p><h1 class="page-title">消费与订阅</h1></div></div>' +
    '<div class="head-actions"><button class="icon-btn" data-action="' + (tab === 'expenses' ? 'expense-new' : 'sub-new') + '" aria-label="新增">' + icon('plus', 20) + '</button></div>' +
    '</header>';

  html += '<div class="segbar" style="margin-bottom:16px">' +
    '<button class="' + (tab === 'expenses' ? 'is-on' : '') + '" data-action="fin-tab" data-value="expenses">消费记录</button>' +
    '<button class="' + (tab === 'subs' ? 'is-on' : '') + '" data-action="fin-tab" data-value="subs">订阅会员</button>' +
    '</div>';

  return html + (tab === 'expenses' ? expensesPanel() : subsPanel());
}

/* ---------------- 7.1 消费记录 ---------------- */

function expensesPanel() {
  const all = expenses.list().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  if (!all.length) {
    return emptyState('·', '还没有消费记录', '买书、买票、充会员都可以记一笔，之后能看到钱花在哪。',
      '<button class="btn btn-primary btn-sm" data-action="expense-new">＋ 记一笔</button>');
  }

  const byCat = {};
  const byMonth = {};
  const byCur = {};
  all.forEach((e) => {
    const cur = e.currency || 'CNY';
    byCat[e.category || '其他'] = byCat[e.category || '其他'] || {};
    byCat[e.category || '其他'][cur] = (byCat[e.category || '其他'][cur] || 0) + (Number(e.amount) || 0);
    const m = String(e.date || '').slice(0, 7);
    if (m) {
      byMonth[m] = byMonth[m] || {};
      byMonth[m][cur] = (byMonth[m][cur] || 0) + (Number(e.amount) || 0);
    }
    byCur[cur] = (byCur[cur] || 0) + (Number(e.amount) || 0);
  });

  const months = Object.keys(byMonth).sort().slice(-6).reverse();
  const totalAll = {};
  all.forEach((e) => { const c = e.currency || 'CNY'; totalAll[c] = (totalAll[c] || 0) + (Number(e.amount) || 0); });

  const budget = Number(setting('budgetYear', 0)) || 0;
  const yearSpend = all.filter((e) => String(e.date || '').slice(0, 4) === String(new Date().getFullYear()))
    .reduce((a, e) => a + (Number(e.amount) || 0), 0);
  let budgetHTML = '';
  if (budget) {
    const pct = Math.min(100, Math.round(yearSpend / budget * 100));
    budgetHTML = '<div class="card" style="margin-bottom:16px"><div class="row-flex" style="justify-content:space-between;margin-bottom:8px">' +
      '<span style="font-size:12.5px">今年预算执行</span><b class="mono">' + Math.round(yearSpend) + ' / ' + budget + '</b></div>' +
      '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
      '<p class="muted" style="font-size:11px;margin-top:8px">已用 ' + pct + '%，剩余 ' + Math.max(0, budget - Math.round(yearSpend)) + ' 元。预算仅作自我参考。</p></div>';
  }

  let html = budgetHTML + '<div class="stat-grid" style="margin-bottom:16px">' +
    '<div class="stat"><b>' + all.length + '</b><span>笔数</span></div>' +
    '<div class="stat"><b>' + moneyList(totalAll) + '</b><span>合计</span></div>' +
    '<div class="stat"><b>' + moneyList(byMonth[months[0]] || {}) + '</b><span>最近一月</span></div>' +
    '<div class="stat"><b>' + Object.keys(byCat).length + '</b><span>消费类别</span></div>' +
    '</div>';

  html += '<div class="row-flex" style="margin-bottom:14px"><button class="btn btn-ghost btn-sm" data-action="budget-set">' +
    (budget ? '调整年度预算' : '设置年度预算') + '</button></div>' +
    '<section class="section"><div class="section-head"><h2 class="section-title">按类别</h2></div>' +
    '<div class="barchart">' + Object.keys(byCat).sort((a, b) => {
      const sa = Object.values(byCat[b]).reduce((x, y) => x + y, 0);
      const sb = Object.values(byCat[a]).reduce((x, y) => x + y, 0);
      return sa - sb;
    }).slice(0, 8).map((k) => {
      const v = Object.values(byCat[k]).reduce((x, y) => x + y, 0);
      const max = Math.max(...Object.keys(byCat).map((c) => Object.values(byCat[c]).reduce((x, y) => x + y, 0)));
      return '<div class="barrow"><span class="barlabel">' + esc(k) + '</span>' +
        '<span class="bartrack"><i style="width:' + Math.round(v / max * 100) + '%"></i></span>' +
        '<span class="barvalue">' + esc(moneyList(byCat[k])) + '</span></div>';
    }).join('') + '</div></section>';

  if (months.length) {
    html += '<section class="section"><div class="section-head"><h2 class="section-title">按月</h2>' +
      '<span class="section-note">最近 6 个月</span></div>' +
      '<div class="kv">' + months.map((m) => '<div class="kv-row"><span>' + esc(m) + '</span><b>' +
        esc(moneyList(byMonth[m])) + '</b></div>').join('') + '</div></section>';
  }

  html += '<section class="section"><div class="section-head"><h2 class="section-title">明细</h2>' +
    '<span class="section-note">' + all.length + ' 笔</span></div>' +
    '<div class="rows">' + all.slice(0, 60).map((e) => {
      const w = e.workId ? getWork(e.workId) : null;
      return '<button class="rowitem" data-action="expense-edit" data-id="' + e.id + '">' +
        '<span class="row-icon">' + icon('chart', 16) + '</span>' +
        '<span class="rowitem-main"><b>' + esc(e.category || '其他') + (w ? ' · ' + esc(w.title) : '') + '</b>' +
        '<i>' + esc([e.date, e.channel, e.payMethod, e.installments ? e.installments + ' 期' : '', e.note].filter(Boolean).join(' · ')) + '</i></span>' +
        '<span class="rowitem-side">' + esc(money(e.amount, (e.currency || 'CNY') === 'CNY' ? '¥' : e.currency + ' ')) + '</span></button>';
    }).join('') + '</div></section>';

  return html;
}

export function openExpense(id) {
  const cur = id ? expenses.get(id) : null;
  const d = cur ? Object.assign({}, cur) : { id: '', workId: '', category: '实体书', amount: '', currency: 'CNY', date: todayISO(), channel: '', note: '' };

  const body = '<div>' +
    '<div class="row2"><label class="field"><span class="field-label">类别</span><select class="select" id="ex-cat">' +
    EXPENSE_CATEGORIES.map((c) => '<option' + (d.category === c ? ' selected' : '') + '>' + esc(c) + '</option>').join('') + '</select></label>' +
    '<label class="field"><span class="field-label">金额</span><input class="input" type="number" step="0.01" id="ex-amt" value="' + esc(d.amount) + '"></label></div>' +
    '<div class="row2"><label class="field"><span class="field-label">币种</span><select class="select" id="ex-cur">' +
    ['CNY', 'USD', 'JPY', 'HKD', 'EUR'].map((c) => '<option' + (d.currency === c ? ' selected' : '') + '>' + c + '</option>').join('') + '</select></label>' +
    '<label class="field"><span class="field-label">日期</span><input class="input" type="date" id="ex-date" value="' + esc(d.date) + '"></label></div>' +
    '<label class="field"><span class="field-label">关联作品</span><select class="select" id="ex-work">' +
    '<option value="">不关联</option>' + liveWorks().sort((a, b) => String(a.title).localeCompare(String(b.title), 'zh-Hans-CN'))
      .map((w) => '<option value="' + w.id + '"' + (w.id === d.workId ? ' selected' : '') + '>' + esc(w.title) + '</option>').join('') +
    '</select></label>' +
    '<div class="row2"><label class="field"><span class="field-label">渠道</span><input class="input" id="ex-channel" value="' + esc(d.channel) + '" placeholder="京东 / 影院"></label>' +
    '<label class="field"><span class="field-label">支付方式</span><select class="select" id="ex-pay">' +
    PAY_METHODS.map((m) => '<option' + (d.payMethod === m ? ' selected' : '') + '>' + m + '</option>').join('') + '</select></label></div>' +
    '<div class="row2"><label class="field"><span class="field-label">分期期数（0 = 不分期）</span><input class="input" type="number" id="ex-inst" value="' + esc(d.installments || 0) + '"></label>' +
    '<label class="field"><span class="field-label">备注</span><input class="input" id="ex-note" value="' + esc(d.note) + '"></label></div>' +
    (cur ? '<button type="button" class="btn btn-danger btn-sm" data-action="expense-del" data-id="' + cur.id + '">删除这笔</button>' : '') +
    '</div>';

  openModal({
    title: cur ? '编辑消费' : '记一笔消费',
    body,
    wide: true,
    actions: [{ label: '取消', value: null, variant: 'ghost' }, { label: '保存', value: 'save', variant: 'primary' }],
    onMount: (root) => {
      const bind = (sel, key, num) => {
        const el = root.querySelector(sel);
        if (!el) return;
        const h = () => { d[key] = num ? (Number(el.value) || 0) : el.value; };
        el.addEventListener('input', h);
        el.addEventListener('change', h);
      };
      bind('#ex-cat', 'category');
      bind('#ex-amt', 'amount', true);
      bind('#ex-cur', 'currency');
      bind('#ex-date', 'date');
      bind('#ex-work', 'workId');
      bind('#ex-channel', 'channel');
      bind('#ex-note', 'note');
      bind('#ex-pay', 'payMethod');
      bind('#ex-inst', 'installments', true);
    }
  }).then(async (v) => {
    if (v !== 'save') return;
    if (!d.amount) { toast('金额不能为 0'); return; }
    const res = await expenses.save(d);
    if (!res.ok) { toast(res.error || '保存失败', 'error'); return; }
    toast('已记录');
    go('#/finance/expenses');
  });
}

/* ---------------- 7.2 订阅与会员 ---------------- */

function subsPanel() {
  const range = ui.subRange || 'all';
  const all = subscriptions.list().sort((a, b) => {
    const da = daysTo(a.endDate);
    const db = daysTo(b.endDate);
    return (da == null ? 9999 : da) - (db == null ? 9999 : db);
  });

  if (!all.length) {
    return emptyState('·', '还没有订阅记录', '视频、音乐、阅读会员记在这里，到期前会出现在首页提醒里。',
      '<button class="btn btn-primary btn-sm" data-action="sub-new">＋ 添加订阅</button>');
  }

  const monthly = all.filter((s) => s.active !== false).reduce((a, s) => a + monthlyCost(s), 0);
  const expiring = all.filter((s) => { const d = daysTo(s.endDate); return d != null && d <= 14 && d >= 0; });

  let html = '<div class="stat-grid" style="margin-bottom:16px">' +
    '<div class="stat"><b>' + all.length + '</b><span>订阅数</span></div>' +
    '<div class="stat"><b>' + money(monthly) + '</b><span>月均支出</span></div>' +
    '<div class="stat"><b>' + money(monthly * 12) + '</b><span>年化估算</span></div>' +
    '<div class="stat"><b>' + expiring.length + '</b><span>两周内到期</span></div>' +
    '</div>';

  html += '<div class="chips" style="margin-bottom:12px">' +
    [['all', '全部'], ['7', '7 天内到期'], ['30', '30 天内到期'], ['off', '已停用 / 已取消']].map((r) =>
      '<button class="chip' + (range === r[0] ? ' is-on' : '') + '" data-action="sub-range" data-value="' + r[0] + '">' + r[1] + '</button>').join('') +
    '</div>';

  const shown = all.filter((s) => {
    const d = daysTo(s.endDate);
    if (range === '7') return d != null && d >= 0 && d <= 7;
    if (range === '30') return d != null && d >= 0 && d <= 30;
    if (range === 'off') return s.active === false || !!s.cancelDate;
    return true;
  });

  html += '<div class="row-flex" style="margin-bottom:10px"><button class="btn btn-ghost btn-sm" data-action="sub-export">' +
    icon('download', 14) + ' 导出订阅清单</button></div>';

  html += '<div class="rows">' + (shown.length ? shown : []).map((s) => {
    const d = daysTo(s.endDate);
    const bad = d != null && d < 0;
    const warn = d != null && d <= 14 && d >= 0;
    return '<button class="rowitem" data-action="sub-edit" data-id="' + s.id + '">' +
      '<span class="logo-box">' + esc(String(s.platform || '?').slice(0, 1)) + '</span>' +
      '<span class="rowitem-main"><b>' + esc(s.platform) + '</b>' +
      '<i>' + esc([s.plan, s.cycle === 'year' ? '年付' : s.cycle === 'quarter' ? '季付' : '月付',
        money(s.amount, (s.currency || 'CNY') === 'CNY' ? '¥' : s.currency + ' '),
        s.payMethod || '', s.benefits ? '权益：' + s.benefits : '',
        s.endDate ? '到期 ' + s.endDate : '长期'].filter(Boolean).join(' · ')) + '</i></span>' +
      '<span class="rowitem-side">' + (s.cancelDate
        ? '<span class="badge">' + esc(s.cancelDate) + ' 已取消</span>'
        : s.endDate
          ? '<span class="badge ' + (bad ? 'is-error' : warn ? 'is-warn' : '') + '">' + (bad ? '已过期' : d === 0 ? '今天' : d + ' 天') + '</span>'
          : '<span class="badge">长期</span>') + '</span></button>';
  }).join('') + '</div>';

  if (!shown.length) html += '<p class="muted" style="font-size:12.5px">这个范围里没有订阅。</p>';

  html += '<p class="fan-hint" style="margin-top:14px">月均 = 年付 ÷ 12、季付 ÷ 3；只做本地估算，不代扣、不联网。</p>';
  return html;
}

export function openSub(id) {
  const cur = id ? subscriptions.get(id) : null;
  const d = cur ? Object.assign({}, cur) : {
    id: '', platform: '', plan: '', amount: '', currency: 'CNY', cycle: 'month',
    startDate: todayISO(), endDate: '', autoRenew: true, category: '视频', note: '', active: true
  };

  const body = '<div>' +
    '<div class="row2"><label class="field"><span class="field-label">平台</span><input class="input" id="sb-platform" value="' + esc(d.platform) + '"></label>' +
    '<label class="field"><span class="field-label">套餐</span><input class="input" id="sb-plan" value="' + esc(d.plan) + '" placeholder="年度会员 / 大会员"></label></div>' +
    '<div class="row2"><label class="field"><span class="field-label">金额</span><input class="input" type="number" step="0.01" id="sb-amount" value="' + esc(d.amount) + '"></label>' +
    '<label class="field"><span class="field-label">周期</span><select class="select" id="sb-cycle">' +
    SUB_CYCLES.map((c) => '<option value="' + c.value + '"' + (d.cycle === c.value ? ' selected' : '') + '>' + c.label + '</option>').join('') + '</select></label></div>' +
    '<div class="row2"><label class="field"><span class="field-label">开始日期</span><input class="input" type="date" id="sb-start" value="' + esc(d.startDate) + '"></label>' +
    '<label class="field"><span class="field-label">到期日期</span><input class="input" type="date" id="sb-end" value="' + esc(d.endDate) + '"></label></div>' +
    '<div class="row2"><label class="field"><span class="field-label">支付方式</span><select class="select" id="sb-pay">' +
    PAY_METHODS.map((m) => '<option' + (d.payMethod === m ? ' selected' : '') + '>' + m + '</option>').join('') + '</select></label>' +
    '<label class="field"><span class="field-label">取消日期（未取消留空）</span><input class="input" type="date" id="sb-cancel" value="' + esc(d.cancelDate) + '"></label></div>' +
    '<label class="field"><span class="field-label">会员权益</span><input class="input" id="sb-benefit" value="' + esc(d.benefits) + '" placeholder="4K / 免广告 / 双人共享"></label>' +
    '<label class="switch" style="margin:4px 0 12px"><input type="checkbox" id="sb-renew"' + (d.autoRenew ? ' checked' : '') + '><i></i><span>自动续费</span></label>' +
    '<label class="field"><span class="field-label">备注</span><textarea class="textarea" id="sb-note" rows="2">' + esc(d.note) + '</textarea></label>' +
    (cur ? '<button type="button" class="btn btn-danger btn-sm" data-action="sub-del" data-id="' + cur.id + '">删除订阅</button>' : '') +
    '</div>';

  openModal({
    title: cur ? '编辑订阅' : '添加订阅',
    body,
    wide: true,
    actions: [{ label: '取消', value: null, variant: 'ghost' }, { label: '保存', value: 'save', variant: 'primary' }],
    onMount: (root) => {
      const bind = (sel, key, num) => {
        const el = root.querySelector(sel);
        if (!el) return;
        const h = () => { d[key] = num ? (Number(el.value) || 0) : el.value; };
        el.addEventListener('input', h);
        el.addEventListener('change', h);
      };
      bind('#sb-platform', 'platform');
      bind('#sb-plan', 'plan');
      bind('#sb-amount', 'amount', true);
      bind('#sb-cycle', 'cycle');
      bind('#sb-start', 'startDate');
      bind('#sb-end', 'endDate');
      bind('#sb-note', 'note');
      bind('#sb-pay', 'payMethod');
      bind('#sb-cancel', 'cancelDate');
      bind('#sb-benefit', 'benefits');
      root.querySelector('#sb-renew').addEventListener('change', (e) => { d.autoRenew = e.target.checked; });
    }
  }).then(async (v) => {
    if (v !== 'save') return;
    if (!String(d.platform || '').trim()) { toast('平台不能为空', 'error'); return; }
    const res = await subscriptions.save(d);
    if (!res.ok) { toast(res.error || '保存失败', 'error'); return; }
    toast('已保存');
    go('#/finance/subs');
  });
}

export const actions = {
  'budget-set': async () => {
    const cur = Number(setting('budgetYear', 0)) || 0;
    const v = window.prompt('本年度文化消费预算（元，填 0 关闭）', String(cur));
    if (v === null) return;
    await saveSetting('budgetYear', Number(v) || 0);
    toast('已保存');
    go('#/finance/expenses');
  },
  'fin-tab': (el) => { ui.financeTab = el.dataset.value; go('#/finance/' + el.dataset.value); },
  'expense-new': () => openExpense(null),
  'expense-edit': (el) => openExpense(el.dataset.id),
  'expense-del': async (el) => {
    const ok = await confirmDialog({ title: '删除这笔消费？', confirmText: '删除', danger: true });
    if (!ok) return;
    await expenses.remove(el.dataset.id);
    const m = document.querySelector('.modal-backdrop.is-on');
    if (m) m.remove();
    toast('已删除');
    go('#/finance/expenses');
  },
  'sub-range': (el) => { ui.subRange = el.dataset.value; go('#/finance/subs'); },
  'sub-export': () => {
    const rows = [['平台', '套餐', '金额', '周期', '开始', '到期', '自动续费', '支付方式', '权益', '取消日期', '备注']];
    subscriptions.list().forEach((x) => rows.push([x.platform || '', x.plan || '', x.amount || '', x.cycle || '',
      x.startDate || '', x.endDate || '', x.autoRenew ? '是' : '否', x.payMethod || '', x.benefits || '',
      x.cancelDate || '', x.note || '']));
    const csv = rows.map((r) => r.map((c) => {
      const t = String(c == null ? '' : c);
      return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
    }).join(',')).join('\r\n');
    import('../core/backup.js').then((b) => {
      b.downloadBlob(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }), 'subscriptions-' + todayISO() + '.csv');
      toast('已导出 ' + (rows.length - 1) + ' 条');
    });
  },
  'sub-new': () => openSub(null),
  'sub-edit': (el) => openSub(el.dataset.id),
  'sub-del': async (el) => {
    const ok = await confirmDialog({ title: '删除这条订阅？', confirmText: '删除', danger: true });
    if (!ok) return;
    await subscriptions.remove(el.dataset.id);
    const m = document.querySelector('.modal-backdrop.is-on');
    if (m) m.remove();
    toast('已删除');
    go('#/finance/subs');
  }
};
