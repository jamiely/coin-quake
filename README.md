# Coin Quake

A one-button cartoon coin pusher for the Vermilion arcade cabinet (portrait 1050x1680). The design, approved
decisions and roadmap are in [GAME_DESIGN.md](GAME_DESIGN.md).

**This build:**

- **The machine:**
  - A swinging dropper carriage with a laser guide line, three gates (L/C/R), and a HOT tag that moves every
    20–30 s and doubles the points of coins dropped through it.
  - The Works over the drop zone: gear, peg field, BONUS slot, pipe loop, flippers and Tesla coils.
  - Rapier coin physics on four pusher tiers, capped at 350 live coins.
  - A random starting structure (ring tower, pyramid, columns, wall) in cobalt coins, revealed and named at the
    start, with a TIMBER! when it falls.
- **Runs with an ending:**
  - A press starts a run with 200 coins. Coins pushed off the front score points and refill the stock; coins off
    the sides are lost.
  - At 3:00 comes LAST CALL: refills stop, a hoarded stock is capped at 120, and the run ends within 75 s.
  - A final push, then the GAME OVER finale (an original "Jackpot March"), one-button initials (tap: next letter,
    0.35 s hold: lock it), the high-score table (saved locally) and play again on a freshly built machine.
  - Bot runs on the real physics last 3–5 minutes.
- **Juice:** shake, hit-stop, flashes, slow-mo, particles, popups, QUAKE fever, coin dumps and prize-toy banners.
  The screen only shakes on your drops and on big events, never on ambient machine activity.
- **Cartoon look:** toon shading, ink outlines, chunky outlined text, and placeholder procedural art.

## Controls

| Key | Action |
|---|---|
| Space / click | Tap to drop one coin; hold to stream 4 coins a second |
| C | The cabinet's credit button: free play needs no credits, so it only plays a jingle (hold 1.5 s to exit is handled by the cabinet's AutoHotkey script) |
| F11 | Toggle fullscreen (desktop app) |
| Esc | Quit (desktop app) |

Free play: every run starts with 200 coins and needs no credits. Debug keys with `?debug`: S fills the machine, Q
QUAKEs, D dumps, L calls Last Call.

## Development

```bash
npm install
npm run dev          # http://localhost:5173
npm test             # rules and physics (Node)
npm run coverage     # with the 90% gate
npm run build        # single self-contained dist/index.html (works from file://)
npm run electron:smoke
```

URL flags: `?seed=N` makes a run deterministic; `?debug` shows the perf HUD (fps, physics and render ms, coin
count, draw calls), and **S** fills the machine to the body cap as a stress test.

Coin-pile physics benchmark (no rendering): `node scripts/bench-coins.mjs [coins] [seconds] [hz] [substeps]`,
with `SHAPE=cyl|round|box|hull|ball` and `IT=<solver iterations>`.

## Desktop and cabinet

`npm run build:electron:win` builds `Coin-Quake-<version>-win-x64-portable.exe`. Every push to `main` publishes
it to the GitHub `latest` release, which the cabinet's daily updater installs. The window fills the display it
opens on; `--fullscreen` starts it fullscreen (LaunchBox passes this flag).

## Art still needed

Placeholder art is procedural (canvas textures and primitives). Painted art in the Lumberjack style is still
needed for:

- the title logo (chunky carved lettering);
- the factory back wall;
- Professor Pockets (sprite sheet: idle, cheer, panic, faint, special-move poses and a cut-in portrait);
- Bolt, the robot on the dropper (idle, throw, special moves, cut-in portrait);
- the Rotlings (8 brainrot characters, each with a name card and a figure-token sprite);
- comic burst bubbles (POW, KA-CHING, K.O.) and title-card lettering;
- one backdrop and palette per floor (Candy Works, Volcano Boiler, Ice Vault, Space Lab, Treasure Core).
