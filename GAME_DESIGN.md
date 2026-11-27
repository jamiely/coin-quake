# Coin Quake: game design

> Working title **Coin Quake**, repo `coin-quake` (`/Users/jamiely/code/coin-quake`, GitHub `jamiely/coin-quake`).
> Status: approved by the user (decisions 1a 2a 3a 4a 5a 6a 7a). Phase 1 next.

A one-button 3D coin pusher for the Vermilion cabinet (portrait 1050x1680). It plays like Neon Reef
(`/Users/jamiely/code/vicky`): you drop, the pusher shoves, and things fall off the front edge. Three things are
turned up much further than in Neon Reef:

1. **Aim.** A swinging dropper lets one button pick where each coin lands.
2. **Contraptions.** The machine is stacked with moving mechanisms, and every one of them reacts to coins.
3. **Juice.** Every event has a matching shake, flash, particle burst, sound and light show, and these escalate
   with your streak.

---

## 1. Theme

**A mad inventor's coin factory that is about to blow.** The cabinet is a neon-and-brass machine: gears,
copper pipes, Tesla coils, pressure gauges and warning lights. It is part candy-colored arcade and part
Wallace & Gromit contraption. Coins are minted at the top, tumble through machinery, get pushed off the bottom,
and are counted by a huge mechanical counter.

The factory has a **pressure gauge**, the game's single big meter. Everything you do raises the pressure. As it
climbs, the machine looks and sounds more unstable: needles shake, steam vents, lights flicker, the music speeds
up. At 100% it **QUAKES**: the cabinet erupts into Fever mode (§4.5). This gives the whole game one readable
arc: calm → rattling → overload → explosion → calm again.

### Art style: cartoony, like Lumberjack and Bajillionaire

Not Neon Reef's glossy realism. Think a Saturday-morning cartoon machine: chunky rounded shapes, thick dark
outlines, flat bright colors with one shadow tone, exaggerated proportions, and everything a little wobbly and
alive. The reference is Lumberjack's art (`lumberjack/lumberjack2/docs/game-screenshot.png`): bold ink outlines,
saturated greens and oranges, a carved chunky title logo, and a big-eyed friendly character.

- **Rendering:** 3D with **toon shading** (`MeshToonMaterial` with a 3-step gradient ramp) and **ink outlines**
  (inverted-hull outlines on the large pieces, plus a cheap screen-space edge pass on the whole frame if the budget
  allows). Bloom stays, but only on coins, lights and effects, so the cartoon reads clean and isn't hazy.
- **Shapes:** fat, bevelled, slightly irregular. Gears have big teeth, pipes are fat and bendy, rivets are oversized,
  the coins are thick, chunky gold discs with a star stamp and a white highlight "glint" sprite.
- **Palette:** sunny gold coins; a cherry-red and cream cabinet with mint-green and sky-blue accents; dark plum
  outlines (never pure black). Hazard stripes in yellow and black appear only during escalation.
- **Characters:** the cast carries the cartoon feel.
  - **Professor Pockets,** the mad inventor: wild white hair and goggles. She pops up in a window on the topper and
    reacts to everything: cheering, panicking at high pressure, wiping her brow, fainting on a jackpot.
  - **Bolt,** a small round robot who rides the dropper carriage and "throws" each coin with a little animation.
  - **The machine itself** has googly gauge eyes on the topper that look at the action, and a big lever arm that
    "breathes" in attract mode.
- **Cartoon effects:** juice gets drawn in the cartoon language too: comic impact stars and "POW"/"KA-CHING"
  burst bubbles, speed lines on fast coins, puffy cartoon smoke and steam, squash and stretch on everything, wobble
  when something gets hit, and bouncy text with outlines.
- **Assets:** 2D painted art (backdrop wall, title logo, character sprite sheets, burst bubbles) drawn or
  AI-generated in Lumberjack's style and used as textures and sprites in the 3D scene. The machine geometry stays
  procedural so it can move and react. Sound stays synthesized.
- **Original work:** no borrowed logos, characters or audio.

## 2. Core loop

```
press → coin drops from the swinging dropper → falls through the upper contraptions → lands on the pusher
tray → pusher shoves → coins and prizes fall off the front → payouts, meters, events → bigger effects → press
```

### 2.1 The one button (Space)

