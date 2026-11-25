/* ==========================================================
   次元簿 · 账号库
   说明书 5.8 / 3.4 / 3.6
   密码字段用 PBKDF2 + AES-GCM 独立加密；主密码不落盘，
   丢失即无法恢复；未解锁时密文不进入任何渲染。
   ========================================================== */

import { data, accounts, setting, saveSetting } from '../core/repo.js';
import { ACCOUNT_CATEGORIES } from '../core/schema.js';
import { ui, go, pref } from '../core/state.js';
import { icon, toast, openModal, confirmDialog, emptyState } from '../core/ui.js';
import { esc } from '../core/format.js';
import * as vault from '../core/crypto.js';

function vaultMeta() {
  return setting('vault', null);
}

function daysTo(date) {
  if (!date) return null;
  const t = new Date(date + 'T00:00:00').getTime();
  if (isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / 86400000);
}

export function accountsView() {
  const meta = vaultMeta();
  const unlocked = vault.isUnlocked();

  let html = '<header class="page-head">' +
    '<div><p class="eyebrow">账号库 · ' + (meta ? (unlocked ? '已解锁' : '已上锁') : '未设置') + '</p>' +
    '<h1 class="page-title">账号</h1></div>' +
    '<div class="head-actions">' +
    (unlocked ? '<button class="icon-btn" data-action="acct-lock" aria-label="立即上锁">' + icon('lock', 19) + '</button>' : '') +
    (unlocked ? '<button class="icon-btn" data-action="new-account" aria-label="新增账号">' + icon('plus', 20) + '</button>' : '') +
    '</div></header>';

  if (!meta) {
    return html + '<section class="card">' +
      '<h2 class="section-title" style="margin-bottom:8px">先设一个主密码</h2>' +
      '<p class="muted" style="font-size:12.5px;line-height:1.75;margin-bottom:14px">' +
      '密码用 PBKDF2 派生密钥后以 AES-GCM 加密保存在本机。主密码本身不保存，也不会写进备份。' +
      '<b>忘记主密码时，已加密的密码无法恢复</b>，这是加密的代价，不是缺陷。</p>' +
      '<button class="btn btn-primary btn-block" data-action="acct-setup">设置主密码</button>' +
      '</section>' +
      securityNote();
  }

  if (!unlocked) {
    return html + '<section class="card">' +
      '<h2 class="section-title" style="margin-bottom:8px">账号库已上锁</h2>' +
      '<p class="muted" style="font-size:12.5px;margin-bottom:14px">输入主密码查看与编辑账号信息。</p>' +
      '<button class="btn btn-primary btn-block" data-action="acct-unlock">' + icon('unlock', 16) + '解锁</button>' +
      '<p class="muted" style="font-size:11.5px;margin-top:12px;text-align:center">已保存 ' + accounts.list().length + ' 个账号</p>' +
      '</section>' + securityNote();
  }

  const list = accounts.list().slice().sort((a, b) => {
    const da = a.membershipEnd ? new Date(a.membershipEnd).getTime() : Infinity;
    const db = b.membershipEnd ? new Date(b.membershipEnd).getTime() : Infinity;
    if (da !== db) return da - db;
    return String(a.platform).localeCompare(String(b.platform), 'zh-Hans-CN');
  });

  if (!list.length) {
    return html + emptyState('·', '还没有账号', '把常看的平台、会员到期记录在这里，到期前能一眼看到。',
      '<button class="btn btn-primary btn-sm" data-action="new-account">＋ 添加账号</button>') + securityNote();
  }

  return html + '<div class="rows">' + list.map((a) => {
    const d = daysTo(a.membershipEnd);
    const warn = d !== null && d <= 7 && d >= 0;
    const expired = d !== null && d < 0;
    return '<div class="rowitem is-static">' +
      '<button class="rowitem-hit" data-action="edit-account" data-id="' + a.id + '" aria-label="编辑账号"></button>' +
      '<span class="logo-box">' + esc(String(a.platform || '?').slice(0, 1)) + '</span>' +
      '<span class="rowitem-main"><b>' + esc(a.platform || '未命名平台') + '</b>' +
      '<i>' + esc([a.category, a.username, a.membership].filter(Boolean).join(' · ')) + '</i></span>' +
      '<span class="rowitem-side">' +
      (a.membershipEnd ? '<span class="badge ' + (expired ? 'is-error' : warn ? 'is-warn' : '') + '">' +
        (expired ? '已过期 ' + (-d) + ' 天' : d === 0 ? '今天到期' : '剩 ' + d + ' 天') + '</span>' : '') +
      '</span></div>';
  }).join('') + '</div>' + securityNote();
}

