/* ==========================================================
   次元簿 · 界面基础件
   图标、轻提示、弹窗、确认框、空状态、分段控件。
   全部为无人物线性图标（说明书 4.1 / 4.6）。
   ========================================================== */

import { esc } from './format.js';

const P = {
  home: '<path d="M4 10.6 12 3.7l8 6.9V20a1 1 0 0 1-1 1h-4.6v-6.4H9.6V21H5a1 1 0 0 1-1-1z"/>',
  book: '<path d="M4 4.7h6.1a2 2 0 0 1 1.9 1.1 2 2 0 0 1 1.9-1.1H20v13.1h-6.1a2 2 0 0 0-1.9 1.1 2 2 0 0 0-1.9-1.1H4z"/><path d="M12 5.8v13.1"/>',
  film: '<rect x="3.2" y="4.6" width="17.6" height="14.8" rx="2.2"/><path d="M7.6 4.6v14.8M16.4 4.6v14.8M3.2 9.6h4.4M16.4 9.6h4.4M3.2 14.4h4.4M16.4 14.4h4.4"/>',
  comic: '<rect x="3.4" y="3.6" width="17.2" height="16.8" rx="2.4"/><path d="M7.4 8.6h5.2M7.4 12.4h9.2M7.4 16.2h6"/>',
  stage: '<path d="M3.2 19.2h17.6"/><path d="M6 19.2V9.4l6-4.6 6 4.6v9.8"/><path d="M9.6 19.2v-5.4h4.8v5.4"/>',
  music: '<circle cx="8" cy="17" r="2.6"/><circle cx="18" cy="15" r="2.2"/><path d="M10.6 17V6.4l9.6-1.8V15"/>',
  game: '<rect x="2.6" y="7.4" width="18.8" height="9.6" rx="4.4"/><path d="M7.4 10.6v3.4M5.7 12.3h3.4"/><circle cx="16" cy="11.4" r="1.1" fill="currentColor" stroke="none"/><circle cx="18.2" cy="13.8" r="1.1" fill="currentColor" stroke="none"/>',
  spark: '<path d="M12 3.2 13.8 9l5.8 1.8-5.8 1.8L12 18.4l-1.8-5.8L4.4 10.8 10.2 9z"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.4"/><path d="m15.6 15.6 4.2 4.2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 14.6a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.6 1.6 0 0 0-1.4 1z"/>',
  back: '<path d="M15 5 8 12l7 7"/>',
  left: '<path d="M14.5 5.5 8 12l6.5 6.5"/>',
  right: '<path d="M9.5 5.5 16 12l-6.5 6.5"/>',
  down: '<path d="M6 9.5 12 15.5 18 9.5"/>',
  up: '<path d="M6 14.5 12 8.5 18 14.5"/>',
  list: '<path d="M4.5 7h15M4.5 12h15M4.5 17h15"/>',
  grid: '<rect x="3.6" y="3.6" width="7" height="7" rx="1.4"/><rect x="13.4" y="3.6" width="7" height="7" rx="1.4"/><rect x="3.6" y="13.4" width="7" height="7" rx="1.4"/><rect x="13.4" y="13.4" width="7" height="7" rx="1.4"/>',
  shelf: '<path d="M3.4 18.6h17.2"/><rect x="5" y="4.4" width="3.4" height="14.2" rx=".8"/><rect x="9.6" y="6.4" width="3.4" height="12.2" rx=".8"/><rect x="14.2" y="5" width="3.4" height="13.6" rx=".8"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="M4.8 12.6 9.6 17.4 19.2 6.8"/>',
  download: '<path d="M12 3.6v11.2"/><path d="m7.6 10.6 4.4 4.4 4.4-4.4"/><path d="M4.4 19.4h15.2"/>',
  upload: '<path d="M12 20.2V9"/><path d="m7.6 13 4.4-4.4 4.4 4.4"/><path d="M4.4 4.6h15.2"/>',
  trash: '<path d="M4.6 7h14.8"/><path d="M9.4 7V5.2a1 1 0 0 1 1-1h3.2a1 1 0 0 1 1 1V7"/><path d="M6.6 7l.8 12.2a1.4 1.4 0 0 0 1.4 1.3h6.4a1.4 1.4 0 0 0 1.4-1.3L17.4 7"/>',
  edit: '<path d="M4.4 19.6h4L19 9a2.1 2.1 0 0 0-3-3L5.4 16.6z"/><path d="M14.8 6.2 17.8 9.2"/>',
  more: '<circle cx="5.6" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="18.4" cy="12" r="1.5" fill="currentColor" stroke="none"/>',
  tag: '<path d="M11.2 3.6H4.8a1.2 1.2 0 0 0-1.2 1.2v6.4l9 9a1.4 1.4 0 0 0 2 0l5.2-5.2a1.4 1.4 0 0 0 0-2z"/><circle cx="8" cy="8" r="1.3"/>',
  calendar: '<rect x="3.6" y="5.4" width="16.8" height="15" rx="2"/><path d="M8 3.4v4M16 3.4v4M3.6 10.4h16.8"/>',
  chart: '<path d="M4 20V4"/><path d="M4 20h16"/><path d="M8.4 16.6v-4.4M12.8 16.6V8.2M17.2 16.6v-6.4"/>',
  user: '<circle cx="12" cy="8.4" r="3.6"/><path d="M4.6 20.4a7.4 7.4 0 0 1 14.8 0"/>',
  lock: '<rect x="4.8" y="10.4" width="14.4" height="9.8" rx="2.2"/><path d="M8.4 10.4V7.8a3.6 3.6 0 0 1 7.2 0v2.6"/>',
  unlock: '<rect x="4.8" y="10.4" width="14.4" height="9.8" rx="2.2"/><path d="M8.4 10.4V7.8a3.6 3.6 0 0 1 6.6-2"/>',
  eye: '<path d="M2.4 12S6 5.6 12 5.6 21.6 12 21.6 12 18 18.4 12 18.4 2.4 12 2.4 12z"/><circle cx="12" cy="12" r="2.8"/>',
  eyeoff: '<path d="M4 4l16 16"/><path d="M9.6 6.2A9.4 9.4 0 0 1 12 5.6c6 0 9.6 6.4 9.6 6.4a17 17 0 0 1-3.4 4.2"/><path d="M6.6 7.6A16.6 16.6 0 0 0 2.4 12S6 18.4 12 18.4a9.6 9.6 0 0 0 3.6-.7"/>',
  copy: '<rect x="8.6" y="8.6" width="11.8" height="11.8" rx="2"/><path d="M15.4 5.6H6a2 2 0 0 0-2 2v9.4"/>',
  stamp: '<path d="M9.4 3.6h5.2a1.6 1.6 0 0 1 1.6 1.8l-.5 4.2a1.6 1.6 0 0 0 1 1.7l1.9.7a1.6 1.6 0 0 1 1 1.5v1.9H4.4v-1.9a1.6 1.6 0 0 1 1-1.5l1.9-.7a1.6 1.6 0 0 0 1-1.7l-.5-4.2A1.6 1.6 0 0 1 9.4 3.6z"/><path d="M3.6 20.4h16.8"/>',
  image: '<rect x="3.6" y="4.6" width="16.8" height="14.8" rx="2"/><circle cx="8.6" cy="9.6" r="1.6"/><path d="m4.4 17.4 4.8-4.6 3.6 3.2 3-2.8 3.8 3.6"/>',
  filter: '<path d="M4 6h16l-6.2 7.4V19l-3.6-2v-3.6z"/>',
  clock: '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.4V12l3.2 2"/>',
  warning: '<path d="M12 4.2 21 19.4H3z"/><path d="M12 9.6v4.2"/><circle cx="12" cy="16.6" r=".9" fill="currentColor" stroke="none"/>',
  info: '<circle cx="12" cy="12" r="8.6"/><path d="M12 11v6"/><circle cx="12" cy="8" r="1" fill="currentColor" stroke="none"/>',
  folder: '<path d="M3.6 7.4a1.8 1.8 0 0 1 1.8-1.8h3.8l2 2.4h7.4a1.8 1.8 0 0 1 1.8 1.8v8.2a1.8 1.8 0 0 1-1.8 1.8H5.4a1.8 1.8 0 0 1-1.8-1.8z"/>',
  link: '<path d="M10 13.8a4 4 0 0 0 5.6 0l2.6-2.6a4 4 0 0 0-5.6-5.6l-1.2 1.2"/><path d="M14 10.2a4 4 0 0 0-5.6 0L5.8 12.8a4 4 0 0 0 5.6 5.6l1.2-1.2"/>',
  star: '<path d="m12 4 2.5 5.2 5.7.8-4.1 4 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4.1-4 5.7-.8z"/>',
  folder2: '<rect x="3.4" y="6.4" width="17.2" height="13.2" rx="2"/>',
  music2: '<circle cx="7.6" cy="17.2" r="2.4"/><path d="M10 17.2V6.6l8.4-1.6v10.6"/>',
  book2: '<path d="M4.4 5.6a2 2 0 0 1 2-2h11.2v16.8H6.4a2 2 0 0 0-2 2z"/><path d="M6.4 3.6v14.8"/>',
  layers: '<path d="m12 3.6 8.4 4.4-8.4 4.4L3.6 8z"/><path d="m3.6 12.6 8.4 4.4 8.4-4.4"/><path d="m3.6 16.8 8.4 4.4 8.4-4.4"/>',
  pause: '<rect x="7" y="5" width="3.6" height="14" rx="1"/><rect x="13.4" y="5" width="3.6" height="14" rx="1"/>',
  play: '<path d="M8 5.4 18.4 12 8 18.6z"/>'
};

