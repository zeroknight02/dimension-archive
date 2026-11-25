/* ==========================================================
   次元簿 · 类型与枚举定义
   说明书 5.2.1 作品类型体系 / 5.3.2 状态体系 / 5.3.3 进度单位
   本文件只放「数据」，不含任何 UI 与业务逻辑。
   类型、字段、状态全部数据驱动，新增类型不需要改渲染代码。
   ========================================================== */

export const APP_ID = 'dimension-archive';
export const APP_VERSION = '3.4.4';
export const FORMAT_VERSION = '5.0';
export const SCHEMA_VERSION = 5;

/* ---------------- 大类 ---------------- */

export const GROUPS = {
  text: { label: '文字阅读', color: '#E8457A', icon: 'book' },
  film: { label: '影视', color: '#3FA9E0', icon: 'film' },
  comic: { label: '动漫漫画', color: '#E8913D', icon: 'comic' },
  stage: { label: '表演艺术', color: '#D96A4A', icon: 'stage' },
  audio: { label: '音频', color: '#A96BE0', icon: 'music' },
  game: { label: '游戏互动', color: '#5FB86B', icon: 'game' },
  custom: { label: '自定义', color: '#8E86A8', icon: 'spark' }
};

/* ---------------- 状态集（说明书 5.3.2） ----------------
   key 为通用桶，用于跨类型统计口径：
   wish 想体验 / todo 待体验 / doing 正在体验 / paused 暂停
   done 已完成 / dropped 已放弃 / redoing 重温中
   ------------------------------------------------------------------ */


const STATUS_SETS = {
  read: {
    wish: '想读', todo: '待读', doing: '阅读中', paused: '暂停阅读',
    done: '已读完', dropped: '弃读', redoing: '重读中'
  },
  movie: {
    wish: '想看', todo: '待看', done: '已看完', redoing: '重看中', dropped: '已放弃'
  },
  series: {
    wish: '想看', todo: '待看', doing: '观看中', paused: '暂停观看',
    done: '已追完', dropped: '已弃剧', redoing: '重温中'
  },
  game: {
    wish: '想玩', todo: '待玩', doing: '游玩中', done: '已通关', platinum: '已全成就',
    paused: '暂停', dropped: '弃坑', redoing: '重玩中'
  },
  music: {
    todo: '待听', doing: '正在听', done: '已听过', kept: '收藏', looping: '循环收听'
  },
  stage: {
    wish: '想看', ticketed: '已购票', done: '已观看', multi: '多次观看', cancelled: '已取消'
  }
};

/* 非通用桶到通用桶的映射，保证统计一致 */
const BUCKET_ALIAS = { platinum: 'done', kept: 'done', looping: 'redoing', ticketed: 'todo', multi: 'done', cancelled: 'dropped' };

export function statusLabel(setId, status) {
  const set = STATUS_SETS[setId] || STATUS_SETS.read;
  return set[status] || status || '—';
}

export function statusBucket(status) {
  return BUCKET_ALIAS[status] || status || 'todo';
}

export function statusOptions(setId) {
  const set = STATUS_SETS[setId] || STATUS_SETS.read;
  return Object.keys(set).map((k) => ({ value: k, label: set[k] }));
}

/* ---------------- 字段库 ----------------
   k 存储键 / l 标签 / g 分组 / t 类型 / o 选项 / ph 占位
   t: text | num | date | select | long
   ------------------------------------------------------------------ */

