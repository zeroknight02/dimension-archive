/* ==========================================================
   次元簿 · 设置与数据管理
   说明书 2.5 / 2.6 / 3.x / 5.10 / 15
   备份与恢复全部由用户主动发起，保存到用户选择的位置。
   ========================================================== */

import { data, liveWorks, deletedWorks, restoreWork, loadAll, setting, emit } from '../core/repo.js';
import * as db from '../core/db.js';

import { APP_VERSION, FORMAT_VERSION, SCHEMA_VERSION, RATING_SCALES } from '../core/schema.js';
import { pref, ui, go } from '../core/state.js';
import { icon, toast, openModal, confirmDialog, emptyState, promptDialog, seg } from '../core/ui.js';
import { esc, fmtSize, relDate } from '../core/format.js';
import { MODULE_LABELS, exportJSON, exportZIP, readBackupFile, decryptBackup, verifyChecksum, analyze, applyImport, writeAttachments, verifyAfterImport, downloadBlob } from '../core/backup.js';
import { attachmentStats, cleanupUnusedAttachments, humanSize, loadImages } from '../core/repo.js';
import * as vault from '../core/crypto.js';
import { probeLegacy, summarizeLegacy, importLegacy } from '../core/legacy.js';
import { seedDemo, purgeDemo } from '../core/demo.js';

const DAY = 86400000;

function daysSinceBackup() {
  const t = Number(pref('backupAt')) || 0;
  if (!t) return null;
  return Math.floor((Date.now() - t) / DAY);
}