export function icon(name, size) {
  const d = P[name] || P.spark;
  const s = size || 20;
  return '<svg class="ico ico-' + name + '" viewBox="0 0 24 24" width="' + s + '" height="' + s +
    '" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + d + '</svg>';
}

export function groupIcon(group, size) {
  const map = { text: 'book', film: 'film', comic: 'comic', stage: 'stage', audio: 'music', game: 'game', custom: 'spark' };
  return icon(map[group] || 'spark', size);
}

/* ---------------- 轻提示 ---------------- */

let toastTimer = null;
export function toast(msg, kind) {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast is-on' + (kind ? ' is-' + kind : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.className = 'toast'; }, kind === 'error' ? 4200 : 2400);
}

/* ---------------- 弹窗 ---------------- */

let activeModal = null;

export function openModal(opts) {
  return new Promise((resolve) => {
    const root = document.getElementById('modal-root');
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop' + (opts.cls ? ' ' + opts.cls : '');
    const actions = (opts.actions || [{ label: '关闭', value: null, variant: 'ghost' }]).map((a, i) =>
      '<button class="btn ' + (a.variant === 'primary' ? 'btn-primary' : a.variant === 'danger' ? 'btn-danger' : 'btn-ghost') +
      '" data-mi="' + i + '">' + esc(a.label) + '</button>').join('');

    wrap.innerHTML = '<div class="modal' + (opts.wide ? ' is-wide' : '') + (opts.sheet ? ' is-sheet' : '') + '" role="dialog" aria-modal="true">' +
      (opts.title ? '<h3 class="modal-title">' + esc(opts.title) + '</h3>' : '') +
      (opts.desc ? '<p class="modal-desc">' + esc(opts.desc) + '</p>' : '') +
      '<div class="modal-body">' + (opts.body || '') + '</div>' +
      (actions ? '<div class="modal-actions">' + actions + '</div>' : '') +
      '</div>';

    function close(v) {
      wrap.classList.remove('is-on');
      setTimeout(() => wrap.remove(), 180);
      if (activeModal === wrap) activeModal = null;
      document.removeEventListener('keydown', onKey);
      resolve(v);
    }
    function onKey(e) {
      if (e.key === 'Escape') close(null);
    }

    wrap.addEventListener('click', (e) => {
      if (e.target === wrap) { close(null); return; }
      const btn = e.target.closest('[data-mi]');
      if (btn) {
        const a = opts.actions[Number(btn.dataset.mi)];
        if (a && a.onClick) { a.onClick(close, wrap); return; }
        close(a ? a.value : null);
      }
    });
    document.addEventListener('keydown', onKey);
    root.appendChild(wrap);
    activeModal = wrap;
    requestAnimationFrame(() => wrap.classList.add('is-on'));
    if (opts.onMount) opts.onMount(wrap, close);
  });
}