const FIELD_LIST = [
  /* 作品 · 通用出版信息 */
  { k: 'originalTitle', l: '原文名称', g: 'work', ph: '外文原名' },
  { k: 'publisher', l: '出版社', g: 'work' },
  { k: 'imprint', l: '出品方', g: 'work' },
  { k: 'subtitle', l: '副标题', g: 'work' },
  { k: 'series', l: '丛书 / 系列', g: 'work' },
  { k: 'seriesNo', l: '丛书序号', g: 'work' },
  { k: 'editionNo', l: '版次', g: 'work', ph: '第 1 版' },
  { k: 'printNo', l: '印次', g: 'work', ph: '第 3 次印刷' },
  { k: 'pubPlace', l: '出版地', g: 'work' },
  { k: 'pages', l: '页数', g: 'work', t: 'num' },
  { k: 'words', l: '字数（万）', g: 'work', t: 'num' },
  { k: 'binding', l: '装帧', g: 'work', t: 'select', o: ['平装', '精装', '线装', '电子版', '其他'] },
  { k: 'bookSize', l: '开本', g: 'work', t: 'select', o: ['32 开', '大 32 开', '16 开', 'A5', 'B5', '其他'] },
  { k: 'isbn', l: 'ISBN', g: 'work', ph: '978…' },
  { k: 'issn', l: 'ISSN', g: 'work' },
  { k: 'price', l: '定价（元）', g: 'work', t: 'num' },
  { k: 'paper', l: '用纸', g: 'work' },
  { k: 'illustrated', l: '插图', g: 'work', t: 'select', o: ['有', '无', '少量'] },
  { k: 'firstEdition', l: '首版年份', g: 'work' },
  { k: 'firstPrint', l: '首印量', g: 'work' },
  { k: 'limited', l: '限量', g: 'work' },
  { k: 'outOfPrint', l: '绝版', g: 'work', t: 'select', o: ['是', '否'] },
  { k: 'sheets', l: '印张', g: 'work', t: 'num' },
  { k: 'copies', l: '册数', g: 'work', t: 'num' },
  { k: 'appendix', l: '附录', g: 'work' },
  { k: 'firstBonus', l: '首刷赠品', g: 'work' },
  { k: 'ebookPlatform', l: '电子书平台', g: 'work' },

  /* 作品 · 影视 / 演出 */
  { k: 'runtime', l: '片长（分钟）', g: 'work', t: 'num' },
  { k: 'releaseDate', l: '上映日期', g: 'work', t: 'date' },
  { k: 'releaseRegion', l: '上映地区', g: 'work' },
  { k: 'screeningFormat', l: '放映格式', g: 'work', t: 'select', o: ['2D', '3D', 'IMAX', 'IMAX 3D', '杜比影院', 'CINITY', '其他'] },
  { k: 'ageRating', l: '分级', g: 'work' },
  { k: 'boxoffice', l: '票房', g: 'work' },
  { k: 'budget', l: '制作成本', g: 'work' },
  { k: 'distributor', l: '发行方', g: 'work' },
  { k: 'productionCompany', l: '制作公司', g: 'work' },
  { k: 'premiere', l: '首映', g: 'work' },
  { k: 'aspect', l: '画幅', g: 'work' },
  { k: 'color', l: '色彩', g: 'work', t: 'select', o: ['彩色', '黑白', '部分黑白'] },
  { k: 'seasons', l: '总季数', g: 'work', t: 'num' },
  { k: 'epCount', l: '总集数', g: 'work', t: 'num' },
  { k: 'epRuntime', l: '单集时长', g: 'work' },
  { k: 'channel', l: '播出平台', g: 'work' },
  { k: 'airWeekday', l: '播出日', g: 'work', t: 'select', o: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] },
  { k: 'airPeriod', l: '播出周期', g: 'work' },
  { k: 'airStart', l: '开播日期', g: 'work', t: 'date' },
  { k: 'airEnd', l: '完结日期', g: 'work', t: 'date' },
  { k: 'serialStatus', l: '连载状态', g: 'work', t: 'select', o: ['已完结', '连载中', '暂停', '休载'] },
  { k: 'updateWeekday', l: '更新日', g: 'work', t: 'select', o: ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] },
  { k: 'updateCycle', l: '更新频率', g: 'work', t: 'select', o: ['日更', '周更', '半月更', '月更', '不定期'] },
  { k: 'webPlatform', l: '连载平台', g: 'work' },
  { k: 'volumes', l: '总卷数', g: 'work', t: 'num' },
  { k: 'chapters', l: '总话数', g: 'work', t: 'num' },
  { k: 'originalWork', l: '原作', g: 'work' },
  { k: 'basedOn', l: '改编自', g: 'work' },

  /* 作品 · 舞台 / 演出 */
  { k: 'venue', l: '演出场馆', g: 'work' },
  { k: 'location', l: '演出城市', g: 'work' },
  { k: 'tour', l: '巡演', g: 'work' },
  { k: 'shows', l: '场次', g: 'work', t: 'num' },
  { k: 'seat', l: '座位', g: 'work' },
  { k: 'ticketPrice', l: '票价（元）', g: 'work', t: 'num' },
  { k: 'stageManager', l: '舞台监督', g: 'work' },
  { k: 'lighting', l: '灯光', g: 'work' },
  { k: 'costume', l: '服装', g: 'work' },
  { k: 'posterDesign', l: '视觉设计', g: 'work' },

  /* 作品 · 音频 */
  { k: 'albumType', l: '专辑类型', g: 'work', t: 'select', o: ['录音室', '现场', '精选', 'EP', '原声', '其他'] },
  { k: 'tracks', l: '曲目数', g: 'work', t: 'num' },
  { k: 'trackList', l: '曲目列表', g: 'work', t: 'long' },
  { k: 'discs', l: '碟数', g: 'work', t: 'num' },
  { k: 'recordPlace', l: '录制地点', g: 'work' },
  { k: 'recordingStudio', l: '录音室', g: 'work' },
  { k: 'mastering', l: '母带', g: 'work' },
  { k: 'albumLanguage', l: '专辑语言', g: 'work' },
  { k: 'musicGenre', l: '音乐类型', g: 'work' },
  { k: 'signed', l: '签名版', g: 'work', t: 'select', o: ['是', '否'] },
  { k: 'label', l: '唱片公司', g: 'work' },

  /* 作品 · 游戏 */
  { k: 'gameType', l: '游戏类型', g: 'work' },
  { k: 'characters', l: '角色备注', g: 'mine', t: 'long' },
  { k: 'saveNote', l: '存档备注', g: 'mine', t: 'long' },
  { k: 'collectibles', l: '收藏内容', g: 'mine' },
  { k: 'gameShots', l: '游戏截图说明', g: 'mine' },
  { k: 'engine', l: '引擎', g: 'work' },
  { k: 'platforms', l: '游戏平台', g: 'work' },
  { k: 'languages', l: '支持语言', g: 'work' },
  { k: 'chineseSupport', l: '中文支持', g: 'work', t: 'select', o: ['官方中文', '民间汉化', '无中文'] },
  { k: 'dlcCount', l: 'DLC 数', g: 'work', t: 'num' },
  { k: 'onlinePlayers', l: '联机人数', g: 'work' },
  { k: 'difficulty', l: '难度', g: 'work' },
  { k: 'completionistHours', l: '全收集时长', g: 'work', t: 'num' },
  { k: 'modSupport', l: '模组支持', g: 'work', t: 'select', o: ['支持', '不支持'] },
  { k: 'vrSupport', l: 'VR 支持', g: 'work', t: 'select', o: ['支持', '不支持'] },

  /* 制作 */
  { k: 'translator', l: '译者', g: 'prod' },
  { k: 'editor', l: '责编', g: 'prod' },
  { k: 'editorInChief', l: '主编', g: 'prod' },
  { k: 'language', l: '原作语言', g: 'prod' },
  { k: 'screenwriter', l: '编剧', g: 'prod' },
  { k: 'cast', l: '主演', g: 'prod' },
  { k: 'cv', l: '声优 / 配音', g: 'prod' },
  { k: 'host', l: '主持人', g: 'prod' },
  { k: 'composer', l: '作曲', g: 'prod' },
  { k: 'lyricist', l: '作词', g: 'prod' },
  { k: 'arranger', l: '编曲', g: 'prod' },
  { k: 'producer', l: '制片人', g: 'prod' },
  { k: 'artDirector', l: '美术监督', g: 'prod' },
  { k: 'animationDirector', l: '作画监督', g: 'prod' },
  { k: 'musicProd', l: '音乐制作', g: 'prod' },
  { k: 'studio', l: '制作公司', g: 'prod' },
  { k: 'organizer', l: '主办方', g: 'prod' },
  { k: 'planner', l: '企划', g: 'prod' },
  { k: 'production', l: '制作', g: 'prod' },
  { k: 'presenter', l: '出品人', g: 'prod' },
  { k: 'dubbing', l: '配音', g: 'prod' },
  { k: 'postProd', l: '后期', g: 'prod' },
  { k: 'themeSong', l: '主题曲', g: 'prod' },
  { k: 'themeArtist', l: '主题曲演唱', g: 'prod' },
  { k: 'script', l: '剧本', g: 'prod' },
  { k: 'storyboard', l: '分镜', g: 'prod' },
  { k: 'photoDirector', l: '摄影', g: 'prod' },
  { k: 'editing', l: '剪辑', g: 'prod' },
  { k: 'charDesign', l: '角色设计', g: 'prod' },
  { k: 'mechaDesign', l: '机械设计', g: 'prod' },
  { k: 'backgroundArt', l: '美术背景', g: 'prod' },
  { k: 'soundDirector', l: '音响监督', g: 'prod' },
  { k: 'voiceDirector', l: '配音导演', g: 'prod' },
  { k: 'soundEffect', l: '音效', g: 'prod' },
  { k: 'colorDesign', l: '色彩设计', g: 'prod' },
  { k: 'keyAnimation', l: '原画', g: 'prod' },
  { k: 'productionManager', l: '制作进行', g: 'prod' },

  /* 我的 */
  { k: 'format', l: '阅读格式', g: 'mine', t: 'select', o: ['纸质', '电子书', '有声书', '混合'] },
  { k: 'readingDevice', l: '阅读设备', g: 'mine' },
  { k: 'source', l: '来源', g: 'mine', t: 'select', o: ['购买', '借阅', '赠书', '图书馆', '电子书', '朋友推荐', '社交平台', '其他'] },
  { k: 'purchaseChannel', l: '购入渠道', g: 'mine' },
  { k: 'buyPrice', l: '购入价', g: 'mine', t: 'num' },
  { k: 'buyDate', l: '购入日期', g: 'mine', t: 'date' },
  { k: 'cinema', l: '影院', g: 'mine' },
  { k: 'watchPlace', l: '观看方式', g: 'mine', t: 'select', o: ['影院', '流媒体', '电视', '碟片', '下载', '其他'] },
  { k: 'watchPlatform', l: '观看平台', g: 'mine' },
  { k: 'subtitle', l: '字幕版本', g: 'mine' },
  { k: 'languageVersion', l: '语言版本', g: 'mine' },
  { k: 'playTime', l: '游玩时长（小时）', g: 'mine', t: 'num' },
  { k: 'firstPlatform', l: '首次平台', g: 'mine' },
  { k: 'completion', l: '完成度', g: 'mine', t: 'num' },
  { k: 'achievementsTotal', l: '成就总数', g: 'mine', t: 'num' },
  { k: 'controller', l: '使用设备', g: 'mine' },
  { k: 'cloudSave', l: '云存档', g: 'mine', t: 'select', o: ['有', '无'] },
  { k: 'lastPlayed', l: '最近游玩', g: 'mine', t: 'date' },
  { k: 'listenPlace', l: '收听平台', g: 'mine' },
  { k: 'platform', l: '播出平台', g: 'work' },
  { k: 'players', l: '玩家人数', g: 'work', ph: '2–4 人' },
  { k: 'setlist', l: '曲目单', g: 'work', t: 'long' },
  { k: 'link', l: '相关链接', g: 'mine', ph: 'https://' },
  { k: 'magName', l: '刊名', g: 'work' },
  { k: 'volumeNo', l: '卷号', g: 'work' },
  { k: 'issueNo', l: '期号', g: 'work' },
  { k: 'totalNo', l: '总期号', g: 'work', t: 'num' },
  { k: 'issueDate', l: '出版日期', g: 'work', t: 'date' },
  { k: 'editionType', l: '载体形态', g: 'work', t: 'select', o: ['纸质', '电子', '纸质 + 电子'] },
  { k: 'toc', l: '目录', g: 'work', t: 'long' },
  { k: 'subPrice', l: '订阅价格', g: 'mine', t: 'num' },
  { k: 'subscribeFrom', l: '订阅起始', g: 'mine', t: 'date' },
  { k: 'subscribeEnd', l: '订阅结束', g: 'mine', t: 'date' }
];

