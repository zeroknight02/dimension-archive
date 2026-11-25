/* ==========================================================
   次元簿 · 游戏成就、多周目与截图（说明书 6.3）
   成就与周目各占一张表，作品档案只保留入口；
   截图复用附件表，不在业务记录里塞二进制。
   ========================================================== */

import {
  achievements, playthroughs, achievementsOf, achievementStats,
  playthroughsOf, playthroughStats, getWork, detailsOf, saveWork, saveReviewImage, imageUrl
} from '../core/repo.js';
import { ACHIEVEMENT_RARITIES, PLAYTHROUGH_MODES } from '../core/schema.js';
import { ui, go } from '../core/state.js';
import { icon, toast, openModal, confirmDialog } from '../core/ui.js';
import { esc, todayISO, ratingShort } from '../core/format.js';

const RARITY_LABEL = {};
ACHIEVEMENT_RARITIES.forEach((r) => { RARITY_LABEL[r.value] = r.label; });

function rarityTone(v) {
  return v === 'legend' ? 'is-gold' : v === 'epic' ? 'is-violet' : v === 'rare' ? 'is-ok' : '';
}

/* ---------------- 成就 ---------------- */

export function achievementsSection(w) {
  const list = achievementsOf(w.id);
  const st = achievementStats(w.id);

  let html = '<section class="section"><div class="section-head"><h2 class="section-title">成就</h2>' +
    '<div class="row-flex" style="gap:6px">' +
    '<button class="btn btn-ghost btn-xs" data-action="ach-bulk" data-id="' + w.id + '">批量录入</button>' +
    '<button class="btn btn-ghost btn-xs" data-action="ach-new" data-id="' + w.id + '">＋ 单个</button>' +
    '</div></div>';

  if (!list.length) {
    return html + '<p class="muted" style="font-size:12.5px">还没有记录成就。可以按「名称 | 描述 | 稀有度」批量粘贴，也可以逐个添加。</p></section>';
  }

  html += '<div class="card"><div class="row-flex" style="justify-content:space-between;margin-bottom:8px">' +
    '<span style="font-size:12.5px">已解锁 ' + st.done + ' / ' + st.total +
    (st.hidden ? ' · 隐藏 ' + st.hidden + ' 个' : '') + '</span>' +
    '<b class="mono">' + st.pct + '%</b></div>' +
    '<div class="bar"><i style="width:' + st.pct + '%"></i></div>' +
    (st.full ? '<p class="ach-full">全成就达成 · 记录于 ' + esc((list.find((a) => a.done) || {}).doneAt || '') + '</p>' : '') +
    '</div>';

  html += '<div class="ach-list">' + list.map((a) => {
    const prog = Number(a.total) > 0 ? Math.min(100, Math.round((Number(a.progress) || 0) / Number(a.total) * 100)) : 0;
    return '<div class="ach-row' + (a.done ? ' is-done' : '') + '">' +
      '<button class="ach-check" data-action="ach-toggle" data-id="' + a.id + '" aria-label="切换达成">' +
      (a.done ? icon('check', 13) : '') + '</button>' +
      '<span class="ach-main"><b>' + esc(a.name) + (a.hidden ? '<i class="ach-hidden">隐藏</i>' : '') + '</b>' +
      (a.desc ? '<i>' + esc(a.desc) + '</i>' : '') +
      (Number(a.total) > 0 ? '<span class="ach-prog"><i style="width:' + prog + '%"></i></span>' : '') +
      '</span>' +
      '<span class="ach-side">' +
      (a.rarity ? '<span class="badge ' + rarityTone(a.rarity) + '">' + esc(RARITY_LABEL[a.rarity] || a.rarity) + '</span>' : '') +
      (a.done && a.doneAt ? '<span class="ach-date">' + esc(a.doneAt) + '</span>' : '') +
      '<button class="icon-btn is-mini" data-action="ach-edit" data-id="' + a.id + '" aria-label="编辑">' + icon('edit', 15) + '</button>' +
      '</span></div>';
  }).join('') + '</div></section>';

  return html;
}

