/* ==========================================================
   次元簿 · 评价与总结
   说明书 5.5：每部作品可以有多篇总结，也可以有独立文章；
   支持 Markdown、结构化分项、插图、附件与内容来源标记。
   编辑器自动保存草稿，保存失败保留内容。
   ========================================================== */

import {
  reviews, liveWorks, getWork, saveReviewImage, saveAttachmentFile,
  attachmentUrl, deleteAttachments, humanSize, imageUrl
} from '../core/repo.js';
import { REVIEW_TYPES, REVIEW_SECTIONS, CONTENT_SOURCES } from '../core/schema.js';
import { ui, go } from '../core/state.js';
import { icon, toast, openModal, confirmDialog, emptyState } from '../core/ui.js';
import { esc, todayISO, ratingShort, truncate } from '../core/format.js';

const DRAFT_KEY = 'dimension-archive.draft.review';

export function sourceLabel(v) {
  return (CONTENT_SOURCES.find((s) => s.value === v) || {}).label || '手动记录';
}

function sourceBadge(v) {
  const val = v || 'manual';
  const tone = val === 'ai' ? 'is-violet' : val === 'ai-edited' ? 'is-ok' : val === 'import' ? 'is-warn' : '';
  return '<span class="badge ' + tone + ' src-' + val + '">' + esc(sourceLabel(val)) + '</span>';
}

function readDraft() {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function writeDraft(d) {
  try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch (e) { /* 容量不足时不阻断写作 */ }
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY); } catch (e) { /* ignore */ }
}

/* 极简 Markdown 预览（标题 / 粗体 / 斜体 / 列表 / 引用） */
export function mdToHtml(src) {
  const lines = String(src || '').split(/\n/);
  let out = '';
  let inList = false;
  const inline = (t) => esc(t)
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  lines.forEach((line) => {
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      if (inList) { out += '</ul>'; inList = false; }
      const lv = Math.min(4, h[1].length) + 2;
      out += '<h' + lv + '>' + inline(h[2]) + '</h' + lv + '>';
      return;
    }
    if (/^>\s?/.test(line)) {
      if (inList) { out += '</ul>'; inList = false; }
      out += '<blockquote>' + inline(line.replace(/^>\s?/, '')) + '</blockquote>';
      return;
    }
    if (/^[-*]\s+/.test(line)) {
      if (!inList) { out += '<ul>'; inList = true; }
      out += '<li>' + inline(line.replace(/^[-*]\s+/, '')) + '</li>';
      return;
    }
    if (!line.trim()) {
      if (inList) { out += '</ul>'; inList = false; }
      out += '<p class="md-gap"></p>';
      return;
    }
    if (inList) { out += '</ul>'; inList = false; }
    out += '<p>' + inline(line) + '</p>';
  });
  if (inList) out += '</ul>';
  return out;
}

export function reviewsView() {
  const all = reviews.list();

  let html = '<header class="page-head">' +
    '<div><p class="eyebrow">知识库 · ' + all.length + ' 篇</p><h1 class="page-title">总结</h1></div>' +
    '<div class="head-actions"><button class="icon-btn" data-action="new-review" aria-label="写一篇">' + icon('plus', 20) + '</button></div>' +
    '</header>';

  html += knowledgeTabs('reviews');

  html += '<div class="toolbar" style="margin-bottom:12px">' +
    '<div class="searchbar">' + icon('search', 16) +
    '<input id="rev-search" type="search" placeholder="搜索标题、正文、作品" value="' + esc(ui.revQ || '') + '" autocomplete="off"></div>' +
    '<div class="row-flex">' +
    '<select class="select" data-change="rev-type" style="flex:1;min-height:36px">' +
    '<option value="all">全部类型</option>' +
    REVIEW_TYPES.map((t) => '<option value="' + esc(t) + '"' + (ui.revType === t ? ' selected' : '') + '>' + esc(t) + '</option>').join('') +
    '</select></div></div>';

  html += '<div id="rev-body">' + reviewsBodyHTML() + '</div>';
  return html;
}

export function paintReviews() {
  const box = document.getElementById('rev-body');
  if (box) box.innerHTML = reviewsBodyHTML();
}