export const FIELDS = {};
FIELD_LIST.forEach((f) => { FIELDS[f.k] = f; });

export const FIELD_GROUPS = { work: '作品', prod: '制作', mine: '我的' };

/* ---------------- 作品类型 ----------------
   mode: book 章/卷 · series 季/集 · percent 完成度 · single 无进度 · issue 刊期
   ------------------------------------------------------------------ */

const TEXT_FIELDS = ['originalTitle', 'publisher', 'imprint', 'subtitle', 'series', 'seriesNo', 'editionNo',
  'printNo', 'pubPlace', 'pages', 'words', 'binding', 'bookSize', 'isbn', 'price', 'paper', 'illustrated',
  'firstEdition', 'sheets', 'outOfPrint', 'translator', 'editor', 'language', 'serialStatus', 'format',
  'readingDevice', 'source', 'purchaseChannel', 'buyPrice', 'buyDate', 'link'];

const COMIC_FIELDS = ['originalTitle', 'publisher', 'imprint', 'series', 'volumes', 'chapters', 'serialStatus',
  'updateCycle', 'webPlatform', 'binding', 'bookSize', 'isbn', 'price', 'firstEdition', 'translator',
  'artDirector', 'charDesign', 'colorDesign', 'source', 'purchaseChannel', 'buyPrice', 'buyDate', 'format', 'link'];

