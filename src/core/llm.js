/* ==========================================================
   次元簿 · 联网 AI 接入（说明书 9.5）
   默认关闭；密钥用账号库的主密码加密后存在本地设置里，
   与账号密码同等对待，绝不写入备份、绝不上报给任何第三方。
   只接 OpenAI 兼容的 /chat/completions 接口，不内置任何厂商 SDK。
   ========================================================== */

import { setting, saveSetting } from './repo.js';
import * as vault from './crypto.js';

export const LLM_DEFAULTS = {
  enabled: false,
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini'
};

export function llmConfig() {
  return {
    enabled: !!setting('llmEnabled', LLM_DEFAULTS.enabled),
    baseUrl: String(setting('llmBaseUrl', LLM_DEFAULTS.baseUrl) || '').trim(),
    model: String(setting('llmModel', LLM_DEFAULTS.model) || '').trim(),
    hasKey: !!setting('llmKey', null),
    lastUsedAt: setting('llmLastUsedAt', '')
  };
}

export async function saveLLMConfig(patch) {
  if (typeof patch.enabled === 'boolean') await saveSetting('llmEnabled', patch.enabled);
  if (typeof patch.baseUrl === 'string') await saveSetting('llmBaseUrl', patch.baseUrl.trim());
  if (typeof patch.model === 'string') await saveSetting('llmModel', patch.model.trim());
  if (typeof patch.apiKey === 'string' && patch.apiKey.trim()) {
    const cipher = await vault.encryptSecret(patch.apiKey.trim());
    if (!cipher) return { ok: false, error: '需要先在账号库设置主密码并解锁，才能保存密钥' };
    await saveSetting('llmKey', cipher);
  }
  return { ok: true };
}

export async function clearLLMKey() {
  await saveSetting('llmKey', null);
}

export async function loadLLMKey() {
  const cipher = setting('llmKey', null);
  if (!cipher) return '';
  const plain = await vault.decryptSecret(cipher);
  if (!plain) throw new Error('密钥读不出来，请先解锁账号库');
  return plain;
}

export function maskKey() {
  const c = setting('llmKey', null);
  return c ? '已保存（加密）' : '未设置';
}

/* 网络请求：超时、错误信息都要能让人看懂 */
export async function chat(messages, opts) {
  const o = opts || {};
  const cfg = llmConfig();
  if (!cfg.enabled) throw new Error('联网 AI 处于关闭状态');
  if (!cfg.baseUrl) throw new Error('还没有填写接口地址');
  if (!cfg.model) throw new Error('还没有填写模型名');

  const key = await loadLLMKey();
  if (!key) throw new Error('还没有填写 API 密钥');

  const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), o.timeout || 90000);

  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + key
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        temperature: typeof o.temperature === 'number' ? o.temperature : 0.4,
        max_tokens: o.maxTokens || 1800,
        stream: false
      }),
      signal: ctrl.signal
    });
  } catch (e) {
    clearTimeout(timer);
    if (e && e.name === 'AbortError') throw new Error('请求超时，模型没有在 90 秒内返回');
    throw new Error('网络请求失败：' + (e.message || '可能被跨域策略或网络拦截'));
  }
  clearTimeout(timer);

  if (!res.ok) {
    let detail = '';
    try {
      const text = await res.text();
      const json = JSON.parse(text);
      detail = (json.error && (json.error.message || json.error.code)) || '';
    } catch (e) { /* 非 JSON 错误体 */ }
    throw new Error('接口返回 ' + res.status + (detail ? '：' + detail : ''));
  }

  const json = await res.json();
  const choice = (json.choices || [])[0] || {};
  const msg = choice.message || {};
  const content = typeof msg.content === 'string' ? msg.content : '';
  if (!content) throw new Error('模型没有返回内容');
  await saveSetting('llmLastUsedAt', new Date().toISOString());
  return {
    text: content,
    model: json.model || cfg.model,
    usage: json.usage || null
  };
}

/* 发送前的数据清单：只挑必要字段，账号、主密码、密钥永不进入 */
export function buildContext(workIds, opts) {
  const o = opts || {};
  const { liveWorks, getWork, detailsOf, experiencesOf, data } = o.repo || {};
  const ids = workIds || [];
  const items = ids.map((id) => {
    const w = getWork ? getWork(id) : null;
    if (!w) return null;
    const d = detailsOf ? detailsOf(w.id) : {};
    const item = {
      title: w.title,
      type: w.type,
      creator: w.creator || '',
      year: w.year || '',
      rating: w.rating || 0,
      status: w.status || ''
    };
    if (o.withDetails) {
      item.summary = w.summary || '';
      item.fields = {};
      ['publisher', 'runtime', 'epCount', 'platforms', 'gameType', 'albumType', 'pages'].forEach((k) => {
        if (d[k]) item.fields[k] = d[k];
      });
    }
    if (o.withExperience && experiencesOf) {
      item.experiences = experiencesOf(w.id).slice(0, 6).map((e) => ({
        start: e.startDate, end: e.endDate, status: e.status, note: e.note || ''
      }));
    }
    return item;
  }).filter(Boolean);

  const reviews = o.withReviews
    ? (data ? data.reviews.filter((r) => !r.deletedAt && ids.indexOf(r.workId) >= 0) : [])
      .map((r) => ({ title: r.title, body: String(r.body || '').slice(0, 1200) }))
    : [];

  const excerpts = o.withExcerpts
    ? (data ? data.excerpts.filter((x) => !x.deletedAt && ids.indexOf(x.workId) >= 0) : [])
      .map((x) => String(x.content || '').slice(0, 300))
    : [];

  return { works: items, reviews, excerpts };
}

export function contextToText(ctx) {
  const lines = [];
  if (ctx.works.length) {
    lines.push('【作品】');
    ctx.works.forEach((w) => {
      lines.push('- ' + w.title + '（' + [w.creator, w.year].filter(Boolean).join('，') + '）' +
        (w.rating ? ' 我的评分 ' + w.rating + '/10' : '') + (w.status ? ' 状态 ' + w.status : ''));
      if (w.summary) lines.push('  简介：' + w.summary);
      if (w.fields && Object.keys(w.fields).length) {
        lines.push('  档案：' + Object.keys(w.fields).map((k) => k + '=' + w.fields[k]).join('，'));
      }
      (w.experiences || []).forEach((e) => {
        lines.push('  体验：' + [e.start, e.end, e.status, e.note].filter(Boolean).join(' / '));
      });
    });
  }
  if (ctx.reviews.length) {
    lines.push('【我的总结】');
    ctx.reviews.forEach((r) => { lines.push('· ' + (r.title || '') + '：' + r.body); });
  }
  if (ctx.excerpts.length) {
    lines.push('【摘抄】');
    ctx.excerpts.forEach((t) => lines.push('· ' + t));
  }
  return lines.join('\n');
}
