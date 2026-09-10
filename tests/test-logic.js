/**
 * File:        tests/test-logic.js
 * Author:      Roni Amiel & Noa Amiel
 * Description: Zero-dependency unit tests for the Rug Rush logic layer and the
 *              pure geometry helpers of the presentation layer.
 * Version:     0.3.0
 *
 * Modifications:
 *     0.2.0 - 2026-09-01 - Initial test suite (Dirt, Tool, Dog, GameManager,
 *                          computeRugRect, spawnDirt, remapDirtToRug)
 *     0.3.0 - 2026-09-01 - Cover deltaTime-scaled tool penalties, the shake and
 *                          shed cycle, shed-aware progress, and dock hit testing
 *
 * Usage: npm test   (or: node tests/test-logic.js)
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Loads the game's ES modules and returns the declarations covered by tests.
 *
 * @returns {object} The game's classes and helper functions.
 */
async function loadGame() {
  const [audio, config, game, geometry, main] = await Promise.all([
    import('../js/audio.js'),
    import('../js/config.js'),
    import('../js/game.js'),
    import('../js/geometry.js'),
    import('../js/main.js'),
  ]);

  return {
    ...audio,
    ...config,
    ...game,
    ...geometry,
    GAME_VERSION: main.GAME_VERSION,
  };
}

const G = await loadGame();

let passed = 0;
let failed = 0;