const FILM_FIELDS = ['originalTitle', 'runtime', 'releaseDate', 'releaseRegion', 'screeningFormat', 'ageRating',
  'productionCompany', 'distributor', 'boxoffice', 'budget', 'premiere', 'aspect', 'color', 'screenwriter',
  'cast', 'composer', 'cinema', 'watchPlace', 'watchPlatform', 'subtitle', 'languageVersion', 'source', 'link'];

const SERIES_FIELDS = ['originalTitle', 'seasons', 'epCount', 'epRuntime', 'channel', 'airWeekday', 'airStart',
  'airEnd', 'airPeriod', 'productionCompany', 'screenwriter', 'cast', 'composer', 'themeSong', 'watchPlatform',
  'subtitle', 'languageVersion', 'source', 'link'];

const ANIME_FIELDS = ['originalTitle', 'seasons', 'epCount', 'epRuntime', 'airStart', 'airEnd', 'airWeekday',
  'studio', 'originalWork', 'basedOn', 'screenwriter', 'charDesign', 'artDirector', 'musicProd', 'cv',
  'themeSong', 'watchPlatform', 'subtitle', 'languageVersion', 'source', 'link'];

const STAGE_FIELDS = ['originalTitle', 'venue', 'location', 'tour', 'shows', 'seat', 'ticketPrice', 'releaseDate',
  'screenwriter', 'cast', 'composer', 'stageManager', 'lighting', 'costume', 'posterDesign', 'organizer', 'link'];

