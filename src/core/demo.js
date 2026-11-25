/* ==========================================================
   次元簿 · 示例数据（仅用于演示，可整批清除）
   每一条写入都带 demo: true 标记；清除时按标记与 workId 反查，
   连作品专属字段、状态日志、附件一起删掉，不留孤儿数据。
   通过 ?demo=1 载入、?demo=0 清除，不提供常驻入口。
   ========================================================== */

import * as db from './db.js';
import { STORES } from './db.js';
import {
  data, uid, saveWork, saveExperience, saveCategory, saveTag, tagByName, linkCreator,
  loadAll, collections, resources, reviews, excerpts, creators, expenses, subscriptions,
  loans, goals, reminders, physical, series, topics, links, rules, achievements,
  playthroughs, tracks, playlists, episodes, sessions, locations, savedFilters,
  saveNote, putAttachment, imageUrls, seedPresetCategories
} from './repo.js';
import { typeDef, PRESET_CATEGORIES } from './schema.js';

const DEMO = { demo: true };

function iso(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() + (offsetDays || 0));
  return d.toISOString().slice(0, 10);
}

async function ensureCategory(name) {
  const hit = data.categories.find((c) => c.name === name);
  if (hit) return hit.id;
  const res = await saveCategory(Object.assign({ name, parentId: '', order: 0 }, DEMO));
  return res.ok ? res.row.id : '';
}

async function ensureTag(name) {
  const hit = tagByName(name);
  if (hit) return hit.id;
  const res = await saveTag(Object.assign({ name, usageCount: 0 }, DEMO));
  return res.ok ? res.row.id : '';
}

/* 用 Canvas 画一张简单的封面，避免示例全是占位色块 */
async function makeArt(title, color, sub) {
  const w = 320;
  const h = 448;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, color);
  g.addColorStop(0.62, color);
  g.addColorStop(1, '#1B1533');
  x.fillStyle = g;
  x.fillRect(0, 0, w, h);

  x.globalAlpha = 0.16;
  x.fillStyle = '#FFFFFF';
  x.beginPath();
  x.arc(w - 46, 74, 62, 0, Math.PI * 2);
  x.fill();
  x.globalAlpha = 1;

  x.fillStyle = 'rgba(255,255,255,.94)';
  x.font = '600 30px "Songti SC", "SimSun", serif';
  x.textAlign = 'center';
  const chars = String(title).slice(0, 8).split('');
  const step = Math.min(40, 220 / Math.max(1, chars.length));
  chars.forEach((ch, i) => {
    x.fillText(ch, w / 2, 120 + i * step);
  });


  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.86));
  const id = uid('demoart');
  const row = await putAttachment(id, blob, Object.assign({
    fileName: 'demo-cover.jpg',
    mimeType: 'image/jpeg',
    size: blob.size,
    ownerType: 'cover'
  }, DEMO));
  if (!row) return '';
  imageUrls.set(id, URL.createObjectURL(blob));
  return id;
}

async function makeShot(label) {
  const c = document.createElement('canvas');
  c.width = 640;
  c.height = 400;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 640, 400);
  g.addColorStop(0, '#2B2250');
  g.addColorStop(1, '#7658D6');
  x.fillStyle = g;
  x.fillRect(0, 0, 640, 400);
  x.strokeStyle = 'rgba(255,255,255,.22)';
  x.lineWidth = 2;
  for (let i = 1; i < 6; i++) {
    x.beginPath();
    x.moveTo(0, i * 66);
    x.lineTo(640, i * 66);
    x.stroke();
  }
  x.fillStyle = 'rgba(255,255,255,.9)';
  x.font = '600 28px "Songti SC", serif';
  x.textAlign = 'center';
  x.fillText(label, 320, 210);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.86));
  const id = uid('demoshot');
  const row = await putAttachment(id, blob, Object.assign({
    fileName: 'demo-shot.jpg', mimeType: 'image/jpeg', size: blob.size, ownerType: 'review-image'
  }, DEMO));
  if (!row) return '';
  imageUrls.set(id, URL.createObjectURL(blob));
  return id;
}

async function makeFile(name, text) {
  const blob = new Blob([text], { type: 'text/plain' });
  const id = uid('demofile');
  const row = await putAttachment(id, blob, Object.assign({
    fileName: name, mimeType: 'text/plain', size: blob.size, ownerType: 'file'
  }, DEMO));
  return row ? { id, size: blob.size } : null;
}

/* ---------------- 生成 ---------------- */

