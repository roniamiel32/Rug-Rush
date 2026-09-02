/**
 * File:        main.js
 * Author:      Sagi
 * Description: Rug Rush - core game logic (Step 1) and presentation layer
 *              (Step 2: canvas renderer, game loop, pointer input).
 * Version:     0.2.0
 *
 * Modifications:
 *     0.1.0 - 2026-09-01 - Core logic layer: Dirt, Tool, Dog, GameManager
 *     0.2.0 - 2026-09-01 - Added Renderer, RugRush engine, game loop and
 *                          mouse/touch input; removed the console sanity check
 */

// ============================================================
// RUG RUSH - Core Game Logic & Data Structures (Step 1)
// No rendering/UI code - pure logic layer
// ============================================================


/**
 * Represents a single patch of dog hair/dirt on the rug.
 */
class Dirt {
  constructor(x, y, radius = 10) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.isCleaned = false;
  }

  /**
   * Checks if a given point (with some interaction radius) overlaps this dirt patch.
   * Uses simple circle-circle collision.
   */
  isHitBy(x, y, hitRadius) {
    if (this.isCleaned) return false;
    const dx = this.x - x;
    const dy = this.y - y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance <= this.radius + hitRadius;
  }

  clean() {
    this.isCleaned = true;
  }
}

/**
 * Represents a cleaning tool (Lint Roller, Vacuum, Brush, etc.)
 */
class Tool {
  constructor(name, cleaningRadius, aggressiveness) {
    this.name = name;
    this.cleaningRadius = cleaningRadius; // how far it reaches when cleaning
    this.aggressiveness = aggressiveness; // how much temptation it adds per use
  }
}

// A few example tool presets (optional convenience factory)
Tool.PRESETS = {
  LINT_ROLLER: () => new Tool('Lint Roller', 20, 2),
  BRUSH: () => new Tool('Brush', 30, 5),
  VACUUM: () => new Tool('Vacuum', 50, 12),
};

/**
 * Represents Shiki, the dog, with a temptation meter and state machine.
 */
class Dog {
  static STATES = Object.freeze({
    WATCHING: 'Watching',
    APPROACHING: 'Approaching',
    SITTING: 'Sitting',
  });

  static THRESHOLDS = Object.freeze({
    APPROACHING: 50,
    SITTING: 100,
  });

  constructor({ baseIncreaseRate = 1 } = {}) {
    this.temptationMeter = 0;
    this.state = Dog.STATES.WATCHING;
    this.baseIncreaseRate = baseIncreaseRate; // meter increase per second (passive)
  }

  /**
   * Called every game tick/frame with deltaTime (in seconds) to apply
   * the passive, time-based temptation increase.
   */
  updateOverTime(deltaTime) {
    this.increaseTemptation(this.baseIncreaseRate * deltaTime);
  }

  /**
   * Called whenever a tool is used, applying its aggressiveness as a penalty.
   */
  applyToolPenalty(tool) {
    this.increaseTemptation(tool.aggressiveness);
  }

  /**
   * Core method to raise the temptation meter and re-evaluate state.
   */
  increaseTemptation(amount) {
    if (this.state === Dog.STATES.SITTING) return; // already lost, no-op

    this.temptationMeter = Math.min(100, this.temptationMeter + amount);
    this._updateState();
  }

  /**
   * Internal: checks thresholds and transitions state accordingly.
   */
  _updateState() {
    if (this.temptationMeter >= Dog.THRESHOLDS.SITTING) {
      this.state = Dog.STATES.SITTING;
    } else if (this.temptationMeter >= Dog.THRESHOLDS.APPROACHING) {
      this.state = Dog.STATES.APPROACHING;
    } else {
      this.state = Dog.STATES.WATCHING;
    }
  }

  isSitting() {
    return this.state === Dog.STATES.SITTING;
  }
}

/**
 * Orchestrates the game: dirt patches, dog, and win/loss conditions.
 */
