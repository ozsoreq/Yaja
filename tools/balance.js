#!/usr/bin/env node
// Bot-vs-bot balance simulation. Usage: node tools/balance.js [games=300] [rating=1900]
// Reports champion win rates, ult usage and first-player advantage.
const E = require('../js/engine.js');
const AI = require('../js/ai.js');

const games = +process.argv[2] || 300;
const rating = +process.argv[3] || 1900;
const pairs = [];
E.CHAMP_IDS.forEach((a) => E.CHAMP_IDS.forEach((b) => { if (a !== b) pairs.push([a, b]); }));

const W = {}, G = {}, U = {};
E.CHAMP_IDS.forEach((c) => { W[c] = 0; G[c] = 0; U[c] = 0; });
let firstWins = 0, decided = 0, ults = 0, plies = 0;

for (let g = 0; g < games; g++) {
  const [c1, c2] = pairs[g % pairs.length];
  const first = 1 + (Math.floor(g / pairs.length) % 2);
  let s = E.createGame({ champ1: c1, champ2: c2, runeLayout: g % E.RUNE_LAYOUTS.length, first });
  while (!s.over) s = E.applyAction(s, AI.chooseAction(s, rating)).state;
  G[c1]++; G[c2]++; U[c1] += s.ultUsed[1]; U[c2] += s.ultUsed[2];
  ults += s.ultUsed[1] + s.ultUsed[2]; plies += s.ply;
  if (s.winner) { W[s.champ[s.winner]]++; decided++; if (s.winner === first) firstWins++; }
  else { W[c1] += 0.5; W[c2] += 0.5; }
  if ((g + 1) % 50 === 0) process.stderr.write(`  ${g + 1}/${games}\r`);
}

console.log(`games ${games} @ rating ${rating} · ults/game ${(ults / games).toFixed(2)} · plies ${(plies / games).toFixed(1)} · first-player win ${(100 * firstWins / decided).toFixed(1)}%`);
E.CHAMP_IDS.forEach((c) => console.log(`  ${c.padEnd(6)} ${(100 * W[c] / G[c]).toFixed(1).padStart(5)}%   ults/game ${(U[c] / G[c]).toFixed(2)}`));
