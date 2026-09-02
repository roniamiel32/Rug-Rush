# Rug Rush

A 2D casual browser game. You clean dog hair off a rug while Shiki, the dog,
watches from the side and gets more and more tempted to jump on it. Clear the
rug before she sits down — and watch out, because once she's really tempted she
wakes up, shakes herself out, and drops fresh hair right back onto your rug.

Rug Rush runs as plain HTML, CSS, and JavaScript on a single `<canvas>`. There's
no build step, no bundler, and no runtime dependencies.

**Version:** 0.3.0 · **Authors:** Roni Amiel & Noa Amiel

> **Note:** The game currently draws placeholder geometry in the final palette.
> The illustrated art and audio drop into `assets/` in a later step.

## Game rules

- The rug starts covered in dirt patches. Each patch has a position and a radius.
- Press or drag on the rug to use your cleaning tool. Any patch that overlaps the
  tool's cleaning radius is removed.
- Using a tool tempts Shiki, **even when you miss**. The penalty is charged per
  second of use, so a noisy vacuum spikes the meter fast while a lint roller
  barely registers.
- Shiki's temptation meter also fills passively, at 1.1 points per second.
- The meter drives her state machine:

  | Temptation | State | Meaning |
  | --- | --- | --- |
  | 0-49 | `Watching` | She's curious but staying put. |
  | 50-99 | `Approaching` | She's creeping toward the rug. |
  | 100 | `Sitting` | She's on the rug. You lose. |

- **Shake and shed:** past 76 temptation Shiki wakes up and shakes herself out
  every 5 seconds, dropping 5 fresh patches of hair around wherever she's
  standing. Your cleaned percentage drops with every shake, so a slow round gets
  harder the longer it runs.
- **You win** when every patch is gone before the meter reaches 100.
- **You lose** the moment Shiki reaches `Sitting`.

## Tools

Aggressiveness is temptation added per **second** of continuous use, so the
balance is the same at 30 fps and 144 fps.

| Key | Tool | Cleaning radius | Temptation per second | Nonstop use before she sits |
| --- | --- | --- | --- | --- |
| `1` | Roller | 26 | 3.5 | ~22 s |
| `2` | Brush | 38 | 7 | ~12 s |
| `3` | Vacuum | 58 | 14 | ~7 s |

A single tap is charged 0.12 seconds of tool time, so tapping is never free.

## Controls

| Input | Action |
| --- | --- |
| Mouse drag / touch drag | Clean at the cursor |
| Tap a tool in the bottom dock | Switch tools |
| `1`, `2`, `3` | Switch tools |
| `R` | Restart the round |
| Click after a round ends | Restart the round |

## Run it locally

Clone the repository and serve the folder over HTTP. Opening `index.html`
directly with the `file://` protocol works today, but a local server keeps the
setup ready for asset loading later.

```bash
git clone https://github.com/roniamiel32/Rug-Rush.git
cd Rug-Rush
npm start
```

`npm start` runs `python3 -m http.server 8000`. Then open
<http://localhost:8000> in your browser.

Any other static server works too:

```bash
npx serve .
```

## Run the tests

The test suite covers the logic layer and the pure geometry helpers, including
the shake-and-shed cycle and the frame-rate independence of tool penalties. It
uses only the Node.js standard library, so there's nothing to install.

```bash
npm test
```

## Design system

The visuals follow our Stitch concept: cozy creams, warm browns, and coral
accents, on a wooden floor.

| Token | Value | Used for |
| --- | --- | --- |
| `background` / `surface-bright` | `#fdf9f4` | HUD bar, cards |
| `primary` | `#9f402d` | Headlines, meter fill, primary button |
| `primary-container` | `#e2725b` | Coral accents, rug border, fresh-hair halo |
| `tertiary` / `tertiary-fixed-dim` | `#805533` / `#f4bb92` | Shiki's coat |
| `secondary-container` | `#77c2fe` | Active tool chip, cleaning cursor |
| `on-surface-variant` | `#56423e` | Labels and dog hair |

Typography uses **Plus Jakarta Sans** (700/800) for every heading and UI label,
with **Be Vietnam Pro** for body copy. Both load from Google Fonts in
`index.html`, and the canvas waits for them before the first frame so nothing
renders in a fallback face.

## Project structure

```
rug-rush/
├── index.html          Page shell, font loading, and the full-screen canvas
├── style.css           Reset, design tokens, and typography
├── main.js             Game logic and presentation layer
├── package.json        Project version and scripts
├── assets/
│   ├── images/         Sprites (work in progress)
│   └── audio/          Sound effects (work in progress)
└── tests/
    └── test-logic.js   Unit tests
```

### Code layout in `main.js`

`main.js` is a single flat script with no ES module imports or exports, so it
loads with a plain `<script>` tag. It has two layers:

**Logic layer** — no rendering code, fully unit tested:

- `Dirt` — one patch of hair, with circle-to-circle hit detection.
- `Tool` — a cleaning tool's `cleaningRadius` and per-second `aggressiveness`.
- `Dog` — Shiki's temptation meter, state machine, and shake cycle.
- `GameManager` — owns the round, resolves win and loss, and asks a `shedDirt`
  factory for new patches when Shiki shakes. The factory keeps rug geometry out
  of the logic layer.

**Presentation layer** — everything that touches the DOM or the canvas:

- `Renderer` — draws the floor, rug, hair, Shiki, the HUD, the tool dock, the
  cursor, and the end-of-round card. It reads game state and never mutates it.
- `RugRush` — the engine. It owns the `requestAnimationFrame` loop, converts
  frame timestamps into `deltaTime`, routes mouse and touch input into
  `GameManager.cleanAt()`, and handles resizing.
- `CONFIG`, `LAYOUT`, `PALETTE`, and `FONTS` — every tunable value and design
  token, kept out of the logic layer.

## Tuning

| Constant | Purpose |
| --- | --- |
| `CONFIG.dirtCount` | Patches spawned at the start of a round |
| `CONFIG.passiveTemptationPerSecond` | Passive meter fill rate |
| `CONFIG.tapImpulseSeconds` | Tool time charged for a single tap |
| `CONFIG.maxFrameSeconds` | `deltaTime` clamp, so a backgrounded tab can't skip ahead |
| `Dog.SHAKE` | Shake threshold, interval, duration, and hair shed per shake |

## Roadmap

- [x] Step 1 — Core logic layer
- [x] Step 2 — Canvas renderer, game loop, and input
- [x] Step 3 — Balance pass, shake-and-shed, and the Stitch visual pass
- [ ] Step 4 — Final art and audio
- [ ] Step 5 — Levels, scoring, and persistence

## Browser support

Any modern browser with canvas 2D support: Chrome, Edge, Firefox, and Safari, on
desktop and mobile. The canvas scales to the device pixel ratio, and the layout
adapts to portrait and landscape.