class GameManager {
  static RESULT = Object.freeze({
    IN_PROGRESS: 'in_progress',
    WIN: 'win',
    LOSS: 'loss',
  });

  constructor({ dirtPatches = [], dog = new Dog() } = {}) {
    this.dirtPatches = dirtPatches; // array of Dirt instances
    this.dog = dog;
    this.result = GameManager.RESULT.IN_PROGRESS;
  }

  /**
   * Attempts to clean at a given (x, y) using the specified tool.
   * Removes any dirt hit by the tool's cleaning radius, then applies
   * the tool's temptation penalty to the dog.
   */
  cleanAt(x, y, tool) {
    if (this.result !== GameManager.RESULT.IN_PROGRESS) return this.result;

    let cleanedAny = false;

    this.dirtPatches.forEach((dirt) => {
      if (dirt.isHitBy(x, y, tool.cleaningRadius)) {
        dirt.clean();
        cleanedAny = true;
      }
    });

    if (cleanedAny) {
      this.dirtPatches = this.dirtPatches.filter((dirt) => !dirt.isCleaned);
    }

    // Using the tool always tempts the dog, whether or not it hit dirt
    this.dog.applyToolPenalty(tool);

    return this._evaluateGameState();
  }

  /**
   * Called every frame/tick to advance passive temptation over time.
   */
  update(deltaTime) {
    if (this.result !== GameManager.RESULT.IN_PROGRESS) return this.result;

    this.dog.updateOverTime(deltaTime);
    return this._evaluateGameState();
  }

  /**
   * Checks if all dirt has been cleaned (win condition).
   */
  checkWinCondition() {
    return this.dirtPatches.length === 0;
  }

  /**
   * Checks if the dog has reached the Sitting state (loss condition).
   */
  checkLossCondition() {
    return this.dog.isSitting();
  }

  /**
   * Internal: evaluates and updates the overall game result after any action.
   */
  _evaluateGameState() {
    if (this.checkLossCondition()) {
      this.result = GameManager.RESULT.LOSS;
    } else if (this.checkWinCondition()) {
      this.result = GameManager.RESULT.WIN;
    } else {
      this.result = GameManager.RESULT.IN_PROGRESS;
    }
    return this.result;
  }
}

// ============================================================
// Exports (adjust to your module system as needed)
// ============================================================
//export { Dirt, Tool, Dog, GameManager };

// ============================================================
// RUG RUSH - Presentation Layer (Step 2)
// Canvas renderer, game loop and pointer input.
// Placeholder geometry only - final art drops in later.
// ============================================================

/** Semantic version of the game. Mirrors the "version" field in package.json. */
const GAME_VERSION = '0.2.0';

/** Two pi, used all over the drawing code. */
const TAU = Math.PI * 2;

/**
 * Tunable gameplay and presentation constants.
 * Balance values live here so Step 3 tuning never touches the logic layer.
 */
const CONFIG = Object.freeze({
  /** Number of dirt patches spawned per round. */
  dirtCount: 28,
  /** Dirt patch radius range, in CSS pixels. */
  dirtRadiusMin: 7,
  dirtRadiusMax: 15,
  /** Minimum gap between two tool uses while dragging, in milliseconds. */
  cleanIntervalMs: 250,
  /** Upper bound on a single frame's deltaTime, in seconds (tab-switch guard). */
  maxFrameSeconds: 0.1,
  /** Passive temptation gained per second while the round runs. */
  passiveTemptationPerSecond: 1,
  /** Height of the bottom HUD strip, in CSS pixels. */
  hudHeight: 44,
});