export function settingsView() {
  const est = ui.storageEst || null;
  const persisted = ui.persisted || { supported: false, persisted: false };
  const since = daysSinceBackup();

  let html = '<header class="page-head">' +
    '<div class="head-left"><button class="icon-btn" data-action="go" data-to="#/more" aria-label="返回工具">' + icon('back', 20) + '</button>' +
    '<div><p class="eyebrow">设置 · v' + APP_VERSION + '</p><h1 class="page-title">设置</h1></div></div></header>';

  if (since === null || since >= 14) {
    html += '<div class="notice is-warn"><span>' + icon('warning', 15) + '</span><span>' +
      (since === null ? '还没有导出过备份。' : '已经 ' + since + ' 天没有备份了。') +
      '本地存储可能被系统回收，定期导出是唯一可靠的保险。' +
      '<button class="btn btn-ghost btn-xs" data-action="goto-backup" style="margin-left:6px">去备份</button></span></div>';
  }

  /* 外观 */
  html += '<section class="section"><div class="section-head"><h2 class="section-title">外观</h2></div>' +
    '<div class="card">' +
    seg('theme', '主题', [['dark', '深空星云', pref('theme') === 'dark'], ['light', '浅色星云', pref('theme') === 'light']]) +
    seg('ratingScale', '评分显示', RATING_SCALES.map((r) => [r.value, r.label, pref('ratingScale') === r.value])) +
    seg('density', '界面密度', [['normal', '标准', pref('density') !== 'compact'], ['compact', '紧凑', pref('density') === 'compact']]) +
    '</div></section>';

  /* 存储 */
  html += '<section class="section"><div class="section-head"><h2 class="section-title">存储</h2>' +
    '<span class="section-note">浏览器给多少用多少</span></div>' +
    '<div class="card">' +
    '<div class="kv">' +
    '<div class="kv-row"><span>已用空间</span><b id="storage-usage">' + (est ? fmtSize(est.usage) : '读取中…') + '</b></div>' +
    '<div class="kv-row"><span>可用配额</span><b id="storage-quota">' + (est && est.quota ? fmtSize(est.quota) : '—') + '</b></div>' +
    '<div class="kv-row"><span>持久化存储</span><b>' + (!persisted.supported ? '不支持' : persisted.persisted ? '已授予' : '未授予') + '</b></div>' +
    '<div class="kv-row"><span>记录总数</span><b>' + liveWorks().length + ' 部作品</b></div>' +
    '</div>' +
    (!persisted.persisted ? '<button class="btn btn-ghost btn-sm" data-action="ask-persist" style="margin-top:12px">申请持久化存储</button>' : '') +
    '<p class="muted" style="font-size:11.5px;margin-top:10px;line-height:1.7">' +
    '配额由浏览器与系统决定，系统不承诺固定容量；即使授予持久化，也不等于数据永不丢失。' +
    'iOS 在系统空间紧张或长期未访问时仍可能回收站点数据。</p>' +
    '</div></section>';

  /* 备份 */
  html += '<section class="section" id="backup-sec"><div class="section-head"><h2 class="section-title">备份与恢复</h2>' +
    '<span class="section-note">' + (pref('backupAt') ? '上次 ' + relDate(new Date(pref('backupAt')).toISOString()) : '从未备份') + '</span></div>' +
    '<div class="card">' +
    '<p class="muted" style="font-size:12px;line-height:1.7;margin-bottom:12px">' +
    '导出的文件可在没有本程序的情况下解析。账号密码默认不导出，只有显式勾选并设置口令时才导出密文。</p>' +
    '<div class="row-flex">' +
    '<button class="btn btn-primary btn-sm" data-action="export-json">' + icon('download', 14) + '导出 JSON</button>' +
    '<button class="btn btn-ghost btn-sm" data-action="export-zip">' + icon('download', 14) + '导出 ZIP（含图片）</button>' +
    '<button class="btn btn-ghost btn-sm" data-action="import-backup">' + icon('upload', 14) + '导入备份</button>' +
    '</div>' +
    '<p class="muted" style="font-size:11.5px;margin-top:10px">格式版本 ' + FORMAT_VERSION + ' · 结构版本 ' + SCHEMA_VERSION +
    ' · 校验方式 SHA-256</p>' +
    '</div></section>';

  /* 安全 */
  html += '<section class="section"><div class="section-head"><h2 class="section-title">安全</h2></div>' +
    '<div class="card">' +
    seg('autoLock', '账号库自动上锁', [['0', '不自动', pref('autoLock') === 0], ['5', '5 分钟', pref('autoLock') === 5],
      ['10', '10 分钟', pref('autoLock') === 10], ['30', '30 分钟', pref('autoLock') === 30]]) +
    '<div class="kv" style="margin-top:12px">' +
    '<div class="kv-row"><span>主密码</span><b>' + (setting('vault', null) ? '已设置' : '未设置') + '</b></div>' +
    '<div class="kv-row"><span>加密方式</span><b>PBKDF2 + AES-GCM</b></div>' +
    '</div>' +
    '<p class="muted" style="font-size:11.5px;margin-top:10px;line-height:1.7">' +
    '主密码不保存在任何位置。忘记主密码时，已加密的账号密码无法恢复，系统不提供绕过通道。</p>' +
    '</div></section>';

  /* 数据维护 */
  const demoCnt = data.works.filter((w) => w.demo && !w.deletedAt).length;
  html += '<section class="section"><div class="section-head"><h2 class="section-title">数据维护</h2></div>' +
    '<div class="rows">' +
    '<button class="rowitem" data-action="exports-csv"><span class="rowitem-main"><b>导出作品清单 CSV</b>' +
    '<i>方便在表格里查看</i></span>' + icon('right', 16) + '</button>' +
    '<button class="rowitem" data-action="attach-manage"><span class="rowitem-main"><b>附件占用与清理</b>' +
    '<i>查看图片与附件的分类占用，清理没有被任何记录引用的文件</i></span>' + icon('right', 16) + '</button>' +
    '<button class="rowitem" data-action="legacy-import"><span class="rowitem-main"><b>从旧版次元簿导入</b>' +
    '<i>读取同源下的 v1.63 旧库，旧库只读不修改</i></span>' + icon('right', 16) + '</button>' +
    '<button class="rowitem" data-action="demo-load"><span class="rowitem-main"><b>载入示例数据</b>' +
    '<i>17 部示例作品，覆盖总览 / 收藏册 / 知识 / 档案馆全部功能' + (demoCnt ? '（已有 ' + demoCnt + ' 部示例）' : '') + '</i></span>' + icon('right', 16) + '</button>' +
    (demoCnt ? '<button class="rowitem" data-action="demo-clear"><span class="rowitem-main"><b>清除示例数据</b>' +
      '<i>只删除 ' + demoCnt + ' 部示例，自己的记录一条不动</i></span>' + icon('right', 16) + '</button>' : '') +
    '<button class="rowitem" data-action="clear-all"><span class="rowitem-main"><b>清空全部数据</b>' +
    '<i>不可撤销，请先导出备份</i></span>' + icon('right', 16) + '</button>' +
    '</div></section>';

  /* 关于 */
  html += '<section class="section"><div class="section-head"><h2 class="section-title">关于</h2></div>' +
    '<div class="card">' +
    '<p class="about-title">次元簿 · Dimension Archive</p>' +
    '<p class="muted" style="font-size:12px;line-height:1.75;margin-top:6px">' +
    '个人数字文化档案与生活管理平台。纯静态 PWA，数据只保存在这台设备的 IndexedDB 里，' +
    '不注册账号、不连云端、不做任何后台上传。</p>' +
    '<div class="kv" style="margin-top:12px">' +
    '<div class="kv-row"><span>程序版本</span><b>v' + APP_VERSION + '</b></div>' +
    '<div class="kv-row"><span>数据格式</span><b>' + FORMAT_VERSION + '</b></div>' +
    '<div class="kv-row"><span>数据库结构</span><b>v' + SCHEMA_VERSION + '</b></div>' +
    '</div>' +
    '<p class="notice" style="margin-top:12px"><span>' + icon('info', 15) + '</span><span>' +
    '账号模块只用于个人账号信息的加密归档，不是经过安全认证的密码管理器。</span></p>' +
    '</div></section>';

  return html;
}

