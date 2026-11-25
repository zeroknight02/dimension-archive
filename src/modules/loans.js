/* ==========================================================
   次元簿 · 借阅与共享管理（7.3）
   借出：我的书/碟在谁那里；借入：我借了谁的。
   逾期未还的排在最前，归还后归档但保留记录。
   ========================================================== */

import { data, loans, liveWorks, getWork, coverUrl } from '../core/repo.js';
import { LOAN_DIRECTIONS, LOAN_STATUSES } from '../core/schema.js';
import { ui, go } from '../core/state.js';
import { icon, toast, openModal, confirmDialog, emptyState } from '../core/ui.js';
import { esc, todayISO, initials, coverColor } from '../core/format.js';

function loanStatus(l) {
  if (l.returnedAt) return '已归还';
  if (l.status === '已遗失' || l.status === '已损坏') return l.status;
  const left = daysBetween(todayISO(), l.dueDate);
  if (left != null && left < 0) return '已逾期';
  return l.direction === 'in' ? '借入中' : '借出中';
}

function daysBetween(a, b) {
  if (!a || !b) return null;
  const t1 = new Date(a + 'T00:00:00').getTime();
  const t2 = new Date(b + 'T00:00:00').getTime();
  if (isNaN(t1) || isNaN(t2)) return null;
  return Math.round((t2 - t1) / 86400000);
}

export function loansView() {
  const tab = ui.loanTab || 'out';
  const all = loans.list();
  const active = all.filter((l) => !l.returnedAt);
  const list = all.filter((l) => (tab === 'done' ? !!l.returnedAt : (!l.returnedAt && (l.direction || 'out') === tab)))
    .sort((a, b) => {
      const da = daysBetween(todayISO(), a.dueDate);
      const db = daysBetween(todayISO(), b.dueDate);
      return (da == null ? 9999 : da) - (db == null ? 9999 : db);
    });

  let html = '<header class="page-head">' +
    '<div class="head-left"><button class="icon-btn" data-action="back" aria-label="返回">' + icon('back', 20) + '</button>' +
    '<div><p class="eyebrow">借阅与共享 · ' + active.length + ' 条在途</p><h1 class="page-title">借还</h1></div></div>' +
    '<div class="head-actions"><button class="icon-btn" data-action="loan-new" aria-label="新增">' + icon('plus', 20) + '</button></div>' +
    '</header>';

  html += '<div class="segbar" style="margin-bottom:14px">' +
    '<button class="' + (tab === 'out' ? 'is-on' : '') + '" data-action="loan-tab" data-value="out">借出 ' + active.filter((l) => (l.direction || 'out') === 'out').length + '</button>' +
    '<button class="' + (tab === 'in' ? 'is-on' : '') + '" data-action="loan-tab" data-value="in">借入 ' + active.filter((l) => l.direction === 'in').length + '</button>' +
    '<button class="' + (tab === 'done' ? 'is-on' : '') + '" data-action="loan-tab" data-value="done">已归还 ' + all.filter((l) => l.returnedAt).length + '</button>' +
    '</div>';

  if (!all.length) {
    return html + emptyState('·', '还没有借还记录', '书借给朋友、碟借自同事，记一条就不会忘。',
      '<button class="btn btn-primary btn-sm" data-action="loan-new">＋ 记一条</button>');
  }
  if (!list.length) return html + emptyState('·', '这里还没有记录', '换个标签看看。');

  return html + '<div class="rows">' + list.map((l) => {
    const w = l.workId ? getWork(l.workId) : null;
    const cover = w ? coverUrl(w) : '';
    const left = daysBetween(todayISO(), l.dueDate);
    const st = loanStatus(l);
    const overdue = st === '已逾期';
    return '<div class="rowitem is-static">' +
      '<button class="rowitem-hit" data-action="loan-edit" data-id="' + l.id + '" aria-label="编辑"></button>' +
      '<span class="cover" style="--cc:' + coverColor(w ? w.title : l.title || '?') + ';width:36px;flex:0 0 36px">' +
      (cover ? '<img src="' + esc(cover) + '" alt="">' : '<b>' + esc(initials(w ? w.title : l.title || '?')) + '</b>') + '</span>' +
      '<span class="rowitem-main"><b>' + esc(l.title || (w && w.title) || '未命名') + '</b>' +
      '<i>' + esc([(l.direction === 'in' ? '借自 ' : '借给 ') + (l.counterpart || '—'),
        l.date, l.dueDate ? '应还 ' + l.dueDate : '', l.returnedAt ? '已归还 ' + l.returnedAt : ''].filter(Boolean).join(' · ')) + '</i></span>' +
      '<span class="rowitem-side">' +
      '<span class="badge ' + (st === '已逾期' || st === '已遗失' ? 'is-error' : st === '已损坏' ? 'is-warn' : '') + '">' + esc(st) + '</span>' +
      (l.returnedAt ? '' : '<button class="btn btn-soft btn-xs" data-action="loan-return" data-id="' + l.id + '" style="margin-left:6px">归还</button>') +
      (overdue ? '<span class="muted" style="margin-left:6px;font-size:10.5px">逾期 ' + (-left) + ' 天</span>' : '') +
      '</span></div>';
  }).join('') + '</div>';
}

