// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const E = require('../js/engine.js');
const AI = require('../js/ai.js');

function empty(opts) {
  const s = E.createGame(opts || {});
  s.board.fill(0);
  return s;
}
const at = (q, r) => E.idx(q, r);

test('board geometry: 61 hexes, 6 corners, corners have 3 neighbours', () => {
  assert.strictEqual(E.N, 61);
  assert.strictEqual(E.CORNERS.length, 6);
  E.CORNERS.forEach((c) => assert.strictEqual(E.NEIGHBORS[c].length, 3));
});

test('opening position is symmetric and both sides can move', () => {
  const s = E.createGame();
  assert.strictEqual(E.stones(s, 1), 3);
  assert.strictEqual(E.stones(s, 2), 3);
  assert.ok(E.legalPlacements(s, 1).length > 0);
  assert.ok(E.legalPlacements(s, 2).length > 0);
});

test('placing captures a sandwiched line', () => {
  const s = empty();
  s.board[at(0, 0)] = 1;
  s.board[at(1, 0)] = 2;
  s.board[at(2, 0)] = 2;
  const res = E.applyAction(s, { type: 'place', cell: at(3, 0) });
  assert.strictEqual(res.state.board[at(1, 0)], 1);
  assert.strictEqual(res.state.board[at(2, 0)], 1);
  assert.strictEqual(res.events.flipped, 2);
  assert.strictEqual(res.events.lineCount, 1);
});

test('placement without capture is illegal', () => {
  const s = empty();
  s.board[at(0, 0)] = 1;
  assert.strictEqual(E.isLegal(s, { type: 'place', cell: at(2, 2) }), false);
});

test('locked stones cannot be flipped and block the line', () => {
  const s = empty();
  s.board[at(0, 0)] = 1;
  s.board[at(1, 0)] = 2;
  s.locked[at(1, 0)] = 1;
  assert.strictEqual(E.flipsFor(s.board, s.locked, at(2, 0), 1), 0);
});

test('charge caps at the ultimate cost', () => {
  const s = empty({ champ1: 'mira' });
  s.charge[1] = E.CHAMPIONS.mira.cost - 1;
  s.board[at(0, 0)] = 1;
  for (let q = 1; q <= 3; q++) s.board[at(q, 0)] = 2;
  s.board[at(-2, 2)] = 2; // keep crimson alive
  const r = E.applyAction(s, { type: 'place', cell: at(4, 0) });
  assert.strictEqual(r.state.charge[1], E.CHAMPIONS.mira.cost);
});

test('ultimates are sealed in the final phase', () => {
  const s = E.createGame({ champ1: 'kael' });
  s.charge[1] = 99;
  for (let i = 0; i < E.N; i++) if (!s.board[i]) s.board[i] = i % 2 ? 1 : 2;
  // Leave exactly FINAL_PHASE empties
  let freed = 0;
  for (let i = 0; i < E.N && freed < E.FINAL_PHASE; i++) if (E.RING[i] === 4) { s.board[i] = 0; freed++; }
  assert.strictEqual(E.finalPhase(s), true);
  assert.strictEqual(E.canUlt(s, 1), false);
});

test('Vex destroys enemies only and scorches craters', () => {
  const s = empty({ champ1: 'vex' });
  s.charge[1] = E.CHAMPIONS.vex.cost;
  s.board[at(0, 0)] = 2;
  s.board[at(1, 0)] = 1;
  s.board[at(0, 1)] = 2;
  s.board[at(3, -3)] = 2;
  const r = E.applyAction(s, { type: 'ult', cell: at(0, 0) });
  assert.strictEqual(r.state.board[at(0, 0)], 0);
  assert.strictEqual(r.state.board[at(0, 1)], 0);
  assert.strictEqual(r.state.board[at(1, 0)], 1);
  assert.ok(r.state.scorch[at(0, 0)] > r.state.ply, 'crater is scorched');
  assert.strictEqual(r.state.charge[1], 0);
});

test('Kael rally converts adjacent non-corner enemies', () => {
  const s = empty({ champ1: 'kael' });
  s.charge[1] = E.CHAMPIONS.kael.cost;
  s.board[at(0, 0)] = 1;
  s.board[at(1, 0)] = 2;
  s.board[at(-1, 0)] = 2;
  s.board[at(3, 1)] = 2;
  const r = E.applyAction(s, { type: 'ult', cell: at(0, 0) });
  assert.strictEqual(r.state.board[at(1, 0)], 1);
  assert.strictEqual(r.state.board[at(-1, 0)], 1);
  assert.strictEqual(r.events.converted.length, 2);
});