function securityNote() {
  return '<p class="notice" style="margin-top:16px"><span>' + icon('info', 15) + '</span><span>' +
    '这里只做个人账号信息的加密归档，不是经过安全认证的密码管理器，也不建议存放唯一一份重要凭据。' +
    '主密码丢失无法找回。</span></p>';
}

/* ---------------- 主密码 ---------------- */

async function setupVault() {
  openModal({
    title: '设置主密码',
    desc: '至少 6 位。这个密码不会被保存，忘记后无法恢复已加密的密码。',
    body: '<label class="field"><span class="field-label">主密码</span><input class="input" type="password" id="vp1" autocomplete="new-password"></label>' +
      '<label class="field"><span class="field-label">再输一次</span><input class="input" type="password" id="vp2" autocomplete="new-password"></label>',
    actions: [{ label: '取消', value: null, variant: 'ghost' }, { label: '创建', value: 'ok', variant: 'primary' }]
  }).then(async (v) => {
    if (v !== 'ok') return;
    const p1 = document.getElementById('vp1');
    const p2 = document.getElementById('vp2');
    const a = p1 ? p1.value : '';
    const b = p2 ? p2.value : '';
    if (a.length < 6) { toast('至少 6 位', 'error'); return; }
    if (a !== b) { toast('两次输入不一致', 'error'); return; }
    const r = await vault.createVault(a);
    if (!r.ok) { toast(r.error, 'error'); return; }
    await saveSetting('vault', r.vault);
    vault.setAutoLock(pref('autoLock') || 10);
    toast('主密码已设置');
    go('#/accounts');
  });
}

async function unlockVault() {
  const meta = vaultMeta();
  if (!meta) { setupVault(); return; }
  openModal({
    title: '解锁账号库',
    body: '<label class="field"><span class="field-label">主密码</span>' +
      '<input class="input" type="password" id="vu-pass" autocomplete="current-password"></label>',
    actions: [{ label: '取消', value: null, variant: 'ghost' }, { label: '解锁', value: 'ok', variant: 'primary' }],
    onMount: (root) => {
      const el = root.querySelector('#vu-pass');
      if (el) {
        el.focus();
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { const b = root.querySelector('[data-mi="1"]'); if (b) b.click(); }
        });
      }
    }
  }).then(async (v) => {
    if (v !== 'ok') return;
    const el = document.getElementById('vu-pass');
    const pass = el ? el.value : '';
    const r = await vault.unlockVault(meta, pass);
    if (!r.ok) { toast(r.error || '解锁失败', 'error'); return; }
    vault.setAutoLock(pref('autoLock') || 10);
    toast('已解锁');
    go('#/accounts');
  });
}

/* ---------------- 账号编辑 ---------------- */

