/* ==========================================================
   次元簿 · Service Worker
   策略：应用外壳预缓存 + Cache First 命中回源。
   升级原则：
   1. 核心文件「全部成功」才算安装成功，任一失败则安装失败，
      旧版本与旧缓存原样保留，绝不让用户停在半成品状态。
   2. 只有确认新缓存完整，才删除旧缓存；否则旧缓存留作兜底。
   3. 每个文件下载后先完整读入内存再写入缓存，避免存入残缺文件。
   4. 不在用户编辑过程中强制刷新，新版本等待用户点「刷新」。
   ========================================================== */

const VERSION = 'v16';
const CACHE = 'dimension-archive-' + VERSION;

/* 核心文件：缺一个就用不了，必须全部成功 */
const CORE = [
  './',
  './index.html',
  './manifest.json',
  './src/styles/base.css',
  './src/styles/layout.css',
  './src/styles/components.css',
  './src/styles/album.css',
  './src/styles/pages.css',
  './src/app/main.js',
  './src/core/schema.js',
  './src/core/db.js',
  './src/core/repo.js',
  './src/core/state.js',
  './src/core/crypto.js',
  './src/core/backup.js',
  './src/core/legacy.js',
  './src/core/llm.js',
  './src/core/demo.js',
  './src/core/format.js',
  './src/core/ui.js',
  './src/modules/dashboard.js',
  './src/modules/works.js',
  './src/modules/workForm.js',
  './src/modules/album.js',
  './src/modules/yearbook.js',
  './src/modules/experiences.js',
  './src/modules/collections.js',
  './src/modules/resources.js',
  './src/modules/reviews.js',
  './src/modules/excerpts.js',
  './src/modules/accounts.js',
  './src/modules/taxonomy.js',
  './src/modules/search.js',
  './src/modules/stats.js',
  './src/modules/settings.js',
  './src/modules/hubs.js',
  './src/modules/creators.js',
  './src/modules/physical.js',
  './src/modules/finance.js',
  './src/modules/loans.js',
  './src/modules/plans.js',
  './src/modules/calendar.js',
  './src/modules/discover.js',
  './src/modules/graph.js',
  './src/modules/assistant.js',
  './src/modules/analytics.js',
  './src/modules/gallery.js',
  './src/modules/extensions.js',
  './src/modules/gamedata.js',
  './src/modules/tracks.js',
  './src/modules/periodicals.js',
  './src/modules/music.js',
  './src/modules/notes.js',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './assets/icons/brand-96.png',
  './assets/icons/favicon-32.png',
  './assets/icons/favicon-16.png',
  './assets/icons/favicon-48.png',
  './assets/icons/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    /* 逐个下载并完整读入内存后再写入；任何一个失败则整体失败 */
    await Promise.all(CORE.map(async (url) => {
      const res = await fetch(new Request(url, { cache: 'reload' }));
      if (!res || !res.ok) throw new Error('预缓存失败: ' + url);
      const buf = await res.arrayBuffer();
      await cache.put(url, new Response(buf, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers
      }));
    }));
  })());
  /* 不自动 skipWaiting：等用户确认刷新，避免打断编辑 */
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => {
      if (k !== CACHE && k.indexOf('dimension-archive-') === 0) return caches.delete(k);
      return null;
    }));
    await self.clients.claim();
  })());
});

self.addEventListener('message', (e) => {
  const data = e.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  if (data.type === 'VERSION') {
    if (e.source) e.source.postMessage({ type: 'VERSION', version: VERSION });
  }
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  /* 导航请求：优先网络，失败回退到缓存的外壳，保证离线可开 */
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const res = await fetch(req);
        if (res && res.ok) return res;
        throw new Error('nav fail');
      } catch (err) {
        const cache = await caches.open(CACHE);
        return (await cache.match('./index.html')) || (await cache.match('./')) || Response.error();
      }
    })());
    return;
  }

  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    if (hit) return hit;
    try {
      const res = await fetch(req);
      /* 只缓存同源成功响应 */
      if (res && res.ok && res.type === 'basic') cache.put(req, res.clone());
      return res;
    } catch (err) {
      return hit || Response.error();
    }
  })());
});
