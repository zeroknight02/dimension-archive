/* ==========================================================
   次元簿 · 计划目标与提醒中心（7.4 / 7.6）
   7.4 目标按年设定，进度从体验记录与消费记录实时算，不手工填。
   7.6 提醒以站内清单为准；浏览器通知是可选的增强，需用户授权，
   且应用未运行时可能收不到，界面必须如实说明。
   ========================================================== */

import { data, goals, reminders, liveWorks, experiencesOf, detailsOf, bucketOf } from '../core/repo.js';
import { GOAL_KINDS, REMIND_REPEATS, TYPES, typeDef } from '../core/schema.js';
import { ui, go } from '../core/state.js';
import { icon, toast, openModal, confirmDialog, emptyState } from '../core/ui.js';
import { esc, todayISO, money, fmtHours } from '../core/format.js';

function yearOf(v) { return String(v || '').slice(0, 4); }

function scopeWorks(goal) {
  const year = String(goal.year || new Date().getFullYear());
  const list = liveWorks().filter((w) => {
    if (goal.scope && goal.scope !== 'all' && goal.scope !== w.type) {
      const def = typeDef(goal.scope);
      if (def.id !== w.type) return false;
    }
    return true;
  });
  /* 只统计该年完成的（有完成日期或更新时间落在该年） */
  return list.filter((w) => {
    if (bucketOf(w) !== 'done') return false;
    const ex = experiencesOf(w.id).find((e) => bucketOf({ status: e.status }) === 'done' && e.endDate);
    const d = ex ? ex.endDate : (w.updatedAt || '').slice(0, 10);
    return yearOf(d) === year || (!d && String(goal.year) === String(new Date().getFullYear()));
  });
}

export function goalProgress(g) {
  if (g.kind === 'count') return scopeWorks(g).length;
  if (g.kind === 'hours') {
    return Math.round(scopeWorks(g).reduce((a, w) => {
      let h = 0;
      experiencesOf(w.id).forEach((e) => { if (e.progress && e.progress.hours) h += Number(e.progress.hours) || 0; });
      if (!h) h = Number(detailsOf(w.id).playTime) || 0;
      return a + h;
    }, 0));
  }
  if (g.kind === 'pages') {
    return scopeWorks(g).reduce((a, w) => a + (Number(detailsOf(w.id).pages) || 0), 0);
  }
  if (g.kind === 'amount') {
    const year = String(g.year || new Date().getFullYear());
    return Math.round(data.expenses.filter((e) => !e.deletedAt && yearOf(e.date) === year && (g.scope === 'all' || e.category === g.scope))
      .reduce((a, e) => a + (Number(e.amount) || 0), 0));
  }
  return 0;
}

export function plansView() {
  const year = String(ui.planYear || new Date().getFullYear());
  const list = goals.list().filter((g) => String(g.year) === year);
  const allYears = [...new Set(goals.list().map((g) => String(g.year)))].sort().reverse();
  if (allYears.indexOf(year) < 0) allYears.unshift(year);

  let html = '<header class="page-head">' +
    '<div class="head-left"><button class="icon-btn" data-action="back" aria-label="返回">' + icon('back', 20) + '</button>' +
    '<div><p class="eyebrow">计划 · ' + year + ' 年</p><h1 class="page-title">目标</h1></div></div>' +
    '<div class="head-actions"><button class="icon-btn" data-action="goal-new" aria-label="新增目标">' + icon('plus', 20) + '</button></div>' +
    '</header>';

  html += '<div class="row-flex" style="margin-bottom:10px"><button class="btn btn-ghost btn-sm" data-action="ics-export">' +
    icon('download', 14) + ' 导出日历（.ics）</button></div>' +
    '<div class="chips" style="margin-bottom:14px">' + allYears.map((y) =>
    '<button class="chip' + (y === year ? ' is-on' : '') + '" data-action="plan-year" data-value="' + y + '">' + y + '</button>').join('') + '</div>';

  if (!list.length) {
    html += emptyState('·', year + ' 年还没有目标', '比如「今年读完 30 本」「游戏时长不超过 200 小时」。',
      '<button class="btn btn-primary btn-sm" data-action="goal-new">＋ 设定目标</button>');
  } else {
    html += '<div class="goal-list">' + list.map((g) => {
      const cur = goalProgress(g);
      const pct = Math.min(100, Math.round(cur / (Number(g.target) || 1) * 100));
      const kindLabel = (GOAL_KINDS.find((k) => k.value === g.kind) || {}).label || '';
      const remain = Math.max(0, (Number(g.target) || 0) - cur);
      const now = new Date();
      const monthsGone = String(g.year) === String(now.getFullYear()) ? (now.getMonth() + 1) : 12;
      const rate = cur / Math.max(1, monthsGone);
      const eta = remain && rate > 0 ? Math.ceil(remain / rate) + ' 个月' : (remain ? '数据不足' : '已完成');
      const scopeLabel = g.scope && g.scope !== 'all' ? (typeDef(g.scope).label || g.scope) : '全部';
      return '<button class="goal-card" data-action="goal-edit" data-id="' + g.id + '">' +
        '<span class="goal-top"><b>' + esc(g.title || kindLabel) + '</b><em>' + pct + '%</em></span>' +
        '<span class="bar"><i style="width:' + pct + '%"></i></span>' +
        '<span class="goal-foot">' + esc(kindLabel) + ' · ' + esc(scopeLabel) +
        ' · ' + esc(g.kind === 'hours' ? fmtHours(cur) + ' / ' + g.target + ' 小时'
          : g.kind === 'amount' ? money(cur) + ' / ' + money(g.target)
            : cur + ' / ' + g.target) +
        ' · 预计还需 ' + esc(eta) + '</span></button>';
    }).join('') + '</div>';
  }

  html += reminderPanel(year);
  return html;
}