/** Placeholder palette - warm, cozy living-room tones. */
const COLORS = Object.freeze({
  floor: '#e9d6bd',
  floorLine: '#dcc4a5',
  rug: '#c8785f',
  rugInner: '#d98f74',
  rugBorder: '#9c5843',
  rugFringe: '#e8d3b5',
  dirtFill: '#4a3f38',
  dirtHair: '#2f2723',
  dogWatching: '#c9a227',
  dogApproaching: '#d97706',
  dogSitting: '#b91c1c',
  dogOutline: '#4a3728',
  meterTrack: '#fffaf2',
  meterOutline: '#4a3728',
  text: '#4a3728',
  textMuted: '#8a725c',
  cursor: '#2f6f5f',
  overlay: 'rgba(47, 39, 35, 0.72)',
  overlayText: '#fff8ec',
});

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
function lerp(a, b, t) {
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
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Hashes a 2D point into a stable unsigned integer.
 * Used to give each dirt patch a fixed "hair" pattern without storing extra
 * state on the Dirt instances from the logic layer.
 *
 * @param {number} x X coordinate.
 * @param {number} y Y coordinate.
 * @returns {number} An unsigned 32-bit pseudo-random value.
 */
function hash2(x, y) {
  let h = Math.imul(Math.round(x) | 0, 374761393) + Math.imul(Math.round(y) | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Computes the rug rectangle for a given viewport size.
 * A gutter is reserved on the left so Shiki always has somewhere to stand,
 * and a strip is reserved at the bottom for the HUD.
 *
 * @param {number} width Viewport width in CSS pixels.
 * @param {number} height Viewport height in CSS pixels.
 * @returns {{x: number, y: number, w: number, h: number}} The rug rectangle.
 */
function computeRugRect(width, height) {
  const gutter = clamp(width * 0.2, 110, 260);
  const rightMargin = clamp(width * 0.06, 24, 90);
  const topMargin = clamp(height * 0.1, 28, 90);

  const x = gutter;
  const y = topMargin;
  const w = Math.max(120, width - gutter - rightMargin);
  const h = Math.max(120, height - topMargin - CONFIG.hudHeight - topMargin * 0.5);

  return { x, y, w, h };
}

/**
 * Spawns dirt patches at random positions fully inside the rug.
 *
 * @param {number} count How many patches to create.
 * @param {{x: number, y: number, w: number, h: number}} rug Rug rectangle.
 * @param {Function} [rng=Math.random] Random source, injectable for tests.
 * @returns {Dirt[]} The freshly spawned dirt patches.
 */
function spawnDirt(count, rug, rng = Math.random) {
  const patches = [];

  for (let i = 0; i < count; i += 1) {
    const radius = lerp(CONFIG.dirtRadiusMin, CONFIG.dirtRadiusMax, rng());
    const pad = radius + 10;
    const x = rug.x + pad + rng() * Math.max(0, rug.w - pad * 2);
    const y = rug.y + pad + rng() * Math.max(0, rug.h - pad * 2);
    patches.push(new Dirt(x, y, radius));
  }

  return patches;
}

/**
 * Remaps dirt patches from one rug rectangle to another, keeping their
 * relative position on the rug. Called on window resize so a round in
 * progress stays valid.
 *
 * @param {Dirt[]} patches Dirt patches to move, mutated in place.
 * @param {{x: number, y: number, w: number, h: number}} from Old rug rectangle.
 * @param {{x: number, y: number, w: number, h: number}} to New rug rectangle.
 * @returns {Dirt[]} The same array, for chaining.
 *
 * @note No-ops when the old rectangle has zero area.
 */
function remapDirtToRug(patches, from, to) {
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
 * Traces a rounded rectangle path on a 2D context.
 * Written by hand so the game also runs on browsers without ctx.roundRect.
 *
 * @param {CanvasRenderingContext2D} ctx Target context.
 * @param {number} x Left edge.
 * @param {number} y Top edge.
 * @param {number} w Width.
 * @param {number} h Height.
 * @param {number} r Corner radius.
 * @returns {void}
 */
function pathRoundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);

  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

// ------------------------------------------------------------
// Renderer
// ------------------------------------------------------------

/**
 * Draws every visual element of the game onto a 2D canvas context.
 * The renderer is stateless with respect to gameplay: it only reads the
 * objects it is handed, so the logic layer stays free of drawing code.
 */
class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas Canvas element to draw on.
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.width = 0;
    this.height = 0;
  }

  /**
   * Resizes the backing store to match the element size and device pixel
   * ratio, then scales the context so all drawing happens in CSS pixels.
   *
   * @returns {{width: number, height: number}} The new size in CSS pixels.
   */
  resize() {
    const dpr = window.devicePixelRatio || 1;
    const width = this.canvas.clientWidth || window.innerWidth;
    const height = this.canvas.clientHeight || window.innerHeight;

    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.width = width;
    this.height = height;

    return { width, height };
  }

  /**
   * Paints the floor behind the rug.
   *
   * @returns {void}
   */
  drawBackground() {
    const ctx = this.ctx;

    ctx.fillStyle = COLORS.floor;
    ctx.fillRect(0, 0, this.width, this.height);

    // Simple floorboards - placeholder for the final room art.
    ctx.strokeStyle = COLORS.floorLine;
    ctx.lineWidth = 2;
    for (let y = 60; y < this.height; y += 60) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.width, y);
      ctx.stroke();
    }
  }

  /**
   * Draws the rug the player has to clean.
   *
   * @param {{x: number, y: number, w: number, h: number}} rug Rug rectangle.
   * @returns {void}
   */
  drawRug(rug) {
    const ctx = this.ctx;

    ctx.save();
    ctx.shadowColor = 'rgba(74, 55, 40, 0.25)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = COLORS.rug;
    pathRoundRect(ctx, rug.x, rug.y, rug.w, rug.h, 26);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = COLORS.rugBorder;
    ctx.lineWidth = 6;
    pathRoundRect(ctx, rug.x, rug.y, rug.w, rug.h, 26);
    ctx.stroke();

    const inset = 22;
    ctx.strokeStyle = COLORS.rugInner;
    ctx.lineWidth = 4;
    pathRoundRect(ctx, rug.x + inset, rug.y + inset, rug.w - inset * 2, rug.h - inset * 2, 16);
    ctx.stroke();

    // Fringe on the left and right edges.
    ctx.strokeStyle = COLORS.rugFringe;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (let y = rug.y + 18; y < rug.y + rug.h - 10; y += 16) {
      ctx.beginPath();
      ctx.moveTo(rug.x - 10, y);
      ctx.lineTo(rug.x - 1, y);
      ctx.moveTo(rug.x + rug.w + 1, y);
      ctx.lineTo(rug.x + rug.w + 10, y);
      ctx.stroke();
    }
  }

  /**
   * Draws every uncleaned dirt patch as a tuft of dog hair.
   *
   * @param {Dirt[]} patches Dirt patches still on the rug.
   * @returns {void}
   */
  drawDirt(patches) {
    const ctx = this.ctx;

    ctx.lineCap = 'round';

    patches.forEach((dirt) => {
      if (dirt.isCleaned) return;

      const seed = hash2(dirt.x, dirt.y);

      ctx.fillStyle = COLORS.dirtFill;
      ctx.beginPath();
      ctx.arc(dirt.x, dirt.y, dirt.radius * 0.5, 0, TAU);
      ctx.fill();

      ctx.strokeStyle = COLORS.dirtHair;
      ctx.lineWidth = 1.8;
      for (let i = 0; i < 7; i += 1) {
        const angle = (((seed >>> (i * 3)) % 360) + i * 51) * (Math.PI / 180);
        const length = dirt.radius * (0.75 + ((seed >>> i) % 6) / 12);
        ctx.beginPath();
        ctx.moveTo(dirt.x + Math.cos(angle) * dirt.radius * 0.2, dirt.y + Math.sin(angle) * dirt.radius * 0.2);
        ctx.lineTo(dirt.x + Math.cos(angle) * length, dirt.y + Math.sin(angle) * length);
        ctx.stroke();
      }
    });
  }

  /**
   * Draws Shiki plus her temptation meter. The dog creeps toward the rug and
   * changes color as the meter fills, so her state is readable at a glance.
   *
   * @param {Dog} dog The dog instance from the logic layer.
   * @param {{x: number, y: number, w: number, h: number}} rug Rug rectangle.
   * @returns {void}
   */
  drawDog(dog, rug) {
    const ctx = this.ctx;
    const t = clamp(dog.temptationMeter / Dog.THRESHOLDS.SITTING, 0, 1);

    const homeX = rug.x * 0.5;
    const rugX = rug.x + rug.w * 0.2;
    const cx = lerp(homeX, rugX, t);
    const cy = rug.y + rug.h * 0.55;
    const scale = lerp(1, 1.2, t);

    let bodyColor = COLORS.dogWatching;
    if (dog.state === Dog.STATES.APPROACHING) bodyColor = COLORS.dogApproaching;
    if (dog.state === Dog.STATES.SITTING) bodyColor = COLORS.dogSitting;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);

    ctx.strokeStyle = COLORS.dogOutline;
    ctx.lineWidth = 3;
    ctx.fillStyle = bodyColor;

    // Body.
    ctx.beginPath();
    ctx.ellipse(0, 14, 34, 26, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();

    // Tail - wags harder the more tempted she is.
    ctx.beginPath();
    ctx.moveTo(-32, 4);
    ctx.quadraticCurveTo(-52, -6 - t * 14, -40, -22 - t * 10);
    ctx.lineWidth = 6;
    ctx.strokeStyle = bodyColor;
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.dogOutline;

    // Head.
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.arc(22, -16, 20, 0, TAU);
    ctx.fill();
    ctx.stroke();

    // Ears - perk up with temptation.
    const earLift = t * 6;
    ctx.beginPath();
    ctx.moveTo(10, -30);
    ctx.lineTo(2, -46 - earLift);
    ctx.lineTo(20, -34);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(34, -30);
    ctx.lineTo(40, -46 - earLift);
    ctx.lineTo(24, -34);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Face.
    ctx.fillStyle = COLORS.dogOutline;
    ctx.beginPath();
    ctx.arc(18, -20, 2.6, 0, TAU);
    ctx.arc(30, -20, 2.6, 0, TAU);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(28, -8, 4, 0, TAU);
    ctx.fill();

    ctx.restore();

    this.drawTemptationMeter(dog, cx, cy - 78 * scale);
  }

  /**
   * Draws the 0-100 temptation meter with markers at the state thresholds.
   *
   * @param {Dog} dog The dog whose meter is drawn.
   * @param {number} cx Meter center X.
   * @param {number} cy Meter top Y.
   * @returns {void}
   */
  drawTemptationMeter(dog, cx, cy) {
    const ctx = this.ctx;
    const w = 150;
    const h = 16;
    // Keep the meter on screen even when Shiki stands near the left edge.
    const x = clamp(cx - w / 2, 8, Math.max(8, this.width - w - 8));
    const centerX = x + w / 2;
    const ratio = clamp(dog.temptationMeter / Dog.THRESHOLDS.SITTING, 0, 1);

    ctx.fillStyle = COLORS.meterTrack;
    pathRoundRect(ctx, x, cy, w, h, 8);
    ctx.fill();

    let fillColor = COLORS.dogWatching;
    if (dog.state === Dog.STATES.APPROACHING) fillColor = COLORS.dogApproaching;
    if (dog.state === Dog.STATES.SITTING) fillColor = COLORS.dogSitting;

    if (ratio > 0) {
      ctx.save();
      pathRoundRect(ctx, x, cy, w, h, 8);
      ctx.clip();
      ctx.fillStyle = fillColor;
      ctx.fillRect(x, cy, w * ratio, h);
      ctx.restore();
    }

    ctx.strokeStyle = COLORS.meterOutline;
    ctx.lineWidth = 2;
    pathRoundRect(ctx, x, cy, w, h, 8);
    ctx.stroke();

    // Threshold tick at the Approaching boundary.
    const tickX = x + w * (Dog.THRESHOLDS.APPROACHING / Dog.THRESHOLDS.SITTING);
    ctx.beginPath();
    ctx.moveTo(tickX, cy);
    ctx.lineTo(tickX, cy + h);
    ctx.stroke();

    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 14px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(`Shiki: ${dog.state}`, centerX, cy - 6);
  }

  /**
   * Draws the player's cursor: the tool's cleaning radius plus a crosshair.
   *
   * @param {{x: number, y: number, isDown: boolean, isOnScreen: boolean}} pointer Pointer state.
   * @param {Tool} tool The currently equipped tool.
   * @returns {void}
   */
  drawCursor(pointer, tool) {
    if (!pointer.isOnScreen) return;

    const ctx = this.ctx;

    ctx.save();
    ctx.strokeStyle = COLORS.cursor;
    ctx.lineWidth = pointer.isDown ? 4 : 2;
    ctx.globalAlpha = pointer.isDown ? 0.95 : 0.7;

    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, tool.cleaningRadius, 0, TAU);
    ctx.stroke();

    if (pointer.isDown) {
      ctx.globalAlpha = 0.15;
      ctx.fillStyle = COLORS.cursor;
      ctx.fill();
      ctx.globalAlpha = 0.95;
    }

    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pointer.x - 8, pointer.y);
    ctx.lineTo(pointer.x + 8, pointer.y);
    ctx.moveTo(pointer.x, pointer.y - 8);
    ctx.lineTo(pointer.x, pointer.y + 8);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Draws the bottom status strip.
   *
   * @param {{cleanedPercent: number, tool: Tool, version: string}} stats HUD data.
   * @returns {void}
   */
  drawHud(stats) {
    const ctx = this.ctx;
    const y = this.height - CONFIG.hudHeight;

    ctx.fillStyle = 'rgba(255, 250, 242, 0.85)';
    ctx.fillRect(0, y, this.width, CONFIG.hudHeight);

    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 16px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`Rug cleaned: ${Math.round(stats.cleanedPercent)}%`, 20, y + CONFIG.hudHeight / 2);

    ctx.font = '14px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = COLORS.textMuted;

    // Narrow screens only have room for the tool name and the version.
    const isNarrow = this.width < 700;
    if (!isNarrow) {
      ctx.textAlign = 'center';
      ctx.fillText(
        `Tool: ${stats.tool.name}  (1 roller / 2 brush / 3 vacuum)`,
        this.width / 2,
        y + CONFIG.hudHeight / 2,
      );
    }

    ctx.textAlign = 'right';
    const rightLabel = isNarrow ? stats.tool.name : `v${stats.version}`;
    ctx.fillText(rightLabel, this.width - 20, y + CONFIG.hudHeight / 2);
  }

  /**
   * Draws the win/loss overlay.
   *
   * @param {string} result A GameManager.RESULT value.
   * @returns {void}
   */
  drawOverlay(result) {
    if (result === GameManager.RESULT.IN_PROGRESS) return;

    const ctx = this.ctx;
    const isWin = result === GameManager.RESULT.WIN;

    ctx.fillStyle = COLORS.overlay;
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.fillStyle = COLORS.overlayText;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.font = 'bold 52px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(isWin ? 'Rug Rush!' : 'Shiki wins', this.width / 2, this.height / 2 - 30);

    ctx.font = '20px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(
      isWin ? 'Spotless before she sat down.' : 'She sat on the rug before you finished.',
      this.width / 2,
      this.height / 2 + 16,
    );

    ctx.font = '16px "Segoe UI", system-ui, sans-serif';
    ctx.fillText('Click or press R to play again', this.width / 2, this.height / 2 + 56);
  }
}

