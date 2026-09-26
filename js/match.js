/* YAJA match controller — runs one game: turns, clocks, input, bots, remote peer, HUD, callouts. */
(function (root) {
  'use strict';
  var Y = root.YAJA, E = Y.Engine, AI = Y.AI, Art = Y.Art;
  var sfx = function (n, a) { Y.Audio.sfx(n, a); };
  var $ = function (id) { return document.getElementById(id); };

  var CLOCK = { ranked: { move: 10, bank: 45 }, duel: { move: 10, bank: 45 }, practice: { move: 30, bank: 120 } };
  var LINE_CALLS = ['', '', 'DOUBLE', 'TRIPLE', 'QUADRA', 'PENTA', 'HEXAFLIP'];
  var EMOTES = [
    { id: 'gg', text: 'GG' }, { id: 'nice', text: 'Nice!' }, { id: 'wow', text: 'Wow' },
    { id: 'oops', text: 'Oops' }, { id: 'think', text: '🤔' }, { id: 'fire', text: '🔥' }
  ];

  function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function sideColor(p) { return p === 1 ? '#3ab0ff' : '#ff3b5c'; }

  function Match(opts) {
    this.o = opts;
    this.mode = opts.mode;
    this.me = opts.mySide || 1;
    this.P = opts.players;
    this.state = E.createGame({ champ1: this.P[1].champ, champ2: this.P[2].champ, runeLayout: opts.runeLayout, first: opts.first });
    this.history = [];
    this.clock = CLOCK[this.mode] || CLOCK.ranked;
    this.bank = [0, this.clock.bank, this.clock.bank];
    this.timeouts = [0, 0, 0];
    this.maxLines = [0, 0, 0];
    this.armed = false;
    this.ended = false;
    this.firstBlood = false;
    this.token = 0;
    this.fast = !!opts.fast;
  }

  Match.prototype.start = function () {
    var self = this;
    var host = $('boardHost');
    this.board = new Y.BoardView(host, {
      click: function (i, mode) { self.onCell(i, mode); },
      illegal: function () { sfx('warn'); }
    });
    this.board.setSkin(this.o.skin);
    document.body.setAttribute('data-board', (this.o.boardTheme || 'board-hex').replace('board-', ''));
    this.board.render(this.state, { last: -1 });
    this.buildHud();
    this.bindKeys();
    var f = this.state.turn;
    this.callout(f === this.me ? 'YOU START' : (this.P[f].name + ' starts').toUpperCase(), '', sideColor(f));
    if (this.P[3 - this.me].kind === 'bot' && Math.random() < 0.5) setTimeout(function () { self.botSay('hello'); }, 900);
    setTimeout(function () { self.nextTurn(); }, 900);
  };

  Match.prototype.destroy = function () {
    this.ended = true;
    this.token++;
    clearInterval(this.tick);
    if (this.keyHandler) document.removeEventListener('keydown', this.keyHandler);
  };

  // ---- HUD --------------------------------------------------------------------------------
  Match.prototype.buildHud = function () {
    var self = this;
    var left = this.me, right = 3 - this.me;
    this.sideEl = {};
    this.sideEl[left] = $('ppLeft');
    this.sideEl[right] = $('ppRight');
    [left, right].forEach(function (p) {
      var pl = self.P[p], ch = E.CHAMPIONS[pl.champ], el = self.sideEl[p];
      el.style.setProperty('--side', sideColor(p));
      el.innerHTML =
        '<div class="card">' +
          '<div class="who">' + pl.avatarHtml + '<div><div class="nm">' + esc(pl.name) + '</div><div class="rk">' + (pl.rankHtml || '') + '</div></div></div>' +
          '<div class="champ-line">' + Art.sigil(pl.champ, 18) + ' ' + ch.name + ' · ' + ch.role + '</div>' +
          '<div class="score"><span class="sv">0</span><small class="sd"></small></div>' +
          '<div class="clock"><span class="mvt">' + self.clock.move + 's</span><div class="mv"><i></i></div><span class="bk"></span></div>' +
        '</div>' +
        '<button class="ult" style="--c:' + ch.color + ';--pct:0" ' + (p === self.me ? '' : 'disabled') + '>' +
          '<div class="ring">' + Art.sigil(pl.champ, 30) + '</div>' +
          '<div><div class="un">' + ch.ult + '</div><div class="uc"></div></div>' + (p === self.me ? '<span class="key">R</span>' : '') +
        '</button>';
      if (p === self.me) el.querySelector('.ult').addEventListener('click', function () { self.toggleUlt(); });
    });
    // Emotes
    var em = $('emotes');
    em.innerHTML = EMOTES.map(function (e) { return '<button data-e="' + e.id + '">' + e.text + '</button>'; }).join('');
    em.onclick = function (e) {
      var b = e.target.closest('button'); if (!b) return;
      self.emote(self.me, b.getAttribute('data-e'), true);
    };
    $('resignBtn').onclick = function () { self.o.confirmResign(function () { self.resign(); }); };
    $('advFill').style.background = 'linear-gradient(90deg, ' + (left === 1 ? '#0b3a73, #3ab0ff' : '#6b0a1d, #ff3b5c') + ')';
    $('advBar').style.background = right === 1 ? '#0b3a73' : '#6b0a1d';
    $('callout').innerHTML = '';
    this.updateHud();
  };

  Match.prototype.updateHud = function () {
    var s = this.state, sc = E.score(s), self = this;
    [1, 2].forEach(function (p) {
      var el = self.sideEl[p], ch = E.CHAMPIONS[s.champ[p]];
      el.classList.toggle('turn', !s.over && s.turn === p);
      el.querySelector('.sv').textContent = sc[p];
      var held = E.runesHeld(s, p);
      el.querySelector('.sd').textContent = E.stones(s, p) + ' stones' + (held ? ' · ' + held + ' rune' + (held > 1 ? 's' : '') : '');
      var u = el.querySelector('.ult');
      var pct = Math.round(100 * s.charge[p] / ch.cost);
      u.style.setProperty('--pct', pct);
      var ready = s.charge[p] >= ch.cost, locked = E.finalPhase(s) && !s.over;
      var can = E.canUlt(s, p);
      u.classList.toggle('ready', ready && can && p === self.me);
      u.classList.toggle('locked-out', ready && locked);
      u.querySelector('.uc').textContent = locked && ready ? 'Sealed (final phase)' : ready ? (can ? 'READY' : 'No targets') : s.charge[p] + ' / ' + ch.cost;
      if (p === self.me && ready && can && !self.announcedReady) { self.announcedReady = true; sfx('ultReady'); }
      if (p === self.me && !ready) self.announcedReady = false;
    });
    var adv = AI.advantage(s, this.me);
    $('advFill').style.width = (50 + adv * 50).toFixed(1) + '%';
    var pt = $('phaseTag'), empties = E.emptyCount(s);
    if (E.finalPhase(s)) { pt.className = 'phase-tag final'; pt.textContent = 'Final phase · ' + empties; }
    else { pt.className = 'phase-tag'; pt.textContent = empties + ' hexes left'; }
    this.renderClocks();
  };

  Match.prototype.renderClocks = function () {
    var s = this.state, self = this;
    [1, 2].forEach(function (p) {
      var el = self.sideEl[p].querySelector('.clock');
      var mine = !s.over && s.turn === p && self.clockRunning;
      var mv = mine ? Math.max(0, self.moveLeft) : self.clock.move;
      el.querySelector('.mvt').textContent = Math.ceil(mv) + 's';
      el.querySelector('.mv i').style.width = (100 * mv / self.clock.move) + '%';
      var b = Math.max(0, self.bank[p]);
      el.querySelector('.bk').textContent = '+' + Math.floor(b / 60) + ':' + ('0' + Math.floor(b % 60)).slice(-2);
      el.classList.toggle('low', mine && mv <= 0 && b < 10);
    });
  };

  // ---- Turn loop -------------------------------------------------------------------------------
  Match.prototype.nextTurn = function () {
    if (this.ended) return;
    var s = this.state, self = this, tk = ++this.token;
    this.updateHud();
    if (s.over) return this.finish();
    var p = s.turn, kind = this.P[p].kind;
    var banner = $('turnBanner');
    if (E.finalPhase(s) && !this.finalAnnounced) {
      this.finalAnnounced = true;
      this.callout('FINAL PHASE', 'Ultimates are sealed', '#ff8a3d');
    }
    this.armed = false;
    this.board.setInteractive(false);
    if (kind === 'human') {
      banner.innerHTML = '<b>Your move</b>' + (this.extraTurn ? ' · again!' : '');
      sfx('turn');
      var places = E.legalPlacements(s, p);
      if (!places.length) {
        if (E.canUlt(s, p)) {
          banner.innerHTML = '<b>No moves</b> — cast your Ultimate or <button class="btn small" id="passBtn">Pass</button>';
          $('passBtn').onclick = function () { self.submit({ type: 'pass' }); };
          this.startClock(p, tk);
        } else {
          banner.innerHTML = '<b>No legal moves</b> — passing';
          this.callout('NO MOVES', 'Pass · +' + E.PASS_CHARGE + ' charge', sideColor(p));
          setTimeout(function () { if (tk === self.token) self.submit({ type: 'pass' }); }, 1100);
        }
        return;
      }
      this.board.setInteractive(true, p, 'place');
      this.startClock(p, tk);
    } else if (kind === 'bot') {
      banner.innerHTML = esc(this.P[p].name) + ' is thinking<span class="loading-dots"></span>';
      this.startClock(p, tk);
      var think = (this.fast ? 250 : 550) + Math.random() * (this.fast ? 300 : 900);
      setTimeout(function () {
        if (tk !== self.token || self.ended) return;
        var a = AI.chooseAction(self.state, self.P[p].botProfile);
        self.submit(a);
      }, think);
    } else if (kind === 'remote') {
      banner.innerHTML = 'Waiting for <b>' + esc(this.P[p].name) + '</b><span class="loading-dots"></span>';
      this.startClock(p, tk);
      if (this.pendingRemote && this.pendingRemote.length) {
        var m = this.pendingRemote.shift();
        setTimeout(function () { self.onRemote(m); }, 0);
      }
    }
  };

  Match.prototype.startClock = function (p, tk) {
    var self = this;
    clearInterval(this.tick);
    this.moveLeft = this.clock.move;
    this.grace = 15; // extra patience for a remote peer before calling them AFK
    this.clockRunning = true;
    var last = performance.now(), warned = false;
    this.tick = setInterval(function () {
      if (tk !== self.token || self.ended) { clearInterval(self.tick); return; }
      var now = performance.now(), dt = (now - last) / 1000; last = now;
      if (self.moveLeft > 0) self.moveLeft -= dt; else self.bank[p] -= dt;
      var kind = self.P[p].kind;
      if (kind === 'human' && self.moveLeft <= 3 && self.moveLeft > 0 && Math.ceil(self.moveLeft) !== self.lastTickSec) { self.lastTickSec = Math.ceil(self.moveLeft); sfx('tick'); }
      if (kind === 'human' && self.moveLeft <= 0 && !warned) { warned = true; sfx('warn'); }
      if (self.bank[p] <= 0) {
        self.bank[p] = 0;
        if (kind === 'human') { clearInterval(self.tick); self.onTimeout(p); }
        else if (kind === 'remote') {
          self.grace -= dt;
          if (self.grace <= 0) { clearInterval(self.tick); if (self.o.onRemoteAfk) self.o.onRemoteAfk(); }
        }
      }
      self.renderClocks();
    }, 100);
  };
  Match.prototype.stopClock = function () { clearInterval(this.tick); this.clockRunning = false; };

  Match.prototype.onTimeout = function (p) {
    this.timeouts[p]++;
    this.bank[p] = Math.min(8, this.clock.bank); // small emergency buffer for following turns
    if (this.timeouts[p] >= 3) { this.toast('Timed out 3 times — forfeit'); return this.forfeit(p); }
    this.callout('TIME!', 'Autopilot move (' + this.timeouts[p] + '/3)', '#ff8a3d');
    this.submit(AI.autopilot(this.state));
  };

  // ---- Input ------------------------------------------------------------------------------------
  Match.prototype.onCell = function (i, mode) {
    if (this.state.turn !== this.me || this.P[this.me].kind !== 'human') return;
    if (mode === 'ult') this.submit({ type: 'ult', cell: i });
    else this.submit({ type: 'place', cell: i });
  };
  Match.prototype.toggleUlt = function () {
    var s = this.state;
    if (s.over || s.turn !== this.me || this.board.busy || this.P[this.me].kind !== 'human') return;
    if (!E.canUlt(s, this.me)) {
      if (E.finalPhase(s)) this.toast('Ultimates are sealed in the final phase.');
      else if (s.charge[this.me] < E.CHAMPIONS[s.champ[this.me]].cost) this.toast('Not charged yet — flip stones and hold Runes to charge.');
      else this.toast('No valid targets right now.');
      return;
    }
    var ch = E.CHAMPIONS[s.champ[this.me]];
    if (ch.target === 'none') { this.submit({ type: 'ult', cell: -1 }); return; }
    this.armed = !this.armed;
    var u = this.sideEl[this.me].querySelector('.ult');
    u.classList.toggle('armed', this.armed);
    this.board.setInteractive(true, this.me, this.armed ? 'ult' : (E.legalPlacements(s, this.me).length ? 'place' : null));
    $('turnBanner').innerHTML = this.armed ? '<b>' + ch.ult + '</b> — choose a target (Esc to cancel)' : '<b>Your move</b>';
    sfx('click');
  };
  Match.prototype.bindKeys = function () {
    var self = this;
    this.keyHandler = function (e) {
      if (e.target && /input|textarea/i.test(e.target.tagName)) return;
      if (e.key === 'r' || e.key === 'R' || e.key === 'q' || e.key === 'Q') self.toggleUlt();
      if (e.key === 'Escape' && self.armed) self.toggleUlt();
    };
    document.addEventListener('keydown', this.keyHandler);
  };

  // ---- Applying actions ------------------------------------------------------------------------------
  Match.prototype.submit = function (a, fromRemote) {
    if (this.ended || this.applying) return false;
    var s = this.state, p = s.turn;
    if (!E.isLegal(s, a)) { if (fromRemote) console.warn('Illegal remote action', a); return false; }
    this.applying = true;
    this.token++;
    this.stopClock();
    this.board.setInteractive(false);
    this.sideEl[this.me].querySelector('.ult').classList.remove('armed');
    if (!fromRemote && this.P[p].kind !== 'remote' && this.o.channel && (this.P[p].kind === 'human')) {
      this.o.channel.send({ t: 'act', ply: s.ply, a: a });
    }
    var res = E.applyAction(s, a), next = res.state, ev = res.events, self = this;
    this.history.push({ state: s, action: a, player: p, ev: ev });
    if (ev.lineCount > this.maxLines[p]) this.maxLines[p] = ev.lineCount;
    var pre = Promise.resolve();
    if (a.type === 'ult') pre = this.ultBanner(p, ev);
    pre.then(function () { return self.board.animate(s, ev, next, { fast: self.fast }); }).then(function () {
      self.state = next;
      self.applying = false;
      self.extraTurn = !!ev.extraTurn;
      self.afterMove(p, a, ev, s, next);
      if (!self.ended) self.nextTurn();
    });
    return true;
  };

  Match.prototype.afterMove = function (p, a, ev, prev, next) {
    var col = sideColor(p);
    if (a.type === 'pass' && this.P[p].kind !== 'human') this.callout('PASS', this.P[p].name + ' has no moves', col);
    var lc = ev.lineCount || 0;
    if (lc >= 2) {
      var call = LINE_CALLS[Math.min(6, lc)];
      this.callout(call, ev.flipped + ' stones', col, lc >= 6);
      if (lc >= 6) { Y.FX.confetti(col, '#f5d77a'); }
    } else if (ev.flipped >= 7) this.callout('SWEEP', ev.flipped + ' stones', col);
    if (ev.rune) this.callout('RUNE CLAIMED', '+' + E.RUNE_CHARGE + ' charge · +' + E.RUNE_BONUS_SCORE + ' at the end', '#f5d77a');
    if (!this.firstBlood && a.type !== 'pass') {
      var corner = E.CORNERS.filter(function (c) { return next.board[c] && !prev.board[c]; })[0];
      if (corner !== undefined) { this.firstBlood = true; this.callout('FIRST BLOOD', 'First corner claimed', col); }
    }
    if (ev.ult === 'mira' && prev.undo && prev.undo.ult) this.callout('SHUTDOWN', 'Ultimate erased from time', col);
    // Bot banter
    var opp = 3 - p;
    if (this.P[opp].kind === 'bot' && (lc >= 3 || ev.flipped >= 7) && Math.random() < 0.6) this.botSay('hurt', opp);
    else if (this.P[p].kind === 'bot' && a.type === 'ult' && Math.random() < 0.7) this.botSay('ult', p);
  };

  Match.prototype.ultBanner = function (p, ev) {
    var ch = E.CHAMPIONS[this.state.champ[p]], g = document.querySelector('.game');
    var b = document.createElement('div');
    b.className = 'ult-banner';
    b.style.setProperty('--cc', ch.color);
    b.innerHTML = Art.sigil(ch.id, 84, '#fff') + '<span class="t">' + ch.ult.toUpperCase() + '</span>';
    g.appendChild(b);
    sfx('ult');
    setTimeout(function () { b.remove(); }, 1300);
    return wait(this.fast ? 450 : 750);
  };

  Match.prototype.callout = function (text, sub, color, big) {
    var c = $('callout');
    var d = document.createElement('div');
    d.style.setProperty('--cc', color || '#3ab0ff');
    d.innerHTML = '<div class="ct"' + (big ? ' style="font-size:clamp(44px,9vw,110px)"' : '') + '>' + esc(text) + '</div>' + (sub ? '<div class="cs">' + esc(sub) + '</div>' : '');
    c.innerHTML = '';
    c.appendChild(d);
    clearTimeout(this.calloutT);
    this.calloutT = setTimeout(function () { if (d.parentNode) d.remove(); }, 1400);
  };

  Match.prototype.toast = function (t) { if (this.o.toast) this.o.toast(t); };

  // ---- Emotes / banter ------------------------------------------------------------------------------
  Match.prototype.emote = function (p, id, local) {
    var e = EMOTES.filter(function (x) { return x.id === id; })[0];
    if (!e) return;
    if (local) {
      var now = Date.now();
      if (this.lastEmote && now - this.lastEmote < 1500) return;
      this.lastEmote = now;
      if (this.o.channel) this.o.channel.send({ t: 'emote', id: id });
    }
    this.bubble(p, e.text);
    sfx('click');
    if (local && this.P[3 - p].kind === 'bot' && Math.random() < 0.5) {
      var self = this;
      setTimeout(function () { self.botSay(id === 'gg' ? 'gg' : 'reply', 3 - p); }, 900 + Math.random() * 800);
    }
  };
  Match.prototype.bubble = function (p, text) {
    var card = this.sideEl[p].querySelector('.card');
    var old = card.querySelector('.bubble'); if (old) old.remove();
    var b = document.createElement('div');
    b.className = 'bubble'; b.textContent = text;
    card.appendChild(b);
    setTimeout(function () { b.remove(); }, 2500);
  };
  Match.prototype.botSay = function (kind, p) {
    p = p || 3 - this.me;
    var bot = this.P[p].bot; if (!bot || this.ended) return;
    var lines = {
      hello: ['gl hf', 'hi!', 'ready?', bot.quip[0]],
      hurt: ['oof', 'nice one', 'hmm', 'wait what', bot.quip[1]],
      ult: [bot.quip[2], bot.quip[0], 'ULT!'],
      gg: ['gg', 'gg wp', 'ggs'],
      reply: bot.quip.concat(['😏', 'lol'])
    }[kind] || bot.quip;
    this.bubble(p, lines[Math.floor(Math.random() * lines.length)]);
  };

  // ---- Remote ------------------------------------------------------------------------------------------
  Match.prototype.onRemote = function (m) {
    if (this.ended) return;
    if (m.t === 'act') {
      var s = this.state;
      if (this.applying || this.P[s.turn].kind !== 'remote') { (this.pendingRemote = this.pendingRemote || []).push(m); return; }
      if (m.ply !== s.ply) { console.warn('Out-of-sync move', m, s.ply); }
      if (this.bank[s.turn] <= 0) this.bank[s.turn] = Math.min(8, this.clock.bank); // mirror their emergency buffer
      if (!this.submit(m.a, true)) this.o.onDesync && this.o.onDesync();
    } else if (m.t === 'emote') this.emote(3 - this.me, m.id, false);
  };

  // ---- End ---------------------------------------------------------------------------------------------
  Match.prototype.resign = function () {
    if (this.ended) return;
    if (this.o.channel) this.o.channel.send({ t: 'resign' });
    this.forfeit(this.me);
  };
  Match.prototype.forfeit = function (loser) {
    if (this.ended) return;
    this.state = E.forfeit(this.state, loser);
    this.finish();
  };
  Match.prototype.finish = function () {
    if (this.ended) return;
    this.ended = true;
    this.token++;
    this.stopClock();
    this.board.setInteractive(false);
    if (this.keyHandler) document.removeEventListener('keydown', this.keyHandler);
    this.updateHud();
    var s = this.state, me = this.me, op = 3 - me, sc = E.score(s);
    var won = s.winner === me, draw = s.winner === 0;
    var P = this.P[op];
    if (P.kind === 'bot' && Math.random() < 0.7) this.botSay('gg', op);
    var summary = {
      state: s, history: this.history, me: me, won: won, draw: draw, forfeit: s.forfeit,
      score: [sc[me], sc[op]],
      champ: s.champ[me], oppChamp: s.champ[op],
      bestMove: s.stats[me].bestMove, maxLines: this.maxLines[me], runesEnd: E.runesHeld(s, me), ults: s.stats[me].ults,
      cornersEnd: E.CORNERS.filter(function (c) { return s.board[c] === me; }).length,
      margin: sc[me] - sc[op], flipped: s.stats[me].flipped
    };
    $('turnBanner').innerHTML = won ? '<b>Victory</b>' : draw ? '<b>Draw</b>' : '<b>Defeat</b>';
    var self = this;
    setTimeout(function () { self.o.onEnd(summary); }, s.forfeit ? 400 : 1300);
  };

  Y.Match = Match;
  Y.EMOTES = EMOTES;
})(window);