| Input | Effect |
|---|---|
| **Tap** | Drop one coin from the dropper's current position. |
| **Hold** | Auto-drop a stream (4 coins/s) while the dropper keeps swinging. You "spray" coins across the field. |
| **Tap during an event prompt** | The same button does the event action (stop a wheel, fire a cannon, catch a bonus). There is never a second control. |
| **C** (credit button) | +credits (5 credits = 50 coins per press, like Neon Reef's batch). The cabinet's 1.5 s hold-to-exit stays in JoyToKey/AHK; the game ignores key repeats. |

### 2.2 Aiming: the swinging dropper

A brass **dropper carriage** (a crane claw holding a coin) swings left↔right across the top on a pendulum.
Its motion is a smooth sine with a slight pause at each end, so it is easy to read. A coin drops from wherever the
carriage is.

- The carriage casts a **laser guide line** straight down, so you see exactly where the coin will enter.
- Three **entry gates** under the swing (Left / Center / Right) light up when the carriage passes over them,
  and route the coin into different upper contraptions (§3.1). Aiming is a choice of *route*, not pixel precision.
- The swing speed changes with mode: slow in calm play, faster as pressure rises (more skill and more chaos),
  and frozen in the center during some events.
- **Anti-dominance:** Neon Reef measured that a fixed aim makes one side dominant (66% vs 31%). Here the best
  target **moves**. The bonus wheel's lit segment rotates, the "HOT" gate tag jumps every 20–30 s, and the
  conveyor reverses. The best spot keeps changing, so aiming stays a live decision and never gets solved.
- **No-skill play still works:** holding the button sprays everywhere and still feeds the machine. Aiming adds
  value but is never required.

### 2.3 Economy

- Coins drop from your bank (**COINS**). Coins pushed off the front edge pay back into **COINS** (that is the
  pusher's core reward) and also add **POINTS**, the score that matters.
- Off the sides: lost, with a sad trombone and a little smoke puff.
- **Prizes** (big tokens, gems, gift boxes, the Golden Gear) push off for big POINTS and trigger events.
- **Pressure** (0–100%) rises from coin hits on contraptions, combos and prizes, and drains slowly when idle.
- Tray contents persist through the session (like Neon Reef), so the shelf builds into a "nearly falling"
  overhang. That tension *is* the pusher fantasy, and the camera should play it up (§4.4).

## 3. The machine and its contraptions

From top to bottom the cabinet has four zones (see the layout in §6). Each contraption has a **hit reaction**
(it must visibly react to every coin) and a **payoff** (what it gives).

### 3.1 Zone A: the Mint (top 20%)

| Contraption | Behavior | Payoff |
|---|---|---|
| **Dropper carriage** | Pendulum crane with a laser line; claw opens on drop with a puff of steam | — |
| **Entry gates L/C/R** | Light up when the carriage passes; one is tagged **HOT** (×2) and the tag moves | Routes the coin; HOT doubles that coin's points |
| **Coin Press** | Each coin passes under a stamping press that slams down (shake +1, sparks) | Every 10th coin is stamped **GOLD** (worth 5) |

### 3.2 Zone B: the Works (next 30%), the playfield above the pusher

Coins fall through this zone with real physics. It is the "lots to see" zone.

| Contraption | Behavior | Payoff |
|---|---|---|
| **Gear Wheel** (left route) | A big vertical gear with coin pockets rotating like a waterwheel; coins ride it round and are flung out | Each fling adds pressure; a full rotation with all pockets filled gives **GEAR BONUS** (+5 coins) |
| **Spinner Pegs** (center route) | A short peg field of brass bumpers that light and *ding* on hit; three bumpers are spring-loaded kickers | Each bumper hit is a combo step (§4.2) |
| **Copper Pipe Loop** (right route) | A transparent tube that loops the loop; the coin visibly races round and exits fast | Loop completion fires a **SPEED** popup and +3 pressure |
| **Bonus Wheel** | A large lit prize wheel behind the Works; the slot under it starts a spin | Segments: +10 coins, +25 coins, PRIZE DROP, ×2 (30 s), PRESSURE +25, **QUAKE** |
| **Flippers** | Two auto-flippers at the bottom of the Works that fire when a coin is near (no player control); they kick coins sideways toward the tray edges | Pure spectacle and spread; occasionally "rescue" a coin into the Lucky Slot |
| **Lucky Slot** | A narrow slot between the flippers, hard to hit | **PRIZE DROP** plus a small fireworks |
| **Tesla Coils** (both sides) | Arc lightning to coins passing nearby; the arc chains coin to coin | Electrified coins glow and pay ×2 on exit |

### 3.3 Zone C: the Pusher tray (next 35%), the heart of the game

| Contraption | Behavior | Payoff |
|---|---|---|
| **Pusher shelf** | Two-tier pusher (upper shelf drops coins onto the lower tray), like real cabinets | Core |
| **Conveyor belt** | A belt across the upper shelf that carries coins sideways and reverses direction every 20–30 s | Feeds the pile unevenly; makes aim matter |
| **Coin Elevator** | A paternoster lift on the right side wall that scoops side-bound coins *some* of the time and carries them back to the top (visible bucket chain) | Partial rescue; it looks great |
| **Wall Bumpers** | Side walls get spring bumpers during Fever, so fewer coins are lost | Fever only |
| **Prize Pedestal** | A turntable on the tray showing the current big prize (Golden Gear, Gem Chest); the prize rides the pile | Push it off for a jackpot event |
| **Sweeper Arm** (event) | A huge mechanical arm that swings across the tray and shoves the whole pile forward | Avalanche event (§3.5) |
| **Shake Table** (event) | The tray vibrates hard for 3 s, which walks the overhang off the edge | Tremor event |

### 3.4 Zone D: the Counting House (bottom 15%)

| Element | Behavior |
|---|---|
| **Front-edge chute** | Coins fall into a lit trough with a cascading LED wave on every drop |
| **Mechanical counter** | A giant flip-digit counter for POINTS; digits physically flip, and big wins spin it like a slot reel |
| **Pressure gauge** | A huge needle gauge with a glass face; it cracks visually at 90%+ |
| **Coin bank tube** | A clear tube that fills with your COINS (visible stack height), drains as you drop and fills as you win |
| **Prize shelf** | Trophy shelf that shows prizes won this session |

### 3.5 Events and bonus machines

Events fire from the Bonus Wheel, pressure thresholds, or prize pushes. Only one **major** event runs at a time;
**minor** events can overlap. Each has a clear title card (§4.6).

| Event | Trigger | What happens | Button role |
|---|---|---|---|
| **Coin Shower** (minor) | Wheel +25 | 25 coins rain from pipes across the top; brief slow-mo as the first ones hit | — |
| **Prize Drop** (minor) | Wheel, Lucky Slot | A gift box parachutes from the ceiling onto the pile | — |
| **Tremor** (minor) | Pressure 50% | Shake Table for 3 s | — |
| **Avalanche** (major) | Pressure 75%, wheel | Sweeper Arm swings across: a big push and a large camera move | Tap to swing it a second time (once) |
| **Cannon Barrage** (major) | Wheel | A coin cannon pops out of the Mint and the dropper becomes the cannon; each tap fires a burst of 5 coins | Tap to fire (10 shots) |
| **Slot Machine** (major) | Wheel | The flip counter becomes three reels; tap stops each reel; 3-of-a-kind pays big | Tap ×3 |
| **Golden Gear Jackpot** (major) | Push the Golden Gear off | Full jackpot show (§4.7); pays the progressive jackpot | — |
| **QUAKE / Fever** (major) | Pressure 100%, wheel QUAKE | 25 s Fever: everything ×3, wall bumpers up, dropper swings fast, coin stream free (holding drops without spending), constant light show | Hold to spray |
| **Overdrive** (meta) | 3 Quakes in one session | The cabinet "explodes": a white-out, then a remixed, gold-plated machine for 60 s with ×5 everything | Hold to spray |
| **Warp** (major) | A coin enters an open warp portal | The camera dives through the portal into a 20–30 s bonus world (§3.6.3), then pops back out | Depends on the world |
| **Breakthrough** (meta) | The level's Crack meter fills | The tray floor shatters and the whole game falls to the next level (§3.6.1) | — |

### 3.6 Levels, breakthroughs and warps

The factory is a tower of floors, and you dig **down** through it. Each floor is a new machine with its own
look, contraptions, music and prize. Getting to the next floor is the biggest moment in the game.

#### 3.6.1 Breaking through

- Each level has a **Crack meter** on the tray floor itself: hairline cracks spread across the floor as you
  score, so progress is drawn right in the playfield. Prizes pushed off and Quakes crack it the most.
- When it fills, a **Breakthrough** fires (~5 s, weight 5):
  1. The floor groans; cracks glow orange; Professor Pockets panics in her window; the pile jiggles.
  2. Hit-stop, then the floor **shatters** into chunky cartoon tiles. The whole pile (coins, prizes, everything)
     falls, and the camera falls with it, with speed lines and debris flying past.
  3. A whoosh through a short "between floors" shaft (pipes, signs: `FLOOR 2: THE CANDY WORKS`).
  4. Everything crash-lands onto the new level's tray: max shake, a dust ring, coins bouncing everywhere,
     a `LEVEL 2!` title card. The coins you had carry over, so the new floor starts with a big pile and a payday.
- The pressure gauge resets, the next Crack meter starts, and the new floor's parts install one by one, so
  every level has its own little "the machine grows" arc (§5.2).

#### 3.6.2 The floors

Six themed floors. Each keeps the core (dropper, gates, pusher, chute and counter) and swaps in 2–3 signature
contraptions, a palette, a music key and tempo, and a level prize. After floor 6 the game loops to floor 1 in
"gold" with ×2 values, so the shift never ends.

| # | Floor | Look | Signature contraptions | Level prize |
|---|---|---|---|---|
| 1 | **The Mint** | Brass, cream and cherry red | Coin Press, Gear Wheel, Spinner Pegs | Golden Gear |
| 2 | **The Candy Works** | Pink, mint, sprinkles | Taffy pullers that stretch and fling coins, a gumball wheel, a chocolate conveyor | Gumball Crown |
| 3 | **The Volcano Boiler** | Orange, charcoal, lava glow | Lava geysers that launch coins up, a rotating cauldron, steam pistons | Magma Gem |
| 4 | **The Ice Vault** | Sky blue, white | Slippery ice tray (coins slide further), a snowball roller, icicle flippers that break | Frozen Diamond |
| 5 | **The Space Lab** | Purple, neon green, stars | Low-gravity zone (coins float), a UFO claw that grabs and drops coins, a rocket that blasts off with a coin load | Moon Rock |
| 6 | **The Treasure Core** | Gold everywhere | Every earlier signature in one machine, a giant piggy bank that bursts | The Mother Lode (progressive jackpot) |

#### 3.6.3 Warps

Warp portals are swirling cartoon vortexes (spiral texture, sparkle rim, and a slurping sound when a coin goes
in).

- **Coin warps (minor, always on from floor 2):** paired portals in the Works. A coin that falls into the blue
  portal pops out of the orange one somewhere else, with a puff and a speed-line burst. One pair warps coins
  straight onto the lower tray's front edge, which is a jackpot route worth aiming for. The pairs swap
  positions every 30 s, so the aim target keeps moving.
- **Warp gate (major):** the Bonus Wheel and the Lucky Slot can open a big portal in the center of the Works for
  10 s. Drop a coin in and the camera **dives through it** (zoom, spiral, white-out) into a bonus world.
- **Bonus worlds** (20–30 s each, one button, then you pop back out of the portal with the winnings raining down
  onto the tray):
  - **Coin River:** a waterfall of coins pours down; tap to swing a bucket under the biggest streams.
  - **Sky Drop:** you're a coin falling through clouds of bumpers; holding steers left and releasing drifts right.
    Every bumper is cash.
  - **Piggy Smash:** a giant piggy bank; tap rhythmically to hammer it as it cracks. The faster you tap, the more
    coins it bursts into.
  - **Floor Skip:** rare. You fall straight through the next floor (a breakthrough without filling the meter).
- **Warp juice:** the camera FOV stretches like a rubber band, a spiral wipe transitions in and out, colors invert
  for a frame, and the music pitches up through the dive and drops back on exit.

## 4. Juice

The rule: **every event has five channels**, which are *shake*, *light*, *particles*, *sound* and *text*,
scaled by an event **weight** (1 tiny … 5 jackpot). One `juice(event, weight, position)` call fans out to every
channel, so juice is consistent and tunable from one table.

### 4.1 The catalogue

| Effect | Implementation | Used for |
|---|---|---|
| **Screen shake** | Trauma model: `trauma += w²·k`, shake = trauma², decays ~1.5/s. Offset and roll use Perlin noise, not random jitter, so it feels physical. Directional kicks for impacts (camera nudged away from the hit). | Press slam (tiny), bumper (tiny), coin wave (small), avalanche (big), jackpot (max) |
| **Hit-stop** | Freeze the *simulation* (not rendering or sound) for 30–120 ms on big impacts; particles and lights keep animating | Lucky slot, prize lands, prize falls off, wheel stop on QUAKE |
| **Slow-mo** | Time scale ramps to 0.25 for 0.6–1.5 s, then eases back; music low-pass filtered during it | First coin of Coin Shower, prize teetering on the edge (§4.4), jackpot moment |
| **Flashes** | Full-screen additive flash (white, gold or magenta), 1–4 frames; plus a per-object emissive flash | Every payout tier; jackpot is a 3-pulse strobe |
| **Chromatic pulse / zoom punch** | Brief FOV punch (−3° for 100 ms) plus a small RGB split on max events | Weight 4–5 only |
| **Particles** | GPU instanced pool: sparks (press, Tesla), coin sparkle trails, steam puffs, confetti, fireworks, "coin fountain" bursts from the chute | Everywhere; a fixed budget (§7) |
| **Lightning** | Procedural jagged line strips with bloom, re-randomized each frame | Tesla coils, Quake start |
| **Light show** | Every LED (marquee chasers, gate lights, wheel bulbs, side strips) is one instanced mesh driven by named *patterns*: chase, sparkle, wipe, strobe, rainbow, "heartbeat" | Mode-specific; patterns escalate with pressure |
| **Camera moves** | A rig with named shots: *home*, *tray close-up*, *edge-teeter*, *wheel*, *jackpot orbit*. Eased dolly transitions (0.4–0.8 s), always back to *home* | Events and teetering |
| **Popups** | World-anchored text ("+5", "GOLD!", "SPEED!", "×2") that springs up with scale overshoot, then fades; colored by tier | Every payout |
| **Squash and stretch** | Coins squash on landing; bumpers and the press stretch on hit; the counter digits bounce | Constant, cheap, adds life |
| **Coin trails** | Short ribbon trails on fast coins (loop exit, cannon, flipper kicks) | Speed reads |
| **Steam vents** | Pipes blast steam (sprite sheets) at pressure milestones | Pressure 25/50/75/100 |
| **Gauge crack** | A glass-crack decal on the gauge at 90%, shattering to particles at Quake | Quake build-up |
| **Rumble lights** | The cabinet's virtual bezel lights pulse with the music beat | Always on; tempo follows pressure |

### 4.2 Combos

- A **combo** is a chain of hits on contraptions by coins in play, with each hit within 1.5 s of the previous.
- The combo counter shows as a big rotating stamp beside the Works: `COMBO ×7`.
- Each step raises the **pitch** of the hit sound (a musical scale, Peggle-style), raises particle count, and adds
  a little pressure.
- At ×10, ×25 and ×50 there is a milestone: a flash, an announcer stinger, a shake and a bonus.
- A dropped combo makes a soft "fizzle" sound and the counter falls away. It is never punishing.

### 4.3 Escalation ladder

The machine's whole presentation is driven by **pressure tier**. Each tier layers on top of the last:

| Tier | Pressure | Look | Sound |
|---|---|---|---|
| 0 Calm | 0–24% | Steady cyan lights, slow dropper, gentle bloom | 100 BPM groove, light |
| 1 Warm | 25–49% | Lights chase faster, occasional steam, gauge needle twitch | +percussion layer |
| 2 Hot | 50–74% | Magenta, sparks from pipes, constant micro-shake (very small), Tesla arcs more often | +bass layer, 110 BPM |
| 3 Critical | 75–99% | Red hazard stripes, warning klaxon light spins, gauge cracks, camera breathes in and out | +alarm synth, 120 BPM |
| QUAKE | 100% | Everything at once: rainbow strobe, fireworks, ×3, full shake on start | Fever track, 140 BPM |

### 4.4 Tension moments (the pusher's best drama)

- **Edge teeter:** when a prize or a large coin overhang sits within a few cm of the front edge, the camera
  eases toward the edge, the music drops to a heartbeat, and slow-mo kicks in if it starts to tip. When it falls
  there is a hit-stop, a big flash and a cash-register burst. When it doesn't, it slowly eases back.
- **Pile meter:** a subtle "overhang" glow on the front edge shows how close the pile is to spilling.

### 4.5 Fever (QUAKE)

A 25 s state where the whole machine goes berserk: ×3 payouts, free coin stream, wall bumpers, fast dropper,
lightning everywhere, the Bonus Wheel spinning on its own, and constant confetti. It ends with a "cool-down"
sequence: steam venting, lights fading to cyan, and the tally rolling up on the counter.

### 4.5a Close-up zooms

The camera is an active director, not a fixed view. It **punches in** on the action and snaps back, like a
sports replay:

- **Snap zooms** (0.15 s in, 0.4 s hold, 0.5 s ease out) onto: a coin in the Lucky Slot, a prize landing, a
  coin entering a warp, the last coin before a breakthrough, the wheel's pointer as it stops.
- **Edge cam:** a low close-up along the front edge as a prize teeters, with slow-mo (§4.4).
- **Split-second freeze-frame:** on the biggest hits the frame freezes, desaturates, a comic halftone burst
  appears behind the object with a label (`LUCKY!`, `JACKPOT!`), then it whips back to full speed.
- **Picture-in-picture:** when two things happen at once (a warp while a prize teeters), the second gets a
  small inset "replay" window in a comic panel frame, so nothing is missed.
- **Rules:** at most one full zoom per 2 s, zooms never start while the player's coin is mid-air over the gates,
  and the home framing always returns within 1.5 s, so the playfield stays readable.

### 4.5b Special moves (fighting-game style)

Big events are performed as **special moves** by the cast, staged like a fighting-game super: a
screen-darkening freeze, a character cut-in, a move name, then an over-the-top attack on the machine.

- **The super flash:** the screen dims to 30%, a speed-line background sweeps in, and a diagonal **cut-in
  panel** slides across with the character's face (eyes glinting), a move name in huge outlined letters, and a
  bass "KSHHH" hit. That takes 0.6 s, then the action plays.
- **Moves:**

  | Move | Who | Trigger | Animation |
  |---|---|---|---|
  | **Hundred-Hand Slap** | Bolt | Combo ×25 | Bolt jumps off the dropper and slaps the pile in a blur of arms; afterimages, impact stars on every hit, and the pile shoves forward in pulses |
  | **Rocket Uppercut** | Bolt | Lucky Slot | Bolt drills up through the Works with a flaming fist; every peg it passes pays out and flashes |
  | **Gear Grinder Spin** | Bolt | Gear Bonus | Bolt spins like a top along the shelf; coins spiral out in a vortex |
  | **Quake Stomp** | Professor Pockets | QUAKE | She leaps out of her window and ground-pounds the cabinet. The whole machine jumps, the camera bounces, and coins fly off every surface (this starts Fever) |
  | **Kamehamecoin** | Professor Pockets | Avalanche | She charges a glowing coin beam (a rising whine, the screen shaking more and more) and fires it across the tray, which shoves the whole pile |
  | **Final Mint** | Both (tag-team super) | Breakthrough | A double cut-in; Bolt is hurled down like a meteor and smashes through the floor (this starts the breakthrough fall) |

- **Fighting-game language everywhere:** a hit counter (`12 HITS!`) during multi-hit moves, a
  `K.O.!`-style stamp when a prize falls (`K.O.`, `PERFECT`, `FLAWLESS` if no coins went off the sides), and a
  `ROUND 2` / `FIGHT!` banner when a new floor starts.
- **Animation:** the characters are 2D cartoon sprite sheets (anticipation, action and recovery frames, with
  smear frames) on billboards in the 3D scene, so moves stay cheap and expressive. Each move is under 3 s, and the
  sim resumes as soon as the move connects.

### 4.5c Unhinged mode

The game should feel a little bit crazy, as if the machine has a mind of its own and it is not well. Random
nonsense keeps the screen surprising, and it gets more frequent as pressure rises (every 40–90 s at tier 0, every
10–20 s at tier 3).

- **Machine tantrums:** the cabinet sneezes a cloud of coins; the gauge eyes go cross-eyed and spin; the topper
  hiccups and the whole frame jumps; the counter briefly counts *backwards* in panic, then corrects with a
  sheepish "boing".
- **Cameos:** a cartoon pigeon lands on the dropper and rides it; a tiny UFO abducts one coin and returns it as
  10; a shark fin swims through the coin pile; a giant hand reaches in from off-screen and flicks a coin.
- **Physics gags:** coins briefly turn to jelly and wobble; gravity flips for one second ("WHOOPS") and the pile
  floats, then crashes down; a coin grows to 10x size and rolls through the pile like a boulder.
- **Visual madness during Fever:** the screen tilts like a Dutch angle, the background explodes into a
  rainbow kaleidoscope, rainbow-trail coins, disco ball and dancing silhouettes, and the cast goes into
  victory dances.
- **Rules for the crazy:** gags never cost the player (they pay a little or are neutral), never cover the tray
  for more than 1 s, and none repeats in a row. Each is in the debug menu with a "trigger now" button.

### 4.5d Brainrot and pop culture

The machine is infested with internet brainrot. A roster of meme creatures ("the Rotlings") lives in the
cabinet, shows up in gags and events, and gets its own collectible prizes.

**IP rule:** this repo and its releases are public, so every character is our own drawing and our own name, in
the *style* of a meme and never a copy of someone's character or logo. The Italian-brainrot format (an absurd
hybrid creature with a sing-song fake-Italian name, announced in a dramatic voice) is a format, not a
character, and that is what we borrow. We never use real brand logos, or named franchise characters such as Skibidi Toilet, Mario or
Pokémon.

#### The Rotlings (original brainrot cast)

| Rotling | Bit | Where it shows up |
|---|---|---|
| **Coinzilla Spaghettini** | A tiny kaiju made of spaghetti with a coin for a head | Stomps across the tray during Avalanche; each footstep shoves the pile |
| **Bombardino Pizzarino** | A pizza-slice bomber plane | Flies over the Works and carpet-bombs coins (a Coin Shower variant) |
| **Tunga Tunga Tostino** | A wooden toaster with a bat that bonks things on a beat | Bonks the pusher in rhythm with the music; each bonk is a mini-shove |
| **Ballerina Pistachina** | A pistachio ballerina | Pirouettes on the Prize Pedestal and spins the prize toward the edge |
| **Frigo Frigorino** | A fridge with flamingo legs | Opens its door and dumps frosty coins (Ice Vault floor host) |
| **Gnocchi Gangster** | A gnocchi in a fedora, with sunglasses | Steals a coin, then drops 10 in apology ("mi dispiace") |
| **Sahur Drum Bean** | A coffee bean banging a drum | Drums the countdown before Quake: 3 beats, then STOMP |
| **Tralalino Sneakerfish** | A fish wearing three huge sneakers | Swims through the coin pile like the shark fin, with a squeak per step |

- **Intro cards:** the first time a Rotling appears in a session it gets a fighting-game-style **name card**:
  freeze, a dramatic zoom, its name in giant wobbly letters, and a synthesized "announcer" chord stinger.
  Repeat appearances skip the card.
- **Collectible Rotling figures:** each one is also a rare prize (a chunky vinyl-figure token) that can land on
  the tray. Push one off and it joins the Prize Shelf. Collect all 8 for a **Rot Council** super event: every
  Rotling appears at once and the machine loses its mind for 15 s.

#### Pop-culture riffs (parodies, never the real thing)

- **Gaming:** a **combo announcer** cadence ("DOUBLE KILL... TRIPLE... COIN-TACULAR!"); a **"FINISH HIM"**-style
  prompt before a prize falls (`PUSH IT!`); a **battle-royale storm** event where the edge of the tray closes in
  and pushes coins to the center; a **speedrun timer** that pops up during warps (`WR PACE!`); a **loot-box
  crate** prize that opens with a rarity-color beam (common grey to legendary gold).
- **Internet:** an **"it's over 9000"**-style scouter that reads the combo and explodes; a **stonks**
  arrow when the counter climbs fast; **"bro really said"** captions on gags; **"W" and "L" stamps** for
  coins that score or fall off the sides; an **"aura +1000"** popup on Lucky Slot hits; **sigma
  stare** freeze-frames on a perfect drop; a **"skill issue"** caption on side losses (gentle, never insulting).
- **Movies and TV, as parodies:** a **heist** Breakthrough variant (laser grid, a "we're in" caption, a
  safe-cracking dial); a **kaiju** floor alert with an emergency-broadcast crawl along the bottom; a
  **game-show** wheel host voice for the Bonus Wheel; **"previously on Coin Quake"** recaps in attract mode.
- **Music:** the Fever track has a **beat drop** with an airhorn-style synth blast, and a **phonk-style** remix
  plays in Overdrive.
- **Rotating:** memes age fast, so captions and gag text live in one data file (`src/content/memes.ts`) that
  is easy to update without touching code.

### 4.6 Title cards

Every major event opens with a 0.8 s title card: big chunky 3D-ish text that slams in with shake and dust
(`AVALANCHE!`, `CANNON BARRAGE!`, `QUAKE!!!`). It sits in the upper third so it never covers the tray.

### 4.7 The jackpot show (weight 5, ~6 s)

1. Hit-stop 150 ms, white flash, max trauma.
2. Slow-mo 0.25 as the Golden Gear falls; the camera orbits it.
3. Sirens and the topper beacon spinning; every LED strobes gold.
4. Coin fountain erupts from the chute: 200 particle coins plus 30 real physics coins rain onto the tray.
5. The counter spins like a slot reel and lands on the jackpot amount; fireworks.
6. Ease back to *home*; the jackpot resets with a fill-up animation.

## 5. Sound, progression, attract mode and credits

### 5.1 Sound

Synthesized Web Audio, reusing Neon Reef's `SoundEngine` (buses, compressor, limiter, voice cap, unlock on first
input, remembered mute).