export async function seedDemo() {
  if (data.works.some((w) => w.demo)) return { ok: true, skipped: true };

  /* 先铺好应用自带的题材分类，示例只复用，不额外制造“默认数据” */
  await seedPresetCategories(PRESET_CATEGORIES);

  const catSci = await ensureCategory('科幻');
  const catLit = await ensureCategory('现实主义');
  const tSci = await ensureTag('科幻');
  const tGod = await ensureTag('神作');
  const t2026 = await ensureTag('2026 年度');
  const tRewatch = await ensureTag('值得重看');

  const works = {};
  const put = async (key, type, row, fields) => {
    const color = typeDef(type).color;
    const cover = await makeArt(row.title, color, typeDef(type).label);
    const res = await saveWork(Object.assign({
      id: '', type, creator: '', year: '', rating: 0, status: 'wish',
      summary: '', note: '', tagIds: [], cover, thumb: cover, demo: true
    }, row), fields || {});
    if (res.ok) works[key] = res.work.id;
    return res.ok ? res.work.id : '';
  };

  /* 书籍 / 小说 */
  await put('santi', 'novel', {
    title: '三体', creator: '刘慈欣', year: '2008', rating: 9.5, status: 'done',
    categoryId: catSci, tagIds: [tSci, tGod, t2026],
    summary: '地球文明向宇宙发出的第一声啼鸣，也是把自己暴露在黑暗森林里的那一刻。'
  }, {
    publisher: '重庆出版社', pages: '302', words: '23', isbn: '9787536692930',
    price: '23', binding: '平装', format: '纸质', source: '购买', series: '三体', seriesNo: '1'
  });
  await put('heian', 'novel', {
    title: '黑暗森林', creator: '刘慈欣', year: '2008', rating: 9.5, status: 'done',
    categoryId: catSci, tagIds: [tSci, tGod],
    summary: '面壁计划与黑暗森林法则，把宇宙社会学推到了冷酷的尽头。'
  }, {
    publisher: '重庆出版社', pages: '470', words: '36', isbn: '9787536693968',
    price: '32', binding: '平装', format: '纸质', source: '购买', series: '三体', seriesNo: '2'
  });
  await put('santi2', 'novel', {
    title: '三体（十周年纪念版）', creator: '刘慈欣', year: '2008', rating: 0, status: 'wish',
    categoryId: catSci, tagIds: [tSci],
    summary: '同一部作品的纪念版本，用来演示「同一作品的不同版本」。'
  }, {
    publisher: '重庆出版社', pages: '312', isbn: '9787229000000', binding: '精装',
    format: '纸质', source: '赠书', series: '三体', seriesNo: '1'
  });
  await put('bainian', 'novel', {
    title: '百年孤独', creator: '加西亚·马尔克斯', year: '2011', rating: 9, status: 'done',
    categoryId: catLit, tagIds: [tGod, tRewatch],
    summary: '马孔多的百年，是家族史也是拉美的记忆。'
  }, {
    publisher: '南海出版公司', pages: '360', words: '27', isbn: '9787544253994',
    price: '39.5', translator: '范晔', binding: '精装', format: '纸质', source: '购买'
  });
  await put('shaqiu', 'novel', {
    title: '沙丘', creator: '弗兰克·赫伯特', year: '2017', rating: 8.5, status: 'doing',
    categoryId: catSci, tagIds: [tSci],
    summary: '生态、宗教与权力的三重寓言，读起来像一份未来史。'
  }, {
    publisher: '江苏凤凰文艺出版社', pages: '620', words: '48', isbn: '9787539998718',
    price: '68', translator: '潘振华', binding: '平装', format: '纸质', source: '朋友推荐'
  });

  /* 影视 */
  await put('huayang', 'movie', {
    title: '花样年华', creator: '王家卫', year: '2000', rating: 9, status: 'done',
    tagIds: [tGod, tRewatch],
    summary: '两个人的克制，比任何告白都长。'
  }, {
    runtime: '98', releaseDate: '2000-09-29', cast: '梁朝伟 / 张曼玉',
    screenwriter: '王家卫', cinema: '百老汇电影中心', watchPlace: '影院',
    subtitle: '中文字幕', releaseRegion: '中国香港'
  });
  await put('xingji', 'movie', {
    title: '星际穿越', creator: '克里斯托弗·诺兰', year: '2014', rating: 8.5, status: 'done',
    tagIds: [tRewatch],
    summary: '把相对论拍成了父亲回家的路。'
  }, {
    runtime: '169', releaseDate: '2014-11-07', cast: '马修·麦康纳 / 安妮·海瑟薇',
    screenwriter: '乔纳森·诺兰', watchPlace: '流媒体', watchPlatform: '腾讯视频'
  });
  await put('manchang', 'tv', {
    title: '漫长的季节', creator: '辛爽', year: '2023', rating: 9, status: 'done',
    tagIds: [t2026],
    summary: '一桩旧案，三个老男人，和一整个时代的余震。'
  }, {
    seasons: '1', epCount: '12', epRuntime: '45', channel: '腾讯视频',
    watchPlatform: '腾讯视频', cast: '范伟 / 秦昊 / 陈明昊', screenwriter: '于小千'
  });
  await put('yuzhou', 'movie', {
    title: '宇宙探索编辑部', creator: '孔大山', year: '2023', rating: 0, status: 'wish',
    summary: '一个民科编辑部的荒诞公路片，待看。'
  }, {
    runtime: '118', releaseDate: '2023-04-01', cast: '杨皓宇 / 艾丽娅', watchPlace: '影院'
  });

  /* 动漫 */
  await put('jijin', 'anime', {
    title: '进击的巨人', creator: '谏山创', year: '2013', rating: 9, status: 'doing',
    tagIds: [tSci],
    summary: '墙内墙外的自由，代价一直很清楚。'
  }, {
    seasons: '1', epCount: '25', epRuntime: '24', studio: 'WIT STUDIO',
    originalWork: '谏山创', airStart: '2013-04-07', airWeekday: '周日',
    updateCycle: '周更', serialStatus: '连载中', watchPlatform: '哔哩哔哩',
    link: 'https://www.bilibili.com/bangumi/media/md28228372'
  });
  await put('heijing', 'tv', {
    title: '黑镜', creator: '查理·布鲁克', year: '2011', rating: 8.5, status: 'doing',
    tagIds: [tSci],
    summary: '每一集都是一则关于技术的现代寓言。',
    note: '看到第六季，越来越像纪录片。'
  }, {
    seasons: '6', epCount: '12', epRuntime: '60', channel: 'Netflix',
    airWeekday: '周三', updateCycle: '不定期', serialStatus: '连载中',
    releaseRegion: '英国', watchPlatform: 'Netflix',
    link: 'https://movie.douban.com/subject/7054120/'
  });
  await put('guojia', 'docu', {
    title: '国家宝藏', creator: '于蕾', year: '2017', rating: 9, status: 'doing',
    summary: '用舞台剧讲文物，把博物馆拍成了综艺。'
  }, {
    seasons: '4', epCount: '10', epRuntime: '90', channel: '央视综艺频道',
    airWeekday: '周四', updateCycle: '周更', serialStatus: '连载中',
    watchPlatform: '央视网', link: 'https://www.bilibili.com/video/BV1nx41147Jm'
  });

  /* 游戏 */
  await put('kongdong', 'game', {
    title: '空洞骑士', creator: 'Team Cherry', year: '2017', rating: 9.5, status: 'doing',
    tagIds: [tGod],
    summary: '手绘的昆虫王国，安静而残酷。'
  }, {
    platforms: 'PC / Switch', gameType: '类银河恶魔城', engine: 'Unity',
    playTime: '38', completion: '62', achievementsTotal: '12', chineseSupport: '官方中文',
    lastPlayed: iso(-2), difficulty: '普通'
  });
  await put('saierda', 'game', {
    title: '塞尔达传说 王国之泪', creator: '任天堂', year: '2023', rating: 9.5, status: 'done',
    tagIds: [tGod, t2026],
    summary: '把「自由」做成了可以拆开重装的零件。'
  }, {
    platforms: 'Switch', gameType: '开放世界', playTime: '120', completion: '100',
    achievementsTotal: '8', chineseSupport: '官方中文', lastPlayed: iso(-30)
  });

  /* 音乐 */
  await put('fantesi', 'album', {
    title: '范特西', creator: '周杰伦', year: '2001', rating: 9, status: 'done',
    tagIds: [t2026],
    summary: '一张把华语流行重新编曲的专辑。'
  }, {
    albumType: '录音室', musicGenre: '流行', label: '阿尔发音乐',
    releaseDate: '2001-09-14', tracks: '3', albumLanguage: '国语'
  });

  /* 期刊（同一刊名的三期，第 3 期故意缺） */
  for (const no of [1, 2, 4]) {
    await put('duzhe' + no, 'magazine', {
      title: '读者', creator: '读者杂志社', year: '2026', rating: 7, status: 'done'
    }, {
      magName: '读者', volumeNo: '2026', issueNo: String(no),
      issueDate: '2026-0' + no + '-05', publisher: '读者出版传媒',
      pages: '64', price: '8', editionType: '纸质',
      toc: '言论 / 人物 / 社会 / 小品文 / 漫画与幽默'
    });
  }
  /* 正在订阅中的下一期，用来演示「本周追更」里的期刊排期 */
  await put('duzhe12', 'magazine', {
    title: '读者 · 2026 年第 12 期', creator: '读者杂志社', year: '2026', rating: 0, status: 'doing'
  }, {
    magName: '读者', volumeNo: '2026', issueNo: '12',
    issueDate: '2026-11-05', publisher: '读者出版传媒',
    pages: '64', price: '8', editionType: '纸质', serialStatus: '连载中',
    updateCycle: '周更', updateWeekday: '周三', subscribeFrom: '2026-01-01', subscribeEnd: '2026-12-31'
  });

  /* 舞台 */
  await put('beican', 'musical', {
    title: '悲惨世界', creator: '上海文化广场', year: '2026', rating: 9.5, status: 'done',
    tagIds: [tGod],
    summary: '把冉阿让的一生压缩进三个小时的合唱。'
  }, {
    venue: '上海文化广场', location: '上海', shows: '1', seat: '池座 12 排 18 号',
    ticketPrice: '680', releaseDate: '2026-04-18', cast: '让·瓦尔让 / 沙威'
  });

  /* 人物 */
  const pLiu = (await creators.save(Object.assign({ name: '刘慈欣', country: '中国', roles: ['作者'], bio: '科幻作家，《三体》作者。' }, DEMO))).row;
  const pWang = (await creators.save(Object.assign({ name: '王家卫', country: '中国香港', roles: ['导演', '编剧'], bio: '以时间与克制著称的导演。' }, DEMO))).row;
  const pTeam = (await creators.save(Object.assign({ name: 'Team Cherry', country: '澳大利亚', roles: ['制作人'], bio: '《空洞骑士》的三人团队。' }, DEMO))).row;
  const pJay = (await creators.save(Object.assign({ name: '周杰伦', country: '中国台湾', roles: ['歌手', '作曲'], bio: '华语流行歌手。' }, DEMO))).row;
  if (works.santi && pLiu) await linkCreator(works.santi, pLiu.id, '作者');
  if (works.heian && pLiu) await linkCreator(works.heian, pLiu.id, '作者');
  if (works.huayang && pWang) await linkCreator(works.huayang, pWang.id, '导演');
  if (works.kongdong && pTeam) await linkCreator(works.kongdong, pTeam.id, '制作人');
  if (works.fantesi && pJay) await linkCreator(works.fantesi, pJay.id, '歌手');

  /* 系列与关联 */
  if (works.santi && works.heian) {
    await series.save(Object.assign({
      name: '三体', desc: '地球往事三部曲的前两部', workIds: [works.santi, works.heian],
      orderMode: 'publish', storyOrder: [works.santi, works.heian]
    }, DEMO));
    await links.save(Object.assign({
      source: 'work:' + works.santi, target: 'work:' + works.heian, relation: '续作'
    }, DEMO));
    await links.save(Object.assign({
      source: 'work:' + works.santi, target: 'work:' + works.heian, relation: '同一系列'
    }, DEMO));
  }

  /* 体验记录 */
  await saveExperience({
    id: '', workId: works.santi, status: 'done', startDate: '2026-01-05', endDate: '2026-02-10',
    progress: { chapterCur: 30, chapterTotal: 30 }, rating: 9.5, note: '第二遍读，注意力全在叶文洁的选择上。', demo: true
  });
  await saveExperience({
    id: '', workId: works.shaqiu, status: 'doing', startDate: '2026-11-01', endDate: '',
    progress: { chapterCur: 18, chapterTotal: 48 }, rating: 8.5, note: '每周读两章。', demo: true
  });
  await saveExperience({
    id: '', workId: works.huayang, status: 'done', startDate: '2026-03-11', endDate: '2026-03-11',
    progress: {}, rating: 9, note: '大银幕重看，旗袍与走廊的节奏。', demo: true
  });
  await saveExperience({
    id: '', workId: works.xingji, status: 'done', startDate: '2024-11-20', endDate: '2024-11-20',
    progress: {}, rating: 8.5, note: '首刷。', demo: true
  });
  await saveExperience({
    id: '', workId: works.xingji, status: 'done', startDate: '2026-06-01', endDate: '2026-06-01',
    progress: {}, rating: 9, note: '二刷，注意到很多第一次忽略的细节。', demo: true
  });
  await saveExperience({
    id: '', workId: works.manchang, status: 'done', startDate: '2026-02-01', endDate: '2026-02-03',
    progress: { seasonCur: 1, seasonTotal: 1, epCur: 12, epTotal: 12 }, rating: 9, note: '一口气看完。', demo: true
  });
  await saveExperience({
    id: '', workId: works.jijin, status: 'doing', startDate: '2026-10-12', endDate: '',
    progress: { seasonCur: 1, seasonTotal: 1, epCur: 10, epTotal: 25 }, rating: 9, note: '每周补两集。', demo: true
  });
  await saveExperience({
    id: '', workId: works.heijing, status: 'doing', startDate: '2026-09-05', endDate: '',
    progress: { seasonCur: 6, seasonTotal: 6, epCur: 4, epTotal: 12, hours: 22 }, rating: 8.5,
    note: '看到第六季，越来越像纪录片。', demo: true
  });
  await saveExperience({
    id: '', workId: works.guojia, status: 'doing', startDate: '2026-10-02', endDate: '',
    progress: { seasonCur: 4, seasonTotal: 4, epCur: 3, epTotal: 10, hours: 5 }, rating: 9, note: '', demo: true
  });
  await saveExperience({
    id: '', workId: works.duzhe12, status: 'doing', startDate: '2026-11-05', endDate: '',
    progress: { issueYear: '2026', issueNo: '12' }, rating: 0, note: '', demo: true
  });
  await saveExperience({
    id: '', workId: works.kongdong, status: 'doing', startDate: '2026-04-01', endDate: '',
    progress: { percent: 62, hours: 38 }, rating: 9.5, note: '卡在灵魂大师。', demo: true
  });
  await saveExperience({
    id: '', workId: works.saierda, status: 'done', startDate: '2026-05-01', endDate: '2026-08-20',
    progress: { percent: 100, hours: 120 }, rating: 9.5, note: '主线 + 大部分支线。', demo: true
  });
  await saveExperience({
    id: '', workId: works.fantesi, status: 'done', startDate: '2026-01-20', endDate: '2026-01-20',
    progress: {}, rating: 9, note: '整张循环。', demo: true
  });
  for (const no of [1, 2, 4]) {
    if (works['duzhe' + no]) {
      await saveExperience({
        id: '', workId: works['duzhe' + no], status: 'done',
        startDate: '2026-0' + no + '-06', endDate: '2026-0' + no + '-06',
        progress: { issueYear: '2026', issueNo: String(no) }, rating: 7, note: '', demo: true
      });
    }
  }
  await saveExperience({
    id: '', workId: works.beican, status: 'done', startDate: '2026-04-18', endDate: '2026-04-18',
    progress: {}, rating: 9.5, note: '谢幕时全场起立。', demo: true
  });

  /* 季与集 */
  if (works.manchang) {
    for (let i = 1; i <= 12; i++) {
      await episodes.save(Object.assign({
        workId: works.manchang, season: 1, no: i, watched: true,
        date: '2026-02-0' + (i <= 3 ? i : 3), rating: i === 12 ? 10 : 0, note: ''
      }, DEMO));
    }
  }
  if (works.jijin) {
    for (let i = 1; i <= 25; i++) {
      await episodes.save(Object.assign({
        workId: works.jijin, season: 1, no: i, watched: i <= 10,
        date: i <= 10 ? iso(-20 + i) : '', rating: 0, note: ''
      }, DEMO));
    }
  }

  /* 阅读 / 游玩会话 */
  if (works.santi) {
    const days = [['2026-01-05', 40], ['2026-01-12', 62], ['2026-02-10', 55]];
    for (const [d, pages] of days) {
      await sessions.save(Object.assign({ workId: works.santi, date: d, pages, minutes: pages * 2, note: '' }, DEMO));
    }
  }
  if (works.fantesi) {
    await sessions.save(Object.assign({ workId: works.fantesi, date: iso(-6), pages: 0, minutes: 45, note: '通勤' }, DEMO));
    await sessions.save(Object.assign({ workId: works.fantesi, date: iso(-4), pages: 0, minutes: 60, note: '写东西时循环' }, DEMO));
  }
  if (works.kongdong) {
    await sessions.save(Object.assign({ workId: works.kongdong, date: iso(-3), pages: 0, minutes: 90, note: '打灵魂大师' }, DEMO));
    await sessions.save(Object.assign({ workId: works.kongdong, date: iso(-2), pages: 0, minutes: 120, note: '深巢' }, DEMO));
  }

  /* 成就与多周目 */
  if (works.kongdong) {
    const ach = [
      ['初次通关', '抵达结局「空洞骑士」', 'common', true, 0, 0],
      ['全收集', '集齐 40 件护符', 'epic', false, 31, 40],
      ['隐藏结局', '在深渊做出选择', 'legend', false, 0, 0]
    ];
    for (let i = 0; i < ach.length; i++) {
      const a = ach[i];
      await achievements.save(Object.assign({
        workId: works.kongdong, name: a[0], desc: a[1], rarity: a[2], done: a[3],
        doneAt: a[3] ? '2026-05-02' : '', hidden: a[0] === '隐藏结局',
        progress: a[4], total: a[5], order: i
      }, DEMO));
    }
    await playthroughs.save(Object.assign({
      workId: works.kongdong, no: 1, startDate: '2026-04-01', endDate: '2026-05-02',
      difficulty: '普通', ending: '结局 A', mode: 'main', hours: 38, rating: 9, note: '首刷，漏了两个支线。'
    }, DEMO));
  }
  if (works.saierda) {
    const ach2 = [['天空之城', '完成主线', 'rare', true], ['呀哈哈收集者', '找到 400 个呀哈哈', 'epic', false]];
    for (let i = 0; i < ach2.length; i++) {
      const a = ach2[i];
      await achievements.save(Object.assign({
        workId: works.saierda, name: a[0], desc: a[1], rarity: a[2], done: a[3],
        doneAt: a[3] ? '2026-08-20' : '', hidden: false, progress: 0, total: 0, order: i
      }, DEMO));
    }
    await playthroughs.save(Object.assign({
      workId: works.saierda, no: 1, startDate: '2026-05-01', endDate: '2026-08-20',
      difficulty: '普通', ending: '主线', mode: 'main', hours: 120, rating: 9.5, note: '全地图探索。'
    }, DEMO));
  }

  /* 游戏截图 */
  if (works.kongdong) {
    const shot = await makeShot('空洞骑士 · 泪城');
    if (shot) {
      const w = data.works.find((x) => x.id === works.kongdong);
      if (w) await saveWork(Object.assign({}, w, { shots: [{ id: shot, caption: '泪城的雨' }] }), data.details[w.id] ? data.details[w.id].fields : {});
    }
  }

  /* 曲目与歌单 */
  if (works.fantesi) {
    const list = [
      { disc: 1, no: 1, title: '爱在西元前', duration: 234, fav: true, rating: 9 },
      { disc: 1, no: 2, title: '简单爱', duration: 270, fav: false, rating: 8 },
      { disc: 1, no: 3, title: '开不了口', duration: 276, fav: true, rating: 10 }
    ];
    for (const t of list) {
      await tracks.save(Object.assign({ workId: works.fantesi, skip: false, note: '' }, t, DEMO));
    }
    const ids = data.tracks.filter((t) => t.workId === works.fantesi).map((t) => t.id);
    await playlists.save(Object.assign({ name: '深夜通勤', desc: '地铁上循环的一小段', trackIds: ids }, DEMO));
  }

  /* 实体、位置、借还 */
  const locHome = (await locations.save(Object.assign({ name: '书房', parentId: '', order: 0 }, DEMO))).row;
  const locA = (await locations.save(Object.assign({ name: '书架 A', parentId: locHome.id, order: 0 }, DEMO))).row;
  const locB = (await locations.save(Object.assign({ name: '书架 B', parentId: locHome.id, order: 1 }, DEMO))).row;
  if (works.santi) {
    await physical.save(Object.assign({
      workId: works.santi, title: '三体（平装）', collectType: '纸质书',
      edition: '重庆出版社 2008 平装', condition: '良好', quantity: 1,
      locationId: locA.id, location: '书房 → 书架 A', buyPrice: '23', buyDate: '2025-12-20',
      valuation: '35', channel: '实体书店', status: '在藏', source: '自购',
      appearance: '书脊轻微泛黄', storageNote: '避光存放', signed: false
    }, DEMO));
  }
  if (works.fantesi) {
    await physical.save(Object.assign({
      workId: works.fantesi, title: '范特西（首版 CD）', collectType: 'CD',
      edition: '首版 CD', condition: '全新', quantity: 1,
      locationId: locB.id, location: '书房 → 书架 B', buyPrice: '128', buyDate: '2026-01-18',
      valuation: '260', channel: '二手唱片店', status: '在藏', source: '淘换',
      appearance: '未拆封', storageNote: '防潮箱', signed: false
    }, DEMO));
  }
  if (works.santi) {
    await loans.save(Object.assign({
      direction: 'out', workId: works.santi, title: '三体', counterpart: '小林',
      date: iso(-20), dueDate: iso(-2), returnedAt: '', status: '借出中', note: '说好两周还'
    }, DEMO));
  }
  if (works.bainian) {
    await loans.save(Object.assign({
      direction: 'in', workId: works.bainian, title: '百年孤独', counterpart: '阿 May',
      date: iso(-10), dueDate: iso(9), returnedAt: '', status: '借入中', note: ''
    }, DEMO));
  }

  /* 收藏清单 / 资源 */
  if (works.yuzhou) {
    await collections.save(Object.assign({
      workId: works.yuzhou, listType: 'wish', priority: 'high', note: '等流媒体上线'
    }, DEMO));
  }
  if (works.santi) {
    await resources.save(Object.assign({
      workId: works.santi, name: '三体.epub', format: 'EPUB', size: '2.4 MB',
      status: '已下载', form: '本地文件', source: '官方电子版', device: '本机',
      path: '~/Books/科幻/三体.epub', fileName: '三体.epub', exists: '是', acquiredAt: '2026-01-04'
    }, DEMO));
  }
  if (works.huayang) {
    await resources.save(Object.assign({
      workId: works.huayang, name: '花样年华.2160p.mkv', format: 'MKV', size: '18.6 GB',
      status: '已下载', form: '本地文件', source: '收藏碟 rip', device: '移动硬盘',
      path: 'D:/Movies/王家卫/花样年华.mkv', fileName: '花样年华.mkv', exists: '是', acquiredAt: '2026-03-01'
    }, DEMO));
  }
  if (works.fantesi) {
    await resources.save(Object.assign({
      workId: works.fantesi, name: '范特西.flac', format: 'FLAC', size: '320 MB',
      status: '已购买', form: '本地文件', source: '数字商店', device: '本机',
      path: '~/Music/华语/范特西', fileName: '范特西.flac', exists: '是', acquiredAt: '2026-01-18'
    }, DEMO));
  }

  /* 总结与摘抄 */
  if (works.santi) {
    const shot = await makeShot('三体 · 阅读笔记');
    const file = await makeFile('三体-读书笔记.txt', '示例附件：这里可以放任意 PDF、长文或笔记文件。');
    await reviews.save(Object.assign({
      workId: works.santi, type: '读后感', title: '黑暗森林之前，先有人心',
      body: '## 印象\n\n重读之后，最在意的不是宏大的宇宙设定，而是**叶文洁按下按钮前的那一秒**。\n\n' +
        '> 她并不是不知道后果，而是已经不再相信同类。\n\n## 结构\n\n- 三体游戏作为世界观说明书\n- 红岸基地作为人物动机的源头\n- 现代线承担解谜与推进\n\n' +
        '这种三线并置的写法，让「科学」和「人性」互相成了对方的悬念。',
      sections: {
        overall: '科幻外壳下的信任寓言。',
        pros: '设定自洽，人物动机扎实。',
        cons: '个别科普段落略显生硬。',
        plot: '三线并置，节奏层层收束。',
        cast: '叶文洁是全书最完整的弧光。',
        world: '三体世界的游戏化呈现很聪明。',
        art: '文字画面感强，尤其是红岸的黄昏。',
        why: '推荐给愿意慢读设定的读者。',
        rewatch: '值得隔几年重读一次。'
      },
      rating: 9.5, date: '2026-02-11',
      images: shot ? [{ id: shot, caption: '读书时拍的笔记' }] : [],
      files: file ? [{ id: file, name: '三体-读书笔记.txt', size: 84, mimeType: 'text/plain' }] : [],
      source: 'manual'
    }, DEMO));
  }
  if (works.huayang) {
    await reviews.save(Object.assign({
      workId: works.huayang, type: '观后感', title: '克制是一种更长的告白',
      body: '## 印象\n\n王家卫把「没有发生的事」拍得比发生的事更重。\n\n- 走廊、旗袍、雨声\n- 每一次擦肩都差半拍\n\n' +
        '## 判断\n\n它不是爱情片，是一部关于**时机**的电影。',
      sections: { overall: '形式与情绪高度统一。', art: '色彩与音乐几乎参与叙事。', why: '适合在深夜一个人看。' },
      rating: 9, date: '2026-03-12', images: [], files: [], source: 'manual'
    }, DEMO));
  }
  if (works.manchang) {
    await reviews.save(Object.assign({
      workId: works.manchang, type: '观后感', title: '秋天之后，还有冬天',
      body: '## 印象\n\n三个时间线交叉剪接，最后落在一句「往前看，别回头」。\n\n' +
        '## 结构\n\n- 1997 的碎\n- 2016 的钝\n- 2019 的收束\n\n情绪不是靠配乐推的，是靠时间差。',
      sections: { overall: '年度最佳国产剧之一。', plot: '三线并置，收束干净。', cast: '范伟的表演撑住了整部剧。' },
      rating: 9, date: '2026-02-04', images: [], files: [], source: 'manual'
    }, DEMO));
  }
  if (works.santi) {
    await excerpts.save(Object.assign({
      workId: works.santi, content: '弱小和无知不是生存的障碍，傲慢才是。',
      type: '名句', author: '刘慈欣', position: { page: '302' }, date: '2026-02-10',
      insight: '这句话放在任何领域都成立。', tags: [tSci], fav: true
    }, DEMO));
  }
  if (works.bainian) {
    await excerpts.save(Object.assign({
      workId: works.bainian, content: '生命中曾经有过的所有灿烂，终究都需要用寂寞来偿还。',
      type: '名句', author: '马尔克斯', position: { page: '120' }, date: '2025-12-20',
      insight: '', tags: [], fav: true
    }, DEMO));
  }
  if (works.manchang) {
    await excerpts.save(Object.assign({
      workId: works.manchang, content: '往前看，别回头。',
      type: '台词', author: '', position: {}, date: '2026-02-03',
      insight: '整部剧的落点。', tags: [], fav: false
    }, DEMO));
  }

  /* 专题 */
  if (works.santi) {
    await topics.save(Object.assign({
      title: '2026 年度十佳', description: '今年真正留下来的几部。', order: 0, cover: '',
      workIds: [works.santi, works.huayang, works.manchang, works.kongdong, works.fantesi].filter(Boolean)
    }, DEMO));
    await topics.save(Object.assign({
      title: '科幻入门', description: '从哪本开始读。', order: 1, cover: '',
      workIds: [works.santi, works.heian, works.shaqiu].filter(Boolean)
    }, DEMO));
  }

  /* 消费 / 订阅 / 目标 / 提醒 */
  const spend = [
    ['实体书', 45, '三体 纸质版', works.santi, '微信', iso(-30)],
    ['电影票', 68, '花样年华 重映', works.huayang, '支付宝', '2026-03-11'],
    ['专辑', 128, '范特西 首版 CD', works.fantesi, '微信', '2026-01-18'],
    ['演出票', 680, '悲惨世界 音乐剧', works.beican, '银行卡', '2026-03-20'],
    ['会员订阅', 25, '网易云音乐 月费', '', '微信', iso(-5)]
  ];
  for (const s of spend) {
    await expenses.save(Object.assign({
      category: s[0], amount: s[1], currency: 'CNY', note: s[2], workId: s[3] || '',
      payMethod: s[4], installments: 0, channel: '线上', date: s[5]
    }, DEMO));
  }
  await subscriptions.save(Object.assign({
    platform: '网易云音乐', plan: '黑胶 VIP 年费', amount: 168, cycle: 'year',
    startDate: iso(-347), endDate: iso(18), autoRenew: true, note: '',
    payMethod: '微信', benefits: '无损音质 / 免广告 / 下载'
  }, DEMO));
  await subscriptions.save(Object.assign({
    platform: '腾讯视频', plan: 'VIP 月费', amount: 25, cycle: 'month',
    startDate: iso(-26), endDate: iso(4), autoRenew: true, note: '看完漫长的季节',
    payMethod: '支付宝', benefits: '4K / 免广告'
  }, DEMO));
  await goals.save(Object.assign({
    year: '2026', kind: 'count', target: 24, title: '今年读 24 本', note: '平均每月两本', status: 'doing'
  }, DEMO));
  await goals.save(Object.assign({
    year: '2026', kind: 'hours', target: 120, title: '今年玩 120 小时', note: '', status: 'doing'
  }, DEMO));
  await reminders.save(Object.assign({
    title: '归还《三体》给小林', date: iso(2), repeat: 'none', done: false, note: '已经逾期，尽快'
  }, DEMO));
  await reminders.save(Object.assign({
    title: '补录《读者》第 3 期', date: iso(1), repeat: 'none', done: false, note: '刊系里标了缺期'
  }, DEMO));
  await reminders.save(Object.assign({
    title: '写 2026 年度总结', date: iso(10), repeat: 'yearly', done: false, note: ''
  }, DEMO));

  /* 独立笔记：两次保存，自动留下一个历史版本 */
  const note1 = await saveNote({
    id: '', title: '为什么重读经典', pinned: true, date: '2026-02-12',
    body: '## 第一遍\n\n第一次读《百年孤独》，记住的是名字和魔幻。\n\n## 第二遍\n\n第二次读，才看见循环的时间结构。',
    workIds: [works.bainian, works.santi].filter(Boolean), creatorIds: [pLiu ? pLiu.id : ''].filter(Boolean),
    tagIds: [tGod], categoryId: catLit, demo: true
  });
  if (note1.ok) {
    await saveNote(Object.assign({}, note1.row, {
      body: '## 第一遍\n\n第一次读《百年孤独》，记住的是名字和魔幻。\n\n## 第二遍\n\n第二次读，才看见循环的时间结构：' +
        '家族的名字在重复，事件也在重复。\n\n## 结论\n\n重读不是复习，是换一副眼睛。'
    }));
  }
  await saveNote({
    id: '', title: '科幻里的时间结构', pinned: false, date: '2026-03-02',
    body: '## 三种常见写法\n\n- 线性加速：危机倒计时\n- 循环：因果闭环\n- 折叠：过去与未来同时在场\n\n' +
      '《三体》用的是第一种，《星际穿越》把第三种拍成了情感结构。',
    workIds: [works.santi, works.xingji].filter(Boolean), creatorIds: [],
    tagIds: [tSci], categoryId: catSci, demo: true
  });

  /* 规则与筛选方案（最后建，避免触发写入） */
  await rules.save(Object.assign({
    name: '高分自动加标签', trigger: 'rating_high', threshold: 9, action: 'add_tag', value: '神作', enabled: true
  }, DEMO));
  await savedFilters.save(Object.assign({
    name: '已下载未看的电影', pinned: false,
    query: { type: 'movie', status: 'todo', tag: 'all', year: 'all', rating: 'all', sort: 'updated' }
  }, DEMO));

  await loadAll();
  return { ok: true, works: Object.keys(works).length };
}