export function confirmDialog(opts) {
  return openModal({
    title: opts.title || '确认操作',
    desc: opts.desc || '',
    body: opts.body || '',
    actions: [
      { label: opts.cancelText || '取消', value: false, variant: 'ghost' },
      { label: opts.confirmText || '确认', value: true, variant: opts.danger ? 'danger' : 'primary' }
    ]
  }).then((v) => !!v);
}

export function promptDialog(opts) {
  return new Promise((resolve) => {
    openModal({
      title: opts.title || '输入',
      desc: opts.desc || '',
      body: '<label class="field"><span class="field-label">' + esc(opts.label || '') + '</span>' +
        '<input class="input" id="prompt-input" type="' + (opts.type || 'text') + '" ' +
        'placeholder="' + esc(opts.placeholder || '') + '" value="' + esc(opts.value || '') + '" autocomplete="off"></label>',
      actions: [
        { label: '取消', value: null, variant: 'ghost' },
        { label: opts.confirmText || '确定', value: 'ok', variant: 'primary' }
      ],
      onMount: (root) => {
        const input = root.querySelector('#prompt-input');
        if (input) {
          input.focus();
          input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
              const btn = root.querySelector('[data-mi="1"]');
              if (btn) btn.click();
            }
          });
        }
      }
    }).then((v) => {
      if (v !== 'ok') { resolve(null); return; }
      const input = document.getElementById('prompt-input');
      resolve(input ? input.value.trim() : '');
    });
  });
}