- **Layered adaptive music:** one track with stems (drums, bass, pad, lead, alarm) that fade in by pressure tier,
  plus a Fever track and a jackpot fanfare. The tempo steps with the tier.
- **Coin sounds** (the most frequent): 3–4 metallic clink variants, pitch-randomized, with a per-frame voice cap.
- **Contraption sounds:** each has a signature: press *THUNK-psst*, gear ratchet, bumper ding on a rising combo
  scale, Tesla crackle, pipe whoosh, wheel ticker, conveyor hum, elevator clank.
- **Announcer stingers:** synthesized vocoder-ish voices are hard to do well. Instead use **bold musical
  stingers** per event (a brass hit for Avalanche, a slot jingle for Slot, an air-raid riser for Quake). Optional
  later: a few short recorded or generated voice clips ("QUAKE!") if we accept asset files.
- **Ducking:** music ducks under jackpot and title stingers; slow-mo applies a low-pass and pitch-down.

### 5.2 Progression (within a session)

The cabinet has no accounts, so progression is in-session and visible:

- **Levels:** the main progression. You break down through six floors (§3.6); the current floor number and its
  name sit on the topper. A typical session reaches floor 2–3 in 10 minutes. The floor you reached is part of the
  high score.
- **Machine upgrades within a floor:** the floor's parts install one by one as the Crack meter fills, each with a
  short "install" animation (a crane lowers it in). On floor 1 that is: 1) Copper Pipe Loop, 2) Tesla Coils,
  3) Coin Elevator, 4) Conveyor, 5) Cannon event, 6) Golden Gear on the pedestal. Each floor starts simpler and
  visibly grows more over the top before it breaks.