const AUDIO_FIELDS = ['originalTitle', 'albumType', 'musicGenre', 'tracks', 'trackList', 'discs', 'label', 'releaseDate',
  'recordPlace', 'recordingStudio', 'mastering', 'composer', 'lyricist', 'arranger', 'albumLanguage', 'signed',
  'listenPlace', 'subPrice', 'source', 'link'];

const GAME_FIELDS = ['originalTitle', 'releaseDate', 'gameType', 'platforms', 'engine', 'languages',
  'chineseSupport', 'dlcCount', 'onlinePlayers', 'difficulty', 'completionistHours', 'modSupport', 'vrSupport',
  'studio', 'publisher', 'composer', 'playTime', 'firstPlatform', 'achievementsTotal', 'controller', 'cloudSave',
  'lastPlayed', 'collectibles', 'characters', 'saveNote', 'gameShots', 'buyPrice', 'buyDate', 'purchaseChannel',
  'source', 'link'];

const MAG_FIELDS = ['magName', 'originalTitle', 'publisher', 'editorInChief', 'issn', 'volumeNo', 'issueNo',
  'totalNo', 'editionNo', 'issueDate', 'editionType', 'toc', 'pages', 'price', 'binding', 'bookSize',
  'serialStatus', 'updateCycle', 'updateWeekday', 'subscribeFrom', 'subscribeEnd', 'subPrice', 'source', 'purchaseChannel',
  'buyDate', 'link'];

function T(id, label, group, extra) {
  return Object.assign({
    id, label, group,
    color: GROUPS[group].color,
    icon: GROUPS[group].icon,
    statusSet: group === 'film' ? 'movie' : 'read',
    mode: 'single',
    itemUnit: '', volumeUnit: '', segUnit: '',
    fields: ['originalTitle', 'source', 'link']
  }, extra);
}

