/* YAJA ranked + progression: tiers, LP, MMR, seasons, rival bots, mastery, quests, essence. Persists to localStorage. */
(function (root) {
  'use strict';
  var E = root.YAJA && root.YAJA.Engine;
  if (!E && typeof require === 'function') E = require('./engine.js');

  // ---- Tiers ----------------------------------------------------------------
  var TIERS = [
    { id: 'iron',        name: 'Iron',        color: '#8a8f98', glow: '#c0c4cc' },
    { id: 'bronze',      name: 'Bronze',      color: '#b0714a', glow: '#e3a279' },
    { id: 'silver',      name: 'Silver',      color: '#a9b8c9', glow: '#e6f0ff' },
    { id: 'gold',        name: 'Gold',        color: '#d9a93e', glow: '#ffe08a' },
    { id: 'platinum',    name: 'Platinum',    color: '#3fbfae', glow: '#8ff5e6' },
    { id: 'emerald',     name: 'Emerald',     color: '#2fc36b', glow: '#8dffb9' },
    { id: 'diamond',     name: 'Diamond',     color: '#6c8dff', glow: '#c2d0ff' },
    { id: 'master',      name: 'Master',      color: '#b25cff', glow: '#e3b8ff' },
    { id: 'grandmaster', name: 'Grandmaster', color: '#ff4a5e', glow: '#ffb0b9' },
    { id: 'challenger',  name: 'Challenger',  color: '#f5d77a', glow: '#bff4ff' }
  ];
  var APEX = 7;               // tier index of Master
  var GM_LP = 200, CHALL_LP = 500;
  var BASE_MMR = 800;         // Iron IV
  var START_MMR = 1600;       // Silver IV
  var PLACEMENTS = 5;
  var PLACEMENT_CAP_TIER = 5; // Emerald IV
  var DIV_NAMES = ['', 'I', 'II', 'III', 'IV'];

  // rank = { tier, div (4..1, 0 for apex), lp }
  function rankMMR(r) {
    if (r.tier >= APEX) return BASE_MMR + 28 * 100 + r.lp;
    return BASE_MMR + (r.tier * 4 + (4 - r.div)) * 100 + r.lp;
  }
  function rankFromMMR(m) {
    var steps = Math.floor((m - BASE_MMR) / 100);
    if (steps < 0) return { tier: 0, div: 4, lp: 0 };
    if (steps >= 28) { var lp = Math.round(m - (BASE_MMR + 2800)); return { tier: apexTierFor(lp), div: 0, lp: lp }; }
    return { tier: Math.floor(steps / 4), div: 4 - (steps % 4), lp: Math.round((m - BASE_MMR) % 100) };
  }
  function apexTierFor(lp) { return lp >= CHALL_LP ? 9 : lp >= GM_LP ? 8 : 7; }
  function rankName(r, short) {
    if (!r) return 'Unranked';
    var t = TIERS[r.tier];
    if (r.tier >= APEX) return t.name;
    return (short ? t.name.slice(0, 1) : t.name + ' ') + DIV_NAMES[r.div];
  }
  function rankLabel(r) { return r ? rankName(r) + ' · ' + r.lp + ' LP' : 'Unranked'; }

  function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
  function expected(a, b) { return 1 / (1 + Math.pow(10, (b - a) / 400)); }

  // ---- Seasons: four-week splits computed from the calendar -------------------
  var SEASON_EPOCH = Date.UTC(2026, 0, 5); // a Monday
  var SPLIT_MS = 28 * 864e5;
  function seasonInfo(now) {
    now = now || Date.now();
    var n = Math.floor((now - SEASON_EPOCH) / SPLIT_MS) + 1;
    var ends = SEASON_EPOCH + n * SPLIT_MS;
    return { n: n, ends: ends, msLeft: ends - now };
  }
  function dayKey(now) { var d = new Date(now || Date.now()); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function dayNumber(now) { var d = new Date(now || Date.now()); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); }

  // ---- Seeded RNG -------------------------------------------------------------
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function hash(str) { var h = 2166136261; for (var i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  // ---- Rival bots (openly AI, each with a personality) -----------------------
  // style multipliers feed the evaluator: corner/mob/mat/rune/charge
  var BOTS = [
    { id: 'pebble',   name: 'Pebble',        tag: 'Tutorial Golem',   home: 900,  main: 'kael',  style: { mat: 1.6, corner: 0.5 }, quip: ['beep boop', 'is it my turn?', 'I like the shiny ones'] },
    { id: 'dusty',    name: 'Dusty',         tag: 'Rusty Automaton',  home: 1050, main: 'vex',   style: { mat: 1.4 }, quip: ['*creak*', 'oil me', 'kaboom?'] },
    { id: 'fliplord', name: 'FlipLord',      tag: 'Greedy Flipper',   home: 1250, main: 'mira',  style: { mat: 2.2, mob: 0.4 }, quip: ['MORE FLIPS', 'greed is good', 'count ’em'] },
    { id: 'goblin',   name: 'CornerGoblin',  tag: 'Corner Hoarder',   home: 1450, main: 'aegis', style: { corner: 2.2 }, quip: ['my corner.', 'mine mine mine', 'hehehe'] },
    { id: 'rune',     name: 'RuneHunter',    tag: 'Objective Chaser', home: 1650, main: 'nyx',   style: { rune: 3 }, quip: ['runes > stones', 'smell that? mana.', 'objective!'] },
    { id: 'sable',    name: 'Sable',         tag: 'Patient Hunter',   home: 1850, main: 'nyx',   style: { mob: 1.6 }, quip: ['patience.', 'you walked into that', 'hm.'] },
    { id: 'brick',    name: 'Brickwall',     tag: 'Turtle',           home: 2000, main: 'aegis', style: { corner: 1.6, mat: 0.7 }, quip: ['you shall not flip', 'solid.', 'zzz'] },
    { id: 'blitz',    name: 'Blitz',         tag: 'Ult Spammer',      home: 2150, main: 'kael',  style: { charge: 0.2 }, quip: ['ULT READY', 'press R to win', 'LETS GOOO'] },
    { id: 'hoard',    name: 'Hoarder',       tag: 'Charge Miser',     home: 2300, main: 'vex',   style: { charge: 2.2 }, quip: ['saving it…', 'not yet', 'soon™'] },
    { id: 'prism',    name: 'Prism',         tag: 'Balanced Mind',    home: 2450, main: 'mira',  style: {}, quip: ['elegant.', 'as calculated', 'gg wp'] },
    { id: 'wraith',   name: 'Wraith',        tag: 'Mobility Ghost',   home: 2600, main: 'nyx',   style: { mob: 2 }, quip: ['boo', 'you have no moves', 'haunting'] },
    { id: 'ember',    name: 'Ember',         tag: 'Scorched Earth',   home: 2750, main: 'vex',   style: { mat: 1.2, charge: 0.6 }, quip: ['burn it', 'ashes', 'crater time'] },
    { id: 'halcyon',  name: 'Halcyon',       tag: 'Calm Tactician',   home: 2900, main: 'aegis', style: { corner: 1.3, mob: 1.3 }, quip: ['breathe', 'steady', 'well played'] },
    { id: 'rift',     name: 'Riftborn',      tag: 'Time Bender',      home: 3050, main: 'mira',  style: { mob: 1.2 }, quip: ['that never happened', 'again.', 'rewind!'] },
    { id: 'warden',   name: 'Old Warden',    tag: 'Veteran',          home: 3200, main: 'kael',  style: { corner: 1.4 }, quip: ['I’ve seen this before', 'young one…', 'hmph'] },
    { id: 'vanta',    name: 'Vanta',         tag: 'Void Strategist',  home: 3350, main: 'nyx',   style: { mob: 1.5, rune: 1.5 }, quip: ['…', 'inevitable', 'void'] },
    { id: 'aurora',   name: 'Aurora',        tag: 'Diamond Duelist',  home: 3500, main: 'mira',  style: {}, quip: ['shine', 'nice try', 'gg'] },
    { id: 'kingpin',  name: 'Kingpin',       tag: 'Master Tactician', home: 3700, main: 'kael',  style: { corner: 1.2 }, quip: ['check.', 'you’re good', 'kneel'] },
    { id: 'zenith',   name: 'Zenith',        tag: 'Grandmaster',      home: 3950, main: 'aegis', style: { corner: 1.2, mob: 1.2 }, quip: ['peak.', 'impressive', 'again?'] },
    { id: 'apex',     name: 'APEX-0',        tag: 'The Final Boss',   home: 4200, main: 'vex',   style: {}, quip: ['CALCULATING', 'ERROR: you', 'GG. INEVITABLE.'] }
  ];
  BOTS.forEach(function (b) {
    var st = Object.assign({ corner: 1, mob: 1, mat: 1, rune: 1, charge: 1 }, b.style);
    b.style = st;
    b.color = ['#ff5d73', '#4dd6ff', '#b77dff', '#ffb547', '#5dffb0', '#f5d77a'][hash(b.id) % 6];
  });

  // ---- Mastery ---------------------------------------------------------------
  var MASTERY = [0, 150, 400, 800, 1400, 2200, 3200]; // points to reach level 1..7
  function masteryLevel(pts) { var l = 1; for (var i = 0; i < MASTERY.length; i++) if (pts >= MASTERY[i]) l = i + 1; return l; }
  function masteryProgress(pts) {
    var l = masteryLevel(pts);
    if (l >= 7) return { level: 7, pct: 1, next: null };
    var a = MASTERY[l - 1], b = MASTERY[l];
    return { level: l, pct: (pts - a) / (b - a), next: b - pts };
  }

  // ---- Quests ----------------------------------------------------------------
  var QUESTS = [
    { id: 'win2',    text: 'Win 2 Ranked games',               goal: 2, reward: 60, test: function (m) { return m.ranked && m.won ? 1 : 0; } },
    { id: 'play3',   text: 'Play 3 games (any mode)',          goal: 3, reward: 40, test: function () { return 1; } },
    { id: 'flip6',   text: 'Flip 6+ stones in a single move',  goal: 1, reward: 50, test: function (m) { return m.bestMove >= 6 ? 1 : 0; } },
    { id: 'triple',  text: 'Land a TRIPLE (3 lines at once)',  goal: 1, reward: 60, test: function (m) { return m.maxLines >= 3 ? 1 : 0; } },
    { id: 'runes3',  text: 'Hold all 3 Runes at the final bell', goal: 1, reward: 70, test: function (m) { return m.runesEnd >= 3 ? 1 : 0; } },
    { id: 'ult3',    text: 'Cast 3 Ultimates',                 goal: 3, reward: 50, test: function (m) { return m.ults; } },
    { id: 'margin',  text: 'Win by 10 or more points',         goal: 1, reward: 60, test: function (m) { return m.won && m.margin >= 10 ? 1 : 0; } },
    { id: 'corner4', text: 'Own 4 corners at the end of a game', goal: 1, reward: 60, test: function (m) { return m.cornersEnd >= 4 ? 1 : 0; } },
    { id: 'champ',   text: 'Win a game as {champ}',            goal: 1, reward: 70, champ: true, test: function (m, q) { return m.won && m.champ === q.champ ? 1 : 0; } },
    { id: 'flip40',  text: 'Flip 40 stones total',             goal: 40, reward: 50, test: function (m) { return m.flipped; } }
  ];

  // ---- Cosmetics ---------------------------------------------------------------
  var SHOP = [
    { id: 'skin-gem',     kind: 'skin',  name: 'Hextech Gems',   price: 0 },
    { id: 'skin-neon',    kind: 'skin',  name: 'Neon Rings',     price: 250 },
    { id: 'skin-glass',   kind: 'skin',  name: 'Obsidian Glass', price: 400 },
    { id: 'skin-gold',    kind: 'skin',  name: 'Gilded',         price: 700 },
    { id: 'skin-plasma',  kind: 'skin',  name: 'Plasma Core',    price: 1000 },
    { id: 'board-hex',    kind: 'board', name: 'Hextech Arena',  price: 0 },
    { id: 'board-void',   kind: 'board', name: 'Void Rift',      price: 300 },
    { id: 'board-solar',  kind: 'board', name: 'Solar Forge',    price: 500 },
    { id: 'board-abyss',  kind: 'board', name: 'Abyssal Tide',   price: 800 },
    { id: 'title-rookie', kind: 'title', name: 'Rookie',         price: 0 },
    { id: 'title-flip',   kind: 'title', name: 'Flip Artist',    price: 150 },
    { id: 'title-tact',   kind: 'title', name: 'Tactician',      price: 300 },
    { id: 'title-menace', kind: 'title', name: 'Board Menace',   price: 450 },
    { id: 'title-hex',    kind: 'title', name: 'Hexlord',        price: 900 },
    { id: 'title-rune',   kind: 'title', name: 'Rune Warden',    price: 1200 },
    { id: 'title-hexa',   kind: 'title', name: 'Hexaflip Legend', price: 2000 },
    { id: 'title-unflip', kind: 'title', name: 'The Unflippable', price: 3500 }
  ];

  // ---- Profile persistence -----------------------------------------------------
  var KEY = 'yaja.profile.v1';
  var memStore = null; // fallback when storage is blocked
  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { raw = memStore; }
    var p = null;
    try { p = raw ? JSON.parse(raw) : null; } catch (e) { p = null; }
    return migrate(p || freshProfile());
  }
  function save(p) {
    var raw = JSON.stringify(p);
    try { localStorage.setItem(KEY, raw); } catch (e) { memStore = raw; }
  }
  function randomName() {
    var a = ['Hex', 'Rift', 'Nova', 'Onyx', 'Echo', 'Flux', 'Zen', 'Vanta', 'Lumen', 'Kite', 'Ashen', 'Byte'];
    var b = ['Walker', 'Fang', 'Sage', 'Rider', 'Spark', 'Shade', 'Warden', 'Fox', 'Monk', 'Knight', 'Storm', 'Drake'];
    return a[Math.floor(Math.random() * a.length)] + b[Math.floor(Math.random() * b.length)] + Math.floor(Math.random() * 90 + 10);
  }
  function freshProfile() {
    return {
      v: 1, name: randomName(), avatar: Math.floor(Math.random() * 6), created: Date.now(),
      mmr: START_MMR, rank: null, placementsLeft: PLACEMENTS, placementsTotal: PLACEMENTS, placementWins: 0,
      games: 0, wins: 0, losses: 0, draws: 0, streak: 0, bestStreak: 0,
      ascension: false, promoShield: 0,
      season: seasonInfo().n, peak: null, pastSeasons: [],
      history: [], mastery: {}, essence: 100,
      owned: ['skin-gem', 'board-hex', 'title-rookie'], equipped: { skin: 'skin-gem', board: 'board-hex', title: 'title-rookie' },
      quests: null, rerollDay: null, firstWinDay: null,
      botRatings: {}, h2h: {},
      duel: { rating: 1200, games: 0, wins: 0 },
      puzzle: { day: null, done: false, tries: [], streak: 0, lastSolvedDay: null, best: 0 },
      settings: { sound: true, fast: false }, tutorialSeen: false, tutorialDone: false,
      activeMatch: null, notices: []
    };
  }
  function migrate(p) {
    var f = freshProfile();
    for (var k in f) if (p[k] === undefined) p[k] = f[k];
    // New split → rewards for your peak, then a gentle soft reset.
    var s = seasonInfo().n;
    if (p.season !== s) {
      if (p.rank || p.peak) {
        var reward = p.peak ? 100 + p.peak.tier * 75 : 0;
        p.pastSeasons.push({ season: p.season, peak: p.peak, final: p.rank });
        if (reward) { p.essence += reward; p.notices.push('Split ' + p.season + ' ended. Peak ' + rankName(p.peak) + ' earned you <b>+' + reward + ' Essence</b> and a ' + TIERS[p.peak.tier].name + ' border.'); }
      }
      p.season = s;
      p.mmr = Math.round(p.mmr * 0.75 + START_MMR * 0.25);
      p.rank = null; p.placementsLeft = 3; p.placementsTotal = 3; p.placementWins = 0; p.peak = null; p.ascension = false;
    }
    if (!p.placementsTotal) p.placementsTotal = PLACEMENTS;
    ensureQuests(p);
    return p;
  }

  function ensureQuests(p, force) {
    var today = dayKey();
    if (!force && p.quests && p.quests.day === today) return;
    var r = rng(hash(today + p.name));
    var pool = QUESTS.slice(), chosen = [];
    while (chosen.length < 3) {
      var q = pool.splice(Math.floor(r() * pool.length), 1)[0];
      var inst = { id: q.id, progress: 0, goal: q.goal, reward: q.reward, done: false, claimed: false };
      if (q.champ) inst.champ = E.CHAMP_IDS[Math.floor(r() * E.CHAMP_IDS.length)];
      chosen.push(inst);
    }
    p.quests = { day: today, list: chosen };
  }
  function questText(q) {
    var def = QUESTS.filter(function (d) { return d.id === q.id; })[0];
    return def ? def.text.replace('{champ}', q.champ ? E.CHAMPIONS[q.champ].name : '') : q.id;
  }
  function rerollQuest(p, i) {
    var today = dayKey();
    if (p.rerollDay === today) return false;
    var ids = p.quests.list.map(function (q) { return q.id; });
    var pool = QUESTS.filter(function (d) { return ids.indexOf(d.id) === -1; });
    var d = pool[Math.floor(Math.random() * pool.length)];
    var inst = { id: d.id, progress: 0, goal: d.goal, reward: d.reward, done: false, claimed: false };
    if (d.champ) inst.champ = E.CHAMP_IDS[Math.floor(Math.random() * E.CHAMP_IDS.length)];
    p.quests.list[i] = inst;
    p.rerollDay = today;
    return true;
  }

  // ---- Matchmaking vs rival bots --------------------------------------------------
  function botRating(p, bot) {
    var r = p.botRatings[bot.id];
    return r == null ? bot.home : r;
  }
  function isNemesis(p, botId) { var h = p.h2h[botId]; return !!h && h.l - h.w >= 3; }
  function pickOpponent(p) {
    var target = p.mmr;
    if (p.rank === null && p.placementsLeft === PLACEMENTS && p.games === 0) target -= 250; // gentle first placement
    var ranked = BOTS.map(function (b) { return { bot: b, rating: botRating(p, b) }; })
      .sort(function (a, b) { return Math.abs(a.rating - target) - Math.abs(b.rating - target); });
    var choice;
    if (p.ascension) {
      // The tier gate is guarded by the nearest rival rated at or above you.
      choice = ranked.filter(function (x) { return x.rating >= target - 50; })[0] || ranked[0];
      var gr = Math.round(Math.max(choice.rating, target) * 0.5 + target * 0.5 + 40);
      return { bot: choice.bot, rating: gr, displayRank: rankFromMMR(choice.rating), gatekeeper: true, nemesis: isNemesis(p, choice.bot.id) };
    }
    // Choose among the 3 nearest so you meet a small cast of recurring rivals.
    var pickFrom = ranked.slice(0, 3), w = [0.5, 0.3, 0.2];
    var roll = Math.random(), acc = 0;
    choice = pickFrom[0];
    for (var i = 0; i < pickFrom.length; i++) { acc += w[i]; if (roll <= acc) { choice = pickFrom[i]; break; } }
    // The bot plays near your level (never adapts to your streak).
    var playRating = Math.round(choice.rating * 0.5 + target * 0.5 + (Math.random() - 0.5) * 80);
    return { bot: choice.bot, rating: playRating, displayRank: rankFromMMR(choice.rating), nemesis: isNemesis(p, choice.bot.id) };
  }

  // What's the next thing to chase? Used by the lobby and the results screen.
  function nextGoal(p) {
    if (!p.rank) return { text: p.placementsLeft + ' placement game' + (p.placementsLeft === 1 ? '' : 's') + ' until your rank is revealed', wins: p.placementsLeft };
    var r = p.rank;
    if (p.ascension) return { text: 'Win your Ascension match to reach ' + TIERS[r.tier + 1].name + (r.tier + 1 >= APEX ? '' : ' IV'), wins: 1 };
    var gain = Math.round(clamp(20 + (p.mmr - rankMMR(r)) / 25, 12, 30));
    if (r.tier >= APEX) {
      var nxt = r.tier === 7 ? GM_LP : r.tier === 8 ? CHALL_LP : null;
      if (!nxt) return { text: 'Defend the Challenger throne', wins: 0 };
      var w2 = Math.max(1, Math.ceil((nxt - r.lp) / gain));
      return { text: '\u2248' + w2 + ' win' + (w2 > 1 ? 's' : '') + ' to ' + TIERS[r.tier + 1].name, wins: w2 };
    }
    var w = Math.max(1, Math.ceil((100 - r.lp) / gain));
    var dest = r.div > 1 ? TIERS[r.tier].name + ' ' + DIV_NAMES[r.div - 1] : 'your ' + TIERS[r.tier + 1].name + ' Ascension match';
    return { text: '\u2248' + w + ' win' + (w > 1 ? 's' : '') + ' to ' + dest, wins: w };
  }

  // ---- The heart: apply a ranked result ---------------------------------------------
  // result: 1 win, 0 loss, 0.5 draw. Returns a detailed breakdown for the results screen.
  function applyRanked(p, result, oppRating, match) {
    var before = p.rank ? Object.assign({}, p.rank) : null;
    var out = { before: before, result: result, events: [], lpDelta: 0, mmrBefore: p.mmr };

    // MMR (hidden Elo)
    var K = !p.rank ? 100 : p.games < 15 ? 60 : p.games < 40 ? 40 : 28;
    var dM = K * (result - expected(p.mmr, oppRating));
    p.mmr = Math.round(p.mmr + dM);
    out.mmrDelta = Math.round(dM);

    // Streaks
    if (result === 1) p.streak = p.streak >= 0 ? p.streak + 1 : 1;
    else if (result === 0) p.streak = p.streak <= 0 ? p.streak - 1 : -1;
    p.bestStreak = Math.max(p.bestStreak, p.streak);

    if (!p.rank) {
      // Placements
      p.placementsLeft--;
      if (result === 1) p.placementWins++;
      if (p.placementsLeft <= 0) {
        var placed = rankFromMMR(p.mmr - 50);
        var cap = BASE_MMR + PLACEMENT_CAP_TIER * 400;
        if (rankMMR(placed) > cap) placed = rankFromMMR(cap);
        p.rank = placed;
        p.promoShield = 3;
        out.events.push({ type: 'placed', rank: Object.assign({}, placed) });
      } else {
        out.events.push({ type: 'placement', left: p.placementsLeft });
      }
      out.after = p.rank ? Object.assign({}, p.rank) : null;
      trackPeak(p);
      return out;
    }

    var r = p.rank;
    var gap = (p.mmr - rankMMR(r)) / 25;
    var gain = Math.round(clamp(20 + gap, 12, 30));
    var loss = Math.round(clamp(20 - gap, 10, 28));
    if (result === 1 && p.streak >= 3) { gain += 2; out.hotStreak = true; }
    if (result === 1 && match && match.nemesis) { gain += 5; out.revenge = true; }
    out.gain = gain; out.loss = loss;

    if (result === 1) {
      if (p.ascension) {
        // Ascension match won → next tier
        p.ascension = false;
        r.tier++; r.div = r.tier >= APEX ? 0 : 4; r.lp = r.tier >= APEX ? 0 : Math.round(gain / 2);
        p.promoShield = 3;
        out.lpDelta = gain;
        out.events.push({ type: 'tierUp', rank: Object.assign({}, r) });
      } else {
        r.lp += gain; out.lpDelta = gain;
        if (r.tier < APEX && r.lp >= 100) {
          if (r.div > 1) {
            r.div--; r.lp -= 100;
            out.events.push({ type: 'divUp', rank: Object.assign({}, r) });
          } else {
            r.lp = 100; p.ascension = true;
            out.events.push({ type: 'ascension', rank: Object.assign({}, r) });
          }
        } else if (r.tier >= APEX) {
          var nt = apexTierFor(r.lp);
          if (nt > r.tier) out.events.push({ type: 'tierUp', rank: { tier: nt, div: 0, lp: r.lp } });
          r.tier = nt;
        }
      }
    } else if (result === 0) {
      if (p.ascension) { p.ascension = false; out.events.push({ type: 'ascensionFailed' }); }
      var prevLP = r.lp;
      r.lp -= loss; out.lpDelta = -loss;
      if (r.tier >= APEX) {
        var at = apexTierFor(Math.max(0, r.lp));
        if (r.lp < 0) {
          if (prevLP > 0 || p.promoShield > 0) { r.lp = 0; out.lpDelta = -prevLP; out.events.push({ type: 'shield' }); }
          else { r.tier = APEX - 1; r.div = 1; r.lp = 75; out.events.push({ type: 'demoted', rank: Object.assign({}, r) }); }
        } else if (at < r.tier) { r.tier = at; out.events.push({ type: 'demoted', rank: Object.assign({}, r) }); }
      } else if (r.lp < 0) {
        var floor = r.tier === 0 && r.div === 4;
        if (floor || prevLP > 0 || p.promoShield > 0) {
          r.lp = 0; out.lpDelta = -prevLP;
          if (!floor) out.events.push({ type: 'shield', left: p.promoShield });
        } else if (r.div < 4) {
          r.div++; r.lp = 75; out.events.push({ type: 'demoted', rank: Object.assign({}, r) });
        } else {
          r.tier--; r.div = 1; r.lp = 75; out.events.push({ type: 'demoted', rank: Object.assign({}, r) });
        }
      }
    } else {
      out.lpDelta = 0;
    }
    if (p.promoShield > 0) p.promoShield--;
    out.after = Object.assign({}, r);
    trackPeak(p);
    return out;
  }
  function trackPeak(p) {
    if (p.rank && (!p.peak || rankMMR(p.rank) > rankMMR(p.peak))) p.peak = Object.assign({}, p.rank);
  }

  // Everything that happens after any game: history, mastery, quests, essence, rivals.
  function recordMatch(p, m) {
    // m: { mode, ranked, won, draw, champ, oppChamp, oppName, oppId, oppRating, score:[me,opp], bestMove, maxLines, runesEnd, ults, cornersEnd, margin, flipped, accuracy }
    var res = m.won ? 1 : m.draw ? 0.5 : 0, out = { rewards: [], essence: 0 };
    p.games++;
    if (m.won) p.wins++; else if (m.draw) p.draws++; else p.losses++;

    if (m.ranked) out.ranked = applyRanked(p, res, m.oppRating, m);
    if (m.mode === 'duel') {
      var dd = Math.round(32 * (res - expected(p.duel.rating, m.oppRating || 1200)));
      p.duel.rating += dd; p.duel.games++; if (m.won) p.duel.wins++;
      out.duelDelta = dd;
    }
    // Rival bot ladder moves too (they're on the same ladder as you).
    if (m.oppId && p.botRatings) {
      var bot = BOTS.filter(function (b) { return b.id === m.oppId; })[0];
      if (bot) {
        var br = botRating(p, bot);
        p.botRatings[bot.id] = Math.round(br + 16 * ((1 - res) - expected(br, p.mmr)));
        var h = p.h2h[bot.id] = p.h2h[bot.id] || { w: 0, l: 0, d: 0 };
        if (m.won) h.w++; else if (m.draw) h.d++; else h.l++;
        out.h2h = Object.assign({}, h);
      }
    }
    // Mastery
    var before = p.mastery[m.champ] || 0;
    var mp = m.won ? 100 : m.draw ? 60 : 40;
    if (m.mode === 'practice') mp = Math.round(mp / 2);
    p.mastery[m.champ] = before + mp;
    out.mastery = { champ: m.champ, gained: mp, before: before, after: before + mp, levelUp: masteryLevel(before + mp) > masteryLevel(before) };

    // Essence
    var ess = m.won ? 30 : 12;
    out.rewards.push({ label: m.won ? 'Victory' : 'Match played', amount: ess });
    var today = dayKey();
    if (m.won && p.firstWinDay !== today && m.mode !== 'practice') {
      p.firstWinDay = today; ess += 100;
      out.rewards.push({ label: 'First Win of the Day', amount: 100 });
    }
    // Quests
    ensureQuests(p);
    out.quests = [];
    p.quests.list.forEach(function (q) {
      if (q.done) return;
      var def = QUESTS.filter(function (d) { return d.id === q.id; })[0];
      if (!def) return;
      var inc = def.test(m, q) || 0;
      if (inc > 0) {
        q.progress = Math.min(q.goal, q.progress + inc);
        if (q.progress >= q.goal) { q.done = true; q.claimed = true; ess += q.reward; out.rewards.push({ label: 'Quest: ' + questText(q), amount: q.reward }); }
        out.quests.push({ text: questText(q), progress: q.progress, goal: q.goal, done: q.done });
      }
    });
    p.essence += ess; out.essence = ess;

    p.history.unshift({
      t: Date.now(), mode: m.mode, won: m.won, draw: m.draw, champ: m.champ, oppChamp: m.oppChamp, opp: m.oppName,
      score: m.score, lp: out.ranked ? out.ranked.lpDelta : null, rank: p.rank ? Object.assign({}, p.rank) : null,
      accuracy: m.accuracy == null ? null : m.accuracy, placement: !!(out.ranked && !out.ranked.before)
    });
    if (out.ranked && !out.ranked.before) p.history[0].lp = null;
    p.activeMatch = null;
    if (p.history.length > 40) p.history.length = 40;
    save(p);
    return out;
  }

  // Ladder view: your rival bots + you, sorted like a regional ladder.
  function ladder(p) {
    var rows = BOTS.map(function (b) {
      var r = botRating(p, b);
      return { name: b.name, tag: b.tag, bot: b, rating: r, rank: rankFromMMR(r) };
    });
    rows.push({ name: p.name, you: true, rating: p.rank ? rankMMR(p.rank) : p.mmr, rank: p.rank });
    rows.sort(function (a, b) { return b.rating - a.rating; });
    return rows;
  }

  var Rank = {
    TIERS: TIERS, APEX: APEX, BOTS: BOTS, QUESTS: QUESTS, SHOP: SHOP, PLACEMENTS: PLACEMENTS, MASTERY: MASTERY,
    rankMMR: rankMMR, rankFromMMR: rankFromMMR, rankName: rankName, rankLabel: rankLabel, seasonInfo: seasonInfo,
    dayKey: dayKey, dayNumber: dayNumber, rng: rng, hash: hash,
    load: load, save: save, freshProfile: freshProfile, ensureQuests: ensureQuests, questText: questText, rerollQuest: rerollQuest,
    pickOpponent: pickOpponent, applyRanked: applyRanked, recordMatch: recordMatch, ladder: ladder,
    masteryLevel: masteryLevel, nextGoal: nextGoal, isNemesis: isNemesis, masteryProgress: masteryProgress, botRating: botRating, expected: expected
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Rank;
  root.YAJA = root.YAJA || {};
  root.YAJA.Rank = Rank;
})(typeof window !== 'undefined' ? window : globalThis);
