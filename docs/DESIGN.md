# YAJA — Design (v2, as built)

A 1v1 competitive board game on a single static HTML page. The targets were:

- 3–5 minute matches
- a strong "one more game" loop
- a League-of-Legends-style ranked ladder
- a premium look using only CSS, SVG and canvas (no image assets)

This doc records the design as built, and how it changed through two review rounds with a second agent acting as game designer and playtester.

## Core rules

- **Board:** hexagon of radius 4 (61 cells), pointy-top, axial coordinates. Six stones start alternating around the empty centre.
- **Move:** place a stone that sandwiches at least one straight line of enemy stones; those stones flip. You can't place without capturing.
- **Pass:** if you have no capture, you pass and gain +3 charge. Two passes in a row, or a full board, ends the game. The game also ends if either side is wiped out.
- **Corners:** the six corners sit at the end of every line through them, so they can never be flipped.
- **Runes:** three objective cells, laid out with 120° symmetry and chosen from four layouts. Claiming one for the first time gives +3 charge. Holding one gives +1 charge at the start of each of your turns and +3 points at game end.
- **Score:** stones plus Rune bonuses.
- **Clock:** 10 s per move plus a 45 s reserve (practice mode: 30 s + 120 s). On timeout, a deterministic autopilot picks the depth-1 best move. It's deterministic so both peers compute the same move. Three timeouts is a forfeit.

### Ultimate economy

- Every enemy stone you flip gives +1 charge. The meter caps at the ult's cost; overflow is lost.
- Casting is your whole turn, except Rewind, which then lets you move.
- **Final Phase:** once 6 or fewer hexes are empty, Ultimates are sealed. This kills the "hoard for the last three moves" strategy.

### Champions (final)

| Champion | Ult | Cost | Effect |
|---|---|---|---|
| Vex | Detonate | 20 | Destroys enemy stones in a 7-hex area. The craters are *scorched* (unplayable, and they break lines) for 2 plies. |
| Aegis | Bastion | 32 | A chosen stone of yours plus every allied stone touching it become permanently locked. |
| Nyx | Shadow Step | 28 | Place on any empty hex that isn't a corner or a Rune, even without a capture. The stone still captures normally. |
| Kael | Rally | 22 | Enemy stones adjacent to one of your stones defect. Corners are immune. Converted stones give no charge. |
| Mira | Rewind | 16 | Undo the opponent's last move and take your turn. The victim loses whatever that move earned them. An erased Ultimate stays spent (callout: SHUTDOWN). A Rewind can't itself be rewound. |

### Balance process

`tools/balance.js` runs bot-vs-bot round robins. We iterated with 600–1200-game samples at several bot strengths:

- **v1 costs (8–12)** allowed 4–6 casts per player. Ults became ordinary moves, so costs roughly doubled.
- **Mira's Echo** (take two moves) sat at 12–30% win rate at every cost we tried. Tempo is often *bad* in Othello-likes because of parity. We tried a chain-reaction *Cascade* (+2 stones over the best move, still weak), then *Rewind*, which landed at ~45–55%.
- **Nyx** anywhere (including Runes) was 58–65% even at cost 34. Rune-grabbing was the culprit, so Runes are now excluded.
- **Aegis** "place a locked stone" overlapped with Nyx and did nothing on corners (corners are unflippable anyway). The lock-a-cluster design gave Aegis a real *stability* identity.
- **Result:** at mid skill each champion wins 44–55%, about 1.5 casts per player per game, and the first player wins about 50%. Balance varies with bot depth, which is expected, and should be re-tuned with real match data.

## AI

`js/ai.js` is alpha-beta search with move ordering. It caps ult targets to the best few by static evaluation.

- **Evaluation:** positional weights (corners strong; cells next to an *empty* corner bad; rim good), material that matters more late, mobility that matters more early, Runes, charge, and locked stones.
- **Rating → profile:**
  - search depth 1–4
  - evaluation noise and blunder rate fall steeply with rating
  - bots below ~1600 sometimes "forget" their ult
  - Diamond+ bots switch to near-exact search for the last 6–9 empties
- **Personalities:** multipliers on evaluation terms, e.g. CornerGoblin, FlipLord (greedy), Hoarder (charge miser), Blitz (ult spammer), Wraith (mobility).

## Ranked

- **Scale:** Iron IV = 800 MMR, +100 per division. Diamond I = 3500. Master starts at 3600, with Grandmaster at 200 LP and Challenger at 500 LP.
- **LP:** gain `clamp(20 + (MMR − rankMMR)/25, 12, 30)`, loss `clamp(20 − gap/25, 10, 28)`. Hot streak (3+ wins) adds +2.
- **Elo K:** 100 during placements, 60 for the first 15 games, 40 up to game 40, then 28.
- **Placements:** 5 games, starting from Silver IV MMR. The first opponent is 250 MMR easier. Placement lands at MMR − 50, capped at Emerald IV.
- **Promotions:** divisions promote at 100 LP, carrying LP over. The I → next tier step needs a single **Ascension match**; losing it is a normal loss.
- **Demotion protection:** 0 LP absorbs one loss, the next loss demotes to 75 LP. There's a 3-game shield after promotion or placement, and a floor at Iron IV 0 LP.
- **Splits:** four weeks, computed from a fixed epoch. At a new split you get a peak reward (Essence plus a tier ring on your avatar), MMR is pulled 25% toward Silver IV, and you play 3 re-placement games.
- **Nemesis / Gatekeeper:** beat a rival who leads your head-to-head by 3 or more for +5 revenge LP. Ascension matches are played against the nearest rival rated at or above you.
- **Abandon:** an unfinished ranked match is recorded as a loss on the next load.
- **Opponents:** 20 named, openly-AI rivals with home ratings from 900 to 4200. Matchmaking picks among the 3 nearest (weighted 50/30/20) so you keep meeting the same rivals. The bot plays at the average of its rating and yours, never adjusted for your streak. Bot ratings move when you play them, so the ladder feels alive.
- **Duels:** online games update a separate Duel Elo, not LP, because localStorage can be edited.

