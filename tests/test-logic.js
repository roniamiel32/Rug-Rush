/**
 * File:        tests/test-logic.js
 * Author:      Sagi
 * Description: Zero-dependency unit tests for the Rug Rush logic layer and the
 *              pure geometry helpers of the presentation layer.
 * Version:     0.2.0
 *
 * Modifications:
 *     0.2.0 - 2026-09-01 - Initial test suite (Dirt, Tool, Dog, GameManager,
 *                          computeRugRect, spawnDirt, remapDirtToRug)
 *
 * Usage: npm test   (or: node tests/test-logic.js)
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/**
 * Loads main.js into a sandbox and returns its top-level declarations.
 * main.js is a plain browser script with no exports, so the source is
 * evaluated with a trailing expression that hands the classes back out.
 * The browser bootstrap is skipped because the sandbox has no `document`.
 *
 * @returns {object} The game's classes and helper functions.
 */
function loadGame() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
  const sandbox = { console: { log() {} } };
  vm.createContext(sandbox);

  const exposed = '\n;({ Dirt, Tool, Dog, GameManager, computeRugRect, spawnDirt, remapDirtToRug, clamp, lerp, GAME_VERSION, CONFIG });';
  return vm.runInContext(source + exposed, sandbox);
}

const G = loadGame();

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

// ---------------- Dog ----------------
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

test('Dog gains passive temptation over time', () => {
  const dog = new G.Dog({ baseIncreaseRate: 2 });
  dog.updateOverTime(0.5);
  assert.strictEqual(dog.temptationMeter, 1);
});

// ---------------- GameManager ----------------
test('cleanAt removes every patch inside the cleaning radius', () => {
  const game = new G.GameManager({
    dirtPatches: [new G.Dirt(100, 100, 10), new G.Dirt(115, 100, 10), new G.Dirt(400, 400, 10)],
    dog: new G.Dog(),
  });

  game.cleanAt(100, 100, new G.Tool('Test', 20, 0));
  assert.strictEqual(game.dirtPatches.length, 1);
});

test('cleanAt tempts the dog even when it whiffs', () => {
  const game = new G.GameManager({ dirtPatches: [new G.Dirt(0, 0, 5)], dog: new G.Dog() });

  game.cleanAt(900, 900, new G.Tool('Vacuum', 50, 12));
  assert.strictEqual(game.dog.temptationMeter, 12);
  assert.strictEqual(game.dirtPatches.length, 1);
});

test('clearing all dirt wins the round', () => {
  const game = new G.GameManager({ dirtPatches: [new G.Dirt(10, 10, 5)], dog: new G.Dog() });

  const result = game.cleanAt(10, 10, new G.Tool('Roller', 20, 2));
  assert.strictEqual(result, G.GameManager.RESULT.WIN);
});

test('a sitting dog loses the round', () => {
  const game = new G.GameManager({ dirtPatches: [new G.Dirt(10, 10, 5)], dog: new G.Dog() });

  const result = game.cleanAt(900, 900, new G.Tool('Vacuum', 50, 100));
  assert.strictEqual(result, G.GameManager.RESULT.LOSS);
});

test('a finished round ignores further cleaning', () => {
  const game = new G.GameManager({ dirtPatches: [new G.Dirt(10, 10, 5)], dog: new G.Dog() });
  game.cleanAt(10, 10, new G.Tool('Roller', 20, 2));

  const before = game.dog.temptationMeter;
  game.cleanAt(10, 10, new G.Tool('Vacuum', 50, 12));
  assert.strictEqual(game.dog.temptationMeter, before);
});

// ---------------- Presentation helpers ----------------
test('computeRugRect keeps the rug on screen with a gutter for Shiki', () => {
  const rug = G.computeRugRect(1280, 720);
  assert.ok(rug.x > 0, 'rug should leave a left gutter');
  assert.ok(rug.x + rug.w <= 1280, 'rug should not overflow the right edge');
  assert.ok(rug.y + rug.h <= 720 - G.CONFIG.hudHeight, 'rug should clear the HUD strip');
});

test('computeRugRect stays valid on a tiny viewport', () => {
  const rug = G.computeRugRect(320, 240);
  assert.ok(rug.w >= 120 && rug.h >= 120);
});

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

// ---------------- Version ----------------
test('GAME_VERSION matches package.json', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.strictEqual(G.GAME_VERSION, pkg.version);
});

console.log(`\n${passed} passed, ${failed} failed\n`);
process.exit(failed === 0 ? 0 : 1);