// ------------------------------------------------------------
// Game engine
// ------------------------------------------------------------

/**
 * Wires the logic layer to the canvas: owns the round, the render loop and
 * all pointer/keyboard input.
 */
class RugRush {
  /**
   * @param {HTMLCanvasElement} canvas Canvas element the game renders into.
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new Renderer(canvas);

    this.game = null;
    this.rugRect = null;
    this.totalDirt = 0;

    this.currentTool = Tool.PRESETS.LINT_ROLLER();
    this.pointer = { x: 0, y: 0, isDown: false, isOnScreen: false };

    this.lastFrameMs = 0;
    this.lastCleanMs = 0;
    this.isRunning = false;
  }

  /**
   * Sizes the canvas, starts a first round, binds input and kicks off the loop.
   *
   * @returns {void}
   */
  start() {
    this.handleResize();
    this.reset();
    this.bindEvents();

    this.isRunning = true;
    this.lastFrameMs = 0;
    window.requestAnimationFrame((timestamp) => this.loop(timestamp));
  }

  /**
   * Starts a fresh round: new dirt, new dog, cleared result.
   *
   * @returns {void}
   */
  reset() {
    this.rugRect = computeRugRect(this.renderer.width, this.renderer.height);

    const dirtPatches = spawnDirt(CONFIG.dirtCount, this.rugRect);
    const dog = new Dog({ baseIncreaseRate: CONFIG.passiveTemptationPerSecond });

    this.game = new GameManager({ dirtPatches, dog });
    this.totalDirt = dirtPatches.length;
    this.lastCleanMs = 0;
  }

