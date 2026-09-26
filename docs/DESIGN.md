# YAJA — Hex Arena · Design v1 (draft for review)

A 1v1 competitive board game that runs from a single static HTML page.
Target: 3–5 minute matches, "one more game" loop, League-of-Legends-style ranked ladder.

## Core game (the board)

- Hexagonal board, radius 4 (61 cells), axial coordinates.
- Two players: **Azure** and **Crimson**. Start: 6 stones alternating around the center ring.
- **Move:** place a stone on an empty cell that sandwiches ≥1 straight line of enemy stones
  (6 hex directions) between the new stone and one of your own. All sandwiched stones flip.
  (Othello, but on hexes → 6 lines instead of 8, very different geometry.)
- No legal placement → you must pass (you may still cast your Ultimate if charged).
  Both players pass consecutively / board full → game over.
- **Score** = stones on board + 2 per Rune you hold. Higher score wins; ties are draws.
- **Turn timer**: 20s per move. Timeout → random legal move is played for you
  (3 timeouts = forfeit).

### Runes (map objectives, à la Dragon/Baron)
- 3 glowing **Rune** cells placed symmetrically (per-match random from a few mirrored layouts).
- Holding a Rune at game end = +2 score.
- First time you place on a Rune: +3 Ultimate charge ("Rune claimed!").

### Champions & Ultimates (the draft)
Before the match each player picks one champion (blind pick). Each has an Ultimate.
Ult charge fills +1 per enemy stone you flip; cost listed below. Using your Ult *is* your turn
unless stated otherwise.

| Champion | Ultimate | Cost | Effect |
|---|---|---|---|
| **Vex** (Bomber) | Detonate | 10 | Destroy all stones (both colors) in a radius-1 hex (7 cells) around an empty or occupied cell. |
| **Aegis** (Warden) | Bastion | 8 | Place a *locked* stone anywhere empty (no flip needed); it flips lines normally and can never be flipped. |
| **Nyx** (Assassin) | Shadow Step | 9 | Place a stone on any empty cell (flips normally), then take another turn. |
| **Kael** (Warlord) | Rally | 10 | Choose one of your stones: convert every adjacent enemy stone (up to 6). |
| **Mira** (Tempo mage) | Echo | 12 | Take two normal moves this turn. |

### Feel / juice
- Flip cascades animate one-by-one along the line with rising pitch (WebAudio synth).
- Combo callouts: flip 4+ = "DOUBLE LINE", 6+ = "RAMPAGE", 9+ = "PENTAFLIP".
- Screen shake on Ultimates, particle bursts on Rune capture.

## Modes
1. **Ranked (vs Bots)** — always available, instant queue. Opponent is an AI whose rating
   matches your hidden MMR; AI strength (search depth, noise, ult discipline) scales with rating.
   Opponents have generated gamer tags + rank emblems.
2. **Online Duel** — play a real person over the internet via WebRTC (PeerJS). Share a 5-letter
   room code / link. Also a "Quick Match" queue that pairs any two people currently queueing.
3. **Practice** — vs bot, pick difficulty, no LP.

## Ranked system (League-style)
- Tiers: Iron, Bronze, Silver, Gold, Platinum, Emerald, Diamond (divisions IV→I, 100 LP each),
  then Master, Grandmaster, Challenger (open LP).
- **Placements**: first 5 games unranked; placement from resulting MMR (capped at Emerald IV).
- **Hidden MMR** (Elo, K=32 decreasing to 20). LP gain/loss = ~20, adjusted by the gap between
  MMR and visible rank (if MMR > rank, gain more / lose less) — exactly the LoL feeling.
- **Promotion series**: reaching 100 LP in division I → Bo3 promos for next tier.
- **Demotion shield**: at 0 LP you get 3 losses of grace before demotion; no demotion out of a
  tier's IV division for the first 3 games after promotion.
- **Hot streak**: 3+ win streak shows 🔥 and adds +2 LP per streak step (max +6).
- **Season** counter; peak rank recorded.

## Meta-progression (the addictive loop)
- **Champion Mastery** 1–7 per champion (points per game, more on win; mastery badge in loading screen).
- **Daily quests** (3/day, rerollable once): e.g. "Win a game with Vex", "Claim 2 Runes in one game",
  "Flip 8 stones in a single move". Reward: Essence.
- **First Win of the Day**: bonus Essence.
- **Essence** buys cosmetic stone skins / board themes / profile titles.
- **Match history** with LP deltas, KDA-like stats (stones flipped, runes, ult casts).
- **Ladder** page: your position among a simulated regional ladder of bots around your LP.

## Tech
- Pure static HTML/CSS/JS, no build step, works on GitHub Pages or `file://`.
- Engine is pure JS (unit-testable in Node). AI = alpha-beta (depth 1–4) with positional eval.
- Progress persisted in `localStorage`. Online play via vendored PeerJS (public signaling cloud).