/**
 * Runs a single named test case.
 *
 * @param {string} name Human-readable test name.
 * @param {Function} fn Test body; throws on failure.
 * @returns {void}
 */
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  PASS  ${name}`);
  } catch (error) {
    failed += 1;
    console.log(`  FAIL  ${name}\n        ${error.message}`);
  }
}

/**
 * Builds a deterministic random source for spawn tests.
 *
 * @param {number[]} values Sequence of values in [0, 1), cycled.
 * @returns {Function} A Math.random-compatible function.
 */
function fakeRng(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

/**
 * Builds a minimal localStorage-compatible object for audio preference tests.
 *
 * @param {object} [initial] Initial key/value pairs.
 * @returns {object} Storage-like object.
 */
function fakeStorage(initial = {}) {
  const data = { ...initial };

  return {
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
  };
}

/**
 * Runs the game forward for a number of seconds at a fixed frame rate.
 *
 * @param {object} game A GameManager instance.
 * @param {number} seconds How long to simulate.
 * @param {number} [fps=60] Frames per second.
 * @param {Function} [onFrame] Called with the frame's deltaTime, before update.
 * @returns {void}
 */
function simulate(game, seconds, fps = 60, onFrame = null) {
  const dt = 1 / fps;
  const frames = Math.round(seconds * fps);

  for (let i = 0; i < frames; i += 1) {
    if (onFrame) onFrame(dt);
    game.update(dt);
  }
}

console.log('\nRug Rush - logic tests\n');

// ---------------- Dirt ----------------
test('Dirt.isHitBy detects an overlapping tool', () => {
  const dirt = new G.Dirt(100, 100, 10);
  assert.strictEqual(dirt.isHitBy(115, 100, 10), true);
});

test('Dirt.isHitBy misses a tool that is out of range', () => {
  const dirt = new G.Dirt(100, 100, 10);
  assert.strictEqual(dirt.isHitBy(140, 100, 10), false);
});

test('Dirt.isHitBy always misses an already cleaned patch', () => {
  const dirt = new G.Dirt(100, 100, 10);
  dirt.clean();
  assert.strictEqual(dirt.isHitBy(100, 100, 50), false);
});

// ---------------- Dog: meter and states ----------------
test('Dog starts Watching with an empty meter', () => {
  const dog = new G.Dog();
  assert.strictEqual(dog.temptationMeter, 0);
  assert.strictEqual(dog.state, G.Dog.STATES.WATCHING);
});

test('Dog transitions Watching -> Approaching -> Sitting', () => {
  const dog = new G.Dog();
  dog.increaseTemptation(49);
  assert.strictEqual(dog.state, G.Dog.STATES.WATCHING);
  dog.increaseTemptation(1);
  assert.strictEqual(dog.state, G.Dog.STATES.APPROACHING);
  dog.increaseTemptation(50);
  assert.strictEqual(dog.state, G.Dog.STATES.SITTING);
  assert.strictEqual(dog.isSitting(), true);
});

test('Dog meter is capped at 100', () => {
  const dog = new G.Dog();
  dog.increaseTemptation(500);
  assert.strictEqual(dog.temptationMeter, 100);
});

test('Dog gains passive temptation gradually over time', () => {
  const dog = new G.Dog({ baseIncreaseRate: 2 });
  dog.updateOverTime(0.5);
  assert.strictEqual(dog.temptationMeter, 1);
  dog.updateOverTime(0.5);
  assert.strictEqual(dog.temptationMeter, 2);
});

// ---------------- Dog: deltaTime-scaled tool penalties ----------------
test('applyToolPenalty scales with the seconds of use', () => {
  const dog = new G.Dog();
  const vacuum = G.Tool.PRESETS.VACUUM();

  dog.applyToolPenalty(vacuum, 0.5);
  assert.strictEqual(dog.temptationMeter, vacuum.aggressiveness * 0.5);
});

test('one second of vacuuming costs one second of aggressiveness', () => {
  const vacuum = G.Tool.PRESETS.VACUUM();
  const game = new G.GameManager({ dirtPatches: [new G.Dirt(10, 10, 5)], dog: new G.Dog({ baseIncreaseRate: 0 }) });

  for (let i = 0; i < 60; i += 1) {
    game.cleanAt(900, 900, vacuum, 1 / 60);
  }

  assert.ok(Math.abs(game.dog.temptationMeter - vacuum.aggressiveness) < 0.001);
});

test('the vacuum can no longer cause an instant loss', () => {
  const vacuum = G.Tool.PRESETS.VACUUM();
  const game = new G.GameManager({
    dirtPatches: [new G.Dirt(10, 10, 5)],
    dog: new G.Dog({ baseIncreaseRate: G.CONFIG.passiveTemptationPerSecond }),
  });

  // Two full seconds of dragging the noisiest tool around.
  simulate(game, 2, 60, (dt) => game.cleanAt(900, 900, vacuum, dt));

  assert.strictEqual(game.result, G.GameManager.RESULT.IN_PROGRESS);
  assert.ok(game.dog.temptationMeter < 40, `meter was ${game.dog.temptationMeter}`);
});

test('a vacuum drag survives long enough to be playable', () => {
  const vacuum = G.Tool.PRESETS.VACUUM();
  const game = new G.GameManager({
    dirtPatches: [new G.Dirt(10, 10, 5)],
    dog: new G.Dog({ baseIncreaseRate: G.CONFIG.passiveTemptationPerSecond }),
  });

  let seconds = 0;
  while (game.result === G.GameManager.RESULT.IN_PROGRESS && seconds < 60) {
    simulate(game, 1, 60, (dt) => game.cleanAt(900, 900, vacuum, dt));
    seconds += 1;
  }

  assert.ok(seconds >= 5, `constant vacuuming lasted only ${seconds}s`);
});

test('the penalty is frame-rate independent', () => {
  const vacuum = G.Tool.PRESETS.VACUUM();
  const build = () => new G.GameManager({
    dirtPatches: [new G.Dirt(10, 10, 5)],
    dog: new G.Dog({ baseIncreaseRate: 1 }),
  });

  const fast = build();
  const slow = build();
  simulate(fast, 3, 120, (dt) => fast.cleanAt(900, 900, vacuum, dt));
  simulate(slow, 3, 24, (dt) => slow.cleanAt(900, 900, vacuum, dt));

  assert.ok(Math.abs(fast.dog.temptationMeter - slow.dog.temptationMeter) < 0.01);
});

// ---------------- Dog: shake and shed ----------------
test('Shiki does not shake below the shake threshold', () => {
  const dog = new G.Dog({ baseIncreaseRate: 0 });
  dog.increaseTemptation(G.Dog.SHAKE.threshold - 1);

  let shed = 0;
  for (let i = 0; i < 600; i += 1) shed += dog.updateOverTime(1 / 60);

  assert.strictEqual(shed, 0);
  assert.strictEqual(dog.isShaking, false);
});

test('Shiki shakes as soon as she passes the threshold', () => {
  const dog = new G.Dog({ baseIncreaseRate: 0 });
  dog.increaseTemptation(G.Dog.SHAKE.threshold);

  const shed = dog.updateOverTime(1 / 60);
  assert.strictEqual(shed, G.Dog.SHAKE.hairShed);
  assert.strictEqual(dog.isShaking, true);
  assert.strictEqual(dog.shakeCount, 1);
});

test('a shake ends after its duration and repeats on the interval', () => {
  const dog = new G.Dog({ baseIncreaseRate: 0 });
  dog.increaseTemptation(G.Dog.SHAKE.threshold);
  dog.updateOverTime(1 / 60);

  let shed = 0;
  const window = G.Dog.SHAKE.durationSeconds + G.Dog.SHAKE.intervalSeconds + 0.2;
  for (let i = 0; i < Math.round(window * 60); i += 1) shed += dog.updateOverTime(1 / 60);

  assert.strictEqual(shed, G.Dog.SHAKE.hairShed, 'exactly one more shake in the window');
  assert.strictEqual(dog.shakeCount, 2);
});

test('a sitting dog stops shaking', () => {
  const dog = new G.Dog({ baseIncreaseRate: 0 });
  dog.increaseTemptation(100);

  assert.strictEqual(dog.updateOverTime(1), 0);
  assert.strictEqual(dog.isShaking, false);
});

test('a shake sheds hair back onto the rug through the factory', () => {
  const rug = { x: 0, y: 0, w: 600, h: 400 };
  const dog = new G.Dog({ baseIncreaseRate: 0 });
  const game = new G.GameManager({
    dirtPatches: [new G.Dirt(10, 10, 5)],
    dog,
    shedDirt: (count) => G.shedDirtAround(count, rug, { x: 300, y: 200 }),
  });

  dog.increaseTemptation(G.Dog.SHAKE.threshold);
  game.update(1 / 60);

  assert.strictEqual(game.dirtPatches.length, 1 + G.Dog.SHAKE.hairShed);
  assert.strictEqual(game.shedCount, G.Dog.SHAKE.hairShed);
  assert.strictEqual(game.lastShedPatches.length, G.Dog.SHAKE.hairShed);
});

test('shed hair drags the cleaned percentage back down', () => {
  const rug = { x: 0, y: 0, w: 600, h: 400 };
  const dog = new G.Dog({ baseIncreaseRate: 0 });
  const game = new G.GameManager({
    dirtPatches: [new G.Dirt(10, 10, 5), new G.Dirt(500, 300, 5)],
    dog,
    shedDirt: (count) => G.shedDirtAround(count, rug, { x: 300, y: 200 }),
  });

  game.cleanAt(10, 10, G.Tool.PRESETS.LINT_ROLLER(), 0.01);
  assert.strictEqual(Math.round(game.getCleanedPercent()), 50);

  dog.increaseTemptation(G.Dog.SHAKE.threshold);
  game.update(1 / 60);

  assert.strictEqual(game.getTotalDirtCount(), 2 + G.Dog.SHAKE.hairShed);
  assert.ok(game.getCleanedPercent() < 50);
});

test('shedding without a factory is a safe no-op', () => {
  const dog = new G.Dog({ baseIncreaseRate: 0 });
  const game = new G.GameManager({ dirtPatches: [new G.Dirt(10, 10, 5)], dog });

  dog.increaseTemptation(G.Dog.SHAKE.threshold);
  game.update(1 / 60);

  assert.strictEqual(game.dirtPatches.length, 1);
  assert.strictEqual(game.shedCount, 0);
});

// ---------------- GameManager ----------------
test('cleanAt removes every patch inside the cleaning radius', () => {
  const game = new G.GameManager({
    dirtPatches: [new G.Dirt(100, 100, 10), new G.Dirt(115, 100, 10), new G.Dirt(400, 400, 10)],
    dog: new G.Dog(),
  });

  game.cleanAt(100, 100, new G.Tool('Test', 20, 0), 0.016);
  assert.strictEqual(game.dirtPatches.length, 1);
});

test('cleanAt tempts the dog even when it whiffs', () => {
  const game = new G.GameManager({ dirtPatches: [new G.Dirt(0, 0, 5)], dog: new G.Dog() });

  game.cleanAt(900, 900, new G.Tool('Vacuum', 50, 12), 1);
  assert.strictEqual(game.dog.temptationMeter, 12);
  assert.strictEqual(game.dirtPatches.length, 1);
});

test('clearing all dirt wins the round', () => {
  const game = new G.GameManager({ dirtPatches: [new G.Dirt(10, 10, 5)], dog: new G.Dog() });

  const result = game.cleanAt(10, 10, G.Tool.PRESETS.LINT_ROLLER(), 0.016);
  assert.strictEqual(result, G.GameManager.RESULT.WIN);
});

test('a sitting dog loses the round', () => {
  const game = new G.GameManager({ dirtPatches: [new G.Dirt(10, 10, 5)], dog: new G.Dog() });

  const result = game.cleanAt(900, 900, new G.Tool('Cursed', 50, 100), 1);
  assert.strictEqual(result, G.GameManager.RESULT.LOSS);
});

test('a finished round ignores further cleaning', () => {
  const game = new G.GameManager({ dirtPatches: [new G.Dirt(10, 10, 5)], dog: new G.Dog() });
  game.cleanAt(10, 10, G.Tool.PRESETS.LINT_ROLLER(), 0.016);

  const before = game.dog.temptationMeter;
  game.cleanAt(10, 10, G.Tool.PRESETS.VACUUM(), 1);
  assert.strictEqual(game.dog.temptationMeter, before);
});

test('patches age while the round runs', () => {
  const patch = new G.Dirt(10, 10, 5);
  const game = new G.GameManager({ dirtPatches: [patch], dog: new G.Dog() });

  simulate(game, 1, 60);
  assert.ok(Math.abs(patch.age - 1) < 0.001);
});

// ---------------- AudioManager ----------------
test('AudioManager starts unmuted without a stored preference', () => {
  const audio = new G.AudioManager({ storage: fakeStorage() });
  assert.strictEqual(audio.isMuted(), false);
});

test('AudioManager persists and restores the mute preference', () => {
  const storage = fakeStorage();
  const audio = new G.AudioManager({ storage });

  audio.setMuted(true);

  const restored = new G.AudioManager({ storage });
  assert.strictEqual(restored.isMuted(), true);
});

test('AudioManager does not play registered sounds while muted', () => {
  const audio = new G.AudioManager({ storage: fakeStorage() });
  let plays = 0;

  audio.register('clean', {
    currentTime: 3,
    play() {
      plays += 1;
    },
    pause() {},
  });

  audio.setMuted(true);

  assert.strictEqual(audio.play('clean'), false);
  assert.strictEqual(plays, 0);
});

// ---------------- Layout helpers ----------------
test('computeRugRect centers the visual rug in the play area', () => {
  const rug = G.computeRugRect(1280, 720);
  const play = G.computePlayArea(1280, 720);

  assert.ok(rug.x > 0, 'rug should leave a left gutter for Shiki');
  assert.ok(rug.x + rug.w <= 1280, 'rug should not overflow the right edge');
  assert.ok(Math.abs((rug.y + rug.h / 2) - (play.y + play.h / 2)) < 0.001);
  assert.strictEqual(rug.w, 1280 * 0.78);
  assert.strictEqual(rug.h, rug.w / 1.55);
});

test('computeRugRect stays valid on a tiny viewport', () => {
  const rug = G.computeRugRect(320, 480);
  assert.ok(rug.w >= 120 && rug.h >= 120);
});

test('the tool dock lays out one button per tool, inside the dock', () => {
  const dock = G.computeToolDockLayout(1280, 720);

  assert.strictEqual(dock.buttons.length, G.Tool.ORDER.length);
  assert.deepStrictEqual(dock.buttons.map((button) => button.key), G.Tool.ORDER);
  dock.buttons.forEach((button) => {
    assert.ok(button.x >= dock.x && button.x + button.w <= dock.x + dock.w);
    assert.ok(button.y >= dock.y && button.y + button.h <= dock.y + dock.h);
  });
});

test('hitTestToolDock returns the tool under the point', () => {
  const dock = G.computeToolDockLayout(1280, 720);

  dock.buttons.forEach((button) => {
    assert.strictEqual(hitCenter(dock, button), button.key);
  });
  assert.strictEqual(G.hitTestToolDock(dock, 5, 5), null);
});

/**
 * Hit tests the center of a dock button.
 *
 * @param {object} dock Dock layout.
 * @param {object} button One of the dock's buttons.
 * @returns {string|null} The preset key found at the button's center.
 */
function hitCenter(dock, button) {
  return G.hitTestToolDock(dock, button.x + button.w / 2, button.y + button.h / 2);
}

test('Shiki creeps toward the rug as the meter fills', () => {
  const rug = G.computeRugRect(1280, 720);
  const calm = new G.Dog();
  const tempted = new G.Dog();
  tempted.increaseTemptation(99);

  assert.ok(G.computeDogAnchor(tempted, rug).x > G.computeDogAnchor(calm, rug).x);
});

// ---------------- Spawning ----------------
test('spawnDirt places every patch fully inside the rug', () => {
  const rug = { x: 100, y: 50, w: 600, h: 400 };
  const patches = G.spawnDirt(50, rug, fakeRng([0, 0.13, 0.5, 0.77, 0.99]));

  assert.strictEqual(patches.length, 50);
  patches.forEach((dirt) => {
    assert.ok(dirt.x - dirt.radius >= rug.x, 'patch crosses the left edge');
    assert.ok(dirt.x + dirt.radius <= rug.x + rug.w, 'patch crosses the right edge');
    assert.ok(dirt.y - dirt.radius >= rug.y, 'patch crosses the top edge');
    assert.ok(dirt.y + dirt.radius <= rug.y + rug.h, 'patch crosses the bottom edge');
  });
});

test('shedDirtAround keeps shed hair on the rug, even from a corner', () => {
  const rug = { x: 100, y: 50, w: 400, h: 300 };
  const patches = G.shedDirtAround(40, rug, { x: 100, y: 50 }, fakeRng([0, 0.2, 0.45, 0.8, 0.95]));

  patches.forEach((dirt) => {
    assert.ok(dirt.x - dirt.radius >= rug.x - 0.001, 'shed hair crossed the left edge');
    assert.ok(dirt.x + dirt.radius <= rug.x + rug.w + 0.001, 'shed hair crossed the right edge');
    assert.ok(dirt.y - dirt.radius >= rug.y - 0.001, 'shed hair crossed the top edge');
    assert.ok(dirt.y + dirt.radius <= rug.y + rug.h + 0.001, 'shed hair crossed the bottom edge');
  });
});

test('remapDirtToRug keeps relative position after a resize', () => {
  const from = { x: 0, y: 0, w: 100, h: 100 };
  const to = { x: 50, y: 20, w: 200, h: 400 };
  const patches = [new G.Dirt(50, 25, 5)];

  G.remapDirtToRug(patches, from, to);
  assert.strictEqual(patches[0].x, 150);
  assert.strictEqual(patches[0].y, 120);
});

test('remapDirtToRug no-ops on a degenerate source rect', () => {
  const patches = [new G.Dirt(10, 10, 5)];
  G.remapDirtToRug(patches, { x: 0, y: 0, w: 0, h: 0 }, { x: 0, y: 0, w: 100, h: 100 });
  assert.strictEqual(patches[0].x, 10);
});

// ---------------- Design tokens & version ----------------
test('typography uses Fredoka for headings and UI', () => {
  assert.ok(G.FONTS.heading.includes('Fredoka'));
  assert.ok(G.FONTS.body.includes('Fredoka'));
});

test('the palette carries the Stitch cream, brown and coral tokens', () => {
  assert.strictEqual(G.PALETTE.background, '#fdf9f4');
  assert.strictEqual(G.PALETTE.primary, '#9f402d');
  assert.strictEqual(G.PALETTE.primaryContainer, '#e2725b');
});

test('GAME_VERSION matches package.json', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.strictEqual(G.GAME_VERSION, pkg.version);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