  /**
   * Recomputes the canvas size and rug rectangle, keeping any dirt already on
   * the rug at the same relative position.
   *
   * @returns {void}
   */
  handleResize() {
    const previousRug = this.rugRect;

    this.renderer.resize();
    this.rugRect = computeRugRect(this.renderer.width, this.renderer.height);

    if (this.game && previousRug) {
      remapDirtToRug(this.game.dirtPatches, previousRug, this.rugRect);
    }
  }

  /**
   * The main loop. Converts the rAF timestamp into a deltaTime in seconds,
   * advances the simulation, then renders one frame.
   *
   * @param {number} timestampMs High-resolution timestamp from requestAnimationFrame.
   * @returns {void}
   */
  loop(timestampMs) {
    if (!this.isRunning) return;

    const rawDelta = this.lastFrameMs === 0 ? 0 : (timestampMs - this.lastFrameMs) / 1000;
    const deltaTime = clamp(rawDelta, 0, CONFIG.maxFrameSeconds);
    this.lastFrameMs = timestampMs;

    this.update(deltaTime, timestampMs);
    this.render();

    window.requestAnimationFrame((next) => this.loop(next));
  }

  /**
   * Advances one simulation step.
   *
   * @param {number} deltaTime Elapsed time since the previous frame, in seconds.
   * @param {number} nowMs Current timestamp, in milliseconds.
   * @returns {void}
   */
  update(deltaTime, nowMs) {
    if (this.game.result !== GameManager.RESULT.IN_PROGRESS) return;

    // Holding the button down keeps cleaning, throttled by cleanIntervalMs.
    if (this.pointer.isDown) {
      this.tryClean(nowMs);
    }

    this.game.update(deltaTime);
  }