/* ---------------- 存储 ---------------- */

export async function paintStorage() {
  const est = await db.storageEstimate();
  const p = await db.persistState();
  ui.storageEst = est;
  ui.persisted = p;
  const u = document.getElementById('storage-usage');
  const q = document.getElementById('storage-quota');
  if (u && est) u.textContent = fmtSize(est.usage);
  if (q && est) q.textContent = est.quota ? fmtSize(est.quota) : '—';
}

/* ---------------- 导出 ---------------- */

function exportOptions(mode) {
  return new Promise((resolve) => {
    const modules = Object.keys(MODULE_LABELS).filter((m) => m !== 'settings');
    openModal({
      title: '导出备份',
      desc: '选择要导出的模块。全选即完整备份。',
      wide: true,
      body: '<div class="pick-list">' +
        '<label class="pick-row"><input type="checkbox" id="ex-all" checked><span>全部模块</span></label>' +
        modules.map((m) => '<label class="pick-row"><input type="checkbox" data-mod="' + m + '" checked><span>' +
          esc(MODULE_LABELS[m]) + '</span></label>').join('') +
        '</div>' +
        '<label class="switch" style="margin:14px 0"><input type="checkbox" id="ex-secrets"><i></i><span>包含账号密码密文</span></label>' +
        '<label class="field"><span class="field-label">加密口令（可选，设置后整个文件加密）</span>' +
        '<input class="input" type="password" id="ex-pass" placeholder="不填则不加密" autocomplete="new-password"></label>',
      actions: [{ label: '取消', value: null, variant: 'ghost' }, { label: '导出', value: 'ok', variant: 'primary' }],
      onMount: (root) => {
        const all = root.querySelector('#ex-all');
        all.addEventListener('change', () => {
          root.querySelectorAll('[data-mod]').forEach((cb) => { cb.checked = all.checked; });
        });
      }
    }).then((v) => {
      if (v !== 'ok') { resolve(null); return; }
      const root = document;
      const sel = [...root.querySelectorAll('[data-mod]')].filter((cb) => cb.checked).map((cb) => cb.dataset.mod);
      const includeSecrets = root.querySelector('#ex-secrets').checked;
      const password = root.querySelector('#ex-pass').value;
      if (includeSecrets && !password) {
        toast('导出密码密文时必须设置口令', 'error');
        resolve(null);
        return;
      }
      resolve({ modules: sel.length ? sel : ['works'], includeSecrets, password: password || '' });
    });
  });
}

async function doExport(kind) {
  const opts = await exportOptions(kind);
  if (!opts) return;
  toast('正在打包…');
  try {
    const out = kind === 'zip' ? await exportZIP(opts) : await exportJSON(opts);
    downloadBlob(out.blob, out.fileName);
    pref('backupAt', Date.now());
    pref('backupNudgeOff', true);
    toast('已导出 ' + out.fileName);
    emit();
  } catch (e) {
    toast('导出失败：' + (e.message || '未知错误'), 'error');
  }
}

/* ---------------- 导入 ---------------- */

function pickFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.style.display = 'none';
    document.body.appendChild(input);
    input.addEventListener('change', () => {
      const f = input.files && input.files[0];
      input.remove();
      resolve(f || null);
    });
    input.click();
  });
}

