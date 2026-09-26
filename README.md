# YAJA · Hex Arena

**Hex. Flip. Climb.** YAJA is a fast (3–5 minute) competitive board game that runs from a single static HTML page. You draft a champion, trap lines of enemy stones on a hex board, fire off your Ultimate, and climb a League-of-Legends-style ladder from **Iron to Challenger**.

- **No build step, no server.** Open `index.html` from any static host (GitHub Pages, Netlify, S3, itch.io) or straight from disk.
- **Play over the internet** peer-to-peer (WebRTC): *Quick Match* against anyone queueing, or a *private room* with a 5-letter code / invite link.
- **Ranked vs AI rivals**: a cast of 20 named bots with their own play styles, mains and head-to-head records. They're labelled as AI everywhere.

## Run it

```bash
npm start          # serves the folder on http://localhost:8080
npm test           # engine + ranked-math unit tests (node --test)
npm run sim        # bot-vs-bot balance simulation
```

Or just double-click `index.html`. Single-player works from `file://`. For online play, serve the folder over http(s).

To host it, push the folder to any static host. With GitHub Pages: *Settings → Pages → Deploy from branch*, root folder.

## The game

| | |
|---|---|
| **Board** | 61 hexes (radius 4). Six stones start around the empty centre. |
| **Move** | Place a stone that sandwiches one or more straight lines of enemy stones. The trapped stones flip. With six directions you get multi-line combos: DOUBLE, TRIPLE, QUADRA, PENTA, **HEXAFLIP**. |
| **Pass** | No capturing move means you pass, and you get +3 charge as consolation. Two passes in a row, or a full board, ends the game. |
| **Corners** | The six corners can never be flipped. |
| **Runes** | 3 golden objective hexes. Claiming one gives +3 charge. Holding one gives +1 charge per turn and +3 points at the end. |
| **Score** | Stones plus Rune bonuses. Highest score wins. |
| **Clock** | 10 s per move plus a 45 s reserve. Run out and a deterministic autopilot moves for you. Three timeouts is a forfeit. |

### Champions

Every stone you flip charges your Ultimate. The meter caps at the cost, so you can't bank charge. Casting an Ultimate uses your whole turn. When **6 or fewer hexes** remain, the *Final Phase* seals all Ultimates, so you can't just hoard for a last-second swing.

| Champion | Ultimate | Cost | Effect |
|---|---|---|---|
| **Vex**, Demolitionist | Detonate | 20 | Destroys enemy stones in a 7-hex blast. The craters are unplayable for 2 turns. |
| **Aegis**, Warden | Bastion | 32 | One of your stones and all touching allies become permanently unflippable. |
| **Nyx**, Assassin | Shadow Step | 28 | Place on any empty hex except corners and Runes, even without a capture. |
| **Kael**, Warlord | Rally | 22 | Adjacent enemy stones (not corners) defect to you. |
| **Mira**, Chronomancer | Rewind | 16 | Erases the opponent's last move (an erased Ultimate stays spent), then you move. |

Costs were tuned with thousands of bot-vs-bot games (`npm run sim`). The target was each champion winning roughly 45–55% at mid skill, with about 1.5 casts per player per game.

## Ranked & progression

- **Tiers:** Iron, Bronze, Silver, Gold, Platinum, Emerald, Diamond (divisions IV→I, 100 LP each), then Master, Grandmaster (200 LP) and Challenger (500 LP).
- **Placements:** 5 games, then a big placement reveal. Placement is capped at Emerald IV.
- **Hidden MMR (Elo):** sizes each game's LP. You gain `clamp(20 + (MMR − rankMMR)/25, 12, 30)` and lose `clamp(20 − gap/25, 10, 28)`. If you're better than your rank, you climb faster.
- **Ascension match:** reaching 100 LP in division I unlocks one tier-up match. Win it to promote. Lose it and you take a normal loss; there's no series to reset. (Riot dropped Bo3 promos, and so did we.)
- **Safety nets:** a loss that would take you below 0 LP only drops you to 0. You're demoted on the next loss at 0 LP. New tiers come with a 3-game demotion shield.
- **Hot streak:** +2 LP per win while you're on a 3+ win streak.
- **Splits:** two-week seasons computed from the calendar, then a soft MMR reset, 3 re-placement games, and your peak rank saved to your profile.
- **Loop:** champion mastery (M1–M7), 3 daily quests (one reroll per day), First Win of the Day, Essence to spend on stone skins, arenas and titles, a daily puzzle (the same position for everyone, with a Wordle-style shareable result), and a post-game engine review that tags your moves Brilliant/Best/Mistake/Blunder and gives an accuracy score.

Progress is stored in `localStorage` in the player's browser.

## Online play

Online play uses **WebRTC data channels** via [PeerJS](https://peerjs.com), vendored at `vendor/peerjs.min.js`. Both browsers run the same deterministic engine and exchange only moves.

- **Signalling:** by default this uses the free PeerJS cloud server, which is only needed to introduce the two peers. To use your own signalling server (`npx peerjs --port 9000 --path /yaja`), add `?peerhost=your.host&peerport=9000&peerpath=/yaja&peersecure=0` to the URL. Invite links keep these parameters.
- **Quick Match:** players race to claim one of a few well-known "queue slot" peer IDs. Whoever finds a slot taken connects to its owner. If nobody else is queueing, you're offered a Ranked game instead.
- **Networks:** only public STUN servers are configured, so a few strict corporate or symmetric NATs can fail to connect. Adding a TURN server to `iceServers` in `js/net.js` fixes that.
- **Rating:** online games use a separate **Duel rating**. Ranked LP only comes from the AI ladder, because localStorage can be edited, so LP from peer games couldn't be trusted.
- **Liveness:** a heartbeat detects a vanished opponent within about 10 s, and that counts as a win for you.

## Code map

```
index.html          page shell + screens
css/style.css       "hextech obsidian" art direction, responsive down to phones
js/engine.js        pure rules (Node + browser), no DOM
js/ai.js            alpha-beta bots, rating → depth/noise/blunders, personalities, autopilot
js/rank.js          tiers/LP/MMR/placements/seasons, rival bots, quests, mastery, shop, persistence
js/art.js           procedural SVG: tier emblems, champion sigils, avatars
js/board.js         SVG board, hover previews, flip/ult animations, particles, 3D tilt
js/match.js         one match: turns, clocks, bots, remote peer, HUD, callouts, emotes
js/net.js           WebRTC rooms / quick match / heartbeat
js/app.js           lobby, queue, champ select, VS, results, ceremonies, review, puzzle, profile, ladder, shop
js/audio.js         WebAudio synth SFX (no audio files)
tests/              node --test unit tests
tools/balance.js    balance simulator
docs/DESIGN.md      design doc + review notes
```

Keyboard: <kbd>R</kbd> or <kbd>Q</kbd> arms your Ultimate, and <kbd>Esc</kbd> cancels it.