  /**
   * Renders one frame.
   *
   * @returns {void}
   */
  render() {
    this.renderer.drawBackground();
    this.renderer.drawRug(this.rugRect);
    this.renderer.drawDirt(this.game.dirtPatches);
    this.renderer.drawDog(this.game.dog, this.rugRect);
    this.renderer.drawCursor(this.pointer, this.currentTool);
    this.renderer.drawHud({
      cleanedPercent: this.getCleanedPercent(),
      tool: this.currentTool,
      version: GAME_VERSION,
    });
    this.renderer.drawOverlay(this.game.result);
  }

  /**
   * Percentage of the original dirt that has been cleaned.
   *
   * @returns {number} A value in [0, 100].
   */
  getCleanedPercent() {
    if (this.totalDirt === 0) return 100;
    return ((this.totalDirt - this.game.dirtPatches.length) / this.totalDirt) * 100;
  }

  /**
   * Uses the current tool at the pointer position, respecting the cooldown.
   * Every accepted call goes through GameManager.cleanAt, so a whiff still
   * costs temptation exactly as the logic layer defines it.
   *
   * @param {number} nowMs Current timestamp, in milliseconds.
   * @returns {boolean} True when the tool was actually used.
   */
  tryClean(nowMs) {
    if (this.game.result !== GameManager.RESULT.IN_PROGRESS) return false;
    if (nowMs - this.lastCleanMs < CONFIG.cleanIntervalMs) return false;

    this.lastCleanMs = nowMs;
    this.game.cleanAt(this.pointer.x, this.pointer.y, this.currentTool);
    return true;
  }

