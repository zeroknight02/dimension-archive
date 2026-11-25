/* ==========================================================
   次元簿 · 格式化工具
   纯函数、无副作用（说明书 18.1 工具函数要求）
   ========================================================== */

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function pad(n) {
  return String(n).padStart(2, '0');
}

export function ymd(d) {
  const x = d instanceof Date ? d : new Date(d);
  if (isNaN(x.getTime())) return '';
  return x.getFullYear() + '-' + pad(x.getMonth() + 1) + '-' + pad(x.getDate());
}

export function todayISO() {
  return ymd(new Date());
}

export function fmtDate(v, style) {
  if (!v) return '';
  const s = String(v);
  if (s.length < 10) return s;
  if (style === 'dot') return s.slice(0, 10).replace(/-/g, '.');
  if (style === 'cn') return Number(s.slice(0, 4)) + ' 年 ' + Number(s.slice(5, 7)) + ' 月 ' + Number(s.slice(8, 10)) + ' 日';
  return s.slice(0, 10);
}

export function relDate(v) {
  if (!v) return '';
  const t = new Date(v).getTime();
  if (isNaN(t)) return '';
  const diff = Date.now() - t;
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return Math.floor(diff / 60000) + ' 分钟前';
  if (diff < 86400000) return Math.floor(diff / 3600000) + ' 小时前';
  if (diff < 86400000 * 30) return Math.floor(diff / 86400000) + ' 天前';
  return fmtDate(v);
}


export function fmtHours(h) {
  const x = Number(h) || 0;
  if (!x) return '0';
  if (x < 1) return String(Math.round(x * 60)) + '′';
  return (Math.round(x * 10) / 10) + '';
}

export function fmtSize(bytes) {
  const b = Number(bytes) || 0;
  if (b < 1024) return b + ' B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + ' KB';
  if (b < 1024 * 1024 * 1024) return (b / 1048576).toFixed(1) + ' MB';
  return (b / 1073741824).toFixed(2) + ' GB';
}

export function money(n, cur) {
  const x = Number(n);
  if (!isFinite(x) || !x) return '';
  return (cur || '¥') + (Math.round(x * 100) / 100).toLocaleString('zh-CN');
}

/* 评分：内部统一按 10 分制存储，按偏好显示 */
export function ratingText(v, scale) {
  const x = Number(v) || 0;
  if (!x) return '—';
  if (scale === '5') return (Math.round(x / 2 * 10) / 10) + ' / 5';
  if (scale === '100') return Math.round(x * 10) + ' / 100';
  return (Math.round(x * 10) / 10) + ' / 10';
}

export function ratingShort(v) {
  const x = Number(v) || 0;
  return x ? (Math.round(x * 10) / 10) : '';
}


/* 无封面时用标题生成稳定色，保证同一作品每次颜色一致 */
const COVER_COLORS = ['#7657C9', '#3F7EA8', '#A8557A', '#4E8A6B', '#9A6B3F', '#6B5AA8', '#2F7F86', '#A85B4E'];

export function coverColor(title) {
  const s = String(title || '·');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973;
  return COVER_COLORS[h % COVER_COLORS.length];
}

export function initials(title) {
  const s = String(title || '·').trim();
  if (!s) return '·';
  const latin = /^[A-Za-z0-9]/.test(s);
  if (latin) return s.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  return s.slice(0, 1);
}

export function pct(cur, total) {
  const a = Number(cur) || 0;
  const b = Number(total) || 0;
  if (!b) return 0;
  return Math.max(0, Math.min(100, Math.round(a / b * 100)));
}

export function truncate(s, n) {
  const t = String(s || '');
  return t.length > n ? t.slice(0, n) + '…' : t;
}


/* 进度描述：按类型模式给出可读文本 */
export function progressText(work, progress) {
  if (!progress) return '';
  const p = progress;
  const mode = work && work.mode ? work.mode : '';
  if (mode === 'book') {
    if (p.unit === 'volume') return [p.volumeCur || 0, p.volumeTotal || ''].filter((x) => x !== '').join(' / ') + ' 卷';
    if (p.unit === 'page') return [p.pageCur || 0, p.pageTotal || ''].filter((x) => x !== '').join(' / ') + ' 页';
    return [p.chapterCur || 0, p.chapterTotal || ''].filter((x) => x !== '').join(' / ') + ' 章';
  }
  if (mode === 'series') {
    const seg = [p.seasonCur ? 'S' + p.seasonCur : '', p.seasonTotal ? '/' + p.seasonTotal : ''].join('');
    const ep = [p.epCur || 0, p.epTotal ? ' / ' + p.epTotal : ''].join('');
    return (seg ? seg + ' · ' : '') + ep + ' 集';
  }
  if (mode === 'percent') {
    return (p.percent || 0) + '%' + (p.hours ? ' · ' + fmtHours(p.hours) + ' 小时' : '');
  }
  if (mode === 'issue') {
    return [p.issueYear || '', p.issueNo ? '第 ' + p.issueNo + ' 期' : ''].filter(Boolean).join(' ');
  }
  return '';
}