/* ---------------- 清除 ---------------- */

export async function purgeDemo() {
  const demoWorks = new Set(data.works.filter((w) => w.demo).map((w) => w.id));
  const attachIds = new Set();

  /* 先收集附件引用，避免删了作品找不到 */
  data.works.filter((w) => w.demo).forEach((w) => {
    [w.cover, w.thumb].forEach((id) => { if (id) attachIds.add(id); });
    (w.shots || []).forEach((s) => { if (s && s.id) attachIds.add(s.id); });
  });
  data.reviews.filter((r) => r.demo).forEach((r) => {
    (r.images || []).forEach((x) => { if (x && x.id) attachIds.add(x.id); });
    (r.files || []).forEach((x) => { if (x && x.id) attachIds.add(x.id); });
  });

  const stores = Object.values(STORES).filter((s) => s !== STORES.settings && s !== STORES.metadata);
  let removed = 0;

  for (const store of stores) {
    const rows = await db.getAll(store);
    for (const r of rows) {
      if (!r) continue;
      const byWork = r.workId && demoWorks.has(r.workId);
      const byLink = (r.source && [...demoWorks].some((id) => String(r.source).indexOf(id) >= 0)) ||
        (r.target && [...demoWorks].some((id) => String(r.target).indexOf(id) >= 0));
      const isDemo = r.demo === true || byWork || byLink ||
        (store === STORES.attachments && attachIds.has(r.id));
      if (!isDemo) continue;
      const key = store === STORES.details ? r.workId : r.id;
      if (!key) continue;
      const res = await db.del(store, key);
      if (res.ok) removed++;
    }
  }

  await loadAll();
  return { ok: true, removed };
}

/* URL 触发：?demo=1 载入，?demo=0 清除 */
export async function runDemoFromUrl() {
  const value = new URLSearchParams(location.search).get('demo');
  if (value !== '1' && value !== '0') return false;
  let notice = '';
  if (value === '1') {
    const res = await seedDemo();
    notice = res.skipped ? '示例数据已经在了' : '示例数据已载入，可逐项查看；需要清空时用 ?demo=0';
  } else {
    const res = await purgeDemo();
    notice = res.removed ? '已清除示例数据（' + res.removed + ' 条）' : '没有找到示例数据';
  }
  try {
    sessionStorage.setItem('demo.notice', notice);
    /* 只摘掉 demo 参数，分享码等其它查询参数原样保留 */
    const url = new URL(location.href);
    url.searchParams.delete('demo');
    history.replaceState(null, '', url.pathname + (url.search || '') + url.hash);
  } catch (e) { /* ignore */ }
  location.reload();
  return true;
}

export function takeDemoNotice() {
  try {
    const v = sessionStorage.getItem('demo.notice');
    if (v) sessionStorage.removeItem('demo.notice');
    return v || '';
  } catch (e) {
    return '';
  }
}