  /**
   * Converts a viewport coordinate into canvas space and stores it.
   *
   * @param {number} clientX Viewport X, from a mouse or touch event.
   * @param {number} clientY Viewport Y, from a mouse or touch event.
   * @returns {void}
   */
  updatePointer(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = clientX - rect.left;
    this.pointer.y = clientY - rect.top;
    this.pointer.isOnScreen = true;
  }

  /**
   * Equips one of the tool presets.
   *
   * @param {string} presetKey A key of Tool.PRESETS, for example 'VACUUM'.
   * @returns {void}
   */
  selectTool(presetKey) {
    const factory = Tool.PRESETS[presetKey];
    if (factory) this.currentTool = factory();
  }

  /**
   * Handles a press. Starts cleaning, or restarts the game when a round is over.
   *
   * @param {number} clientX Viewport X of the press.
   * @param {number} clientY Viewport Y of the press.
   * @returns {void}
   */
  handlePressStart(clientX, clientY) {
    this.updatePointer(clientX, clientY);

    if (this.game.result !== GameManager.RESULT.IN_PROGRESS) {
      this.reset();
      return;
    }

    this.pointer.isDown = true;
    this.tryClean(window.performance.now());
  }

  /**
   * Registers every mouse, touch, keyboard and window listener.
   *
   * @returns {void}
   */
  bindEvents() {
    const canvas = this.canvas;

    // --- Mouse ---
    canvas.addEventListener('mousedown', (event) => {
      event.preventDefault();
      this.handlePressStart(event.clientX, event.clientY);
    });

    canvas.addEventListener('mousemove', (event) => {
      this.updatePointer(event.clientX, event.clientY);
      if (this.pointer.isDown) this.tryClean(window.performance.now());
    });

    window.addEventListener('mouseup', () => {
      this.pointer.isDown = false;
    });

    canvas.addEventListener('mouseleave', () => {
      this.pointer.isDown = false;
      this.pointer.isOnScreen = false;
    });

    // --- Touch ---
    canvas.addEventListener('touchstart', (event) => {
      event.preventDefault();
      const touch = event.changedTouches[0];
      this.handlePressStart(touch.clientX, touch.clientY);
    }, { passive: false });

    canvas.addEventListener('touchmove', (event) => {
      event.preventDefault();
      const touch = event.changedTouches[0];
      this.updatePointer(touch.clientX, touch.clientY);
      if (this.pointer.isDown) this.tryClean(window.performance.now());
    }, { passive: false });

    const endTouch = () => {
      this.pointer.isDown = false;
      this.pointer.isOnScreen = false;
    };
    canvas.addEventListener('touchend', endTouch);
    canvas.addEventListener('touchcancel', endTouch);

    // --- Keyboard: tool swap and restart ---
    window.addEventListener('keydown', (event) => {
      if (event.key === '1') this.selectTool('LINT_ROLLER');
      if (event.key === '2') this.selectTool('BRUSH');
      if (event.key === '3') this.selectTool('VACUUM');
      if (event.key === 'r' || event.key === 'R') this.reset();
    });

    // --- Window ---
    window.addEventListener('resize', () => this.handleResize());
  }
}

// ------------------------------------------------------------
// Bootstrap
// ------------------------------------------------------------

/**
 * Boots the game once the DOM is ready.
 * Guarded so the file can also be loaded in a non-browser context (tests).
 */
if (typeof document !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return;

    const rugRush = new RugRush(canvas);
    rugRush.start();

    // Handy for poking at the game from the browser console.
    window.rugRush = rugRush;
  });
}