/* ---------------- 7.6 提醒 ---------------- */

function reminderPanel() {
  const all = reminders.list().filter((r) => !r.done);
  const today = todayISO();
  const rows = all.map((r) => {
    const diff = r.date ? Math.round((new Date(r.date + 'T00:00:00') - new Date(today + 'T00:00:00')) / 86400000) : null;
    return { r, diff };
  }).sort((a, b) => (a.diff == null ? 9999 : a.diff) - (b.diff == null ? 9999 : b.diff));

  const perm = (typeof Notification !== 'undefined') ? Notification.permission : 'unsupported';
  const notifyCard = '<div class="card" style="margin-bottom:12px"><div class="row-flex" style="justify-content:space-between;gap:10px">' +
    '<div><b style="font-size:13px">浏览器通知</b>' +
    '<p class="muted" style="font-size:11.5px;margin-top:3px">' +
    (perm === 'granted' ? '已授权。应用打开时可在到期当天弹出通知；应用关闭时不保证送达。'
      : perm === 'denied' ? '已被浏览器拒绝。站内清单与 ICS 导出仍然可靠。'
        : perm === 'unsupported' ? '当前浏览器不支持通知。请用站内清单或 ICS。'
          : '未授权。开启后应用打开时可在到期当天提醒；关闭应用时可能收不到。') +
    '</p></div>' +
    (perm === 'default' ? '<button class="btn btn-ghost btn-sm" data-action="notify-request">开启通知</button>'
      : perm === 'granted' ? '<button class="btn btn-ghost btn-sm" data-action="notify-test">发一条测试</button>' : '') +
    '</div></div>';

  let html = '<section class="section" style="margin-top:26px"><div class="section-head">' +
    '<h2 class="section-title">提醒</h2><span class="section-note">' + rows.length + ' 条待办</span></div>' + notifyCard;

  if (!rows.length) {
    return html + '<p class="muted" style="font-size:12.5px">没有待办提醒。可以给追更、会员到期、归还日期设一条。</p>' +
      '<button class="btn btn-ghost btn-sm" data-action="rem-new" style="margin-top:10px">＋ 新建提醒</button></section>';
  }

  html += '<div class="rows">' + rows.map((x) => {
    const r = x.r;
    const tone = x.diff == null ? '' : x.diff < 0 ? 'is-error' : x.diff <= 2 ? 'is-warn' : '';
    return '<div class="rowitem is-static">' +
      '<button class="rowitem-hit" data-action="rem-edit" data-id="' + r.id + '" aria-label="编辑"></button>' +
      '<span class="row-icon">' + icon('clock', 16) + '</span>' +
      '<span class="rowitem-main"><b>' + esc(r.title) + '</b>' +
      '<i>' + esc([r.date, r.time, (REMIND_REPEATS.find((p) => p.value === r.repeat) || {}).label, r.note].filter(Boolean).join(' · ')) + '</i></span>' +
      '<span class="rowitem-side">' + (x.diff == null ? '' :
        '<span class="badge ' + tone + '">' + (x.diff < 0 ? '逾期 ' + (-x.diff) + ' 天' : x.diff === 0 ? '今天' : x.diff + ' 天后') + '</span>') +
      '<button class="btn btn-soft btn-xs" data-action="rem-done" data-id="' + r.id + '" style="margin-left:6px">完成</button></span></div>';
  }).join('') + '</div>' +
    '<button class="btn btn-ghost btn-sm" data-action="rem-new" style="margin-top:12px">＋ 新建提醒</button></section>';

  return html;
}