## Session loop

- **Mastery:** M1–M7 per champion; win = 100 points, loss = 40, practice gives half.
- **Daily quests:** 3 per day from a pool of 10, seeded by date and name, with one reroll per day. Examples: "Land a TRIPLE", "Hold all 3 Runes", "Win as X".
- **Essence:** win 30, loss 12, First Win of the Day +100, quests 40–70, daily puzzle +40. It buys stone skins (5), arenas (4) and titles (5).
- **Daily puzzle:** generated from the date by seeded bot play. It picks a position whose best move beats the second-best by a clear margin at depth 3. You get three tries graded green/yellow/red, a streak counter, and a shareable emoji result.
- **Post-game review:** depth-2 analysis of every move, tagged Brilliant/Best/Good/Inaccuracy/Mistake/Blunder, plus an accuracy score for both players and an advantage graph you can scrub.

## Feel

- **Hover preview:** a ghost stone, pulsing stones that will flip, and a "+N ×lines" label. On touch it's tap to preview, tap again to place.
- **Flips:** flips cascade along each line with rising pentatonic notes, plus particle bursts. The placed stone drops in with a shockwave.
- **Callouts:** DOUBLE/TRIPLE/QUADRA/PENTA/HEXAFLIP by *line count*, plus SWEEP, FIRST BLOOD (first corner), RUNE CLAIMED, FINAL PHASE and SHUTDOWN.
- **Ults:** a slanted full-width banner with the champion sigil. Detonate adds screen shake, Rewind a hue-warp.
- **In-game HUD:** a tug-of-war advantage bar, a conic charge ring that pulses when ready, move and reserve clocks, emotes, and bot banter in each rival's voice.
- **Around the match:** queue → *Match Found* accept ring → blind champion select → diagonal VS slam → game → results with a score tally, animated LP bar (it crosses division boundaries), rewards and head-to-head → **rank-up ceremony**. The ceremony uses shards converging on a procedurally generated tier emblem, rotating light beams, a sweep and confetti.

## Tech

- Static files only. No build step; single-player works from `file://`.
- The engine is pure and deterministic, so both online peers run it and exchange only moves.
- **Networking:** PeerJS (vendored) over WebRTC data channels. Private rooms use `yaja-v3-r-<CODE>`. Quick Match races for `yaja-v3-qm-<n>` slots, and a waiting host periodically probes lower slots. A 2 s heartbeat detects a dead peer after 10 s. Messages that arrive during the guest's connect handshake are buffered and replayed.
- **Audio:** a tiny WebAudio synth; no audio files.
- **Tests:** `node --test tests/*.test.js` covers the engine rules, every Ultimate, the rank math, and the placement/ascension/demotion paths.

## Review round 2 (hands-on playtest) — what changed

A second agent played the build in a real browser on desktop and phone. It also ran about 700 bot games in Node. Fixes applied:

- **Rendering:** stones were drawn hollow on review, puzzle and collection boards after a game had been played. Every board duplicated the same gradient ids inside hidden screens. There is now one shared, always-rendered `<defs>` block.
- **Board readability:**
  - Legal-move dots are larger and pulse in your colour.
  - Corners are gold-rimmed tiles.
  - The flip preview outlines the affected stones in *your* colour instead of fading them, which used to read as "will vanish".
  - The board rim takes the colour of the side to move.
- **Advantage bar:** it could contradict the score. It is now labelled and blends the score difference with the engine's evaluation.
- **Onboarding:** first-time players get a training match against Pebble with coach tips on the relaxed practice clock, instead of a 10-second ranked placement.
- **Goals:** "≈N wins to X" appears on the lobby and results screens, along with quest progress and a rivals panel.
- **Callouts:** they now queue instead of overwriting each other. Callout and ult-banner text sizes are clamped for phones.
- **Phone layout:** scores on top, a bigger board, Ultimate buttons at the bottom within thumb reach, Surrender as an icon, a scroll hint on the nav, and champion select no longer hides Mira behind the Lock In button.
- **AI strength:** the curve was steepened (more noise and blunders at the bottom, depth 5 plus a longer endgame at the top). A 400-rating gap now wins about 60–76% instead of 43–73%.
- **Economy:** four-week splits with peak rewards, three more shop titles, and a split-peak avatar ring.
- **Bugs:**
  - Placement games showed "+0 LP".
  - The re-placement count was wrong after a split reset.
  - The topbar Essence count went stale.
  - The review and puzzle boards overflowed their panels.
  - Mira's Rewind fired on a single key press; it now needs a confirmation press.
  - Refreshing the page dodged a ranked loss.
