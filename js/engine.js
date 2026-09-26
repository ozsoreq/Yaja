/* YAJA engine — pure game rules. No DOM. Works in browser (window.YAJA.Engine) and Node (module.exports). */
(function (root) {
  'use strict';

  var RADIUS = 4;
  var DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

  // ---- Geometry -----------------------------------------------------------
  var CELLS = [];          // [{q, r, i}]
  var INDEX = {};          // "q,r" -> i
  for (var q = -RADIUS; q <= RADIUS; q++) {
    for (var r = -RADIUS; r <= RADIUS; r++) {
      if (Math.abs(q + r) > RADIUS) continue;
      INDEX[q + ',' + r] = CELLS.length;
      CELLS.push({ q: q, r: r, i: CELLS.length });
    }
  }
  var N = CELLS.length; // 61

  function idx(q, r) { var k = INDEX[q + ',' + r]; return k === undefined ? -1 : k; }
  function ringOf(i) { var c = CELLS[i]; return Math.max(Math.abs(c.q), Math.abs(c.r), Math.abs(c.q + c.r)); }

  var RAYS = [];       // RAYS[i][d] = [cells along direction d, nearest first]
  var NEIGHBORS = [];  // NEIGHBORS[i] = [adjacent cells]
  CELLS.forEach(function (c) {
    var rays = [], nb = [];
    DIRS.forEach(function (d) {
      var ray = [], q = c.q + d[0], r = c.r + d[1], k;
      while ((k = idx(q, r)) !== -1) { ray.push(k); q += d[0]; r += d[1]; }
      rays.push(ray);
      if (ray.length) nb.push(ray[0]);
    });
    RAYS.push(rays);
    NEIGHBORS.push(nb);
  });
  var RING = CELLS.map(function (c) { return ringOf(c.i); });
  var CORNERS = CELLS.filter(function (c) { return RING[c.i] === RADIUS && NEIGHBORS[c.i].length === 3; }).map(function (c) { return c.i; });

  // Mirrored rune layouts (3 runes each, 120° symmetric so neither side is favoured).
  var RUNE_LAYOUTS = [
    [idx(2, -4), idx(2, 2), idx(-4, 2)],
    [idx(-2, 4), idx(-2, -2), idx(4, -2)],
    [idx(3, -1), idx(-2, 3), idx(-1, -2)],
    [idx(1, -3), idx(2, 1), idx(-3, 2)]
  ];

  // ---- Champions ----------------------------------------------------------
  // target: 'empty' (any empty non-corner) | 'blast' (area) | 'rally' / 'own' (one of your stones) | 'none'
  var CHAMPIONS = {
    vex:   { id: 'vex',   name: 'Vex',   role: 'Demolitionist', color: '#ff5d73', ult: 'Detonate',    cost: 20, target: 'blast',
             desc: 'Blast a 7-hex area. Enemy stones are destroyed and the craters are scorched (unplayable) for 2 turns.' },
    aegis: { id: 'aegis', name: 'Aegis', role: 'Warden',        color: '#4dd6ff', ult: 'Bastion',     cost: 32, target: 'own',
             desc: 'Pick one of your stones: it and every allied stone touching it become permanently unflippable.' },
    nyx:   { id: 'nyx',   name: 'Nyx',   role: 'Assassin',      color: '#b77dff', ult: 'Shadow Step', cost: 28, target: 'empty',
             desc: 'Slip a stone onto any empty hex (except corners and Runes), even with no capture. It still captures lines.' },
    kael:  { id: 'kael',  name: 'Kael',  role: 'Warlord',       color: '#ffb547', ult: 'Rally',       cost: 22, target: 'rally',
             desc: 'Pick one of your stones: every adjacent enemy stone (except corners) defects to you.' },
    mira:  { id: 'mira',  name: 'Mira',  role: 'Chronomancer',  color: '#5dffb0', ult: 'Rewind',      cost: 16, target: 'none',
             desc: 'Erase your opponent\u2019s last move from time, then take your turn. An erased Ultimate stays spent.' }
  };
  var CHAMP_IDS = Object.keys(CHAMPIONS);

  var RUNE_BONUS_SCORE = 3;   // per rune held at game end
  var RUNE_CHARGE = 3;        // first time you claim a rune
  var RUNE_TICK = 1;          // per rune held, at the start of your turn
  var PASS_CHARGE = 3;        // forced pass consolation
  var FINAL_PHASE = 6;        // ults are locked when this many (or fewer) hexes are empty
  var SCORCH_PLIES = 2;       // Vex craters stay unplayable for this many plies after the cast

  // ---- State --------------------------------------------------------------
  function opp(p) { return 3 - p; }

  function createGame(opts) {
    opts = opts || {};
    var board = new Array(N).fill(0);
    var locked = new Array(N).fill(0);
    // Six stones alternating around the centre.
    var start = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
    start.forEach(function (d, k) { board[idx(d[0], d[1])] = (k % 2) + 1; });
    var layout = RUNE_LAYOUTS[(opts.runeLayout == null ? 0 : opts.runeLayout) % RUNE_LAYOUTS.length];
    return {
      board: board,
      locked: locked,
      scorch: new Array(N).fill(0),     // ply number until which a cell is unplayable
      runes: layout.slice(),
      runeClaimed: [null, [], []],      // runes each player has ever placed on (for charge bonus)
      champ: [null, opts.champ1 || 'vex', opts.champ2 || 'aegis'],
      charge: [0, 0, 0],
      ultUsed: [0, 0, 0],
      turn: opts.first || 1,
      movesLeft: 1,                     // >1 during Echo / after Shadow Step
      passes: 0,
      ply: 0,
      over: false,
      winner: 0,
      forfeit: 0,
      stats: [null, blankStats(), blankStats()],
      undo: null,
      log: []
    };
  }
  function blankStats() { return { flipped: 0, bestMove: 0, runes: 0, ults: 0, moves: 0 }; }

  function clone(s) {
    return {
      board: s.board.slice(), locked: s.locked.slice(), scorch: s.scorch.slice(), runes: s.runes,
      runeClaimed: [null, s.runeClaimed[1].slice(), s.runeClaimed[2].slice()],
      champ: s.champ, charge: s.charge.slice(), ultUsed: s.ultUsed.slice(),
      turn: s.turn, movesLeft: s.movesLeft, passes: s.passes, ply: s.ply,
      over: s.over, winner: s.winner, forfeit: s.forfeit,
      stats: [null, Object.assign({}, s.stats[1]), Object.assign({}, s.stats[2])],
      undo: s.undo,
      log: s.log
    };
  }

  // Lines captured by placing p at i. Returns array of lines (each an array of cells, nearest first).
  function captureLines(board, locked, i, p, fromStone) {
    if (board[i] !== 0 && !fromStone) return [];
    var o = opp(p), lines = [];
    for (var d = 0; d < 6; d++) {
      var ray = RAYS[i][d], run = [], ok = false;
      for (var k = 0; k < ray.length; k++) {
        var c = ray[k], v = board[c];
        if (v === o && !locked[c]) { run.push(c); continue; }
        if (v === p && run.length) ok = true;
        break;
      }
      if (ok) lines.push(run);
    }
    return lines;
  }
  function flipsFor(board, locked, i, p) {
    var n = 0, lines = captureLines(board, locked, i, p);
    for (var k = 0; k < lines.length; k++) n += lines[k].length;
    return n;
  }

  function legalPlacements(s, p) {
    p = p || s.turn;
    var out = [];
    for (var i = 0; i < N; i++) if (s.board[i] === 0 && s.scorch[i] <= s.ply && flipsFor(s.board, s.locked, i, p) > 0) out.push(i);
    return out;
  }
  function emptyCount(s) { var n = 0; for (var i = 0; i < N; i++) if (!s.board[i]) n++; return n; }
  function finalPhase(s) { return emptyCount(s) <= FINAL_PHASE; }
  function isCorner(i) { return CORNERS.indexOf(i) !== -1; }

  function canUlt(s, p) {
    p = p || s.turn;
    var ch = CHAMPIONS[s.champ[p]];
    return !s.over && s.charge[p] >= ch.cost && !finalPhase(s) && ultTargets(s, p).length > 0;
  }

  function ultTargets(s, p) {
    p = p || s.turn;
    var ch = CHAMPIONS[s.champ[p]], out = [], i;
    switch (ch.target) {
      case 'empty': for (i = 0; i < N; i++) if (s.board[i] === 0 && s.scorch[i] <= s.ply && !isCorner(i) && s.runes.indexOf(i) === -1) out.push(i); break;
      case 'blast': // Detonate: must hit at least one enemy stone
        for (i = 0; i < N; i++) if (detonateArea(i).some(function (c) { return s.board[c] === opp(p) && !s.locked[c]; })) out.push(i);
        break;
      case 'rally': // Rally: must convert at least one
        for (i = 0; i < N; i++) if (s.board[i] === p && rallyTargets(s, p, i).length) out.push(i);
        break;
      case 'own':   // Bastion: must lock at least one new stone
        for (i = 0; i < N; i++) if (s.board[i] === p && bastionTargets(s, p, i).length) out.push(i);
        break;
      case 'none':  // Rewind: the last action must be an enemy placement/ult (not a pass, not a rewind)
        if (s.undo && s.undo.by === opp(p) && !s.undo.rewind) out.push(-1);
        break;
    }
    return out;
  }
  function detonateArea(i) { return [i].concat(NEIGHBORS[i]); }
  function rallyTargets(s, p, i) { return NEIGHBORS[i].filter(function (c) { return s.board[c] === opp(p) && !s.locked[c] && !isCorner(c); }); }
  function bastionTargets(s, p, i) { return [i].concat(NEIGHBORS[i]).filter(function (c) { return s.board[c] === p && !s.locked[c]; }); }

  // All actions for side to move. Used by AI and validation.
  function legalActions(s) {
    if (s.over) return [];
    var p = s.turn, acts = legalPlacements(s, p).map(function (i) { return { type: 'place', cell: i }; });
    if (canUlt(s, p)) ultTargets(s, p).forEach(function (i) { acts.push({ type: 'ult', cell: i }); });
    if (!acts.length || (acts.every(function (a) { return a.type === 'ult'; }))) acts.push({ type: 'pass' });
    return acts;
  }

  function isLegal(s, a) {
    if (s.over || !a) return false;
    if (a.type === 'pass') return legalPlacements(s).length === 0;
    if (a.type === 'place') return s.board[a.cell] === 0 && s.scorch[a.cell] <= s.ply && flipsFor(s.board, s.locked, a.cell, s.turn) > 0;
    if (a.type === 'ult') return canUlt(s) && ultTargets(s).indexOf(a.cell) !== -1;
    return false;
  }

  // Charge caps at the ult cost: overflow is lost, so there's no banking.
  function gainCharge(s, p, n) { s.charge[p] = Math.min(CHAMPIONS[s.champ[p]].cost, s.charge[p] + n); }

  // Place a stone for p at i, capturing lines. Returns event info.
  function doPlace(s, p, i, lockIt) {
    var lines = captureLines(s.board, s.locked, i, p), flipped = 0;
    s.board[i] = p;
    if (lockIt) s.locked[i] = 1;
    lines.forEach(function (line) { line.forEach(function (c) { s.board[c] = p; }); flipped += line.length; });
    var ev = { cell: i, lines: lines, flipped: flipped, rune: false };
    if (s.runes.indexOf(i) !== -1 && s.runeClaimed[p].indexOf(i) === -1) {
      s.runeClaimed[p].push(i);
      gainCharge(s, p, RUNE_CHARGE);
      s.stats[p].runes++;
      ev.rune = true;
    }
    return ev;
  }

  // Apply action; returns { state, events }. Does not mutate input.
  function applyAction(s0, a) {
    var s = clone(s0), p = s.turn, o = opp(p), ev = { player: p, action: a, flipped: 0, lines: [], removed: [], converted: [], locked: [], rune: false };
    // Snapshot for Mira's Rewind: the board as it was before this action.
    s.undo = a.type === 'pass' ? null : {
      by: p, rewind: a.type === 'ult' && s.champ[p] === 'mira', ult: a.type === 'ult',
      board: s0.board, locked: s0.locked, scorch: s0.scorch, runeClaimed: s0.runeClaimed[p], charge: s0.charge[p]
    };
    if (a.type === 'pass') {
      s.passes++;
      s.movesLeft = 1;
      ev.pass = true;
      gainCharge(s, p, PASS_CHARGE);
    } else if (a.type === 'place') {
      var r = doPlace(s, p, a.cell, false);
      ev.flipped = r.flipped; ev.lines = r.lines; ev.rune = r.rune;
      gainCharge(s, p, r.flipped);
      s.passes = 0;
    } else if (a.type === 'ult') {
      var ch = CHAMPIONS[s.champ[p]];
      s.charge[p] -= ch.cost;
      s.ultUsed[p]++;
      s.stats[p].ults++;
      ev.ult = ch.id;
      s.passes = 0;
      if (ch.id === 'vex') {
        detonateArea(a.cell).forEach(function (c) {
          if (s.board[c] === o && !s.locked[c]) { s.board[c] = 0; s.scorch[c] = s.ply + 1 + SCORCH_PLIES; ev.removed.push(c); }
        });
      } else if (ch.id === 'aegis') {
        bastionTargets(s, p, a.cell).forEach(function (c) { s.locked[c] = 1; ev.locked.push(c); });
      } else if (ch.id === 'nyx') {
        var rn = doPlace(s, p, a.cell, false);
        ev.flipped = rn.flipped; ev.lines = rn.lines; ev.rune = rn.rune;
      } else if (ch.id === 'kael') {
        rallyTargets(s, p, a.cell).forEach(function (c) { s.board[c] = p; ev.converted.push(c); });
      } else if (ch.id === 'mira') {
        var u = s0.undo;
        ev.rewound = { board: s.board.slice() };
        s.board = u.board.slice(); s.locked = u.locked.slice(); s.scorch = u.scorch.slice();
        s.runeClaimed[o] = u.runeClaimed.slice();
        // Victim loses whatever the erased move earned them; an erased Ultimate stays spent.
        s.charge[o] = Math.max(0, u.charge - (u.ult ? CHAMPIONS[s.champ[o]].cost : 0));
        s.movesLeft = 2; // after rewinding, Mira still gets her move
      }
    }
    if (ev.flipped) {
      s.stats[p].flipped += ev.flipped;
      if (ev.flipped > s.stats[p].bestMove) s.stats[p].bestMove = ev.flipped;
    }
    ev.flipped = ev.flipped + ev.converted.length;
    if (a.type !== 'pass') s.stats[p].moves++;
    s.ply++;

    // Turn handover
    s.movesLeft--;
    if (s.movesLeft > 0 && legalActions(Object.assign({}, s, { turn: p })).some(function (x) { return x.type === 'place'; })) {
      ev.extraTurn = true;
    } else {
      s.movesLeft = 1;
      s.turn = o;
      var held = runesHeld(s, o);
      if (held) { gainCharge(s, o, held * RUNE_TICK); ev.runeTick = held * RUNE_TICK; }
    }
    ev.lineCount = ev.lines.length;
    checkEnd(s);
    return { state: s, events: ev };
  }

  function checkEnd(s) {
    var empty = 0;
    for (var i = 0; i < N; i++) if (!s.board[i]) empty++;
    var sc = score(s);
    var scorching = s.scorch.some(function (t) { return t > s.ply; });
    if (empty === 0 || (s.passes >= 2 && !scorching) || sc[1] === 0 || sc[2] === 0) finish(s);
  }
  function finish(s) {
    s.over = true;
    var sc = score(s);
    s.winner = sc[1] > sc[2] ? 1 : sc[2] > sc[1] ? 2 : 0;
  }
  function forfeit(s0, loser) {
    var s = clone(s0);
    s.over = true; s.forfeit = loser; s.winner = opp(loser);
    return s;
  }

  function stones(s, p) { var n = 0; for (var i = 0; i < N; i++) if (s.board[i] === p) n++; return n; }
  function runesHeld(s, p) { return s.runes.filter(function (i) { return s.board[i] === p; }).length; }
  function score(s) {
    var a = stones(s, 1), b = stones(s, 2);
    return [0, a + (a ? runesHeld(s, 1) * RUNE_BONUS_SCORE : 0), b + (b ? runesHeld(s, 2) * RUNE_BONUS_SCORE : 0)];
  }

  var Engine = {
    RADIUS: RADIUS, N: N, CELLS: CELLS, RAYS: RAYS, NEIGHBORS: NEIGHBORS, RING: RING, CORNERS: CORNERS,
    RUNE_LAYOUTS: RUNE_LAYOUTS, CHAMPIONS: CHAMPIONS, CHAMP_IDS: CHAMP_IDS,
    RUNE_BONUS_SCORE: RUNE_BONUS_SCORE, RUNE_CHARGE: RUNE_CHARGE, RUNE_TICK: RUNE_TICK, PASS_CHARGE: PASS_CHARGE,
    FINAL_PHASE: FINAL_PHASE, SCORCH_PLIES: SCORCH_PLIES, emptyCount: emptyCount, finalPhase: finalPhase, isCorner: isCorner,
    rallyTargets: rallyTargets, bastionTargets: bastionTargets,
    idx: idx, opp: opp, createGame: createGame, clone: clone, captureLines: captureLines, flipsFor: flipsFor,
    legalPlacements: legalPlacements, legalActions: legalActions, isLegal: isLegal, canUlt: canUlt,
    ultTargets: ultTargets, detonateArea: detonateArea, applyAction: applyAction, forfeit: forfeit,
    score: score, stones: stones, runesHeld: runesHeld
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  root.YAJA = root.YAJA || {};
  root.YAJA.Engine = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