function achEditor(workId, id) {
  const cur = id ? achievements.get(id) : null;
  const d = cur ? Object.assign({}, cur) : {
    id: '', workId, name: '', desc: '', hidden: false, done: false,
    doneAt: '', rarity: 'common', progress: 0, total: 0, note: '', order: achievementsOf(workId).length
  };

  openModal({
    title: cur ? '编辑成就' : '添加成就',
    body: '<div>' +
      '<label class="field"><span class="field-label">成就名称</span><input class="input" id="ach-name" value="' + esc(d.name) + '"></label>' +
      '<label class="field"><span class="field-label">描述 / 达成条件</span><textarea class="textarea" id="ach-desc" rows="2">' + esc(d.desc) + '</textarea></label>' +
      '<div class="row2"><label class="field"><span class="field-label">稀有度</span><select class="select" id="ach-rarity">' +
      ACHIEVEMENT_RARITIES.map((r) => '<option value="' + r.value + '"' + (d.rarity === r.value ? ' selected' : '') + '>' + r.label + '</option>').join('') +
      '</select></label>' +
      '<label class="field"><span class="field-label">获得日期</span><input class="input" type="date" id="ach-date" value="' + esc(d.doneAt) + '"></label></div>' +
      '<div class="row2"><label class="field"><span class="field-label">分步进度</span><input class="input" type="number" id="ach-progress" value="' + esc(d.progress || 0) + '"></label>' +
      '<label class="field"><span class="field-label">分步总数（填 0 表示一次性）</span><input class="input" type="number" id="ach-total" value="' + esc(d.total || 0) + '"></label></div>' +
      '<label class="switch" style="margin-bottom:10px"><input type="checkbox" id="ach-done"' + (d.done ? ' checked' : '') + '><i></i><span>已达成</span></label>' +
      '<label class="switch" style="margin-bottom:10px"><input type="checkbox" id="ach-hidden"' + (d.hidden ? ' checked' : '') + '><i></i><span>隐藏成就（未达成时不显示名称）</span></label>' +
      (cur ? '<button type="button" class="btn btn-danger btn-sm" data-action="ach-del" data-id="' + cur.id + '">删除这个成就</button>' : '') +
      '</div>',
    actions: [{ label: '取消', value: null, variant: 'ghost' }, { label: '保存', value: 'ok', variant: 'primary' }],
    onMount: (root) => {
      root.querySelector('#ach-done').addEventListener('change', (e) => {
        d.done = e.target.checked;
        if (d.done && !d.doneAt) {
          d.doneAt = todayISO();
          const el = root.querySelector('#ach-date');
          if (el) el.value = d.doneAt;
        }
      });
      root.querySelector('#ach-hidden').addEventListener('change', (e) => { d.hidden = e.target.checked; });
    }
  }).then(async (v) => {
    if (v !== 'ok') return;
    const val = (id2) => {
      const el = document.getElementById(id2);
      return el ? el.value : '';
    };
    d.name = val('ach-name').trim();
    if (!d.name) { toast('成就名称不能为空'); return; }
    d.desc = val('ach-desc');
    d.rarity = val('ach-rarity');
    d.doneAt = val('ach-date');
    d.progress = Number(val('ach-progress')) || 0;
    d.total = Number(val('ach-total')) || 0;
    if (d.total > 0 && d.progress >= d.total) d.done = true;
    const res = await achievements.save(d);
    if (!res.ok) { toast(res.error || '保存失败', 'error'); return; }
    toast('已保存');
    go('#/work/' + workId);
  });
}

