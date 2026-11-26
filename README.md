# Coin Quake

A one-button cartoon coin pusher for the Vermilion arcade cabinet (portrait 1050x1680). The design, approved
decisions and roadmap are in [GAME_DESIGN.md](GAME_DESIGN.md).

**Phase 1 (this build): the playable core.**

- A swinging dropper carriage with a laser guide line, three gates (L/C/R), and a HOT tag that moves every 20–30 s
  and doubles the points of coins dropped through it.
- Rapier coin physics (flat cylinder coins, SIMD build) on a two-tier pusher, capped at 350 live coins.
- Coins pushed off the front return to your bank and score points; coins off the sides are lost.
- Cartoon look: toon shading, ink outlines, chunky outlined text, and placeholder procedural art.

## Controls

| Key | Action |
|---|---|
| Space / click | Tap to drop one coin; hold to stream 4 coins a second |
| C | +50 coins (the cabinet's credit button; key repeats are ignored) |
| F11 | Toggle fullscreen (desktop app) |
| Esc | Quit (desktop app) |

Free play is on: an empty bank refills after 10 s.

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