export const TYPES = [
  /* 文字阅读 */
  T('book', '书籍', 'text', { statusSet: 'read', mode: 'book', itemUnit: '章', volumeUnit: '部', creator: '作者', fields: TEXT_FIELDS }),
  T('novel', '小说', 'text', { statusSet: 'read', mode: 'book', itemUnit: '章', volumeUnit: '部', creator: '作者', fields: TEXT_FIELDS }),
  T('magazine', '期刊', 'text', { statusSet: 'read', mode: 'issue', itemUnit: '期', creator: '主办单位', fields: MAG_FIELDS }),
  T('newspaper', '报纸', 'text', { statusSet: 'read', mode: 'issue', itemUnit: '期', creator: '主办单位', fields: ['publisher', 'issn', 'issueNo', 'pages', 'price', 'source', 'link'] }),
  T('article', '文章', 'text', { statusSet: 'read', mode: 'single', creator: '作者', fields: ['publisher', 'format', 'pages', 'readingDevice', 'source', 'link'] }),
  T('paper', '论文', 'text', { statusSet: 'read', mode: 'single', creator: '作者', fields: ['publisher', 'isbn', 'pages', 'format', 'readingDevice', 'source', 'link'] }),
  T('textbook', '教材', 'text', { statusSet: 'read', mode: 'book', itemUnit: '章', volumeUnit: '册', creator: '编者', fields: ['publisher', 'editionNo', 'printNo', 'pages', 'isbn', 'price', 'binding', 'bookSize', 'format', 'source', 'link'] }),
  T('weblit', '网络文学', 'text', { statusSet: 'read', mode: 'book', itemUnit: '章', volumeUnit: '卷', creator: '作者', fields: ['webPlatform', 'chapters', 'words', 'serialStatus', 'updateCycle', 'updateWeekday', 'format', 'source', 'link'] }),

  /* 影视 */
  T('movie', '电影', 'film', { statusSet: 'movie', mode: 'single', creator: '导演', fields: FILM_FIELDS }),
  T('tv', '电视剧', 'film', { statusSet: 'series', mode: 'series', itemUnit: '集', segUnit: '季', creator: '导演', fields: SERIES_FIELDS }),
  T('webtv', '网络剧', 'film', { statusSet: 'series', mode: 'series', itemUnit: '集', segUnit: '季', creator: '导演', fields: SERIES_FIELDS }),
  T('docu', '纪录片', 'film', { statusSet: 'series', mode: 'series', itemUnit: '集', segUnit: '季', creator: '导演', fields: SERIES_FIELDS }),
  T('short', '短片', 'film', { statusSet: 'movie', mode: 'single', creator: '导演', fields: FILM_FIELDS }),
  T('animovie', '动画电影', 'film', { statusSet: 'movie', mode: 'single', creator: '导演', fields: FILM_FIELDS }),
  T('variety', '综艺', 'film', { statusSet: 'series', mode: 'series', itemUnit: '期', segUnit: '季', creator: '主持人', fields: SERIES_FIELDS.concat(['host']) }),

  /* 动漫漫画 */
  T('anime', '动画', 'comic', { statusSet: 'series', mode: 'series', itemUnit: '话', segUnit: '季', creator: '监督', fields: ANIME_FIELDS }),
  T('animeseries', '动漫系列', 'comic', { statusSet: 'series', mode: 'series', itemUnit: '话', segUnit: '季', creator: '监督', fields: ANIME_FIELDS }),
  T('comic', '漫画', 'comic', { statusSet: 'read', mode: 'book', itemUnit: '话', volumeUnit: '卷', creator: '作者 / 绘者', fields: COMIC_FIELDS }),
  T('webcomic', '网络漫画', 'comic', { statusSet: 'read', mode: 'book', itemUnit: '话', volumeUnit: '卷', creator: '作者', fields: ['webPlatform', 'chapters', 'serialStatus', 'updateCycle', 'updateWeekday', 'format', 'source', 'link'] }),
  T('lightnovel', '轻小说', 'comic', { statusSet: 'read', mode: 'book', itemUnit: '章', volumeUnit: '卷', creator: '作者', fields: TEXT_FIELDS.concat(['illustrated']) }),
  T('artbook', '画集', 'comic', { statusSet: 'read', mode: 'single', creator: '绘者', fields: ['publisher', 'pages', 'binding', 'bookSize', 'isbn', 'price', 'firstEdition', 'limited', 'source', 'purchaseChannel', 'buyPrice', 'buyDate', 'link'] }),

  /* 表演艺术 */
  T('stage', '舞台剧', 'stage', { statusSet: 'stage', mode: 'single', creator: '剧团 / 导演', fields: STAGE_FIELDS }),
  T('play', '话剧', 'stage', { statusSet: 'stage', mode: 'single', creator: '剧团 / 导演', fields: STAGE_FIELDS }),
  T('opera', '歌剧', 'stage', { statusSet: 'stage', mode: 'single', creator: '剧院 / 指挥', fields: STAGE_FIELDS }),
  T('musical', '音乐剧', 'stage', { statusSet: 'stage', mode: 'single', creator: '剧团 / 导演', fields: STAGE_FIELDS }),
  T('dance', '舞蹈演出', 'stage', { statusSet: 'stage', mode: 'single', creator: '舞团 / 编舞', fields: STAGE_FIELDS }),
  T('concert', '演唱会', 'stage', { statusSet: 'stage', mode: 'single', creator: '艺人', fields: ['venue', 'location', 'tour', 'shows', 'seat', 'ticketPrice', 'releaseDate', 'organizer', 'setlist', 'link'] }),
  T('festival', '音乐节', 'stage', { statusSet: 'stage', mode: 'single', creator: '主办方', fields: ['venue', 'location', 'shows', 'seat', 'ticketPrice', 'releaseDate', 'organizer', 'cast', 'link'] }),

  /* 音频 */
  T('audiodrama', '广播剧', 'audio', { statusSet: 'series', mode: 'series', itemUnit: '集', segUnit: '季', creator: '出品方', fields: ['originalWork', 'epCount', 'epRuntime', 'platform', 'cv', 'soundDirector', 'soundEffect', 'musicProd', 'themeSong', 'listenPlace', 'subPrice', 'source', 'link'] }),
  T('podcast', '播客', 'audio', { statusSet: 'series', mode: 'series', itemUnit: '期', segUnit: '季', creator: '主播', fields: ['host', 'epCount', 'epRuntime', 'updateCycle', 'updateWeekday', 'listenPlace', 'subPrice', 'source', 'link'] }),
  T('audiobook', '有声书', 'audio', { statusSet: 'read', mode: 'book', itemUnit: '章', volumeUnit: '部', creator: '作者', fields: ['publisher', 'runtime', 'cv', 'listenPlace', 'subPrice', 'source', 'link'] }),
  T('album', '音乐专辑', 'audio', { statusSet: 'music', mode: 'single', creator: '歌手', fields: AUDIO_FIELDS }),
  T('single', '单曲', 'audio', { statusSet: 'music', mode: 'single', creator: '歌手', fields: ['releaseDate', 'label', 'composer', 'lyricist', 'arranger', 'runtime', 'albumLanguage', 'listenPlace', 'source', 'link'] }),

  /* 游戏 */
  T('game', '电子游戏', 'game', { statusSet: 'game', mode: 'percent', creator: '开发商', fields: GAME_FIELDS }),
  T('mobilegame', '手机游戏', 'game', { statusSet: 'game', mode: 'percent', creator: '开发商', fields: GAME_FIELDS }),
  T('consolegame', '主机游戏', 'game', { statusSet: 'game', mode: 'percent', creator: '开发商', fields: GAME_FIELDS }),
  T('indiegame', '独立游戏', 'game', { statusSet: 'game', mode: 'percent', creator: '开发商', fields: GAME_FIELDS }),
  T('boardgame', '桌游', 'game', { statusSet: 'game', mode: 'single', creator: '设计师', fields: ['publisher', 'releaseDate', 'players', 'ageRating', 'runtime', 'gameType', 'buyPrice', 'buyDate', 'source', 'link'] }),
  T('cardgame', '卡牌游戏', 'game', { statusSet: 'game', mode: 'single', creator: '设计师', fields: ['publisher', 'releaseDate', 'players', 'ageRating', 'runtime', 'gameType', 'buyPrice', 'buyDate', 'source', 'link'] }),
  T('interactive', '互动叙事', 'game', { statusSet: 'game', mode: 'percent', creator: '开发商', fields: GAME_FIELDS })
];