async function openAccountEditor(id) {
  const cur = id ? accounts.get(id) : null;
  const d = cur ? Object.assign({}, cur) : {
    id: '', platform: '', url: '', category: '视频', username: '', email: '', phone: '',
    registeredAt: '', purpose: '', membership: '免费', membershipEnd: '', note: '', secret: null
  };
  let plain = '';
  if (cur && cur.secret) plain = await vault.decryptSecret(cur.secret);

  const body = '<div>' +
    '<div class="row2"><label class="field"><span class="field-label">平台名称</span>' +
    '<input class="input" id="a-platform" value="' + esc(d.platform) + '" placeholder="某视频平台"></label>' +
    '<label class="field"><span class="field-label">分类</span><select class="select" id="a-category">' +
    ACCOUNT_CATEGORIES.map((c) => '<option' + (d.category === c ? ' selected' : '') + '>' + c + '</option>').join('') + '</select></label></div>' +
    '<label class="field"><span class="field-label">登录入口</span><input class="input" id="a-url" value="' + esc(d.url) + '" placeholder="https://"></label>' +
    '<label class="field"><span class="field-label">用户名</span><input class="input" id="a-username" value="' + esc(d.username) + '"></label>' +
    '<div class="row2"><label class="field"><span class="field-label">登录邮箱</span><input class="input" id="a-email" value="' + esc(d.email) + '"></label>' +
    '<label class="field"><span class="field-label">登录手机号</span><input class="input" id="a-phone" value="' + esc(d.phone) + '"></label></div>' +
    '<label class="field"><span class="field-label">密码（加密保存）</span>' +
    '<input class="input" id="a-secret" type="password" value="' + esc(plain) + '" placeholder="留空表示不修改" autocomplete="new-password"></label>' +
    '<div class="row2"><label class="field"><span class="field-label">会员状态</span><select class="select" id="a-membership">' +
    ['免费', '会员', '联合会员', '学生会员', '家庭组'].map((m) => '<option' + (d.membership === m ? ' selected' : '') + '>' + m + '</option>').join('') +
    '</select></label><label class="field"><span class="field-label">会员到期日</span>' +
    '<input class="input" type="date" id="a-end" value="' + esc(d.membershipEnd) + '"></label></div>' +
    '<div class="row2"><label class="field"><span class="field-label">注册日期</span><input class="input" type="date" id="a-reg" value="' + esc(d.registeredAt) + '"></label>' +
    '<label class="field"><span class="field-label">账号用途</span><input class="input" id="a-purpose" value="' + esc(d.purpose) + '" placeholder="追番 / 看剧"></label></div>' +
    '<label class="field"><span class="field-label">备注</span><textarea class="textarea" id="a-note" rows="2" placeholder="密保提示、绑定设备等非敏感信息">' + esc(d.note) + '</textarea></label>' +
    (cur ? '<div class="row-flex"><button type="button" class="btn btn-ghost btn-sm" data-action="acct-copy" data-id="' + cur.id + '">' + icon('copy', 14) + '复制密码</button>' +
      '<button type="button" class="btn btn-danger btn-sm" data-action="del-account" data-id="' + cur.id + '">删除账号</button></div>' : '') +
    '</div>';

  openModal({
    title: cur ? '编辑账号' : '新增账号',
    body,
    wide: true,
    actions: [{ label: '取消', value: null, variant: 'ghost' }, { label: '保存', value: 'save', variant: 'primary' }],
    onMount: (root) => {
      const bind = (sel, key) => {
        const el = root.querySelector(sel);
        el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', () => { d[key] = el.value; });
      };
      ['platform', 'url', 'username', 'email', 'phone', 'purpose', 'note', 'category', 'membership'].forEach((k) => {
        bind('#a-' + k, k);
      });
      bind('#a-end', 'membershipEnd');
      bind('#a-reg', 'registeredAt');
    }
  }).then(async (v) => {
    if (v !== 'save') return;
    const el = document.querySelector('#a-secret');
    const typed = el ? el.value : '';
    if (typed) {
      const secret = await vault.encryptSecret(typed);
      if (!secret) { toast('加密失败：请重新解锁', 'error'); return; }
      d.secret = secret;
    }
    if (!String(d.platform || '').trim()) { toast('平台名称不能为空', 'error'); return; }
    d.updatedAt = new Date().toISOString();
    const res = await accounts.save(d);
    if (!res.ok) { toast(res.error || '保存失败', 'error'); return; }
    toast('已保存');
    go('#/accounts');
  });
}

export const actions = {
  'acct-setup': () => setupVault(),
  'acct-unlock': () => unlockVault(),
  'acct-lock': () => {
    vault.lock();
    toast('已上锁');
    go('#/accounts');
  },
  'new-account': () => {
    if (!vault.isUnlocked()) { unlockVault(); return; }
    openAccountEditor(null);
  },
  'edit-account': (el) => {
    if (!vault.isUnlocked()) { unlockVault(); return; }
    openAccountEditor(el.dataset.id);
  },
  'acct-copy': async (el) => {
    const a = accounts.get(el.dataset.id);
    if (!a || !a.secret) { toast('没有保存密码'); return; }
    const plain = await vault.decryptSecret(a.secret);
    if (!plain) { toast('解密失败，请重新解锁', 'error'); return; }
    const ok = await vault.copySecret(plain);
    toast(ok ? '已复制，30 秒后请自行清理剪贴板' : '复制失败', ok ? 'ok' : 'error');
  },
  'del-account': async (el) => {
    const ok = await confirmDialog({ title: '删除这个账号？', desc: '加密的密码会一起删除，无法恢复。', confirmText: '删除', danger: true });
    if (!ok) return;
    await accounts.remove(el.dataset.id);
    const modal = document.querySelector('.modal-backdrop.is-on');
    if (modal) modal.remove();
    toast('已删除');
    go('#/accounts');
  }
};