export function openGoal(id) {
  const cur = id ? goals.get(id) : null;
  const d = cur ? Object.assign({}, cur) : {
    id: '', title: '', year: String(ui.planYear || new Date().getFullYear()),
    kind: 'count', target: 12, scope: 'all', note: ''
  };

  const body = '<div>' +
    '<label class="field"><span class="field-label">目标名称</span><input class="input" id="gl-title" value="' + esc(d.title) + '" placeholder="今年读完 30 本"></label>' +
    '<div class="row2"><label class="field"><span class="field-label">年份</span><input class="input" type="number" id="gl-year" value="' + esc(d.year) + '"></label>' +
    '<label class="field"><span class="field-label">统计方式</span><select class="select" id="gl-kind">' +
    GOAL_KINDS.map((k) => '<option value="' + k.value + '"' + (d.kind === k.value ? ' selected' : '') + '>' + k.label + '</option>').join('') + '</select></label></div>' +
    '<div class="row2"><label class="field"><span class="field-label">目标值</span><input class="input" type="number" id="gl-target" value="' + esc(d.target) + '"></label>' +
    '<label class="field"><span class="field-label">范围</span><select class="select" id="gl-scope">' +
    '<option value="all"' + (d.scope === 'all' ? ' selected' : '') + '>全部类型</option>' +
    TYPES.map((t) => '<option value="' + t.id + '"' + (d.scope === t.id ? ' selected' : '') + '>' + esc(t.label) + '</option>').join('') +
    '</select></label></div>' +
    '<p class="muted" style="font-size:11.5px;line-height:1.7;margin-bottom:10px">进度由体验记录与消费记录自动计算，不用手工填。</p>' +
    (cur ? '<button type="button" class="btn btn-danger btn-sm" data-action="goal-del" data-id="' + cur.id + '">删除目标</button>' : '') +
    '</div>';

  openModal({
    title: cur ? '编辑目标' : '设定目标',
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
      bind('#gl-title', 'title');
      bind('#gl-year', 'year');
      bind('#gl-kind', 'kind');
      bind('#gl-target', 'target', true);
      bind('#gl-scope', 'scope');
    }
  }).then(async (v) => {
    if (v !== 'save') return;
    if (!String(d.title || '').trim()) d.title = (GOAL_KINDS.find((k) => k.value === d.kind) || {}).label || '目标';
    const res = await goals.save(d);
    if (!res.ok) { toast(res.error || '保存失败', 'error'); return; }
    ui.planYear = String(d.year);
    toast('已保存');
    go('#/plans');
  });
}

export function openReminder(id) {
  const cur = id ? reminders.get(id) : null;
  const d = cur ? Object.assign({}, cur) : { id: '', title: '', date: todayISO(), time: '', repeat: 'none', note: '', done: false };

  const body = '<div>' +
    '<label class="field"><span class="field-label">提醒内容</span><input class="input" id="rm-title" value="' + esc(d.title) + '" placeholder="某剧更新 / 会员到期"></label>' +
    '<div class="row2"><label class="field"><span class="field-label">日期</span><input class="input" type="date" id="rm-date" value="' + esc(d.date) + '"></label>' +
    '<label class="field"><span class="field-label">时间（可选）</span><input class="input" type="time" id="rm-time" value="' + esc(d.time) + '"></label></div>' +
    '<label class="field"><span class="field-label">重复</span><select class="select" id="rm-repeat">' +
    REMIND_REPEATS.map((p) => '<option value="' + p.value + '"' + (d.repeat === p.value ? ' selected' : '') + '>' + p.label + '</option>').join('') + '</select></label>' +
    '<label class="field"><span class="field-label">备注</span><textarea class="textarea" id="rm-note" rows="2">' + esc(d.note) + '</textarea></label>' +
    (cur ? '<button type="button" class="btn btn-danger btn-sm" data-action="rem-del" data-id="' + cur.id + '">删除提醒</button>' : '') +
    '</div>';

  openModal({
    title: cur ? '编辑提醒' : '新建提醒',
    body,
    actions: [{ label: '取消', value: null, variant: 'ghost' }, { label: '保存', value: 'save', variant: 'primary' }],
    onMount: (root) => {
      const bind = (sel, key) => {
        const el = root.querySelector(sel);
        if (!el) return;
        el.addEventListener('input', () => { d[key] = el.value; });
        el.addEventListener('change', () => { d[key] = el.value; });
      };
      bind('#rm-title', 'title');
      bind('#rm-date', 'date');
      bind('#rm-time', 'time');
      bind('#rm-repeat', 'repeat');
      bind('#rm-note', 'note');
    }
  }).then(async (v) => {
    if (v !== 'save') return;
    if (!String(d.title || '').trim()) { toast('内容不能为空', 'error'); return; }
    const res = await reminders.save(d);
    if (!res.ok) { toast(res.error || '保存失败', 'error'); return; }
    toast('已保存');
    go('#/plans');
  });
}

