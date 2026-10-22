(() => {
  'use strict';

  const DB_KEY = 'yuwei.app.v1';
  const DRAFT_KEY = 'yuwei.drafts.v1';
  const TYPES = {
    book:  { label: '书',   full: '书籍', icon: 'book',   verb: '读', solid: '#F0F4FF', c1: '#6E7FC4', c2: '#45548F', ink: '#F0F2FF', dot: '#7C8CD0' },
    comic: { label: '漫画', full: '漫画', icon: 'comic',  verb: '读', solid: '#F8F1F6', c1: '#D7B7CB', c2: '#B18AA9', ink: '#3C2E3A', dot: '#B37FA7' },
    film:  { label: '电影', full: '电影', icon: 'film',   verb: '看', solid: '#EFF6F4', c1: '#3C7477', c2: '#1C474E', ink: '#EAF0E7', dot: '#4F7C83' },
    game:  { label: '游戏', full: '游戏', icon: 'game',   verb: '玩', solid: '#F3F6ED', c1: '#6D8064', c2: '#3E4D3A', ink: '#EEF2E0', dot: '#708764' },
    album: { label: '专辑', full: '专辑', icon: 'album',  verb: '听', solid: '#F4F0FC', c1: '#8A7DB9', c2: '#5C508D', ink: '#F4EFFF', dot: '#9884C8' }
  };
  const SCORE_STAR = '<svg class="score-star" aria-hidden="true"><use href="#i-star"></use></svg>';
  const TYPE_ORDER = ['book', 'comic', 'film', 'game', 'album'];
  const STATUS_LABEL = { finished: '已看完', reading: '在看', wish: '想看' };
  const UNCATEGORIZED_TAG = '未分类';

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const pad2 = n => String(n).padStart(2, '0');
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
  const icon = (name, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"></use></svg>`;
  const uid = (prefix = 'w') => prefix + '-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);

  function todayISO() {
    const d = new Date();
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
  }
  function fmtDate(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return y && m && d ? `${y}.${m}.${d}` : iso;
  }
  function fmtShort(iso) {
    if (!iso) return '';
    const [, m, d] = iso.split('-');
    return m && d ? `${m}.${d}` : iso;
  }
  function fmtNoteTime(ts) {
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return '';
    return `${pad2(d.getMonth() + 1)}.${pad2(d.getDate())} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  function daysSince(iso) {
    if (!iso) return 1;
    const start = new Date(iso + 'T00:00:00');
    const now = new Date(todayISO() + 'T00:00:00');
    return Math.max(1, Math.round((now - start) / 86400000) + 1);
  }
  function ratingText(v) {
    // null 表示「还没打分」（快速记录就是这样存的），不能落到 Number(null)=0 上，
    // 否则卡片会显示 0.0/10 —— 那是系统编出来的分数。
    if (v === null || v === undefined || v === '') return '—';
    const n = Number(v);
    if (!Number.isFinite(n)) return '—';
    return n === 10 ? '10' : n.toFixed(1);
  }
  function firstChar(title) {
    return Array.from(String(title || '余'))[0] || '余';
  }
  function tagOf(w) {
    return String(w.tag || '').trim() || UNCATEGORIZED_TAG;
  }
  function nowTs() { return Date.now(); }

  let db = loadDB();
  const ui = {
    tab: 'records',
    recordFilter: 'all',
    wishFilter: 'all',
    readingId: null,
    detailId: null,
    editingId: null,
    formStatus: 'finished',
    formType: 'book',
    formIcon: null,
    sheetWorkId: null,
    sheetNoteId: null,
    sheetDraftImages: [],
    sheetTag: '想法',
    searchQuery: '',
    heroIndex: 0,
    iconEditTarget: null,
    readingDraftImages: [],
    imageTarget: null,
    viewerImages: [],
    viewerIndex: 0,
    bgWorkId: null,
    crop: null,
    ratingEditing: false,
    ratingDraft: 8,
    ratingTouched: false,     // 表单里的评分滑杆有没有被真正动过（快速记录据此决定要不要写分数）
    pickId: null,             // 发现面板当前展示的作品 id（只引用，不复制记录）
    pickSource: '',           // 'inspire' | 'roll'
    galleryMode: 'add',
    // 阶段5 · 回顾
    rvMode: 'random',         // 'year' | 'random' | 'oldest'（默认随机：打开就有东西可看）
    rvPickId: null,           // 胶囊当前展示的作品 id（只引用，不复制记录）
    rvMonth: '',              // 'YYYY-MM'，空 = 本月
    rvScope: 'month',         // 'month' | 'year'
    shareParts: { count: true, types: true, rating: true, titles: false, thoughts: false }
  };

  // ── data ─────────────────────────────────────────────────
  function seedDB() {
    const iso = s => (s ? new Date(s).getTime() : Date.now());
    const works = [
      {
        id: 'seed-haibian', type: 'book', status: 'finished', title: '海边的卡夫卡', creator: '村上春树',
        rating: 9, date: '2026-10-12',
        thought: '读完像从一个很长的梦里醒来，窗外刚好在下雨。十五岁的田村卡夫卡走进森林的时候，我好像也跟着他，把某个一直不肯放下的东西留在了里面。',
        icon: null, images: [], notes: [], createdAt: iso('2026-10-12T21:10:00+08:00')
      },
      {
        id: 'seed-chihiro', type: 'film', status: 'finished', title: '千与千寻', creator: '宫崎骏',
        rating: 9.5, date: '2026-10-05',
        thought: '长大以后再看，才发现无脸男站在站台上的那一幕那么孤独。小时候只记得海上列车很美，现在却在那段沉默里坐了很久。',
        icon: null, images: [], notes: [], createdAt: iso('2026-10-05T22:20:00+08:00')
      },
      {
        id: 'seed-zelda', type: 'game', status: 'finished', title: '塞尔达传说：王国之泪', creator: '任天堂',
        rating: 9, date: '2026-09-28',
        thought: '究极手给了我一种久违的、纯粹的“想办法”的快乐。不是被关卡推着走，而是真的相信，眼前这件事可以有十种做法。',
        icon: null, images: [], notes: [], createdAt: iso('2026-09-28T23:05:00+08:00')
      },
      {
        id: 'seed-frieren', type: 'comic', status: 'finished', title: '葬送的芙莉莲', creator: '山田钟人 / 阿部司',
        rating: 8.5, date: '2026-09-21',
        thought: '时间在芙莉莲身上走得很慢，慢到一场告别可以铺开几十年。看完之后，我开始留意那些被日常略过的瞬间。',
        icon: null, images: [], notes: [], createdAt: iso('2026-09-21T19:30:00+08:00')
      },
      {
        id: 'seed-fantasy', type: 'album', status: 'finished', title: '范特西', creator: '周杰伦',
        rating: 10, date: '2026-09-17',
        thought: '二十多年后再听，依然没有一首歌是多余的。它像一盒被时间保存得很好的磁带，按下播放，整个夏天就回来了。',
        icon: null, images: [], notes: [], createdAt: iso('2026-09-17T20:15:00+08:00')
      },
      {
        id: 'seed-karamazov', type: 'book', status: 'reading', title: '卡拉马佐夫兄弟', creator: '陀思妥耶夫斯基',
        rating: null, startedAt: '2026-10-02',
        thought: '', icon: null, images: [],
        notes: [
          { id: 'n1', tag: '想法', text: '伊万和阿辽沙在酒馆的对话，读得我停下来很久。', createdAt: iso('2026-10-18T23:41:00+08:00') },
          { id: 'n2', tag: '摘抄', text: '如果上帝不存在，是否一切都被允许？', createdAt: iso('2026-10-16T08:02:00+08:00') },
          { id: 'n3', tag: '想法', text: '宗教大法官那一章，像一场漫长的审判。', createdAt: iso('2026-10-14T22:10:00+08:00') },
          { id: 'n4', tag: '想法', text: '读到这里，忽然理解了他为什么一直不肯离开。', createdAt: iso('2026-10-10T07:45:00+08:00') }
        ],
        createdAt: iso('2026-10-02T22:30:00+08:00')
      },
      {
        id: 'seed-umimachi', type: 'film', status: 'reading', title: '海街日记', creator: '是枝裕和',
        rating: null, startedAt: '2026-09-28',
        thought: '', icon: null, images: [],
        notes: [
          { id: 'u1', tag: '想法', text: '四姐妹围坐吃饭的镜头，安静得让人想家。', createdAt: iso('2026-10-08T21:15:00+08:00') },
          { id: 'u2', tag: '摘抄', text: '有些地方，只有回去才知道它一直在。', createdAt: iso('2026-10-04T19:40:00+08:00') }
        ],
        createdAt: iso('2026-09-28T22:00:00+08:00')
      },
      {
        id: 'seed-splatoon', type: 'game', status: 'reading', title: '斯普拉遁 3', creator: '任天堂',
        rating: null, startedAt: '2026-09-15',
        thought: '', icon: null, images: [],
        notes: [
          { id: 's1', tag: '想法', text: '三分钟一局的节奏，刚好够忘掉白天的事。', createdAt: iso('2026-10-01T22:10:00+08:00') }
        ],
        createdAt: iso('2026-09-15T21:20:00+08:00')
      },
      {
        id: 'seed-dungeon', type: 'comic', status: 'wish', title: '迷宫饭', creator: '九井谅子',
        tag: '美食', why: '朋友说，看完会重新理解“吃饭”这件事。',
        addedAt: '2026-09-12', done: false, icon: null, images: [], notes: [], createdAt: iso('2026-09-12T20:00:00+08:00')
      },
      {
        id: 'seed-blue-period', type: 'comic', status: 'wish', title: '蓝色时期', creator: '山口飞翔',
        tag: '成长', why: '想看看把一件事做到极致的人，是什么样子。',
        addedAt: '2026-08-30', done: true, finishedAt: '2026-09-30', icon: null, images: [], notes: [], createdAt: iso('2026-08-30T21:00:00+08:00')
      },
      {
        id: 'seed-solitude', type: 'book', status: 'wish', title: '百年孤独', creator: '加西亚·马尔克斯',
        tag: '经典', why: '一直没敢开始，想在今年冬天读完。',
        addedAt: '2026-08-28', done: false, icon: null, images: [], notes: [], createdAt: iso('2026-08-28T19:10:00+08:00')
      },
      {
        id: 'seed-oppenheimer', type: 'film', status: 'wish', title: '奥本海默', creator: '克里斯托弗·诺兰',
        tag: '传记', why: '想在了解那段历史之后，再重看一遍。',
        addedAt: '2026-08-17', done: false, icon: null, images: [], notes: [], createdAt: iso('2026-08-17T22:50:00+08:00')
      },
      {
        id: 'seed-disco', type: 'game', status: 'wish', title: '极乐迪斯科', creator: 'ZA/UM',
        tag: '剧情', why: '听说文本量惊人，想留到长假慢慢玩。',
        addedAt: '2026-07-30', done: false, icon: null, images: [], notes: [], createdAt: iso('2026-07-30T21:35:00+08:00')
      },
      {
        id: 'seed-perfect-days', type: 'film', status: 'wish', title: '完美的日子', creator: '维姆·文德斯',
        tag: '治愈', why: '想在疲惫的晚上，看一部安静的电影。',
        addedAt: '2026-09-05', done: true, finishedAt: '2026-09-21', icon: null, images: [], notes: [], createdAt: iso('2026-09-05T22:10:00+08:00')
      },
      {
        id: 'seed-blue', type: 'album', status: 'wish', title: '蓝', creator: 'Joni Mitchell',
        tag: '民谣', why: '朋友说，适合雨天一个人循环。',
        addedAt: '2026-09-05', done: false, icon: null, images: [], notes: [], createdAt: iso('2026-09-05T22:40:00+08:00')
      }
    ];
    return { version: 2, works };
  }

  // ── 感想数据模型 ─────────────────────────────────────────
  // 每条感想都挂在所属作品下（work.notes），并写入 workId，
  // 详情页、「在看」页读取同一份数据，只按作品 ID 过滤。
  function legacyNoteId(workId) { return 'legacy-' + workId; }

  function noteTime(value, fallbackDate) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value) {
      const parsed = Date.parse(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    if (fallbackDate && /^\d{4}-\d{2}-\d{2}$/.test(fallbackDate)) {
      const ts = new Date(fallbackDate + 'T21:00:00').getTime();
      if (Number.isFinite(ts)) return Math.min(ts, Date.now());
    }
    return Date.now();
  }

  function workDateISO(w) {
    return w.status === 'finished' ? (w.date || w.finishedAt) : w.status === 'reading' ? w.startedAt : w.addedAt;
  }

  function migrateDB(data) {
    if (!data || !Array.isArray(data.works)) return data;
    let version = Number(data.version) || 1;

    if (version < 2) {
      data.works.forEach(w => {
        if (Object.prototype.hasOwnProperty.call(w, 'category')) {
          if (!w.tag) w.tag = w.category || '';
          delete w.category;
        }
        delete w.progress;
        delete w.percent;
      });
      version = 2;
    }

    if (version < 3) {
      data.works.forEach(w => {
        if (!w.id) w.id = uid('w');
        if (!Array.isArray(w.notes)) w.notes = [];
        if (!Array.isArray(w.images)) w.images = [];
        w.images = w.images.filter(Boolean);

        w.notes = w.notes.filter(n => n && (String(n.text || '').trim() || (Array.isArray(n.images) && n.images.length)));
        w.notes.forEach(n => {
          if (!n.id) n.id = uid('n');
          n.workId = w.id;
          n.tag = n.tag === '摘抄' ? '摘抄' : '想法';
          n.createdAt = noteTime(n.createdAt, workDateISO(w));
          if (!Array.isArray(n.images)) n.images = [];
        });

        // 旧版「感想」是单一文本字段：并入时间线，只做一次，不复制
        const legacyText = String(w.thought || '').trim();
        const legacyImages = Array.isArray(w.thoughtImages) ? w.thoughtImages.filter(Boolean) : [];
        const existIdx = w.notes.findIndex(n => n.id === legacyNoteId(w.id));
        if (legacyText) {
          if (existIdx >= 0) {
            w.notes[existIdx].text = legacyText;
            w.notes[existIdx].workId = w.id;
            if (legacyImages.length) w.notes[existIdx].images = legacyImages;
          } else {
            w.notes.push({
              id: legacyNoteId(w.id), workId: w.id, tag: '想法', text: legacyText,
              images: legacyImages, legacy: true, createdAt: noteTime(w.createdAt, workDateISO(w))
            });
          }
        } else if (existIdx >= 0) {
          w.notes.splice(existIdx, 1);
        }
      });
      version = 3;
    }

    data.version = version;
    return data;
  }

  function loadDB() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.works)) {
          const migrated = migrateDB(parsed);
          try { localStorage.setItem(DB_KEY, JSON.stringify(migrated)); } catch (e) {}
          return migrated;
        }
      }
    } catch (e) { console.error('db load failed', e && (e.stack || e)); }
    const seeded = migrateDB(seedDB());
    try { localStorage.setItem(DB_KEY, JSON.stringify(seeded)); } catch (e) {}
    return seeded;
  }

  function saveDB() {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify(db));
      return true;
    } catch (e) {
      toast('存储空间不足，图片可能太多', 'err');
      return false;
    }
  }

  function getWork(id) { return db.works.find(w => w.id === id); }
  function finishedWorksChronological() {
    return db.works.filter(w => w.status === 'finished')
      .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')) || (a.createdAt || 0) - (b.createdAt || 0));
  }
  // 记录列表显示顺序：置顶优先 → 手动排序值 → 默认日期倒序
  // 阶段2：置顶区内也不再按 pinnedAt 时间戳排（那会让 pinnedAt 成为第二套顺序来源），
  // 统一由 sortNo 决定；置顶只回答「是不是置顶」，顺序只有 sortNo 一个真源。
  function displayFinished() {
    return finishedWorksChronological().slice().reverse().sort((a, b) => {
      const pa = a.pinnedAt || 0, pb = b.pinnedAt || 0;
      if (!!pa !== !!pb) return pa ? -1 : 1;
      const sa = a.sortNo, sb = b.sortNo;
      if (sa != null && sb != null && sa !== sb) return sa - sb;
      if (sa != null) return -1;
      if (sb != null) return 1;
      return 0;
    });
  }
  function finishedWorks() {
    return finishedWorksChronological().slice().reverse();
  }
  function readingWorks() {
    return db.works.filter(w => w.status === 'reading')
      .sort((a, b) => String(b.startedAt || '').localeCompare(String(a.startedAt || '')) || b.createdAt - a.createdAt);
  }
  function wishWorks() {
    return db.works.filter(w => w.status === 'wish')
      .sort((a, b) => String(b.addedAt || '').localeCompare(String(a.addedAt || '')) || b.createdAt - a.createdAt);
  }
  function wishTypes() {
    return TYPE_ORDER.filter(type => wishWorks().some(w => w.type === type));
  }
  function tagsForType(type) {
    const out = [];
    wishWorks().filter(w => w.type === type).forEach(w => {
      const tag = String(w.tag || '').trim();
      if (tag && !out.includes(tag)) out.push(tag);
    });
    return out;
  }
  function allNotesCount() {
    return db.works.reduce((sum, w) => sum + (Array.isArray(w.notes) ? w.notes.length : 0), 0);
  }
  function noteList(w) {
    return (Array.isArray(w.notes) ? w.notes : []).slice()
      .filter(n => n && (String(n.text || '').trim() || (Array.isArray(n.images) && n.images.length)))
      .sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
  }
  function sortedNotes(w) { return noteList(w); }
  function previewText(w) {
    const notes = noteList(w);
    if (notes.length && String(notes[0].text || '').trim()) return notes[0].text;
    const thought = String(w.thought || '').trim();
    return thought || '还没有写下感想。';
  }
  function ensureNotes(w) {
    w.notes = Array.isArray(w.notes) ? w.notes : [];
    w.notes.forEach(n => { if (n && !n.workId) n.workId = w.id; });
    return w.notes;
  }
  // 表单里的「感想」与时间线共用一条 legacy 记录，避免出现两份内容
  function syncLegacyNote(w, text) {
    const notes = ensureNotes(w);
    const id = legacyNoteId(w.id);
    const idx = notes.findIndex(n => n.id === id || (n.legacy && n.workId === w.id));
    const clean = String(text || '').trim();
    if (!clean) {
      if (idx >= 0) notes.splice(idx, 1);
      return;
    }
    if (idx >= 0) {
      notes[idx].text = clean;
      notes[idx].workId = w.id;
    } else {
      notes.push({
        id, workId: w.id, tag: '想法', text: clean, legacy: true,
        images: Array.isArray(w.thoughtImages) ? w.thoughtImages.filter(Boolean) : [],
        createdAt: noteTime(w.createdAt, workDateISO(w))
      });
    }
  }

  // ── visual helpers ───────────────────────────────────────
  function coverHTML(work, extra = '') {
    if (work.icon) {
      return `<span class="cover ${extra} has-image"><img src="${esc(work.icon)}" alt=""></span>`;
    }
    const m = TYPES[work.type] || TYPES.book;
    return `<span class="cover ${extra}" data-kind="${esc(work.type)}" style="--c1:${m.c1};--c2:${m.c2};--ink-cover:${m.ink}"><span class="cover-glyph">${esc(firstChar(work.title))}</span></span>`;
  }
  function statusText(work) {
    if (work.status === 'wish') return work.done ? '已看完' : '想看';
    return STATUS_LABEL[work.status] || '';
  }
  function noteHTML(note, workId) {
    const text = String(note.text || '');
    const long = text.length > 90;
    const images = Array.isArray(note.images) ? note.images : [];
    const shown = images.slice(0, 3);
    const imageHTML = shown.length
      ? `<div class="note-images">${shown.map((src, i) =>
          `<button class="note-image" data-action="view-image" data-work-id="${workId}" data-note-id="${note.id}" data-index="${i}" aria-label="查看第 ${i + 1} 张图片"><img src="${esc(src)}" alt=""></button>`
        ).join('')}${images.length > 3 ? `<span class="note-image-more">+${images.length - 3}</span>` : ''}</div>`
      : '';
    return `<li class="note${note.tag === '摘抄' ? ' quote' : ''}${long ? ' long' : ''}" data-note-id="${note.id}">
      <div class="note-head">
        <span class="note-time">${esc(fmtNoteTime(note.createdAt))}</span>
        <span class="note-tag">${esc(note.tag || '想法')}</span>
        <button class="note-menu-btn" data-action="note-menu" data-work-id="${workId}" data-note-id="${note.id}" aria-label="这条感想的更多操作">${icon('more')}</button>
      </div>
      ${text ? `<p>${esc(text)}</p>` : ''}
      ${imageHTML}
      ${long ? '<button class="note-more" data-action="toggle-note">展开全文</button>' : ''}
    </li>`;
  }

  function draftImagesHTML(images) {
    if (!Array.isArray(images) || !images.length) return '';
    return images.map(src => `<span class="draft-thumb"><img src="${esc(src)}" alt=""></span>`).join('');
  }
  function emptyState(iconName, title, text, action, label) {
    return `<div class="empty-state">
      <span class="empty-icon">${icon(iconName)}</span>
      <b>${esc(title)}</b>
      <button class="mini-btn" data-action="${action || 'new-work'}">${esc(label || '添加作品')}</button>
    </div>`;
  }

  // 统一反馈：kind = '' | 'ok' | 'err'。同一个元素、同一段时长，不再各写各的提示。
  function toast(message, kind) {
    const el = $('#toast');
    if (!el) return;
    el.className = 'toast show' + (kind ? ' ' + kind : '');
    el.textContent = message;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { el.className = 'toast' + (kind ? ' ' + kind : ''); }, 1900);
  }

  // 轻震动反馈（需 VIBRATE 权限；不支持时静默跳过）
  function buzzer(ms = 10) {
    // v2.0.1：优先走原生 Vibrator（WebView 的 navigator.vibrate 在部分 ROM 上无效）
    try {
      if (window.LingBridge && typeof LingBridge.vibrate === 'function') { LingBridge.vibrate(ms); return; }
    } catch (e) {}
    if (navigator.vibrate) try { navigator.vibrate(ms); } catch (e) {}
  }

  // ── 统一按压反馈（阶段2） ───────────────────────────────
  // 一对委托监听覆盖所有按钮：按下 110ms 轻微下压，抬起 180ms 回弹。
  // 用 WAAPI 而不是 CSS :active —— 不少组件已有自己的 transition / :active 变换，
  // 再叠一条会互相覆盖；动画本身跑在合成线程，不参与布局。
  // 带独立指示块的组件（筛选胶囊、导航、分段控件）与拖动卡排除在外，避免与指示块错位。
  const PRESS_SKIP = '.qa-item, .nav-item, .glass-nav, .now-dot, .add-btn, .pin-badge, .filter, .segmented button, #recordList .record, .drag-ghost, .drag-zone';
  let pressedEl = null, pressedAnim = null, pressedBase = '';

  function pressTarget(e) {
    const el = e.target.closest('button, [role="button"], .action-item');
    if (!el || el.disabled) return null;
    if (el.closest(PRESS_SKIP)) return null;
    return el;
  }

  // 关键帧里写 transform 会整条顶掉元素自己的变换。
  // 「导入图片」这类按钮是靠 translateX(-50%) 居中的，被顶掉后按下瞬间会横向跳半格
  // ——看起来就是按钮「像水滴一样划走」。所以先把自带的位移读出来，拼进关键帧，
  // 只覆盖缩放那一段。带旋转/斜切的元素拆不开，索性跳过（宁缺反馈，不要错位）。
  function pressBaseOf(el) {
    try {
      const t = getComputedStyle(el).transform;
      if (!t || t === 'none') return '';
      const m = /^matrix\(([^)]+)\)$/.exec(t);
      if (!m) return null;
      const p = m[1].split(',').map(Number);
      if (Math.abs(p[1]) > 0.001 || Math.abs(p[2]) > 0.001) return null;
      return (p[4] || p[5]) ? 'translate(' + p[4] + 'px,' + p[5] + 'px) ' : '';
    } catch (e) { return ''; }
  }

  function pressDown(el) {
    if (!el || !dragMotionOK()) return;
    const base = pressBaseOf(el);   // 必须在 pressUp() 之前取：那时的变换才是静止值
    pressUp();
    if (base === null) return;
    pressedEl = el;
    pressedBase = base;
    try {
      pressedAnim = el.animate(
        [{ transform: base + 'scale(1)' }, { transform: base + 'scale(.965)' }],
        { duration: 110, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'forwards' }
      );
    } catch (e) { pressedAnim = null; }
  }

  function pressUp() {
    const el = pressedEl, anim = pressedAnim, base = pressedBase;
    pressedEl = null; pressedAnim = null; pressedBase = '';
    if (!el) return;
    let s = .965;
    try {
      const m = getComputedStyle(el).transform;      // 先读当前缩放，再撤销下压
      const hit = m && m !== 'none' && m.match(/matrix\(([^)]+)\)/);
      if (hit) s = parseFloat(hit[1].split(',')[0]) || .965;
    } catch (e) {}
    if (anim) { try { anim.cancel(); } catch (e) {} }
    if (!dragMotionOK()) return;
    try {
      el.animate([{ transform: base + 'scale(' + s + ')' }, { transform: base + 'scale(1)' }],
        { duration: 180, easing: 'cubic-bezier(.34,1.32,.5,1)' });
    } catch (e) {}
  }

  document.addEventListener('pointerdown', e => {
    const el = pressTarget(e);
    if (el) pressDown(el);
  }, { passive: true });
  document.addEventListener('pointerup', pressUp, { passive: true });
  document.addEventListener('pointercancel', pressUp, { passive: true });

  // ── 详情页草稿（按作品 ID 保存，切换页面/作品不丢） ──────
  const draftNotes = (() => {
    const out = {};
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed && typeof parsed === 'object') {
        Object.keys(parsed).forEach(key => {
          const d = parsed[key] || {};
          out[key] = { text: String(d.text || ''), tag: d.tag === '摘抄' ? '摘抄' : '想法', images: [] };
        });
      }
    } catch (e) { /* 草稿损坏时忽略 */ }
    return out;
  })();
  let draftTimer = null;

  function getDraft(workId) {
    if (!draftNotes[workId]) draftNotes[workId] = { text: '', tag: '想法', images: [] };
    const d = draftNotes[workId];
    if (!Array.isArray(d.images)) d.images = [];
    return d;
  }
  function persistDrafts() {
    try {
      const slim = {};
      Object.keys(draftNotes).forEach(key => {
        const d = draftNotes[key];
        if (String(d.text || '').trim()) slim[key] = { text: d.text, tag: d.tag };
      });
      localStorage.setItem(DRAFT_KEY, JSON.stringify(slim));
    } catch (e) { /* 存储空间不足时只在内存里保留 */ }
  }
  function scheduleDraftSave() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(persistDrafts, 400);
  }

  // ── rendering: records ──────────────────────────────────
  function renderRecords() {
    const display = displayFinished().map((w, i) => ({ work: w, number: i + 1 }));

    const filters = [{ key: 'all', label: '全部' }, ...TYPE_ORDER.map(k => ({ key: k, label: TYPES[k].label }))];
    if (!filters.some(f => f.key === ui.recordFilter)) ui.recordFilter = 'all';
    $('#recordFilters').innerHTML = filters.map(f =>
      `<button class="filter${ui.recordFilter === f.key ? ' active' : ''}" data-filter-kind="${f.key}">${f.label}</button>`
    ).join('');
    placeFilterBlob(true);

    const now = readingWorks();
    if (now.length) {
      $('#nowCardWrap').innerHTML = [
        `<div class="now-carousel" id="nowCarousel">${now.map(nowCardHTML).join('')}</div>`,
        now.length > 1
          ? `<div class="now-dots" id="nowDots">${now.map((_, i) =>
              `<button class="now-dot${i === 0 ? ' active' : ''}" data-action="now-slide" data-index="${i}" aria-label="切换到第 ${i + 1} 个在看作品"></button>`
            ).join('')}</div>`
          : ''
      ].join('');
      bindNowCarousel();
    } else {
      $('#nowCardWrap').innerHTML = '';
    }

    const listEl = $('#recordList');
    const visible = ui.recordFilter === 'all' ? display : display.filter(item => item.work.type === ui.recordFilter);
    listEl.innerHTML = display.map(item => recordHTML(item.work, item.number)).join('');
    if (ui.recordFilter !== 'all') {
      $$('#recordList .record').forEach(el => {
        if (el.dataset.kind !== ui.recordFilter) el.hidden = true;
      });
    }
    $('#recordsEmpty').innerHTML = visible.length ? '' : emptyState('layers', '还没有这一类记录', '把看过的作品留在这里。', 'new-work', '添加作品');
  }

  function nowCardHTML(w) {
    const m = TYPES[w.type] || TYPES.book;
    const bg = w.backgroundImage || '';
    const bgStyle = bg ? ` style="background-image:url('${bg}')"` : '';
    const startLabel = w.startedAt ? '已开始' : '';
    return `<article class="now-card${bg ? ' has-bg' : ''}" data-id="${w.id}" aria-label="${esc(w.title)}" style="--c1:${m.c1};--c2:${m.c2}">
      ${bg ? `<div class="now-bg"${bgStyle}></div>` : `<div class="now-glyph">${esc(w.title.slice(0, 1))}</div>`}
      <div class="now-scrim"></div>
      <button class="now-edit" data-action="edit-card-bg" data-id="${w.id}" aria-label="更换卡片图片"><svg class="icon"><use href="#i-edit"/></svg></button>
      <div class="now-content">
        <div class="now-meta"><span class="now-kind">${esc(m.label)}</span>${startLabel ? `<span class="now-start">${startLabel}</span>` : ''}</div>
        <div class="now-title">${esc(w.title)}</div>
        <button class="now-cta" data-action="quick-note" data-id="${w.id}">记一笔<svg class="icon"><use href="#i-plus"/></svg></button>
      </div>
    </article>`;
  }

  function bindNowCarousel() {
    const carousel = $('#nowCarousel');
    if (!carousel) return;
    carousel.onscroll = () => {
      const cards = carousel.children;
      const count = cards.length;
      if (!count) return;
      // 豆瓣式居中吸附：找离可视区中心最近的卡片
      const center = carousel.scrollLeft + carousel.clientWidth / 2;
      let index = 0, best = Infinity;
      for (let i = 0; i < count; i++) {
        const el = cards[i];
        const mid = el.offsetLeft + el.offsetWidth / 2;
        const d = Math.abs(mid - center);
        if (d < best) { best = d; index = i; }
      }
      $$('#nowDots .now-dot').forEach((dot, i) => dot.classList.toggle('active', i === index));
    };
    let tap = null;
    carousel.addEventListener('pointerdown', e => {
      if (e.target.closest('button')) { tap = null; return; }
      const card = e.target.closest('.now-card');
      if (!card) { tap = null; return; }
      tap = { x: e.clientX, y: e.clientY, id: card.dataset.id, el: card, moved: false };
    });
    carousel.addEventListener('pointermove', e => {
      if (!tap) return;
      if (Math.abs(e.clientX - tap.x) > 8 || Math.abs(e.clientY - tap.y) > 8) tap.moved = true;
    });
    carousel.addEventListener('pointerup', () => {
      if (!tap) return;
      const current = tap;
      tap = null;
      // 点击卡片 → 跳作品详情页（不再唤起背景图选择）
      if (!current.moved) openDetail(current.id, current.el);
    });
    carousel.addEventListener('pointercancel', () => { tap = null; });
  }

  function recordHTML(w, number) {
    const m = TYPES[w.type] || TYPES.book;
    return `<article class="record${w.pinnedAt ? ' pinned' : ''}" data-action="open-detail" data-id="${w.id}" data-kind="${esc(w.type)}" tabindex="0" role="button">
      ${w.pinnedAt ? `<span class="pin-badge" aria-label="已置顶">${icon('bookmark')}</span>` : ''}
      <span class="record-index">${pad2(number)}</span>
      ${coverHTML(w)}
      <div class="record-main">
        <div class="record-top">
          <h3 class="record-title">${esc(w.title)}</h3>
          <span class="record-rating">${SCORE_STAR}${esc(ratingText(w.rating))}<small>/10</small></span>
        </div>
        <div class="record-meta">
          <span class="record-kind"><i class="kind-dot" style="--kind-color:${m.dot}"></i>${m.label}</span>
          <span class="dot-sep"></span><span>${esc(fmtDate(w.date))}</span>
        </div>
        <p class="record-thought">${esc(previewText(w))}</p>
      </div>
    </article>`;
  }

  // ── rendering: wishlist ─────────────────────────────────
  function renderWishlist() {
    const wishes = wishWorks();
    const waiting = wishes.filter(w => !w.done).length;
    const done = wishes.filter(w => w.done).length;
    $('#wishStats').innerHTML = `<b>${waiting}</b> 部待看<span class="dot-sep"></span><b>${done}</b> 部已看完`;

    const types = wishTypes();
    if (ui.wishFilter !== 'all' && !types.includes(ui.wishFilter)) ui.wishFilter = 'all';
    const filters = [{ key: 'all', label: '全部' }, ...types.map(type => ({ key: type, label: TYPES[type].label }))];
    $('#wishFilters').innerHTML = filters.map(f =>
      `<button class="filter${ui.wishFilter === f.key ? ' active' : ''}" data-wish-type="${f.key}">${esc(f.label)}</button>`
    ).join('');
    WISH_BLOB.place(true); // v2.4.1：与首页筛选栏同一套水滴
    renderDiscover();      // 阶段4：发现条跟着筛选与数据一起更新

    if (!wishes.length) {
      $('#wishGroups').innerHTML = '';
      $('#wishEmpty').innerHTML = emptyState('bookmark', '想看清单还是空的', '遇到感兴趣的作品，先把它留在这里。', 'new-wish', '添加想看');
      return;
    }
    $('#wishEmpty').innerHTML = '';

    const visibleTypes = ui.wishFilter === 'all' ? types : [ui.wishFilter];
    $('#wishGroups').innerHTML = visibleTypes.map(type => {
      const items = wishes.filter(w => w.type === type);
      const tagMap = new Map();
      items.forEach(w => {
        const tag = tagOf(w);
        if (!tagMap.has(tag)) tagMap.set(tag, []);
        tagMap.get(tag).push(w);
      });
      const tags = Array.from(tagMap.entries()).map(([tag, tagItems]) => ({
        tag,
        items: tagItems.slice().sort((a, b) =>
          Number(!!a.done) - Number(!!b.done) ||
          String(b.addedAt || '').localeCompare(String(a.addedAt || ''))
        )
      }));
      tags.sort((a, b) => {
        const aDoneOnly = a.items.every(w => w.done) ? 1 : 0;
        const bDoneOnly = b.items.every(w => w.done) ? 1 : 0;
        return aDoneOnly - bDoneOnly;
      });
      return `<div class="wish-type-group">
        <div class="wish-type-head"><h2>${TYPES[type].label}</h2><span>${pad2(items.length)}</span><i></i></div>
        ${tags.map(g => `<div class="tag-block">
          <div class="tag-head">${esc(g.tag)}<span>${pad2(g.items.length)}</span></div>
          ${g.items.map(wishHTML).join('')}
        </div>`).join('')}
      </div>`;
    }).join('');
  }

  function wishHTML(w) {
    return `<article class="wish${w.done ? ' done' : ''}" data-id="${w.id}">
      <button class="check" data-action="toggle-wish" data-id="${w.id}" aria-pressed="${w.done ? 'true' : 'false'}" aria-label="${w.done ? '取消已看完' : '标记为已看完'}">${icon('check')}</button>
      <div class="wish-main" data-action="open-detail" data-id="${w.id}" tabindex="0" role="button">
        <h3 class="wish-title">${esc(w.title)}${w.done ? '<span class="done-mark">已看完</span>' : ''}</h3>
        <div class="wish-meta"><span>${esc(fmtShort(w.done ? (w.finishedAt || w.addedAt) : w.addedAt))}</span></div>
        ${w.why ? `<p class="wish-why">${esc(w.why)}</p>` : ''}
      </div>
    </article>`;
  }

  // ══════════════════════════════════════════════════════════════════
  // 阶段4 · 轻量发现：今日灵感（本地规则）+ 随手一抽
  //
  // 数据来源只有一个：wishWorks() 里 status==='wish' && !done 的作品，
  // 以及它们自己的 title / creator / type / tag / why / addedAt / notes。
  //   · 不新建任何作品记录（「开始记录」是 status 就地改成 reading）；
  //   · 不推断偏好：所有文案都能在数据里指认（你写过什么、放了几天），
  //     绝不写「根据你的喜好」这类系统其实没有记录的话；
  //   · 不签到、不计分、不连续打卡。
  // 今日灵感用日期做种子 → 同一天稳定、第二天换；随手一抽是即时的。
  // ══════════════════════════════════════════════════════════════════
  function wishAddedISO(w) {
    if (w.addedAt) return w.addedAt;
    if (w.createdAt) {
      const d = new Date(w.createdAt);
      if (!Number.isNaN(d.getTime())) {
        const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
        return local.toISOString().slice(0, 10);
      }
    }
    return '';
  }

  // 待体验池：已标记「看完」的不算待体验；跟随当前类型筛选（= 类型过滤）
  function wishPool() {
    return wishWorks().filter(w => !w.done && (ui.wishFilter === 'all' || w.type === ui.wishFilter));
  }

  // 日期种子（FNV-1a）：同一天同一盐值结果固定，不需要任何存储
  function daySeed(salt) {
    const s = todayISO() + '|' + salt;
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }

  // 本地规则打分：写过理由 > 放得久 > 已有笔记；同分先挑放得更久的
  function inspireRank(pool) {
    return pool.map(w => {
      const iso = wishAddedISO(w);
      const days = iso ? daysSince(iso) : 1;
      let score = 0;
      if (w.why) score += 2;
      if ((w.notes || []).length) score += 1;
      if (days >= 30) score += 3; else if (days >= 14) score += 2; else if (days >= 7) score += 1;
      return { w, score, days };
    }).sort((a, b) => b.score - a.score || a.days - b.days || String(a.w.id).localeCompare(String(b.w.id)));
  }

  function dailyWish(pool) {
    const ranked = inspireRank(pool);
    if (!ranked.length) return null;
    const top = ranked.slice(0, Math.min(3, ranked.length));
    return top[daySeed('inspire') % top.length].w;
  }

  // 理由只用真实字段拼：引用用户自己写的理由、算真实天数、数同类数量
  function pickReason(w, pool) {
    const bits = [];
    const why = String(w.why || '').replace(/\s+/g, ' ').trim();
    if (why) bits.push('你写过「' + (why.length > 26 ? why.slice(0, 26) + '…' : why) + '」');
    const iso = wishAddedISO(w);
    if (iso) {
      const days = daysSince(iso);
      bits.push(days > 1 ? '在清单里放了 ' + days + ' 天' : '今天刚加进来');
    }
    const same = pool.filter(x => x.id !== w.id && x.type === w.type).length;
    if (same) bits.push('同类还有 ' + same + ' 部待看');
    return bits.length ? bits.join(' · ') : '还没有为它写过什么，正好从今天开始';
  }

  function renderDiscover() {
    const bar = $('#discoverBar');
    if (!bar) return;
    const waiting = wishWorks().filter(w => !w.done);
    const pool = wishPool();
    const m = ui.wishFilter === 'all' ? null : TYPES[ui.wishFilter];

    // 待看池空了就收起面板，别留着上一次的残影
    if (ui.pickId && !pool.some(w => w.id === ui.pickId)) { ui.pickId = null; ui.pickSource = ''; }

    if (!waiting.length) {
      bar.innerHTML =
        `<span class="discover-kicker">${icon('spark')}发现</span>
         <span class="discover-note">想看的还是空的，先留一部进去</span>
         <button class="discover-btn" data-action="new-wish">添加想看</button>`;
      renderPick();
      return;
    }

    if (!pool.length) {
      bar.innerHTML =
        `<span class="discover-kicker">${icon('spark')}发现</span>
         <span class="discover-note">${m ? '这一类' : '当前'}没有待看的了 · 全部还有 ${waiting.length} 部</span>
         <button class="discover-btn" data-action="discover-all">看全部</button>`;
      renderPick();
      return;
    }

    const daily = dailyWish(pool);
    bar.innerHTML =
      `<button class="discover-main" data-action="discover-inspire">
         <span class="discover-kicker">${icon('spark')}今日灵感</span>
         <span class="discover-title">${esc(daily.title)}</span>
         <span class="discover-sub">${esc(pickReason(daily, pool))}</span>
       </button>
       <button class="discover-roll" data-action="discover-roll" aria-label="从待看里随机抽一部">抽一部</button>`;
    renderPick();
  }

  function renderPick() {
    const panel = $('#discoverPick');
    if (!panel) return;
    const pool = wishPool();
    const w = ui.pickId ? pool.find(x => x.id === ui.pickId) : null;
    if (!w) {
      panel.hidden = true;
      panel.innerHTML = '';
      panel.dataset.pickId = '';
      return;
    }

    const m = TYPES[w.type] || TYPES.book;
    const tag = tagOf(w);
    const meta = [w.creator, tag === UNCATEGORIZED_TAG ? '' : tag].filter(Boolean).map(esc).join(' · ');
    const src = ui.pickSource === 'inspire'
      ? '来自你的待看 · 本地规则挑的，不是 AI 推测'
      : '来自你的待看 · 本地随机抽的，不是 AI 推测';
    const listLabel = (m ? m.label : '全部') + ' ' + pool.length + ' 部';

    const first = panel.hidden || panel.dataset.pickId !== w.id;
    panel.hidden = false;
    panel.innerHTML =
      `<div class="pick-inner">
         <div class="pick-head">
           <span class="pick-kicker">${ui.pickSource === 'inspire' ? '今日灵感' : '随手一抽'} · ${esc(m.label)}</span>
           <button class="pick-close" data-action="discover-close" aria-label="收起">${icon('close')}</button>
         </div>
         <div class="pick-body">
           ${coverHTML(w, 'pick-cover')}
           <div class="pick-info">
             <h3 class="pick-title">${esc(w.title)}</h3>
             ${meta ? `<p class="pick-meta">${meta}</p>` : ''}
             <p class="pick-why">${esc(pickReason(w, pool))}</p>
           </div>
         </div>
         <div class="pick-actions">
           <button class="pick-btn" data-action="discover-detail" data-id="${w.id}">看详情</button>
           <button class="pick-btn is-primary" data-action="discover-start" data-id="${w.id}">开始记录</button>
           <button class="pick-btn is-ghost" data-action="discover-roll">换一个</button>
         </div>
         <p class="pick-src">${esc(src)} · ${esc(listLabel)}</p>
       </div>`;
    panel.dataset.pickId = w.id;

    // 只在「换了一条」时做一次轻推入（transform + opacity，180ms），可被系统减弱动效覆盖
    if (first && dragMotionOK()) {
      panel.animate(
        [{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }],
        { duration: 180, easing: 'cubic-bezier(.22,.9,.26,1)' }
      );
    }
  }

  // 抽选：统一入口。inspire 用日期种子，roll 即时随机且避开手上这一条
  function drawWish(kind) {
    const pool = wishPool();
    if (!pool.length) { toast('这部待看里没有可挑的了'); return null; }
    let w;
    if (kind === 'inspire') {
      w = dailyWish(pool);
    } else {
      const others = pool.filter(x => x.id !== ui.pickId);
      const list = others.length ? others : pool;
      w = list[Math.floor(Math.random() * list.length)] || list[0];
    }
    if (!w) return null;
    ui.pickId = w.id;
    ui.pickSource = kind === 'inspire' ? 'inspire' : 'roll';
    renderPick();
    buzzer(6);
    return w;
  }

  // ── rendering: reading ──────────────────────────────────
  function renderReading() {
    const reading = readingWorks();
    const avg = reading.length
      ? Math.round(reading.reduce((sum, w) => sum + daysSince(w.startedAt), 0) / reading.length)
      : 0;
    $('#readingStats').innerHTML = reading.length
      ? `<b>${reading.length}</b> 部进行中<span class="dot-sep"></span>平均 ${avg} 天`
      : `<b>0</b> 部进行中`;

    if (!reading.length) {
      ui.readingId = null;
      $('#readerSwitcher').innerHTML = '';
      $('#readingContent').innerHTML = emptyState('reading', '目前没有正在看的作品', '开始一部作品，就可以随时记下感想。', 'new-reading', '开始在看');
      return;
    }
    if (!reading.some(w => w.id === ui.readingId)) ui.readingId = reading[0].id;

    $('#readerSwitcher').innerHTML = reading.length > 1
      ? `<div class="reader-switch">${reading.map(w => `<button class="reader-pill${w.id === ui.readingId ? ' active' : ''}" data-action="select-reader" data-id="${w.id}">${coverHTML(w)}<span>${esc(w.title)}</span></button>`).join('')}</div>`
      : '';
    READER_BLOB.place(true); // v2.4.1：切换在看作品时水滴吸附过去

    const w = getWork(ui.readingId);
    if (!w) return;
    const m = TYPES[w.type] || TYPES.book;
    const notes = sortedNotes(w);
    $('#readingContent').innerHTML = `
      <div class="current-card">
        <button class="current-menu" data-action="open-actions" data-id="${w.id}" aria-label="作品更多操作">${icon('more')}</button>
        <div class="current-main" data-action="open-detail" data-id="${w.id}" tabindex="0" role="button">
          ${coverHTML(w, 'lg')}
          <div class="current-info">
            <div class="current-label">第 ${daysSince(w.startedAt)} 天</div>
            <h2 class="current-title">${esc(w.title)}</h2>
            <p class="current-creator">${esc(w.creator || m.label)} · ${m.label}</p>
          </div>
        </div>
        <div class="current-foot">
          <span>${esc(fmtDate(w.startedAt))}</span>
          <button class="finish-btn" data-action="finish-work" data-id="${w.id}">标记看完${icon('check')}</button>
        </div>
      </div>
      <div class="composer">
        <div class="composer-head"><span class="composer-title">随手记</span><span class="composer-now">此刻</span></div>
        <textarea id="readingNoteInput" maxlength="1000" placeholder="此刻，想到什么？"></textarea>
        <div class="preview-images" id="readingImagePreview">${draftImagesHTML(ui.readingDraftImages)}</div>
        <div class="composer-foot">
          <div class="tag-row">
            <button class="tag-btn" data-reading-tag="摘抄">摘抄</button>
            <button class="tag-btn" data-reading-tag="想法">想法</button>
          </div>
          <div class="composer-tools">
            <button class="attach-btn" data-action="add-reading-note-images" aria-label="添加图片">${icon('image')}</button>
            <button class="send-btn" data-action="send-reading-note" aria-label="保存这条感想">${icon('arrow-up')}</button>
          </div>
        </div>
      </div>
      <div class="section-head">
        <h2 class="section-title">感想<span class="count">${notes.length} 条</span></h2>
      </div>
      ${notes.length
        ? `<ol class="notes">${notes.map(n => noteHTML(n, w.id)).join('')}</ol>`
        : ''}
    `;
  }

  // ── rendering: detail ───────────────────────────────────
  // 详情页纵向结构：图片 → 名称/类型/日期 → 评分 → 快速感想 → 时间线 → 编辑入口
  const DEFAULT_THEME = {
    bg: '#E9EEF8', bgRgb: '233,238,248', fg: '#1E222B', soft: 'rgba(30,34,43,.55)',
    hair: 'rgba(30,34,43,.16)', chip: 'rgba(255,255,255,.55)', accent: '#5872C6', dark: false,
    ink: '#3B4250', card: 'rgba(255,255,255,.58)', cardLine: 'rgba(30,34,43,.10)',
    glass: 'rgba(255,255,255,.44)', glassLine: 'rgba(255,255,255,.86)', glassHi: 'rgba(255,255,255,.92)',
    line: 'rgba(120,140,190,.45)', lineStrong: 'rgba(120,140,190,.62)', accentSoft: 'rgba(88,114,198,.10)'
  };
  const themeCache = new Map();
  let themeToken = 0;
  let rawDetailTheme = null; // v2.2.2：记住封面算出的原始主题，切主题时可立即重绘

  function clampNum(n, min, max) { return Math.max(min, Math.min(max, n)); }

  function hslToRgb(h, s, l) {
    const hue = ((h % 360) + 360) % 360 / 360;
    if (!s) { const v = Math.round(l * 255); return [v, v, v]; }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const chan = t => {
      let x = (t + 1) % 1;
      if (x < 1 / 6) return p + (q - p) * 6 * x;
      if (x < 1 / 2) return q;
      if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
      return p;
    };
    return [Math.round(chan(hue + 1 / 3) * 255), Math.round(chan(hue) * 255), Math.round(chan(hue - 1 / 3) * 255)];
  }
  function relLum(rgb) {
    const f = c => { const v = c / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]);
  }
  const rgbCss = rgb => `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
  const rgbaCss = (rgb, a) => `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;

  // 在客户端采样图片主色（不上传任何数据）
  function analyzeImage(img) {
    const N = 24;
    const canvas = document.createElement('canvas');
    canvas.width = N; canvas.height = N;
    let ctx = null;
    try { ctx = canvas.getContext('2d', { willReadFrequently: true }); } catch (e) { ctx = canvas.getContext('2d'); }
    if (!ctx) return null;
    const iw = img.naturalWidth || img.width;
    const ih = img.naturalHeight || img.height;
    if (!iw || !ih) return null;
    const side = Math.min(iw, ih);
    try {
      ctx.drawImage(img, (iw - side) / 2, (ih - side) / 2, side, side, 0, 0, N, N);
    } catch (e) { return null; }
    let data;
    try { data = ctx.getImageData(0, 0, N, N).data; } catch (e) { return null; }
    const buckets = new Map();
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
      if (a < 150) continue;
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
      const sat = mx ? (mx - mn) / mx : 0;
      if (l > 0.955 || l < 0.05) continue;
      const key = (r >> 4) + ',' + (g >> 4) + ',' + (b >> 4);
      let e = buckets.get(key);
      if (!e) { e = { r: 0, g: 0, b: 0, w: 0 }; buckets.set(key, e); }
      const weight = 0.4 + sat * 2.1 + (1 - Math.abs(l - 0.5) * 1.6) * 0.5;
      e.r += r * weight; e.g += g * weight; e.b += b * weight; e.w += weight;
    }
    // 图片底边的平均色：用于让下方纯色背景与图像衔接得更自然
    let er = 0, eg = 0, eb = 0, ew = 0;
    for (let y = Math.max(0, N - 7); y < N; y++) {
      for (let x = 0; x < N; x++) {
        const idx = (y * N + x) * 4;
        if (data[idx + 3] < 150) continue;
        er += data[idx]; eg += data[idx + 1]; eb += data[idx + 2]; ew++;
      }
    }
    if (!ew) { er = eg = eb = 0; ew = 1; }
    const edge = [er / ew, eg / ew, eb / ew];

    let best = null;
    buckets.forEach(e => { if (!best || e.w > best.w) best = e; });
    if (!best || !best.w) return null;
    const r = best.r / best.w, g = best.g / best.w, b = best.b / best.w;
    const rn = r / 255, gn = g / 255, bn = b / 255;
    const mx = Math.max(rn, gn, bn), mn = Math.min(rn, gn, bn);
    const l = (mx + mn) / 2;
    const d = mx - mn;
    let s = 0, h = 0;
    if (d > 0.0001) {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
      else if (mx === gn) h = ((bn - rn) / d + 2) * 60;
      else h = ((rn - gn) / d + 4) * 60;
    }
    return { h, s, l, edge };
  }

  // 由主色推出「纯色背景 + 文字色」，浅色/深色图片都能保证可读
  function themeFromHsl(t) {
    if (!t || !Number.isFinite(t.h)) return { ...DEFAULT_THEME };
    // 与底边颜色混合，避免图片底部与背景色相差过大形成一道明显色带
    if (Array.isArray(t.edge)) {
      const dom = hslToRgb(t.h, t.s, t.l);
      const mix = [0, 1, 2].map(i => dom[i] * 0.62 + t.edge[i] * 0.38);
      const eMx = Math.max(mix[0], mix[1], mix[2]) / 255, eMn = Math.min(mix[0], mix[1], mix[2]) / 255;
      const eL = (eMx + eMn) / 2, eD = eMx - eMn;
      if (eD > 0.02) {
        const eS = eL > 0.5 ? eD / (2 - eMx - eMn) : eD / (eMx + eMn);
        const rn = mix[0] / 255, gn = mix[1] / 255, bn = mix[2] / 255;
        let eh = 0;
        if (eMx === rn) eh = ((gn - bn) / eD + (gn < bn ? 6 : 0)) * 60;
        else if (eMx === gn) eh = ((bn - rn) / eD + 2) * 60;
        else eh = ((rn - gn) / eD + 4) * 60;
        t = { h: eh, s: Math.max(t.s, eS), l: eL };
      }
    }
    const deep = t.l < 0.55;
    // 主色过灰时用蓝灰基调，避免背景变成惨白
    const hue = t.s < 0.06 ? 220 : t.h;
    const sat = deep ? clampNum(t.s * 0.7, 0.16, 0.36) : clampNum(t.s * 0.9 + 0.10, 0.18, 0.50);
    const light = deep ? clampNum(0.18 + t.l * 0.34, 0.18, 0.34) : clampNum(0.84 - (t.l - 0.55) * 0.12, 0.74, 0.85);
    const bgRgb = hslToRgb(hue, sat, light);
    const darkText = relLum(bgRgb) > 0.32;
    const fgRgb = darkText ? [28, 32, 41] : [246, 247, 251];
    const inkRgb = darkText ? [56, 63, 78] : [234, 237, 245];
    return {
      bg: rgbCss(bgRgb),
      bgRgb: bgRgb.join(','),
      fg: rgbCss(fgRgb),
      soft: rgbaCss(fgRgb, darkText ? 0.55 : 0.68),
      hair: rgbaCss(fgRgb, darkText ? 0.16 : 0.22),
      chip: darkText ? 'rgba(255,255,255,.55)' : 'rgba(255,255,255,.14)',
      accent: rgbCss(hslToRgb(hue, clampNum(t.s * 0.8 + 0.12, 0.28, 0.62), darkText ? 0.46 : 0.78)),
      dark: !darkText,
      ink: rgbCss(inkRgb),
      card: darkText ? 'rgba(255,255,255,.58)' : 'rgba(255,255,255,.09)',
      cardLine: darkText ? 'rgba(30,34,43,.10)' : 'rgba(255,255,255,.16)',
      glass: darkText ? 'rgba(255,255,255,.46)' : 'rgba(255,255,255,.14)',
      glassLine: darkText ? 'rgba(255,255,255,.9)' : 'rgba(255,255,255,.28)',
      glassHi: darkText ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.22)',
      line: darkText ? rgbaCss([120, 140, 190], 0.45) : rgbaCss([255, 255, 255], 0.22),
      lineStrong: darkText ? rgbaCss([120, 140, 190], 0.62) : rgbaCss([255, 255, 255], 0.34),
      accentSoft: darkText ? 'rgba(88,114,198,.10)' : 'rgba(255,255,255,.13)'
    };
  }

  // v2.2.2：深色主题下，详情页不再跟随封面翻成浅色。
  // 保留「封面优先」的构图，但底色统一压到石墨，钴蓝仅作高光与强调。
  function darkenDetailTheme() {
    return {
      bg: '#11151B', bgRgb: '17,21,27',
      fg: '#E9ECF2', soft: 'rgba(233,236,242,.62)',
      hair: '#303744', chip: 'rgba(255,255,255,.08)',
      accent: '#8298E8', dark: true, ink: '#9CA6B5',
      card: 'rgba(26,32,41,.82)', cardLine: '#303744',
      glass: 'rgba(17,21,27,.66)', glassLine: 'rgba(233,236,242,.14)', glassHi: 'rgba(233,236,242,.20)',
      line: 'rgba(233,236,242,.12)', lineStrong: 'rgba(233,236,242,.22)',
      accentSoft: 'rgba(130,152,232,.14)'
    };
  }
  function applyDetailTheme(theme) {
    const page = $('#detailPage');
    if (!page) return;
    const t = appThemeIsDark() ? darkenDetailTheme() : (theme || DEFAULT_THEME);
    page.classList.toggle('dt-dark', !!t.dark);
    page.style.setProperty('--dt-bg', t.bg);
    page.style.setProperty('--dt-bg-rgb', t.bgRgb || '233,238,248');
    page.style.setProperty('--dt-fg', t.fg);
    page.style.setProperty('--dt-soft', t.soft);
    page.style.setProperty('--dt-hair', t.hair);
    page.style.setProperty('--dt-chip', t.chip);
    page.style.setProperty('--dt-accent', t.accent);
    page.style.setProperty('--dt-ink', t.ink || '#3B4250');
    page.style.setProperty('--dt-card', t.card || 'rgba(255,255,255,.58)');
    page.style.setProperty('--dt-card-line', t.cardLine || 'rgba(30,34,43,.10)');
    page.style.setProperty('--dt-glass', t.glass || 'rgba(255,255,255,.44)');
    page.style.setProperty('--dt-glass-line', t.glassLine || 'rgba(255,255,255,.86)');
    page.style.setProperty('--dt-glass-hi', t.glassHi || 'rgba(255,255,255,.92)');
    page.style.setProperty('--dt-line', t.line || 'rgba(120,140,190,.45)');
    page.style.setProperty('--dt-line-strong', t.lineStrong || 'rgba(120,140,190,.62)');
    page.style.setProperty('--dt-accent-soft', t.accentSoft || 'rgba(88,114,198,.10)');
  }

  function syncDetailTheme(src) {
    const token = ++themeToken;
    if (!src) { rawDetailTheme = null; applyDetailTheme(null); return; }
    if (themeCache.has(src)) { rawDetailTheme = themeCache.get(src); applyDetailTheme(rawDetailTheme); return; }

    const finish = theme => {
      if (themeCache.size > 48) themeCache.clear();
      themeCache.set(src, theme);
      rawDetailTheme = theme;
      if (token === themeToken) applyDetailTheme(theme);
    };

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let theme = null;
      try { theme = themeFromHsl(analyzeImage(img)); } catch (e) { theme = null; }
      finish(theme);
    };
    img.onerror = () => { if (token === themeToken) applyDetailTheme(null); };

    // 远程封面（QQ 曲库等）跨域会污染 canvas 导致取色失败：先走原生桥转 base64 再采样
    if (/^https?:/i.test(src)) {
      const b = bridge();
      if (b && b.httpGetImage) {
        bridgeImage(src).then(dataUrl => {
          if (token !== themeToken) return;
          if (!dataUrl) { img.src = src; return; }
          const img2 = new Image();
          img2.onload = () => {
            let t = null;
            try { t = themeFromHsl(analyzeImage(img2)); } catch (e) { t = null; }
            finish(t);
          };
          img2.onerror = () => { if (token === themeToken) applyDetailTheme(null); };
          img2.src = dataUrl;
        });
        return;
      }
    }
    img.src = src;
  }

  function applySlideTheme(slide, work) {
    if (slide && slide.kind === 'img') { syncDetailTheme(slide.src); return; }
    themeToken++;
    rawDetailTheme = artTheme(work);
    applyDetailTheme(rawDetailTheme);
  }

  function buildSlides(work) {
    if (Array.isArray(work.images) && work.images.length) {
      return work.images.map(src => ({ kind: 'img', src }));
    }
    if (work.icon) return [{ kind: 'img', src: work.icon }];
    return [{ kind: 'art', html: defaultArt(work) }];
  }

  // 没有图片时用类型自带插画的基调做背景，保证插画与纯色背景衔接自然
  const TYPE_TINT = { book: '#C6D3E4', comic: '#C3D3C8', film: '#16333A', game: '#A9BEE0', album: '#3B3D6B' };
  function hexToHsl(hex) {
    const s = String(hex).replace('#', '');
    const r = parseInt(s.slice(0, 2), 16) / 255;
    const g = parseInt(s.slice(2, 4), 16) / 255;
    const b = parseInt(s.slice(4, 6), 16) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const l = (mx + mn) / 2, d = mx - mn;
    let sat = 0, hue = 0;
    if (d > 0.0001) {
      sat = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) hue = ((g - b) / d + (g < b ? 6 : 0)) * 60;
      else if (mx === g) hue = ((b - r) / d + 2) * 60;
      else hue = ((r - g) / d + 4) * 60;
    }
    return { h: hue, s: sat, l };
  }
  function artTheme(work) {
    return themeFromHsl(hexToHsl(TYPE_TINT[work.type] || '#C6D3E4'));
  }

  function heroSlideHTML(slide, work) {
    if (slide.kind === 'img') return `<img src="${esc(slide.src)}" alt="">`;
    return `<div class="dt-art">${slide.html}</div>
      <button class="dt-art-cta" data-action="import-images" data-id="${work.id}">
        ${icon('image')}<span>导入图片</span>
      </button>`;
  }

  // ── 阶段2 · 详情页沉浸式展开（卡片本身长成整页） ──────────────────
  // 加号为什么顺？因为它是「纯色块 + transform:scale()」——只碰合成属性，
  // 主线程再忙也不会掉帧。详情页此前是给整页做 scale(.62→1)，
  // 整页（含大图与滚动容器）每一帧都要按新比例重新光栅化，越放大越贵，所以发涩。
  //
  // 幕布形状：一开始是被点卡片自己的圆角矩形（宽高 = 卡片宽高），
  // 然后两轴非等比拉长到整页（卡片 350×92 → 390×844，主要是纵向长出去），
  // 视觉上就是「这张卡被拉开成了详情页」，而不是一颗圆点炸开。
  // 代价：非等比缩放下 border-radius 会被拉成椭圆，所以圆角要做反向补偿
  // （x 轴半径 / sx，y 轴半径 / sy），并随展开一起收到 0，交棒时才是方的整页。
  const DT_CURTAIN_MS = 360;
  const DT_CLOSE_MS = 300;   // 收起比展开快一档：退出用 ease-in，不让人等
  const DT_CARD_RADIUS = 16; // 卡片圆角兜底值，实际取源元素的计算样式

  let dtSeq = 0;
  let dtTimers = [];
  // 打开时的来源几何（被点卡片的中心 + 半径）。收起时反向收回这里，
  // 而不是回到屏幕中心——「卡片成为详情页」这个隐喻才不会在关闭时断掉。
  let dtOrigin = null;

  function dtMotionOK() {
    try { return !matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return true; }
  }

  function dtClearTimers() {
    dtTimers.forEach(clearTimeout);
    dtTimers = [];
  }

  function dtCurtain() {
    const page = $('#detailPage');
    if (!page) return null;
    let el = page.querySelector('.dt-curtain');
    if (!el) {
      el = document.createElement('div');
      el.className = 'dt-curtain';
      el.setAttribute('aria-hidden', 'true');
      page.insertBefore(el, page.firstChild);
    }
    return el;
  }

  // 幕布几何：起手矩形 = 被点卡片的矩形（相对详情页）。
  // 幕布元素本身固定为「整页大小」，靠 transform-origin + 非等比 scale 收到卡片的位置与尺寸，
  // 这样全程只动 transform / border-radius，不触发布局。
  function dtGeometry(srcEl) {
    const page = $('#detailPage');
    if (!page) return null;
    const pr = page.getBoundingClientRect();
    if (!pr.width || !pr.height) return null;

    const r = srcEl && srcEl.getBoundingClientRect ? srcEl.getBoundingClientRect() : null;
    const hasCard = !!(r && r.width > 8 && r.height > 8);
    // 没有来源卡片（深链、刷新后直接进详情）就退化成屏幕中上部一块横向小卡
    const w0 = hasCard ? clampNum(r.width, 8, pr.width) : pr.width * 0.66;
    const h0 = hasCard ? clampNum(r.height, 8, pr.height) : pr.height * 0.14;
    const x0 = hasCard
      ? clampNum(r.left - pr.left, 0, Math.max(0, pr.width - w0))
      : (pr.width - w0) / 2;
    const y0 = hasCard
      ? clampNum(r.top - pr.top, 0, Math.max(0, pr.height - h0))
      : pr.height * 0.42 - h0 / 2;

    let radius = DT_CARD_RADIUS;
    if (hasCard) {
      try {
        const cs = getComputedStyle(srcEl);
        radius = parseFloat(cs.borderTopLeftRadius) || DT_CARD_RADIUS;
      } catch (e) { /* 读不到就用兜底值 */ }
    }

    const sx = clampNum(w0 / pr.width, 0.02, 1);
    const sy = clampNum(h0 / pr.height, 0.02, 1);

    return {
      w: pr.width, h: pr.height,
      sx, sy,
      // 缩放原点：scale 之后矩形要正好落在 (x0,y0,w0,h0) 上。
      // 缩放满足 left = ox·(1−sx)，所以 ox = x0/(1−sx)。
      // 之前拿卡片中心当原点：水平方向因为卡片居中碰巧成立，纵向就整体偏移（高处的卡片能差 20 多像素）。
      ox: x0 / Math.max(1 - sx, 0.02),
      oy: y0 / Math.max(1 - sy, 0.02),
      r: radius
    };
  }

  // expanded=true → 整页；false → 回到卡片矩形
  function dtPlaceCurtain(curtain, g, expanded, withTransition) {
    if (!curtain || !g) return;
    curtain.style.width = g.w + 'px';
    curtain.style.height = g.h + 'px';
    curtain.style.left = '0px';
    curtain.style.top = '0px';
    curtain.style.transformOrigin = g.ox + 'px ' + g.oy + 'px';
    curtain.style.transition = withTransition ? '' : 'none';
    curtain.style.transform = expanded ? 'scale(1,1)' : 'scale(' + g.sx + ',' + g.sy + ')';
    // 视觉圆角 = css 圆角 × 该轴缩放比，两轴缩放比不同 → 用「水平/垂直」双值圆角反向补偿，
    // 起手看上去才是和卡片一样的正圆角；展开过程中圆角同步收到 0，交棒给整页底不跳。
    curtain.style.borderRadius = expanded
      ? '0px'
      : (g.r / g.sx) + 'px / ' + (g.r / g.sy) + 'px';
  }

  function playDetailReveal(srcEl) {
    const page = $('#detailPage');
    if (!page) return;
    const g = dtGeometry(srcEl);
    if (!g) return;
    const curtain = dtCurtain();
    if (!curtain) return;

    dtClearTimers();
    const seq = ++dtSeq;
    dtOrigin = { id: ui.detailId, el: srcEl || null, g };

    // 起手：幕布贴在卡片上（同位置同圆角），内容原地隐身，详情页底色让位。
    // 幕布这一帧不能带过渡，否则会先看见它在上一轮的旧位置滑过来。
    dtPlaceCurtain(curtain, g, false, false);
    page.classList.remove('dt-show-content');
    void curtain.offsetWidth;                       // 让起手那帧先落定，过渡才会生效

    if (!dtMotionOK()) {
      page.classList.add('dt-reveal');
      dtPlaceCurtain(curtain, g, true, false);
      page.classList.remove('dt-reveal');
      return;
    }

    // 恢复过渡后再改：幕布淡入，卡片是「被吞进去」而不是被一块纯色瞬间替换
    dtPlaceCurtain(curtain, g, true, true);         // 拉长到整页，全程合成线程
    page.classList.add('dt-reveal');

    dtTimers.push(setTimeout(() => {
      if (seq !== dtSeq) return;
      page.classList.add('dt-show-content');
    }, 210));

    dtTimers.push(setTimeout(() => {
      if (seq !== dtSeq) return;
      page.classList.add('dt-quiet');                 // 底色 instant 切回实底
      page.classList.remove('dt-reveal', 'dt-show-content');
      dtPlaceCurtain(curtain, g, false, false);      // 实底已由页面背景接管，幕布收回卡片位
      dtTimers.push(setTimeout(() => page.classList.remove('dt-quiet'), 60));
    }, DT_CURTAIN_MS + 80));
  }

  // 收起时的目标矩形：优先取「现在还在页面上的同一张卡片」，
  // 数据变动 / 重排 / 转屏后位置才是准的；取不到再退回打开时的快照，
  // 最后才回退到屏幕中央的兜底框。
  function dtResolveOrigin() {
    if (!dtOrigin) return null;
    const sized = el => {
      if (!el || !el.isConnected || !el.getBoundingClientRect) return false;
      const r = el.getBoundingClientRect();
      return r.width > 4 && r.height > 4;
    };
    const id = dtOrigin.id;
    const cands = [dtOrigin.el];
    if (id) {
      ['.record', '.now-card', '.wish-main', '.current-main'].forEach(sel => {
        cands.push(document.querySelector(sel + '[data-id="' + id + '"]'));
      });
    }
    const hit = cands.find(sized);
    if (hit) {
      const g = dtGeometry(hit);
      if (g) return g;
    }
    // 卡片已经不在了（被筛掉 / 切了页 / 删了）：退回打开时的快照，再退到屏幕中央
    return dtOrigin.g || null;
  }

  function playDetailCollapse(onDone) {
    const page = $('#detailPage');
    if (!page) { onDone(); return; }
    const curtain = page.querySelector('.dt-curtain');
    if (!curtain || !dtMotionOK()) { onDone(); return; }
    const g = dtResolveOrigin() || dtGeometry(null);
    if (!g) { onDone(); return; }

    dtClearTimers();
    const seq = ++dtSeq;

    // 收起：内容淡掉的同时幕布缩回被点的那张卡片。
    // 幕布先固定在整页（不改，避免位置跳），再加 dt-closing —— 这条类负责把内容从 1 淡到 0 并给上过渡。
    dtPlaceCurtain(curtain, g, true, false);
    page.classList.add('dt-reveal', 'dt-closing');
    page.classList.remove('dt-show-content');
    void curtain.offsetWidth;
    dtPlaceCurtain(curtain, g, false, true);

    dtTimers.push(setTimeout(() => {
      if (seq !== dtSeq) return;
      page.classList.remove('dt-closing');
      onDone();
    }, DT_CLOSE_MS + 40));
  }

  function openDetail(id, srcEl) {
    const w = getWork(id);
    if (!w) return;
    const page = $('#detailPage');
    if (!page) return;
    const wasOpen = page.classList.contains('open') || page.classList.contains('dt-reveal');

    ui.detailId = id;
    ui.heroIndex = 0;
    ui.ratingEditing = false;
    renderDetail();

    if (wasOpen) {
      // 已打开（或正在收起）时换作品：不重播展开，直接落到终态，避免动画打架
      dtClearTimers();
      ++dtSeq;
      page.classList.remove('dt-reveal', 'dt-show-content', 'dt-closing', 'dt-quiet');
      const c = page.querySelector('.dt-curtain');
      if (c) { c.style.transition = 'none'; c.style.transform = 'scale(0)'; }
    }

    page.dataset.workId = id;
    page.classList.add('open');
    page.setAttribute('aria-hidden', 'false');
    $('#detailScroll').scrollTop = 0;
    if (!wasOpen) playDetailReveal(srcEl);
  }

  function detailSlide() {
    const w = getWork(ui.detailId);
    if (!w) return null;
    const slides = buildSlides(w);
    return slides[clampNum(ui.heroIndex, 0, slides.length - 1)] || slides[0] || null;
  }

  function renderDetail() {
    const w = getWork(ui.detailId);
    if (!w) { closeDetail(); return; }
    const scrollEl = $('#detailScroll');
    const keepTop = scrollEl ? scrollEl.scrollTop : 0;
    const slides = buildSlides(w);
    const idx = clampNum(ui.heroIndex, 0, slides.length - 1);
    ui.heroIndex = idx;

    const track = $('#heroTrack');
    track.innerHTML = slides.map((s, i) =>
      `<div class="hero-slide" data-slide="${i}">${heroSlideHTML(s, w)}</div>`).join('');

    $('#heroDots').innerHTML = slides.length > 1
      ? slides.map((_, i) => `<i class="${i === idx ? ' active' : ''}"></i>`).join('')
      : '';
    $('#detailHead').innerHTML = detailHeadHTML(w);
    $('#detailRating').innerHTML = detailRatingHTML(w);
    $('#detailSheet').innerHTML = detailBodyHTML(w);
    lingPlayRender(w);

    const trackEl = $('#heroTrack');
    trackEl.onscroll = () => {
      const count = trackEl.children.length;
      if (!count) return;
      const next = clampNum(Math.round(trackEl.scrollLeft / Math.max(1, trackEl.clientWidth)), 0, count - 1);
      if (next === ui.heroIndex) return;
      ui.heroIndex = next;
      $$('#heroDots i').forEach((dot, i) => dot.classList.toggle('active', i === next));
      applySlideTheme(slides[next], w);
    };

    applySlideTheme(slides[idx], w);

    requestAnimationFrame(() => {
      if (trackEl.clientWidth) trackEl.scrollLeft = idx * trackEl.clientWidth;
      if (scrollEl) scrollEl.scrollTop = keepTop;
      autosizeComposer();
    });
  }

  function detailHeadHTML(w) {
    const m = TYPES[w.type] || TYPES.book;
    const bits = [`<span>${esc(m.full || m.label)}</span>`];
    if (w.status === 'wish' && w.done) bits.push('<span>已看完</span>');
    if (w.creator) bits.push(`<span>${esc(w.creator)}</span>`);
    if (w.status === 'reading' && w.startedAt) bits.push(`<span>第 ${daysSince(w.startedAt)} 天</span>`);
    const date = workDateISO(w);
    if (date) bits.push(`<span>${esc(fmtDate(date))}</span>`);
    return `<h1 class="dt-title">${esc(w.title)}</h1>
      <p class="dt-meta">${bits.join('<i></i>')}</p>`;
  }

  function detailRatingHTML(w) {
    if (ui.ratingEditing) {
      const value = clampNum(Number(ui.ratingDraft) || 0, 0, 10);
      return `<div class="dt-rate-editor">
        <div class="dt-rate-live">
          ${icon('star', 'score-star')}
          <span class="dt-rate-num">${esc(ratingText(value))}</span>
          <span class="dt-rate-unit">/ 10</span>
        </div>
        <input class="dt-range" id="dtRange" type="range" min="0" max="10" step="0.1"
          value="${value}" style="--fill:${(value * 10).toFixed(1)}%" aria-label="十分制评分">
        <div class="dt-rate-actions">
          <button class="dt-btn" data-action="cancel-rating">取消</button>
          <button class="dt-btn solid" data-action="save-rating">保存评分</button>
        </div>
      </div>`;
    }
    const rated = w.rating !== null && w.rating !== undefined && w.rating !== '' && Number.isFinite(Number(w.rating));
    if (!rated) {
      return `<button class="dt-rate-empty" data-action="edit-rating">
        ${icon('star', 'score-star')}<span>尚未评分</span><b>打分</b>
      </button>`;
    }
    return `<button class="dt-rate" data-action="edit-rating" aria-label="修改评分">
      ${icon('star', 'score-star')}
      <span class="dt-rate-num">${esc(ratingText(w.rating))}</span>
      <span class="dt-rate-unit">/ 10</span>
      ${icon('pen', 'icon dt-rate-pen')}
    </button>`;
  }

  function detailBodyHTML(w) {
    const m = TYPES[w.type] || TYPES.book;
    const notes = noteList(w);
    const draft = getDraft(w.id);
    const tag = draft.tag === '摘抄' ? '摘抄' : '想法';

    const composer = `<div class="dt-compose">
      <textarea id="dtNoteInput" rows="1" maxlength="2000" placeholder="写下此刻的感想……">${esc(draft.text || '')}</textarea>
      <div class="preview-images" id="dtNotePreview">${draftImagesHTML(draft.images)}</div>
      <div class="dt-compose-foot">
        <div class="tag-row">
          <button class="tag-btn${tag === '想法' ? ' on' : ''}" data-dt-tag="想法">想法</button>
          <button class="tag-btn${tag === '摘抄' ? ' on' : ''}" data-dt-tag="摘抄">摘抄</button>
        </div>
        <div class="dt-compose-tools">
          <button class="attach-btn" data-action="add-dt-images" aria-label="给这条感想添加图片">${icon('image')}</button>
          <button class="dt-save-btn" data-action="save-dt-note">保存感想</button>
        </div>
      </div>
    </div>`;

    const wish = (w.status === 'wish' && String(w.why || '').trim())
      ? `<div class="dt-quote"><span>为什么想看</span><p>${esc(w.why)}</p></div>`
      : '';

    const timeline = notes.length
      ? `<ol class="dt-timeline">${notes.map((n, i) => timelineNoteHTML(n, w.id, i)).join('')}</ol>`
      : `<div class="dt-empty">还没有留下感想，写下你的第一条记录吧</div>`;

    let actions = '';
    if (w.status === 'wish') {
      actions = `<div class="work-actions">
        <button class="primary-btn" data-action="start-reading" data-id="${w.id}">开始${m.verb}</button>
        <button class="secondary-btn" data-action="edit-work" data-id="${w.id}">编辑</button>
      </div>`;
    } else if (w.status === 'reading') {
      actions = `<div class="work-actions">
        <button class="primary-btn" data-action="finish-work" data-id="${w.id}">标记看完</button>
        <button class="secondary-btn" data-action="edit-work" data-id="${w.id}">编辑</button>
      </div>`;
    } else {
      actions = `<div class="work-actions single"><button class="primary-btn" data-action="edit-work" data-id="${w.id}">编辑</button></div>`;
    }

    return `${wish}
      ${composer}
      <div class="dt-sec"><h2>感想</h2><span>${notes.length ? notes.length + ' 条' : ''}</span></div>
      ${timeline}
      ${actions}`;
  }

  function timelineNoteHTML(note, workId, index) {
    const text = String(note.text || '');
    const images = Array.isArray(note.images) ? note.images.filter(Boolean) : [];
    const shown = images.slice(0, 6);
    const imageHTML = shown.length
      ? `<div class="dt-note-images">${shown.map((src, i) =>
          `<button class="dt-note-image" data-action="view-image" data-work-id="${workId}" data-note-id="${note.id}" data-index="${i}" aria-label="查看第 ${i + 1} 张图片"><img src="${esc(src)}" alt=""></button>`
        ).join('')}${images.length > 6 ? `<span class="dt-note-more-img">+${images.length - 6}</span>` : ''}</div>`
      : '';
    return `<li class="dt-note${index === 0 ? ' latest' : ''}" data-note-id="${note.id}">
      <div class="dt-note-head">
        <time>${esc(fmtNoteTime(note.createdAt))}</time>
        <span class="dt-note-tag${note.tag === '摘抄' ? ' quote' : ''}">${esc(note.tag || '想法')}</span>
        ${note.editedAt ? '<span class="dt-note-edited">已编辑</span>' : ''}
        <button class="dt-note-menu" data-action="note-menu" data-work-id="${workId}" data-note-id="${note.id}" aria-label="这条感想的更多操作">${icon('more')}</button>
      </div>
      ${text ? `<p class="dt-note-text">${esc(text)}</p>` : ''}
      ${imageHTML}
    </li>`;
  }

  function autosizeComposer() {
    const el = $('#dtNoteInput');
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(142, Math.max(44, el.scrollHeight || 44));
    el.style.height = next + 'px';
  }

  function closeDetail(instant) {
    const page = $('#detailPage');
    if (!page) return;
    persistDrafts();
    // 业务状态立刻归零，视觉上的收起动画随后播——中途再点开会被 openDetail 接管
    ui.detailId = null;
    ui.ratingEditing = false;
    lingSyncStatusBar(true);
    page.setAttribute('aria-hidden', 'true');

    if (!page.classList.contains('open') || page.classList.contains('dt-closing')) return;

    const finish = () => {
      dtClearTimers();
      ++dtSeq;
      dtOrigin = null;
      page.classList.remove('open', 'dt-reveal', 'dt-show-content', 'dt-closing', 'dt-quiet');
      const c = page.querySelector('.dt-curtain');
      if (c) { c.style.transition = 'none'; c.style.transform = 'scale(0)'; }
    };
    if (instant || !dtMotionOK()) { finish(); return; }
    playDetailCollapse(finish);
  }

  // ── default artwork ─────────────────────────────────────
  function defaultArt(work) {
    const id = 'a' + String(work.id).replace(/[^a-zA-Z0-9]/g, '');
    switch (work.type) {
      case 'comic': return comicArt(id);
      case 'film': return filmArt(id);
      case 'game': return gameArt(id);
      case 'album': return albumArt(id, work.title);
      default: return bookArt(id);
    }
  }

  function bookArt(id) {
    return `<svg viewBox="0 0 390 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="${id}sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F8F3EA"/><stop offset=".58" stop-color="#E9E5F5"/><stop offset="1" stop-color="#CED9F0"/></linearGradient>
        <linearGradient id="${id}paper" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFFDF7"/><stop offset="1" stop-color="#E9E5DA"/></linearGradient>
        <radialGradient id="${id}sun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#F4D3C0" stop-opacity=".7"/><stop offset="1" stop-color="#F4D3C0" stop-opacity="0"/></radialGradient>
      </defs>
      <rect width="390" height="340" fill="url(#${id}sky)"/>
      <circle cx="288" cy="88" r="78" fill="url(#${id}sun)"/>
      <circle cx="288" cy="88" r="44" fill="#EFC8B6" opacity=".8"/>
      <path d="M0 271C70 244 122 250 178 267C238 285 311 276 390 246V340H0Z" fill="#B8C8D9" opacity=".7"/>
      <path d="M0 297C80 275 143 288 206 301C275 315 332 306 390 286V340H0Z" fill="#859EB9" opacity=".55"/>
      <g transform="translate(92 180) rotate(-5)">
        <path d="M0 74C52 49 92 49 127 63V137C92 123 52 123 0 148Z" fill="url(#${id}paper)" opacity=".95"/>
        <path d="M254 74C204 49 164 49 127 63V137C164 123 204 123 254 148Z" fill="url(#${id}paper)" opacity=".9"/>
        <path d="M127 63V137" stroke="#C7C0B3" stroke-width="1"/>
        <g stroke="#B8B2A8" stroke-width="1.2" opacity=".65" fill="none">
          <path d="M26 83c22-8 44-9 68-3M26 98c22-8 44-9 68-3M26 113c22-8 44-9 68-3"/>
          <path d="M163 80c24-6 46-5 68 3M163 95c24-6 46-5 68 3M163 110c24-6 46-5 68 3"/>
        </g>
      </g>
      <g fill="#FFFFFF" opacity=".55">
        <path d="M31 70c12-10 26-15 41-15-7 16-20 26-41 30Z"/>
        <path d="M336 181c9-8 20-11 31-10-5 12-15 19-29 23Z"/>
      </g>
      <path d="M60 52c7-7 13-7 20 0M84 61c6-5 11-5 16 0" stroke="#8894A8" stroke-width="1.1" fill="none" opacity=".45" stroke-linecap="round"/>
    </svg>`;
  }

  function comicArt(id) {
    return `<svg viewBox="0 0 390 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="${id}sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F8E4DD"/><stop offset=".52" stop-color="#E4D4EC"/><stop offset="1" stop-color="#C8D2EA"/></linearGradient>
        <radialGradient id="${id}sun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#F3C5AF" stop-opacity=".8"/><stop offset="1" stop-color="#F3C5AF" stop-opacity="0"/></radialGradient>
        <pattern id="${id}dots" width="9" height="9" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#4B4E5E"/></pattern>
      </defs>
      <rect width="390" height="340" fill="url(#${id}sky)"/>
      <circle cx="298" cy="90" r="63" fill="#F0BEA9"/>
      <circle cx="298" cy="90" r="108" fill="url(#${id}sun)"/>
      <g fill="#FFFFFF" opacity=".27"><ellipse cx="86" cy="72" rx="54" ry="10"/><ellipse cx="132" cy="64" rx="30" ry="7"/></g>
      <path d="M0 224C45 200 96 201 146 226C195 250 252 238 314 210C342 197 368 197 390 203V340H0Z" fill="#9FB9AB"/>
      <path d="M0 260C55 234 112 243 168 266C228 291 300 271 390 238V340H0Z" fill="#6D8C80"/>
      <path d="M0 300C60 277 130 287 198 303C268 320 332 309 390 289V340H0Z" fill="#415F57"/>
      <path d="M152 340C181 307 183 281 210 261C232 245 228 229 241 215" stroke="#F8EEE5" stroke-width="9" fill="none" stroke-linecap="round" opacity=".55"/>
      <ellipse cx="216" cy="297" rx="30" ry="5" fill="#30463F" opacity=".22"/>
      <g transform="translate(207 235)" fill="#303B45">
        <circle cx="9" cy="0" r="5.5"/>
        <path d="M3 7h12l6 30H-3Z"/>
        <path d="M4 37 1 60M16 37l4 23" stroke="#303B45" stroke-width="3.4" stroke-linecap="round"/>
        <path d="M22 13l15 4" stroke="#303B45" stroke-width="2" stroke-linecap="round"/>
        <path d="M39 5v65" stroke="#303B45" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M39 4c7 0 11 4 11 10" stroke="#303B45" stroke-width="2" fill="none" stroke-linecap="round"/>
      </g>
      <path d="M72 95c7-7 13-7 20 0M98 104c6-6 11-6 17 0" stroke="#6F7385" fill="none" stroke-width="1.2" opacity=".55" stroke-linecap="round"/>
      <path d="M34 150c23-12 43-12 66 0M22 166c18-9 33-9 50 0" stroke="#B49DB9" fill="none" stroke-width="1" opacity=".45" stroke-linecap="round"/>
      <path d="M64 0v340M0 252h390" stroke="#4B4E5E" stroke-width="1" opacity=".11"/>
      <rect x="286" y="260" width="104" height="80" fill="url(#${id}dots)" opacity=".2"/>
    </svg>`;
  }

  function filmArt(id) {
    return `<svg viewBox="0 0 390 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="${id}sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0D2229"/><stop offset=".47" stop-color="#274A4C"/><stop offset=".76" stop-color="#6E8C7B"/><stop offset="1" stop-color="#D7C9A8"/></linearGradient>
        <radialGradient id="${id}moon" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#F4E8CC" stop-opacity=".58"/><stop offset=".5" stop-color="#F4E8CC" stop-opacity=".16"/><stop offset="1" stop-color="#F4E8CC" stop-opacity="0"/></radialGradient>
        <linearGradient id="${id}water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#21484A"/><stop offset=".55" stop-color="#173437"/><stop offset="1" stop-color="#0E252A"/></linearGradient>
        <linearGradient id="${id}reflect" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F0DFC0" stop-opacity=".32"/><stop offset="1" stop-color="#F0DFC0" stop-opacity="0"/></linearGradient>
      </defs>
      <rect width="390" height="340" fill="url(#${id}sky)"/>
      <circle cx="268" cy="103" r="49" fill="#F4E8CC"/>
      <circle cx="268" cy="103" r="127" fill="url(#${id}moon)"/>
      <path d="M258 0 240 340h42L300 0Z" fill="#F4E8CC" opacity=".035"/>
      <path d="M0 207C58 197 112 203 172 210C237 217 310 207 390 192V228C312 239 242 233 176 227C107 221 52 225 0 236Z" fill="#153135" opacity=".74"/>
      <path d="M0 210h390v130H0Z" fill="url(#${id}water)"/>
      <path d="M222 211h94l12 129H208Z" fill="url(#${id}reflect)" opacity=".55"/>
      <path d="M232 219c18 4 33 4 49 0M226 240c24 6 45 6 66 0M219 264c30 8 56 8 84 0M214 291c36 9 68 9 102 0" stroke="#F0DFC0" stroke-width="1" fill="none" opacity=".2"/>
      <path d="M0 283c62-17 112-12 160 3 42 13 88 12 137 2 38-8 68-8 93-2v54H0Z" fill="#0C2024" opacity=".5"/>
      <g fill="#0A1B1E">
        <path d="M126 292h150v5H126Z"/>
        <circle cx="214" cy="239" r="5.5"/>
        <path d="M207 247h14l5 41h-24Z"/>
        <path d="M209 287 205 316M221 287l4 29" stroke="#0A1B1E" stroke-width="3" stroke-linecap="round"/>
        <path d="M234 252v64" stroke="#0A1B1E" stroke-width="2"/>
        <circle cx="234" cy="248" r="6.5" fill="#F5E2B8"/>
        <circle cx="234" cy="248" r="18" fill="#F5E2B8" opacity=".09"/>
      </g>
      <g opacity=".75">
        <rect x="302" y="191" width="56" height="12" rx="2" fill="#0B2024"/>
        <g fill="#F3E1B9"><rect x="307" y="194" width="5" height="4" rx="1"/><rect x="316" y="194" width="5" height="4" rx="1"/><rect x="325" y="194" width="5" height="4" rx="1"/><rect x="334" y="194" width="5" height="4" rx="1"/><rect x="343" y="194" width="5" height="4" rx="1"/></g>
      </g>
    </svg>`;
  }

  function gameArt(id) {
    return `<svg viewBox="0 0 390 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="${id}sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#DCEBFF"/><stop offset=".55" stop-color="#E8E1FA"/><stop offset="1" stop-color="#F8E9D7"/></linearGradient>
        <radialGradient id="${id}sun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFE3B8" stop-opacity=".8"/><stop offset="1" stop-color="#FFE3B8" stop-opacity="0"/></radialGradient>
        <linearGradient id="${id}far" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#B4C7E7"/><stop offset="1" stop-color="#91A9D2"/></linearGradient>
        <linearGradient id="${id}mid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8CA4D2"/><stop offset="1" stop-color="#6E86B5"/></linearGradient>
        <linearGradient id="${id}cliff" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5E7B6E"/><stop offset="1" stop-color="#314C48"/></linearGradient>
      </defs>
      <rect width="390" height="340" fill="url(#${id}sky)"/>
      <circle cx="300" cy="80" r="42" fill="#FFDFAE"/>
      <circle cx="300" cy="80" r="88" fill="url(#${id}sun)"/>
      <circle cx="300" cy="80" r="58" fill="none" stroke="#FFE9C7" stroke-width="1.2" opacity=".32"/>
      <g fill="#FFFFFF" opacity=".30"><ellipse cx="90" cy="80" rx="58" ry="12"/><ellipse cx="134" cy="72" rx="34" ry="8"/><ellipse cx="294" cy="186" rx="70" ry="10"/></g>
      <path d="M0 214 52 172 104 202 166 156 221 205 280 164 333 200 390 170V340H0Z" fill="url(#${id}far)" opacity=".8"/>
      <path d="M0 246 55 211 116 240 178 198 236 241 300 207 350 232 390 215V340H0Z" fill="url(#${id}mid)" opacity=".9"/>
      <g transform="translate(252 132)">
        <path d="M-48 20c10-8 23-12 48-12s38 4 48 12c-8 10-22 14-48 14S-40 30-48 20Z" fill="#718D75"/>
        <path d="M-42 28c10 13 24 21 42 21s32-8 42-21c-5 16-18 45-42 45S-37 44-42 28Z" fill="#827A9C"/>
        <path d="M20 49c2 24 8 39 17 53" stroke="#C8E4F5" stroke-width="3" opacity=".55" fill="none" stroke-linecap="round"/>
        <path d="M-12 12v-24M-12-12c-8-8-14-10-22-10M-12-14c8-8 15-10 22-8" stroke="#425B4A" stroke-width="2.4" fill="none" stroke-linecap="round"/>
      </g>
      <g transform="translate(102 181) scale(.56)">
        <path d="M-48 20c10-8 23-12 48-12s38 4 48 12c-8 10-22 14-48 14S-40 30-48 20Z" fill="#809B84"/>
        <path d="M-42 28c10 13 24 21 42 21s32-8 42-21c-5 16-18 45-42 45S-37 44-42 28Z" fill="#8F87A8"/>
        <path d="M-12 12v-20M-12-8c-8-8-13-9-20-8" stroke="#4A6554" stroke-width="2.6" fill="none" stroke-linecap="round"/>
      </g>
      <path d="M0 340V258c46-8 84 4 120 24 45 26 91 30 143 16 40-11 82-8 127 8v34Z" fill="url(#${id}cliff)"/>
      <path d="M0 260c46-9 84 4 120 23 45 25 91 30 143 16 40-11 82-9 127 7" stroke="#789284" stroke-width="3" fill="none" opacity=".8"/>
      <g stroke="#FFFFFF" opacity=".42" fill="none" stroke-linecap="round"><path d="M38 124c22-8 42-8 63 0" stroke-width="1"/><path d="M52 142c17-6 32-6 48 0" stroke-width=".8"/><path d="M274 214c16-5 31-5 45 0" stroke-width=".8"/></g>
    </svg>`;
  }

  function albumArt(id, title) {
    const label = esc(Array.from(String(title || '铃')).slice(0, 4).join(''));
    return `<svg viewBox="0 0 390 340" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <defs>
        <linearGradient id="${id}bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2E315E"/><stop offset=".58" stop-color="#5F5798"/><stop offset="1" stop-color="#A08CCB"/></linearGradient>
        <radialGradient id="${id}glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#F2CEDB" stop-opacity=".58"/><stop offset="1" stop-color="#F2CEDB" stop-opacity="0"/></radialGradient>
        <linearGradient id="${id}ribbon" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#F8EFFA" stop-opacity=".05"/><stop offset=".45" stop-color="#F8EFFA" stop-opacity=".34"/><stop offset="1" stop-color="#F8EFFA" stop-opacity=".02"/></linearGradient>
        <radialGradient id="${id}label" cx=".42" cy=".36" r=".7"><stop offset="0" stop-color="#EADBF4"/><stop offset="1" stop-color="#BDA6DE"/></radialGradient>
      </defs>
      <rect width="390" height="340" fill="url(#${id}bg)"/>
      <circle cx="72" cy="52" r="92" fill="url(#${id}glow)"/>
      <circle cx="264" cy="152" r="121" fill="#191B36" opacity=".91"/>
      <g fill="none" stroke="#FFFFFF" opacity=".10"><circle cx="264" cy="152" r="111"/><circle cx="264" cy="152" r="96"/><circle cx="264" cy="152" r="82"/><circle cx="264" cy="152" r="68"/></g>
      <path d="M162 84a112 112 0 0 1 88-35" stroke="#FFFFFF" stroke-width="1.2" fill="none" opacity=".22"/>
      <circle cx="264" cy="152" r="32" fill="url(#${id}label)"/>
      <circle cx="264" cy="152" r="5" fill="#34305B"/>
      <path d="M-20 292c72-55 142-70 218-43 54 19 109 13 192-24v115H-20Z" fill="url(#${id}ribbon)"/>
      <path d="M-10 310c88-42 155-45 219-20 54 21 110 16 181-15v65H-10Z" fill="#F8EFFA" opacity=".07"/>
      <g fill="#FFFFFF" opacity=".38"><circle cx="78" cy="127" r="1.1"/><circle cx="119" cy="92" r=".8"/><circle cx="332" cy="59" r="1"/><circle cx="352" cy="244" r=".9"/><circle cx="56" cy="206" r=".8"/></g>
      <path d="M30 210v64" stroke="#FFFFFF" opacity=".35"/>
      <text x="29" y="252" fill="#F8F3FF" font-family="'Noto Sans CJK SC','Noto Sans SC',sans-serif" font-size="31" font-weight="600" letter-spacing="2">${label}</text>
      <text x="31" y="274" fill="#FFFFFF" opacity=".6" font-family="'Noto Sans CJK SC','Noto Sans SC',sans-serif" font-size="6.5" letter-spacing="2.6">LING · PRIVATE RECORD</text>
    </svg>`;
  }

  // ── screens / nav ───────────────────────────────────────
  function switchTab(name, opts = {}) {
    if (!['records', 'wishlist', 'reading', 'review'].includes(name)) name = 'records';
    ui.tab = name;
    $$('.screen').forEach(s => s.classList.toggle('active', s.id === 'screen-' + name));
    $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.tab === name));
    if (name === 'records') renderRecords();
    if (name === 'wishlist') renderWishlist();
    if (name === 'reading') renderReading();
    if (name === 'review') renderReview();
    const screen = $('#screen-' + name);
    if (screen) screen.scrollTop = 0;
    placeNavBlob(!!ui.navReady);
    ui.navReady = true;
  }

  function renderAll() {

    renderRecords();
    renderWishlist();
    renderReading();
    if (ui.tab === 'review') renderReview();
  }

  // ── 阶段5 · 回顾（时间胶囊 + 月度 / 年度） ────────────────
  // 统计口径：只认记录里真实存在的日期，缺失或非法日期「不参与任何区间统计」，
  // 既不会补成今天，也不会当成 0。取法：
  //   已看完 → date || finishedAt；在看 → startedAt；
  //   想看   → addedAt；想看但已标记 done → finishedAt || addedAt，并计入「完成」
  // 所有数字都能从 db.works 重新算出来，不缓存、不写新键。
  const RV_ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
  const RV_MODES = [
    { key: 'year', label: '一年前' },
    { key: 'random', label: '随便翻一条' },
    { key: 'oldest', label: '最早的记录' }
  ];

  function rvStatus(w) {
    if (w.status === 'wish' && w.done) return 'finished';
    return w.status || '';
  }

  function rvDate(w) {
    let raw = '';
    if (w.status === 'finished') raw = w.date || w.finishedAt;
    else if (w.status === 'reading') raw = w.startedAt;
    else if (w.status === 'wish') raw = w.done ? (w.finishedAt || w.addedAt) : w.addedAt;
    return (typeof raw === 'string' && RV_ISO_RE.test(raw)) ? raw : '';
  }

  function rvRows() {
    return db.works
      .map(w => ({ w, d: rvDate(w) }))
      .filter(x => !!x.d)
      .sort((a, b) => b.d.localeCompare(a.d));
  }

  function rvDaysAgo(iso) {
    const a = Date.parse(iso + 'T00:00:00');
    const t = Date.parse(todayISO() + 'T00:00:00');
    if (!Number.isFinite(a) || !Number.isFinite(t)) return null;
    return Math.round((t - a) / 86400000);
  }

  // 「多久以前」只用量出来的天数说，跨月跨年不给精确值，用「约」
  function rvAgeLabel(iso) {
    const d = rvDaysAgo(iso);
    if (d === null || d < 0) return '';
    if (d === 0) return '今天';
    if (d < 31) return d + ' 天前';
    if (d < 365) return '约 ' + Math.floor(d / 30) + ' 个月前';
    const y = Math.floor(d / 365), rest = d - y * 365;
    if (rest < 31) return y + ' 年 ' + rest + ' 天前';
    return '约 ' + y + ' 年 ' + Math.floor(rest / 30) + ' 个月前';
  }

  function rvShiftMonth(key, delta) {
    const parts = String(key || '').split('-').map(Number);
    const d = new Date(parts[0], (parts[1] || 1) - 1 + delta, 1);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1);
  }
  function rvMonthRangeOf(key) {
    const parts = String(key).split('-').map(Number);
    const end = new Date(parts[0], parts[1], 0).getDate();
    return { from: key + '-01', to: key + '-' + pad2(end) };
  }
  function rvYearRangeOf(y) { return { from: y + '-01-01', to: y + '-12-31' }; }
  function rvMonthLabel(key) {
    const parts = String(key).split('-').map(Number);
    return parts[0] + ' 年 ' + parts[1] + ' 月';
  }

  function rvCoverage() {
    const rows = rvRows();
    if (!rows.length) return null;
    const dates = rows.map(x => x.d).sort();
    return { first: dates[0], last: dates[dates.length - 1], count: rows.length };
  }

  function rvMonthKey() {
    const todayKey = todayISO().slice(0, 7);
    const key = ui.rvMonth || todayKey;
    return RV_ISO_RE.test(key + '-01') ? key : todayKey;
  }

  // 翻页边界按真实数据覆盖范围：不会翻到数据之外的空年份/空月份里迷路
  function rvBounds() {
    const todayKey = todayISO().slice(0, 7);
    const cov = rvCoverage();
    if (!cov) return { min: todayKey, max: todayKey };
    const a = cov.first.slice(0, 7), b = cov.last.slice(0, 7);
    return { min: a < todayKey ? a : todayKey, max: b > todayKey ? b : todayKey };
  }

  function rvRange() {
    const key = rvMonthKey();
    if (ui.rvScope === 'year') {
      const y = Number(String(key).slice(0, 4)) || new Date().getFullYear();
      const r = rvYearRangeOf(y);
      return { from: r.from, to: r.to, label: y + ' 年', year: y, key: key };
    }
    const r = rvMonthRangeOf(key);
    return { from: r.from, to: r.to, label: rvMonthLabel(key), year: Number(String(key).slice(0, 4)), key: key };
  }

  function rvRated(w) {
    return w.rating !== null && w.rating !== undefined && w.rating !== '' && Number.isFinite(Number(w.rating));
  }

  function rvCompute(from, to) {
    const items = rvRows().filter(x => x.d >= from && x.d <= to);
    const byType = {};
    const byStatus = { finished: 0, reading: 0, wish: 0 };
    let ratedCount = 0, sum = 0, lo = null, hi = null;
    items.forEach(x => {
      const w = x.w;
      if (TYPES[w.type]) byType[w.type] = (byType[w.type] || 0) + 1;
      const st = rvStatus(w);
      if (byStatus[st] != null) byStatus[st] += 1;
      if (rvRated(w)) {
        const r = Number(w.rating);
        ratedCount += 1;
        sum += r;
        if (!lo || r < lo.rating) lo = { rating: r, w: w };
        if (!hi || r > hi.rating) hi = { rating: r, w: w };
      }
    });
    const typeRows = TYPE_ORDER.filter(t => byType[t]).map(t => ({ t: t, n: byType[t], m: TYPES[t] }));
    const thoughtCount = items.filter(x => String(x.w.thought || '').trim()).length;
    // 精选只从「有评分或有感想」的记录里挑：没有评分也没有感想的条目进精选没有信息量
    const featured = items.filter(x => rvRated(x.w) || String(x.w.thought || '').trim()).sort((a, b) => {
      const ra = rvRated(a.w) ? Number(a.w.rating) : -1;
      const rb = rvRated(b.w) ? Number(b.w.rating) : -1;
      if (rb !== ra) return rb - ra;
      const ta = String(a.w.thought || '').trim() ? 1 : 0;
      const tb = String(b.w.thought || '').trim() ? 1 : 0;
      if (tb !== ta) return tb - ta;
      return b.d.localeCompare(a.d);
    }).slice(0, 3);
    return {
      items: items, total: items.length, byType: byType, byStatus: byStatus, typeRows: typeRows,
      ratedCount: ratedCount, avg: ratedCount ? sum / ratedCount : null,
      lo: lo, hi: hi, featured: featured, thoughtCount: thoughtCount
    };
  }

  // ── 时间胶囊 ──
  function rvOneYearAgoISO() {
    const base = new Date(todayISO() + 'T00:00:00');
    if (!(base instanceof Date) || isNaN(base.getTime())) return '';
    base.setFullYear(base.getFullYear() - 1);
    return base.getFullYear() + '-' + pad2(base.getMonth() + 1) + '-' + pad2(base.getDate());
  }

  function rvCapsulePool(mode) {
    const today = todayISO();
    // 「旧记录」必须是过去日期的记录，今天的记录不算回忆
    const rows = rvRows().filter(x => x.d < today);
    if (mode === 'year') {
      const target = rvOneYearAgoISO();
      if (!target) return [];
      const tn = rvDaysAgo(target);
      if (tn === null) return [];
      // 用真实天数差判断，避免闰年 / 月末的字符串比较误差
      return rows.filter(x => {
        const n = rvDaysAgo(x.d);
        return n !== null && Math.abs(n - tn) <= 60;
      });
    }
    if (mode === 'oldest') return rows.slice().sort((a, b) => a.d.localeCompare(b.d)).slice(0, 6);
    return rows;
  }

  function rvPick(mode, excludeId) {
    const pool = rvCapsulePool(mode).filter(x => x.w.id !== excludeId);
    if (!pool.length) return null;
    // 「最早的记录」是确定的：就是最早那条；换一条 = 往后再挪一条，不会跳到中途
    if (mode === 'oldest') return pool[0].w;
    // 随机模式下，当时写下了感想的先参与抽（胶囊的价值在当时的字），但仍是随机
    const rich = pool.filter(x => String(x.w.thought || '').trim());
    const src = rich.length ? rich : pool;
    return src[Math.floor(Math.random() * src.length)].w;
  }

  function rvCapsuleEmpty(cov) {
    let title = '', desc = '', btns = '';
    if (!cov) {
      title = '还没有可以回顾的记录';
      desc = '时间胶囊只从你已经记下的内容里取，不会凭空生成。先记一条，过一阵子再回来。';
      btns = '<button class="rv-btn primary" data-action="new-work">记一条</button>';
    } else if (ui.rvMode === 'year') {
      const n = rvDaysAgo(cov.first);
      title = '还没有一年前的记录';
      desc = '最早的一条在 ' + fmtDate(cov.first) + (n !== null ? '，大约 ' + Math.round(n / 30) + ' 个月前' : '') + '，离一年还差一段。';
      btns = '<button class="rv-btn primary" data-action="rv-mode" data-mode="oldest">看最早的记录</button>';
    } else if (ui.rvMode === 'oldest') {
      title = '没有更早的记录';
      desc = '带日期的记录已经翻到头了。';
      btns = '<button class="rv-btn" data-action="rv-mode" data-mode="random">随便翻一条</button>';
    } else {
      title = '还没有可以翻的旧记录';
      desc = '带日期的记录都集中在今天，再等几天就有能翻的了。';
      btns = '<button class="rv-btn" data-action="new-work">记一条</button>';
    }
    return '<div class="rv-hero is-empty">' +
      '<div class="rv-hero-grid" aria-hidden="true"></div>' +
      '<div class="rv-hero-in">' +
        '<div class="rv-hero-top"><span class="rv-pill"><i></i>时间胶囊</span></div>' +
        '<h2 class="rv-hero-title">' + esc(title) + '</h2>' +
        '<p class="rv-hero-thought is-empty">' + esc(desc) + '</p>' +
        '<div class="rv-hero-actions">' + btns + '</div>' +
      '</div></div>';
  }

  function rvModeLabel() {
    const hit = RV_MODES.find(m => m.key === ui.rvMode);
    return hit ? hit.label : '时间胶囊';
  }

  function renderCapsule() {
    const host = $('#rvCapsule');
    if (!host) return;
    const cov = rvCoverage();
    const pool = cov ? rvCapsulePool(ui.rvMode) : [];
    let w = ui.rvPickId ? getWork(ui.rvPickId) : null;
    if (!w || !pool.some(x => x.w.id === w.id)) {
      const picked = pool.length ? rvPick(ui.rvMode, null) : null;
      w = picked || null;
      ui.rvPickId = w ? w.id : null;
    }
    if (!w) { host.innerHTML = rvCapsuleEmpty(cov); return; }

    const d = rvDate(w);
    const m = TYPES[w.type] || null;
    const thought = String(w.thought || '').trim();
    const rated = rvRated(w);
    const canRoll = rvCapsulePool(ui.rvMode).length > 1;
    const age = rvAgeLabel(d);
    const meta = [];
    if (w.creator) meta.push(w.creator);
    meta.push(rated ? ratingText(w.rating) + ' / 10' : '未评分');

    host.innerHTML = '<div class="rv-hero">' +
      '<div class="rv-hero-grid" aria-hidden="true"></div>' +
      '<div class="rv-hero-glow" aria-hidden="true"></div>' +
      '<div class="rv-hero-in">' +
        '<div class="rv-hero-top">' +
          '<span class="rv-pill"><i></i>时间胶囊 · ' + esc(rvModeLabel()) + '</span>' +
          '<span class="rv-mono">' + esc(d) + '</span>' +
        '</div>' +
        '<div class="rv-hero-main">' +
          '<div class="rv-hero-text">' +
            '<h2 class="rv-hero-title">' + esc(w.title) + '</h2>' +
            '<p class="rv-hero-age">' + esc(age) + (m ? ' · ' + esc(m.full) : '') + '</p>' +
          '</div>' +
          '<span class="rv-hero-cover">' + coverHTML(w) + '</span>' +
        '</div>' +
        (thought
          ? '<p class="rv-hero-thought">' + esc(thought) + '</p>'
          : '<p class="rv-hero-thought is-empty">这条记录里没有写下感想。</p>') +
        '<div class="rv-hero-foot"><span class="rv-mono">' + esc(meta.join(' · ')) + '</span></div>' +
        '<div class="rv-hero-actions">' +
          '<button class="rv-btn primary" data-action="rv-open" data-id="' + w.id + '">打开记录</button>' +
          '<button class="rv-btn" data-action="rv-edit" data-id="' + w.id + '">编辑</button>' +
          (canRoll ? '<button class="rv-btn" data-action="rv-roll">换一条</button>' : '') +
        '</div>' +
      '</div></div>';
  }

  function rvRoll() {
    const prev = ui.rvPickId;
    const w = rvPick(ui.rvMode, prev);
    if (!w) { toast(ui.rvMode === 'year' ? '一年前后只有这一条' : '没有更多可以翻的记录'); return; }
    ui.rvPickId = w.id;
    renderCapsule();
  }

  // ── 月度 / 年度 ──
  function renderModes() {
    const row = $('#rvModes');
    if (!row) return;
    row.innerHTML = RV_MODES.map(m =>
      '<button class="filter' + (ui.rvMode === m.key ? ' active' : '') + '" data-action="rv-mode" data-mode="' + m.key + '">' + m.label + '</button>'
    ).join('');
    RV_BLOB.place(true);
  }

  function rvStep(delta) {
    const b = rvBounds();
    const key = rvMonthKey();
    if (ui.rvScope === 'year') {
      const y = Number(String(key).slice(0, 4)) + delta;
      if (y < Number(String(b.min).slice(0, 4)) || y > Number(String(b.max).slice(0, 4))) return;
      ui.rvMonth = y + String(key).slice(4);
    } else {
      const next = rvShiftMonth(key, delta);
      if (next < b.min || next > b.max) return;
      ui.rvMonth = next;
    }
    renderMonth();
  }

  function rvStatCards(s, r) {
    const typeTotal = s.typeRows.reduce((a, x) => a + x.n, 0);
    const typeHTML = typeTotal
      ? s.typeRows.map(x => {
          const pct = Math.round(x.n / typeTotal * 100);
          return '<div class="rv-bar">' +
            '<span class="rv-bar-name"><i style="background:' + x.m.dot + '"></i>' + x.m.label + '</span>' +
            '<span class="rv-bar-track"><span class="rv-bar-fill" style="width:' + Math.max(4, pct) + '%;background:' + x.m.dot + '"></span></span>' +
            '<span class="rv-bar-n">' + x.n + '</span>' +
          '</div>';
        }).join('')
      : '<p class="rv-empty-line">这段时间的记录都没有类型字段。</p>';

    // 评分缺失不参与计算，也不显示 0
    const ratingHTML = s.ratedCount
      ? '<div class="rv-avg-row">' +
          '<span class="rv-avg">' + ratingText(Math.round(s.avg * 10) / 10) + '</span>' +
          '<span class="rv-avg-unit">/ 10 · ' + s.ratedCount + ' 条有评分</span>' +
        '</div>' +
        '<p class="rv-note">最低 ' + esc(s.lo.w.title) + ' ' + ratingText(s.lo.rating) + ' · 最高 ' + esc(s.hi.w.title) + ' ' + ratingText(s.hi.rating) + '</p>'
      : (s.total === 0
          ? '<p class="rv-empty-line">这段时间还没有记录，评分无从统计。</p>'
          : '<p class="rv-empty-line">这 ' + s.total + ' 条记录里没有评分。没有评分不等于 0 分，所以不给平均值。</p>');

    return '<div class="rv-cards">' +
      '<div class="rv-card">' +
        '<span class="rv-eyebrow">记录</span>' +
        '<div class="rv-big">' + s.total + '<span class="rv-big-u">条</span></div>' +
        '<p class="rv-split">完成 ' + s.byStatus.finished + ' · 在看 ' + s.byStatus.reading + ' · 想看 ' + s.byStatus.wish + '</p>' +
      '</div>' +
      '<div class="rv-card">' +
        '<span class="rv-eyebrow">类型分布</span>' + typeHTML +
        (typeTotal && typeTotal < s.total
          ? '<p class="rv-note">另有 ' + (s.total - typeTotal) + ' 条没有可识别的类型，未计入分布。</p>'
          : '') +
      '</div>' +
      '<div class="rv-card">' +
        '<span class="rv-eyebrow">评分</span>' + ratingHTML +
      '</div>' +
    '</div>';
  }

  function rvFeaturedHTML(s) {
    if (!s.featured.length) {
      return '<p class="rv-empty-line">' + (s.total === 0
        ? '这段时间还没有记录。'
        : '这段时间没有留下评分或感想的记录，所以没有精选。') + '</p>';
    }
    return s.featured.map(x => {
      const w = x.w, m = TYPES[w.type] || null;
      const q = String(w.thought || '').trim();
      const meta = (m ? m.full : '未分类') + (rvRated(w) ? ' · ' + ratingText(w.rating) + ' / 10' : ' · 未评分') + ' · ' + fmtShort(x.d);
      return '<button class="rv-feat" data-action="rv-open" data-id="' + w.id + '">' +
        coverHTML(w) +
        '<span class="rv-feat-body">' +
          '<span class="rv-feat-title">' + esc(w.title) + '</span>' +
          '<span class="rv-feat-meta">' + esc(meta) + '</span>' +
          (q ? '<span class="rv-feat-quote">' + esc(q.length > 46 ? q.slice(0, 46) + '…' : q) + '</span>' : '') +
        '</span>' +
      '</button>';
    }).join('');
  }

  function rvYearStrip(year) {
    const counts = [];
    for (let i = 1; i <= 12; i++) {
      const k = year + '-' + pad2(i);
      const rr = rvMonthRangeOf(k);
      counts.push({ k: k, n: rvCompute(rr.from, rr.to).total });
    }
    const maxN = counts.reduce((a, c) => Math.max(a, c.n), 0) || 1;
    return '<div class="rv-strip">' + counts.map(c =>
      '<button class="rv-strip-cell" data-action="rv-jump-month" data-month="' + c.k + '" aria-label="' + c.k + ' 有 ' + c.n + ' 条">' +
        '<span class="rv-strip-bar" style="height:' + (c.n ? Math.max(8, Math.round(c.n / maxN * 100)) : 3) + '%"></span>' +
        '<span class="rv-strip-l">' + Number(c.k.slice(5)) + '</span>' +
      '</button>'
    ).join('') + '</div>';
  }

  function renderMonth() {
    const host = $('#rvMonth');
    if (!host) return;
    const key = rvMonthKey();
    if (!ui.rvMonth) ui.rvMonth = key;
    const r = rvRange();
    const s = rvCompute(r.from, r.to);
    const b = rvBounds();
    const prevOK = ui.rvScope === 'year'
      ? (r.year - 1) >= Number(String(b.min).slice(0, 4))
      : rvShiftMonth(key, -1) >= b.min;
    const nextOK = ui.rvScope === 'year'
      ? (r.year + 1) <= Number(String(b.max).slice(0, 4))
      : rvShiftMonth(key, 1) <= b.max;

    const emptyLine = s.total === 0
      ? '<div class="rv-card rv-card-empty"><p class="rv-empty-line">' + (ui.rvScope === 'year' ? '这一年' : '这个月') +
        '还没有记录。上面的数字都来自真实日期，没有记录就是 0 条。</p></div>'
      : '';

    host.innerHTML =
      '<div class="rv-month-head">' +
        '<div class="rv-month-nav">' +
          '<button class="rv-nav-btn" data-action="rv-prev" aria-label="上一个"' + (prevOK ? '' : ' disabled') + '><svg class="icon"><use href="#i-back"/></svg></button>' +
          '<span class="rv-month-label">' + esc(r.label) + '</span>' +
          '<button class="rv-nav-btn" data-action="rv-next" aria-label="下一个"' + (nextOK ? '' : ' disabled') + '><svg class="icon"><use href="#i-arrow-right"/></svg></button>' +
        '</div>' +
        '<div class="rv-scope">' +
          '<button class="rv-scope-btn' + (ui.rvScope === 'month' ? ' on' : '') + '" data-action="rv-scope" data-scope="month">月度</button>' +
          '<button class="rv-scope-btn' + (ui.rvScope === 'year' ? ' on' : '') + '" data-action="rv-scope" data-scope="year">年度</button>' +
        '</div>' +
      '</div>' +
      (ui.rvScope === 'year' ? rvYearStrip(r.year) : '') +
      emptyLine +
      rvStatCards(s, r) +
      '<div class="rv-block">' +
        '<span class="rv-eyebrow">精选 · 按评分与感想排序</span>' +
        rvFeaturedHTML(s) +
      '</div>' +
      '<p class="rv-caliber">口径：已看完了取 date / finishedAt，在看看 startedAt，想看看 finishedAt 或 addedAt；' +
        '只统计日期落在 <b>' + r.from + '</b> 至 <b>' + r.to + '</b> 的记录，缺日期的记录不计入，也不按 0 处理。' +
        '评分均值只算有评分的 ' + s.ratedCount + ' 条。</p>' +
      '<button class="rv-share-btn" data-action="rv-share"><svg class="icon"><use href="#i-spark"/></svg>分享这段回顾</button>';
  }

  function renderReview() {
    const cov = rvCoverage();
    const sub = $('#reviewSub');
    if (sub) {
      sub.innerHTML = cov
        ? '<span>' + fmtShort(cov.first) + ' — ' + fmtShort(cov.last) + '</span><span class="dot-sep"></span><span>' + cov.count + ' 条带日期的记录</span>'
        : '<span>还没有带日期的记录</span>';
    }
    renderModes();
    renderCapsule();
    renderMonth();
  }

  // ── 分享：只发用户勾选的部分，默认不含标题与感想 ──
  function rvShareData() {
    const r = rvRange();
    return { r: r, s: rvCompute(r.from, r.to) };
  }

  function rvShareText() {
    const d = rvShareData();
    const r = d.r, s = d.s;
    const lines = [r.label + ' · 回顾'];
    if (ui.shareParts.count) {
      lines.push('记录 ' + s.total + ' 条（完成 ' + s.byStatus.finished + ' · 在看 ' + s.byStatus.reading + ' · 想看 ' + s.byStatus.wish + '）');
    }
    if (ui.shareParts.types && s.typeRows.length) {
      lines.push('类型：' + s.typeRows.map(x => x.m.label + ' ' + x.n).join(' · '));
    }
    if (ui.shareParts.rating) {
      lines.push(s.ratedCount
        ? '评分：平均 ' + ratingText(Math.round(s.avg * 10) / 10) + ' / 10（' + s.ratedCount + ' 条有评分）'
        : '评分：这段时间没有评分记录');
    }
    if (ui.shareParts.titles && s.featured.length) {
      lines.push('精选：');
      s.featured.forEach(x => lines.push('· ' + x.w.title + (rvRated(x.w) ? ' ' + ratingText(x.w.rating) : '')));
    }
    if (ui.shareParts.thoughts) {
      const q = s.featured.filter(x => String(x.w.thought || '').trim());
      if (q.length) {
        lines.push('感想：');
        q.forEach(x => {
          const t = String(x.w.thought).trim();
          lines.push('· ' + (t.length > 52 ? t.slice(0, 52) + '…' : t));
        });
      }
    }
    lines.push('— 铃 · 私人记录');
    return lines.join('\n');
  }

  function renderShareSheet() {
    const host = $('#shareContent');
    if (!host) return;
    const d = rvShareData();
    const s = d.s;
    const parts = [
      ['count', '记录数量与状态', s.total + ' 条'],
      ['types', '类型分布', s.typeRows.length ? s.typeRows.map(x => x.m.label + ' ' + x.n).join(' · ') : '没有类型数据'],
      ['rating', '评分统计', s.ratedCount ? '平均 ' + ratingText(Math.round(s.avg * 10) / 10) + ' · ' + s.ratedCount + ' 条有评分' : '这段时间没有评分'],
      ['titles', '精选作品标题', s.featured.length ? s.featured.map(x => x.w.title).join(' · ') : '没有可精选的记录'],
      ['thoughts', '感想原文（私人）', s.thoughtCount ? s.thoughtCount + ' 条有感想' : '这段时间没有感想']
    ];
    host.innerHTML =
      '<div class="sheet-head">' +
        '<h2>分享这段回顾</h2>' +
        '<button class="sheet-close" data-close="share" aria-label="关闭"><svg class="icon"><use href="#i-close"/></svg></button>' +
      '</div>' +
      '<p class="rv-share-note">只有勾选的内容会进入分享文案。默认只发数字，作品标题和感想原文要你自己打开。</p>' +
      '<div class="rv-share-list">' +
        parts.map(p =>
          '<button class="rv-share-row' + (ui.shareParts[p[0]] ? ' on' : '') + '" data-action="rv-share-toggle" data-part="' + p[0] + '">' +
            '<span class="rv-share-box" aria-hidden="true"></span>' +
            '<span class="rv-share-txt"><b>' + p[1] + '</b><small>' + esc(p[2]) + '</small></span>' +
          '</button>'
        ).join('') +
      '</div>' +
      '<pre class="rv-share-preview">' + esc(rvShareText()) + '</pre>' +
      '<button class="primary-btn" data-action="rv-share-copy">复制分享文案<svg class="icon"><use href="#i-arrow-up"/></svg></button>';
  }

  async function rvCopyShare() {
    const text = rvShareText();
    if (!ui.shareParts.count && !ui.shareParts.types && !ui.shareParts.rating && !ui.shareParts.titles && !ui.shareParts.thoughts) {
      toast('先选一项要分享的内容');
      return;
    }
    let ok = false;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch (e) { ok = false; }
    if (!ok) {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.cssText = 'position:fixed;top:-999px;left:0;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        ok = document.execCommand('copy');
        ta.remove();
      } catch (e) { ok = false; }
    }
    toast(ok ? '分享文案已复制' : '复制失败，可长按预览手动复制', ok ? 'ok' : 'err');
  }

  // ── add / edit form ─────────────────────────────────────
  // 从「新建」页里选完选项进来的表单，是「叠在新建页上的抽屉」：
  // 新建页留在下面不收，表单直接从底部推上来；返回时抽屉收回底部、新建页还在原处，
  // 保存成功才把整条新建流程一起收掉。qaHold 就是这个「新建页被留在下面」的状态。
  let qaHold = false;
  let addCloseT = 0;
  const ADD_CLOSE_MS = 280;

  function openAdd(status = 'finished', editId = null, forceStatus = false, fromQa = false) {
    const work = editId ? getWork(editId) : null;
    if (editId && !work) return;
    ui.editingId = editId || null;
    ui.formStatus = work ? (forceStatus ? status : work.status) : status;
    ui.formType = work ? work.type : 'book';
    ui.formIcon = work ? (work.icon || null) : null;
    ui.iconEditTarget = null;

    $('#addPageTitle').textContent = editId ? '编辑作品' : (ui.formStatus === 'wish' ? '新的想看' : ui.formStatus === 'reading' ? '开始在看' : '新记录');
    $('#formTitle').value = work ? work.title : '';
    if ($('#formCreator')) $('#formCreator').value = work ? (work.creator || '') : '';
    syncCreatorField();
    $('#formRating').value = work && Number.isFinite(Number(work.rating)) && work.rating !== null ? work.rating : 8.5;
    $('#formDate').value = work && work.date ? work.date : todayISO();
    $('#formThought').value = work ? (work.thought || '') : '';
    $('#formStartedAt').value = work && work.startedAt ? work.startedAt : todayISO();
    $('#formTag').value = work && work.tag ? work.tag : '';
    $('#formWhy').value = work ? (work.why || '') : '';
    $('#formInitialNote').value = '';
    ui.ratingTouched = false;   // 新开一次表单 = 评分还没被真正动过

    syncRating();
    syncTypeButtons();
    syncStatusButtons();
    renderFormIcon();
    renderTagChips();
    const page = $('#addPage');
    clearTimeout(addCloseT);
    qaHold = !!fromQa;
    page.classList.toggle('qa-sheet', !!fromQa);
    page.classList.remove('closing');
    page.classList.add('open');
    page.setAttribute('aria-hidden', 'false');
    $('#addPage .page-body').scrollTop = 0;
    requestAnimationFrame(() => placeStatusBlob(true)); // v2.0.2：表单显示后立即定位指示块
  }

  function closeAdd(instant) {
    const page = $('#addPage');
    if (!page) return;
    // 这个函数有一处被 addEventListener 直传（#cancelAdd），那时第一个参数是事件对象，
    // 不能当布尔用 —— 只认严格的 true。
    const hard = instant === true;
    const sheet = page.classList.contains('qa-sheet');
    const hold = qaHold;
    ui.editingId = null;
    ui.iconEditTarget = null;
    ui.formIcon = null;
    qaHold = false;
    clearTimeout(addCloseT);

    const finish = () => {
      page.classList.remove('open', 'closing', 'qa-sheet');
      page.setAttribute('aria-hidden', 'true');
    };

    if (hard || !sheet || prefersReduced()) {
      finish();
      if (hard && hold) qaHardClose();   // 保存成功：底下的新建页也一起收，别停在中转页
      return;
    }
    // 抽屉收回底部。新建页从头到尾没被收起，所以收完自然就回到它。
    page.classList.add('closing');
    addCloseT = setTimeout(finish, ADD_CLOSE_MS + 40);
  }

  function syncStatusButtons() {
    $$('#statusSeg button').forEach(b => b.classList.toggle('active', b.dataset.status === ui.formStatus));
    $('#finishedFields').hidden = ui.formStatus !== 'finished';
    $('#readingFields').hidden = ui.formStatus !== 'reading';
    $('#wishFields').hidden = ui.formStatus !== 'wish';
    const label = ui.editingId ? '保存修改' : ui.formStatus === 'wish' ? '加入想看' : ui.formStatus === 'reading' ? '开始记录' : '保存记录';
    $('#saveWorkLabel').textContent = label;
    // 快速记录只对「新建 + 已看完」有意义：在看/想看本来就没有必填的分数，
    // 编辑已有作品时也不该走「先存下」这条会重写字段的路径。
    const quick = $('#saveQuick');
    if (quick) quick.hidden = !!ui.editingId || ui.formStatus !== 'finished';
    if (!ui.editingId) {
      $('#addPageTitle').textContent = ui.formStatus === 'wish' ? '新的想看' : ui.formStatus === 'reading' ? '开始在看' : '新记录';
    }
    placeStatusBlob(); // v2.0.2：液态指示块跟随
  }

  function syncTypeButtons() {
    $$('#typeGrid .type-option').forEach(b => b.classList.toggle('active', b.dataset.type === ui.formType));
    syncCreatorField();
  }

  // v2.0 · 创作者字段按类型切换：书/漫画=作者，电影=导演，游戏=制作人/工作室，专辑=歌手
  const CREATOR_META = {
    book:   { label: '作者', placeholder: '如：余华' },
    comic:  { label: '作者', placeholder: '如：藤本树 / 芥见下下' },
    film:   { label: '导演', placeholder: '如：王家卫' },
    game:   { label: '制作人 / 工作室', placeholder: '如：宫崎英高 / FromSoftware' },
    album:  { label: '歌手 / 创作者', placeholder: '如：周杰伦' }
  };

  function syncCreatorField() {
    const field = $('#creatorField');
    if (!field) return;
    const meta = CREATOR_META[ui.formType];
    field.hidden = !meta;
    if (!meta) return;
    const label = $('#creatorLabel');
    const input = $('#formCreator');
    if (label) label.textContent = meta.label;
    if (input) input.placeholder = meta.placeholder;
  }

  function renderFormIcon() {
    const title = $('#formTitle').value.trim() || '新';
    const preview = {
      type: ui.formType,
      title,
      icon: ui.formIcon
    };
    $('#formIconPreview').innerHTML = coverHTML(preview, 'preview');
  }

  function syncRating() {
    const range = $('#formRating');
    const value = Number(range.value);
    $('#formScore').textContent = value.toFixed(1);
    range.style.setProperty('--fill', (value * 10) + '%');
  }
  function renderTagChips() {
    const tags = tagsForType(ui.formType);
    const selected = $('#formTag').value.trim();
    $('#tagChips').innerHTML = tags
      .map(tag => `<button type="button" class="category-chip${tag === selected ? ' active' : ''}" data-tag="${esc(tag)}">${esc(tag)}</button>`)
      .join('');
    $('#tagOptions').innerHTML = tags.map(tag => `<option value="${esc(tag)}"></option>`).join('');
  }

  // quick === true 时是「先存下」：不写没被真正动过的默认 8.5 分，
  // 其余字段照填什么存什么（这样不会把用户已经写下的内容丢掉）。
  // 注意 #saveWork 是 addEventListener 直传，那时 quick 是事件对象 —— 只认严格 true。
  function saveWork(quick) {
    const fast = quick === true;
    const title = $('#formTitle').value.trim();
    if (!title) { toast('先写下作品名称'); $('#formTitle').focus(); return; }
    const status = ui.formStatus;
    const type = ui.formType;
    const old = ui.editingId ? getWork(ui.editingId) : null;
    const now = nowTs();

    let w = old;
    if (!w) {
      w = {
        id: uid('w'), status, type, title, icon: ui.formIcon || null,
        images: [], notes: [], createdAt: now
      };
      db.works.unshift(w);
    } else {
      w.status = status;
      w.type = type;
      w.title = title;
      w.icon = ui.formIcon || null;
      w.updatedAt = now;
    }
    // 创作者：书/漫画=作者，电影=导演，游戏=制作人/工作室，专辑=歌手
    if ($('#formCreator')) {
      const creator = $('#formCreator').value.trim();
      if (creator) w.creator = creator;
      else delete w.creator;
    }

    if (status === 'finished') {
      // 「先存下」且没动过滑杆 → 不写分数（rating=null 表示还没打，不是 0 分）
      const keepRating = fast && !ui.ratingTouched && !old;
      w.rating = keepRating ? null : Number($('#formRating').value);
      w.date = $('#formDate').value || todayISO();
      w.finishedAt = w.date;
      const thought = $('#formThought').value.trim();
      w.thought = thought;
      // 旧版单一感想与时间线共用同一条记录，避免完成后出现两份内容
      syncLegacyNote(w, thought);
      w.done = false;
    } else if (status === 'reading') {
      w.startedAt = $('#formStartedAt').value || todayISO();
      w.done = false;
      const note = $('#formInitialNote').value.trim();
      if (note) {
        const notes = ensureNotes(w);
        notes.push({ id: uid('n'), workId: w.id, tag: '想法', text: note, images: [], createdAt: now });
      }
    } else if (status === 'wish') {
      w.tag = $('#formTag').value.trim();
      w.why = $('#formWhy').value.trim();
      w.addedAt = w.addedAt || todayISO();
      if (!old) w.done = false;
      if (old && old.status !== 'wish') w.done = false;
    }

    if (!saveDB()) return;
    const wasNew = !old;
    closeAdd(true);   // 保存成功 = 整条新建流程结束：抽屉与底下的新建页一起收
    renderAll();
    if (ui.detailId) renderDetail();
    if (wasNew) {
      switchTab(status === 'wish' ? 'wishlist' : status === 'reading' ? 'reading' : 'records');
    } else if (ui.detailId) {
      renderDetail();
    }
    toast(wasNew
      ? (status === 'wish' ? '已加入想看' : status === 'reading' ? '已开始记录'
        : fast ? '已存下 · 评分和感想可以之后补' : '已保存')
      : '已保存修改');
  }

  // ── wish / reading actions ──────────────────────────────
  function toggleWish(id) {
    const w = getWork(id);
    if (!w || w.status !== 'wish') return;
    w.done = !w.done;
    if (w.done) w.finishedAt = todayISO();
    saveDB();
    renderWishlist();
    if (ui.detailId === id) renderDetail();
    toast(w.done ? '已看完，记录会留在这里' : '已移回待看');
  }

  function startReading(id) {
    const w = getWork(id);
    if (!w) return;
    w.status = 'reading';
    w.startedAt = todayISO();
    w.done = false;
    saveDB();
    closeDetail();
    switchTab('reading');
    ui.readingId = w.id;
    renderReading();
    toast('已开始');
  }

  function openNoteFor(id) {
    const w = getWork(id);
    if (!w) return;
    if (w.status !== 'reading') { toast('先开始看这部作品'); return; }
    ui.sheetWorkId = id;
    ui.sheetNoteId = null;
    ui.sheetTag = '想法';
    ui.sheetDraftImages = [];
    $('#sheetNoteTitle').textContent = '记一笔';
    $('#sheetWork').innerHTML = `${coverHTML(w, 'tiny')}<div class="sheet-work-info"><b>${esc(w.title)}</b><small>已记录 ${(w.notes || []).length} 条感想 · ${esc(TYPES[w.type].label)}</small></div>`;
    $('#sheetNoteText').value = '';
    $('#sheetImagePreview').innerHTML = '';
    $$('#sheetTags .tag-btn').forEach(b => b.classList.toggle('on', b.dataset.sheetTag === '想法'));
    openSheet('noteSheet');
  }

  function saveReadingNote() {
    const w = getWork(ui.readingId);
    if (!w) return;
    const input = $('#readingNoteInput');
    const text = input.value.trim();
    const images = ui.readingDraftImages.slice();
    if (!text && !images.length) { input.focus(); toast('先写点什么吧'); return; }
    const tagBtn = $('.composer .tag-btn.on');
    const tag = tagBtn ? tagBtn.dataset.readingTag : '想法';
    const notes = ensureNotes(w);
    notes.push({ id: uid('n'), workId: w.id, tag, text, images, createdAt: nowTs() });
    if (!saveDB()) return;
    input.value = '';
    ui.readingDraftImages = [];
    renderReading();
    renderRecords();
    if (ui.detailId === w.id) renderDetail();
    toast('已记下这一笔');
  }

  // ── search ──────────────────────────────────────────────
  function openSearch() {
    ui.searchQuery = '';
    $('#searchInput').value = '';
    renderSearch();
    $('#searchPage').classList.add('open');
    $('#searchPage').setAttribute('aria-hidden', 'false');
    setTimeout(() => $('#searchInput').focus(), 120);
  }
  function closeSearch() {
    $('#searchPage').classList.remove('open');
    $('#searchPage').setAttribute('aria-hidden', 'true');
  }
  function renderSearch() {
    const q = ui.searchQuery.trim().toLowerCase();
    const box = $('#searchResults');
    if (!q) {
      const hist = searchHistory();
      if (hist.length) {
        box.innerHTML = `<div class="search-hist">
          <div class="search-hist-head">
            <span class="search-hist-title">搜索历史</span>
            <button class="search-hist-clear" data-action="clear-search-hist">清空</button>
          </div>
          ${hist.map((h, i) => `<div class="search-hist-item" data-hist="${i}">
            <svg class="icon"><use href="#i-search"/></svg>
            <span class="search-hist-text">${esc(h)}</span>
            <button class="search-hist-del" data-action="del-search-hist" data-idx="${i}" aria-label="删除"><svg class="icon"><use href="#i-close"/></svg></button>
          </div>`).join('')}
        </div>`;
      } else {
        box.innerHTML = `<div class="search-empty">输入作品名、作者或感想<br>找到你想回看的那一部</div>`;
      }
      return;
    }
    const results = db.works.filter(w => {
      const blob = [w.title, w.creator, w.thought, w.why, w.tag, ...(w.notes || []).map(n => n.text)].join(' ').toLowerCase();
      return blob.includes(q);
    });
    if (!results.length) {
      box.innerHTML = `<div class="search-empty">没有找到</div>`;
      return;
    }
    box.innerHTML = results.map(w => `<div class="search-result" data-action="open-detail" data-id="${w.id}" tabindex="0" role="button">
      ${coverHTML(w)}
      <div class="search-result-main">
        <div class="search-result-title">${esc(w.title)}</div>
        <div class="search-result-meta">${TYPES[w.type].label} · ${esc(statusText(w))} ${w.creator ? '· ' + esc(w.creator) : ''}</div>
      </div>
      ${icon('arrow-right')}
    </div>`).join('');
  }

  // ── image handling ──────────────────────────────────────
  function compressImage(file, maxSize = 1400, quality = 0.8, square = false) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          if (square) {
            const side = Math.min(img.naturalWidth, img.naturalHeight);
            canvas.width = 600; canvas.height = 600;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 600, 600);
            const sx = (img.naturalWidth - side) / 2;
            const sy = (img.naturalHeight - side) / 2;
            ctx.drawImage(img, sx, sy, side, side, 0, 0, 600, 600);
          } else {
            let w = img.naturalWidth, h = img.naturalHeight;
            if (w > maxSize || h > maxSize) {
              const scale = Math.min(maxSize / w, maxSize / h);
              w = Math.round(w * scale); h = Math.round(h * scale);
            }
            canvas.width = w; canvas.height = h;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
            ctx.drawImage(img, 0, 0, w, h);
          }
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL('image/jpeg', quality));
        } catch (e) {
          URL.revokeObjectURL(url);
          reject(e);
        }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image decode failed')); };
      img.src = url;
    });
  }

  // data URL → 居中裁剪为正方形（原生回传的图非方形，图标需裁方）
  function squareDataUrl(src, size = 600) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = size; canvas.height = size;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, size, size);
          const side = Math.min(img.naturalWidth, img.naturalHeight);
          const sx = (img.naturalWidth - side) / 2;
          const sy = (img.naturalHeight - side) / 2;
          ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
          resolve(canvas.toDataURL('image/jpeg', 0.86));
        } catch (e) { reject(e); }
      };
      img.onerror = () => reject(new Error('decode failed'));
      img.src = src;
    });
  }

  async function handleIconFile(files) {
    const file = files && files[0];
    if (!file) return;
    try {
      const src = (typeof file === 'string') ? file : await compressImage(file, 2400, 0.92, false);
      const targetId = ui.iconEditTarget;
      openCropper(src, 'icon', data => {
        if (!data) return;
        if (targetId) {
          const w = getWork(targetId);
          if (!w) return;
          w.icon = data;
          if (!saveDB()) return;
          ui.iconEditTarget = null;
          renderAll();
          if (ui.detailId === w.id) renderDetail();
          toast('作品图标已更换');
        } else {
          ui.formIcon = data;
          renderFormIcon();
          toast('图标已选好');
        }
      });
    } catch (e) {
      toast('这张图片无法读取');
    }
  }

  async function handleGalleryFiles(files) {
    const w = getWork(ui.detailId);
    if (!w || !files || !files.length) return;
    const replace = ui.galleryMode === 'replace';
    ui.galleryMode = 'add';
    w.images = Array.isArray(w.images) ? w.images : [];
    const max = 8;
    const remain = Math.max(0, max - w.images.length);
    if (!replace && !remain) { toast('最多保存 8 张图片'); return; }
    const list = Array.from(files).slice(0, replace ? 1 : remain);

    // 单张：先矩形裁切再入库；多张：批量压缩不打断
    if (list.length === 1) {
      try {
        const src = typeof list[0] === 'string' ? list[0] : await compressImage(list[0], 2400, 0.92, false);
        openCropper(src, 'photo', data => { if (data) applyGalleryImages(w, [data], replace); });
      } catch (e) { toast('图片无法读取'); }
      return;
    }

    toast('正在导入图片…');
    const urls = [];
    for (const file of list) {
      try {
        urls.push(typeof file === 'string' ? file : await compressImage(file, 1400, 0.78, false));
      } catch (e) { /* skip broken file */ }
    }
    if (!urls.length) { toast('图片无法读取'); return; }
    applyGalleryImages(w, urls, replace);
  }

  function applyGalleryImages(w, urls, replace) {
    if (!w || !urls || !urls.length) return;
    w.images = Array.isArray(w.images) ? w.images : [];
    if (replace) {
      // 更换当前这张：不新增作品、不新增图片，只替换当前页
      const at = clampNum(ui.heroIndex, 0, Math.max(0, w.images.length - 1));
      if (w.images.length) w.images[at] = urls[0];
      else w.images.push(urls[0]);
      if (at === 0 || !w.icon) w.icon = w.images[0];
      if (!saveDB()) return;
      renderAll();
      renderDetail();
      toast('已更换这张图片');
      return;
    }
    const hadImages = w.images.length > 0;
    w.images.push(...urls);
    if (!hadImages) w.icon = w.images[0];
    if (!saveDB()) return;
    renderAll();
    renderDetail();
    toast(`已导入 ${urls.length} 张图片`);
  }

  // ── note media ───────────────────────────────────────────
  function draftArray(target) {
    if (target === 'dt-note') return ui.detailId ? getDraft(ui.detailId).images : null;
    if (target === 'sheet-note') return ui.sheetDraftImages;
    if (target === 'reading-note') return ui.readingDraftImages;
    return null;
  }
  function draftPreviewSelector(target) {
    if (target === 'dt-note') return '#dtNotePreview';
    if (target === 'sheet-note') return '#sheetImagePreview';
    if (target === 'reading-note') return '#readingImagePreview';
    return '';
  }
  function refreshDraftPreview(target) {
    const el = $(draftPreviewSelector(target));
    if (el) el.innerHTML = draftImagesHTML(draftArray(target) || []);
  }
  async function handleCommentImages(files) {
    const target = ui.imageTarget;
    const list = draftArray(target);
    if (!list || !files || !files.length) return;
    const remain = Math.max(0, 4 - list.length);
    if (!remain) { toast('每条感想最多 4 张图片'); return; }
    const selected = Array.from(files).slice(0, remain);
    toast('正在添加图片…');
    for (const file of selected) {
      try {
        list.push(typeof file === 'string' ? file : await compressImage(file, 1200, 0.8, false));
      } catch (e) { /* skip broken file */ }
    }
    if (!list.length) { toast('图片无法读取'); return; }
    refreshDraftPreview(target);
    autosizeComposer();
    if (target === 'dt-note') { const input = $('#dtNoteInput'); if (input) input.focus(); }
    if (target === 'reading-note') { const input = $('#readingNoteInput'); if (input) input.focus(); }
    if (target === 'sheet-note') { const input = $('#sheetNoteText'); if (input) input.focus(); }
    toast('图片已添加');
  }

  // ── 评分编辑 ─────────────────────────────────────────────
  function startRatingEdit() {
    const w = getWork(ui.detailId);
    if (!w) return;
    const rated = w.rating !== null && w.rating !== undefined && w.rating !== '' && Number.isFinite(Number(w.rating));
    ui.ratingDraft = rated ? Number(w.rating) : 8;
    ui.ratingEditing = true;
    $('#detailRating').innerHTML = detailRatingHTML(w);
    const range = $('#dtRange');
    if (range) { try { range.focus({ preventScroll: true }); } catch (e) { range.focus(); } }
  }

  function cancelRatingEdit() {
    ui.ratingEditing = false;
    const w = getWork(ui.detailId);
    if (w) $('#detailRating').innerHTML = detailRatingHTML(w);
  }

  function saveRating() {
    const w = getWork(ui.detailId);
    if (!w) return;
    const value = Math.round(clampNum(Number(ui.ratingDraft) || 0, 0, 10) * 10) / 10;
    w.rating = value;
    w.updatedAt = nowTs();
    if (!saveDB()) return;
    ui.ratingEditing = false;
    renderRecords();
    renderDetail();
    toast('评分已更新');
  }

  // ── 感想：保存 / 编辑 / 删除 ─────────────────────────────
  function saveDetailNote() {
    const w = getWork(ui.detailId);
    if (!w) return;
    const input = $('#dtNoteInput');
    const draft = getDraft(w.id);
    const text = input ? input.value.trim() : String(draft.text || '').trim();
    const images = (draft.images || []).slice();
    if (!text && !images.length) {
      if (input) input.focus();
      toast('先写点什么吧');
      return;
    }
    const notes = ensureNotes(w);
    notes.push({
      id: uid('n'), workId: w.id, tag: draft.tag === '摘抄' ? '摘抄' : '想法',
      text, images, createdAt: nowTs()
    });
    if (!saveDB()) return;
    draft.text = '';
    draft.images = [];
    draft.tag = '想法';
    if (input) input.value = '';
    persistDrafts();
    renderReading();
    renderRecords();
    renderDetail();
    toast('已记下这一笔');
  }

  function openNoteMenu(workId, noteId) {
    const w = getWork(workId);
    const note = w && (w.notes || []).find(n => n.id === noteId);
    if (!note) return;
    $('#actionContent').innerHTML = `<div class="action-title">${esc(fmtNoteTime(note.createdAt))} · ${esc(note.tag || '想法')}</div>
      <button class="action-item" data-action="edit-note" data-work-id="${workId}" data-note-id="${noteId}">${icon('pen')}编辑感想</button>
      <button class="action-item danger" data-action="delete-note" data-work-id="${workId}" data-note-id="${noteId}">${icon('trash')}删除感想</button>
      <button class="action-cancel" data-close="actions">取消</button>`;
    openSheet('actionSheet');
  }

  function openNoteEditor(workId, noteId) {
    const w = getWork(workId);
    const note = w && (w.notes || []).find(n => n.id === noteId);
    if (!w || !note) return;
    ui.sheetWorkId = workId;
    ui.sheetNoteId = noteId;
    ui.sheetTag = note.tag === '摘抄' ? '摘抄' : '想法';
    ui.sheetDraftImages = Array.isArray(note.images) ? note.images.slice() : [];
    $('#sheetNoteTitle').textContent = '编辑感想';
    $('#sheetWork').innerHTML = `${coverHTML(w, 'tiny')}<div class="sheet-work-info"><b>${esc(w.title)}</b><small>${esc(fmtNoteTime(note.createdAt))}</small></div>`;
    $('#sheetNoteText').value = note.text || '';
    $('#sheetImagePreview').innerHTML = draftImagesHTML(ui.sheetDraftImages);
    $$('#sheetTags .tag-btn').forEach(b => b.classList.toggle('on', b.dataset.sheetTag === ui.sheetTag));
    openSheet('noteSheet');
  }

  function saveSheetNote() {
    const w = getWork(ui.sheetWorkId);
    if (!w) return;
    const input = $('#sheetNoteText');
    const text = input ? input.value.trim() : '';
    const images = (ui.sheetDraftImages || []).slice();
    if (!text && !images.length) {
      if (input) input.focus();
      toast('先写点什么吧');
      return;
    }
    const notes = ensureNotes(w);
    const editing = ui.sheetNoteId ? notes.find(n => n.id === ui.sheetNoteId) : null;
    if (editing) {
      editing.text = text;
      editing.tag = ui.sheetTag === '摘抄' ? '摘抄' : '想法';
      editing.images = images;
      editing.editedAt = nowTs();
    } else {
      notes.push({
        id: uid('n'), workId: w.id, tag: ui.sheetTag === '摘抄' ? '摘抄' : '想法',
        text, images, createdAt: nowTs()
      });
    }
    if (!saveDB()) return;
    ui.sheetNoteId = null;
    ui.sheetDraftImages = [];
    if (input) input.value = '';
    closeSheet('noteSheet');
    renderAll();
    if (ui.detailId === w.id) renderDetail();
    toast(editing ? '感想已更新' : '已记下这一笔');
  }

  function deleteNote(workId, noteId) {
    const w = getWork(workId);
    if (!w || !Array.isArray(w.notes)) return;
    const idx = w.notes.findIndex(n => n.id === noteId);
    closeSheet('actionSheet');
    if (idx < 0) return;
    const [removed] = w.notes.splice(idx, 1);
    // 删掉的是旧版「感想」并入的那条时，同步清空旧字段，避免详情页与记录页不一致
    if (removed && (removed.legacy || removed.id === legacyNoteId(w.id))) {
      w.thought = '';
      w.thoughtImages = [];
    }
    if (!saveDB()) return;
    renderReading();
    renderRecords();
    if (ui.detailId === workId) renderDetail();
    toast('已删除这条感想');
  }

  // ── full image viewer ───────────────────────────────────
  function openViewer(images, index = 0) {
    const valid = (images || []).filter(Boolean);
    if (!valid.length) return;
    ui.viewerImages = valid;
    ui.viewerIndex = Math.max(0, Math.min(valid.length - 1, Number(index) || 0));
    renderViewer();
    const page = $('#imageViewer');
    page.classList.add('open');
    page.setAttribute('aria-hidden', 'false');
  }
  function renderViewer() {
    const img = $('#viewerImage');
    if (!img) return;
    img.src = ui.viewerImages[ui.viewerIndex] || '';
    $('#viewerCount').textContent = `${ui.viewerIndex + 1} / ${ui.viewerImages.length}`;
    const single = ui.viewerImages.length < 2;
    $$('#imageViewer .viewer-nav').forEach(btn => btn.hidden = single);
  }
  function closeViewer() {
    const page = $('#imageViewer');
    page.classList.remove('open');
    page.setAttribute('aria-hidden', 'true');
    $('#viewerImage').src = '';
  }
  function moveViewer(delta) {
    if (!ui.viewerImages.length) return;
    ui.viewerIndex = (ui.viewerIndex + delta + ui.viewerImages.length) % ui.viewerImages.length;
    renderViewer();
  }

  // ── now-card background picker + cropper ────────────────
  function openBackgroundPicker(id) {
    const w = getWork(id);
    if (!w || w.status !== 'reading') return;
    ui.bgWorkId = id;
    lingPickOrClick('#backgroundFile', 1, handleBackgroundFile);
  }
  // ── v2.0 · 通用矩形裁切（图标 / 卡片背景 / 相册图片） ─────
  // 任意位置框选：拖框内移动、拖四角缩放、点空白处重画；图标模式锁 1:1
  const CROP = { img: null, mode: 'photo', onDone: null, box: null, rect: null, drag: null };
  const CROP_MIN = 44;

  async function handleBackgroundFile(files) {
    const file = files && files[0];
    if (!file) return;
    const id = ui.bgWorkId;
    try {
      const src = (typeof file === 'string') ? file : await compressImage(file, 2400, 0.92, false);
      openCropper(src, 'card', data => {
        if (!data) return;
        const w = getWork(id);
        if (!w) return;
        w.backgroundImage = data;
        if (!saveDB()) return;
        renderRecords();
        toast('卡片背景已更新');
      });
    } catch (e) {
      toast('这张图片无法读取');
    }
  }

  function openCropper(src, mode, onDone) {
    const img = new Image();
    img.onload = () => {
      CROP.img = img;
      CROP.mode = mode || 'photo';
      CROP.onDone = onDone || null;
      CROP.drag = null;
      CROP.rect = null;
      CROP.box = null;
      $('#cropTitle').textContent = mode === 'icon' ? '裁切图标' : mode === 'card' ? '裁切卡片背景' : '裁切图片';
      $('#cropImage').src = src;
      const page = $('#cropPage');
      page.classList.add('open');
      page.setAttribute('aria-hidden', 'false');
      requestAnimationFrame(() => layoutCrop());
    };
    img.onerror = () => toast('这张图片无法读取');
    img.src = src;
  }

  function layoutCrop() {
    const c = CROP;
    if (!c.img) return;
    const stage = $('#cropStage');
    const r = stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const sc = Math.min(r.width / c.img.naturalWidth, r.height / c.img.naturalHeight);
    const w = c.img.naturalWidth * sc, h = c.img.naturalHeight * sc;
    c.box = { x: (r.width - w) / 2, y: (r.height - h) / 2, w, h };
    if (c.mode === 'icon') {
      const side = Math.min(w, h) * 0.72;
      c.rect = { x: (r.width - side) / 2, y: (r.height - side) / 2, w: side, h: side };
    } else {
      c.rect = { x: c.box.x + w * 0.07, y: c.box.y + h * 0.07, w: w * 0.86, h: h * 0.86 };
    }
    paintCropRect();
  }

  function paintCropRect() {
    const el = $('#cropRect');
    const rc = CROP.rect;
    if (!el || !rc) return;
    el.style.left = rc.x + 'px';
    el.style.top = rc.y + 'px';
    el.style.width = rc.w + 'px';
    el.style.height = rc.h + 'px';
  }

  function clampCropRect(rect) {
    const b = CROP.box;
    if (!b) return rect;
    const min = Math.min(CROP_MIN, b.w, b.h);
    rect.w = Math.max(min, Math.min(rect.w, b.w));
    rect.h = Math.max(min, Math.min(rect.h, b.h));
    rect.x = Math.max(b.x, Math.min(rect.x, b.x + b.w - rect.w));
    rect.y = Math.max(b.y, Math.min(rect.y, b.y + b.h - rect.h));
    return rect;
  }

  function cropPointerPos(e) {
    const r = $('#cropStage').getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function cropDown(e) {
    if (!CROP.box) return;
    e.preventDefault();
    try { $('#cropStage').setPointerCapture(e.pointerId); } catch (err) {}
    const p = cropPointerPos(e);
    const handle = e.target.closest('.crop-handle');
    const rc = CROP.rect;
    const inRect = p.x >= rc.x && p.x <= rc.x + rc.w && p.y >= rc.y && p.y <= rc.y + rc.h;
    CROP.drag = {
      kind: handle ? 'resize' : (inRect ? 'move' : 'new'),
      h: handle ? handle.dataset.h : '',
      start: p,
      orig: { x: rc.x, y: rc.y, w: rc.w, h: rc.h }
    };
    if (CROP.drag.kind === 'new') {
      CROP.rect = clampCropRect({ x: p.x, y: p.y, w: CROP_MIN, h: CROP_MIN });
      paintCropRect();
    }
  }

  function cropMove(e) {
    const d = CROP.drag;
    if (!d) return;
    e.preventDefault();
    const p = cropPointerPos(e);
    const dx = p.x - d.start.x, dy = p.y - d.start.y;
    const o = CROP.rect;
    const box = CROP.box;

    if (d.kind === 'move') {
      o.x = d.orig.x + dx;
      o.y = d.orig.y + dy;
      clampCropRect(o);
    } else if (d.kind === 'resize') {
      let l = d.orig.x, t = d.orig.y;
      let r = d.orig.x + d.orig.w, b = d.orig.y + d.orig.h;
      if (d.h.indexOf('w') >= 0) l = d.orig.x + dx;
      if (d.h.indexOf('e') >= 0) r = d.orig.x + d.orig.w + dx;
      if (d.h.indexOf('n') >= 0) t = d.orig.y + dy;
      if (d.h.indexOf('s') >= 0) b = d.orig.y + d.orig.h + dy;
      l = Math.max(box.x, Math.min(l, r - CROP_MIN));
      r = Math.min(box.x + box.w, Math.max(r, l + CROP_MIN));
      t = Math.max(box.y, Math.min(t, b - CROP_MIN));
      b = Math.min(box.y + box.h, Math.max(b, t + CROP_MIN));
      let rect = { x: l, y: t, w: r - l, h: b - t };
      if (CROP.mode === 'icon') {
        // 图标：锁正方形，以未拖动的对角为锚点
        const side = Math.max(rect.w, rect.h);
        if (d.h.indexOf('w') >= 0) rect.x = Math.max(box.x, rect.x + rect.w - side);
        if (d.h.indexOf('n') >= 0) rect.y = Math.max(box.y, rect.y + rect.h - side);
        const fit = Math.min(side, box.x + box.w - rect.x, box.y + box.h - rect.y);
        rect.w = fit; rect.h = fit;
      }
      CROP.rect = clampCropRect(rect);
    } else {
      const x = Math.min(d.start.x, p.x), y = Math.min(d.start.y, p.y);
      const w = Math.max(1, Math.abs(p.x - d.start.x)), h = Math.max(1, Math.abs(p.y - d.start.y));
      CROP.rect = clampCropRect({ x, y, w, h });
    }
    paintCropRect();
  }

  function cropUp() {
    const d = CROP.drag;
    CROP.drag = null;
    if (!d) return;
    if (d.kind === 'new' && CROP.rect && (CROP.rect.w < CROP_MIN || CROP.rect.h < CROP_MIN)) {
      CROP.rect = clampCropRect({ x: d.orig.x, y: d.orig.y, w: d.orig.w, h: d.orig.h });
      paintCropRect();
    }
  }

  function closeCropPage() {
    const page = $('#cropPage');
    page.classList.remove('open');
    page.setAttribute('aria-hidden', 'true');
    $('#cropImage').src = '';
    CROP.img = null; CROP.onDone = null; CROP.drag = null; CROP.rect = null; CROP.box = null;
    ui.bgWorkId = null;
  }

  function useCrop() {
    const c = CROP;
    if (!c.img || !c.box || !c.rect) { closeCropPage(); return; }
    const sc = c.img.naturalWidth / c.box.w;
    let sx = (c.rect.x - c.box.x) * sc;
    let sy = (c.rect.y - c.box.y) * sc;
    let sw = c.rect.w * sc;
    let sh = c.rect.h * sc;
    sx = Math.max(0, Math.min(c.img.naturalWidth - 1, sx));
    sy = Math.max(0, Math.min(c.img.naturalHeight - 1, sy));
    sw = Math.max(1, Math.min(c.img.naturalWidth - sx, sw));
    sh = Math.max(1, Math.min(c.img.naturalHeight - sy, sh));

    let outW, outH;
    if (c.mode === 'icon') {
      outW = outH = 600;
      const side = Math.min(sw, sh);
      sx += (sw - side) / 2; sy += (sh - side) / 2; sw = sh = side;
    } else if (c.mode === 'card') {
      outW = 1200; outH = Math.max(1, Math.round(outW * sh / sw));
    } else {
      outW = Math.min(1400, Math.round(sw)); outH = Math.max(1, Math.round(outW * sh / sw));
      if (outH > 1400) { outH = 1400; outW = Math.max(1, Math.round(outH * sw / sh)); }
    }
    const canvas = document.createElement('canvas');
    canvas.width = outW; canvas.height = outH;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, outW, outH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(c.img, sx, sy, sw, sh, 0, 0, outW, outH);
    const data = canvas.toDataURL('image/jpeg', c.mode === 'card' ? 0.84 : 0.86);
    const done = c.onDone;
    closeCropPage();
    if (done) done(data);
  }

  function removeBackground(id) {
    const w = getWork(id);
    if (!w) return;
    w.backgroundImage = null;
    saveDB();
    renderRecords();
    closeSheet('actionSheet');
    if (ui.detailId === id) renderDetail();
    toast('已移除卡片背景');
  }

  // ── sheet utilities ─────────────────────────────────────
  // 弹层开/关统一走这里：进入用 CSS 动画，退出补一段 180ms 的反向动画。
  // seq 令牌保证「关闭动画未播完又被打开」时不会把新弹层关掉。
  let sheetSeq = 0;
  function openSheet(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const wasOpen = el.classList.contains('open');
    el.dataset.seq = String(++sheetSeq);
    el.classList.remove('closing');
    if (wasOpen) {
      // 内容已被替换时重播进入动画（同名 class 重复添加不会重启 CSS animation）
      el.classList.remove('open');
      void el.offsetWidth;
    }
    el.classList.add('open');
    el.setAttribute('aria-hidden', 'false');
  }
  function closeSheet(id) {
    const el = document.getElementById(id);
    if (!el || !el.classList.contains('open') || el.classList.contains('closing')) return;
    el.setAttribute('aria-hidden', 'true');
    if (!dragMotionOK()) { el.classList.remove('open', 'closing'); return; }
    const seq = String(++sheetSeq);
    el.dataset.seq = seq;
    el.classList.add('closing');
    setTimeout(() => {
      if (el.dataset.seq !== seq) return;
      el.classList.remove('open', 'closing');
    }, 180);
  }
  function closeAllSheets() {
    closeSheet('noteSheet');
    closeSheet('actionSheet');
  }
  function closeNoteSheet() {
    closeSheet('noteSheet');
    ui.sheetNoteId = null;
    ui.sheetDraftImages = [];
    const input = $('#sheetNoteText');
    if (input) input.value = '';
    const preview = $('#sheetImagePreview');
    if (preview) preview.innerHTML = '';
  }

  // ══════════════════════════════════════════════════════════════════
  // 阶段2 · 卡片整理模式：单一状态机（长按浮起 → 拖动排序 / 置顶 / 删除）
  //
  // 设计原则：
  //   1. 只有一个可变状态对象 DRAG。置顶、排序、删除都从它读几何，
  //      不再各自维护 index / target / zone（v1.9 曾是三份互相打架的状态）。
  //   2. 数据只有一个真源：work.sortNo。拖动落位后由 commitListOrder()
  //      一次性重算全部 sortNo 并走 saveDB()，不做局部修补。
  //   3. 所有动画只碰 transform / opacity；几何在拖动开始时缓存一次，
  //      移动过程中不读布局（避免每帧强制重排）。
  //   4. 落位用 ghost 补间到目标槽位，落定后再重排 DOM —— 视觉上无跳变，
  //      因此不需要 FLIP，也不需要给整页做 transition。
  // ══════════════════════════════════════════════════════════════════
  const SORT_GAP = 8;             // .record-list 的 gap
  const AUTO_SCROLL_EDGE = 96;    // 距视口边缘多近开始自动滚动
  const AUTO_SCROLL_MAX = 15;     // 自动滚动最大速度（px/帧）
  const AUTO_SCROLL_RAMP = 260;   // 从 0.55× 起步、260ms 内加到 1×
  const LP_MS = 340;              // 长按判定时长
  const LP_SLOP = 10;             // 长按期间允许的位移
  // 浮起倍率 1.03 写在 CSS（.drag-ghost.lift > .record）：
  // 位移交给外层内联 transform，缩放交给内层过渡，两者不抢同一个属性。
  const SETTLE_MS = 220;          // 松手落位时长
  const SWAP_HYST = 6;            // 换位迟滞（px）：临界点附近不来回抖

  let DRAG = null;
  let dragLock = 0;               // 落位动画期间锁住，避免第二次长按打断动画
  let lpTimer = null, lpCard = null, lpPoint = null;

  function dragMotionOK() {
    try { return !matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return true; }
  }

  function ensureDragZones() {
    if (!$('#dragZoneTop')) {
      const top = document.createElement('div');
      top.className = 'drag-zone drag-zone-top';
      top.id = 'dragZoneTop';
      top.innerHTML = '<div class="drag-chip">' + icon('bookmark') + '<span>松手置顶</span></div>';
      $('#app').appendChild(top);
    }
    if (!$('#dragZoneBottom')) {
      const bottom = document.createElement('div');
      bottom.className = 'drag-zone drag-zone-bottom';
      bottom.id = 'dragZoneBottom';
      bottom.innerHTML = '<div class="drag-chip drag-chip-danger">' + icon('trash') + '<span>拖到这里删除</span></div>';
      $('#app').appendChild(bottom);
    }
  }

  // 参与排序的卡片（筛选态下被 hidden 的卡不参与换位计算）
  function dragCards() {
    return $$('#recordList .record').filter(el => !el.hidden);
  }

  // 进入整理：只做「建立状态 + 几何快照 + 浮起」，不含任何数据变更
  function beginOrganize(card, clientY) {
    if (DRAG || dragLock || !card) return;
    const w = getWork(card.dataset.id);
    if (!w) return;

    const cards = dragCards();
    const origIndex = cards.indexOf(card);
    if (origIndex < 0) return;

    const sc = document.querySelector('.screen.active');
    const rect = card.getBoundingClientRect();

    // 几何快照（滚动内容坐标系）。拖动全程不再读布局。
    // 卡片高度并不一致（感想一行/两行、有无评分），所以不能用「统一 step」推位置——
    // 那样拖一张高卡越过矮卡时会算错，孔洞与 ghost 对不上。
    // 这里记下每张卡的顶边与真实高度，换位时按真实高度累加。
    const scTop = sc ? sc.getBoundingClientRect().top : 0;
    const baseScroll = sc ? sc.scrollTop : 0;
    const rects = cards.map(el => {
      const r = el.getBoundingClientRect();
      return { top: r.top - scTop + baseScroll, h: r.height };
    });
    const tops = rects.map(r => r.top);
    const listTop = tops[0];

    // 「抽走被拖卡之后」的槽位累计表（相对 listTop）：
    // pref[k] = 第 k 个槽位的顶边，k ∈ [0, 卡数-1]，正好等于目标下标 t 的取值范围。
    const oTops = [], oHeights = [];
    cards.forEach((el, i) => {
      if (i === origIndex) return;
      oTops.push(rects[i].top);
      oHeights.push(rects[i].h);
    });
    const pref = [0];
    oHeights.forEach(h => pref.push(pref[pref.length - 1] + h + SORT_GAP));

    // 浮起的 ghost 分两层：外层 fixed 只负责「跟随指针的 translateY」，
    // 内层克隆卡只负责「浮起的 scale」。合成属性拆开写，缩放才能走 180ms 缓动
    // 而不是长按那一刻硬跳到 1.03；也避免 WAAPI 与内联 transform 互相覆盖
    //（v2.3.0 的教训：fill:forwards 的动画会顶掉每帧写的 translateY）。
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.style.width = rect.width + 'px';
    ghost.style.left = rect.left + 'px';
    ghost.style.top = rect.top + 'px';
    ghost.style.transform = 'translateY(0)';
    const ghostCard = card.cloneNode(true);
    ghostCard.classList.remove('drag-placeholder');
    ghostCard.removeAttribute('tabindex');
    ghost.appendChild(ghostCard);
    document.body.appendChild(ghost);
    // 用 setTimeout 而不是 rAF：rAF 在切后台/合成器回收时会被挂起，
    // 而「浮起」是状态的一部分，不能依赖一帧是否被调度。
    if (dragMotionOK()) setTimeout(() => ghost.classList.add('lift'), 16);

    card.classList.add('drag-placeholder');
    $('#recordList').classList.add('organizing');
    document.body.classList.add('drag-active');
    ensureDragZones();
    $('#dragZoneTop').classList.add('show');
    $('#dragZoneBottom').classList.add('show');
    buzzer(15);
    ui.longPressFired = true;

    const zt = $('#dragZoneTop'), zb = $('#dragZoneBottom');
    const ctr = zt && zt.querySelector('.drag-chip');
    const cbr = zb && zb.querySelector('.drag-chip');
    // 顶部胶囊按「手里这张是不是置顶卡」切换语义：置顶卡拖回顶部 = 取消置顶
    if (ctr) {
      const label = ctr.querySelector('span');
      if (label) label.textContent = w.pinnedAt ? '松手取消置顶' : '松手置顶';
      ctr.classList.toggle('drag-chip-unpin', !!w.pinnedAt);
    }

    DRAG = {
      card, ghost, w, cards, tops, listTop,
      holeTop0: tops[origIndex] - listTop,   // 被拖卡原始顶边（相对列表顶）
      oTops, oHeights, pref,
      startY: clientY, lastY: clientY,
      baseTop: rect.top,
      h: rect.height,
      sc, baseScroll,
      origIndex,
      target: origIndex,
      n: cards.length - 1,
      zone: null, dir: 0, dirSign: 0, dirSince: 0, raf: 0,
      // 胶囊判定用的一次性测量（避免每帧 getBoundingClientRect）
      zoneTopEdge: ctr ? ctr.getBoundingClientRect().bottom + 14 : 0,
      zoneBottomEdge: cbr ? cbr.getBoundingClientRect().top - 14 : Infinity
    };
    DRAG.raf = requestAnimationFrame(autoScrollStep);
  }

  // 边缘自动滚动：越贴近边缘越快；按住不动时缓慢加速，出区/松手立即停
  function autoScrollStep(now) {
    if (!DRAG) return;
    const d = DRAG;
    if (d.dir && d.sc) {
      const ramp = Math.min(1, Math.max(0, (now - (d.dirSince || now)) / AUTO_SCROLL_RAMP));
      const before = d.sc.scrollTop;
      d.sc.scrollTop = before + d.dir * (0.55 + 0.45 * ramp);
      if (d.sc.scrollTop === before) d.dir = 0;       // 已到顶/底
      else moveDrag(d.lastY);                         // 滚动改变了孔洞目标
    }
    if (DRAG) DRAG.raf = requestAnimationFrame(autoScrollStep);
  }

  function moveDrag(clientY) {
    if (!DRAG) return;
    const d = DRAG;
    d.lastY = clientY;
    const dy = clientY - d.startY;
    d.ghost.style.transform = 'translateY(' + dy + 'px)';

    // 顶部置顶区 / 底部删除区（用进拖时量好的边，移动中不读布局）
    const zone = clientY < d.zoneTopEdge ? 'top' : (clientY > d.zoneBottomEdge ? 'bottom' : null);

    // 自动滚动只在「非功能区」时生效：落在置顶/删除区里还继续滚，
    // 孔洞却已回原位，看起来像列表自己在抽搐。
    const vh = window.innerHeight;
    let dir = 0;
    if (!zone) {
      if (clientY < AUTO_SCROLL_EDGE) dir = -Math.round((1 - clientY / AUTO_SCROLL_EDGE) * AUTO_SCROLL_MAX);
      else if (clientY > vh - AUTO_SCROLL_EDGE) dir = Math.round((1 - (vh - clientY) / AUTO_SCROLL_EDGE) * AUTO_SCROLL_MAX);
      if (dir && Math.abs(dir) < 2) dir = dir > 0 ? 2 : -2;
    }
    const sign = dir > 0 ? 1 : (dir < 0 ? -1 : 0);
    if (sign !== d.dirSign) { d.dirSign = sign; d.dirSince = performance.now(); }
    d.dir = dir;

    if (zone !== d.zone) {
      d.zone = zone;
      const zt = $('#dragZoneTop'), zb = $('#dragZoneBottom');
      if (zt) zt.classList.toggle('active', zone === 'top');
      if (zb) zb.classList.toggle('active', zone === 'bottom');
      d.ghost.classList.toggle('zone-hover', !!zone);
      if (zone) {
        // 进入功能区即视为取消本次排序：孔洞回原位，避免松手后列表顺序莫名变化
        d.target = d.origIndex;
        applyShifts();
      }
      buzzer(6);
    }
    if (zone) return;

    // 孔洞跟随：以「槽位中点」为界——被拖卡盖过邻卡一半就换位，超过一半立即让位。
    // 判据取两槽位顶边的中点（= 邻卡高度 + gap 的一半），不是「越过邻卡整条底边」；
    // 后者要拖满一整张卡的高度才换，手感像卡住了。等高度时这就是「中心交错」。
    // 迟滞 ±SWAP_HYST 保证临界点附近不来回抖。
    const off = d.sc ? d.sc.scrollTop - d.baseScroll : 0;
    const yRel = d.holeTop0 + dy + off;
    const M = SWAP_HYST;
    let t = d.target;
    while (t < d.n && yRel > (d.pref[t] + d.pref[t + 1]) / 2 + M) t++;
    while (t > 0 && yRel < (d.pref[t] + d.pref[t - 1]) / 2 - M) t--;

    // v2.4.3：拖动时不再有「置顶区块」这条硬边界。
    // 置顶只回答「新作品加进来时它是不是要在最上面」，拖动是用户亲手排，
    // 置顶卡同样是正常让位目标；把它挤下去以后由 reconcilePins() 摘掉置顶标记。

    if (t !== d.target) {
      d.target = t;
      applyShifts();
    }
  }

  // 孔洞（原卡隐形态）移到目标槽位，途经卡片依次让位，互不重叠。
  // 位移按「真实高度 + gap」算：被抽走的卡占位 (h + gap)，跨过它的卡平移正好这么多；
  // 被拖卡自己的位移 = 中间所有卡的真实高度之和，不是「卡数 × 自己的高度」。
  function applyShifts() {
    const d = DRAG;
    if (!d) return;
    const t = d.target;
    d.card.style.transform = t === d.origIndex ? '' : 'translateY(' + (d.pref[t] - d.holeTop0) + 'px)';
    const hGap = d.h + SORT_GAP;
    d.cards.forEach((c, i) => {
      if (c === d.card) return;
      const j = i > d.origIndex ? i - 1 : i;      // 在「抽走被拖卡」序列里的下标
      const fin = j < t ? j : j + 1;              // 落位后的下标
      const oldRel = d.oTops[j] - d.listTop;
      const newRel = fin <= t ? d.pref[fin] : d.pref[fin - 1] + hGap;
      const delta = newRel - oldRel;
      c.style.transform = Math.abs(delta) < 0.5 ? '' : 'translateY(' + delta + 'px)';
    });
  }

  // 落位：ghost 补间到孔洞现在所在的位置，与重排后的 DOM 位置严格重合
  function settleGhost(d, done) {
    const ghost = d.ghost;
    if (!dragMotionOK()) { done(); return; }
    const fromTop = ghost.getBoundingClientRect().top;
    const toTop = d.card.getBoundingClientRect().top;
    let anim;
    try {
      anim = ghost.animate(
        [{ transform: 'translateY(' + (fromTop - d.baseTop) + 'px)' },
         { transform: 'translateY(' + (toTop - d.baseTop) + 'px)' }],
        { duration: SETTLE_MS, easing: 'cubic-bezier(.22,.9,.26,1)' }
      );
    } catch (e) { done(); return; }
    // 缩放在内层由 CSS 过渡负责：撤掉 lift，卡片一边落位一边缩回 1
    ghost.classList.remove('lift');
    let settled = false;
    let guard = 0;
    const fin = () => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      done();
    };
    anim.onfinish = fin;
    anim.oncancel = fin;
    // 兜底：动画被系统打断（后台、合成器回收）时也必须落位，不能把状态卡住
    guard = setTimeout(fin, SETTLE_MS + 140);
  }

  // 结束整理。commit=false 时只还原，不写任何数据（pointercancel / 失焦 / 中断）
  function endDrag(commit) {
    if (!DRAG) return;
    const d = DRAG;
    DRAG = null;
    cancelAnimationFrame(d.raf);
    document.body.classList.remove('drag-active');

    const zt = $('#dragZoneTop'), zb = $('#dragZoneBottom');
    if (zt) zt.classList.remove('show', 'active');
    if (zb) zb.classList.remove('show', 'active');
    d.ghost.classList.remove('zone-hover');

    const listEl = $('#recordList');
    if (listEl) listEl.classList.remove('organizing');

    const zone = commit ? d.zone : null;
    const moved = commit && !zone && d.target !== d.origIndex;

    dragLock++;
    const resetAll = () => { d.cards.forEach(c => { c.style.transform = ''; }); };

    const finish = () => {
      d.ghost.remove();
      d.card.classList.remove('drag-placeholder');   // 长按后原地松手也必须还原可见
      dragLock--;

      // 中止 / 置顶 / 删除都不该留下换位位移
      if (!commit) { resetAll(); return; }

      // 顶部区是「置顶开关」：没置顶的置顶，已置顶的取消（v2.4.3）
      if (zone === 'top') { resetAll(); pinWork(d.w); return; }
      if (zone === 'bottom') { resetAll(); deleteWorkRequest(d.w); return; }
      if (moved) {
        const ids = d.cards.map(c => c.dataset.id);
        const seq = ids.slice();
        const [movedId] = seq.splice(d.origIndex, 1);
        seq.splice(d.target, 0, movedId);
        // 先按落位后的序列摘掉被挤下去的置顶标记，再一次性写 sortNo 落盘
        const off = reconcilePins(seq);
        commitListOrder(ids, d.origIndex, d.target);
        renderRecords();
        toast(off === 0 ? '顺序已保存'
          : off === 1 ? '顺序已保存 · 已取消置顶'
          : '顺序已保存 · ' + off + ' 项取消置顶', 'ok');
        return;
      }
      resetAll();
    };

    // 松手时整理态先退场（其余卡片回到满不透明），ghost 继续补间落位
    settleGhost(d, finish);
  }

  // ── 数据层：排序的唯一写入口 ─────────────────────────────
  // ids 是「当前展示顺序」的完整 id 序列；统一重算 sortNo 后一次落盘。
  function applyOrder(ids) {
    let i = 0;
    ids.forEach(id => { const w = getWork(id); if (w) w.sortNo = i++; });
    return saveDB();
  }

  // 只重排「当前可见」的那一段，不可见（筛选掉）的作品保持原相对位置
  function commitListOrder(visibleIds, from, to) {
    const seq = visibleIds.slice();
    const [moved] = seq.splice(from, 1);
    seq.splice(to, 0, moved);
    const pick = new Set(visibleIds);
    const full = displayFinished().map(w => w.id);
    let k = 0;
    return applyOrder(full.map(id => (pick.has(id) ? seq[k++] : id)));
  }

  // 置顶：sortNo 取「置顶区内最小值 - 1」，保证新置顶落在置顶区最前
  // （新置顶的卡压在之前置顶的卡上面）。
  // 已经是置顶卡再落进顶部区 = 取消置顶 —— 同一个手势反着用，不另设入口。
  function pinWork(w) {
    if (!w) return;
    if (w.pinnedAt) { unpinWork(w); return; }
    const pinned = db.works.filter(x => x.pinnedAt && x.sortNo != null);
    const min = pinned.length ? Math.min(...pinned.map(x => x.sortNo)) : 0;
    w.pinnedAt = Date.now();
    w.sortNo = min - 1;
    const ok = saveDB();
    renderRecords();
    toast(ok ? '已置顶' : '置顶未保存', ok ? 'ok' : 'err');
  }

  // 取消置顶：只摘掉「是不是置顶」这个标记，卡片留在它当前的位置。
  // 顺手把 sortNo 按当前展示顺序重写一遍：置顶时写的是「最小值 - 1」这种
  // 临时排序值，只 delete 标记的话它会按这个值继续赖在前排。
  function unpinWork(w) {
    if (!w || !w.pinnedAt) return 0;
    delete w.pinnedAt;
    const ids = dragCards().map(c => c.dataset.id);
    const i = ids.indexOf(w.id);
    if (i >= 0) commitListOrder(ids, i, i);   // from === to：只重写 sortNo，不动顺序
    else saveDB();
    renderRecords();
    toast('已取消置顶', 'ok');
    return 1;
  }

  // 拖动落位后对账：置顶只负责「加新作品时它在最上面」，不负责按住排序的时候挡路。
  // 一旦某张置顶卡被挤到普通卡下面，置顶标记就失效 ——
  // 否则 displayFinished 的「置顶优先」会把用户刚排好的顺序当场弹回顶部。
  // 判据：从落位序列的头往下走，遇到第一张非置顶卡之后，后面的置顶卡全部失效。
  // 顺便保证「顶到置顶位的普通卡不会自动变成置顶」：这里只会摘标记，从不加。
  function reconcilePins(seq) {
    let seenFree = false, off = 0;
    seq.forEach(id => {
      const w = getWork(id);
      if (!w) return;
      if (!w.pinnedAt) { seenFree = true; return; }
      if (seenFree) { delete w.pinnedAt; off++; }
    });
    return off;
  }

  // 删除：一律先确认，确认后才落盘（拖动不会误删）
  function deleteWorkRequest(w) {
    if (!w) return;
    const total = (w.notes || []).length;
    confirmModal({
      icon: 'trash',
      title: '删除《' + esc(w.title) + '》？',
      text: total ? '作品和它的 ' + total + ' 条感想都会被删除，无法撤销。' : '作品会被删除，无法撤销。',
      okLabel: '确认删除'
    }).then(ok => { if (ok) removeWork(w.id); });
  }

  function removeWork(id) {
    const idx = db.works.findIndex(x => x.id === id);
    if (idx < 0) return false;
    const refill = captureRecordTops(id);      // 量下剩余卡的旧位置
    db.works.splice(idx, 1);
    if (ui.detailId === id) closeDetail(true);
    if (ui.readingId === id) ui.readingId = null;
    const ok = saveDB();
    renderAll();
    playRefill(refill);                        // 剩下的卡滑上来补位
    toast(ok ? '已删除' : '已删除，但保存失败', ok ? 'ok' : 'err');
    return true;
  }

  // 删除后补位：先记下剩余卡片的旧顶边，重排后用 transform 补差再放开，
  // 卡片是「滑上来」而不是瞬移。一次性动画，只碰 transform。
  function captureRecordTops(exceptId) {
    const screen = document.querySelector('.screen.active');
    if (!screen || !screen.querySelector('#recordList')) return null;
    const map = new Map();
    $$('#recordList .record').forEach(el => {
      if (el.dataset.id === exceptId) return;
      const r = el.getBoundingClientRect();
      if (r.height > 0) map.set(el.dataset.id, r.top);
    });
    return map.size ? map : null;
  }

  function playRefill(snap) {
    if (!snap || !dragMotionOK()) return;
    const list = $('#recordList');
    if (!list) return;
    const moved = [];
    $$('#recordList .record').forEach(el => {
      const oldTop = snap.get(el.dataset.id);
      if (oldTop == null) return;
      const dy = oldTop - el.getBoundingClientRect().top;
      if (Math.abs(dy) < 1.5) return;
      el.style.transition = 'none';
      el.style.transform = 'translateY(' + dy + 'px)';
      moved.push(el);
    });
    if (!moved.length) return;
    void list.offsetWidth;
    moved.forEach(el => {
      el.style.transition = 'transform 220ms cubic-bezier(.22,.9,.26,1)';
      el.style.transform = '';
    });
    setTimeout(() => moved.forEach(el => {
      el.style.transition = '';
      el.style.transform = '';
    }), 260);
  }

  // 通用确认弹窗（替代 window.confirm：WebView 未接管 onJsConfirm 时会一律返回 false）
  function confirmModal(opts = {}) {
    return new Promise(resolve => {
      const layer = document.createElement('div');
      layer.className = 'modal-layer';
      layer.innerHTML = `
        <div class="modal-card" role="alertdialog" aria-modal="true">
          <div class="modal-icon">${icon(opts.icon || 'trash')}</div>
          <h3 class="modal-title">${opts.title || '确认操作？'}</h3>
          <p class="modal-text">${opts.text || ''}</p>
          <div class="modal-actions">
            <button class="modal-btn" data-modal-cancel>${opts.cancelLabel || '取消'}</button>
            <button class="modal-btn ${opts.danger === false ? 'modal-btn-primary' : 'modal-btn-danger'}" data-modal-ok>${opts.okLabel || '确定'}</button>
          </div>
        </div>`;
      document.body.appendChild(layer);
      requestAnimationFrame(() => layer.classList.add('open'));
      let settled = false;
      const finish = val => {
        if (settled) return;
        settled = true;
        layer.classList.remove('open');
        setTimeout(() => layer.remove(), 220);
        resolve(val);
      };
      layer.addEventListener('click', e => {
        if (e.target === layer || e.target.closest('[data-modal-cancel]')) finish(false);
        else if (e.target.closest('[data-modal-ok]')) finish(true);
      });
    });
  }

  // ── 指针事件：一对全局监听，覆盖触屏与鼠标，不随渲染重复绑定 ──
  // 拖动中拦截触摸滚动（只在拖动期间生效，不给整页 touch-action:none）
  document.addEventListener('touchmove', e => { if (DRAG) e.preventDefault(); }, { passive: false });

  const lpCancel = () => {
    if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; }
    lpCard = null; lpPoint = null;
  };

  document.addEventListener('pointerdown', e => {
    // 每次新手势先复位：拖动常常不产生 click，若只在 click 里复位，
    // 这个标记会一直挂着，把下一次真正的点击吞掉。
    ui.longPressFired = false;
    if (DRAG || dragLock) return;
    if (e.button !== undefined && e.button !== 0) return;
    const card = e.target.closest('#recordList .record');
    if (!card) return;
    if (e.target.closest('.now-edit, .pin-badge')) return;   // 卡上的按钮不触发起拖
    lpCard = card;
    lpPoint = { x: e.clientX, y: e.clientY };
    lpTimer = setTimeout(() => {
      lpTimer = null;
      if (lpCard) beginOrganize(lpCard, lpPoint.y);
    }, LP_MS);
  }, { passive: true });

  document.addEventListener('pointermove', e => {
    if (DRAG) { moveDrag(e.clientY); return; }
    if (lpTimer && lpPoint && Math.hypot(e.clientX - lpPoint.x, e.clientY - lpPoint.y) > LP_SLOP) lpCancel();
  }, { passive: true });

  document.addEventListener('pointerup', () => { lpCancel(); if (DRAG) endDrag(true); });
  document.addEventListener('pointercancel', () => { lpCancel(); if (DRAG) endDrag(false); });
  window.addEventListener('blur', () => { lpCancel(); if (DRAG) endDrag(false); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { lpCancel(); if (DRAG) endDrag(false); }
  });
  // 桌面/外接键盘：Esc 退出手势（不落库），长按计时中也一并取消
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape' && e.key !== 'Esc') return;
    if (DRAG) { e.preventDefault(); endDrag(false); return; }
    if (lpTimer) lpCancel();
  });

  document.addEventListener('contextmenu', e => {
    if (e.target.closest('#recordList .record')) e.preventDefault();
  });

  function openActionMenu(w, fromDetail = false) {
    if (!w) return;
    $('#actionContent').innerHTML = `<div class="action-title">${esc(w.title)}</div>
      ${fromDetail ? '' : `<button class="action-item" data-action="open-detail" data-id="${w.id}">${icon('info')}查看详情</button>`}
      <button class="action-item" data-action="edit-work" data-id="${w.id}">${icon('edit')}编辑</button>
      ${fromDetail ? `<button class="action-item" data-action="replace-images" data-id="${w.id}">${icon('image')}更换当前图片</button>` : ''}
      <button class="action-item" data-action="change-icon" data-id="${w.id}">${icon('image')}更换作品图标</button>
      <button class="action-item" data-action="ai-similar" data-id="${w.id}">${icon('spark')}相似作品推荐</button>
      ${w.status === 'reading' && w.backgroundImage ? `<button class="action-item" data-action="remove-background" data-id="${w.id}">${icon('image')}移除卡片背景</button>` : ''}
      <button class="action-item danger" data-action="delete-work" data-id="${w.id}">${icon('trash')}删除作品</button>
      <button class="action-cancel" data-close="actions">取消</button>`;
    openSheet('actionSheet');
  }

  function openDeleteConfirm(w) {
    if (!w) return;
    const total = (w.notes || []).length;
    $('#actionContent').innerHTML = `<div class="action-title">删除《${esc(w.title)}》？</div>
      <p class="action-note">${total ? `作品和它的 ${total} 条感想都会被删除` : '作品会被删除'}，无法撤销。</p>
      <button class="action-item danger" data-action="confirm-delete-work" data-id="${w.id}">${icon('trash')}确认删除</button>
      <button class="action-cancel" data-close="actions">取消</button>`;
    openSheet('actionSheet');
  }

  function deleteWork(id) {
    const w = getWork(id);
    if (!w) return;
    closeSheet('actionSheet');
    const idx = db.works.findIndex(x => x.id === id);
    if (idx >= 0) db.works.splice(idx, 1);
    if (ui.detailId === id) closeDetail();
    if (ui.readingId === id) ui.readingId = null;
    saveDB();
    renderAll();
    toast('已删除');
  }

  // ── v2.4 · 新建菜单：以加号为中心圆形展开（transform 版，见 app.css 注释） ─────
  // 阶段2 · 新建菜单展开：改由 CSS transition 驱动
  // ---------------------------------------------------------------
  // 之前用 rAF 逐帧写 transform，等于把本该交给合成线程的插值又抢回主线程做，
  // 主线程一有别的活（渲染卡片、贴图解码）就会漏帧 —— 这就是「有时卡有时顺」。
  // 现在只在起手写一次 transform，其余全部交给 CSS transition；
  // 掉帧与否不再取决于主线程忙不忙。（提高帧数没用：rAF 已被屏幕刷新率封顶。）
  const QA = { maxR: 0, busy: false, t1: 0, t2: 0 };
  const QA_DUR = 420, QA_CLOSE_DUR = 280, QA_SCALE = 1.04;
  const prefersReduced = () => {
    try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; }
  };

  // 纯色大圆：圆形展开的载体。只改 transform，交给合成器，不触发重排重绘。
  function qaBgEl() {
    const layer = $('#quickAdd');
    if (!layer) return null;
    let bg = layer.querySelector('.qa-bg');
    if (!bg) {
      bg = document.createElement('div');
      bg.className = 'qa-bg';
      bg.setAttribute('aria-hidden', 'true');
      layer.insertBefore(bg, layer.firstChild);
    }
    return bg;
  }

  function qaItemsIn(on) {
    $$('#quickAdd .qa-item').forEach(el => el.classList.toggle('in', on));
  }

  function openQuickAdd(anchorBtn) {
    const layer = $('#quickAdd');
    if (!layer || QA.busy || layer.classList.contains('open')) return;
    const btn = anchorBtn || $('.add-btn');
    const rect = btn ? btn.getBoundingClientRect()
      : { left: innerWidth - 52, top: 56, width: 34, height: 34 };
    const appRect = $('#app').getBoundingClientRect();
    const cx = rect.left + rect.width / 2 - appRect.left;
    const cy = rect.top + rect.height / 2 - appRect.top;
    const R = Math.hypot(Math.max(cx, appRect.width - cx), Math.max(cy, appRect.height - cy));
    QA.maxR = R;

    const bg = qaBgEl();
    clearTimeout(QA.t1); clearTimeout(QA.t2);
    layer.classList.remove('closing');
    delete layer.dataset.itemsIn;
    qaItemsIn(false);
    layer.classList.add('open');
    layer.setAttribute('aria-hidden', 'false');
    buzzer(8);

    if (!bg) return;

    // 起手：清掉过渡把圆归零，强制一帧后再交回 CSS 过渡
    bg.style.transition = 'none';
    bg.style.width = (R * 2) + 'px';
    bg.style.height = (R * 2) + 'px';
    bg.style.left = (cx - R) + 'px';
    bg.style.top = (cy - R) + 'px';
    bg.style.transform = 'scale(0)';

    if (prefersReduced()) {
      bg.style.transition = '';
      bg.style.transform = 'scale(' + QA_SCALE + ')';
      qaItemsIn(true);
      return;
    }

    void bg.offsetWidth;
    bg.style.transition = '';
    bg.style.transform = 'scale(' + QA_SCALE + ')';

    QA.busy = true;
    QA.t1 = setTimeout(() => {
      layer.dataset.itemsIn = '1';
      qaItemsIn(true);                 // 圆盖住约 56% 时菜单项进场
    }, Math.round(QA_DUR * 0.56));
    QA.t2 = setTimeout(() => { QA.busy = false; }, QA_DUR + 20);
  }

  function closeQuickAdd(done) {
    const layer = $('#quickAdd');
    if (!layer || !layer.classList.contains('open')) { if (done) done(); return; }
    const bg = layer.querySelector('.qa-bg');
    clearTimeout(QA.t1); clearTimeout(QA.t2);
    QA.busy = true;
    layer.classList.add('closing');
    qaItemsIn(false);

    const finish = () => {
      layer.classList.remove('open', 'closing');
      layer.setAttribute('aria-hidden', 'true');
      delete layer.dataset.itemsIn;
      qaItemsIn(false);
      if (bg) { bg.style.transition = 'none'; bg.style.transform = 'scale(0)'; }
      QA.busy = false;
      if (done) done();
    };

    if (!bg || prefersReduced()) { finish(); return; }
    bg.style.transition = '';
    bg.style.transform = 'scale(0)';
    QA.t2 = setTimeout(finish, QA_CLOSE_DUR + 20);
  }

  function quickAddOpen() {
    const layer = $('#quickAdd');
    return !!(layer && layer.classList.contains('open'));
  }

  // 立刻收掉新建页（不做圆的缩放动画）。
  // 用在「保存成功」：那一刻新建页被表单整页盖着，用户看不到中间过程，
  // 但如果不收，收起表单后会停在中转页上，等于把人扔回了半路。
  function qaHardClose() {
    const layer = $('#quickAdd');
    qaHold = false;
    if (!layer || !layer.classList.contains('open')) return;
    const bg = layer.querySelector('.qa-bg');
    clearTimeout(QA.t1); clearTimeout(QA.t2);
    layer.classList.remove('open', 'closing');
    layer.setAttribute('aria-hidden', 'true');
    delete layer.dataset.itemsIn;
    qaItemsIn(false);
    if (bg) { bg.style.transition = 'none'; bg.style.transform = 'scale(0)'; }
    QA.busy = false;
  }

  // ── v2.0.2 · 表单状态切换：液态拉伸指示块 ────────────────
  // 前沿 cubic-bezier(.2,.9,.22,1) 先奔向目标（末端轻微超调），
  // 后沿延后 6 帧（≈100ms）起步追赶，宽度中途自然拉宽再收回。
  // 用 left/width 驱动，不用 scaleX，圆角不会被拉扁。
  const SEG_BEZ = (p1x, p1y, p2x, p2y) => {
    const cx = 3 * p1x, bx = 3 * (p2x - p1x) - cx, ax = 1 - cx - bx;
    const cy = 3 * p1y, by = 3 * (p2y - p1y) - cy, ay = 1 - cy - by;
    const sampleX = t => ((ax * t + bx) * t + cx) * t;
    const sampleY = t => ((ay * t + by) * t + cy) * t;
    const dX = t => (3 * ax * t + 2 * bx) * t + cx;
    return t => {
      if (t <= 0) return 0;
      if (t >= 1) return 1;
      let u = t;
      for (let i = 0; i < 8; i++) {
        const x = sampleX(u) - t;
        if (Math.abs(x) < 1e-5) break;
        const d = dX(u);
        if (Math.abs(d) < 1e-6) break;
        u -= x / d;
      }
      return sampleY(Math.min(1, Math.max(0, u)));
    };
  };
  const SEG_EASE_FRONT = SEG_BEZ(.2, .9, .22, 1.14); // 控制点 y>1：末端轻微超调后回落
  const SEG_EASE_BACK = SEG_BEZ(.2, .9, .22, 1);
  let segBlobState = null, segBlobRaf = 0;

  function placeStatusBlob(instant) {
    const seg = $('#statusSeg'), blob = $('#statusBlob');
    if (!seg || !blob) return;
    if (!seg.offsetWidth) return; // 表单还没显示，等 openAdd 里的 rAF 再定位
    const btn = seg.querySelector('button.active');
    if (!btn) return;
    const tl = btn.offsetLeft, tw = btn.offsetWidth;
    if (instant || !segBlobState) {
      cancelAnimationFrame(segBlobRaf);
      segBlobState = { l: tl, w: tw };
      blob.style.left = tl + 'px';
      blob.style.width = tw + 'px';
      return;
    }
    const fromL = segBlobState.l, fromR = segBlobState.l + segBlobState.w;
    const toL = tl, toR = tl + tw;
    const rightward = toL >= fromL;
    // 前沿 = 运动方向上先到的边；后沿 = 追赶的边
    const fS = rightward ? fromR : fromL, fE = rightward ? toR : toL;
    const bS = rightward ? fromL : fromR, bE = rightward ? toL : toR;
    const t0 = performance.now(), DUR = 470, DELAY = 100;
    cancelAnimationFrame(segBlobRaf);
    const step = now => {
      const t = Math.min(1, (now - t0) / DUR);
      const front = fS + (fE - fS) * SEG_EASE_FRONT(t);
      const bt = Math.min(1, Math.max(0, (now - t0 - DELAY) / (DUR - DELAY)));
      const back = bS + (bE - bS) * SEG_EASE_BACK(bt);
      const l = Math.min(front, back), w = Math.abs(front - back);
      blob.style.left = l + 'px';
      blob.style.width = w + 'px';
      if (t < 1) {
        segBlobRaf = requestAnimationFrame(step);
      } else {
        segBlobState = { l: toL, w: tw };
        blob.style.left = toL + 'px';
        blob.style.width = tw + 'px';
      }
    };
    segBlobRaf = requestAnimationFrame(step);
  }

  // ── v2.4.1 · 液态指示块（记录筛选 / 想看筛选 / 在看作品栏共用） ──
  // 三处的 DOM 形状是同一件事：一行可横滑的按钮 + 一个 .active。
  // 所以只维护一套逻辑：前沿=运动方向先到的边（SEG_EASE_FRONT，末端轻微超调），
  // 后沿延迟 90ms 追赶（SEG_EASE_BACK），中途宽度自然拉宽再收回。
  // 用 left/width 驱动而不是 scaleX：999px 的圆角会被拉成椭圆。
  // cur 记「眼睛当前看到的位置」而不是目标位置——连续快点时从半路接着走，不会回跳。
  function liquidIndicator(rowGetter, activeGetter, cls, dur) {
    const DUR = dur || 460, DELAY = 90;
    let cur = null, raf = 0;

    function ensure(row) {
      // renderXxx 每次重写 innerHTML，blob 会被冲掉，这里重新挂回首位
      let blob = row.querySelector('.' + cls);
      if (!blob || blob.parentNode !== row) {
        blob = document.createElement('span');
        blob.className = cls;
        blob.setAttribute('aria-hidden', 'true');
      }
      if (blob !== row.firstChild) row.insertBefore(blob, row.firstChild);
      return blob;
    }

    function write(blob, l, w) {
      blob.style.left = l.toFixed(2) + 'px';
      blob.style.width = w.toFixed(2) + 'px';
    }

    function place(animate) {
      const row = rowGetter();
      if (!row) { cur = null; return; }
      const blob = ensure(row);
      const btn = activeGetter(row);
      // 隐藏页 / 还没排版：先收起，等切到该页时再贴位（那时 cur 为 null → 直接落位）
      if (!btn || !row.offsetWidth || !btn.offsetWidth) {
        cancelAnimationFrame(raf);
        raf = 0;
        cur = null;
        blob.style.opacity = '0';
        return;
      }

      const toL = btn.offsetLeft, toW = btn.offsetWidth;
      blob.style.top = btn.offsetTop + 'px';
      blob.style.height = btn.offsetHeight + 'px';

      const from = cur;
      const moving = !!from && (Math.abs(from.l - toL) > 0.5 || Math.abs(from.w - toW) > 0.5);
      if (!animate || !moving || prefersReduced()) {
        cancelAnimationFrame(raf);
        raf = 0;
        write(blob, toL, toW);
        blob.style.opacity = '1';
        cur = { l: toL, w: toW };
        return;
      }

      const fromL = from.l, fromR = from.l + from.w;
      const toR = toL + toW;
      const rightward = toL >= fromL;
      const fS = rightward ? fromR : fromL, fE = rightward ? toR : toL;
      const bS = rightward ? fromL : fromR, bE = rightward ? toL : toR;
      const t0 = performance.now();

      // 只按整段进度 t 写几何：前沿先到、后沿延迟追赶，合成 left/width
      const paintAt = t => {
        const front = fS + (fE - fS) * SEG_EASE_FRONT(t);
        const bt = Math.min(1, Math.max(0, (t * DUR - DELAY) / (DUR - DELAY)));
        const back = bS + (bE - bS) * SEG_EASE_BACK(bt);
        const l = Math.min(front, back), w = Math.abs(front - back);
        write(blob, l, w);
        cur = { l, w };
      };

      cancelAnimationFrame(raf);
      // v2.5.1：第 0 帧就地写「起点」再交给 rAF 推进。
      // 原来是把目标位先写上、等第一个 rAF 再把它拉回起点——那一帧万一被画出来，
      // 看到的就是「水滴先闪到目标位置、再倒回去从上一个选项划过来」。
      // 每次 render 都会重写 innerHTML 造出新节点，所以这一帧几乎每次点击都存在。
      paintAt(0);
      blob.style.opacity = '1';

      const step = now => {
        const t = Math.min(1, (now - t0) / DUR);
        if (t >= 1) {
          write(blob, toL, toW);
          cur = { l: toL, w: toW };
          raf = 0;
          return;
        }
        paintAt(t);
        raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }

    return { place, reset() { cancelAnimationFrame(raf); raf = 0; cur = null; } };
  }

  const RECORD_BLOB = liquidIndicator(
    () => $('#recordFilters'), row => row.querySelector('.filter.active'), 'filter-blob');
  const WISH_BLOB = liquidIndicator(
    () => $('#wishFilters'), row => row.querySelector('.filter.active'), 'filter-blob');
  // 在看页的作品栏：横滑 pill（卡拉马佐夫兄弟 …），切换作品时水滴横向吸附过去
  const READER_BLOB = liquidIndicator(
    () => $('#readerSwitcher .reader-switch'),
    row => row.querySelector('.reader-pill.active'), 'reader-blob', 420);
  // 阶段5 · 回顾页的胶囊筛选项（一年前 / 随便翻一条 / 最早的记录）
  const RV_BLOB = liquidIndicator(
    () => $('#rvModes'), row => row.querySelector('.filter.active'), 'filter-blob');
  const placeFilterBlob = RECORD_BLOB.place;

  // ── v2.0 · 底部导航流式指示块（水滴吸附滑动） ────────────
  function placeNavBlob(animate) {
    const blob = $('#navBlob');
    const active = $('.glass-nav .nav-item.active');
    if (!blob || !active) return;
    const left = active.offsetLeft, top = active.offsetTop;
    const w = active.offsetWidth, h = active.offsetHeight;
    if (!animate) {
      blob.classList.add('no-anim');
      blob.style.left = left + 'px';
      blob.style.top = top + 'px';
      blob.style.width = w + 'px';
      blob.style.height = h + 'px';
      blob.style.opacity = '1';
      requestAnimationFrame(() => blob.classList.remove('no-anim'));
      return;
    }
    const prev = parseFloat(blob.style.left) || left;
    blob.style.transformOrigin = left >= prev ? 'right center' : 'left center';
    blob.classList.remove('flowing');
    void blob.offsetWidth;
    blob.classList.add('flowing');
    blob.style.left = left + 'px';
    blob.style.top = top + 'px';
    blob.style.width = w + 'px';
    blob.style.height = h + 'px';
    blob.style.opacity = '1';
    clearTimeout(blob._ft);
    blob._ft = setTimeout(() => blob.classList.remove('flowing'), 440);
  }


  document.addEventListener('click', e => {
    // 长按拖动刚结束 → 吞掉紧随的 click（防止误触卡片跳详情）
    if (ui.longPressFired) { ui.longPressFired = false; return; }
    // 点击置顶徽标 = 取消置顶（和「拖回顶部区」同一个落点逻辑）
    const pinEl = e.target.closest('.pin-badge');
    if (pinEl) {
      const card = pinEl.closest('.record');
      const w = card && getWork(card.dataset.id);
      if (w && w.pinnedAt) unpinWork(w);
      return;
    }
    const closeEl = e.target.closest('[data-close]');
    if (closeEl) {
      const which = closeEl.dataset.close;
      if (which === 'note') closeNoteSheet();
      if (which === 'actions') closeSheet('actionSheet');
      if (which === 'ai') closeSheet('aiSheet');
      if (which === 'share') closeSheet('shareSheet');
    }

    const actionEl = e.target.closest('[data-action]');
    if (actionEl) {
      const action = actionEl.dataset.action;
      const id = actionEl.dataset.id;
      // 展开来源必须是「眼睛真正看到的那张卡」。
      // 旧写法优先取 #recordList 里的同名卡片，可是在「想看 / 在看」页时那块列表是 display:none，
      // 拿到的是 0×0 矩形，dtGeometry 只好退化成屏幕中央的兜底框 —— 卡片长成详情页的隐喻整个断掉。
      // 现在按「离点击最近 → 同名卡片 → 点击元素」排，并且只认真的占了地方的节点。
      const sized = el => !!el && el.getBoundingClientRect().width > 4;
      const openSrc = () => {
        const cands = [
          actionEl.closest('.record'),
          actionEl.closest('.now-card'),
          actionEl.closest('.wish-main'),
          actionEl.closest('.current-main'),
          actionEl.closest('.search-result'),
          document.querySelector(`#recordList .record[data-id="${id}"]`),
          document.querySelector(`.now-card[data-id="${id}"]`),
          document.querySelector(`.wish-main[data-id="${id}"]`),
          document.querySelector(`.current-main[data-id="${id}"]`),
          actionEl
        ];
        return cands.find(sized) || actionEl;
      };
      if (action === 'open-detail') {
        closeSheet('actionSheet');
        if ($('#searchPage').classList.contains('open')) {
          const sq = String(ui.searchQuery || '').trim();
          if (sq) pushSearchHistory(sq);
          closeSearch();
        }
        openDetail(id, openSrc());
        return;
      }
      if (action === 'view-detail') { openDetail(id, openSrc()); return; }
      if (action === 'go-records') { switchTab('records'); return; }
      if (action === 'open-search') { openSearch(); return; }
  // 点加号 → 以加号为中心圆形展开菜单
      if (action === 'add-new') {
        openQuickAdd(actionEl);
        return;
      }
      if (action === 'toggle-wish') { toggleWish(id); return; }
      if (action === 'quick-note' || action === 'note-for') { openNoteFor(id); return; }
      if (action === 'start-reading') { startReading(id); return; }
      if (action === 'finish-work') {
        const w = getWork(id);
        if (w) openAdd('finished', id, true);
        return;
      }
      if (action === 'edit-work') {
        closeSheet('actionSheet');
        const w = getWork(id);
        if (w) openAdd(w.status, id);
        return;
      }
      if (action === 'change-icon') {
        closeSheet('actionSheet');
        ui.iconEditTarget = id;
        lingPickOrClick('#iconFile', 1, handleIconFile);
        return;
      }
      if (action === 'delete-work') { openDeleteConfirm(getWork(id)); return; }
      if (action === 'confirm-delete-work') { deleteWork(id); return; }
      if (action === 'open-actions') { closeSheet('actionSheet'); openActionMenu(getWork(id), !!ui.detailId); return; }
      if (action === 'remove-background') { removeBackground(id); return; }
      if (action === 'ai-similar') { closeSheet('actionSheet'); aiSimilarWork(getWork(id)); return; }
      if (action === 'open-daily') { openDaily(); return; }
      if (action === 'select-reader') { ui.readingId = id; ui.readingDraftImages = []; renderReading(); return; }
      if (action === 'send-reading-note') { saveReadingNote(); return; }
      if (action === 'add-reading-note-images') { ui.imageTarget = 'reading-note'; lingPickOrClick('#commentImageFile', 8, handleCommentImages); return; }
      if (action === 'add-dt-images') { ui.imageTarget = 'dt-note'; lingPickOrClick('#commentImageFile', 8, handleCommentImages); return; }
      if (action === 'add-sheet-images') { ui.imageTarget = 'sheet-note'; lingPickOrClick('#commentImageFile', 8, handleCommentImages); return; }
      if (action === 'save-dt-note') { saveDetailNote(); return; }
      if (action === 'edit-rating') { startRatingEdit(); return; }
      if (action === 'cancel-rating') { cancelRatingEdit(); return; }
      if (action === 'save-rating') { saveRating(); return; }
      if (action === 'note-menu') {
        openNoteMenu(actionEl.dataset.workId, actionEl.dataset.noteId);
        return;
      }
      if (action === 'edit-note') {
        closeSheet('actionSheet');
        openNoteEditor(actionEl.dataset.workId, actionEl.dataset.noteId);
        return;
      }
      if (action === 'delete-note') {
        deleteNote(actionEl.dataset.workId, actionEl.dataset.noteId);
        return;
      }
      if (action === 'toggle-note') {
        const noteEl = actionEl.closest('.note');
        if (!noteEl) return;
        const expanded = noteEl.classList.toggle('expanded');
        actionEl.textContent = expanded ? '收起' : '展开全文';
        return;
      }
      if (action === 'view-image') {
        const w = getWork(actionEl.dataset.workId);
        const note = w && (w.notes || []).find(n => n.id === actionEl.dataset.noteId);
        if (note && Array.isArray(note.images)) openViewer(note.images, Number(actionEl.dataset.index) || 0);
        return;
      }
      if (action === 'close-viewer') { closeViewer(); return; }
      if (action === 'viewer-prev') { moveViewer(-1); return; }
      if (action === 'viewer-next') { moveViewer(1); return; }
      if (action === 'slide-to') {
        const idx = Number(actionEl.dataset.index) || 0;
        const track = $('#heroTrack');
        if (track) track.scrollTo({ left: idx * track.clientWidth, behavior: 'smooth' });
        return;
      }
      if (action === 'import-images') {
        ui.detailId = ui.detailId || id;
        ui.galleryMode = 'add';
        lingPickOrClick('#galleryFile', 8, handleGalleryFiles);
        return;
      }
      if (action === 'replace-images') {
        closeSheet('actionSheet');
        ui.detailId = ui.detailId || id;
        ui.galleryMode = 'replace';
        lingPickOrClick('#galleryFile', 1, handleGalleryFiles);
        return;
      }
      if (action === 'now-slide') {
        const idx = Number(actionEl.dataset.index) || 0;
        const carousel = $('#nowCarousel');
        if (carousel) {
          const card = carousel.children[idx];
          if (card) {
            // 居中滚动：目标卡片中心对齐容器中心
            const left = card.offsetLeft + card.offsetWidth / 2 - carousel.clientWidth / 2;
            carousel.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
          }
        }
        return;
      }
      if (action === 'edit-card-bg') {
        openBackgroundPicker(id);
        return;
      }
      if (action === 'new-work') { openAdd('finished'); return; }
      if (action === 'new-reading') { openAdd('reading'); return; }
      if (action === 'new-wish') { openAdd('wish'); return; }
      // 阶段4 · 发现：只读现有待看数据，不产生任何新记录
      if (action === 'discover-inspire') { drawWish('inspire'); return; }
      if (action === 'discover-roll') { drawWish('roll'); return; }
      if (action === 'discover-close') { ui.pickId = null; ui.pickSource = ''; renderPick(); return; }
      if (action === 'discover-all') { ui.wishFilter = 'all'; renderWishlist(); return; }
      if (action === 'discover-detail') {
        openDetail(id, actionEl.closest('.pick-inner') || actionEl);
        return;
      }
      if (action === 'discover-start') {
        ui.pickId = null; ui.pickSource = '';
        startReading(id);      // 就地改 status，不复制作品；看完再补评分感想
        return;
      }
      // 阶段5 · 回顾：全部只读真实记录，不写数据、不新增存储键
      if (action === 'rv-mode') {
        const mode = actionEl.dataset.mode;
        if (mode && mode !== ui.rvMode) {
          ui.rvMode = mode;
          ui.rvPickId = null;   // 换池子必须重抽，不然会留着上一个池子的记录
          renderReview();
        }
        return;
      }
      if (action === 'rv-roll') { rvRoll(); return; }
      if (action === 'rv-open') { openDetail(id, actionEl.closest('.rv-hero') || actionEl.closest('.rv-feat') || actionEl); return; }
      if (action === 'rv-edit') {
        const w = getWork(id);
        if (w) openAdd(w.status, id);
        return;
      }
      if (action === 'rv-prev') { rvStep(-1); return; }
      if (action === 'rv-next') { rvStep(1); return; }
      if (action === 'rv-scope') {
        const scope = actionEl.dataset.scope === 'year' ? 'year' : 'month';
        if (scope !== ui.rvScope) { ui.rvScope = scope; renderMonth(); }
        return;
      }
      if (action === 'rv-jump-month') {
        const key = actionEl.dataset.month;
        if (key) { ui.rvScope = 'month'; ui.rvMonth = key; renderMonth(); }
        return;
      }
      if (action === 'rv-share') { renderShareSheet(); openSheet('shareSheet'); return; }
      if (action === 'rv-share-toggle') {
        const part = actionEl.dataset.part;
        if (part && ui.shareParts[part] !== undefined) {
          ui.shareParts[part] = !ui.shareParts[part];
          renderShareSheet();
        }
        return;
      }
      if (action === 'rv-share-copy') { rvCopyShare(); return; }
    }

    const filterEl = e.target.closest('[data-filter-kind]');
    if (filterEl) { ui.recordFilter = filterEl.dataset.filterKind; renderRecords(); return; }

    const wishFilterEl = e.target.closest('[data-wish-type]');
    if (wishFilterEl) { ui.wishFilter = wishFilterEl.dataset.wishType; renderWishlist(); return; }

    const tagEl = e.target.closest('[data-tag]');
    if (tagEl) {
      $('#formTag').value = tagEl.dataset.tag;
      renderTagChips();
      return;
    }

    const readingTag = e.target.closest('[data-reading-tag]');
    if (readingTag) {
      const already = readingTag.classList.contains('on');
      $$('.composer .tag-btn').forEach(b => b.classList.remove('on'));
      if (!already) readingTag.classList.add('on');
      return;
    }

    const dtTag = e.target.closest('[data-dt-tag]');
    if (dtTag) {
      const w = getWork(ui.detailId);
      if (!w) return;
      const draft = getDraft(w.id);
      draft.tag = dtTag.dataset.dtTag === '摘抄' ? '摘抄' : '想法';
      $$('#detailSheet .dt-compose .tag-btn').forEach(b => b.classList.toggle('on', b === dtTag));
      scheduleDraftSave();
      return;
    }

    const sheetTag = e.target.closest('[data-sheet-tag]');
    if (sheetTag) {
      ui.sheetTag = sheetTag.dataset.sheetTag;
      $$('#sheetTags .tag-btn').forEach(b => b.classList.toggle('on', b === sheetTag));
      return;
    }

    const nav = e.target.closest('[data-tab]');
    if (nav) { switchTab(nav.dataset.tab); return; }
  });

  // keyboard access for non-button rows
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const el = e.target.closest('[data-action][tabindex]');
    if (!el) return;
    e.preventDefault();
    el.click();
  });

  $('#closeSearch').addEventListener('click', closeSearch);
  $('#searchInput').addEventListener('input', e => {
    ui.searchQuery = e.target.value;
    renderSearch();
  });
  // 回车：把当前关键词计入搜索历史 + 轻微震动反馈
  $('#searchInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const t = String(ui.searchQuery || '').trim();
      if (t) {
        buzzer(12);
        pushSearchHistory(t);
        renderSearch();
      }
    }
  });

  // 新建菜单：菜单项点击 + 点空白处收回（v2.0.2 恢复）
  document.addEventListener('click', e => {
    const item = e.target.closest('[data-qa]');
    if (item) {
      const kind = item.dataset.qa;
      buzzer(8);
      if (kind === 'search') {
        // 搜索要走整屏搜索页（结果再进详情页，详情页 z-index 比新建层低），照旧先收新建页
        closeQuickAdd(() => openSearch());
        return;
      }
      // 其余三项是表单：直接从底部当抽屉推上来，新建页留在下面不收。
      // 以前是 closeQuickAdd(cb) → 等圆缩完（280ms）再 openAdd，观感就是「先收掉、再弹出」。
      openAdd(kind === 'wish' ? 'wish' : kind === 'reading' ? 'reading' : 'finished', null, false, true);
      return;
    }
    if (quickAddOpen() && e.target.closest('#quickAdd')) closeQuickAdd();
  });

  // 转屏 / 可视区域变化：指示块重新贴位，菜单半径失效则直接收回
  window.addEventListener('resize', () => {
    placeNavBlob(false);
    RECORD_BLOB.reset(); WISH_BLOB.reset(); READER_BLOB.reset(); RV_BLOB.reset();
    RECORD_BLOB.place(false); WISH_BLOB.place(false); READER_BLOB.place(false); RV_BLOB.place(false);
    if (dtOrigin) dtOrigin.g = null;   // 转屏后快照失效，收起时按卡片现位置重算
    if (quickAddOpen()) { closeQuickAdd(); segBlobState = null; }
  });
  // 历史项：点击回填、删除单条、清空全部
  document.addEventListener('click', e => {
    const del = e.target.closest('[data-action="del-search-hist"]');
    if (del) {
      const hist = searchHistory();
      const idx = Number(del.dataset.idx);
      if (hist[idx]) removeSearchHistory(hist[idx]);
      renderSearch();
      return;
    }
    if (e.target.closest('[data-action="clear-search-hist"]')) {
      clearSearchHistory();
      renderSearch();
      return;
    }
    const item = e.target.closest('[data-hist]');
    if (item && !e.target.closest('[data-action]')) {
      const hist = searchHistory();
      const h = hist[Number(item.dataset.hist)];
      if (h) {
        buzzer(10);
        ui.searchQuery = h;
        $('#searchInput').value = h;
        pushSearchHistory(h);
        renderSearch();
      }
    }
  });

  $('#cancelAdd').addEventListener('click', closeAdd);
  $('#saveWork').addEventListener('click', saveWork);
  // 快速记录：与「保存」同一条流程，只是不写没被真正动过的默认分数
  const saveQuickBtn = $('#saveQuick');
  if (saveQuickBtn) saveQuickBtn.addEventListener('click', () => saveWork(true));

  $$('#statusSeg button').forEach(btn => btn.addEventListener('click', () => {
    ui.formStatus = btn.dataset.status;
    syncStatusButtons();
    if (ui.formStatus === 'wish') renderTagChips();
  }));
  $$('#typeGrid .type-option').forEach(btn => btn.addEventListener('click', () => {
    ui.formType = btn.dataset.type;
    syncTypeButtons();
    renderFormIcon();
    if (ui.formStatus === 'wish') renderTagChips();
  }));
  $('#formTitle').addEventListener('input', () => { if (!ui.formIcon) renderFormIcon(); });
  $('#formRating').addEventListener('input', () => { ui.ratingTouched = true; syncRating(); });
  $('#formTag').addEventListener('input', renderTagChips);
  $('#pickIcon').addEventListener('click', () => { ui.iconEditTarget = null; lingPickOrClick('#iconFile', 1, handleIconFile); });
  $('#resetIcon').addEventListener('click', () => { ui.formIcon = null; renderFormIcon(); toast('已恢复默认图标'); });
  $('#iconFile').addEventListener('change', async e => {
    await handleIconFile(e.target.files);
    e.target.value = '';
  });
  $('#galleryFile').addEventListener('change', async e => {
    await handleGalleryFiles(e.target.files);
    e.target.value = '';
  });
  $('#commentImageFile').addEventListener('change', async e => {
    await handleCommentImages(e.target.files);
    e.target.value = '';
  });
  $('#backgroundFile').addEventListener('change', async e => {
    await handleBackgroundFile(e.target.files);
    e.target.value = '';
  });

  $('#cancelCrop').addEventListener('click', closeCropPage);
  $('#useCrop').addEventListener('click', useCrop);
  const cropStage = $('#cropStage');
  cropStage.addEventListener('pointerdown', cropDown);
  cropStage.addEventListener('pointermove', cropMove);
  cropStage.addEventListener('pointerup', cropUp);
  cropStage.addEventListener('pointercancel', cropUp);

  $('#imageViewer').addEventListener('click', e => {
    if (e.target.id === 'imageViewer') closeViewer();
  });

  // 包一层：直接把 closeDetail 交给 addEventListener，事件对象会被当成 instant 参数传进去，
  // 结果收起动画永远不会播（v2.3.0 修）
  $('#closeDetail').addEventListener('click', () => closeDetail());
  $('#detailMore').addEventListener('click', () => openActionMenu(getWork(ui.detailId), true));

  $('#saveSheetNote').addEventListener('click', saveSheetNote);

  // 详情页输入：自动扩展 + 草稿即时保存（按作品分别保留）
  document.addEventListener('input', e => {
    if (e.target.id === 'dtNoteInput') {
      const w = getWork(ui.detailId);
      if (w) {
        getDraft(w.id).text = e.target.value;
        scheduleDraftSave();
      }
      autosizeComposer();
      return;
    }
    if (e.target.id === 'dtRange') {
      const value = Number(e.target.value) || 0;
      ui.ratingDraft = value;
      const live = $('#detailRating .dt-rate-num');
      if (live) live.textContent = ratingText(value);
      e.target.style.setProperty('--fill', (value * 10).toFixed(1) + '%');
      return;
    }
  });

  // 键盘弹出时把输入区带回视野
  document.addEventListener('focusin', e => {
    if (e.target.id !== 'dtNoteInput') return;
    setTimeout(() => {
      const el = e.target;
      if (!el || !el.closest('#detailPage')) return;
      try { el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (err) { el.scrollIntoView(); }
    }, 260);
  });

  $('#recordsAllBtn').addEventListener('click', () => {
    ui.recordFilter = 'all';
    renderRecords();
    $('#screen-records').scrollTop = 0;
  });

  // Back button integration for Android.
  // 原生返回键：先逐层收起弹层 → 再回到主页（记录）→ 主页再按一次才退出
  let backExitArm = 0;
  window.androidBack = () => {
    // 顺序按层的上下关系：谁在最上面就先收谁。
    // quickAdd 不能排在最前 —— 从它里面打开的表单/搜索会把它留在底下，
    // 那时按返回应该先收表单，而不是把底下的新建页抽走。
    const overlayMap = [
      ['imageViewer', closeViewer],
      ['cropPage', closeCropPage],
      ['actionSheet', () => closeSheet('actionSheet')],
      ['noteSheet', closeNoteSheet],
      ['aiSheet', () => closeSheet('aiSheet')],
      ['shareSheet', () => closeSheet('shareSheet')],
      ['searchPage', closeSearch],
      ['addPage', closeAdd],
      ['quickAdd', () => closeQuickAdd()],
      ['detailPage', null]
    ];
    for (const [id, fn] of overlayMap) {
      const el = $('#' + id);
      if (el && el.classList.contains('open')) {
        if (id === 'detailPage') { if (ui.ratingEditing) { cancelRatingEdit(); return true; } closeDetail(); return true; }
        fn();
        return true;
      }
    }
    // AI 模型下拉 / 默认播放源下拉（非 open 类，用 hidden / class 判断）
    const aiPop = $('#aiModelPop');
    if (aiPop && !aiPop.hidden) { aiPop.hidden = true; return true; }
    const defPop = $('#drawerDefPop');
    if (defPop && !defPop.hidden) { defPop.hidden = true; return true; }
    if (ui.tab !== 'records') { switchTab('records'); return true; }
    // 已在主页：第一次提示，2 秒内再按一次才退出
    const now = Date.now();
    if (now - backExitArm < 2000) { backExitArm = 0; return false; }
    backExitArm = now;
    toast('再按一次返回键退出');
    return true;
  };

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      // 与返回键同序：叠在上面的先收（新建页可能被表单留在底下）
      if ($('#imageViewer').classList.contains('open')) { closeViewer(); }
      else if ($('#cropPage').classList.contains('open')) { closeCropPage(); }
      else if ($('#actionSheet').classList.contains('open')) { closeSheet('actionSheet'); }
      else if ($('#noteSheet').classList.contains('open')) { closeNoteSheet(); }
      else if ($('#shareSheet').classList.contains('open')) { closeSheet('shareSheet'); }
      else if ($('#searchPage').classList.contains('open')) { closeSearch(); }
      else if ($('#addPage').classList.contains('open')) { closeAdd(); }
      else if (quickAddOpen()) { closeQuickAdd(); }
      else if ($('#detailPage').classList.contains('open')) {
        if (ui.ratingEditing) cancelRatingEdit();
        else closeDetail();
      }
    }
  });

  // ── 铃·mod：专辑播放跳转 + 备份 ─────────────────────────
  const PLAY_CACHE_KEY = 'ling.play.cache.v1';
  const PLAY_DEF_KEY = 'ling.play.default.v1';
  const SEARCH_HIST_KEY = 'ling.search.history.v1';
  const SEARCH_HIST_MAX = 10;

  function searchHistory() {
    try { const a = JSON.parse(localStorage.getItem(SEARCH_HIST_KEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function saveSearchHistory(a) {
    try { localStorage.setItem(SEARCH_HIST_KEY, JSON.stringify(a.slice(0, SEARCH_HIST_MAX))); } catch (e) {}
  }
  function pushSearchHistory(q) {
    const t = String(q || '').trim();
    if (!t) return;
    let a = searchHistory().filter(x => x !== t);
    a.unshift(t);
    saveSearchHistory(a);
  }
  function removeSearchHistory(t) {
    saveSearchHistory(searchHistory().filter(x => x !== t));
  }
  function clearSearchHistory() {
    try { localStorage.removeItem(SEARCH_HIST_KEY); } catch (e) {}
  }

  const PLAY_DEFS = [
    { key: 'qq', name: 'QQ音乐', dot: '#31C27C' },
    { key: 'wy', name: '网易云音乐', dot: '#C20C0C' },
    { key: 'qs', name: '汽水音乐', dot: '#00C3B4' },
    { key: 'kg', name: '酷狗音乐', dot: '#2CA2F9' },
    { key: 'kw', name: '酷我音乐', dot: '#E0A800' }
  ];

  function bridge() { return window.LingBridge || null; }

  window.__lingHttpCb = (id, ok, body) => {
    const cb = lingCbs[id]; delete lingCbs[id];
    if (cb) cb(ok ? body : null);
  };
  const lingCbs = {};
  let lingSeq = 0;
  function bridgeGet(url) {
    const b = bridge();
    if (!b) return Promise.resolve(null);
    return new Promise(res => {
      const id = 'c' + (++lingSeq);
      lingCbs[id] = res;
      try { b.httpGetAsync(id, url); } catch (e) { delete lingCbs[id]; return res(null); }
      setTimeout(() => { if (lingCbs[id]) { delete lingCbs[id]; res(null); } }, 12000);
    });
  }
  function bridgePost(url, body, authHeader) {
    const b = bridge();
    if (!b || !b.httpPostAsync) return Promise.resolve(null);
    return new Promise(res => {
      const id = 'c' + (++lingSeq);
      lingCbs[id] = res;
      try { b.httpPostAsync(id, url, body, authHeader || ''); } catch (e) { delete lingCbs[id]; return res(null); }
      setTimeout(() => { if (lingCbs[id]) { delete lingCbs[id]; res(null); } }, 40000);
    });
  }
  function tryOpen(url) {
    const b = bridge();
    if (b) { try { return b.openUrl(url) === true; } catch (e) { return false; } }
    window.open(url, '_blank');
    return true;
  }

  // 远程图片 → base64 data URL（原生桥 httpGetImage）
  window.__lingImageCb = (id, ok, mime, b64) => {
    const cb = lingImageCbs[id]; delete lingImageCbs[id];
    if (cb) cb(ok && b64 ? 'data:' + (mime || 'image/jpeg') + ';base64,' + b64 : null);
  };
  const lingImageCbs = {};
  let lingImgSeq = 0;
  function bridgeImage(url) {
    const b = bridge();
    if (!b || !b.httpGetImage) return Promise.resolve(null);
    return new Promise(res => {
      const id = 'i' + (++lingImgSeq);
      lingImageCbs[id] = res;
      try { b.httpGetImage(id, url); } catch (e) { delete lingImageCbs[id]; return res(null); }
      setTimeout(() => { if (lingImageCbs[id]) { delete lingImageCbs[id]; res(null); } }, 12000);
    });
  }

  // ── 原生选图：绕开 WebView 文件选择器（部分 ROM 回调不回传） ──
  window.__lingPickCb = (id, arr) => {
    const cb = lingPickCbs[id]; delete lingPickCbs[id];
    if (cb) cb(Array.isArray(arr) ? arr : null);
  };
  const lingPickCbs = {};
  let lingPickSeq = 0;
  function bridgePickImages(max) {
    const b = bridge();
    if (!b || !b.pickImages) return Promise.resolve(null);
    return new Promise(res => {
      const id = 'p' + (++lingPickSeq);
      lingPickCbs[id] = res;
      try { b.pickImages(id, max || 1); } catch (e) { delete lingPickCbs[id]; return res(null); }
      // 用户在相册停留可能很久，给足 5 分钟。
      // 超时按「已答复」的空结果处理（res([])）：那时候早没有用户手势了，
      // 再回退去点 input 只会让相册莫名自己弹一次。
      setTimeout(() => { if (lingPickCbs[id]) { delete lingPickCbs[id]; res([]); } }, 300000);
    });
  }
  // input 选中的 File → data URL（走原 compressImage 逻辑的简化版：只转 URL 不重压）
  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }
  // 优先走原生选图；原生不可用时退回 input.click()（WebView 文件选择器）。
  // handle 接收的是 data URL 字符串数组（原生直接给，input 路径转好再给）。
  //
  // 返回值约定：null = 原生这条路走不通（没有桥 / 调用直接抛错）→ 才回退；
  //            数组（哪怕是空数组）= 原生已经答复过了。空数组说明用户在相册里点了取消，
  //            这时绝对不能回退 —— 回退会立刻再弹一次选择器，表现就是「取消后自己又弹出来」。
  async function lingPickOrClick(inputSel, max, handle) {
    const b = bridge();
    if (b && b.pickImages) {
      let urls = null;
      try { urls = await bridgePickImages(max); } catch (e) { urls = null; }
      if (Array.isArray(urls)) {
        if (urls.length) await handle(urls);
        return;
      }
    }
    const inp = $(inputSel);
    if (!inp) return;
    inp.click();
  }

  function playQuery(w) { return [w.title, w.creator].filter(x => x && String(x).trim()).join(' '); }
  function playCache() { try { return JSON.parse(localStorage.getItem(PLAY_CACHE_KEY) || '{}'); } catch (e) { return {}; } }
  function cacheKey(w) { return 'a:' + playQuery(w); }

  function scoreAlbum(a, w) {
    const name = String(a.name || '');
    const who = String(a.who || '');
    let v = 0;
    if (name === w.title) v += 3; else if (name.indexOf(w.title) >= 0) v += 2;
    if (w.creator && who.indexOf(w.creator) >= 0) v += 6;
    return v;
  }

  function canOpen(url) {
    const b = bridge();
    if (!b || !b.canOpen) return true;
    try { return b.canOpen(url) === true; } catch (e) { return false; }
  }

  async function resolveQQ(w) {
    const q = playQuery(w);
    const body = await bridgeGet('https://c.y.qq.com/soso/fcgi-bin/search_for_qq_cp?p=1&n=8&w=' + encodeURIComponent(q) + '&format=json');
    if (!body) return null;
    try {
      const j = JSON.parse(body);
      const list = (j.data && j.data.song && j.data.song.list) || [];
      let best = null, bestV = -1;
      for (const s of list) {
        const v = scoreAlbum({ name: s.songname, who: (s.singer || []).map(a => a.name).join('/') }, w);
        if (v > bestV) { bestV = v; best = s; }
      }
      return best && best.albummid ? { kind: 'song', albumMid: best.albummid, songMid: best.songmid || '' } : null;
    } catch (e) { return null; }
  }

  async function resolveWY(w) {
    const q = playQuery(w);
    // 搜歌曲：返回里自带所属专辑 id，一首歌就能同时拿到歌曲与专辑两个入口
    const body = await bridgeGet('https://music.163.com/api/search/get?s=' + encodeURIComponent(q) + '&type=1&limit=8');
    if (!body) return null;
    try {
      const j = JSON.parse(body);
      const list = (j.result && j.result.songs) || [];
      let best = null, bestV = -1;
      for (const s of list) {
        const v = scoreAlbum({ name: s.name, who: (s.artists || []).map(x => x.name).join('/') }, w);
        if (v > bestV) { bestV = v; best = s; }
      }
      if (!best || !best.id) return null;
      return { kind: 'song', wyId: best.album ? best.album.id : 0, wySongId: best.id };
    } catch (e) { return null; }
  }

  function launchAlbum(key, w, ids) {
    const q = playQuery(w);
    // kind 缺省时（旧缓存/手动搜索）：有歌曲 id 就按歌曲跳，只有专辑 id 才按专辑跳
    const kind = (ids && ids.kind) || ((ids && (ids.songMid || ids.wySongId)) ? 'song' : 'album');
    if (key === 'qq') {
      const m = ids && ids.albumMid, sm = ids && ids.songMid;
      // 选了歌曲 → 直接跳歌曲播放
      if (kind === 'song' && sm) {
        // playSonglist 是真正触发播放的 scheme；songDetail 打开歌曲详情页
        const u0 = 'qqmusic://qq.com/media/playSonglist?p=' + encodeURIComponent('{"song":[{"songmid":"' + sm + '"}]}');
        if (canOpen(u0) && tryOpen(u0)) return true;
        const u = 'qqmusic://qq.com/ui/songDetail?p=' + encodeURIComponent('{"songmid":"' + sm + '"}');
        if (canOpen(u) && tryOpen(u)) return true;
        return tryOpen('https://y.qq.com/n/ryqq/songDetail/' + sm);
      }
      // 选了专辑 → 跳专辑页
      if (m) {
        const u1 = 'qqmusic://qq.com/ui/albumDetail?p=' + encodeURIComponent('{"albummid":"' + m + '"}');
        if (canOpen(u1) && tryOpen(u1)) return true;
        const u2 = 'qqmusic://qq.com/ui/albumDetail?albumMid=' + m;
        if (canOpen(u2) && tryOpen(u2)) return true;
      }
      // 兜底：有歌跳歌，有专辑跳专辑页
      if (sm) {
        const u3 = 'qqmusic://qq.com/ui/songDetail?p=' + encodeURIComponent('{"songmid":"' + sm + '"}');
        if (canOpen(u3) && tryOpen(u3)) return true;
      }
      return tryOpen('https://i.y.qq.com/n2/m/share/details/album.html' + (m ? '?albumMid=' + m : ''));
    }
    if (key === 'wy') {
      const aid = ids && ids.wyId, sid = ids && ids.wySongId;
      // 选了歌曲 → 跳歌曲播放（autoplay=1 直接开播）
      if (kind === 'song' && sid) {
        const u = 'orpheus://song/' + sid + '?autoplay=1';
        if (canOpen(u) && tryOpen(u)) return true;
        const u0 = 'orpheus://song/' + sid;
        if (canOpen(u0) && tryOpen(u0)) return true;
        return tryOpen('https://music.163.com/#/song?id=' + sid);
      }
      // 选了专辑 → 跳专辑页
      if (aid) {
        const u1 = 'orpheus://album/' + aid;
        if (canOpen(u1) && tryOpen(u1)) return true;
      }
      if (sid) {
        const u2 = 'orpheus://song/' + sid;
        if (canOpen(u2) && tryOpen(u2)) return true;
      }
      return tryOpen('https://music.163.com/' + (aid ? '#/album?id=' + aid : '#/search/m/?type=10&s=' + encodeURIComponent(q)));
    }
    const web = {
      qs: 'https://www.qishui.com/search?keyword=',
      kg: 'https://www.kugou.com/yy/html/search.html#searchType=song&searchKeyWord=',
      kw: 'https://www.kuwo.cn/search/list?cat=album&key='
    }[key];
    return web ? tryOpen(web + encodeURIComponent(q)) : false;
  }

  async function doPlay(key, w, btn) {
    const name = (PLAY_DEFS.find(p => p.key === key) || {}).name || key;
    if (btn) btn.classList.add('busy');
    toast('正在找《' + w.title + '》…');
    let ids = playCache()[cacheKey(w)] || {};
    try {
      // 只有缺少「跳转所需 ID」时才重新搜索：歌曲需要 songMid/wySongId，专辑需要 albumMid/wyId
      const kind = ids.kind || 'song';
      const needQQ = key === 'qq' && (kind === 'song' ? !ids.songMid : !ids.albumMid);
      const needWY = key === 'wy' && (kind === 'song' ? !ids.wySongId : !ids.wyId);
      if (needQQ) {
        const r = await resolveQQ(w);
        if (r) { ids = Object.assign(ids, r); const c = playCache(); c[cacheKey(w)] = ids; localStorage.setItem(PLAY_CACHE_KEY, JSON.stringify(c)); }
      } else if (needWY) {
        const r = await resolveWY(w);
        if (r) { ids = Object.assign(ids, r); const c = playCache(); c[cacheKey(w)] = ids; localStorage.setItem(PLAY_CACHE_KEY, JSON.stringify(c)); }
      }
    } catch (e) {}
    if (btn) btn.classList.remove('busy');
    const ok = launchAlbum(key, w, ids);
    if (!ok) toast('没能打开' + name + '，确认是否安装');
  }

  function longPress(el, fn) {
    let t = null, moved = false;
    const start = e => { moved = false; t = setTimeout(() => { t = null; if (!moved) fn(e); }, 550); };
    const cancel = () => { if (t) { clearTimeout(t); t = null; } };
    el.addEventListener('touchstart', start, { passive: true });
    el.addEventListener('touchmove', () => { moved = true; cancel(); }, { passive: true });
    el.addEventListener('touchend', cancel);
    el.addEventListener('touchcancel', cancel);
    el.addEventListener('contextmenu', e => { e.preventDefault(); });
  }

  function lingPlayRender(w) {
    const row = $('#dtPlayRow'), btn = $('#dtPlay');
    if (!row) return;
    const isAlbum = w && w.type === 'album';
    row.hidden = !isAlbum;
    if (!isAlbum) return;
    btn.onclick = () => {
      const d = localStorage.getItem(PLAY_DEF_KEY);
      if (!d) openPlaySheet(w);
      else doPlay(d, w, btn);
    };
    longPress(btn, () => openPlaySheet(w));
  }

  // 状态栏图标深浅跟随详情页主题：背景浅 → 深色图标，背景深 → 白色图标
  function lingLuma(hex) {
    const s = String(hex || '').replace('#', '');
    if (s.length < 6) return 1;
    const r = parseInt(s.slice(0, 2), 16) / 255;
    const g = parseInt(s.slice(2, 4), 16) / 255;
    const b = parseInt(s.slice(4, 6), 16) / 255;
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function lingSyncStatusBar(forceLight) {
    try {
      const b = bridge();
      if (!b || !b.setStatusBarIcons) return;
      let light = true;
      if (!forceLight && $('#detailPage').classList.contains('open')) {
        const bg = getComputedStyle($('#detailPage')).getPropertyValue('--dt-bg') || '';
        light = lingLuma(bg.trim()) > 0.55;
      } else if (forceLight) {
        // 非详情页强制浅色时，仍要尊重全局深色主题（午夜放映室 / 午夜蓝）
        light = !appThemeIsDark();
      }
      b.setStatusBarIcons(light);
    } catch (e) {}
  }

  function openPlaySheet(w) {
    const def = localStorage.getItem(PLAY_DEF_KEY);
    $('#actionContent').innerHTML = `<div class="action-title">播放《${esc(w.title)}》</div>
      <p class="action-note">会用歌名和${w.creator ? '「' + esc(w.creator) + '」' : '歌手'}搜索专辑并缓存，下次直接跳。长按某个平台设为默认，之后点播放键直达。</p>
      ${PLAY_DEFS.map(p => `<button class="action-item play-item" data-play="${p.key}">
        <i class="play-dot" style="background:${p.dot}"></i>${p.name}
        <span class="play-state${def === p.key ? ' def' : ''}" id="playState-${p.key}">${def === p.key ? '默认' : ''}</span></button>`).join('')}
      <button class="action-cancel" data-close="actions">取消</button>`;
    openSheet('actionSheet');

    // 逐个探测：装了 App 标「已安装」，否则标「网页」
    (async () => {
      const probe = [
        ['qq', canOpen('qqmusic://qq.com/ui/songDetail?p=x')],
        ['wy', canOpen('orpheus://song/1')],
        ['qs', isPkgInstalled('com.luna.music')],
        ['kg', isPkgInstalled('com.kugou.android')],
        ['kw', isPkgInstalled('cn.kuwo.player')]
      ];
      for (const [key, ok] of probe) {
        const el = $('#playState-' + key);
        if (el) el.textContent = (ok ? '已安装' : '网页') + (localStorage.getItem(PLAY_DEF_KEY) === key ? ' · 默认' : '');
      }
    })();

    $$('#actionContent [data-play]').forEach(el => {
      const key = el.dataset.play;
      el.addEventListener('click', () => { closeSheet('actionSheet'); doPlay(key, w); });
      longPress(el, () => {
        const cur = localStorage.getItem(PLAY_DEF_KEY);
        if (cur === key) { localStorage.removeItem(PLAY_DEF_KEY); toast('已取消默认播放平台'); }
        else { localStorage.setItem(PLAY_DEF_KEY, key); toast('已设为默认：' + (PLAY_DEFS.find(p => p.key === key) || {}).name); }
        closeSheet('actionSheet');
        lingPlayRender(w);
      });
    });
  }

  function isPkgInstalled(pkg) {
    const b = bridge();
    if (!b || !b.isInstalled) return false;
    try { return b.isInstalled(pkg) === true; } catch (e) { return false; }
  }

  // ── 设置抽屉：数据备份导出 / 导入 ───────────────────────
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-ling]');
    if (!el) return;
    if (el.dataset.ling === 'export-backup') {
      const payload = JSON.stringify({
        app: 'ling-backup', version: 1, exportedAt: new Date().toISOString(),
        db: localStorage.getItem(DB_KEY) || 'null',
        drafts: localStorage.getItem(DRAFT_KEY) || 'null'
      });
      const count = (db.works || []).length;
      const b = bridge();
      const fname = 'ling-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      closeDrawer();
      if (b && b.saveFile) {
        let ok = false;
        try { ok = b.saveFile(fname, payload); } catch (err) { ok = false; }
        toast(ok ? `已导出 ${count} 部作品到 下载/${fname}` : '保存失败，请检查存储权限');
      } else {
        navigator.clipboard.writeText(payload).then(
          () => toast(`已导出 ${count} 部作品，内容已复制到剪贴板`),
          () => toast('导出失败')
        );
      }
    }
    if (el.dataset.ling === 'import-backup') {
      const inp = $('#backupFile');
      inp.value = '';
      inp.onchange = () => {
        const f = inp.files && inp.files[0];
        if (!f) return;
        const r = new FileReader();
        r.onload = async () => {
          let j = null;
          try { j = JSON.parse(String(r.result)); } catch (err) { j = null; }
          if (!j || j.app !== 'ling-backup' || typeof j.db !== 'string') {
            toast('不是有效的备份文件');
            return;
          }
          let count = 0;
          try { const d = JSON.parse(j.db); count = (d.works || []).length; } catch (err) {}
          closeDrawer();
          const ok = await confirmModal({
            icon: 'image',
            title: '导入这份备份？',
            text: `备份里共有 ${count} 部作品（${(j.exportedAt || '').slice(0, 10)} 导出）。导入后会覆盖当前全部记录，且无法撤销。`,
            okLabel: '覆盖并导入'
          });
          if (!ok) return;
          localStorage.setItem(DB_KEY, j.db);
          if (typeof j.drafts === 'string') localStorage.setItem(DRAFT_KEY, j.drafts);
          toast('导入完成，正在重新打开…');
          setTimeout(() => location.reload(), 400);
        };
        r.readAsText(f);
      };
      inp.click();
    }
  });

  // 原生返回键：侧边栏优先
  const lingOrigBack = window.androidBack;
  window.androidBack = () => {
    const d = $('#lingDrawer');
    if (d && d.classList.contains('open')) { closeDrawer(); return true; }
    return lingOrigBack ? lingOrigBack() : false;
  };

  // 原生注入安全区高度
  window.__setSafeInsets = (top, bottom) => {
    const st = document.documentElement.style;
    st.setProperty('--ling-sat', (top || 0) + 'px');
    st.setProperty('--ling-sab', (bottom || 0) + 'px');
  };

  // 详情页主题色变化 → 状态栏图标深浅 + 白边柔化
  const lingDetailPage = $('#detailPage');
  if (lingDetailPage && window.MutationObserver) {
    new MutationObserver(() => { lingSyncStatusBar(); lingSoftenBorders(); }).observe(lingDetailPage, {
      attributes: true, attributeFilter: ['style', 'class']
    });
  }

  // 主题给出的玻璃描边偏白、在深色背景上很扎眼：把白描边降一档透明度
  function lingSoftenBorders() {
    const page = $('#detailPage');
    if (!page) return;
    const soft = (v, fallback) => {
      const s = String(v || '').replace(/\s/g, '');
      if (/^rgba\(255,255,255,\d*\.?\d+\)$/.test(s)) {
        const a = parseFloat(s.split(',')[3]);
        return 'rgba(255,255,255,' + Math.min(a, 0.18).toFixed(2) + ')';
      }
      if (s === '#fff' || s === '#ffffff') return fallback;
      return s || fallback;
    };
    const st = page.style;
    st.setProperty('--dt-glass-line', soft(st.getPropertyValue('--dt-glass-line'), 'rgba(255,255,255,.16)'));
    st.setProperty('--dt-card-line', soft(st.getPropertyValue('--dt-card-line'), 'rgba(255,255,255,.12)'));
  }

  // ── 播放设置侧边栏 ──────────────────────────────────────
  function openDrawer() { renderDrawer(); $('#lingDrawer').classList.add('open'); $('#lingDrawer').setAttribute('aria-hidden', 'false'); }
  function closeDrawer() { $('#lingDrawer').classList.remove('open'); $('#lingDrawer').setAttribute('aria-hidden', 'true'); }

  function renderDrawer() {
    const def = localStorage.getItem(PLAY_DEF_KEY);
    const label = $('#drawerDefLabel');
    const chevron = $('#drawerDefChevron');
    if (label) {
      if (def) {
        label.textContent = (PLAY_DEFS.find(p => p.key === def) || {}).name || def;
        label.classList.add('set');
      } else {
        label.textContent = '不设默认';
        label.classList.remove('set');
      }
    }
    if (chevron) chevron.classList.toggle('open', $('#drawerDefPop') && !$('#drawerDefPop').hidden);

    const box = $('#drawerPlatforms');
    if (box) {
      box.innerHTML = PLAY_DEFS.map(p => `
        <button class="action-item" data-drawer-plat="${p.key}">
          <i class="play-dot" style="background:${p.dot}"></i>${p.name}
          <span class="play-state${def === p.key ? ' def' : ''}">${def === p.key ? '默认' : ''}</span>
        </button>`).join('');
      box.querySelectorAll('[data-drawer-plat]').forEach(el => {
        el.addEventListener('click', () => {
          localStorage.setItem(PLAY_DEF_KEY, el.dataset.drawerPlat);
          toast('默认播放源：' + (PLAY_DEFS.find(p => p.key === el.dataset.drawerPlat) || {}).name);
          renderDrawer();
        });
      });
      // 逐个探测：装了 App 标「已安装」，否则标「网页」
      const probe = [
        ['qq', canOpen('qqmusic://qq.com/ui/songDetail?p=x')],
        ['wy', canOpen('orpheus://song/1')],
        ['qs', isPkgInstalled('com.luna.music')],
        ['kg', isPkgInstalled('com.kugou.android')],
        ['kw', isPkgInstalled('cn.kuwo.player')]
      ];
      box.querySelectorAll('[data-drawer-plat]').forEach(el => {
        const hit = probe.find(p => p[0] === el.dataset.drawerPlat);
        if (!hit) return;
        const ok = hit[1];
        const st = el.querySelector('.play-state');
        if (st) st.textContent = (ok ? '已安装' : '网页') + (def === el.dataset.drawerPlat ? ' · 默认' : '');
      });
    }
    const noDef = $('#drawerNoDefState');
    if (noDef) noDef.textContent = def ? '' : '当前';
  }

  document.addEventListener('click', e => {
    const open = e.target.closest('[data-action="open-drawer"]');
    if (open) { openDrawer(); return; }
    const close = e.target.closest('[data-close="drawer"]');
    if (close) { closeDrawer(); return; }
    // 折叠面板：点顶部收起/展开
    if (e.target.closest('#drawerDefSelect')) {
      const pop = $('#drawerDefPop');
      if (pop) pop.hidden = !pop.hidden;
      renderDrawer();
      return;
    }
    if (e.target.closest('#drawerNoDef')) {
      localStorage.removeItem(PLAY_DEF_KEY);
      toast('已清除默认播放源');
      renderDrawer();
      return;
    }
  });

  // ── 添加专辑：关键词联想（songlog 式） ───────────────────
  const lingSug = $('#lingSug');
  const lingFormTitle = $('#formTitle');
  const lingFormCreator = $('#formCreator');
  const lingCreatorField = $('#creatorField');
  let lingSugTimer = null;
  let lingSugSeq = 0;

  function lingFormType() {
    if (typeof ui !== 'undefined' && ui.formType) return ui.formType;
    const active = document.querySelector('#typeGrid .type-option.active');
    return active ? active.dataset.type : '';
  }
  // v2.0.1：移除旧的 lingSyncCreatorField（只认 album，会把书/漫画等的作者字段藏掉），
  // 创作者字段统一由表单主逻辑的 syncCreatorField() 管理。

  function lingHideSug() { if (lingSug) { lingSug.hidden = true; lingSug.innerHTML = ''; } }

  function lingPickSug(item) {
    if (!lingFormTitle) return;
    lingFormTitle.value = item.name;
    // 只有专辑类型才回填「歌手/创作者」；书影类联想不带创作者字段
    if (lingFormCreator && item.artist && !item.douban) lingFormCreator.value = item.artist;
    lingHideSug();
    // 封面直接用作作品图标（详情页黑胶区会显示这张封面）
    if (item.cover && typeof ui !== 'undefined') {
      ui.formIcon = item.cover;
      if (typeof renderFormIcon === 'function') renderFormIcon();
    }
    // 把搜到的 ID 直接放进播放缓存，记录完成后点播放无需再搜
    const c = playCache();
    const ids = {};
    if (item.kind) ids.kind = item.kind;
    if (item.albumMid) ids.albumMid = item.albumMid;
    if (item.songMid) ids.songMid = item.songMid;
    if (item.wyId) ids.wyId = item.wyId;
    if (item.wySongId) ids.wySongId = item.wySongId;
    if (Object.keys(ids).length) {
      c[cacheKey({ title: item.name, creator: item.artist || '' })] = ids;
      localStorage.setItem(PLAY_CACHE_KEY, JSON.stringify(c));
    }
    toast('已填入《' + item.name + '》');
  }

  async function lingFetchSug(q) {
    const seq = ++lingSugSeq;
    const type = lingFormType();
    const wantAlbum = type === 'album';
    const wantMusic = wantAlbum;
    const wantDouban = type === 'book' || type === 'film' || type === 'comic' || type === 'game';
    const out = [];
    let qqOk = false, wyOk = false, dbOk = false;
    const push = (name, artist, extra) => {
      if (!name || out.some(x => x.name === name && x.artist === (artist || ''))) return;
      out.push(Object.assign({ name, artist: artist || '' }, extra));
    };
    const qqCover = mid => mid ? 'https://y.qq.com/music/photo_new/T002R300x300M000' + mid + '.jpg' : '';

    if (wantMusic) {
      // 专辑类型：优先按「歌名」联想（一首歌能同时拿到歌曲与专辑两个入口），
      // 同时把所属专辑名也作为候选，方便想直接记专辑的用户。
      const qqBody = await bridgeGet('https://c.y.qq.com/soso/fcgi-bin/search_for_qq_cp?p=1&n=10&w=' + encodeURIComponent(q) + '&format=json');
      if (seq !== lingSugSeq) return;
      if (qqBody) {
        qqOk = true;
        try {
          const j = JSON.parse(qqBody);
          const songs = (j.data && j.data.song && j.data.song.list) || [];
          const albums = (j.data && j.data.album && j.data.album.list) || [];
          // 歌曲：名字即歌名，副标题为歌手，kind 标记为 song（跳播放）
          for (const s of songs) {
            push(s.songname, (s.singer || []).map(a => a.name).join('/'),
              { kind: 'song', songMid: s.songmid, albumMid: s.albummid, cover: qqCover(s.albummid) });
            if (out.length >= 8) break;
          }
          // 专辑：补充同名/相关专辑候选，kind 标记为 album（跳专辑页）
          if (out.length < 8) {
            for (const a of albums) {
              push(a.albumname, (a.singer || []).map(x => x.name).join('/'),
                { kind: 'album', albumMid: a.albummid, songMid: '', cover: qqCover(a.albummid) });
              if (out.length >= 8) break;
            }
          }
        } catch (e) {}
      }
      if (out.length < 8) {
        const wyBody = await bridgeGet('https://music.163.com/api/search/get?s=' + encodeURIComponent(q) + '&type=1&limit=8');
        if (seq !== lingSugSeq) return;
        if (wyBody) {
          wyOk = true;
          try {
            const j = JSON.parse(wyBody);
            for (const s of ((j.result && j.result.songs) || [])) {
              push(s.name, (s.artists || []).map(x => x.name).join('/'),
                { kind: 'song', wySongId: s.id, wyId: s.album ? s.album.id : 0, cover: s.album && s.album.picUrl ? String(s.album.picUrl).replace('http://', 'https://') : '' });
              if (out.length >= 8) break;
            }
          } catch (e) {}
        }
        // 网易云专辑搜索：补专辑候选（kind 标记 album，跳专辑页）
        if (out.length < 8) {
          const wyAlbBody = await bridgeGet('https://music.163.com/api/search/get?s=' + encodeURIComponent(q) + '&type=10&limit=6');
          if (seq !== lingSugSeq) return;
          if (wyAlbBody) {
            try {
              const ja = JSON.parse(wyAlbBody);
              for (const a of ((ja.result && ja.result.albums) || [])) {
                push(a.name, (a.artists || []).map(x => x.name).join('/'),
                  { kind: 'album', wyId: a.id, cover: a.picUrl ? String(a.picUrl).replace('http://', 'https://') : '' });
                if (out.length >= 8) break;
              }
            } catch (e) {}
          }
        }
      }
    } else if (wantDouban) {
      // 书 / 电影 / 漫画 / 游戏：接豆瓣联想接口（返回标题 + 封面 + 年份 + 类型）
      const dbBody = await bridgeGet('https://movie.douban.com/j/subject_suggest?q=' + encodeURIComponent(q));
      if (seq !== lingSugSeq) return;
      if (dbBody) {
        dbOk = true;
        try {
          const j = JSON.parse(dbBody);
          const list = Array.isArray(j) ? j : [];
          for (const it of list) {
            const name = it.title || '';
            const sub = it.sub_title || '';
            const year = it.year ? String(it.year) : '';
            push(name, sub,
              { douban: true, cover: it.img ? String(it.img).replace('http://', 'https://') : '', meta: year });
            if (out.length >= 8) break;
          }
        } catch (e) {}
      }
    }

    if (seq !== lingSugSeq) return;
    if (!lingSug) return;
    if (!out.length) {
      lingSug.innerHTML = qqOk || wyOk || dbOk
        ? '<div class="ling-sug-empty">没搜到相关结果，直接保存也行</div>'
        : '<div class="ling-sug-empty">搜索失败，请检查网络后重试</div>';
      lingSug.hidden = false;
      return;
    }
    lingSug.innerHTML = out.map((it, i) => {
      const badge = it.douban ? '' : (it.kind === 'album' ? '<span class="ls-badge">专辑</span>' : '<span class="ls-badge ls-badge-song">歌曲</span>');
      return `
      <button class="ling-sug-item" data-sug="${i}">
        ${it.cover ? `<img class="ls-cover" src="${esc(it.cover)}" alt="">` : '<span class="ls-cover"></span>'}
        <span class="ls-name">${esc(it.name)}</span>
        <span class="ls-sub">${esc(it.artist || it.meta || '')}</span>
        ${badge}
      </button>`;
    }).join('');
    lingSug.hidden = false;
    lingSug.querySelectorAll('[data-sug]').forEach(el => {
      el.addEventListener('click', () => lingPickSug(out[Number(el.dataset.sug)]));
    });
  }

  if (lingFormTitle && lingSug) {
    lingFormTitle.addEventListener('input', () => {
      if (lingSugTimer) clearTimeout(lingSugTimer);
      const q = lingFormTitle.value.trim();
      if (q.length < 1) { lingHideSug(); return; }
      lingSugTimer = setTimeout(() => lingFetchSug(q), 420);
    });
    lingFormTitle.addEventListener('blur', () => setTimeout(lingHideSug, 220));
  }

  // ── AI 助手（多模型） ─────────────────────────────────────
  const AI_KEY = 'yuwei.ai.key.v1';
  const AI_MODEL_KEY = 'yuwei.ai.model.v1';
  const AI_DAILY_KEY = 'yuwei.ai.daily.v1';
  // 多模型配置：key 为标识，label 展示名，endpoint 为 OpenAI 兼容 chat 接口，model 为模型名
  const AI_MODELS = {
    deepseek: { label: 'DeepSeek', endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat' },
    qwen:     { label: '通义千问', endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', model: 'qwen-plus' },
    glm:      { label: '智谱 GLM', endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', model: 'glm-4-flash' },
    kimi:     { label: 'Kimi (Moonshot)', endpoint: 'https://api.moonshot.cn/v1/chat/completions', model: 'moonshot-v1-8k' }
  };
  const aiModelEl = $('#aiModelSelect');
  const aiModelLabel = $('#aiModelLabel');
  const aiModelList = $('#aiModelList');
  const aiKeyInput = $('#aiKeyInput');
  const aiTagBtn = $('#aiTagBtn');

  function aiModelKey() {
    const m = localStorage.getItem(AI_MODEL_KEY);
    return AI_MODELS[m] ? m : 'deepseek';
  }
  function aiKey() { return String(localStorage.getItem(AI_KEY) || '').trim(); }
  function aiSetKey(v) { if (v) localStorage.setItem(AI_KEY, v); else localStorage.removeItem(AI_KEY); }

  function aiRenderModelList() {
    if (!aiModelLabel) return;
    const cur = aiModelKey();
    aiModelLabel.textContent = AI_MODELS[cur].label;
    if (aiModelList) {
      aiModelList.innerHTML = Object.keys(AI_MODELS).map(k =>
        `<button class="action-item" data-ai-model="${k}"><i class="play-dot" style="background:${k === cur ? '#4A5FA8' : '#98A2B3'}"></i>${AI_MODELS[k].label}<span class="play-state">${k === cur ? '✓' : ''}</span></button>`
      ).join('');
    }
  }

  if (aiModelEl) {
    aiModelEl.addEventListener('click', () => {
      const pop = $('#aiModelPop');
      if (!pop) return;
      pop.hidden = !pop.hidden;
      const chev = $('#aiModelChevron');
      if (chev) chev.classList.toggle('open', !pop.hidden);
    });
  }
  if (aiModelList) {
    aiModelList.addEventListener('click', e => {
      const b = e.target.closest('[data-ai-model]');
      if (!b) return;
      localStorage.setItem(AI_MODEL_KEY, b.dataset.aiModel);
      aiRenderModelList();
      const pop = $('#aiModelPop');
      if (pop) pop.hidden = true;
      const chev = $('#aiModelChevron');
      if (chev) chev.classList.remove('open');
    });
  }
  if (aiKeyInput) {
    aiKeyInput.value = aiKey();
    aiKeyInput.addEventListener('change', () => aiSetKey(aiKeyInput.value.trim()));
    aiKeyInput.addEventListener('blur', () => aiSetKey(aiKeyInput.value.trim()));
  }

  // 统一调用大模型：system+user 提示词，返回文本内容；失败返回 null
  async function aiChat(system, user, temp = 0.9) {
    const key = aiKey();
    if (!key) { toast('先在侧边栏「AI 助手」填入 API Key'); return null; }
    const cfg = AI_MODELS[aiModelKey()] || AI_MODELS.deepseek;
    try {
      const resp = await bridgePost(cfg.endpoint,
        JSON.stringify({ model: cfg.model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], temperature: temp, max_tokens: 800 }),
        'Bearer ' + key);
      if (!resp) { toast('AI 请求失败，请检查网络或 Key'); return null; }
      const j = JSON.parse(resp);
      const txt = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || '';
      return String(txt).trim();
    } catch (e) { toast('AI 请求出错'); return null; }
  }

  // 1) AI 智能标签
  async function aiSuggestTag() {
    const title = $('#formTitle') ? $('#formTitle').value.trim() : '';
    if (!title) { toast('先写下作品名称'); $('#formTitle').focus(); return; }
    const typeLabel = (TYPES[ui.formType] || {}).label || '';
    const why = $('#formWhy') ? $('#formWhy').value.trim() : '';
    if (aiTagBtn) { aiTagBtn.disabled = true; }
    const sys = '你是文艺作品分类助手。根据作品名称、类型和想看理由，给出一个最贴切、2~4 字的短标签（如：治愈、经典、热血、科幻、成长、悬疑、美食、传记、民谣）。只输出标签本身，不要解释、标点、引号。';
    const user = '作品名称：' + title + '\n类型：' + typeLabel + (why ? '\n想看理由：' + why : '');
    const txt = await aiChat(sys, user, 1.2);
    if (aiTagBtn) aiTagBtn.disabled = false;
    if (!txt) return;
    const tag = txt.replace(/[\s"「」『』'"`，。,.、·：:；;！!？?（）()【】\[\]]/g, '').slice(0, 8);
    if (!tag) { toast('AI 没返回有效标签'); return; }
    const input = $('#formTag');
    if (input) input.value = tag;
    if (typeof renderTagChips === 'function') renderTagChips();
    toast('已填入标签「' + tag + '」');
  }

  // 2) 相似作品推荐
  async function aiSimilarWork(w) {
    if (!w) return;
    openSheet('aiSheet');
    $('#aiSheetTitle').textContent = '相似作品推荐';
    $('#aiSheetBody').innerHTML = '<div class="ai-loading">正在思考《' + esc(w.title) + '》的相似作品…</div>';
    const typeLabel = (TYPES[w.type] || {}).label || '';
    const notes = (w.notes || []).map(n => n.text).filter(Boolean).join('；');
    const thought = w.thought || '';
    const sys = '你是文艺作品推荐助手。根据用户正在看/听/读的作品，推荐 4 个气质相近的作品。输出严格 JSON 数组（不要任何其它文字），每项含 name(作品名)、creator(作者/导演/歌手)、why(一句话推荐理由)。';
    const user = '作品名称：' + w.title + (w.creator ? '\n创作者：' + w.creator : '') + '\n类型：' + typeLabel +
      (thought ? '\n我的感想：' + thought : '') + (notes ? '\n笔记摘录：' + notes : '');
    const txt = await aiChat(sys, user, 1.0);
    if (!txt) { closeSheet('aiSheet'); return; }
    let items = [];
    try {
      const m = txt.match(/\[[\s\S]*\]/);
      const arr = JSON.parse(m ? m[0] : txt);
      if (Array.isArray(arr)) items = arr;
    } catch (e) {}
    if (!items.length) { $('#aiSheetBody').innerHTML = '<div class="ai-empty">AI 没有返回推荐结果，请重试。</div>'; return; }
    $('#aiSheetBody').innerHTML = '<div class="ai-src">基于《' + esc(w.title) + '》</div>' +
      items.map(it => `<div class="ai-card"><div class="ai-card-name">${esc(it.name || '')}</div><div class="ai-card-creator">${esc(it.creator || '')}</div><div class="ai-card-why">${esc(it.why || '')}</div></div>`).join('');
  }

  // 3) 每日推荐（文章 + 电影片段），按日期缓存
  function openDaily() {
    openSheet('aiSheet');
    // 标题带上 AI：和「想看」页那条基于真实待看的「今日灵感」明确分开，
    // 用户一眼能看出哪条是本地挑选、哪条是模型生成的推测。
    $('#aiSheetTitle').textContent = '每日推荐 · AI';
    const today = todayISO();
    const cached = (() => { try { const o = JSON.parse(localStorage.getItem(AI_DAILY_KEY) || 'null'); return o && o.date === today ? o : null; } catch (e) { return null; } })();
    if (cached) { renderDaily(cached); return; }
    $('#aiSheetBody').innerHTML = '<div class="ai-loading">正在为你准备今天的推荐…</div>';
    aiDaily(today);
  }
  async function aiDaily(today) {
    const sys = '你是文艺编辑，每天推荐内容。请给出两部分：一篇值得读的文章（或书摘）+ 一部值得看的作品（电影/剧集/动漫/游戏/专辑音乐任选其一）。文章：从原文里截取「最精彩的一小段」作为精选片段 excerpt（约 60~120 字，原汁原味的原文，不要转述），并给 title（文章/书名）、genre（体裁：小说/散文/诗歌/随笔/杂文/评论/书信等）、author（作者名）、year（创作/出版年代，如 1925）、source（出处，如某本书/某杂志）、theme（主题，一句话概括）、why（为什么值得读，约 30~60 字）、bg（背景或作者冷知识，约 20~40 字）。作品：要信息完整、有画面感，给 kind（电影/剧集/动漫/游戏/音乐）、title（作品名）、year（年代，如 1994）、genre（类型/流派）、creator（导演或主创，可用「/」连接）、comment（一句话点评，可结合影评，要有观点）、review（一段影评摘录或观感，约 40~80 字）、bg（一句背景/冷知识，约 20~40 字）。严格输出 JSON（不要任何其它文字）：{"article":{"title":"","genre":"","author":"","year":"","source":"","excerpt":"","theme":"","why":"","bg":""},"work":{"kind":"","title":"","year":"","genre":"","creator":"","comment":"","review":"","bg":""}}。';
    const user = '今天是 ' + today + '，请给我今日的文艺推荐，作品尽量避开过于大众的，选点有记忆点的。';
    const txt = await aiChat(sys, user, 1.1);
    if (!txt) { closeSheet('aiSheet'); return; }
    let data = null;
    try {
      const m = txt.match(/\{[\s\S]*\}/);
      data = JSON.parse(m ? m[0] : txt);
    } catch (e) {}
    const payload = { date: today, data: data };
    localStorage.setItem(AI_DAILY_KEY, JSON.stringify(payload));
    renderDaily(payload);
  }
  function renderDaily(payload) {
    const d = payload.data || {};
    const a = d.article || {}, w = d.work || {};
    const kindIcon = { '电影': '🎬', '剧集': '📺', '动漫': '🎨', '游戏': '🎮', '音乐': '🎵', '专辑': '💿' };
    const icon = kindIcon[w.kind] || '🎬';
    $('#aiSheetBody').innerHTML =
      '<div class="ai-src">今日 · ' + esc(payload.date) + ' · 点卡片看详情</div>' +
      (a.title ? `<article class="ai-daily-card" data-ai-detail="article">
        <div class="ai-dc-head"><span class="ai-dc-tag ai-dc-tag-art">📖 ${esc(a.genre || '文章')}</span><span class="ai-dc-chev"><svg class="icon"><use href="#i-arrow-right"/></svg></span></div>
        <div class="ai-dc-title">${esc(a.title)}</div>
        <div class="ai-dc-sub">${[a.author, a.year, a.source].filter(Boolean).map(esc).join(' · ')}</div>
        <blockquote class="ai-quote">${esc(a.excerpt || '')}</blockquote>
      </article>` : '') +
      (w.title ? `<article class="ai-daily-card" data-ai-detail="work">
        <div class="ai-dc-head"><span class="ai-dc-tag ai-dc-tag-clip">${icon} ${esc(w.kind || '作品')}</span><span class="ai-dc-chev"><svg class="icon"><use href="#i-arrow-right"/></svg></span></div>
        <div class="ai-dc-title">${esc(w.title)}</div>
        ${w.year || w.genre || w.creator ? `<div class="ai-dc-sub">${[w.year, w.genre, w.creator].filter(Boolean).map(esc).join(' · ')}</div>` : ''}
        <div class="ai-dc-comment">${esc(w.comment || '')}</div>
      </article>` : '') +
      '<button class="ai-refresh" id="aiDailyRefresh">换一批<svg class="icon"><use href="#i-arrow-right"/></svg></button>';
    const rb = $('#aiDailyRefresh');
    if (rb) rb.addEventListener('click', () => { $('#aiSheetBody').innerHTML = '<div class="ai-loading">重新推荐中…</div>'; aiDaily(todayISO()); });
    // 卡片点击 → 展开详情
    $$('#aiSheetBody .ai-daily-card').forEach(card => {
      card.addEventListener('click', () => openAiDetail(card.dataset.aiDetail, d));
    });
  }
  function openAiDetail(which, d) {
    $('#aiSheetBody').innerHTML =
      '<button class="ai-back" id="aiDetailBack"><svg class="icon"><use href="#i-back"/></svg>返回</button>';
    if (which === 'article') {
      const a = d.article || {};
      $('#aiSheetBody').innerHTML +=
        '<div class="ai-detail">' +
        '<div class="ai-detail-kind">📖 ' + esc(a.genre || '文章') + '</div>' +
        '<h3 class="ai-detail-title">' + esc(a.title || '') + '</h3>' +
        ((a.author || a.year || a.source) ? '<div class="ai-detail-meta">' + [a.author, a.year, a.source].filter(Boolean).map(esc).join(' · ') + '</div>' : '') +
        (a.theme ? '<div class="ai-detail-sec"><div class="ai-detail-sec-label">主题</div><div class="ai-detail-sec-body">' + esc(a.theme) + '</div></div>' : '') +
        '<div class="ai-detail-sec"><div class="ai-detail-sec-label">精选片段</div><blockquote class="ai-quote ai-quote-lg">' + esc(a.excerpt || '') + '</blockquote></div>' +
        (a.why ? '<div class="ai-detail-sec"><div class="ai-detail-sec-label">为什么值得读</div><div class="ai-detail-sec-body">' + esc(a.why) + '</div></div>' : '') +
        (a.bg ? '<div class="ai-detail-sec"><div class="ai-detail-sec-label">背景 · 冷知识</div><div class="ai-detail-sec-body">' + esc(a.bg) + '</div></div>' : '') +
        '<p class="ai-detail-note">完整内容可前往出处阅读。</p>' +
        '</div>';
    } else if (which === 'work') {
      const w = d.work || {};
      const kindIcon = { '电影': '🎬', '剧集': '📺', '动漫': '🎨', '游戏': '🎮', '音乐': '🎵', '专辑': '💿' };
      const icon = kindIcon[w.kind] || '🎬';
      $('#aiSheetBody').innerHTML +=
        '<div class="ai-detail">' +
        '<div class="ai-detail-kind">' + icon + ' ' + esc(w.kind || '作品') + '</div>' +
        '<h3 class="ai-detail-title">' + esc(w.title || '') + '</h3>' +
        ((w.year || w.genre || w.creator) ? '<div class="ai-detail-meta">' + [w.year, w.genre, w.creator].filter(Boolean).map(esc).join(' · ') + '</div>' : '') +
        '<div class="ai-detail-sec"><div class="ai-detail-sec-label">一句话点评</div><div class="ai-detail-sec-body">' + esc(w.comment || '') + '</div></div>' +
        (w.review ? '<div class="ai-detail-sec"><div class="ai-detail-sec-label">影评 · 观感</div><div class="ai-detail-sec-body">' + esc(w.review) + '</div></div>' : '') +
        (w.bg ? '<div class="ai-detail-sec"><div class="ai-detail-sec-label">背景 · 冷知识</div><div class="ai-detail-sec-body">' + esc(w.bg) + '</div></div>' : '') +
        '</div>';
    }
    const bk = $('#aiDetailBack');
    if (bk) bk.addEventListener('click', () => { const today = todayISO(); const cached = (() => { try { const o = JSON.parse(localStorage.getItem(AI_DAILY_KEY) || 'null'); return o && o.date === today ? o : null; } catch (e) { return null; } })(); renderDaily(cached || { date: today, data: d }); });
  }

  if (aiTagBtn) aiTagBtn.addEventListener('click', aiSuggestTag);
  aiRenderModelList();

  // ── 多主题色系统 ─────────────────────────────────────
  const THEME_KEY = 'yuwei.theme.v1';
  const THEMES = [
    { id: 'cinema',   name: '午夜放映室', sw: ['#11151B', '#8298E8', '#1A2029'], dark: true },
    { id: 'mist',     name: '海雾青', sw: ['#F5F7FA', '#5E78C8', '#397C80'] },
    { id: 'ink',      name: '水墨灰', sw: ['#F4F2ED', '#6E7781', '#555B60'] },
    { id: 'lavender', name: '薰衣紫', sw: ['#F7F3FC', '#8B79C6', '#8373B8'] },
    { id: 'forest',   name: '森林绿', sw: ['#F2F4EA', '#78947B', '#527B65'] },
    { id: 'sunset',   name: '落日橘', sw: ['#FFF6ED', '#DB8868', '#D99A79'] },
    { id: 'midnight', name: '午夜蓝', sw: ['#11151D', '#8199E8', '#244F68'], dark: true }
  ];
  const DEFAULT_THEME_ID = 'cinema';
  // 旧版默认主题是「海雾青」。升级到 2.2.2 时做一次性迁移：
  // 没主动选过主题（仍是 mist）的用户直接进入新主题；之后手动切回任一套都尊重选择。
  const THEME_MIGRATED_KEY = 'yuwei.theme.migrated.v1';
  function currentTheme() {
    let t = '';
    try { t = String(localStorage.getItem(THEME_KEY) || ''); } catch (e) {}
    if (!THEMES.some(x => x.id === t)) return DEFAULT_THEME_ID;
    let migrated = '';
    try { migrated = String(localStorage.getItem(THEME_MIGRATED_KEY) || ''); } catch (e) {}
    if (!migrated) {
      try { localStorage.setItem(THEME_MIGRATED_KEY, '1'); } catch (e) {}
      if (t === 'mist') {
        try { localStorage.setItem(THEME_KEY, DEFAULT_THEME_ID); } catch (e) {}
        return DEFAULT_THEME_ID;
      }
    }
    return t;
  }
  // 应用整体是否为深色底（决定状态栏图标明暗、详情页是否走深色化）
  function appThemeIsDark() {
    const t = THEMES.find(x => x.id === currentTheme());
    return !!(t && t.dark);
  }
  function applyTheme(id) {
    document.documentElement.setAttribute('data-theme', id);
    const meta = document.querySelector('meta[name="theme-color"]');
    const dark = !!(THEMES.find(x => x.id === id) || {}).dark;
    if (meta) meta.setAttribute('content', dark ? '#11151B' : '#FFFFFF');
    // 状态栏图标明暗：深色主题用浅色图标
    try {
      const b = bridge();
      if (b && b.setStatusBarIcons) b.setStatusBarIcons(!dark);
    } catch (e) {}
  }
  function renderThemeGrid() {
    const grid = $('#themeGrid');
    if (!grid) return;
    const cur = currentTheme();
    grid.innerHTML = THEMES.map(t =>
      `<button class="theme-opt${t.id === cur ? ' active' : ''}" data-theme-id="${t.id}" aria-label="切换到${t.name}主题">
        <span class="theme-swatches">${t.sw.map(c => `<i style="background:${c}"></i>`).join('')}</span>
        <span class="theme-name">${t.name}</span>
      </button>`
    ).join('');
  }
  const themeGrid = $('#themeGrid');
  if (themeGrid) {
    themeGrid.addEventListener('click', e => {
      const btn = e.target.closest('[data-theme-id]');
      if (!btn) return;
      const id = btn.dataset.themeId;
      try { localStorage.setItem(THEME_KEY, id); } catch (e) {}
      applyTheme(id);
      renderThemeGrid();
      // 详情页开着时立即按新主题重绘（深色化与否取决于新主题）
      if ($('#detailPage') && $('#detailPage').classList.contains('open')) {
        applyDetailTheme(rawDetailTheme);
      }
    });
  }
  // 启动恢复 + 初始化渲染
  applyTheme(currentTheme());
  renderThemeGrid();

  // first render
  renderAll();
  const initialReading = readingWorks()[0];
  if (initialReading) ui.readingId = initialReading.id;
  switchTab('records');

})();
