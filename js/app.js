/* YAJA app — screens, lobby, queue, champion select, results, ceremonies, profile, ladder, collection, review, puzzle, online. */
(function (root) {
  'use strict';
  var Y = root.YAJA, E = Y.Engine, AI = Y.AI, R = Y.Rank, Art = Y.Art, Net = Y.Net;
  var sfx = function (n, a) { Y.Audio.sfx(n, a); };
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  var P = R.load();          // the player's profile
  var app = { mode: 'ranked', practiceLevel: 1, screen: 'home', match: null, online: null, nextOpp: null };
  var PRACTICE = [
    { name: 'Easy', rating: 950 }, { name: 'Normal', rating: 1900 }, { name: 'Hard', rating: 2900 }, { name: 'Brutal', rating: 4200 }
  ];

  // ---------------------------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------------------------
  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'toast'; t.innerHTML = msg;
    $('toasts').appendChild(t);
    setTimeout(function () { t.remove(); }, 3700);
  }
  function overlay(id, html) {
    var o = $(id);
    if (html == null) { o.classList.remove('show'); o.innerHTML = ''; return o; }
    o.innerHTML = html; o.classList.add('show');
    return o;
  }
  function confirmBox(title, body, okLabel, onOk, cancelLabel) {
    var o = overlay('modal', '<div class="dialog"><h2>' + title + '</h2><p class="muted">' + body + '</p><div class="actions">' +
      '<button class="btn ghost" data-x="no">' + (cancelLabel || 'Cancel') + '</button><button class="btn gold" data-x="ok">' + okLabel + '</button></div></div>');
    o.onclick = function (e) {
      var b = e.target.closest('[data-x]'); if (!b) return;
      overlay('modal', null);
      if (b.getAttribute('data-x') === 'ok') onOk();
    };
  }
  // Best peak from past splits earns a tier-coloured ring around your icon.
  function myAvatar(size) {
    var best = null;
    (P.pastSeasons || []).forEach(function (x) { if (x.peak && (!best || R.rankMMR(x.peak) > R.rankMMR(best))) best = x.peak; });
    var av = Art.avatar(P.avatar, size || 40);
    if (!best) return av;
    var c = R.TIERS[best.tier].glow;
    return '<span class="peak-ring" title="Past peak: ' + R.rankName(best) + '" style="--pc:' + c + '">' + av + '</span>';
  }
  function myTitle() { var t = R.SHOP.filter(function (x) { return x.id === P.equipped.title; })[0]; return t ? t.name : ''; }
  function tierColor(rank) { return rank ? R.TIERS[rank.tier].color : '#6c8dff'; }
  function tierGlow(rank) { return rank ? R.TIERS[rank.tier].glow : '#bff4ff'; }
  function fmtAgo(t) {
    var s = (Date.now() - t) / 1000;
    if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago'; return Math.floor(s / 86400) + 'd ago';
  }
  function fmtDur(ms) {
    var d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4);
    return d > 0 ? d + 'd ' + h + 'h' : h + 'h ' + m + 'm';
  }
  function rankLine(rank) {
    if (!rank) return P.placementsLeft < P.placementsTotal ? 'Placements ' + (P.placementsTotal - P.placementsLeft) + '/' + P.placementsTotal : 'Unranked';
    return R.rankLabel(rank);
  }

  // ---------------------------------------------------------------------------------------------
  // Navigation
  // ---------------------------------------------------------------------------------------------
  var RENDER = {};
  function go(name) {
    if (app.match && name !== 'game' && !app.match.ended) return;
    app.screen = name;
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.toggle('active', s.id === 'screen-' + name); });
    document.querySelectorAll('#nav button').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-go') === name); });
    var inGame = name === 'game' || name === 'select' || name === 'vs';
    $('topbar').style.display = inGame ? 'none' : '';
    if (!inGame) renderTopbar();
    if (RENDER[name]) RENDER[name]();
  }
  document.addEventListener('click', function (e) {
    var g = e.target.closest('[data-go]');
    if (g) { sfx('click'); go(g.getAttribute('data-go')); }
  });

  function renderTopbar() {
    $('essence').textContent = P.essence;
    $('meChip').innerHTML = myAvatar(32) + '<span><span class="nm">' + esc(P.name) + '</span><span class="rk">' + esc(rankLine(P.rank)) + '</span></span>';
    var muted = Y.Audio.isMuted();
    $('soundBtn').innerHTML = muted
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="m23 9-6 6M17 9l6 6"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 5 6 9H2v6h4l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/></svg>';
  }
  $('soundBtn').addEventListener('click', function () { Y.Audio.setMuted(!Y.Audio.isMuted()); Y.Audio.unlock(); renderTopbar(); sfx('click'); });
  document.addEventListener('pointerdown', function unlock() { Y.Audio.unlock(); document.removeEventListener('pointerdown', unlock); });

  // ---------------------------------------------------------------------------------------------
  // HOME
  // ---------------------------------------------------------------------------------------------
  RENDER.home = function () {
    P = R.load();
    renderTopbar();
    renderRankCard();
    renderModes();
    renderHistory();
    renderQuests();
    renderPuzzleCard();
  };

  function renderRankCard() {
    var r = P.rank, season = R.seasonInfo();
    var el = $('rankCard');
    el.style.setProperty('--tier-color', tierColor(r));
    el.style.setProperty('--tier-glow', tierGlow(r));
    var name = r ? R.rankName(r) : 'Unranked';
    var badges = '';
    if (!r) badges += '<span class="badge place">Placements ' + (P.placementsTotal - P.placementsLeft) + ' / ' + P.placementsTotal + '</span>';
    if (P.ascension) badges += '<span class="badge asc">Ascension match next</span>';
    if (P.streak >= 3) badges += '<span class="badge fire">🔥 ' + P.streak + ' win streak</span>';
    if (P.promoShield > 0 && r) badges += '<span class="badge shield">Demotion shield · ' + P.promoShield + '</span>';
    var lpPct = r ? (r.tier >= R.APEX ? Math.min(100, r.lp / 10) : r.lp) : (P.placementsTotal - P.placementsLeft) / P.placementsTotal * 100;
    el.innerHTML =
      '<div class="kicker">Split ' + season.n + ' · Ranked</div>' +
      '<div class="emblem-wrap">' + Art.emblem(r, 150) + '</div>' +
      '<div class="rc-text"><div class="tier-name" style="color:' + tierGlow(r) + '">' + esc(name) + '</div>' +
      '<div class="lp-line">' + (r ? r.lp + ' LP' : 'Play ' + P.placementsLeft + ' more to get ranked') + '</div>' +
      '<div class="lp-bar"><div class="fill" style="width:' + lpPct + '%"></div></div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center;margin-top:6px">' + badges + '</div></div>' +
      '<div class="goal-line"><span class="goal-ic">➤</span>' + esc(R.nextGoal(P).text) + '</div>' +
      '<div class="rank-stats"><div><b>' + P.wins + '</b><span>Wins</span></div><div><b>' + P.losses + '</b><span>Losses</span></div><div><b>' + (P.games ? Math.round(100 * P.wins / P.games) : 0) + '%</b><span>Win rate</span></div></div>' +
      rivalsHtml() +
      '<div class="season-line">Split ends in <b>' + fmtDur(season.msLeft) + '</b>' + (P.peak ? ' · Peak <b>' + esc(R.rankName(P.peak)) + '</b>' : '') + '</div>';
  }

  function rivalsHtml() {
    var rows = R.BOTS.map(function (b) { return { b: b, r: R.botRating(P, b) }; })
      .sort(function (a, b) { return Math.abs(a.r - P.mmr) - Math.abs(b.r - P.mmr); }).slice(0, 4)
      .sort(function (a, b) { return b.r - a.r; });
    return '<div class="rivals"><div class="section-label">Your rivals</div>' + rows.map(function (x) {
      var h = P.h2h[x.b.id], nem = R.isNemesis(P, x.b.id);
      return '<div class="rival-row">' + Art.botAvatar(x.b, 26) + '<span class="rn">' + esc(x.b.name) + (nem ? ' <span class="nem">NEMESIS</span>' : '') + '</span>' +
        '<span class="muted">' + (h ? h.w + '–' + h.l : 'new') + '</span></div>';
    }).join('') + '</div>';
  }

  function renderModes() {
    document.querySelectorAll('.mode-card').forEach(function (c) { c.classList.toggle('active', c.getAttribute('data-mode') === app.mode); });
    var d = $('modeDetail'), btn = $('playBtn');
    btn.classList.toggle('asc', app.mode === 'ranked' && P.ascension);
    if (app.mode === 'ranked') {
      if (!app.nextOpp) app.nextOpp = R.pickOpponent(P);
      var o = app.nextOpp, h = P.h2h[o.bot.id];
      d.innerHTML = '<div class="section-label">Likely opponent</div><div class="next-opp">' + Art.botAvatar(o.bot, 44) +
        '<div class="who"><b>' + esc(o.bot.name) + ' <span class="muted" style="font-weight:400">· ' + esc(o.bot.tag) + '</span></b>' +
        '<span>' + R.rankName(o.displayRank) + ' · mains ' + E.CHAMPIONS[o.bot.main].name + (h ? ' · your record ' + h.w + '–' + h.l : ' · first meeting') + '</span></div>' +
        '<span style="margin-left:auto;text-align:right" class="muted" title="Ranked opponents are AI rivals, openly.">' + (o.gatekeeper ? '<span class="nem gate">GATEKEEPER</span><br>' : o.nemesis ? '<span class="nem">NEMESIS · +5 LP revenge</span><br>' : '') + 'AI rival</span></div>';
      $('playSub').textContent = P.ascension ? 'Win to ascend' : P.rank ? rankLine(P.rank) : 'Placement match';
      btn.querySelector('.play-label').textContent = P.ascension ? 'Ascend' : 'Find match';
    } else if (app.mode === 'practice') {
      d.innerHTML = '<div class="section-label">Opponent difficulty</div><div class="row"><div class="seg" id="diffSeg">' +
        PRACTICE.map(function (x, i) { return '<button data-i="' + i + '" class="' + (i === app.practiceLevel ? 'on' : '') + '">' + x.name + '</button>'; }).join('') +
        '</div><span class="muted">Half mastery, no LP.</span></div>';
      $('diffSeg').onclick = function (e) { var b = e.target.closest('button'); if (!b) return; app.practiceLevel = +b.getAttribute('data-i'); sfx('click'); renderModes(); };
      $('playSub').textContent = PRACTICE[app.practiceLevel].name + ' bot';
      btn.querySelector('.play-label').textContent = 'Start practice';
    } else {
      var avail = Net.available();
      d.innerHTML = '<div class="section-label">Duel rating ' + P.duel.rating + ' · ' + P.duel.wins + ' W / ' + (P.duel.games - P.duel.wins) + ' L</div>' +
        '<div class="row"><button class="btn azure" id="qmBtn"' + (avail ? '' : ' disabled') + '>Quick match</button>' +
        '<button class="btn" id="hostBtn"' + (avail ? '' : ' disabled') + '>Create room</button>' +
        '<span class="muted">or</span><input class="code-input" id="codeIn" maxlength="5" placeholder="CODE" aria-label="Room code">' +
        '<button class="btn" id="joinBtn"' + (avail ? '' : ' disabled') + '>Join</button></div>' +
        (avail ? '' : '<p class="bad">Online play needs the PeerJS library, which failed to load.</p>');
      $('playSub').textContent = 'Quick match';
      btn.querySelector('.play-label').textContent = 'Find duel';
      if (avail) {
        $('qmBtn').onclick = function () { startQuickMatch(); };
        $('hostBtn').onclick = function () { startHostRoom(); };
        $('joinBtn').onclick = function () { startJoinRoom($('codeIn').value); };
        $('codeIn').onkeydown = function (e) { if (e.key === 'Enter') startJoinRoom($('codeIn').value); };
      }
    }
  }
  $('modes').addEventListener('click', function (e) {
    var c = e.target.closest('.mode-card'); if (!c) return;
    app.mode = c.getAttribute('data-mode'); sfx('click'); renderModes();
  });
  $('playBtn').addEventListener('click', function () {
    sfx('click');
    if (app.mode === 'ranked') startRankedQueue();
    else if (app.mode === 'practice') startPractice();
    else startQuickMatch();
  });

  function renderHistory() {
    var h = P.history.slice(0, 8);
    $('historyStrip').innerHTML = '<div class="section-label">Recent matches</div>' + (h.length ? h.map(function (m) {
      var cls = m.won ? 'w' : m.draw ? 'd' : 'l';
      var lp = m.lp == null ? '<span class="muted">' + (m.placement ? 'Placement' : m.mode === 'duel' ? 'Duel' : m.mode === 'practice' ? 'Practice' : '—') + '</span>'
        : '<span class="' + (m.lp >= 0 ? 'good' : 'bad') + '">' + (m.lp >= 0 ? '+' : '') + m.lp + ' LP</span>';
      return '<div class="hist-row ' + cls + '"><i class="bar"></i>' + Art.sigil(m.champ, 30) +
        '<div><span class="res">' + (m.won ? 'Victory' : m.draw ? 'Draw' : 'Defeat') + '</span> <span class="muted">vs ' + esc(m.opp) + ' (' + E.CHAMPIONS[m.oppChamp].name + ')</span></div>' +
        '<span class="muted">' + m.score[0] + '–' + m.score[1] + ' · ' + fmtAgo(m.t) + '</span><span class="lp">' + lp + '</span></div>';
    }).join('') : '<p class="muted">No matches yet. Your first placement match is waiting.</p>');
  }

  function renderQuests() {
    R.ensureQuests(P);
    var today = R.dayKey();
    var html = '<h3>Daily quests</h3>' + P.quests.list.map(function (q, i) {
      return '<div class="quest' + (q.done ? ' done' : '') + '"><div class="qt"><span>' + esc(R.questText(q)) + '</span><span class="qr"><span class="ess-icon"></span>' + q.reward + '</span></div>' +
        '<div class="qbar"><i style="width:' + (100 * q.progress / q.goal) + '%"></i></div>' +
        '<div style="display:flex;justify-content:space-between"><span class="muted" style="font-size:12px">' + q.progress + ' / ' + q.goal + '</span>' +
        (!q.done && P.rerollDay !== today ? '<button class="reroll" data-rr="' + i + '">Reroll</button>' : '') + '</div></div>';
    }).join('');
    var fw = P.firstWinDay === today;
    html += '<div class="fwotd' + (fw ? ' claimed' : '') + '"><span class="dot"></span>' + (fw ? 'First win of the day claimed' : 'First win of the day: <b>+100</b> Essence') + '</div>';
    $('questPanel').innerHTML = html;
    $('questPanel').onclick = function (e) {
      var b = e.target.closest('[data-rr]'); if (!b) return;
      if (R.rerollQuest(P, +b.getAttribute('data-rr'))) { R.save(P); sfx('click'); renderQuests(); }
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Ranked queue → match found → select → VS → game
  // ---------------------------------------------------------------------------------------------
  function startRankedQueue() {
    if (!app.nextOpp) app.nextOpp = R.pickOpponent(P);
    var opp = app.nextOpp, t0 = Date.now(), dur = 1400 + Math.random() * 2200;
    var o = overlay('queueOverlay', '<div class="dialog queue"><div class="kicker">Ranked · ' + esc(rankLine(P.rank)) + '</div><h2 style="margin:6px 0 18px">Finding match</h2>' +
      '<div class="spin"><div class="ic">' + myAvatar(56) + '</div></div><div class="qtime" id="qTime">0:00</div>' +
      '<div class="actions" style="justify-content:center"><button class="btn ghost" id="qCancel">Cancel</button></div></div>');
    var iv = setInterval(function () { var s = Math.floor((Date.now() - t0) / 1000); var q = $('qTime'); if (q) q.textContent = '0:' + ('0' + s).slice(-2); }, 250);
    var to = setTimeout(function () { clearInterval(iv); matchFound(function () { startSelect({ kind: 'ranked', opp: opp }); }, function () { overlay('queueOverlay', null); }); }, dur);
    $('qCancel').onclick = function () { clearInterval(iv); clearTimeout(to); overlay('queueOverlay', null); };
  }

  function matchFound(onAccept, onDecline) {
    sfx('queuePop');
    overlay('queueOverlay', '<div class="dialog found"><h2>Match found</h2><div class="accept-ring"><svg viewBox="0 0 180 180"><circle class="bgc" cx="90" cy="90" r="85"/><circle class="fgc" cx="90" cy="90" r="85"/></svg><button class="btn gold big" id="acceptBtn">Accept</button></div>' +
      '<button class="btn ghost small" id="declineBtn">Decline</button></div>');
    var done = false;
    var t = setTimeout(function () { if (!done) { done = true; overlay('queueOverlay', null); toast('Match declined (no response).'); onDecline(); } }, 10000);
    $('acceptBtn').onclick = function () { if (done) return; done = true; clearTimeout(t); sfx('click'); $('acceptBtn').textContent = 'Accepted'; setTimeout(function () { overlay('queueOverlay', null); onAccept(); }, 500); };
    $('declineBtn').onclick = function () { if (done) return; done = true; clearTimeout(t); overlay('queueOverlay', null); onDecline(); };
  }

  function startTutorial() {
    var bot = R.BOTS[0];
    startSelect({ kind: 'practice', tutorial: true, opp: { bot: bot, rating: 800, displayRank: R.rankFromMMR(800) } });
  }

  function startPractice() {
    var lvl = PRACTICE[app.practiceLevel];
    var pool = R.BOTS.slice().sort(function (a, b) { return Math.abs(a.home - lvl.rating) - Math.abs(b.home - lvl.rating); });
    var bot = pool[0];
    startSelect({ kind: 'practice', opp: { bot: bot, rating: lvl.rating, displayRank: R.rankFromMMR(lvl.rating) } });
  }

  // ctx: { kind: 'ranked'|'practice'|'duel', opp: {...} }
  function startSelect(ctx) {
    app.select = { ctx: ctx, pick: null, locked: false, oppPick: null, oppLocked: false };
    go('select');
    var sel = app.select;
    $('selectKicker').textContent = ctx.kind === 'ranked' ? (P.ascension ? 'Ascension match' : P.rank ? 'Ranked · ' + R.rankName(P.rank) : 'Placement match') : ctx.kind === 'duel' ? 'Online duel' : 'Practice';
    var oppName = ctx.kind === 'duel' ? ctx.opp.name : ctx.opp.bot.name;
    var oppAv = ctx.kind === 'duel' ? Art.avatar(ctx.opp.avatar, 44) : Art.botAvatar(ctx.opp.bot, 44);
    function renderOpp() {
      $('selectOpp').innerHTML = '<div><div style="font-weight:700">' + esc(oppName) + '</div><div class="st">' + (sel.oppLocked ? (sel.locked ? E.CHAMPIONS[sel.oppPick].name + ' — locked in' : 'Locked in') : 'Picking…') + '</div></div>' + oppAv;
    }
    renderOpp();
    sel.renderOpp = renderOpp;
    $('champGrid').innerHTML = E.CHAMP_IDS.map(function (id) {
      var c = E.CHAMPIONS[id], mp = P.mastery[id] || 0, lvl = R.masteryLevel(mp);
      return '<button class="champ" data-c="' + id + '" style="--c:' + c.color + '">' +
        '<span class="mast" title="Mastery level">M' + lvl + '</span>' +
        '<div class="sig">' + Art.sigil(id, 84) + '</div><div class="cn">' + c.name + '</div><div class="cr">' + c.role + '</div>' +
        '<div class="cu">' + c.ult + '<span>' + c.cost + ' charge</span></div><div class="cd">' + c.desc + '</div></button>';
    }).join('');
    $('champGrid').onclick = function (e) {
      var b = e.target.closest('.champ'); if (!b || sel.locked) return;
      sel.pick = b.getAttribute('data-c');
      document.querySelectorAll('.champ').forEach(function (x) { x.classList.toggle('sel', x === b); });
      $('lockBtn').disabled = false; sfx('hover');
    };
    // Default highlight: most-mastered champion
    var fav = E.CHAMP_IDS.slice().sort(function (a, b) { return (P.mastery[b] || 0) - (P.mastery[a] || 0); })[0];
    if (P.mastery[fav]) { sel.pick = fav; document.querySelector('.champ[data-c="' + fav + '"]').classList.add('sel'); $('lockBtn').disabled = false; } else $('lockBtn').disabled = true;
    $('lockBtn').textContent = 'Lock in';

    var total = ctx.kind === 'duel' ? 25 : 20, left = total;
    $('selectTime').textContent = left;
    $('selectRing').style.strokeDashoffset = 0;
    clearInterval(app.selectTimer);
    app.selectTimer = setInterval(function () {
      left--;
      $('selectTime').textContent = Math.max(0, left);
      $('selectRing').style.strokeDashoffset = (119.4 * (1 - left / total)).toFixed(1);
      if (left <= 5 && left > 0) sfx('tick');
      if (left <= 0) { clearInterval(app.selectTimer); if (!sel.locked) { if (!sel.pick) sel.pick = E.CHAMP_IDS[Math.floor(Math.random() * 5)]; lockIn(); } }
    }, 1000);

    // Bots lock in after a moment (hidden until you lock).
    if (ctx.kind !== 'duel') {
      setTimeout(function () {
        var b = ctx.opp.bot;
        sel.oppPick = Math.random() < 0.65 ? b.main : E.CHAMP_IDS[Math.floor(Math.random() * 5)];
        sel.oppLocked = true; renderOpp(); maybeProceed();
      }, 1500 + Math.random() * 3500);
    }
    $('lockBtn').onclick = function () { if (sel.pick && !sel.locked) lockIn(); };
    function lockIn() {
      sel.locked = true;
      $('lockBtn').disabled = true; $('lockBtn').textContent = 'Locked';
      sfx('ultReady');
      document.querySelectorAll('.champ').forEach(function (x) { if (!x.classList.contains('sel')) x.style.opacity = .35; });
      if (ctx.kind === 'duel' && app.online) app.online.ch.send({ t: 'pick', champ: sel.pick });
      renderOpp(); maybeProceed();
    }
    function maybeProceed() {
      if (!sel.locked || !sel.oppLocked || sel.proceeded) return;
      sel.proceeded = true;
      clearInterval(app.selectTimer);
      renderOpp();
      setTimeout(function () { showVs(ctx, sel.pick, sel.oppPick); }, 900);
    }
    sel.maybeProceed = maybeProceed;
  }

  function showVs(ctx, myChamp, oppChamp) {
    go('vs');
    var me = E.CHAMPIONS[myChamp], op = E.CHAMPIONS[oppChamp];
    var oppName = ctx.kind === 'duel' ? ctx.opp.name : ctx.opp.bot.name;
    var oppRank = ctx.kind === 'duel' ? esc(ctx.opp.rankLabel || 'Duel ' + ctx.opp.duel) : (ctx.kind === 'ranked' ? Art.emblem(ctx.opp.displayRank, 26, { div: false }) + R.rankName(ctx.opp.displayRank) : 'Practice · ' + PRACTICE[app.practiceLevel].name);
    var myRank = ctx.kind === 'duel' ? 'Duel ' + P.duel.rating : Art.emblem(P.rank, 26, { div: false }) + esc(rankLine(P.rank));
    var mastery = R.masteryLevel(P.mastery[myChamp] || 0);
    var mySide = ctx.kind === 'duel' ? ctx.side : 1;
    var L = mySide === 1 ? 'l' : 'r';
    $('vsBox').innerHTML =
      '<div class="vs-side l" style="color:' + (mySide === 1 ? me.color : op.color) + '">' + sideHtml(mySide === 1) + '</div>' +
      '<div class="vs-side r" style="color:' + (mySide === 1 ? op.color : me.color) + '">' + sideHtml(mySide !== 1) + '</div>' +
      '<div class="vs-mid">VS</div><div class="vs-foot" id="vsFoot">' + (ctx.opp.gatekeeper ? '<b class="nem gate">GATEKEEPER</b> Defeat ' + esc(oppName) + ' to ascend' : ctx.opp.nemesis ? '<b class="nem">NEMESIS</b> Beat ' + esc(oppName) + ' for +5 revenge LP' : ctx.tutorial ? 'Training match · the coach is watching' : 'Loading the arena<span class="loading-dots"></span>') + '</div>';
    function sideHtml(isMe) {
      var c = isMe ? me : op;
      return '<div class="big-sig">' + Art.sigil(c.id, 180) + '</div><div class="vc">' + c.name + ' · ' + c.role + '</div>' +
        '<div class="vn" style="color:#fff">' + esc(isMe ? P.name : oppName) + '</div><div class="vr">' + (isMe ? myRank + ' · Mastery ' + mastery : oppRank) + '</div>';
    }
    void L;
    sfx('queuePop');
    setTimeout(function () { sfx('boom'); }, 450);
    setTimeout(function () { startGame(ctx, myChamp, oppChamp); }, 2800);
  }

  // ---------------------------------------------------------------------------------------------
  // Game
  // ---------------------------------------------------------------------------------------------
  function startGame(ctx, myChamp, oppChamp) {
    go('game');
    var players = {}, mySide = 1, first, runeLayout;
    if (ctx.kind === 'duel') {
      mySide = ctx.side; first = ctx.first; runeLayout = ctx.runeLayout;
      players[mySide] = { name: P.name, avatarHtml: myAvatar(40), rankHtml: 'Duel ' + P.duel.rating, champ: myChamp, kind: 'human' };
      players[3 - mySide] = { name: ctx.opp.name, avatarHtml: Art.avatar(ctx.opp.avatar, 40), rankHtml: 'Duel ' + ctx.opp.duel, champ: oppChamp, kind: 'remote' };
    } else {
      first = Math.random() < 0.5 ? 1 : 2; runeLayout = Math.floor(Math.random() * E.RUNE_LAYOUTS.length);
      var bot = ctx.opp.bot;
      players[1] = { name: P.name, avatarHtml: myAvatar(40), rankHtml: ctx.kind === 'ranked' ? Art.emblem(P.rank, 18, { div: false }) + esc(rankLine(P.rank)) : 'Practice', champ: myChamp, kind: 'human' };
      players[2] = { name: bot.name, avatarHtml: Art.botAvatar(bot, 40), rankHtml: (ctx.kind === 'ranked' ? Art.emblem(ctx.opp.displayRank, 18, { div: false }) + R.rankName(ctx.opp.displayRank) : ctx.tutorial ? 'Training' : PRACTICE[app.practiceLevel].name) + ' · AI',
        champ: oppChamp, kind: 'bot', bot: bot, botProfile: AI.profileFor(ctx.opp.rating, bot.style) };
    }
    var m = new Y.Match({
      mode: ctx.kind, mySide: mySide, players: players, first: first, runeLayout: runeLayout,
      channel: ctx.kind === 'duel' && app.online ? app.online.ch : null,
      skin: P.equipped.skin, boardTheme: P.equipped.board, fast: P.settings.fast, coach: !!ctx.tutorial,
      toast: toast,
      confirmResign: function (ok) { confirmBox('Surrender?', 'You will lose this match' + (ctx.kind === 'ranked' ? ' and the LP that comes with it.' : '.'), 'Surrender', ok, 'Keep playing'); },
      onRemoteAfk: function () { toast('Opponent stopped responding.'); m.forfeit(3 - mySide); },
      onDesync: function () { toast('Game desynced — ending match.'); m.forfeit(3 - mySide); },
      onEnd: function (summary) { onGameEnd(ctx, summary, m); }
    });
    app.match = m;
    app.ctx = ctx;
    if (ctx.kind === 'ranked') {
      P.activeMatch = { champ: myChamp, oppChamp: oppChamp, oppName: ctx.opp.bot.name, oppId: ctx.opp.bot.id, oppRating: ctx.opp.rating, t: Date.now() };
      R.save(P);
    }
    m.start();
  }

  function onGameEnd(ctx, s, m) {
    var mm = {
      mode: ctx.kind, ranked: ctx.kind === 'ranked', won: s.won, draw: s.draw, champ: s.champ, oppChamp: s.oppChamp,
      oppName: ctx.kind === 'duel' ? ctx.opp.name : ctx.opp.bot.name,
      oppId: ctx.kind === 'ranked' ? ctx.opp.bot.id : null,
      oppRating: ctx.kind === 'duel' ? ctx.opp.duel : ctx.opp.rating,
      score: s.score, bestMove: s.bestMove, maxLines: s.maxLines, runesEnd: s.runesEnd, ults: s.ults,
      cornersEnd: s.cornersEnd, margin: s.margin, flipped: s.flipped, nemesis: !!ctx.opp.nemesis
    };
    if (ctx.tutorial) { P.tutorialDone = true; }
    var out = R.recordMatch(P, mm);
    app.lastGame = { ctx: ctx, summary: s, out: out, history: m.history, final: s.state, me: s.me, players: m.P };
    app.nextOpp = null;
    if (s.won) { sfx('victory'); Y.FX.confetti(s.me === 1 ? '#3ab0ff' : '#ff3b5c', '#f5d77a'); } else if (!s.draw) sfx('defeat');
    showResults();
  }

  // ---------------------------------------------------------------------------------------------
  // Results
  // ---------------------------------------------------------------------------------------------
  function showResults() {
    var g = app.lastGame, s = g.summary, out = g.out, ctx = g.ctx;
    var cls = s.won ? 'win' : s.draw ? 'draw' : 'loss';
    var title = s.won ? 'Victory' : s.draw ? 'Draw' : 'Defeat';
    var sub = s.forfeit ? (s.forfeit === s.me ? 'You surrendered' : 'Opponent forfeited') : (s.won ? 'The board is yours' : s.draw ? 'Perfectly balanced' : 'The board slipped away');
    var rk = out.ranked, lpHtml = '';
    if (rk) {
      if (!rk.after && !rk.before) {
        var done = P.placementsTotal - P.placementsLeft;
        lpHtml = '<div class="lp-block"><div>' + Art.emblem(null, 64) + '</div><div><div class="lpn">Placements</div><div class="muted">' + done + ' of ' + P.placementsTotal + ' played</div>' +
          '<div style="display:flex;gap:6px;margin-top:8px">' + placementDots() + '</div></div><div class="lpd muted">—</div></div>';
      } else {
        var start = rk.before || rk.after;
        lpHtml = '<div class="lp-block" id="lpBlock"><div id="lpEm">' + Art.emblem(start, 64) + '</div><div><div class="lpn" id="lpName">' + R.rankName(start) + '</div>' +
          '<div class="lp-bar" style="--tier-color:' + tierColor(start) + ';--tier-glow:' + tierGlow(start) + '"><div class="fill" id="lpFill" style="width:' + lpPctOf(start) + '%"></div></div>' +
          '<div class="muted" id="lpNum">' + start.lp + ' LP</div></div><div class="lpd ' + (rk.lpDelta >= 0 ? 'good' : 'bad') + '" id="lpDelta">' + (rk.lpDelta >= 0 ? '+' : '') + rk.lpDelta + '</div></div>' +
          (rk.hotStreak ? '<div class="badge fire">🔥 Hot streak +2 LP</div> ' : '') +
          rk.events.map(function (e) {
            if (e.type === 'ascension') return '<div class="badge asc">100 LP — Ascension match unlocked</div>';
            if (e.type === 'ascensionFailed') return '<div class="badge shield">Ascension failed — get back to 100 LP to try again</div>';
            if (e.type === 'shield') return '<div class="badge shield">Demotion shield absorbed the loss</div>';
            if (e.type === 'demoted') return '<div class="badge" style="color:var(--bad)">Demoted to ' + R.rankName(e.rank) + '</div>';
            return '';
          }).join(' ');
      }
    }
    if (out.duelDelta != null) lpHtml = '<div class="lp-block"><div>' + myAvatar(56) + '</div><div><div class="lpn">Duel rating</div><div class="muted">' + P.duel.rating + '</div></div><div class="lpd ' + (out.duelDelta >= 0 ? 'good' : 'bad') + '">' + (out.duelDelta >= 0 ? '+' : '') + out.duelDelta + '</div></div>';
    if (rk && rk.revenge) lpHtml += ' <div class="badge fire">Revenge on your nemesis +5 LP</div>';
    if (ctx.kind === 'ranked' || ctx.tutorial) lpHtml += '<div class="goal-line center"><span class="goal-ic">➤</span>Next: ' + esc(R.nextGoal(P).text) + '</div>';
    var mast = out.mastery, mp = R.masteryProgress(mast.after);
    var rewards = out.rewards.map(function (r, i) { return '<div style="animation-delay:' + (0.8 + i * 0.15) + 's"><span>' + esc(r.label) + '</span><b class="qr"><span class="ess-icon"></span> +' + r.amount + '</b></div>'; }).join('') +
      '<div style="animation-delay:' + (0.8 + out.rewards.length * 0.15) + 's;border-left-color:' + E.CHAMPIONS[mast.champ].color + '"><span>' + E.CHAMPIONS[mast.champ].name + ' mastery +' + mast.gained + (mast.levelUp ? ' — <b style="color:var(--gold-hi)">Level ' + mp.level + '!</b>' : '') + '</span><span class="muted">M' + mp.level + (mp.next ? ' · ' + mp.next + ' to next' : ' · max') + '</span></div>' +
      (out.quests || []).filter(function (q) { return !q.done; }).map(function (q) { return '<div style="animation-delay:1s;border-left-color:#bff4ff"><span>Quest: ' + esc(q.text) + '</span><b>' + q.progress + ' / ' + q.goal + '</b></div>'; }).join('') +
      (out.h2h ? '<div style="animation-delay:' + (0.9 + out.rewards.length * 0.15) + 's;border-left-color:var(--gold)"><span>Head-to-head vs ' + esc(ctx.opp.bot.name) + '</span><b>' + out.h2h.w + ' – ' + out.h2h.l + '</b></div>' : '');
    var again = ctx.tutorial ? 'Start placements' : ctx.kind === 'duel' ? 'Rematch' : ctx.kind === 'practice' ? 'Play again' : (P.ascension ? 'Ascension match' : 'Queue again');
    var o = overlay('resultOverlay', '<div class="dialog result ' + cls + '"><div class="rt">' + title + '</div><div class="rs">' + sub + '</div>' +
      '<div class="tally"><i class="a" id="tA"></i><i class="b" id="tB"></i></div>' +
      '<div class="tally-nums"><span class="' + (s.me === 1 ? 'a' : 'b') + '">' + s.score[0] + '</span><span class="' + (s.me === 1 ? 'b' : 'a') + '">' + s.score[1] + '</span></div>' +
      lpHtml + '<div class="rewards">' + rewards + '</div>' +
      '<div class="actions"><button class="btn ghost" id="rHome">Home</button><button class="btn" id="rReview">Review game</button><button class="btn gold big" id="rAgain">' + again + '</button></div></div>');
    // Tally: left = me
    setTimeout(function () {
      var a = $('tA'), b = $('tB'); if (!a) return;
      var left = s.me === 1 ? a : b, right = s.me === 1 ? b : a;
      a.parentNode.style.flexDirection = s.me === 1 ? 'row' : 'row-reverse';
      left.style.flexGrow = Math.max(1, s.score[0]); right.style.flexGrow = Math.max(1, s.score[1]);
    }, 200);
    if (rk && (rk.before || rk.after)) animateLp(rk);
    $('rHome').onclick = function () { closeResults(); leaveOnline(); go('home'); };
    $('rReview').onclick = function () { closeResults(); go('review'); };
    $('rAgain').onclick = function () {
      closeResults();
      if (ctx.kind === 'ranked' || ctx.tutorial) { go('home'); startRankedQueue(); }
      else if (ctx.kind === 'practice') startPractice();
      else requestRematch();
    };
    void o;
    // Ceremonies after the result sinks in
    var cer = rk && rk.events.filter(function (e) { return e.type === 'tierUp' || e.type === 'placed' || e.type === 'divUp'; })[0];
    if (cer) setTimeout(function () { ceremony(cer); }, 2600);
  }
  function closeResults() { overlay('resultOverlay', null); if (app.match) { app.match.destroy(); app.match = null; } }
  function placementDots() {
    var out = '', n = P.placementsTotal, h = P.history.filter(function (m) { return m.mode === 'ranked'; }).slice(0, n - P.placementsLeft).reverse();
    for (var i = 0; i < n; i++) {
      var m = h[i];
      out += '<i style="width:16px;height:16px;transform:rotate(45deg);display:inline-block;border:1px solid var(--line-strong);background:' + (m ? (m.won ? 'var(--azure)' : m.draw ? 'var(--muted)' : 'var(--crimson)') : 'transparent') + '"></i>';
    }
    return out;
  }
  function lpPctOf(r) { return r.tier >= R.APEX ? Math.min(100, r.lp / 10) : Math.max(0, Math.min(100, r.lp)); }
  function animateLp(rk) {
    var from = rk.before || rk.after, to = rk.after;
    var changed = rk.before && (rk.before.tier !== to.tier || rk.before.div !== to.div);
    var fill = $('lpFill'), num = $('lpNum');
    function tickTo(a, b, ms) {
      return new Promise(function (res) {
        var t0 = performance.now(), lastV = a;
        (function f(now) {
          var k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3), v = Math.round(a + (b - a) * e);
          if (!$('lpFill')) return res();
          fill.style.width = lpPctOf({ tier: to.tier, lp: v }) + '%';
          num.textContent = v + ' LP';
          if (v !== lastV && (v % 3 === 0)) sfx('lp');
          lastV = v;
          if (k < 1) requestAnimationFrame(f); else res();
        })(t0);
      });
    }
    fill.style.transition = 'none';
    wait(900).then(function () {
      if (!changed) return tickTo(from.lp, to.lp, 900);
      var up = R.rankMMR(to) > R.rankMMR(rk.before);
      return tickTo(from.lp, up ? 100 : 0, 700).then(function () {
        if (!$('lpEm')) return;
        $('lpEm').innerHTML = Art.emblem(to, 64);
        $('lpName').textContent = R.rankName(to);
        fill.parentNode.style.setProperty('--tier-color', tierColor(to));
        fill.parentNode.style.setProperty('--tier-glow', tierGlow(to));
        return tickTo(up ? 0 : 100, to.lp, 700);
      });
    });
  }

  function ceremony(ev) {
    var r = ev.rank, g = R.TIERS[r.tier].glow;
    var kicker = ev.type === 'placed' ? 'Placements complete' : ev.type === 'divUp' ? 'Division up' : 'Promoted';
    var shards = '';
    for (var i = 0; i < 18; i++) {
      var a = i / 18 * Math.PI * 2, d = 260 + Math.random() * 200;
      shards += '<i class="shard" style="--sx:' + Math.round(Math.cos(a) * d) + 'px;--sy:' + Math.round(Math.sin(a) * d) + 'px;animation-delay:' + (Math.random() * 0.3).toFixed(2) + 's"></i>';
    }
    var o = overlay('ceremony', '<div class="beam"></div><div class="cer-emblem" style="--g:' + g + '">' + shards + Art.emblem(r, 240) + '</div>' +
      '<div class="cer-kicker">' + kicker + '</div><div class="cer-title" style="--g:' + g + '">' + R.rankName(r).toUpperCase() + '</div>' +
      '<div class="cer-sub">' + (ev.type === 'placed' ? 'Welcome to the ladder. Climb.' : 'Season ' + R.seasonInfo().n + ' · ' + r.lp + ' LP') + '</div>' +
      '<div class="sweep"></div><button class="btn gold big" id="cerOk">Continue</button>');
    o.style.setProperty('--g', g);
    sfx('rankUp');
    setTimeout(function () { Y.FX.confetti(g, '#ffffff'); }, 1300);
    $('cerOk').onclick = function () { overlay('ceremony', null); renderRankCard(); };
  }

  // ---------------------------------------------------------------------------------------------
  // Review (post-game engine analysis)
  // ---------------------------------------------------------------------------------------------
  RENDER.review = function () {
    var g = app.lastGame, el = $('screen-review');
    if (!g) { el.innerHTML = '<div class="page"><p class="muted">Play a game first.</p></div>'; return; }
    el.innerHTML = '<div class="page"><div class="page-head"><div><div class="kicker">Post-game review</div><h1>Game analysis</h1></div><button class="btn" data-go="home">Back to lobby</button></div>' +
      '<div class="review-grid"><div class="panel"><div class="review-board" id="revBoard"></div><div style="display:flex;gap:8px;justify-content:center;margin-top:10px">' +
      '<button class="btn small" id="revPrev">◀ Prev</button><span class="muted" id="revPly" style="align-self:center;min-width:90px;text-align:center"></span><button class="btn small" id="revNext">Next ▶</button></div></div>' +
      '<div class="panel"><h3>Advantage</h3><svg class="chart" id="revChart" viewBox="0 0 300 140" preserveAspectRatio="none"></svg>' +
      '<div style="display:flex;justify-content:space-between;margin:12px 0"><div><div class="kicker">Your accuracy</div><div class="acc" id="accMe">—</div></div><div style="text-align:right"><div class="kicker">Opponent</div><div class="acc muted" id="accOp">—</div></div></div>' +
      '<div class="moves" id="revMoves"><p class="muted">Analysing<span class="loading-dots"></span></p></div></div></div></div>';
    var bv = new Y.BoardView($('revBoard'), {});
    bv.setSkin(P.equipped.skin);
    var states = g.history.map(function (h) { return h.state; }).concat([g.final]);
    var idx = states.length - 1;
    function show(i) {
      idx = Math.max(0, Math.min(states.length - 1, i));
      var h = g.history[idx - 1];
      bv.render(states[idx], { last: h && h.action.cell >= 0 ? h.action.cell : -1 });
      $('revPly').textContent = idx === 0 ? 'Start' : 'Move ' + idx + ' / ' + (states.length - 1);
      document.querySelectorAll('.mv-row').forEach(function (r) { r.classList.toggle('on', +r.getAttribute('data-i') === idx - 1); });
      drawChart();
    }
    $('revPrev').onclick = function () { show(idx - 1); };
    $('revNext').onclick = function () { show(idx + 1); };
    var adv = states.map(function (s) { return AI.advantage(s, g.me); });
    function drawChart() {
      var n = adv.length, w = 300, h = 140, pts = adv.map(function (v, i) { return [(i / Math.max(1, n - 1)) * w, h / 2 - v * (h / 2 - 6)]; });
      var line = pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ');
      var meCol = g.me === 1 ? 'area-a' : 'area-b', opCol = g.me === 1 ? 'area-b' : 'area-a';
      $('revChart').innerHTML =
        '<clipPath id="cTop"><rect x="0" y="0" width="300" height="70"/></clipPath><clipPath id="cBot"><rect x="0" y="70" width="300" height="70"/></clipPath>' +
        '<polygon class="' + meCol + '" clip-path="url(#cTop)" points="0,70 ' + line + ' 300,70"/>' +
        '<polygon class="' + opCol + '" clip-path="url(#cBot)" points="0,70 ' + line + ' 300,70"/>' +
        '<line class="zero" x1="0" y1="70" x2="300" y2="70"/><polyline points="' + line + '" fill="none" stroke="#e9e6df" stroke-width="1.5"/>' +
        '<line class="cursor" x1="' + pts[idx][0] + '" y1="0" x2="' + pts[idx][0] + '" y2="140"/>';
    }
    $('revChart').onclick = function (e) {
      var r = e.currentTarget.getBoundingClientRect();
      show(Math.round((e.clientX - r.left) / r.width * (states.length - 1)));
    };
    show(idx);
    analyse(g, function (res) {
      if (app.screen !== 'review') return;
      $('accMe').textContent = res.acc[g.me] == null ? '—' : res.acc[g.me] + '%';
      $('accOp').textContent = res.acc[3 - g.me] == null ? '—' : res.acc[3 - g.me] + '%';
      $('revMoves').innerHTML = g.history.map(function (h, i) {
        var t = res.tags[i], name = g.players[h.player].name;
        var what = h.action.type === 'pass' ? 'Pass' : h.action.type === 'ult' ? E.CHAMPIONS[h.state.champ[h.player]].ult : 'Place' + (h.ev.flipped ? ' +' + h.ev.flipped : '');
        return '<div class="mv-row" data-i="' + i + '"><span class="muted">' + (i + 1) + '</span><span class="dot" style="background:' + (h.player === 1 ? 'var(--azure)' : 'var(--crimson)') + '"></span>' +
          '<span>' + esc(name) + ' · ' + what + '</span>' + (t ? '<span class="tag ' + t + '">' + t + '</span>' : '<span></span>') + '</div>';
      }).join('');
      $('revMoves').onclick = function (e) { var r = e.target.closest('.mv-row'); if (r) show(+r.getAttribute('data-i') + 1); };
      show(idx);
    });
  };

  function analyse(g, done) {
    if (g.analysis) return done(g.analysis);
    var prof = { depth: 2, noise: 0, blunder: 0, ultCap: 3, ultShy: 0, endgame: 0, budget: 1e9, style: AI.DEFAULT_STYLE };
    var tags = [], loss = [0, [], []], i = 0;
    function clampV(v) { return Math.max(-60, Math.min(60, v)); }
    (function step() {
      var t0 = performance.now();
      while (i < g.history.length && performance.now() - t0 < 30) {
        var h = g.history[i], s = h.state, tag = null;
        var sc = AI.scoreActions(s, prof);
        if (sc.length > 1) {
          var key = AI.key(h.action), played = sc.filter(function (x) { return AI.key(x.action) === key; })[0];
          var best = clampV(sc[0].value), pv = played ? clampV(played.value) : clampV(sc[sc.length - 1].value), l = Math.max(0, best - pv);
          var second = clampV(sc[1].value);
          if (l <= 0.5) tag = (best - second >= 8 && sc.length >= 4) ? 'brilliant' : 'best';
          else if (l <= 3) tag = 'good';
          else if (l <= 8) tag = 'inaccuracy';
          else if (l <= 16) tag = 'mistake';
          else tag = 'blunder';
          loss[h.player].push(l);
        }
        tags[i] = tag;
        i++;
      }
      if (i < g.history.length) setTimeout(step, 0);
      else {
        var acc = [null, null, null];
        [1, 2].forEach(function (p) {
          if (!loss[p].length) return;
          acc[p] = Math.round(loss[p].reduce(function (a, l) { return a + 100 * Math.exp(-l / 14); }, 0) / loss[p].length);
        });
        g.analysis = { tags: tags, acc: acc };
        done(g.analysis);
      }
    })();
  }

  // ---------------------------------------------------------------------------------------------
  // Profile
  // ---------------------------------------------------------------------------------------------
  RENDER.profile = function () {
    renderTopbar();
    var el = $('screen-profile');
    var mastery = E.CHAMP_IDS.map(function (id) {
      var c = E.CHAMPIONS[id], pts = P.mastery[id] || 0, mp = R.masteryProgress(pts);
      return '<div class="mastery-row">' + Art.sigil(id, 44) + '<div><b>' + c.name + '</b> <span class="muted">· ' + c.role + ' · ' + pts + ' pts</span><div class="mbar"><i style="width:' + (mp.pct * 100) + '%;background:' + c.color + '"></i></div></div><div class="mastery-lvl">M' + mp.level + '</div></div>';
    }).join('');
    var past = P.pastSeasons.slice(-4).reverse().map(function (s) { return '<div class="stat"><b>' + (s.peak ? R.rankName(s.peak) : 'Unranked') + '</b><span>Split ' + s.season + ' peak</span></div>'; }).join('');
    el.innerHTML = '<div class="page"><div class="page-head"><div style="display:flex;gap:16px;align-items:center">' + myAvatar(76) +
      '<div><div class="kicker">' + esc(myTitle()) + '</div><h1>' + esc(P.name) + '</h1><div class="muted">' + esc(rankLine(P.rank)) + (P.peak ? ' · peak ' + esc(R.rankName(P.peak)) : '') + '</div></div></div>' +
      '<button class="btn" id="editProfile">Edit profile</button></div>' +
      '<div class="stat-grid"><div class="stat"><b>' + P.games + '</b><span>Games</span></div><div class="stat"><b>' + (P.games ? Math.round(100 * P.wins / P.games) : 0) + '%</b><span>Win rate</span></div>' +
      '<div class="stat"><b>' + P.bestStreak + '</b><span>Best streak</span></div><div class="stat"><b>' + P.duel.rating + '</b><span>Duel rating</span></div></div>' +
      '<div class="grid2"><div class="panel"><h3>Champion mastery</h3>' + mastery + '</div>' +
      '<div class="panel"><h3>Ranked</h3><div style="display:flex;gap:16px;align-items:center">' + Art.emblem(P.rank, 110) + '<div><div style="font-family:var(--font-display);font-size:24px">' + esc(P.rank ? R.rankName(P.rank) : 'Unranked') + '</div><div class="muted">' + (P.rank ? P.rank.lp + ' LP' : P.placementsLeft + ' placement games left') + '</div><div class="muted" style="margin-top:6px">Hidden MMR is used to size your LP gains: win more than expected and you climb faster.</div></div></div>' +
      (past ? '<h3 style="margin-top:18px">Past splits</h3><div class="stat-grid" style="grid-template-columns:1fr 1fr">' + past + '</div>' : '') +
      '<h3 style="margin-top:18px">Settings</h3><label style="display:flex;gap:10px;align-items:center"><input type="checkbox" id="setFast"' + (P.settings.fast ? ' checked' : '') + '> Fast animations</label>' +
      '<div style="margin-top:12px"><button class="btn ghost small" id="resetBtn">Reset all progress</button></div></div></div>' +
      '<div class="panel"><h3>Match history</h3><div class="history-strip" id="profHist"></div></div></div>';
    $('profHist').innerHTML = P.history.length ? P.history.map(function (m) {
      var cls = m.won ? 'w' : m.draw ? 'd' : 'l';
      return '<div class="hist-row ' + cls + '"><i class="bar"></i>' + Art.sigil(m.champ, 30) + '<div><span class="res">' + (m.won ? 'Victory' : m.draw ? 'Draw' : 'Defeat') + '</span> <span class="muted">vs ' + esc(m.opp) + ' · ' + m.mode + '</span></div><span class="muted">' + m.score[0] + '–' + m.score[1] + ' · ' + fmtAgo(m.t) + '</span><span class="lp">' + (m.lp == null ? '' : '<span class="' + (m.lp >= 0 ? 'good' : 'bad') + '">' + (m.lp >= 0 ? '+' : '') + m.lp + '</span>') + '</span></div>';
    }).join('') : '<p class="muted">No games yet.</p>';
    $('setFast').onchange = function (e) { P.settings.fast = e.target.checked; R.save(P); };
    $('resetBtn').onclick = function () { confirmBox('Reset everything?', 'Your rank, mastery, Essence and history will be wiped. This cannot be undone.', 'Reset', function () { P = R.freshProfile(); R.save(P); app.nextOpp = null; go('home'); toast('Progress reset. Fresh start!'); }); };
    $('editProfile').onclick = editProfile;
  };
  function editProfile() {
    var av = '';
    for (var i = 0; i < Art.AVATAR_COUNT; i++) av += '<button data-av="' + i + '" class="' + (i === P.avatar ? 'on' : '') + '">' + Art.avatar(i, 48) + '</button>';
    var o = overlay('modal', '<div class="dialog"><h2>Edit profile</h2><div class="field"><label for="nameIn">Summoner name</label><input id="nameIn" maxlength="16" value="' + esc(P.name) + '"></div>' +
      '<div class="field" style="margin-top:14px"><label>Icon</label><div class="avatar-pick" id="avPick">' + av + '</div></div>' +
      '<div class="actions"><button class="btn ghost" data-x="no">Cancel</button><button class="btn gold" data-x="ok">Save</button></div></div>');
    var pick = P.avatar;
    o.onclick = function (e) {
      var a = e.target.closest('[data-av]');
      if (a) { pick = +a.getAttribute('data-av'); document.querySelectorAll('#avPick button').forEach(function (b) { b.classList.toggle('on', b === a); }); return; }
      var b = e.target.closest('[data-x]'); if (!b) return;
      if (b.getAttribute('data-x') === 'ok') {
        var n = $('nameIn').value.trim().replace(/[^\w\- ]/g, '').slice(0, 16);
        if (n) P.name = n;
        P.avatar = pick; R.save(P); renderTopbar(); RENDER.profile();
      }
      overlay('modal', null);
    };
  }

  // ---------------------------------------------------------------------------------------------
  // Ladder
  // ---------------------------------------------------------------------------------------------
  RENDER.ladder = function () {
    renderTopbar();
    var rows = R.ladder(P);
    $('screen-ladder').innerHTML = '<div class="page"><div class="page-head"><div><div class="kicker">Split ' + R.seasonInfo().n + '</div><h1>Rival ladder</h1></div>' +
      '<p class="muted" style="max-width:460px;margin:0">Ranked pits you against these AI rivals, each with its own style. Their ratings move when you beat them (or they beat you).</p></div>' +
      '<div class="panel" style="padding:6px 8px"><table class="table"><thead><tr><th>#</th><th>Player</th><th>Rank</th><th class="hide-sm">Main</th><th class="hide-sm">Your record</th></tr></thead><tbody>' +
      rows.map(function (r, i) {
        var h = r.bot ? P.h2h[r.bot.id] : null;
        return '<tr class="' + (r.you ? 'you' : '') + '"><td>' + (i + 1) + '</td><td><div class="ladder-name">' + (r.you ? myAvatar(34) : Art.botAvatar(r.bot, 34)) +
          '<div><b>' + esc(r.name) + '</b><small>' + (r.you ? 'You · ' + esc(myTitle()) : esc(r.tag)) + '</small></div></div></td>' +
          '<td><div class="ladder-rank">' + Art.emblem(r.rank, 30, { div: false }) + (r.rank ? R.rankLabel(r.rank) : 'Unranked') + '</div></td>' +
          '<td class="hide-sm">' + (r.bot ? Art.sigil(r.bot.main, 22) + ' ' + E.CHAMPIONS[r.bot.main].name : '—') + '</td>' +
          '<td class="hide-sm">' + (h ? '<span class="good">' + h.w + 'W</span> – <span class="bad">' + h.l + 'L</span>' : '<span class="muted">—</span>') + '</td></tr>';
      }).join('') + '</tbody></table></div></div>';
  };

  // ---------------------------------------------------------------------------------------------
  // Collection
  // ---------------------------------------------------------------------------------------------
  RENDER.collection = function () {
    renderTopbar();
    function preview(it) {
      if (it.kind === 'skin') {
        var name = it.id.replace('skin-', ''), hex = name === 'gem' || name === 'gold';
        var d = hex ? 'M19.2,11.1L0,22.2L-19.2,11.1L-19.2,-11.1L0,-22.2L19.2,-11.1Z' : 'M-22,0a22,22 0 1,0 44,0a22,22 0 1,0 -44,0';
        return '<svg viewBox="-60 -30 120 60" width="150" data-skin="' + name + '"><g class="stone p1" transform="translate(-26,0)"><g class="flipper"><path class="disc" d="' + d + '"/><ellipse class="spec" cx="-6" cy="-8" rx="8" ry="4.5" transform="rotate(-25)"/></g></g><g class="stone p2" transform="translate(26,0)"><g class="flipper"><path class="disc" d="' + d + '"/><ellipse class="spec" cx="-6" cy="-8" rx="8" ry="4.5" transform="rotate(-25)"/></g></g></svg>';
      }
      if (it.kind === 'board') {
        var t = it.id.replace('board-', '');
        return '<svg viewBox="-60 -34 120 68" width="150" data-board="' + t + '" style="' + boardVars(t) + '">' + [[-26, 0], [0, 0], [26, 0], [-13, -22], [13, -22], [-13, 22], [13, 22]].map(function (p) { return '<polygon points="' + Art.hexPts(p[0], p[1], 14, 30) + '" fill="var(--tile-hi)" stroke="var(--tile-stroke)" stroke-width="1.5"/>'; }).join('') + '</svg>';
      }
      return '<div style="font-family:var(--font-display);font-size:20px;color:var(--gold-hi)">“' + esc(it.name) + '”</div>';
    }
    function boardVars(t) {
      var m = { hex: ['#1a2440', 'rgba(120,150,210,.3)'], void: ['#221538', 'rgba(183,125,255,.4)'], solar: ['#2e2210', 'rgba(255,181,71,.4)'], abyss: ['#0c2c33', 'rgba(93,255,212,.35)'] }[t];
      return '--tile-hi:' + m[0] + ';--tile-stroke:' + m[1];
    }
    var sections = [['skin', 'Stone skins'], ['board', 'Arenas'], ['title', 'Titles']];
    $('screen-collection').innerHTML = '<div class="page"><div class="page-head"><div><div class="kicker">Spend Essence</div><h1>Collection</h1></div><div class="essence" style="font-size:18px"><span class="ess-icon"></span><b>' + P.essence + '</b></div></div>' +
      sections.map(function (sec) {
        return '<div class="panel"><h3>' + sec[1] + '</h3><div class="shop-grid">' + R.SHOP.filter(function (x) { return x.kind === sec[0]; }).map(function (it) {
          var owned = P.owned.indexOf(it.id) !== -1, eq = P.equipped[it.kind] === it.id;
          var btn = eq ? '<button class="btn small" disabled>Equipped</button>' : owned ? '<button class="btn small" data-eq="' + it.id + '">Equip</button>'
            : '<button class="btn gold small" data-buy="' + it.id + '"' + (P.essence < it.price ? ' disabled' : '') + '><span class="ess-icon"></span> ' + it.price + '</button>';
          return '<div class="shop-item' + (eq ? ' equipped' : '') + '"><div class="prev">' + preview(it) + '</div><div class="nm">' + esc(it.name) + '</div>' + btn + '</div>';
        }).join('') + '</div></div>';
      }).join('') + '</div>';
    $('screen-collection').onclick = function (e) {
      var b = e.target.closest('[data-buy],[data-eq]'); if (!b) return;
      var id = b.getAttribute('data-buy') || b.getAttribute('data-eq'), it = R.SHOP.filter(function (x) { return x.id === id; })[0];
      if (b.hasAttribute('data-buy')) {
        if (P.essence < it.price) return;
        P.essence -= it.price; P.owned.push(id); sfx('rune'); toast('Unlocked <b>' + esc(it.name) + '</b>');
      } else sfx('click');
      P.equipped[it.kind] = id; R.save(P); RENDER.collection();
    };
  };

  // ---------------------------------------------------------------------------------------------
  // How to play
  // ---------------------------------------------------------------------------------------------
  RENDER.learn = function () {
    renderTopbar();
    $('screen-learn').innerHTML = '<div class="page learn"><div class="page-head"><div><div class="kicker">60-second guide</div><h1>How to play YAJA</h1></div><button class="btn gold" data-go="home">Let’s play</button></div>' +
      '<div class="panel rule"><div>' + miniBoardSvg('capture') + '</div><div><h2>1 · Sandwich to capture</h2><p>Place a stone so that one or more straight lines of enemy stones are trapped between it and another of your stones. Every trapped stone flips to your colour. Six directions on a hex board means big multi-line combos: <b>DOUBLE</b>, <b>TRIPLE</b>… all the way to the legendary <b>HEXAFLIP</b>. You must capture to place; if you can’t, you pass (and earn +' + E.PASS_CHARGE + ' charge).</p></div></div>' +
      '<div class="panel rule"><div>' + miniBoardSvg('corner') + '</div><div><h2>2 · Corners and Runes</h2><p>The six <b>corners</b> can never be flipped — they’re anchors. The three golden <b>Runes</b> are objectives: claiming one gives +' + E.RUNE_CHARGE + ' charge, holding it gives +' + E.RUNE_TICK + ' charge every turn, and each Rune you hold at the end is worth +' + E.RUNE_BONUS_SCORE + ' points.</p></div></div>' +
      '<div class="panel rule"><div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:center">' + E.CHAMP_IDS.map(function (id) { return Art.sigil(id, 40); }).join('') + '</div><div><h2>3 · Champions & Ultimates</h2><p>Pick a champion before each match. Every stone you flip charges your Ultimate (a full meter caps — no banking). Press <kbd>R</kbd> or click the Ultimate button, then pick a target. Casting is your whole turn. When 6 or fewer hexes remain, the <b>Final Phase</b> seals all Ultimates.</p>' +
      '<ul>' + E.CHAMP_IDS.map(function (id) { var c = E.CHAMPIONS[id]; return '<li><b style="color:' + c.color + '">' + c.name + ' — ' + c.ult + '</b> (' + c.cost + '): ' + c.desc + '</li>'; }).join('') + '</ul></div></div>' +
      '<div class="panel rule"><div>' + Art.emblem({ tier: 3, div: 2, lp: 0 }, 110) + '</div><div><h2>4 · Climb</h2><p>Score = your stones + Rune bonuses. Win to earn LP. Five placement games set your starting rank, then climb Iron → Bronze → Silver → Gold → Platinum → Emerald → Diamond → Master → Grandmaster → Challenger. At 100 LP in division I you play a single <b>Ascension match</b> to enter the next tier. Hidden MMR decides how much LP each game is worth. Splits last two weeks, then there’s a soft reset.</p>' +
      '<p>You get ' + 10 + 's per move plus a 45s reserve. Run out and autopilot moves for you — three timeouts is a forfeit.</p></div></div></div>';
  };
  function miniBoardSvg(kind) {
    var cells = kind === 'capture'
      ? [[0, 0, 1, 1], [1, 0, 2, 1], [2, 0, 2, 1], [3, 0, 0, 2]]
      : [[0, 0, 1, 3], [1, 0, 0, 0], [0, 1, 0, 0], [1, -1, 0, 4]];
    var S = 16, SQ = Math.sqrt(3);
    return '<svg viewBox="-20 -40 130 80" width="120" aria-hidden="true">' + cells.map(function (c) {
      var x = S * SQ * (c[0] + c[1] / 2), y = S * 1.5 * c[1];
      var stone = c[2] ? '<circle cx="' + x + '" cy="' + y + '" r="10" fill="' + (c[2] === 1 ? '#3ab0ff' : '#ff3b5c') + '"' + (c[3] === 1 ? ' stroke="#fff" stroke-width="2"' : '') + '/>' : '';
      var ghost = c[3] === 2 ? '<circle cx="' + x + '" cy="' + y + '" r="10" fill="#3ab0ff" opacity=".45"/><text x="' + x + '" y="' + (y - 16) + '" fill="#fff" font-size="10" text-anchor="middle">+2</text>' : '';
      var tileStroke = c[3] === 3 ? '#c8aa6e' : c[3] === 4 ? '#f5d77a' : 'rgba(120,150,210,.3)';
      return '<polygon points="' + Art.hexPts(x, y, S - 1, 30) + '" fill="#141d33" stroke="' + tileStroke + '" stroke-width="1.5"/>' + stone + ghost +
        (c[3] === 4 ? '<g transform="translate(' + x + ',' + y + ') scale(.7)" style="color:#f5d77a">' + Art.runeGlyph() + '</g>' : '');
    }).join('') + '</svg>';
  }

  // ---------------------------------------------------------------------------------------------
  // Daily puzzle
  // ---------------------------------------------------------------------------------------------
  function dailyPuzzle() {
    var day = R.dayNumber();
    if (app.puzzle && app.puzzle.day === day) return app.puzzle;
    var deep = { depth: 3, noise: 0, blunder: 0, ultCap: 0, ultShy: 0, endgame: 0, budget: 1e9, style: AI.DEFAULT_STYLE };
    var prof = AI.profileFor(2200), pick = null, fallback = null;
    // Deterministic per day: try seeds in order until a position has one clearly best move.
    for (var attempt = 0; attempt < 12 && !pick; attempt++) {
      var rnd = R.rng(day * 7919 + 17 + attempt * 104729);
      var s = E.createGame({ champ1: E.CHAMP_IDS[Math.floor(rnd() * 5)], champ2: E.CHAMP_IDS[Math.floor(rnd() * 5)], runeLayout: Math.floor(rnd() * 4), first: 1 + Math.floor(rnd() * 2) });
      var target = 16 + Math.floor(rnd() * 14);
      for (var guard = 0; guard < 80 && !s.over; guard++) {
        if (s.ply >= target && E.legalPlacements(s).length >= 4) {
          var t = E.clone(s); t.charge = [0, 0, 0];
          var sc = AI.scoreActions(t, deep);
          if (!fallback) fallback = { state: t, scores: sc };
          if (sc[0].value - sc[1].value >= 3) { pick = { state: t, scores: sc }; break; }
        }
        s = E.applyAction(s, AI.chooseAction(s, prof, rnd)).state;
      }
    }
    pick = pick || fallback;
    var vals = pick.scores.map(function (x) { return x.value; });
    app.puzzle = { day: day, n: day - 20600, state: pick.state, scores: pick.scores, best: pick.scores[0].action.cell, max: vals[0], min: vals[vals.length - 1] };
    return app.puzzle;
  }
  function renderPuzzleCard() {
    var st = P.puzzle, today = R.dayNumber(), doneToday = st.day === today && st.done;
    var tries = st.day === today ? st.tries : [];
    var row = '';
    for (var i = 0; i < 3; i++) row += '<i class="' + (tries[i] ? 'pz-' + tries[i] : '') + '">' + (tries[i] === 'g' ? '✓' : '') + '</i>';
    $('puzzleCard').innerHTML = '<h3>Daily puzzle</h3><div class="pz-day">Find the killer move</div><div class="muted" style="font-size:13px">Same position for everyone today. Three tries.</div>' +
      '<div class="pz-row">' + row + '</div><div style="display:flex;justify-content:space-between;align-items:center"><span class="muted">Streak <b style="color:var(--gold-hi)">' + st.streak + '</b></span>' +
      '<button class="btn small ' + (doneToday ? '' : 'gold') + '" data-go="puzzle">' + (doneToday ? 'View' : tries.length ? 'Continue' : 'Solve') + '</button></div>';
  }
  RENDER.puzzle = function () {
    renderTopbar();
    var el = $('screen-puzzle');
    el.innerHTML = '<div class="page"><div class="page-head"><div><div class="kicker">Daily puzzle</div><h1>Generating today’s position<span class="loading-dots"></span></h1></div></div></div>';
    setTimeout(function () {
      var pz = dailyPuzzle(), st = P.puzzle, today = R.dayNumber();
      if (st.day !== today) { st.day = today; st.done = false; st.tries = []; R.save(P); }
      var side = pz.state.turn, col = side === 1 ? 'Azure' : 'Crimson';
      el.innerHTML = '<div class="page"><div class="page-head"><div><div class="kicker">Daily puzzle #' + pz.n + '</div><h1>You play ' + col + '. Find the strongest move.</h1></div><button class="btn" data-go="home">Back</button></div>' +
        '<div class="review-grid"><div class="panel"><div class="review-board" id="pzBoard"></div></div><div class="panel"><h3>Tries</h3><div class="pz-row" id="pzRow" style="display:flex;gap:6px"></div>' +
        '<p class="muted" id="pzMsg">Hover a hex to preview captures. Green = the engine’s best move, yellow = close, red = not it. Ultimates are off.</p>' +
        '<div class="actions" style="justify-content:flex-start"><button class="btn gold" id="pzShare" style="display:none">Copy result</button></div></div></div></div>';
      var bv = new Y.BoardView($('pzBoard'), { click: function (i) { guess(i); } });
      bv.setSkin(P.equipped.skin);
      bv.render(pz.state, { last: -1 });
      function paint() {
        var row = '';
        for (var i = 0; i < 3; i++) row += '<i class="' + (st.tries[i] ? 'pz-' + st.tries[i] : '') + '" style="width:36px;height:36px;border:1px solid var(--line);display:grid;place-items:center;font-style:normal">' + (st.tries[i] === 'g' ? '✓' : '') + '</i>';
        $('pzRow').innerHTML = row;
        if (st.done) {
          bv.setInteractive(false);
          bv.pulseCells([pz.best], 'flash');
          var solved = st.tries[st.tries.length - 1] === 'g';
          $('pzMsg').innerHTML = (solved ? '<b class="good">Solved!</b> ' : '<b class="bad">Out of tries.</b> ') + 'The best move is highlighted. Come back tomorrow for a new one.';
          $('pzShare').style.display = '';
          bv.render(E.applyAction(pz.state, { type: 'place', cell: pz.best }).state, { last: pz.best });
        } else bv.setInteractive(true, side, 'place');
      }
      function guess(i) {
        if (st.done) return;
        var sc = pz.scores.filter(function (x) { return x.action.cell === i; })[0]; if (!sc) return;
        var k = (pz.max - pz.min) ? (pz.max - sc.value) / (pz.max - pz.min) : 0;
        var g = i === pz.best || sc.value >= pz.max - 0.01 ? 'g' : k <= 0.25 ? 'y' : 'r';
        st.tries.push(g);
        sfx(g === 'g' ? 'rune' : g === 'y' ? 'flip' : 'warn', 3);
        if (g !== 'g') bv.nudge(i);
        if (g === 'g' || st.tries.length >= 3) {
          st.done = true;
          if (g === 'g') {
            st.streak = st.lastSolvedDay === today - 1 ? st.streak + 1 : 1; st.lastSolvedDay = today;
            P.essence += 40; toast('Puzzle solved — <b>+40 Essence</b>');
            Y.FX.confetti('#5dffb0', '#f5d77a');
          }
        }
        R.save(P); paint();
      }
      $('pzShare').onclick = function () {
        var txt = 'YAJA Daily #' + pz.n + ' ' + st.tries.map(function (t) { return t === 'g' ? '🟩' : t === 'y' ? '🟨' : '🟥'; }).join('') + ' · streak ' + st.streak + '\n' + location.href.split('?')[0];
        (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(function () { toast('Result copied — share it!'); }, function () { toast(esc(txt)); });
      };
      paint();
    }, 30);
  };

  // ---------------------------------------------------------------------------------------------
  // Online duels (WebRTC)
  // ---------------------------------------------------------------------------------------------
  function queueDialog(title, body, onCancel) {
    var o = overlay('queueOverlay', '<div class="dialog queue"><div class="kicker">Online duel</div><h2 style="margin:6px 0 18px">' + title + '</h2>' +
      '<div class="spin"><div class="ic">' + myAvatar(56) + '</div></div><div id="qBody">' + body + '</div>' +
      '<div class="actions" style="justify-content:center"><button class="btn ghost" id="qCancel">Cancel</button></div></div>');
    $('qCancel').onclick = function () { overlay('queueOverlay', null); onCancel(); };
    return o;
  }
  function startQuickMatch() {
    var t0 = Date.now(), iv, handle, offered = false;
    queueDialog('Searching for a player', '<div class="qtime" id="qTime">0:00</div><p class="muted" id="qStat">Connecting…</p><div id="qOffer"></div>', function () { clearInterval(iv); if (handle) handle.cancel(); });
    iv = setInterval(function () {
      var s = Math.floor((Date.now() - t0) / 1000), q = $('qTime');
      if (q) q.textContent = Math.floor(s / 60) + ':' + ('0' + s % 60).slice(-2);
      if (s >= 25 && !offered && $('qOffer')) {
        offered = true;
        $('qOffer').innerHTML = '<p class="muted">Nobody else is queueing right now. Keep waiting, share a room with a friend, or climb Ranked while you wait.</p><button class="btn small" id="qRanked">Play Ranked instead</button>';
        $('qRanked').onclick = function () { clearInterval(iv); handle.cancel(); overlay('queueOverlay', null); app.mode = 'ranked'; renderModes(); startRankedQueue(); };
      }
    }, 250);
    handle = Net.quickMatch(function (ch) { clearInterval(iv); onChannel(ch); },
      function (st) { var e = $('qStat'); if (e) e.textContent = st; },
      function (err) { clearInterval(iv); overlay('queueOverlay', null); toast(esc(err)); });
  }
  function startHostRoom() {
    var handle = null;
    queueDialog('Creating room', '<p class="muted" id="qStat">Contacting the signalling server…</p>', function () { if (handle) handle.cancel(); if (peer) peer.destroy(); });
    var peer = Net.hostRoom(function (info) {
      handle = info;
      var link = Net.inviteLink(info.code);
      var b = $('qBody'); if (!b) return;
      b.innerHTML = '<p class="muted">Share this code with a friend:</p><div style="font-size:44px;font-weight:700;letter-spacing:.3em;color:var(--gold-hi)">' + info.code + '</div>' +
        '<div class="actions" style="justify-content:center;margin-top:10px"><button class="btn small" id="copyLink">Copy invite link</button></div><p class="muted" style="font-size:12px">Waiting for your opponent<span class="loading-dots"></span></p>';
      $('copyLink').onclick = function () { (navigator.clipboard ? navigator.clipboard.writeText(link) : Promise.reject()).then(function () { toast('Invite link copied'); }, function () { toast(esc(link)); }); };
    }, function (ch) { onChannel(ch); }, function (err) { overlay('queueOverlay', null); toast(esc(err)); });
  }
  function startJoinRoom(code) {
    code = String(code || '').trim().toUpperCase();
    if (code.length < 4) { toast('Enter the 5-letter room code.'); return; }
    var h = Net.joinRoom(code, function (ch) { onChannel(ch); }, function (err) { overlay('queueOverlay', null); toast(esc(err)); });
    queueDialog('Joining room ' + esc(code), '<p class="muted">Connecting to your friend…</p>', function () { h.cancel(); });
  }

  function onChannel(ch) {
    leaveOnline();
    var on = app.online = { ch: ch, isHost: ch.isHost, opp: null, sentHello: false, rematch: { me: false, them: false } };
    var b = $('qBody'); if (b) b.innerHTML = '<p class="muted">Connected! Handshaking…</p>';
    ch.on('msg', function (m) { onNetMsg(m); });
    ch.on('close', function () {
      if (app.online !== on) return;
      if (app.match && !app.match.ended) { toast('Opponent disconnected — you win.'); app.match.forfeit(3 - app.match.me); }
      else { toast('Opponent left.'); if (app.screen === 'select' || app.screen === 'vs') { clearInterval(app.selectTimer); go('home'); } }
      overlay('queueOverlay', null);
      app.online = null;
    });
    ch.send({ t: 'hello', proto: Net.PROTO, name: P.name, avatar: P.avatar, duel: P.duel.rating, rankLabel: P.rank ? R.rankName(P.rank) : 'Unranked' });
  }
  function leaveOnline() {
    if (app.online) { try { app.online.ch.send({ t: 'bye' }); } catch (e) { /* ignore */ } var ch = app.online.ch; app.online = null; setTimeout(function () { ch.close(); }, 200); }
  }
  function hostSetup() {
    var on = app.online;
    var setup = { t: 'setup', first: Math.random() < 0.5 ? 1 : 2, runeLayout: Math.floor(Math.random() * E.RUNE_LAYOUTS.length) };
    on.ch.send(setup);
    beginOnlineSelect(setup);
  }
  function beginOnlineSelect(setup) {
    var on = app.online;
    overlay('queueOverlay', null); overlay('resultOverlay', null);
    if (app.match) { app.match.destroy(); app.match = null; }
    on.rematch = { me: false, them: false };
    var ctx = { kind: 'duel', opp: on.opp, side: on.isHost ? 1 : 2, first: setup.first, runeLayout: setup.runeLayout };
    sfx('queuePop');
    startSelect(ctx);
    if (on.earlyPick) { var ep = on.earlyPick; on.earlyPick = null; onNetMsg(ep); }
  }
  function onNetMsg(m) {
    var on = app.online; if (!on) return;
    if (m.t === 'hello') {
      if (m.proto !== Net.PROTO) { toast('Your opponent runs a different game version.'); leaveOnline(); overlay('queueOverlay', null); return; }
      on.opp = { name: String(m.name || 'Opponent').slice(0, 16), avatar: +m.avatar || 0, duel: +m.duel || 1200, rankLabel: String(m.rankLabel || '').slice(0, 24) };
      if (on.isHost) hostSetup();
    } else if (m.t === 'setup') {
      if (!on.isHost && on.opp) beginOnlineSelect(m);
    } else if (m.t === 'pick') {
      var sel = app.select;
      if (!sel || !sel.ctx || sel.ctx.kind !== 'duel') { on.earlyPick = m; return; }
      if (E.CHAMP_IDS.indexOf(m.champ) === -1) return;
      sel.oppPick = m.champ; sel.oppLocked = true; sel.renderOpp(); sel.maybeProceed();
    } else if (m.t === 'act' || m.t === 'emote') {
      if (app.match) app.match.onRemote(m);
    } else if (m.t === 'resign') {
      if (app.match && !app.match.ended) { toast('Opponent surrendered.'); app.match.forfeit(3 - app.match.me); }
    } else if (m.t === 'rematch') {
      on.rematch.them = true;
      toast(esc(on.opp.name) + ' wants a rematch!');
      var b = $('rAgain'); if (b) b.textContent = 'Accept rematch';
      if (on.rematch.me && on.isHost) hostSetup();
    } else if (m.t === 'bye') {
      toast('Opponent left the room.');
    }
  }
  function requestRematch() {
    var on = app.online;
    if (!on) { toast('Your opponent has left.'); go('home'); return; }
    on.rematch.me = true;
    on.ch.send({ t: 'rematch' });
    queueDialog('Rematch', '<p class="muted">Waiting for ' + esc(on.opp.name) + '…</p>', function () { leaveOnline(); go('home'); });
    if (on.rematch.them && on.isHost) hostSetup();
  }

  // ---------------------------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------------------------
  function boot() {
    Y.ensureDefs();
    // A ranked match that was abandoned (tab closed / refreshed) counts as a loss.
    if (P.activeMatch) {
      var am = P.activeMatch;
      R.recordMatch(P, { mode: 'ranked', ranked: true, won: false, draw: false, champ: am.champ, oppChamp: am.oppChamp, oppName: am.oppName, oppId: am.oppId,
        oppRating: am.oppRating, nemesis: false, score: [0, 0], bestMove: 0, maxLines: 0, runesEnd: 0, ults: 0, cornersEnd: 0, margin: 0, flipped: 0 });
      P.notices.push('You left a ranked match against ' + esc(am.oppName) + '. It counted as a loss.');
      R.save(P);
    }
    renderTopbar();
    go('home');
    (P.notices || []).forEach(function (n, i) { setTimeout(function () { toast(n); }, 600 + i * 900); });
    P.notices = []; R.save(P);
    var q = new URLSearchParams(location.search);
    var room = q.get('room');
    if (room && Net.available()) {
      app.mode = 'online'; renderModes();
      history.replaceState(null, '', location.pathname);
      startJoinRoom(room);
    } else if (!P.tutorialSeen) {
      P.tutorialSeen = true; R.save(P);
      var o = overlay('modal', '<div class="dialog"><div class="kicker">Welcome, ' + esc(P.name) + '</div><h2>Hex. Flip. Climb.</h2>' +
        '<p>YAJA is a 3-minute duel on a hex board. Trap enemy lines to flip them, charge your champion’s Ultimate, and climb from Iron to Challenger.</p>' +
        '<p class="muted">Start with a relaxed training match against Pebble. A coach will explain as you go, and nothing is on the line.</p>' +
        '<div class="actions"><button class="btn ghost" data-x="learn">Read the rules</button><button class="btn gold" data-x="play">Start training</button></div></div>');
      o.onclick = function (e) {
        var b = e.target.closest('[data-x]'); if (!b) return;
        overlay('modal', null);
        if (b.getAttribute('data-x') === 'learn') go('learn'); else startTutorial();
      };
    }
    // Refresh the split timer now and then.
    setInterval(function () { if (app.screen === 'home') renderRankCard(); }, 60000);
  }
  // Test hook (used by automated checks; harmless in production).
  root.YAJA.app = app;
  root.YAJA.debug = { profile: function () { return P; }, go: go, startSelect: startSelect, setProfile: function (p) { P = p; R.save(P); } };
  boot();
})(window);