/* ---------------- 片段 ---------------- */

export function emptyState(mark, title, text, actionHTML) {
  return '<div class="empty"><div class="empty-mark">' + esc(mark || '·') + '</div>' +
    '<p class="empty-title">' + esc(title) + '</p>' +
    (text ? '<p class="empty-text">' + esc(text) + '</p>' : '') +
    (actionHTML || '') + '</div>';
}

export function chips(items, activeValue, action, attrs) {
  return '<div class="chips">' + items.map((it) => {
    const [value, label] = Array.isArray(it) ? it : [it.value, it.label];
    return '<button class="chip' + (String(activeValue) === String(value) ? ' is-on' : '') + '" ' +
      'data-action="' + action + '" data-value="' + esc(value) + '"' + (attrs || '') + '>' + esc(label) + '</button>';
  }).join('') + '</div>';
}

export function seg(key, label, opts) {
  return '<div class="set-row"><span class="set-label">' + esc(label) + '</span>' +
    '<div class="set-opts">' + opts.map((o) => {
      const [value, text, on] = o;
      return '<button class="set-opt' + (on ? ' is-on' : '') + '" data-action="set-pref" ' +
        'data-key="' + esc(key) + '" data-value="' + esc(value) + '">' + esc(text) + '</button>';
    }).join('') + '</div></div>';
}

export function badge(text, tone) {
  return '<span class="badge' + (tone ? ' is-' + tone : '') + '">' + esc(text) + '</span>';
}


