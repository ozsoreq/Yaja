// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const R = require('../js/rank.js');

function match(p, won, oppRating) {
  return R.recordMatch(p, {
    mode: 'ranked', ranked: true, won, draw: false, champ: 'vex', oppChamp: 'kael', oppName: 'Bot', oppId: 'sable',
    oppRating: oppRating == null ? p.mmr : oppRating, score: [30, 20], bestMove: 3, maxLines: 1, runesEnd: 1, ults: 1,
    cornersEnd: 1, margin: won ? 10 : -10, flipped: 12
  });
}

test('rank <-> mmr round trip', () => {
  for (let m = 800; m < 4400; m += 37) {
    const r = R.rankFromMMR(m);
    assert.ok(Math.abs(R.rankMMR(r) - m) <= 1, 'round trip at ' + m);
  }
  assert.strictEqual(R.rankName({ tier: 3, div: 2, lp: 0 }), 'Gold II');
  assert.strictEqual(R.rankName(R.rankFromMMR(3600 + 600)), 'Challenger');
});

test('placements: 5 games then a rank appears', () => {
  const p = R.freshProfile();
  for (let i = 0; i < 4; i++) { const o = match(p, true); assert.strictEqual(p.rank, null); assert.strictEqual(o.ranked.events[0].type, 'placement'); }
  const o = match(p, false);
  assert.ok(p.rank, 'ranked after placements');
  assert.strictEqual(o.ranked.events[0].type, 'placed');
  assert.ok(R.rankMMR(p.rank) <= 800 + 5 * 400, 'placement capped at Emerald IV');
});

test('LP gain/loss stay inside the documented bounds', () => {
  const p = R.freshProfile();
  p.rank = { tier: 3, div: 2, lp: 50 }; p.placementsLeft = 0; p.games = 50;
  for (const gap of [-800, -100, 0, 100, 800]) {
    p.mmr = R.rankMMR(p.rank) + gap; p.streak = 0;
    const r = R.applyRanked(Object.assign({}, p, { rank: Object.assign({}, p.rank) }), 1, p.mmr, {});
    assert.ok(r.gain >= 12 && r.gain <= 30, 'gain ' + r.gain);
    assert.ok(r.loss >= 10 && r.loss <= 28, 'loss ' + r.loss);
  }
});

test('division promotion carries LP; tier promotion needs an ascension win', () => {
  const p = R.freshProfile();
  p.placementsLeft = 0; p.games = 50; p.mmr = 2100;
  p.rank = { tier: 3, div: 2, lp: 95 };
  let o = R.applyRanked(p, 1, 2100, {});
  assert.strictEqual(p.rank.div, 1);
  assert.strictEqual(o.events[0].type, 'divUp');
  p.rank.lp = 95;
  o = R.applyRanked(p, 1, 2100, {});
  assert.strictEqual(o.events[0].type, 'ascension');
  assert.strictEqual(p.ascension, true);
  assert.strictEqual(p.rank.lp, 100);
  o = R.applyRanked(p, 1, 2100, {});
  assert.strictEqual(o.events[0].type, 'tierUp');
  assert.strictEqual(p.rank.tier, 4);
  assert.strictEqual(p.rank.div, 4);
});

test('losing an ascension match is a normal loss, not a reset', () => {
  const p = R.freshProfile();
  p.placementsLeft = 0; p.games = 50; p.mmr = 2100; p.rank = { tier: 3, div: 1, lp: 100 }; p.ascension = true;
  const o = R.applyRanked(p, 0, 2100, {});
  assert.strictEqual(p.ascension, false);
  assert.strictEqual(p.rank.tier, 3);
  assert.strictEqual(p.rank.lp, 100 - o.loss);
});

test('0 LP buffer: first loss at 0 is absorbed, second demotes', () => {
  const p = R.freshProfile();
  p.placementsLeft = 0; p.games = 50; p.mmr = 2100; p.rank = { tier: 3, div: 3, lp: 5 }; p.promoShield = 0;
  R.applyRanked(p, 0, 2100, {});
  assert.deepStrictEqual([p.rank.div, p.rank.lp], [3, 0]);
  const o = R.applyRanked(p, 0, 2100, {});
  assert.strictEqual(o.events[0].type, 'demoted');
  assert.deepStrictEqual([p.rank.tier, p.rank.div, p.rank.lp], [3, 4, 75]);
});

test('Iron IV floor never goes negative', () => {
  const p = R.freshProfile();
  p.placementsLeft = 0; p.games = 50; p.mmr = 600; p.rank = { tier: 0, div: 4, lp: 0 };
  R.applyRanked(p, 0, 900, {});
  assert.deepStrictEqual(p.rank, { tier: 0, div: 4, lp: 0 });
});

test('apex tiers: Grandmaster at 200 LP, Challenger at 500 LP', () => {
  const p = R.freshProfile();
  p.placementsLeft = 0; p.games = 50; p.mmr = 4400; p.rank = { tier: 7, div: 0, lp: 190 };
  R.applyRanked(p, 1, 4400, {});
  assert.strictEqual(p.rank.tier, 8);
  p.rank.lp = 495;
  R.applyRanked(p, 1, 4400, {});
  assert.strictEqual(p.rank.tier, 9);
});

test('quests, essence, mastery and history are recorded', () => {
  const p = R.freshProfile();
  const e0 = p.essence;
  const o = match(p, true);
  assert.ok(p.essence > e0);
  assert.strictEqual(p.history.length, 1);
  assert.strictEqual(p.mastery.vex, 100);
  assert.ok(o.rewards.some((r) => /First Win/.test(r.label)));
  assert.ok(p.h2h.sable && p.h2h.sable.w === 1);
});

test('opponent picks are near your MMR', () => {
  const p = R.freshProfile();
  p.placementsLeft = 0; p.rank = { tier: 4, div: 2, lp: 0 }; p.mmr = 2500;
  for (let i = 0; i < 30; i++) {
    const o = R.pickOpponent(p);
    assert.ok(Math.abs(o.rating - p.mmr) < 400, 'rating ' + o.rating);
  }
});

test('season math is stable', () => {
  const a = R.seasonInfo(Date.UTC(2026, 0, 5));
  const b = R.seasonInfo(Date.UTC(2026, 0, 19));
  assert.strictEqual(a.n, 1);
  assert.strictEqual(b.n, 2);
});