function reviewsBodyHTML() {
  const q = String(ui.revQ || '').trim().toLowerCase();
  const ft = ui.revType || 'all';
  const all = reviews.list().filter((r) => {
    if (ft !== 'all' && r.type !== ft) return false;
    if (!q) return true;
    const w = r.workId ? getWork(r.workId) : null;
    return [r.title, r.body, r.type, w ? w.title : ''].join(' ').toLowerCase().indexOf(q) >= 0;
  }).sort((a, b) => String(b.date || b.createdAt).localeCompare(String(a.date || a.createdAt)));
  const draft = readDraft();

  let html = '';
  if (draft && draft.title) {
    html += '<div class="notice is-warn"><span>' + icon('warning', 15) + '</span><span>有一篇没写完的草稿：' +
      esc(truncate(draft.title, 20)) + ' <button class="btn btn-ghost btn-xs" data-action="resume-review">继续写</button></span></div>';
  }

  if (!all.length) {
    return html + emptyState('·', q || ft !== 'all' ? '没有匹配的总结' : '还没有总结',
      q || ft !== 'all' ? '换个关键词或类型。' : '读后感、观后感、作品分析都可以写在这里，支持 Markdown、插图和附件。',
      '<button class="btn btn-primary btn-sm" data-action="new-review">＋ 写第一篇</button>');
  }

  return html + '<div class="rev-list">' + all.map((r) => {
    const w = r.workId ? getWork(r.workId) : null;
    const imgs = (r.images || []).length;
    const files = (r.files || []).length;
    return '<button class="rev-card" data-action="read-review" data-id="' + r.id + '">' +
      '<span class="rev-top"><span class="badge">' + esc(r.type || '文本') + '</span>' +
      (r.rating ? '<span class="badge is-gold">★ ' + ratingShort(r.rating) + '</span>' : '') +
      sourceBadge(r.source) +
      '<span class="rev-date">' + esc(r.date || (r.createdAt || '').slice(0, 10)) + '</span></span>' +
      '<b class="rev-title">' + esc(r.title || '未命名') + '</b>' +
      (w ? '<span class="rev-work">' + esc(w.title) + '</span>' : '<span class="rev-work">独立文章</span>') +
      '<span class="rev-body">' + esc(truncate(String(r.body || '').replace(/[#>*`]/g, ''), 110)) + '</span>' +
      (imgs || files ? '<span class="rev-attach">' +
        (imgs ? '<i>' + icon('image', 12) + imgs + '</i>' : '') +
        (files ? '<i>' + icon('folder', 12) + files + '</i>' : '') + '</span>' : '') +
      '</button>';
  }).join('') + '</div>';
}

export function knowledgeTabs(active) {
  return '<div class="segbar" style="margin-bottom:14px">' +
    '<button class="' + (active === 'reviews' ? 'is-on' : '') + '" data-action="go" data-to="#/knowledge/reviews">总结</button>' +
    '<button class="' + (active === 'excerpts' ? 'is-on' : '') + '" data-action="go" data-to="#/knowledge/excerpts">摘抄</button>' +
    '<button class="' + (active === 'notes' ? 'is-on' : '') + '" data-action="go" data-to="#/knowledge/notes">笔记</button>' +
    '</div>';
}

/* ---------------- 阅读页 ---------------- */

export function reviewDetailView(id) {
  const r = id ? reviews.get(id) : null;
  if (!r) {
    return '<header class="page-head"><div><h1 class="page-title">这篇总结不存在</h1></div></header>' +
      '<p class="muted">它可能已被删除。</p>' +
      '<div style="margin-top:16px"><button class="btn btn-ghost btn-sm" data-action="go" data-to="#/knowledge/reviews">返回总结</button></div>';
  }
  const w = r.workId ? getWork(r.workId) : null;
  const secs = REVIEW_SECTIONS.filter((s) => (r.sections || {})[s.key]);
  const images = r.images || [];
  const files = r.files || [];

  let html = '<header class="page-head">' +
    '<div class="head-left"><button class="icon-btn" data-action="back" aria-label="返回">' + icon('back', 20) + '</button>' +
    '<div><p class="eyebrow">' + esc(r.type || '总结') + ' · ' + esc(r.date || '') + '</p>' +
    '<h1 class="page-title">' + esc(r.title || '未命名') + '</h1></div></div>' +
    '<div class="head-actions"><button class="icon-btn" data-action="edit-review" data-id="' + r.id + '" aria-label="编辑">' + icon('edit', 18) + '</button></div>' +
    '</header>';

  html += '<div class="row-flex" style="gap:6px;margin-bottom:16px">' +
    sourceBadge(r.source) +
    (r.rating ? '<span class="badge is-gold">★ ' + ratingShort(r.rating) + '</span>' : '') +
    (w ? '<a class="chip" href="#/work/' + w.id + '">' + esc(w.title) + '</a>' : '<span class="badge">独立文章</span>') +
    '</div>';

  if (secs.length) {
    html += '<section class="section"><div class="rev-secs">' + secs.map((s) =>
      '<div class="rev-sec"><p class="field-label">' + esc(s.label) + '</p>' +
      '<p class="rev-sec-body">' + esc(r.sections[s.key]) + '</p></div>').join('') + '</div></section>';
  }

  html += '<article class="rev-read prose">' + mdToHtml(r.body) + '</article>';

  if (images.length) {
    html += '<section class="section" style="margin-top:20px"><div class="section-head"><h2 class="section-title">插图</h2>' +
      '<span class="section-note">' + images.length + ' 张</span></div><div class="rv-shots">' +
      images.map((img) => '<figure class="rv-shot"><img src="' + esc(imageUrl(img.id)) + '" alt="" loading="lazy">' +
        (img.caption ? '<figcaption>' + esc(img.caption) + '</figcaption>' : '') + '</figure>').join('') +
      '</div></section>';
  }

  if (files.length) {
    html += '<section class="section"><div class="section-head"><h2 class="section-title">附件</h2>' +
      '<span class="section-note">' + files.length + ' 个</span></div><div class="rows">' +
      files.map((f) => '<div class="rowitem is-static">' +
        '<span class="row-icon">' + icon('folder', 15) + '</span>' +
        '<span class="rowitem-main"><b>' + esc(f.name) + '</b><i>' + esc(humanSize(f.size)) + '</i></span>' +
        '<span class="rowitem-side"><button class="btn btn-ghost btn-xs" data-action="rv-file-get" data-id="' + f.id + '" data-name="' + esc(f.name) + '">下载</button></span>' +
        '</div>').join('') + '</div></section>';
  }

  html += '<div class="row-flex" style="margin-top:20px">' +
    '<button class="btn btn-ghost btn-sm" data-action="edit-review" data-id="' + r.id + '">编辑这篇</button>' +
    '<button class="btn btn-ghost btn-sm" data-action="del-review" data-id="' + r.id + '">删除</button></div>';

  return html;
}

/* ---------------- 编辑器 ---------------- */

export function openReviewEditor(id, presetWorkId) {
  const cur = id ? reviews.get(id) : null;
  const d = cur ? Object.assign({}, cur, {
    images: (cur.images || []).slice(),
    files: (cur.files || []).slice(),
    sections: Object.assign({}, cur.sections || {})
  }) : {
    id: '', workId: presetWorkId || '', type: '读后感', title: '', body: '', rating: 0, date: todayISO(),
    tags: [], sections: {}, images: [], files: [], source: 'manual'
  };

  const removedIds = [];

  const body = '<div class="rev-editor">' +
    '<div class="row2"><label class="field"><span class="field-label">标题</span>' +
    '<input class="input" id="rv-title" value="' + esc(d.title) + '" placeholder="这篇总结叫什么"></label>' +
    '<label class="field"><span class="field-label">日期</span><input class="input" type="date" id="rv-date" value="' + esc(d.date) + '"></label></div>' +
    '<div class="row2"><label class="field"><span class="field-label">类型</span><select class="select" id="rv-type">' +
    (d.type && REVIEW_TYPES.indexOf(d.type) < 0 ? '<option selected>' + esc(d.type) + '</option>' : '') +
    REVIEW_TYPES.map((t) => '<option' + (d.type === t ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></label>' +
    '<label class="field"><span class="field-label">关联作品</span><select class="select" id="rv-work">' +
    '<option value="">独立文章</option>' + liveWorks().sort((a, b) => String(a.title).localeCompare(String(b.title), 'zh-Hans-CN'))
      .map((w) => '<option value="' + w.id + '"' + (w.id === d.workId ? ' selected' : '') + '>' + esc(w.title) + '</option>').join('') +
    '</select></label></div>' +
    '<label class="field"><span class="field-label">正文（支持 Markdown：## 标题、**粗体**、- 列表、> 引用）</span>' +
    '<textarea class="textarea rev-textarea" id="rv-body" rows="12" placeholder="## 印象&#10;&#10;写下你的判断，而不是剧情简介。">' + esc(d.body) + '</textarea></label>' +
    '<details class="fold" style="margin-bottom:12px"><summary class="section-head"><h2 class="section-title">结构化分项</h2>' +
    '<span class="section-note">选填</span></summary>' +
    REVIEW_SECTIONS.map((sec) =>
      '<label class="field"><span class="field-label">' + esc(sec.label) + '</span>' +
      '<textarea class="textarea" data-sec="' + sec.key + '" rows="2" placeholder="' + esc(sec.label) + '">' +
      esc((d.sections || {})[sec.key] || '') + '</textarea></label>').join('') +
    '</details>' +
    '<details class="fold" open style="margin-bottom:12px"><summary class="section-head"><h2 class="section-title">插图与附件</h2>' +
    '<span class="section-note">存在本地</span></summary>' +
    '<div class="rv-media-tools">' +
    '<label class="btn btn-ghost btn-sm">＋ 添加图片<input type="file" accept="image/*" multiple id="rv-img" hidden></label>' +
    '<label class="btn btn-ghost btn-sm">＋ 添加附件<input type="file" id="rv-file" hidden></label>' +
    '<span class="rv-media-hint">图片自动压缩；附件单个不超过 25MB</span></div>' +
    '<div id="rv-media"></div></details>' +
    '<div class="rev-preview" id="rv-preview"></div>' +
    '<div class="row2"><label class="field"><span class="field-label">评分</span><select class="select" id="rv-rating">' +
    '<option value="0">不评分</option>' + [10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((v) =>
      '<option value="' + v + '"' + (Number(d.rating) === v ? ' selected' : '') + '>' + v + ' 分</option>').join('') + '</select></label>' +
    '<label class="field"><span class="field-label">内容来源</span><select class="select" id="rv-source">' +
    CONTENT_SOURCES.map((s) => '<option value="' + s.value + '"' + ((d.source || 'manual') === s.value ? ' selected' : '') + '>' +
      esc(s.label) + '</option>').join('') + '</select></label></div>' +
    (cur ? '<button type="button" class="btn btn-danger btn-sm" data-action="del-review" data-id="' + cur.id + '">删除这篇</button>' : '') +
    '</div>';

  openModal({
    title: cur ? '编辑总结' : '写一篇总结',
    wide: true,
    body,
    actions: [{ label: '关闭', value: null, variant: 'ghost' }, { label: '保存', value: 'save', variant: 'primary' }],
    onMount: (root) => {
      const bind = (sel, key) => {
        const el = root.querySelector(sel);
        if (!el) return;
        const ev = el.tagName === 'SELECT' ? 'change' : 'input';
        el.addEventListener(ev, () => {
          d[key] = key === 'rating' ? Number(el.value) || 0 : el.value;
          writeDraft(d);
          if (key === 'body') paint();
        });
      };
      const paint = () => {
        const prev = root.querySelector('#rv-preview');
        if (prev) prev.innerHTML = d.body ? mdToHtml(d.body) : '';
      };

      const media = () => {
        const box = root.querySelector('#rv-media');
        if (!box) return;
        box.innerHTML =
          (d.images.length
            ? '<div class="rv-media-grid">' + d.images.map((img, i) =>
              '<figure class="rv-media-item"><img src="' + esc(imageUrl(img.id)) + '" alt="">' +
              '<input class="input rv-cap" data-i="' + i + '" value="' + esc(img.caption || '') + '" placeholder="图注（选填）">' +
              '<button type="button" class="rv-media-del" data-kind="img" data-i="' + i + '">移除</button></figure>').join('') + '</div>'
            : '') +
          (d.files.length
            ? '<div class="rv-files">' + d.files.map((f, i) =>
              '<div class="rv-file"><span>' + icon('folder', 14) + esc(f.name) + '</span>' +
              '<i>' + humanSize(f.size) + '</i>' +
              '<button type="button" class="rv-media-del" data-kind="file" data-i="' + i + '">移除</button></div>').join('') + '</div>'
            : '') +
          (!d.images.length && !d.files.length
            ? '<p class="muted" style="font-size:12px">还没有插图或附件。图片适合放截图、手写笔记；附件适合放 PDF、长文。</p>'
            : '');

        box.querySelectorAll('.rv-cap').forEach((el) => {
          el.addEventListener('input', () => {
            d.images[Number(el.dataset.i)].caption = el.value;
          });
        });
        box.querySelectorAll('.rv-media-del').forEach((btn) => {
          btn.addEventListener('click', () => {
            const i = Number(btn.dataset.i);
            const arr = btn.dataset.kind === 'img' ? d.images : d.files;
            const gone = arr.splice(i, 1)[0];
            /* 编辑器可能被取消：先只摘掉引用，保存成功后再真正删除附件 */
            if (gone) removedIds.push(gone.id);
            media();
          });
        });
      };

      bind('#rv-title', 'title');
      bind('#rv-date', 'date');
      bind('#rv-type', 'type');
      bind('#rv-work', 'workId');
      bind('#rv-body', 'body');
      bind('#rv-rating', 'rating');
      bind('#rv-source', 'source');
      root.querySelectorAll('[data-sec]').forEach((el) => {
        el.addEventListener('input', () => {
          d.sections = d.sections || {};
          d.sections[el.dataset.sec] = el.value;
        });
      });

      const imgInput = root.querySelector('#rv-img');
      if (imgInput) imgInput.addEventListener('change', async () => {
        const files = [...(imgInput.files || [])];
        imgInput.value = '';
        for (const f of files) {
          try {
            const saved = await saveReviewImage(f);
            if (saved) d.images.push({ id: saved.id, caption: '' });
          } catch (e) {
            toast(e.message || '图片处理失败', 'error');
          }
        }
        media();
      });

      const fileInput = root.querySelector('#rv-file');
      if (fileInput) fileInput.addEventListener('change', async () => {
        const f = (fileInput.files || [])[0];
        fileInput.value = '';
        if (!f) return;
        try {
          const saved = await saveAttachmentFile(f);
          if (saved) d.files.push(saved);
        } catch (e) {
          toast(e.message || '附件保存失败', 'error');
        }
        media();
      });

      media();
      paint();
    }
  }).then(async (v) => {
    if (v !== 'save') return;
    if (!String(d.title || '').trim() && !String(d.body || '').trim()) { toast('写点什么再保存'); return; }
    if (!String(d.title || '').trim()) d.title = String(d.body).trim().slice(0, 18);
    const res = await reviews.save(d);
    if (!res.ok) { toast(res.error || '保存失败，草稿已留在本机', 'error'); return; }
    if (removedIds.length) await deleteAttachments(removedIds);
    clearDraft();
    toast('已保存');
    const newId = res.row ? res.row.id : d.id;
    go(newId ? '#/review/' + newId : '#/knowledge/reviews');
  });
}

export const actions = {
  'new-review': (el) => openReviewEditor(null, el && el.dataset.value ? el.dataset.value : ''),
  'edit-review': (el) => openReviewEditor(el.dataset.id),
  'read-review': (el) => go('#/review/' + el.dataset.id),
  'resume-review': () => {
    const d = readDraft();
    if (!d) return;
    openReviewEditor(d.id || null, d.workId);
  },
  'rv-file-get': async (el) => {
    const url = await attachmentUrl(el.dataset.id);
    if (!url) { toast('附件读取失败', 'error'); return; }
    const a = document.createElement('a');
    a.href = url;
    a.download = el.dataset.name || 'attachment';
    document.body.appendChild(a);
    a.click();
    a.remove();
  },
  'del-review': async (el) => {
    const ok = await confirmDialog({ title: '删除这篇总结？', desc: '删除后无法恢复。', confirmText: '删除', danger: true });
    if (!ok) return;
    const r = reviews.get(el.dataset.id);
    if (r) await deleteAttachments([...(r.images || []).map((x) => x.id), ...(r.files || []).map((x) => x.id)]);
    await reviews.remove(el.dataset.id);
    const modal = document.querySelector('.modal-backdrop.is-on');
    if (modal) modal.remove();
    toast('已删除');
    go('#/knowledge/reviews');
  }
};
