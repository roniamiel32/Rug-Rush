# Rug Rush

A 2D casual browser game. You clean dog hair off a rug while Shiki, the dog,
watches from the side and gets more and more tempted to jump on it. Clear the
rug before she sits down.

Rug Rush runs as plain HTML, CSS, and JavaScript on a single `<canvas>`. There's
no build step, no bundler, and no runtime dependencies.

**Version:** 0.2.0 · **Author:** Sagi

> **Note:** The game currently draws placeholder geometry. The final artwork and
> audio drop into `assets/` in a later step.

## Game rules

- The rug starts covered in dirt patches. Each patch has a position and a radius.
- Press or drag on the rug to use your cleaning tool. Any patch that overlaps the
  tool's cleaning radius is removed.
- Every tool use tempts Shiki, **even when you miss**. Aggressive tools clear more
  hair per stroke but tempt her much faster.
- Shiki's temptation meter also fills passively over time, at 1 point per second.
- The meter drives her state machine:

  | Temptation | State | Meaning |
  | --- | --- | --- |
  | 0-49 | `Watching` | She's curious but staying put. |
  | 50-99 | `Approaching` | She's creeping toward the rug. |
  | 100 | `Sitting` | She's on the rug. You lose. |

- **You win** when every dirt patch is gone before the meter reaches 100.
- **You lose** the moment Shiki reaches `Sitting`.

## Tools

| Key | Tool | Cleaning radius | Temptation per use |
| --- | --- | --- | --- |
| `1` | Lint roller | 20 | 2 |
| `2` | Brush | 30 | 5 |
| `3` | Vacuum | 50 | 12 |

## Controls

| Input | Action |
| --- | --- |
| Mouse drag / touch drag | Clean at the cursor |
| `1`, `2`, `3` | Switch tools |
| `R` | Restart the round |
| Click after a round ends | Restart the round |

## Run it locally

Clone the repository and serve the folder over HTTP. Opening `index.html`
directly with the `file://` protocol works today, but a local server keeps the
setup ready for asset loading later.

```bash
git clone <your-repo-url> rug-rush
cd rug-rush
npm start
```

`npm start` runs `python3 -m http.server 8000`. Then open
<http://localhost:8000> in your browser.

Any other static server works too:

```bash
npx serve .
```

## Run the tests

The test suite covers the logic layer and the pure geometry helpers. It uses only
the Node.js standard library, so there's nothing to install.

```bash
npm test
```

## Project structure

```
rug-rush/
├── index.html          Page shell and the full-screen canvas
├── style.css           Reset, layout, and the cozy backdrop
├── main.js             Game logic (step 1) and presentation layer (step 2)
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
- `Tool` — a cleaning tool's `cleaningRadius` and `aggressiveness`, plus presets.
- `Dog` — Shiki's temptation meter and state machine.
- `GameManager` — owns the round and resolves the win and loss conditions.

**Presentation layer** — everything that touches the DOM or the canvas:

- `Renderer` — draws the floor, rug, dirt, Shiki, her meter, the cursor, the HUD,
  and the end-of-round overlay. It reads game state and never mutates it.
- `RugRush` — the engine. It owns the `requestAnimationFrame` loop, converts frame
  timestamps into `deltaTime`, routes mouse and touch input into
  `GameManager.cleanAt()`, and handles resizing.
- `CONFIG` and `COLORS` — every tunable value, kept out of the logic layer.

## Tuning

Balance constants live in `CONFIG` near the top of the presentation layer:

| Constant | Purpose |
| --- | --- |
| `dirtCount` | Patches spawned per round |
| `cleanIntervalMs` | Cooldown between tool uses while dragging |
| `passiveTemptationPerSecond` | Passive meter fill rate |
| `maxFrameSeconds` | `deltaTime` clamp, so a backgrounded tab can't skip ahead |

## Roadmap

- [x] Step 1 — Core logic layer
- [x] Step 2 — Canvas renderer, game loop, and input
- [ ] Step 3 — Balance pass and tool selection UI
- [ ] Step 4 — Final art and audio
- [ ] Step 5 — Levels, scoring, and persistence

## Browser support

Any modern browser with canvas 2D support: Chrome, Edge, Firefox, and Safari,
on desktop and mobile. The canvas scales to the device pixel ratio, and the
layout adapts to portrait and landscape.
