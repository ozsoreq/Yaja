/* YAJA AI — alpha-beta search whose strength and play style scale with a rating + personality. */
(function (root) {
  'use strict';
  var E = root.YAJA && root.YAJA.Engine;
  if (!E && typeof require === 'function') E = require('./engine.js');

  // Positional weights: corners are unflippable anchors; cells next to an empty corner are dangerous.
  var POS = new Array(E.N).fill(1);
  var CORNER_ADJ = {};
  E.CORNERS.forEach(function (c) { E.NEIGHBORS[c].forEach(function (n) { CORNER_ADJ[n] = c; }); });
  for (var i = 0; i < E.N; i++) {
    if (E.CORNERS.indexOf(i) !== -1) POS[i] = 9;
    else if (E.RING[i] === E.RADIUS) POS[i] = 3;
    else if (E.RING[i] === E.RADIUS - 1) POS[i] = 0.5;
  }

  var DEFAULT_STYLE = { corner: 1, mob: 1, mat: 1, rune: 1, charge: 1 };

  function evaluate(s, me, style) {
    style = style || DEFAULT_STYLE;
    var o = E.opp(me);
    if (s.over) {
      var sc = E.score(s), d = sc[me] - sc[o];
      return d > 0 ? 10000 + d : d < 0 ? -10000 + d : 0;
    }
    var empties = 0, pos = 0, mat = 0, k;
    for (k = 0; k < E.N; k++) {
      var v = s.board[k];
      if (!v) { empties++; continue; }
      var w = POS[k];
      if (CORNER_ADJ[k] !== undefined && s.board[CORNER_ADJ[k]] === 0) w = -4;
      if (s.locked[k]) w += 3;
      var sign = v === me ? 1 : -1;
      pos += sign * w;
      mat += sign;
    }
    var phase = empties / E.N;                   // 1 early → 0 late
    var mob = E.legalPlacements(s, me).length - E.legalPlacements(s, o).length;
    var runes = E.runesHeld(s, me) - E.runesHeld(s, o);
    var charge = s.charge[me] / E.CHAMPIONS[s.champ[me]].cost - s.charge[o] / E.CHAMPIONS[s.champ[o]].cost;
    return pos * (0.6 + phase) * style.corner +
      mat * (0.3 + (1 - phase) * 2.2) * style.mat +
      mob * 2.2 * phase * style.mob +
      runes * 5 * style.rune +
      charge * 2.5 * style.charge;
  }

  // Keep branching sane: all placements, but only the most promising ult targets.
  function candidateActions(s, ultCap, style) {
    var acts = E.legalActions(s), place = [], ult = [], other = [];
    acts.forEach(function (a) { (a.type === 'place' ? place : a.type === 'ult' ? ult : other).push(a); });
    if (ult.length > ultCap) {
      var p = s.turn;
      ult.forEach(function (a) { a._h = evaluate(E.applyAction(s, a).state, p, style); });
      ult.sort(function (x, y) { return y._h - x._h; });
      ult = ult.slice(0, ultCap);
    }
    // Order placements by immediate flips + position for better pruning.
    place.forEach(function (a) { a._h = E.flipsFor(s.board, s.locked, a.cell, s.turn) + POS[a.cell] * 2; });
    place.sort(function (x, y) { return y._h - x._h; });
    var out = ult.concat(place, other);
    if (!out.length) out.push({ type: 'pass' });
    return out;
  }

  function search(s, depth, alpha, beta, me, ctx) {
    ctx.nodes++;
    if (depth <= 0 || s.over || ctx.nodes > ctx.budget) return evaluate(s, me, ctx.style);
    var acts = candidateActions(s, ctx.ultCap, ctx.style), maximizing = s.turn === me, best = maximizing ? -Infinity : Infinity;
    for (var k = 0; k < acts.length; k++) {
      var v = search(E.applyAction(s, acts[k]).state, depth - 1, alpha, beta, me, ctx);
      if (maximizing) { if (v > best) best = v; if (best > alpha) alpha = best; }
      else { if (v < best) best = v; if (best < beta) beta = best; }
      if (alpha >= beta) break;
    }
    return best;
  }

  // Rating scale matches the ladder: Iron IV ≈ 800 … Diamond I ≈ 3500, Challenger ≈ 4100+.
  function profileFor(rating, style) {
    var t = Math.max(0, Math.min(1, (rating - 800) / 3400));
    return {
      depth: t < 0.1 ? 1 : t < 0.3 ? 2 : t < 0.58 ? 3 : t < 0.9 ? 4 : 5,
      noise: 24 * Math.pow(1 - t, 1.6),        // eval noise → positional mistakes at low ranks
      blunder: 0.3 * Math.pow(1 - t, 2.2),     // chance to play a random legal move
      ultCap: t < 0.3 ? 2 : 5,
      ultShy: t < 0.25 ? 0.5 : 0,              // low bots sometimes forget their ult
      endgame: t >= 0.85 ? 10 : t >= 0.6 ? 7 : t >= 0.4 ? 4 : 0, // exact-ish search when this few hexes remain
      budget: 5000 + 60000 * t,
      style: style || DEFAULT_STYLE
    };
  }

  function scoreActions(s, prof, rng) {
    rng = rng || Math.random;
    var me = s.turn, acts = candidateActions(s, prof.ultCap, prof.style);
    var depth = prof.depth, empties = E.emptyCount(s);
    if (prof.endgame && empties <= prof.endgame) depth = Math.max(depth, empties);
    var ctx = { nodes: 0, budget: prof.budget * (depth > 4 ? 4 : 1), ultCap: prof.ultCap, style: prof.style };
    return acts.map(function (a) {
      var v = search(E.applyAction(s, a).state, depth - 1, -Infinity, Infinity, me, ctx);
      return { action: strip(a), value: v + (prof.noise ? (rng() - 0.5) * prof.noise : 0) };
    }).sort(function (x, y) { return y.value - x.value; });
  }

  function chooseAction(s, rating, rng) {
    rng = rng || Math.random;
    var prof = typeof rating === 'object' ? rating : profileFor(rating);
    var acts = candidateActions(s, prof.ultCap, prof.style);
    if (prof.ultShy && rng() < prof.ultShy) {
      var noUlt = acts.filter(function (a) { return a.type !== 'ult'; });
      if (noUlt.length) acts = noUlt;
    }
    if (acts.length === 1) return strip(acts[0]);
    if (prof.blunder && rng() < prof.blunder) return strip(acts[Math.floor(rng() * acts.length)]);
    var scored = scoreActions(s, prof, rng);
    if (prof.ultShy) {
      var allowed = acts.map(key);
      scored = scored.filter(function (x) { return allowed.indexOf(key(x.action)) !== -1; });
    }
    return scored[0].action;
  }
  function key(a) { return a.type + ':' + a.cell; }
  function strip(a) { return a.cell === undefined ? { type: a.type } : { type: a.type, cell: a.cell }; }

  // Deterministic "autopilot" used on timeout: same result on both peers.
  var AUTOPILOT = { depth: 1, noise: 0, blunder: 0, ultCap: 0, ultShy: 0, endgame: 0, budget: 1e9, style: DEFAULT_STYLE };
  function autopilot(s) { return chooseAction(s, AUTOPILOT, function () { return 0.99; }); }

  // Advantage for side p in [-1, 1], for the in-game tug-of-war bar and review graph.
  function advantage(s, p) {
    if (s.over) return s.winner === p ? 1 : s.winner ? -1 : 0;
    return Math.tanh(evaluate(s, p) / 40);
  }

  var AI = {
    evaluate: evaluate, chooseAction: chooseAction, scoreActions: scoreActions, profileFor: profileFor,
    autopilot: autopilot, advantage: advantage, AUTOPILOT: AUTOPILOT, DEFAULT_STYLE: DEFAULT_STYLE, key: key
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = AI;
  root.YAJA = root.YAJA || {};
  root.YAJA.AI = AI;
})(typeof window !== 'undefined' ? window : globalThis);