function workOptions(sel) {
  return '<option value="">不关联作品</option>' + liveWorks().sort((a, b) => String(a.title).localeCompare(String(b.title), 'zh-Hans-CN'))
    .map((w) => '<option value="' + w.id + '"' + (w.id === sel ? ' selected' : '') + '>' + esc(w.title) + '</option>').join('');
}

export function openLoan(id) {
  const cur = id ? loans.get(id) : null;
  const d = cur ? Object.assign({}, cur) : {
    id: '', workId: '', title: '', direction: 'out', counterpart: '',
    date: todayISO(), dueDate: '', returnedAt: '', note: ''
  };

  const body = '<div>' +
    '<div class="row2"><label class="field"><span class="field-label">方向</span><select class="select" id="ln-dir">' +
    LOAN_DIRECTIONS.map((x) => '<option value="' + x.value + '"' + (d.direction === x.value ? ' selected' : '') + '>' + x.label + '</option>').join('') +
    '</select></label>' +
    '<label class="field"><span class="field-label">对方</span><input class="input" id="ln-who" value="' + esc(d.counterpart) + '" placeholder="张三 / 同事"></label></div>' +
    '<label class="field"><span class="field-label">关联作品</span><select class="select" id="ln-work">' + workOptions(d.workId) + '</select></label>' +
    '<label class="field"><span class="field-label">名称（不关联作品时手填）</span><input class="input" id="ln-title" value="' + esc(d.title) + '"></label>' +
    '<div class="row2"><label class="field"><span class="field-label">借出 / 借入日期</span><input class="input" type="date" id="ln-date" value="' + esc(d.date) + '"></label>' +
    '<label class="field"><span class="field-label">约定归还日期</span><input class="input" type="date" id="ln-due" value="' + esc(d.dueDate) + '"></label></div>' +
    '<div class="row2"><label class="field"><span class="field-label">归还日期</span><input class="input" type="date" id="ln-back" value="' + esc(d.returnedAt) + '"></label>' +
    '<label class="field"><span class="field-label">状态</span><select class="select" id="ln-status">' +
    LOAN_STATUSES.map((x) => '<option' + ((d.status || '借出中') === x ? ' selected' : '') + '>' + x + '</option>').join('') + '</select></label></div>' +
    '<label class="field"><span class="field-label">备注</span><textarea class="textarea" id="ln-note" rows="2">' + esc(d.note) + '</textarea></label>' +
    (cur ? '<button type="button" class="btn btn-danger btn-sm" data-action="loan-del" data-id="' + cur.id + '">删除记录</button>' : '') +
    '</div>';

  openModal({
    title: cur ? '编辑借还' : '新增借还',
    body,
    wide: true,
    actions: [{ label: '取消', value: null, variant: 'ghost' }, { label: '保存', value: 'save', variant: 'primary' }],
    onMount: (root) => {
      const bind = (sel, key) => {
        const el = root.querySelector(sel);
        if (!el) return;
        el.addEventListener('input', () => { d[key] = el.value; });
        el.addEventListener('change', () => { d[key] = el.value; });
      };
      ['dir:direction', 'who:counterpart', 'work:workId', 'title:title', 'date:date', 'due:dueDate', 'back:returnedAt', 'note:note', 'status:status'].forEach((p) => {
        const [a, b] = p.split(':');
        bind('#ln-' + a, b);
      });
    }
  }).then(async (v) => {
    if (v !== 'save') return;
    if (!d.workId && !String(d.title || '').trim()) { toast('至少填名称或关联作品'); return; }
    const res = await loans.save(d);
    if (!res.ok) { toast(res.error || '保存失败', 'error'); return; }
    toast('已保存');
    go('#/loans');
  });
}

export const actions = {
  'loan-tab': (el) => { ui.loanTab = el.dataset.value; go('#/loans'); },
  'loan-new': () => openLoan(null),
  'loan-edit': (el) => openLoan(el.dataset.id),
  'loan-return': async (el) => {
    const cur = loans.get(el.dataset.id);
    if (!cur) return;
    const res = await loans.save(Object.assign({}, cur, { returnedAt: todayISO() }));
    toast(res.ok ? '已标记归还' : '操作失败', res.ok ? 'ok' : 'error');
    go('#/loans');
  },
  'loan-del': async (el) => {
    const ok = await confirmDialog({ title: '删除这条借还记录？', confirmText: '删除', danger: true });
    if (!ok) return;
    await loans.remove(el.dataset.id);
    const m = document.querySelector('.modal-backdrop.is-on');
    if (m) m.remove();
    toast('已删除');
    go('#/loans');
  }
};