function nextDate(date, repeat) {
  const d = new Date(date + 'T00:00:00');
  if (isNaN(d.getTime())) return date;
  if (repeat === 'daily') d.setDate(d.getDate() + 1);
  else if (repeat === 'weekly') d.setDate(d.getDate() + 7);
  else if (repeat === 'monthly') d.setMonth(d.getMonth() + 1);
  else if (repeat === 'yearly') d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

/* 7.6 如实说明 PWA 限制：站内清单为主，系统日历靠 ICS */
function icsEscape(t) {
  return String(t || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
}

function buildICS() {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Dimension Archive//CN', 'CALSCALE:GREGORIAN'];
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const push = (uid, date, title, repeat, note) => {
    if (!date) return;
    const d = date.replace(/-/g, '');
    lines.push('BEGIN:VEVENT');
    lines.push('UID:' + uid + '@dimension-archive');
    lines.push('DTSTAMP:' + stamp);
    lines.push('DTSTART;VALUE=DATE:' + d);
    lines.push('SUMMARY:' + icsEscape(title));
    if (note) lines.push('DESCRIPTION:' + icsEscape(note));
    if (repeat === 'daily') lines.push('RRULE:FREQ=DAILY');
    else if (repeat === 'weekly') lines.push('RRULE:FREQ=WEEKLY');
    else if (repeat === 'monthly') lines.push('RRULE:FREQ=MONTHLY');
    else if (repeat === 'yearly') lines.push('RRULE:FREQ=YEARLY');
    lines.push('END:VEVENT');
  };
  data.reminders.filter((r) => !r.deletedAt && !r.done).forEach((r) => push(r.id, r.date, r.title, r.repeat, r.note));
  data.subscriptions.filter((s) => !s.deletedAt && s.endDate).forEach((s) => push(s.id, s.endDate, s.platform + ' 到期', '', s.plan));
  data.loans.filter((l) => !l.deletedAt && !l.returnedAt && l.dueDate).forEach((l) => push(l.id, l.dueDate, '归还 · ' + (l.title || '借阅'), '', l.counterpart));
  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

export const actions = {
  'notify-request': async () => {
    if (typeof Notification === 'undefined') { toast('当前浏览器不支持通知', 'error'); return; }
    try {
      const p = await Notification.requestPermission();
      toast(p === 'granted' ? '已开启浏览器通知' : '没有获得通知权限，站内清单照常可用');
    } catch (e) {
      toast('通知权限申请失败', 'error');
    }
    go('#/plans');
  },
  'notify-test': async () => {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
      toast('还没有通知权限', 'error');
      return;
    }
    try {
      new Notification('次元簿', {
        body: '这是一条测试通知。应用关闭时可能收不到，重要事项请用 ICS 导入系统日历。',
        tag: 'dimension-archive-test'
      });
      toast('已发送测试通知');
    } catch (e) {
      toast('发送失败，可能被系统拦截', 'error');
    }
  },
  'ics-export': async () => {
    const { downloadBlob } = await import('../core/backup.js');
    downloadBlob(new Blob([buildICS()], { type: 'text/calendar;charset=utf-8' }), 'dimension-archive.ics');
    toast('已导出，可导入系统日历');
  },
  'plan-year': (el) => { ui.planYear = el.dataset.value; go('#/plans'); },
  'goal-new': () => openGoal(null),
  'goal-edit': (el) => openGoal(el.dataset.id),
  'goal-del': async (el) => {
    const ok = await confirmDialog({ title: '删除这个目标？', confirmText: '删除', danger: true });
    if (!ok) return;
    await goals.remove(el.dataset.id);
    const m = document.querySelector('.modal-backdrop.is-on');
    if (m) m.remove();
    toast('已删除');
    go('#/plans');
  },
  'rem-new': () => openReminder(null),
  'rem-edit': (el) => openReminder(el.dataset.id),
  'rem-done': async (el) => {
    const r = reminders.get(el.dataset.id);
    if (!r) return;
    if (r.repeat && r.repeat !== 'none') {
      await reminders.save(Object.assign({}, r, { date: nextDate(r.date, r.repeat) }));
      toast('已完成，已排到下一次');
    } else {
      await reminders.save(Object.assign({}, r, { done: true }));
      toast('已完成');
    }
    go('#/plans');
  },
  'rem-del': async (el) => {
    const ok = await confirmDialog({ title: '删除这条提醒？', confirmText: '删除', danger: true });
    if (!ok) return;
    await reminders.remove(el.dataset.id);
    const m = document.querySelector('.modal-backdrop.is-on');
    if (m) m.remove();
    toast('已删除');
    go('#/plans');
  }
};
