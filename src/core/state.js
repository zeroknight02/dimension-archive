/* ==========================================================
   次元簿 · 界面状态与本地偏好
   说明书 2.2.2：LocalStorage 只放非关键设置（主题、密度、
   最近模块、筛选条件、界面状态），绝不承载业务数据。
   ========================================================== */

const KEY = 'dimension-archive.ui.v1';

const DEFAULTS = {
  theme: 'dark',
  density: 'normal',
  lastRoute: '#/home',
  backupAt: 0,
  backupNudgeOff: false,
  ratingScale: '10',
  offTypes: {},
  album: {
    per: 1,
    order: 'seq',
    sound: true,
    style: 'grid',
    view: 'shelf',
    ticket: { movie: 'stub', stage: 'stub' },
    seen: {},
    baseline: 0,
    pos: {},
    order2: []
  },
  works: { view: 'grid', sort: 'updated', type: 'all', status: 'all', tag: 'all', year: 'all', rating: 'all' },
  autoLock: 10,
  quickAdd: ['work', 'experience', 'excerpt', 'review', 'resource', 'account']
};

function deepMerge(base, patch) {
  const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
  Object.keys(patch || {}).forEach((k) => {
    const v = patch[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && base && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = deepMerge(base[k], v);
    } else {
      out[k] = v;
    }
  });
  return out;
}

let prefs = deepMerge(DEFAULTS, {});

export function loadPrefs() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) prefs = deepMerge(DEFAULTS, JSON.parse(raw));
  } catch (e) {
    prefs = deepMerge(DEFAULTS, {});
  }
  return prefs;
}

let saveTimer = null;
export function savePrefs() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch (e) {
      /* LocalStorage 写入失败不得影响业务数据（说明书 2.2.2） */
    }
  }, 120);
}

export function pref(path, value) {
  const keys = String(path).split('.');
  if (value === undefined) {
    let cur = prefs;
    for (const k of keys) {
      if (cur == null) return undefined;
      cur = cur[k];
    }
    return cur;
  }
  let cur = prefs;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  cur[keys[keys.length - 1]] = value;
  savePrefs();
  return value;
}


/* ---------------- 界面状态（不落盘，刷新即重置） ---------------- */

export const ui = {
  route: { name: 'home', id: null, sub: '' },
  prevRoute: '',
  returnTo: '#/home',
  search: '',
  worksQ: '',
  revQ: '',
  revType: 'all',
  exQ: '',
  noteQ: '',
  filter: { type: 'all', status: 'all', tag: 'all', year: 'all', rating: 'all', sort: 'updated' },
  album: { type: '', page: 0, q: '' },
  yearbook: { type: '', year: '', month: 0, index: 1 },
  collectionsTab: 'wish',
  collType: 'all',
  knowledgeTab: 'reviews',
  accountsUnlockedShown: false,
  cal: { year: 0, month: 0, selected: '', mode: 'month', anchor: '', filter: 'all' },
  musicTab: 'rank',
  musicYear: '',
  splitWorkId: '',
  aiWorks: [],
  aiTask: 'digest',
  aiInc: { details: true, exp: true, reviews: true, excerpts: true },
  aiPreview: '',
  aiOut: '',
  aiOutEdited: false,
  aiBusy: false,
  aiYear: '',
  noteTag: '',
  noteWork: '',
  timeline: { year: '', month: '', type: 'all', tag: '', kinds: { start: true, finish: true, collect: true, buy: true, review: true, excerpt: true } },
  hubTab: {},
  financeTab: 'expenses',
  subRange: 'all',
  loanTab: 'out',
  planYear: '',
  discScope: { kind: 'wish', id: '', type: 'all', tag: '' },
  discSeen: [],
  discPick: '',
  graphTab: 'map',
  aiTab: 'import',
  anaTab: 'dash',
  galleryTab: 'hall',
  hallView: 'wall',
  hallDense: false,
  extTab: 'types',
  aiImportText: '',
  aiQ: '',
  creatorQ: '',
  weekCollapsed: [],
  homeSectionsDraft: null,
  editing: null,
  dirty: false,
  suspendRender: false,
  booted: false,
  bootError: '',
  loading: false,
  modal: null
};

/* ---------------- 路由 ---------------- */

const ROUTES = ['home', 'works', 'work', 'new', 'edit', 'album', 'yearbook', 'experiences',
  'collections', 'resources', 'knowledge', 'reviews', 'excerpts', 'accounts', 'taxonomy',
  'stats', 'settings', 'search', 'trash', 'more',
  /* P1 - P4 */
  'hub', 'creators', 'creator', 'physical', 'finance', 'loans', 'plans', 'calendar',
  'timeline', 'discover', 'graph', 'series', 'assistant', 'analytics', 'gallery', 'extensions',
  /* 6.3 / 6.4 / 5.5 / 5.2.3 */
  'review', 'periodicals', 'periodical', 'music', 'notes', 'updates'];

export function parseRoute(hash) {
  const h = String(hash || location.hash || '').replace(/^#\/?/, '');
  const parts = h.split('/').filter(Boolean);
  const name = parts[0] || 'home';
  if (ROUTES.indexOf(name) < 0) return { name: 'home', id: null, sub: '' };
  return { name, id: parts[1] ? decodeURIComponent(parts[1]) : null, sub: parts[2] || '' };
}

export function go(hash, replace) {
  if (replace) {
    const url = location.pathname + location.search + hash;
    history.replaceState(null, '', url);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else if (location.hash === hash) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = hash;
  }
}

export function isMobile() {
  return window.innerWidth < 768;
}


