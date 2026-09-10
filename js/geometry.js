import { CONFIG, LAYOUT, TAU } from './config.js';
import { Dirt, Tool } from './game.js';

// ------------------------------------------------------------
// Math & geometry helpers (pure functions - unit tested)
// ------------------------------------------------------------

/**
 * Linearly interpolates between two values.
 *
 * @param {number} a Start value, returned when t is 0.
 * @param {number} b End value, returned when t is 1.
 * @param {number} t Interpolation factor, normally in [0, 1].
 * @returns {number} The interpolated value.
 */
export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Clamps a value into an inclusive range.
 *
 * @param {number} value Value to clamp.
 * @param {number} min Lower bound.
 * @param {number} max Upper bound.
 * @returns {number} The clamped value.
 */
export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Hashes a 2D point into a stable unsigned integer. Gives each dirt patch a
 * fixed hair pattern without storing extra state on the Dirt instances.
 *
 * @param {number} x X coordinate.
 * @param {number} y Y coordinate.
 * @returns {number} An unsigned 32-bit pseudo-random value.
 */
export function hash2(x, y) {
  let h = Math.imul(Math.round(x) | 0, 374761393) + Math.imul(Math.round(y) | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Computes the play area: everything between the top HUD bar and the tool dock.
 *
 * @param {number} width Viewport width in CSS pixels.
 * @param {number} height Viewport height in CSS pixels.
 * @returns {{x: number, y: number, w: number, h: number}} The play area.
 */
export function computePlayArea(width, height) {
  const dockBand = LAYOUT.dockHeight + LAYOUT.dockBottomGap * 2;
  return {
    x: 0,
    y: LAYOUT.topBarHeight,
    w: width,
    h: Math.max(160, height - LAYOUT.topBarHeight - dockBand),
  };
}

/**
 * Computes the rug rectangle for a given viewport size. A gutter is reserved on
 * the left so Shiki always has somewhere to stand before she steps on the rug.
 *
 * @param {number} width Viewport width in CSS pixels.
 * @param {number} height Viewport height in CSS pixels.
 * @returns {{x: number, y: number, w: number, h: number}} The rug rectangle.
 */
export function computeRugRect(width, height) {
  const play = computePlayArea(width, height);

  const rugWidth = Math.min(width * 0.78, 1200);
  const rugRatio = 1.55;
  const rugHeight = rugWidth / rugRatio;

  return {
    x: (width - rugWidth) / 2,
    y: play.y + (play.h - rugHeight) / 2,
    w: rugWidth,
    h: rugHeight,
  };
}

export function computeDirtRect(rug, width, height) {
  const play = computePlayArea(width, height);

  const left = Math.max(rug.x, play.x);
  const top = Math.max(rug.y, play.y);

  const right = Math.min(
    rug.x + rug.w,
    play.x + play.w
  );

  const bottom = Math.min(
    rug.y + rug.h,
    play.y + play.h
  );

  return {
    x: left,
    y: top,
    w: Math.max(0, right - left),
    h: Math.max(0, bottom - top),
  };
}
/**
 * Computes the bottom tool dock and its button hit boxes. Draw code and hit
 * testing share this layout so they can never drift apart.
 *
 * @param {number} width Viewport width in CSS pixels.
 * @param {number} height Viewport height in CSS pixels.
 * @returns {{x: number, y: number, w: number, h: number, buttons: object[]}} The dock layout.
 */
export function computeToolDockLayout(width, height) {
  const w = Math.min(LAYOUT.dockMaxWidth, width - LAYOUT.dockSideMargin * 2);
  const h = LAYOUT.dockHeight;
  const x = (width - w) / 2;
  const y = height - h - LAYOUT.dockBottomGap;

  const padding = 10;
  const slot = (w - padding * 2) / Tool.ORDER.length;

  const buttons = Tool.ORDER.map((key, index) => ({
    key,
    x: x + padding + slot * index,
    y: y + padding,
    w: slot,
    h: h - padding * 2,
  }));

  return { x, y, w, h, buttons };
}

/**
 * Finds the tool button under a point, if any.
 *
 * @param {{buttons: object[]}} dock A layout from computeToolDockLayout.
 * @param {number} x Point X.
 * @param {number} y Point Y.
 * @returns {string|null} The preset key that was hit, or null.
 */
export function hitTestToolDock(dock, x, y) {
  const hit = dock.buttons.find(
    (button) => x >= button.x && x <= button.x + button.w && y >= button.y && y <= button.y + button.h,
  );
  return hit ? hit.key : null;
}

/**
 * Spawns dirt patches at random positions fully inside the rug.
 *
 * @param {number} count How many patches to create.
 * @param {{x: number, y: number, w: number, h: number}} rug Rug rectangle.
 * @param {Function} [rng=Math.random] Random source, injectable for tests.
 * @returns {Dirt[]} The freshly spawned dirt patches.
 */
export function spawnDirt(count, rug, rng = Math.random) {
  const patches = [];

  for (let i = 0; i < count; i += 1) {
    const radius = lerp(CONFIG.dirtRadiusMin, CONFIG.dirtRadiusMax, rng());
    const pad = radius + 12;
    const x = rug.x + pad + rng() * Math.max(0, rug.w - pad * 2);
    const y = rug.y + pad + rng() * Math.max(0, rug.h - pad * 2);
    patches.push(new Dirt(x, y, radius));
  }

  return patches;
}

/**
 * Spawns hair Shiki shook off, clustered around her but always on the rug.
 *
 * @param {number} count How many patches to shed.
 * @param {{x: number, y: number, w: number, h: number}} rug Rug rectangle.
 * @param {{x: number, y: number}} origin Where Shiki is standing.
 * @param {Function} [rng=Math.random] Random source, injectable for tests.
 * @returns {Dirt[]} The shed patches, already clamped inside the rug.
 */
export function shedDirtAround(count, rug, origin, rng = Math.random) {
  const patches = [];

  for (let i = 0; i < count; i += 1) {
    const radius = lerp(CONFIG.dirtRadiusMin, CONFIG.dirtRadiusMax, rng());
    const pad = radius + 12;
    const angle = rng() * TAU;
    const distance = 40 + rng() * CONFIG.shedSpreadRadius;

    const x = clamp(origin.x + Math.cos(angle) * distance, rug.x + pad, rug.x + rug.w - pad);
    const y = clamp(origin.y + Math.sin(angle) * distance, rug.y + pad, rug.y + rug.h - pad);

    const patch = new Dirt(x, y, radius);
    patch.isShed = true;
    patches.push(patch);
  }

  return patches;
}

/**
 * Remaps dirt patches from one rug rectangle to another, keeping their relative
 * position on the rug. Called on resize so a round in progress stays valid.
 *
 * @param {Dirt[]} patches Dirt patches to move, mutated in place.
 * @param {{x: number, y: number, w: number, h: number}} from Old rug rectangle.
 * @param {{x: number, y: number, w: number, h: number}} to New rug rectangle.
 * @returns {Dirt[]} The same array, for chaining.
 *
 * @note No-ops when the old rectangle has zero area.
 */
export function remapDirtToRug(patches, from, to) {
  if (!from || from.w <= 0 || from.h <= 0) return patches;

  patches.forEach((dirt) => {
    const u = (dirt.x - from.x) / from.w;
    const v = (dirt.y - from.y) / from.h;
    dirt.x = to.x + u * to.w;
    dirt.y = to.y + v * to.h;
  });

  return patches;
}

/**
 * Traces a rounded rectangle path on a 2D context. Written by hand so the game
 * also runs on browsers without ctx.roundRect.
 *
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {number} x Left edge.
 * @param {number} y Top edge.
 * @param {number} w Width.
 * @param {number} h Height.
 * @param {number} r Corner radius.
 * @returns {void}
 */
export function pathRoundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);

  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/**
 * Computes where Shiki stands and how big she is drawn. She starts in the left
 * gutter and creeps onto the rug as the temptation meter fills.
 *
 * @param {Dog} dog The dog instance.
 * @param {{x: number, y: number, w: number, h: number}} rug Rug rectangle.
 * @returns {{x: number, y: number, scale: number}} Her anchor point and scale.
 */
export function computeDogAnchor(dog, rug) {
  const t = clamp(dog.getTemptationRatio(), 0, 1);
  const gutterX = rug.x * 0.52;
  const onRugX = rug.x + rug.w * 0.24;
  const scale = clamp(Math.min(rug.w, rug.h) / 620, 0.55, 1.15) * lerp(1, 1.16, t);

  return {
    x: lerp(gutterX, onRugX, t),
    y: rug.y + rug.h * (dog.isSitting() ? 0.5 : 0.44),
    scale,
  };
}