- **Prize shelf** fills with trophies won.
- **High score** (top 5, local storage) shown on the attract loop, with 3-letter initials entered by one
  button (letters cycle, tap to confirm; times out to `AAA`).

> An option to discuss: all parts on from the start, which is simpler and maxes "lots to see" immediately.
> Growth gives a better arc and a reason to keep feeding credits. I recommend growth, with a fast curve:
> everything is unlocked within about 5 minutes.

### 5.3 Attract mode

After 30 s idle (or no credits), the machine plays itself: the dropper swings and drops on its own, the camera
does a slow cinematic tour (Mint → Works → tray close-up → counter), the lights run a demo show, and a "PRESS
TO PLAY" marquee pulses. Every 3rd loop a scripted mini-Quake shows off Fever. Attract runs muted or at low
volume (configurable), since a cabinet in a room should not blare.

### 5.4 Credits

> **Superseded (round 4):** endless free play with C credits was replaced by runs with an ending, modelled on Neon
> Reef. A press starts a run with 200 coins, and front payouts refill the stock. LAST CALL comes at 3:00: refills
> stop, the stock is capped at 120, and the run ends within 75 s. Then a final push, the GAME OVER finale, initials
> (0.35 s hold) and a local high-score table, then play again on a fresh machine. C only plays a jingle. Runs last
> 3–5 minutes (bot-measured).