export const TYPE_MAP = {};
TYPES.forEach((t) => { TYPE_MAP[t.id] = t; });

/* 每种册子的实物配色：书是皮革棕、期刊是杂志黄、游戏是主机蓝……
   避免所有类型共用一组红/蓝，书架上要一眼分得清。 */
export const TYPE_COLORS = {
  book: '#8A5A3B', novel: '#7D3C48', magazine: '#C9A227', newspaper: '#5C5C5C',
  article: '#4E7A6B', paper: '#3F6B8A', textbook: '#6B7A3F', weblit: '#9A5B7A',
  movie: '#2F4858', tv: '#4A3F8C', webtv: '#3D5A80', docu: '#2E6B5E',
  short: '#6A4C93', animovie: '#B56576', variety: '#C06C3B',
  anime: '#C2557A', animeseries: '#A84E86', comic: '#B5651D', webcomic: '#C77D3A',
  lightnovel: '#7A5C9E', artbook: '#4E8A8A',
  stage: '#7B2D3A', play: '#8C3B4A', opera: '#6B2E5A', musical: '#9C3B5A',
  dance: '#A8557A', concert: '#8E4A9E', festival: '#C0563B',
  audiodrama: '#3A6B8A', podcast: '#3C7A8C', audiobook: '#4E7A5E',
  album: '#B3652A', single: '#A8743B',
  game: '#2E5C8A', mobilegame: '#3A7A9E', consolegame: '#1F4E79',
  indiegame: '#5E7A3A', boardgame: '#6B7B3A', cardgame: '#7A5C3A', interactive: '#4A6B8A'
};
TYPES.forEach((t) => { if (TYPE_COLORS[t.id]) t.color = TYPE_COLORS[t.id]; });


export function typeDef(id) {
  return TYPE_MAP[id] || TYPE_MAP.book;
}


/* ---------------- 其它枚举 ---------------- */

export const COLLECTION_LISTS = [
  { value: 'wish', label: '想体验' },
  { value: 'buy', label: '想购买' },
  { value: 'own', label: '已拥有' }
];

export const RESOURCE_FORMATS = ['PDF', 'EPUB', 'MOBI', 'AZW3', 'TXT', 'DOCX', 'MP4', 'MKV', 'MP3', 'FLAC', '图片', '压缩包', '安装程序', '其他'];

export const RESOURCE_STATUS = ['计划获取', '正在下载', '已下载', '已购买', '已保存', '在线收藏', '待整理', '待检查', '已归档', '已丢失', '已删除'];

export const RESOURCE_FORMS = ['本地文件', '在线资源', '实体对应', '纸质版', '其他'];

export const EXCERPT_TYPES = ['名句', '经典台词', '优美段落', '人物对白', '歌词片段', '观点论述', '游戏文本', '个人灵感'];

export const REVIEW_TYPES = ['读后感', '观后感', '听后感', '游戏体验', '作品分析', '人物分析', '剧情梳理', '系列总结', '专题研究', '年度总结'];

export const ACCOUNT_CATEGORIES = [
  '视频', '音乐', '阅读', '漫画', '动画', '游戏', '社交', '论坛', '直播',
  '购物', '云存储', '邮箱', '办公协作', '学习', '新闻', '金融', '支付',
  '出行', '外卖', '酒店旅行', '健康医疗', '运动健身', '生活服务', '设计创意',
  '开发工具', 'AI 服务', '订阅服务', '其他'
];

export const RELATION_TYPES = ['系列', '前传', '续作', '外传', '衍生', '改编', '重制', '同世界观', '同作者', '相关'];

export const RATING_SCALES = [
  { value: '10', label: '10 分制', max: 10, step: 0.5 },
  { value: '5', label: '5 星制', max: 5, step: 0.5 },
  { value: '100', label: '100 分制', max: 100, step: 1 }
];



/* ==========================================================
   第二阶段起新增的枚举（说明书第六至十二章）
   ========================================================== */

export const CREATOR_ROLES = ['作者', '绘者', '导演', '编剧', '演员', '声优', '歌手', '作曲', '作词',
  '编曲', '制作人', '监督', '作画监督', '美术监督', '摄影', '剪辑', '主持', '主播', '设计师', '译者', '其他'];