test('Aegis bastion locks the stone and its allied neighbours', () => {
  const s = empty({ champ1: 'aegis' });
  s.charge[1] = E.CHAMPIONS.aegis.cost;
  s.board[at(0, 0)] = 1;
  s.board[at(1, 0)] = 1;
  s.board[at(0, 1)] = 2;
  const r = E.applyAction(s, { type: 'ult', cell: at(0, 0) });
  assert.strictEqual(r.state.locked[at(0, 0)], 1);
  assert.strictEqual(r.state.locked[at(1, 0)], 1);
  assert.strictEqual(r.state.locked[at(0, 1)], 0);
});

test('Nyx cannot shadow-step onto corners or runes', () => {
  const s = E.createGame({ champ1: 'nyx' });
  s.charge[1] = E.CHAMPIONS.nyx.cost;
  const t = E.ultTargets(s, 1);
  E.CORNERS.forEach((c) => assert.ok(t.indexOf(c) === -1));
  s.runes.forEach((c) => assert.ok(t.indexOf(c) === -1));
});

test('Mira rewind erases the opponent move and keeps the turn', () => {
  let s = E.createGame({ champ1: 'nyx', champ2: 'mira', first: 1 });
  const before = s.board.slice();
  s = E.applyAction(s, { type: 'place', cell: E.legalPlacements(s, 1)[0] }).state;
  s.charge[2] = E.CHAMPIONS.mira.cost;
  assert.strictEqual(s.turn, 2);
  const r = E.applyAction(s, { type: 'ult', cell: -1 });
  assert.deepStrictEqual(r.state.board, before);
  assert.strictEqual(r.state.turn, 2, 'Mira still gets to move');
  assert.ok(r.events.extraTurn);
  // A rewind cannot itself be rewound
  const after = E.applyAction(r.state, { type: 'place', cell: E.legalPlacements(r.state, 2)[0] }).state;
  after.charge[1] = 0;
  assert.ok(E.ultTargets(Object.assign(E.clone(after), { champ: [null, 'mira', 'mira'] }), 1).length === 1);
});

test('runes pay charge on claim and each turn held', () => {
  const s = empty({ champ1: 'vex', champ2: 'aegis' });
  const rune = s.runes[0];
  const c = E.CELLS[rune];
  // Build a capture that lands on the rune from an inner direction.
  const d = [[-1, 0], [1, -1], [0, -1], [1, 0], [-1, 1], [0, 1]].find(([dq, dr]) => E.idx(c.q + 2 * dq, c.r + 2 * dr) !== -1);
  s.board[E.idx(c.q + d[0], c.r + d[1])] = 2;
  s.board[E.idx(c.q + 2 * d[0], c.r + 2 * d[1])] = 1;
  s.board[at(0, 0)] = s.board[at(0, 0)] || 2;
  const r = E.applyAction(s, { type: 'place', cell: rune });
  assert.ok(r.events.rune);
  assert.strictEqual(r.state.charge[1], 1 + E.RUNE_CHARGE); // 1 flip + claim bonus
  // Opponent passes → rune tick when turn returns
  const s2 = E.applyAction(Object.assign(E.clone(r.state), {}), { type: 'pass' });
  assert.strictEqual(s2.state.charge[1], 1 + E.RUNE_CHARGE + E.RUNE_TICK);
});

test('score counts rune bonus', () => {
  const s = empty();
  s.board[s.runes[0]] = 1;
  s.board[at(0, 0)] = 2;
  const sc = E.score(s);
  assert.strictEqual(sc[1], 1 + E.RUNE_BONUS_SCORE);
  assert.strictEqual(sc[2], 1);
});

test('random games always terminate with a legal sequence', () => {
  for (let g = 0; g < 200; g++) {
    let s = E.createGame({ champ1: E.CHAMP_IDS[g % 5], champ2: E.CHAMP_IDS[(g * 3) % 5], runeLayout: g % 4, first: 1 + (g % 2) });
    let n = 0;
    while (!s.over && n < 500) {
      const acts = E.legalActions(s);
      const a = acts[Math.floor(Math.random() * acts.length)];
      assert.ok(E.isLegal(s, a), 'generated action is legal');
      s = E.applyAction(s, a).state;
      n++;
    }
    assert.ok(s.over, 'game ended');
  }
});

test('AI returns legal actions and autopilot is deterministic', () => {
  let s = E.createGame({ champ1: 'kael', champ2: 'vex' });
  for (let i = 0; i < 20 && !s.over; i++) {
    const a = AI.chooseAction(s, 1800);
    assert.ok(E.isLegal(s, a));
    const p1 = AI.autopilot(s), p2 = AI.autopilot(s);
    assert.deepStrictEqual(p1, p2);
    s = E.applyAction(s, a).state;
  }
});