async function doImport() {
  const file = await pickFile('.json,.zip,application/json,application/zip');
  if (!file) return;
  let parsed;
  try {
    parsed = await readBackupFile(file);
  } catch (e) {
    toast('文件无法解析，可能不是备份文件', 'error');
    return;
  }
  if (!parsed.ok && !parsed.encrypted) { toast(parsed.error || '备份不合法', 'error'); return; }

  let payload = parsed.payload;
  if (parsed.encrypted) {
    openModal({
      title: '备份已加密',
      desc: '输入导出时设置的口令。',
      body: '<label class="field"><span class="field-label">口令</span><input class="input" type="password" id="im-pass"></label>',
      actions: [{ label: '取消', value: null, variant: 'ghost' }, { label: '解密', value: 'ok', variant: 'primary' }]
    }).then(async (v) => {
      if (v !== 'ok') return;
      const el = document.getElementById('im-pass');
      const r = await decryptBackup(payload, el ? el.value : '');
      if (!r.ok) { toast(r.error, 'error'); return; }
      await showImportPreview(r.payload, parsed.attachmentFiles || []);
    });
    return;
  }
  await showImportPreview(payload, parsed.attachmentFiles || []);
}

async function showImportPreview(payload, attachmentFiles) {
  const check = await verifyChecksum(payload);
  const a = analyze(payload);

  const rows = Object.keys(a.conflict).filter((m) => a.conflict[m].total).map((m) => {
    const c = a.conflict[m];
    return '<div class="kv-row"><span>' + esc(MODULE_LABELS[m] || m) + '</span><b>' + c.total + ' 条 · 新增 ' + c.added +
      ' · 冲突 ' + c.changed + '</b></div>';
  }).join('');

  const body = '<div class="kv">' +
    '<div class="kv-row"><span>导出时间</span><b>' + esc(String(payload.exportedAt).slice(0, 19).replace('T', ' ')) + '</b></div>' +
    '<div class="kv-row"><span>包含模块</span><b>' + (payload.modules || []).length + ' 个</b></div>' +
    '<div class="kv-row"><span>附件</span><b>' + attachmentFiles.length + ' 个</b></div>' +
    '<div class="kv-row"><span>完整性校验</span><b>' + (check.ok ? '通过' : '未通过') + '</b></div>' +
    '</div>' + rows +
    (check.ok ? '' : '<p class="notice is-error" style="margin-top:12px"><span>' + icon('warning', 15) + '</span><span>' +
      esc(check.error) + '</span></p>') +
    '<p class="muted" style="font-size:11.5px;margin-top:12px;line-height:1.7">' +
    '完全恢复会清空当前数据后写入；合并导入会按更新时间保留较新的一条，跳过更旧的记录。</p>';

  openModal({
    title: '导入备份',
    body,
    wide: true,
    actions: [
      { label: '取消', value: null, variant: 'ghost' },
      { label: '合并导入', value: 'merge', variant: 'ghost' },
      { label: '完全恢复', value: 'restore', variant: 'primary' }
    ]
  }).then(async (v) => {
    if (!v) return;
    if (v === 'restore') {
      const ok = await confirmDialog({
        title: '完全恢复会覆盖当前数据',
        desc: '当前 ' + liveWorks().length + ' 部作品会被替换。建议先导出一份备份。',
        confirmText: '覆盖并恢复',
        danger: true
      });
      if (!ok) return;
    }
    toast('正在导入…');
    const report = await applyImport(payload, v);
    const n = await writeAttachments(attachmentFiles);
    const verify = await verifyAfterImport();
    pref('backupAt', Date.now());
    openModal({
      title: '导入完成',
      body: '<div class="kv">' +
        '<div class="kv-row"><span>作品</span><b>' + verify.counts.works + ' 部</b></div>' +
        '<div class="kv-row"><span>体验记录</span><b>' + verify.counts.experiences + ' 条</b></div>' +
        '<div class="kv-row"><span>摘抄</span><b>' + verify.counts.excerpts + ' 条</b></div>' +
        '<div class="kv-row"><span>总结</span><b>' + verify.counts.reviews + ' 篇</b></div>' +
        '<div class="kv-row"><span>附件</span><b>' + n + ' 个</b></div>' +
        '<div class="kv-row"><span>关联校验</span><b>' + (verify.ok ? '通过' : '有 ' + (verify.orphans.experiences + verify.orphans.excerpts + verify.orphans.reviews) + ' 条孤立记录') + '</b></div>' +
        '</div>' + (report.errors.length ? '<p class="notice is-error" style="margin-top:10px"><span>' + icon('warning', 15) + '</span><span>' + esc(report.errors.join('；')) + '</span></p>' : ''),
      actions: [{ label: '知道了', value: null, variant: 'primary' }]
    });
    emit();
  });
}

/* ---------------- 回收站 ---------------- */