- **C** adds 5 credits = 50 COINS (one press, no key repeat), with a "ka-ching" and coins visibly pouring into the
  bank tube.
- Free play mode is a config switch, on by default for a home cabinet. Coins still matter as the pusher
  resource; running out shows "PRESS C FOR COINS". Free play gives 50 coins after 10 s with no coins.
- The game never needs a second button. The C hold-to-exit is handled outside the game.

## 6. Portrait layout (1050x1680, primary)

Straight-on camera with a slight downward tilt, tray foreshortened. Everything fits without scrolling. The
HUD is integrated into the cabinet art (the counter, gauge and bank tube are 3D objects), so there is no DOM
overlay box.

```
┌──────────────────────────────────────┐  y=0
│  ◉◉  COIN QUAKE topper  ◉◉   JACKPOT  │  ~6%   marquee + progressive jackpot (7-seg)
│ ──────●═══(dropper swings)═══──────  │  ~5%   swing rail, laser line ↓
│   [ L ]      [ C·HOT ]      [ R ]    │  ~4%   entry gates
│  ╔═══╗     ▼ press ▼       ╭──╮      │
│  ║ ⚙ ║    · • · • · •     │  │ ⚡   │  ~28%  the Works: gear wheel | spinner pegs |
│  ║GEAR    • ◎ · ◎ · •      ╰─╮│      │        pipe loop; bonus wheel behind the center
│  ╚═══╝   (( BONUS WHEEL ))   ╰╯ ⚡   │        tesla coils on the sides
│     \\_ flipper  [LUCKY]  flipper _// │
│ ═══════ conveyor ⇄ upper shelf ═════ │  ~8%   upper pusher + conveyor
│ ┃▲  ●●●●●●●●●●●●●●●●●●●●●●●●●  ┃     │
│ ┃▲   ●●●●●● (GOLDEN GEAR) ●●●●  ┃    │  ~25%  lower tray + pile + prize pedestal
│ ┃▲ elevator  ●●●●●●●●●●●●●●●●●  ┃    │        (camera close-ups happen here)
│ ═══════════ FRONT EDGE ═══════════   │
│  ~~~~ LED chute wave ~~~~~~~~~~~~~   │  ~4%
│ [ 0 0 1 2 4 5 0 ] flip counter  (◔)  │  ~12%  POINTS counter, pressure gauge,
│  COINS ▮▮▮▮▮▯  bank tube   ×2  COMBO  │        coin bank tube, multiplier, combo
│        PRESS ● TO DROP               │  ~3%   prompt
└──────────────────────────────────────┘  y=1680
```