export const EXPENSE_CATEGORIES = ['实体书', '电子书', '电影票', '演出票', '游戏', 'DLC', '专辑', '周边',
  '会员订阅', '展览', '课程', '其他'];

export const SUB_CYCLES = [
  { value: 'month', label: '按月' },
  { value: 'quarter', label: '按季' },
  { value: 'year', label: '按年' }
];

export const LOAN_DIRECTIONS = [
  { value: 'out', label: '借出' },
  { value: 'in', label: '借入' }
];

export const GOAL_KINDS = [
  { value: 'count', label: '数量（部）' },
  { value: 'hours', label: '时长（小时）' },
  { value: 'pages', label: '页数' },
  { value: 'amount', label: '金额（元）' }
];

export const REMIND_REPEATS = [
  { value: 'none', label: '不重复' },
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'monthly', label: '每月' },
  { value: 'yearly', label: '每年' }
];

export const ITEM_CONDITIONS = ['全新', '良好', '一般', '有损', '签名版', '限量版'];

export const ITEM_TYPES = ['纸质书', '期刊', '漫画单行本', 'CD', '黑胶', '蓝光 / DVD', '游戏卡带 / 光盘',
  '手办', '周边', '卡牌', '模型', '海报', '演出纪念品', '其他'];

export const ITEM_STATUSES = ['在藏', '借出', '寄存', '已出', '遗失'];


/* 自动化规则（9.6）：触发器、条件、动作 */
export const RULE_TRIGGERS = [
  { value: 'work_saved', label: '作品保存后' },
  { value: 'status_done', label: '状态变为已完成' },
  { value: 'rating_high', label: '评分不低于' },
  { value: 'excerpt_added', label: '新增摘抄后' }
];

export const RULE_ACTIONS = [
  { value: 'add_tag', label: '添加标签' },
  { value: 'add_to_topic', label: '加入专题' },
  { value: 'set_status', label: '设置状态' },
  { value: 'remind', label: '创建提醒' },
  { value: 'log', label: '记一条备注' }
];

/* 专业中心的通用分组：哪些类型归到哪个中心 */
export const HUB_GROUPS = {
  reading: { label: '阅读', types: ['book', 'novel', 'weblit', 'lightnovel', 'article', 'paper', 'textbook', 'magazine', 'newspaper', 'audiobook'], icon: 'book' },
  screen: { label: '影视', types: ['movie', 'tv', 'webtv', 'docu', 'short', 'animovie', 'variety'], icon: 'film' },
  game: { label: '游戏', types: ['game', 'mobilegame', 'consolegame', 'indiegame', 'boardgame', 'cardgame', 'interactive'], icon: 'game' },
  music: { label: '音乐', types: ['album', 'single'], icon: 'music' },
  comic: { label: '动漫', types: ['anime', 'animeseries', 'comic', 'webcomic', 'artbook'], icon: 'comic' }
};


/* 说明书中明确要求的补充枚举 */
export const LOAN_STATUSES = ['借出中', '借入中', '已归还', '已逾期', '已遗失', '已损坏'];

export const PAY_METHODS = ['微信', '支付宝', '银行卡', '现金', '礼品卡', '其他'];

export const PRESET_CATEGORIES = [
  '科幻', '悬疑', '推理', '奇幻', '历史', '爱情', '喜剧', '恐怖', '现实主义'
];

export const REVIEW_SECTIONS = [
  { key: 'overall', label: '总体评价' },
  { key: 'pros', label: '优点' },
  { key: 'cons', label: '缺点' },
  { key: 'plot', label: '剧情分析' },
  { key: 'cast', label: '人物分析' },
  { key: 'world', label: '世界观分析' },
  { key: 'art', label: '艺术表现' },
  { key: 'why', label: '推荐 / 不推荐理由' },
  { key: 'rewatch', label: '重读重看价值' }
];


/* ==========================================================
   第六至九章补充枚举
   ========================================================== */

export const ACHIEVEMENT_RARITIES = [
  { value: 'common', label: '普通' },
  { value: 'rare', label: '稀有' },
  { value: 'epic', label: '史诗' },
  { value: 'legend', label: '传说' }
];

export const PLAYTHROUGH_MODES = [
  { value: 'main', label: '主线通关' },
  { value: 'collect', label: '全收集' },
  { value: 'platinum', label: '全成就' },
  { value: 'speedrun', label: '速通' },
  { value: 'challenge', label: '挑战' },
  { value: 'replay', label: '重玩' }
];

/* 9.5：内容来源必须可辨别 */
export const CONTENT_SOURCES = [
  { value: 'manual', label: '手动记录' },
  { value: 'ai-edited', label: 'AI 生成 · 已改' },
  { value: 'ai', label: 'AI 生成' },
  { value: 'import', label: '外部导入' }
];