export function trashView() {
  const list = deletedWorks();
  let html = '<header class="page-head">' +
    '<div class="head-left"><button class="icon-btn" data-action="go" data-to="#/more" aria-label="返回工具">' + icon('back', 20) + '</button>' +
    '<div><p class="eyebrow">回收站 · ' + list.length + ' 部</p><h1 class="page-title">已删除作品</h1></div></div></header>';

  if (!list.length) return html + emptyState('·', '回收站是空的', '删除的作品会先放在这里，随时可以恢复。');

  return html + '<div class="rows">' + list.map((w) =>
    '<div class="rowitem is-static">' +
    '<span class="rowitem-main"><b>' + esc(w.title) + '</b><i>' + esc((w.deletedAt || '').slice(0, 19).replace('T', ' ')) + ' 删除</i></span>' +
    '<span class="rowitem-side"><button class="btn btn-ghost btn-xs" data-action="restore-work" data-id="' + w.id + '">恢复</button></span>' +
    '</div>').join('') + '</div>';
}

/* ---------------- 动作 ---------------- */

export const actions = {
  'demo-load': async () => {
    const demoCnt = data.works.filter((w) => w.demo && !w.deletedAt).length;
    const hasOwn = liveWorks().some((w) => !w.demo);
    if (demoCnt) { toast('示例数据已经在了'); go('#/home'); return; }
    const ok = await confirmDialog({
      title: '载入示例数据？',
      desc: hasOwn
        ? '会加入 17 部示例作品，和你自己的记录放在一起；之后可以只清除示例，不影响你的数据。'
        : '会加入 17 部示例作品，以及它们的体验、总结、摘抄、刊期等，覆盖全部功能；可随时一键清除。',
      confirmText: '载入'
    });
    if (!ok) return;
    ui.suspendRender = true;
    const res = await seedDemo();
    ui.suspendRender = false;
    if (!res.ok) { toast(res.error || '载入失败', 'error'); return; }
    toast('示例数据已载入');
    go('#/home');
  },
  'demo-clear': async () => {
    const ok = await confirmDialog({
      title: '清除示例数据？',
      desc: '只删除带示例标记的作品与关联记录，你自己的数据一条不动。',
      confirmText: '清除',
      danger: true
    });
    if (!ok) return;
    ui.suspendRender = true;
    const res = await purgeDemo();
    ui.suspendRender = false;
    toast(res.removed ? '已清除 ' + res.removed + ' 条示例数据' : '没有找到示例数据');
    go('#/home');
  },
  'ask-persist': async () => {
    const r = await db.requestPersist();
    ui.persisted = r;
    toast(r.persisted ? '已获得持久化存储' : '未获授予，浏览器可能回收数据', r.persisted ? 'ok' : 'error');
    emit();
  },
  'export-json': () => doExport('json'),
  'export-zip': () => doExport('zip'),
  'import-backup': () => doImport(),
  'goto-backup': () => {
    const el = document.getElementById('backup-sec');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
  'restore-work': async (el) => {
    const ok = await restoreWork(el.dataset.id);
    toast(ok ? '已恢复' : '恢复失败', ok ? 'ok' : 'error');
    go('#/trash');
  },
  'clear-all': async () => {
    const ok = await confirmDialog({
      title: '清空全部数据？',
      desc: '所有作品、体验、摘抄、总结、账号与附件都会被删除，无法撤销。',
      body: '<p class="notice is-error"><span>' + icon('warning', 15) + '</span><span>请先确认已经导出备份。</span></p>',
      confirmText: '我确认清空',
      danger: true
    });
    if (!ok) return;
    const second = await promptDialog({
      title: '最后确认',
      desc: '输入「清空」两个字以继续。',
      label: '确认文字',
      placeholder: '清空'
    });
    if (second !== '清空') { toast('已取消'); return; }
    await db.clearAll();
    await loadAll();
    pref('backupAt', 0);
    toast('已清空');
    go('#/home');
  },
  'attach-manage': async () => {
    const st = await attachmentStats();
    const rows = Object.keys(st.byType).sort((a, b) => st.byType[b].size - st.byType[a].size).map((k) =>
      '<div class="kv-row"><span>' + esc(k) + '</span><b>' + st.byType[k].count + ' 个 · ' + humanSize(st.byType[k].size) + '</b></div>').join('');
    openModal({
      title: '附件占用',
      wide: true,
      body: '<div class="kv"><div class="kv-row"><span>合计</span><b>' + st.total + ' 个 · ' + humanSize(st.size) + '</b></div>' + rows + '</div>' +
        '<p class="muted" style="font-size:11.5px;margin-top:12px">清理只删除没有被任何作品封面、总结插图/附件、实体照片或书脊背景引用的文件。参考价：书脊、封面等仍在使用中的文件不会被删。</p>',
      actions: [{ label: '关闭', value: null, variant: 'ghost' }, { label: '清理未引用', value: 'ok', variant: 'primary' }]
    }).then(async (v) => {
      if (v !== 'ok') return;
      const res = await cleanupUnusedAttachments();
      await loadImages();
      toast(res.removed ? '已清理 ' + res.removed + ' 个文件，释放 ' + humanSize(res.freed) : '没有可清理的文件');
      go('#/settings');
    });
  },
  'legacy-import': async () => {
    toast('正在检查旧版数据…');
    const probe = await probeLegacy();
    if (!probe.found) {
      toast('同源下没有找到旧库。旧数据只存在于原来的访问地址，换域名或端口就读不到。', 'error');
      return;
    }
    const sum = summarizeLegacy(probe.raw);
    if (!sum.total) { toast('旧库里没有可导入的作品'); return; }
    const byType = Object.keys(sum.byType).map((t) => MODULE_LABELS[t] || t).join('、');
    openModal({
      title: '找到 v1.63 的旧数据',
      desc: '旧库只读，导入过程不会改动它，可以反复导入用于对照。',
      wide: true,
      body: '<div class="kv">' +
        '<div class="kv-row"><span>作品</span><b>' + sum.total + ' 部</b></div>' +
        '<div class="kv-row"><span>图片</span><b>' + probe.images + ' 张</b></div>' +
        '<div class="kv-row"><span>旧版总结</span><b>' + sum.reviews + ' 篇</b></div>' +
        '<div class="kv-row"><span>旧版摘抄</span><b>' + sum.excerpts + ' 条</b></div>' +
        '</div>' +
        '<p class="notice" style="margin-top:12px"><span>' + icon('info', 15) + '</span><span>' +
        '旧版的分类、看剧分区、追更日志暂不迁移；作品、专属字段、进度、评分、总结与摘抄会完整带过来。' +
        '导入后可能出现重复作品，可在档案馆里批量处理。</span></p>',
      actions: [
        { label: '取消', value: null, variant: 'ghost' },
        { label: '开始导入', value: 'ok', variant: 'primary' }
      ]
    }).then(async (v) => {
      if (v !== 'ok') return;
      toast('正在导入，请勿关闭页面…');
      const report = await importLegacy(probe.raw, { works: true, experiences: true, reviews: true, excerpts: true, images: true });
      openModal({
        title: '导入完成',
        body: '<div class="kv">' +
          '<div class="kv-row"><span>作品</span><b>' + report.works + ' 部</b></div>' +
          '<div class="kv-row"><span>体验记录</span><b>' + report.experiences + ' 条</b></div>' +
          '<div class="kv-row"><span>总结</span><b>' + report.reviews + ' 篇</b></div>' +
          '<div class="kv-row"><span>摘抄</span><b>' + report.excerpts + ' 条</b></div>' +
          '<div class="kv-row"><span>新标签</span><b>' + report.tags + ' 个</b></div>' +
          '<div class="kv-row"><span>图片</span><b>' + report.images + ' 张</b></div>' +
          (report.skipped ? '<div class="kv-row"><span>跳过</span><b>' + report.skipped + ' 条</b></div>' : '') +
          '</div><p class="muted" style="font-size:11.5px;margin-top:10px">建议现在导出一次备份。</p>',
        actions: [{ label: '去看看', value: 'go', variant: 'primary' }, { label: '关闭', value: null, variant: 'ghost' }]
      }).then((r) => { if (r === 'go') go('#/works'); });
      emit();
    });
  },
  'exports-csv': () => {
    import('./works.js').then((m) => m.actions['export-csv']());
  },
  'set-pref': (el) => {
    const key = el.dataset.key;
    let val = el.dataset.value;
    if (key === 'autoLock') val = Number(val) || 0;
    pref(key, val);
    if (key === 'theme') {
      document.documentElement.setAttribute('data-theme', val);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', val === 'dark' ? '#17132F' : '#FAF7FF');
    }
    document.querySelectorAll('[data-action="set-pref"][data-key="' + key + '"]').forEach((b) => {
      b.classList.toggle('is-on', b.dataset.value === el.dataset.value);
    });
  }
};