- **Landscape** (dev and other monitors): the same cabinet centered, with side art panels filling the extra
  width (copper pipes, gauges, decorative gears). There is no separate layout, just letterbox art.
- **Safe areas:** title cards in the top 35%, never over the tray. Popups are world-anchored. Text is at least
  32 px at cabinet resolution for reading from standing distance.
- Electron conventions as in the other games: fills the display it opens on, `--fullscreen` flag, F11 toggles.

## 7. Performance budget (cabinet PC)

**Hardware (read from the cabinet's registry over SSH):** Vermilion has an **NVIDIA GeForce RTX 3060** and an
**AMD Ryzen 5 5600** (6 cores, 12 threads). The GPU has plenty of headroom; the binding constraint is the
single-threaded physics step on the CPU. The game still measures frame time on the cabinet in Phase 1.

| Budget | Target |
|---|---|
| Frame rate | 60 fps locked at 1050x1680; drop to `pixelRatio` 0.85 automatically if frame time > 14 ms sustained |
| Frame time | ≤ 16.6 ms total: physics ≤ 3 ms, render ≤ 9 ms, game and juice ≤ 1.5 ms, headroom ≥ 3 ms |
| Physics bodies | ≤ 350 dynamic coins as Rapier cylinders, using the SIMD build (`@dimforge/rapier3d-simd-compat`), 60 Hz, 1 substep, 2 solver iterations. Measured with `scripts/bench-coins.mjs` on the dev Mac (M-series): 250 coins avg 2.0–2.7 ms per step, 350 coins avg 5.5–6.4 ms (worst 13–22 ms while coins fall off). The non-SIMD build is about 2x slower; balls are far cheaper but don't stack like coins. Plan: target about 250 live coins and treat 350 as the cap. Beyond the cap, the oldest coins at the back of the pile turn static ("pile freeze"), and they wake when the pusher or an event disturbs them. |
| Draw calls | ≤ 150: coins, LEDs, pegs, particles and bolts are each one `InstancedMesh` |
| Particles | ≤ 4,000 live in one instanced or Points pool; requests beyond the cap are dropped, lowest weight first |
| Post | Bloom at half resolution (one `UnrealBloomPass`, as in Neon Reef); flash and chromatic pulse in one cheap full-screen pass |
| Shadows | One 1024 shadow map for the tray only; the Works uses baked or fake contact shadows |
| Lights | Hemisphere + 1 key + ≤ 4 point lights; LED "lights" are emissive and bloom, not real lights |
| Memory | ≤ 400 MB; no texture over 2048; all art procedural or atlas |
| Audio | ≤ 24 voices; coin clinks capped at 6 per 100 ms |
| Levels | One floor loaded at a time. The next floor builds during the breakthrough fall (≤ 1 s of the shaft), and the old one is disposed. Bonus worlds are tiny separate scenes; the main physics world pauses while a warp runs |

A built-in **perf HUD** (`?debug=1`) shows fps, ms per subsystem, body count, particle count and draw calls, and a
**stress preset** (Fever plus jackpot plus 350 coins) checks the worst case. CI runs the Electron smoke test.

## 8. What makes it "over the top" beyond Neon Reef

| Neon Reef | Coin Quake |
|---|---|
| No aim (random entry) | Swinging dropper with a laser line, gates and a moving HOT target |
| One peg board, one disk | 12+ contraptions in four zones, each reacting to every coin |
| Party Time modes | Pressure meter with five escalation tiers and a 25 s QUAKE Fever, plus Overdrive |
| Flash overlays, LED chases | A juice system: shake, hit-stop, slow-mo, camera shots, particles, lightning, popups, squash and stretch, all weighted per event |
| Two music beds | Adaptive stem music by tier, a combo pitch ladder, event stingers |
| Static cabinet | The machine grows: parts get installed as you score |
| HUD as DOM panels | HUD is part of the machine (flip counter, gauge, bank tube) |
| A fixed camera | A camera that directs itself: snap zooms, edge cam, freeze-frames, replay insets |
| No characters doing anything | Fighting-game special moves with super-flash cut-ins, hit counters and K.O. stamps |
| No personality | A brainrot cast (the Rotlings) with name cards, collectible figures and a Rot Council super, plus pop-culture parodies |
| Predictable | Unhinged gags: machine tantrums, cameos, gravity flips, giant coins |
| One machine forever | Six themed floors you smash down through, plus warp portals and bonus worlds |
| Glossy neon realism, no characters | A cartoon world: toon shading, ink outlines, a reacting cast (Professor Pockets, Bolt), comic POW bursts |
| Calm attract | Cinematic attract tour with a scripted mini-Quake |

The north star: **every single press makes something happen on screen within 200 ms,** even at tier 0 (claw
steam, press slam, laser flicker, a clink), and the screen is never still.