function achBulk(workId) {
  openModal({
    title: '批量录入成就',
    desc: '一行一个：名称 | 描述 | 稀有度（普通 / 稀有 / 史诗 / 传说）| 已达成（√）。后两段可省略。',
    wide: true,
    body: '<label class="field"><span class="field-label">成就清单</span>' +
      '<textarea class="textarea" id="ach-lines" rows="9" placeholder="初次通关 | 抵达结局 A | 普通 | √&#10;全收集 | 集齐 120 件藏品 | 史诗&#10;隐藏结局 | 在第三章前完成支线 | 传说"></textarea></label>',
    actions: [{ label: '取消', value: null, variant: 'ghost' }, { label: '导入', value: 'ok', variant: 'primary' }]
  }).then(async (v) => {
    if (v !== 'ok') return;
    const el = document.getElementById('ach-lines');
    const lines = String(el ? el.value : '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    let n = 0;
    let order = achievementsOf(workId).length;
    for (const line of lines) {
      const parts = line.split(/[|｜\t]/).map((x) => x.trim());
      const name = parts[0];
      if (!name) continue;
      const rarityHit = ACHIEVEMENT_RARITIES.find((r) => r.label === parts[2] || r.value === parts[2]);
      const done = parts.some((p) => /^(√|✓|是|已达成|达成)$/.test(p));
      const res = await achievements.save({
        id: '', workId, name, desc: parts[1] || '', rarity: rarityHit ? rarityHit.value : 'common',
        done, doneAt: done ? todayISO() : '', progress: 0, total: 0, hidden: false, order: order++
      });
      if (res.ok) n++;
    }
    toast('已导入 ' + n + ' 个成就');
    go('#/work/' + workId);
  });
}

/* ---------------- 多周目 ---------------- */

export function playthroughsSection(w) {
  const list = playthroughsOf(w.id);
  const st = playthroughStats(w.id);

  let html = '<section class="section"><div class="section-head"><h2 class="section-title">多周目</h2>' +
    '<button class="btn btn-ghost btn-xs" data-action="pt-new" data-id="' + w.id + '">＋ 记一周目</button></div>';

  if (!list.length) {
    return html + '<p class="muted" style="font-size:12.5px">还没有周目记录。二周目、挑战难度、不同结局都单独成条，不会覆盖首刷。</p></section>';
  }

  html += '<div class="kv" style="margin-bottom:10px">' +
    '<div class="kv-row"><span>周目数</span><b>' + st.count + ' 周目</b></div>' +
    (st.hours ? '<div class="kv-row"><span>累计时长</span><b>' + st.hours + ' 小时</b></div>' : '') +
    (st.last ? '<div class="kv-row"><span>最近一次</span><b>' + esc((st.last.endDate || st.last.startDate || '—') +
      (st.last.ending ? ' · ' + st.last.ending : '')) + '</b></div>' : '') +
    '</div>';

  html += '<div class="rows">' + list.map((p) => {
    const mode = (PLAYTHROUGH_MODES.find((m) => m.value === p.mode) || {}).label || '';
    return '<button class="rowitem" data-action="pt-edit" data-id="' + p.id + '">' +
      '<span class="pt-no">' + (p.no || 1) + '</span>' +
      '<span class="rowitem-main"><b>第 ' + (p.no || 1) + ' 周目' + (p.difficulty ? ' · ' + esc(p.difficulty) : '') + '</b>' +
      '<i>' + esc([mode, p.startDate, p.endDate, p.hours ? p.hours + ' 小时' : '',
      p.rating ? '★ ' + ratingShort(p.rating) : '', p.ending].filter(Boolean).join(' · ') || '未填写细节') + '</i></span>' +
      icon('right', 15) + '</button>';
  }).join('') + '</div></section>';

  return html;
}

function ptEditor(workId, id) {
  const cur = id ? playthroughs.get(id) : null;
  const list = playthroughsOf(workId);
  const nextNo = list.reduce((a, p) => Math.max(a, p.no || 1), 0) + 1;
  const d = cur ? Object.assign({}, cur) : {
    id: '', workId, no: nextNo, startDate: todayISO(), endDate: '', difficulty: '',
    ending: '', mode: 'replay', hours: '', rating: 0, note: ''
  };

  openModal({
    title: cur ? '编辑第 ' + d.no + ' 周目' : '记一周目',
    wide: true,
    body: '<div>' +
      '<div class="row2"><label class="field"><span class="field-label">周目序号</span><input class="input" type="number" id="pt-no" value="' + esc(d.no) + '"></label>' +
      '<label class="field"><span class="field-label">玩法类型</span><select class="select" id="pt-mode">' +
      PLAYTHROUGH_MODES.map((m) => '<option value="' + m.value + '"' + (d.mode === m.value ? ' selected' : '') + '>' + m.label + '</option>').join('') +
      '</select></label></div>' +
      '<div class="row2"><label class="field"><span class="field-label">开始</span><input class="input" type="date" id="pt-start" value="' + esc(d.startDate) + '"></label>' +
      '<label class="field"><span class="field-label">通关</span><input class="input" type="date" id="pt-end" value="' + esc(d.endDate) + '"></label></div>' +
      '<div class="row2"><label class="field"><span class="field-label">难度 / 规则差异</span><input class="input" id="pt-diff" value="' + esc(d.difficulty) + '" placeholder="噩梦 / 限制武器"></label>' +
      '<label class="field"><span class="field-label">时长（小时）</span><input class="input" type="number" step="0.5" id="pt-hours" value="' + esc(d.hours) + '"></label></div>' +
      '<div class="row2"><label class="field"><span class="field-label">结局</span><input class="input" id="pt-ending" value="' + esc(d.ending) + '" placeholder="结局 C / 真结局"></label>' +
      '<label class="field"><span class="field-label">本次评分</span><select class="select" id="pt-rating">' +
      '<option value="0">不评分</option>' + [10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((v) =>
        '<option value="' + v + '"' + (Number(d.rating) === v ? ' selected' : '') + '>' + v + ' 分</option>').join('') + '</select></label></div>' +
      '<label class="field"><span class="field-label">本次做了什么不同的事</span><textarea class="textarea" id="pt-note" rows="3">' + esc(d.note) + '</textarea></label>' +
      (cur ? '<button type="button" class="btn btn-danger btn-sm" data-action="pt-del" data-id="' + cur.id + '">删除这条周目</button>' : '') +
      '</div>',
    actions: [{ label: '取消', value: null, variant: 'ghost' }, { label: '保存', value: 'ok', variant: 'primary' }]
  }).then(async (v) => {
    if (v !== 'ok') return;
    const val = (x) => { const el = document.getElementById(x); return el ? el.value : ''; };
    d.no = Number(val('pt-no')) || nextNo;
    d.mode = val('pt-mode');
    d.startDate = val('pt-start');
    d.endDate = val('pt-end');
    d.difficulty = val('pt-diff');
    d.hours = val('pt-hours');
    d.ending = val('pt-ending');
    d.rating = Number(val('pt-rating')) || 0;
    d.note = val('pt-note');
    const res = await playthroughs.save(d);
    if (!res.ok) { toast(res.error || '保存失败', 'error'); return; }
    toast('已保存');
    go('#/work/' + workId);
  });
}

/* ---------------- 游戏截图 ---------------- */

export function shotsSection(w) {
  const shots = w.shots || [];
  return '<section class="section"><div class="section-head"><h2 class="section-title">游戏截图</h2>' +
    '<label class="btn btn-ghost btn-xs">＋ 添加<input type="file" accept="image/*" multiple id="shot-file" hidden></label></div>' +
    (shots.length
      ? '<div class="shot-grid">' + shots.map((s) =>
        '<figure class="shot"><img src="' + esc(imageUrl(s.id)) + '" alt="" loading="lazy">' +
        (s.caption ? '<figcaption>' + esc(s.caption) + '</figcaption>' : '') +
        '<button class="shot-del" data-action="shot-del" data-id="' + s.id + '" data-work="' + w.id + '" aria-label="移除">×</button></figure>').join('') + '</div>'
      : '<p class="muted" style="font-size:12.5px">截图保存在本地，不上传。建议只放有纪念意义的几张。</p>') +
    '</section>';
}

/* ---------------- 动作 ---------------- */

export const actions = {
  'ach-new': (el) => achEditor(el.dataset.id, null),
  'ach-edit': (el) => {
    const a = achievements.get(el.dataset.id);
    if (a) achEditor(a.workId, a.id);
  },
  'ach-bulk': (el) => achBulk(el.dataset.id),
  'ach-toggle': async (el) => {
    const a = achievements.get(el.dataset.id);
    if (!a) return;
    const done = !a.done;
    await achievements.save(Object.assign({}, a, { done, doneAt: done ? todayISO() : '' }));
    go('#/work/' + a.workId);
  },
  'ach-del': async (el) => {
    const a = achievements.get(el.dataset.id);
    if (!a) return;
    const ok = await confirmDialog({ title: '删除这个成就？', confirmText: '删除', danger: true });
    if (!ok) return;
    await achievements.hardRemove(a.id);
    const m = document.querySelector('.modal-backdrop.is-on');
    if (m) m.remove();
    toast('已删除');
    go('#/work/' + a.workId);
  },
  'pt-new': (el) => ptEditor(el.dataset.id, null),
  'pt-edit': (el) => {
    const p = playthroughs.get(el.dataset.id);
    if (p) ptEditor(p.workId, p.id);
  },
  'pt-del': async (el) => {
    const p = playthroughs.get(el.dataset.id);
    if (!p) return;
    const ok = await confirmDialog({ title: '删除第 ' + p.no + ' 周目？', confirmText: '删除', danger: true });
    if (!ok) return;
    await playthroughs.hardRemove(p.id);
    const m = document.querySelector('.modal-backdrop.is-on');
    if (m) m.remove();
    toast('已删除');
    go('#/work/' + p.workId);
  },
  'shot-del': async (el) => {
    const w = getWork(el.dataset.work);
    if (!w) return;
    const shots = (w.shots || []).filter((s) => s.id !== el.dataset.id);
    await saveWork(Object.assign({}, w, { shots }), detailsOf(w.id));
    const { deleteAttachments } = await import('../core/repo.js');
    await deleteAttachments([el.dataset.id]);
    go('#/work/' + w.id);
  }
};

/* 上传监听：文件选择不冒泡到 data-action，单独挂载 */
export function bindShotUpload(root) {
  const input = root.querySelector('#shot-file');
  if (!input) return;
  input.addEventListener('change', async () => {
    const files = [...(input.files || [])];
    input.value = '';
    if (!files.length) return;
    const w = getWork(ui.route.id);
    if (!w) return;
    const shots = (w.shots || []).slice();
    for (const f of files) {
      try {
        const img = await saveReviewImage(f);
        if (img) shots.push({ id: img.id, caption: '' });
      } catch (e) {
        toast(e.message || '图片处理失败', 'error');
      }
    }
    await saveWork(Object.assign({}, w, { shots }), detailsOf(w.id));
    toast('已添加 ' + files.length + ' 张截图');
    go('#/work/' + w.id);
  });
}
