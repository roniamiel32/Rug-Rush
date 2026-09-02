/**
 * File:        main.js
 * Author:      Roni Amiel & Noa Amiel
 * Description: Rug Rush - core game logic (Dirt, Tool, Dog, GameManager) and
 *              presentation layer (canvas renderer, game loop, input).
 * Version:     0.3.0
 *
 * Modifications:
 *     0.1.0 - 2026-09-01 - Core logic layer: Dirt, Tool, Dog, GameManager
 *     0.2.0 - 2026-09-01 - Added Renderer, RugRush engine, game loop and
 *                          mouse/touch input; removed the console sanity check
 *     0.3.0 - 2026-09-01 - Tool penalties are now deltaTime-scaled (no more
 *                          instant loss), Shiki shakes and sheds hair near the
 *                          top of the meter, restyled to the Stitch palette and
 *                          Plus Jakarta Sans typography, authorship updated
 */

// ============================================================
// RUG RUSH - Core Game Logic & Data Structures
// No rendering/UI code - pure logic layer
// ============================================================

/**
 * Represents a single patch of dog hair/dirt on the rug.
 */
class Dirt {
  /**
   * @param {number} x Center X, in canvas pixels.
   * @param {number} y Center Y, in canvas pixels.
   * @param {number} [radius=10] Patch radius, in canvas pixels.
   */
  constructor(x, y, radius = 10) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.isCleaned = false;
    /** Seconds since this patch appeared. Drives the "freshly shed" pop-in. */
    this.age = 0;
    /** True when Shiki shook this patch loose mid-round. */
    this.isShed = false;
  }

  /**
   * Checks if a given point (with some interaction radius) overlaps this dirt
   * patch. Uses simple circle-circle collision.
   *
   * @param {number} x Tool center X.
   * @param {number} y Tool center Y.
   * @param {number} hitRadius Tool cleaning radius.
   * @returns {boolean} True when the tool overlaps this patch.
   */
  isHitBy(x, y, hitRadius) {
    if (this.isCleaned) return false;
    const dx = this.x - x;
    const dy = this.y - y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance <= this.radius + hitRadius;
  }

  /**
   * Marks this patch as cleaned.
   *
   * @returns {void}
   */
  clean() {
    this.isCleaned = true;
  }
}

/**
 * Represents a cleaning tool (Lint Roller, Vacuum, Brush, etc.)
 */
class Tool {
  /**
   * @param {string} name Display name.
   * @param {number} cleaningRadius How far the tool reaches, in canvas pixels.
   * @param {number} aggressiveness Temptation added per SECOND of use.
   * @param {string} [key] Preset key, used by the tool dock.
   */
  constructor(name, cleaningRadius, aggressiveness, key = '') {
    this.name = name;
    this.cleaningRadius = cleaningRadius; // how far it reaches when cleaning
    this.aggressiveness = aggressiveness; // temptation added per second of use
    this.key = key;
  }
}

/**
 * Tool presets. Aggressiveness is measured per second of continuous use, so a
 * noisy vacuum spikes the meter fast while a lint roller barely registers.
 */
Tool.PRESETS = {
  LINT_ROLLER: () => new Tool('Roller', 26, 3.5, 'LINT_ROLLER'),
  BRUSH: () => new Tool('Brush', 38, 7, 'BRUSH'),
  VACUUM: () => new Tool('Vacuum', 58, 14, 'VACUUM'),
};

/** Order the tools appear in the dock. */
Tool.ORDER = ['LINT_ROLLER', 'BRUSH', 'VACUUM'];

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

  /**
   * "Shake and shed" tuning. Near the top of the meter Shiki wakes up, shakes
   * herself out, and drops fresh hair back onto the rug.
   */
  static SHAKE = Object.freeze({
    /** Meter value at which she starts shaking. */
    threshold: 76,
    /** Seconds between shakes once she is past the threshold. */
    intervalSeconds: 5,
    /** How long one shake lasts, in seconds. */
    durationSeconds: 0.9,
    /** Patches of hair dropped per shake. */
    hairShed: 5,
  });

  /**
   * @param {object} [options] Construction options.
   * @param {number} [options.baseIncreaseRate=1] Passive temptation per second.
   */
  constructor({ baseIncreaseRate = 1 } = {}) {
    this.temptationMeter = 0;
    this.state = Dog.STATES.WATCHING;
    this.baseIncreaseRate = baseIncreaseRate; // meter increase per second (passive)

    /** True while a shake animation is playing. */
    this.isShaking = false;
    /** Seconds spent in the current shake, or since the last one. */
    this.shakeTimer = 0;
    /** True once the meter has passed the shake threshold. */
    this.isArmedToShake = false;
    /** How many times she has shaken this round. */
    this.shakeCount = 0;
  }

  /**
   * Called every frame with deltaTime (in seconds) to apply the passive,
   * time-based temptation increase and advance the shake cycle.
   *
   * @param {number} deltaTime Seconds elapsed since the previous frame.
   * @returns {number} How many hair patches she shed this frame (0 for none).
   */
  updateOverTime(deltaTime) {
    this.increaseTemptation(this.baseIncreaseRate * deltaTime);
    return this._updateShake(deltaTime);
  }

  /**
   * Called while a tool is in use, applying its aggressiveness as a penalty
   * scaled by how long the tool ran.
   *
   * @param {Tool} tool The tool being used.
   * @param {number} [seconds=1] Seconds of use this penalty covers.
   * @returns {void}
   */
  applyToolPenalty(tool, seconds = 1) {
    this.increaseTemptation(tool.aggressiveness * seconds);
  }

  /**
   * Core method to raise the temptation meter and re-evaluate state.
   *
   * @param {number} amount Temptation points to add.
   * @returns {void}
   */
  increaseTemptation(amount) {
    if (this.state === Dog.STATES.SITTING) return; // already lost, no-op

    this.temptationMeter = Math.min(Dog.THRESHOLDS.SITTING, this.temptationMeter + amount);
    this._updateState();
  }

  /**
   * How close the meter is to the top, as a 0-1 ratio.
   *
   * @returns {number} A value in [0, 1].
   */
  getTemptationRatio() {
    return this.temptationMeter / Dog.THRESHOLDS.SITTING;
  }

  /**
   * Progress through the current shake animation.
   *
   * @returns {number} A value in [0, 1], or 0 when she is not shaking.
   */
  getShakeProgress() {
    if (!this.isShaking) return 0;
    return Math.min(1, this.shakeTimer / Dog.SHAKE.durationSeconds);
  }

  /**
   * Internal: advances the shake cycle.
   *
   * @param {number} deltaTime Seconds elapsed since the previous frame.
   * @returns {number} Patches shed this frame (0 or Dog.SHAKE.hairShed).
   */
  _updateShake(deltaTime) {
    if (this.isSitting()) {
      this.isShaking = false;
      return 0;
    }

    if (this.temptationMeter < Dog.SHAKE.threshold) {
      this.isArmedToShake = false;
      this.isShaking = false;
      this.shakeTimer = 0;
      return 0;
    }

    // First frame past the threshold: shake straight away.
    if (!this.isArmedToShake) {
      this.isArmedToShake = true;
      this.shakeTimer = Dog.SHAKE.intervalSeconds;
    }

    this.shakeTimer += deltaTime;

    if (this.isShaking) {
      if (this.shakeTimer >= Dog.SHAKE.durationSeconds) {
        this.isShaking = false;
        this.shakeTimer = 0;
      }
      return 0;
    }

    if (this.shakeTimer >= Dog.SHAKE.intervalSeconds) {
      this.isShaking = true;
      this.shakeTimer = 0;
      this.shakeCount += 1;
      return Dog.SHAKE.hairShed;
    }

    return 0;
  }

  /**
   * Internal: checks thresholds and transitions state accordingly.
   *
   * @returns {void}
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

  /**
   * @returns {boolean} True once she has sat down on the rug.
   */
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

  /**
   * @param {object} [options] Construction options.
   * @param {Dirt[]} [options.dirtPatches] Starting dirt patches.
   * @param {Dog} [options.dog] The dog instance.
   * @param {Function} [options.shedDirt] Called with a patch count when Shiki
   *        shakes; must return an array of new Dirt instances. The logic layer
   *        stays free of rug geometry this way.
   */
  constructor({ dirtPatches = [], dog = new Dog(), shedDirt = null } = {}) {
    this.dirtPatches = dirtPatches; // array of Dirt instances
    this.dog = dog;
    this.shedDirt = shedDirt;
    this.result = GameManager.RESULT.IN_PROGRESS;

    /** Patches present at the start of the round. */
    this.initialDirtCount = dirtPatches.length;
    /** Patches Shiki has shed back onto the rug this round. */
    this.shedCount = 0;
    /** Patches shed by the most recent shake, for the renderer's poof effect. */
    this.lastShedPatches = [];
  }

  /**
   * Attempts to clean at a given (x, y) using the specified tool. Removes any
   * dirt hit by the tool's cleaning radius, then applies the tool's temptation
   * penalty to the dog, scaled by how long the tool ran this frame.
   *
   * @param {number} x Tool center X.
   * @param {number} y Tool center Y.
   * @param {Tool} tool The tool in use.
   * @param {number} [deltaTime=1/60] Seconds of tool use this call represents.
   * @returns {string} The resulting GameManager.RESULT value.
   */
  cleanAt(x, y, tool, deltaTime = 1 / 60) {
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

    // Using the tool always tempts the dog, whether or not it hit dirt.
    this.dog.applyToolPenalty(tool, deltaTime);

    return this._evaluateGameState();
  }

  /**
   * Called every frame to advance passive temptation and Shiki's shake cycle.
   * A shake drops fresh hair back onto the rug through the shedDirt factory.
   *
   * @param {number} deltaTime Seconds elapsed since the previous frame.
   * @returns {string} The resulting GameManager.RESULT value.
   */
  update(deltaTime) {
    if (this.result !== GameManager.RESULT.IN_PROGRESS) return this.result;

    this.dirtPatches.forEach((dirt) => {
      dirt.age += deltaTime;
    });

    const shedRequest = this.dog.updateOverTime(deltaTime);
    if (shedRequest > 0) this._shedHair(shedRequest);

    return this._evaluateGameState();
  }

  /**
   * Total patches this round has produced, including everything Shiki shed.
   *
   * @returns {number} The denominator behind the "rug cleaned" percentage.
   */
  getTotalDirtCount() {
    return this.initialDirtCount + this.shedCount;
  }

  /**
   * Percentage of all dirt cleaned so far.
   *
   * @returns {number} A value in [0, 100].
   */
  getCleanedPercent() {
    const total = this.getTotalDirtCount();
    if (total === 0) return 100;
    return ((total - this.dirtPatches.length) / total) * 100;
  }

  /**
   * Checks if all dirt has been cleaned (win condition).
   *
   * @returns {boolean} True when the rug is spotless.
   */
  checkWinCondition() {
    return this.dirtPatches.length === 0;
  }

  /**
   * Checks if the dog has reached the Sitting state (loss condition).
   *
   * @returns {boolean} True when Shiki has sat down.
   */
  checkLossCondition() {
    return this.dog.isSitting();
  }

  /**
   * Internal: asks the shedDirt factory for fresh patches and adds them.
   *
   * @param {number} count How many patches to shed.
   * @returns {number} How many patches were actually added.
   */
  _shedHair(count) {
    this.lastShedPatches = [];
    if (typeof this.shedDirt !== 'function') return 0;

    const patches = this.shedDirt(count) || [];
    patches.forEach((patch) => this.dirtPatches.push(patch));

    this.shedCount += patches.length;
    this.lastShedPatches = patches;
    return patches.length;
  }

  /**
   * Internal: evaluates and updates the overall game result after any action.
   *
   * @returns {string} The resulting GameManager.RESULT value.
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
// RUG RUSH - Presentation Layer
// Canvas renderer, game loop and pointer input.
// Palette and typography follow the Stitch design concept.
// ============================================================

/** Semantic version of the game. Mirrors the "version" field in package.json. */
const GAME_VERSION = '0.3.0';

/** Two pi, used all over the drawing code. */
const TAU = Math.PI * 2;

/**
 * Tunable gameplay and presentation constants.
 * Balance values live here so tuning never touches the logic layer.
 */
const CONFIG = Object.freeze({
  /** Number of dirt patches spawned at the start of a round. */
  dirtCount: 26,
  /** Dirt patch radius range, in CSS pixels. */
  dirtRadiusMin: 8,
  dirtRadiusMax: 17,
  /** Upper bound on a single frame's deltaTime, in seconds (tab-switch guard). */
  maxFrameSeconds: 0.05,
  /** Passive temptation gained per second while the round runs. */
  passiveTemptationPerSecond: 1.1,
  /** Seconds of tool use charged for a single tap, so a tap is never free. */
  tapImpulseSeconds: 0.12,
  /** How far from Shiki freshly shed hair can land, in CSS pixels. */
  shedSpreadRadius: 190,
  /** Seconds a shed patch keeps its "fresh" highlight. */
  freshHairSeconds: 1.4,
});

/** Layout metrics, in CSS pixels. */
const LAYOUT = Object.freeze({
  topBarHeight: 84,
  dockHeight: 72,
  dockMaxWidth: 440,
  dockBottomGap: 16,
  dockSideMargin: 16,
});

/**
 * Stitch design palette: cozy creams, warm browns and coral accents.
 */
const PALETTE = Object.freeze({
  background: '#fdf9f4',
  surfaceBright: '#fdf9f4',
  surfaceContainerLow: '#f7f3ee',
  surfaceContainer: '#f1ede8',
  surfaceVariant: '#e6e2dd',
  surfaceDim: '#ddd9d5',
  onSurface: '#1c1c19',
  onSurfaceVariant: '#56423e',
  outline: '#89726d',
  outlineVariant: '#ddc0ba',
  primary: '#9f402d',
  primaryContainer: '#e2725b',
  primaryFixed: '#ffdad3',
  inversePrimary: '#ffb4a5',
  onPrimary: '#ffffff',
  onPrimaryFixedVariant: '#802918',
  secondary: '#006496',
  secondaryContainer: '#77c2fe',
  onSecondaryContainer: '#004f79',
  secondaryFixed: '#cce5ff',
  tertiary: '#805533',
  tertiaryContainer: '#bb8863',
  tertiaryFixedDim: '#f4bb92',
  tertiaryFixed: '#ffdcc5',
  onTertiaryFixed: '#301400',
  inverseSurface: '#31302d',
  woodDark: '#8b5e3c',
  woodLight: '#a67c52',
  rug: '#f4f0eb',
  rugPattern: '#e6e2dd',
  hair: '#56423e',
  hairDark: '#3b2b28',
});

/**
 * Typography. Plus Jakarta Sans carries every heading and UI label, with
 * Be Vietnam Pro for body copy, matching the Stitch type ramp.
 */
const FONTS = Object.freeze({
  heading: '"Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif',
  body: '"Plus Jakarta Sans", "Segoe UI", system-ui, sans-serif',
});

/**
 * Builds a canvas font string.
 *
 * @param {number|string} weight CSS font weight.
 * @param {number} size Font size in CSS pixels.
 * @param {string} [family=FONTS.heading] Font family stack.
 * @returns {string} A value for ctx.font.
 */
function font(weight, size, family = FONTS.heading) {
  return `${weight} ${size}px ${family}`;
}

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
 * Hashes a 2D point into a stable unsigned integer. Gives each dirt patch a
 * fixed hair pattern without storing extra state on the Dirt instances.
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
 * Computes the play area: everything between the top HUD bar and the tool dock.
 *
 * @param {number} width Viewport width in CSS pixels.
 * @param {number} height Viewport height in CSS pixels.
 * @returns {{x: number, y: number, w: number, h: number}} The play area.
 */
function computePlayArea(width, height) {
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
function computeRugRect(width, height) {
  const play = computePlayArea(width, height);
  const gutter = clamp(width * 0.14, 86, 160);
  const rightMargin = clamp(width * 0.05, 18, 70);
  const verticalMargin = clamp(play.h * 0.06, 14, 48);

  return {
    x: gutter,
    y: play.y + verticalMargin,
    w: Math.max(120, play.w - gutter - rightMargin),
    h: Math.max(120, play.h - verticalMargin * 2),
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
function computeToolDockLayout(width, height) {
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
function hitTestToolDock(dock, x, y) {
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
function spawnDirt(count, rug, rng = Math.random) {
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
function shedDirtAround(count, rug, origin, rng = Math.random) {
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

/**
 * Computes where Shiki stands and how big she is drawn. She starts in the left
 * gutter and creeps onto the rug as the temptation meter fills.
 *
 * @param {Dog} dog The dog instance.
 * @param {{x: number, y: number, w: number, h: number}} rug Rug rectangle.
 * @returns {{x: number, y: number, scale: number}} Her anchor point and scale.
 */
function computeDogAnchor(dog, rug) {
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

// ------------------------------------------------------------
// Renderer
// ------------------------------------------------------------

/**
 * Draws every visual element of the game onto a 2D canvas context.
 * The renderer is stateless with respect to gameplay: it only reads the objects
 * it is handed, so the logic layer stays free of drawing code.
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

    this.floorImage = new Image();

    this.floorImage.onload = () => {
      console.log('Floor image loaded successfully');
    };

    this.floorImage.onerror = () => {
      console.error('Could not load floor image:', this.floorImage.src);
    };

    this.floorImage.src = 'assets/images/floor-bg.png';
  }

  /**
   * Resizes the backing store to match the element size and device pixel ratio,
   * then scales the context so all drawing happens in CSS pixels.
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
   * Paints the warm wooden floor behind the rug.
   *
   * @returns {void}
   */
  drawBackground() {
    const ctx = this.ctx;

    ctx.fillStyle = PALETTE.background;
    ctx.fillRect(0, 0, this.width, this.height);

    if (
      !this.floorImage.complete ||
      this.floorImage.naturalWidth === 0
    ) {
      return;
    }

    const imageWidth = this.floorImage.naturalWidth;
    const imageHeight = this.floorImage.naturalHeight;

    const scale = Math.max(
      this.width / imageWidth,
      this.height / imageHeight
    );

    const drawWidth = imageWidth * scale;
    const drawHeight = imageHeight * scale;

    const x = (this.width - drawWidth) / 2;
    const y = (this.height - drawHeight) / 2;

    ctx.drawImage(
      this.floorImage,
      x,
      y,
      drawWidth,
      drawHeight
    );
  }

  /**
   * Draws the rug the player has to clean.
   *
   * @param {{x: number, y: number, w: number, h: number}} rug Rug rectangle.
   * @returns {void}
   */
  drawRug(rug) {
    const ctx = this.ctx;
    const radius = 26;

    ctx.save();
    ctx.shadowColor = 'rgba(139, 94, 60, 0.45)';
    ctx.shadowBlur = 34;
    ctx.shadowOffsetY = 16;
    ctx.fillStyle = PALETTE.rug;
    pathRoundRect(ctx, rug.x, rug.y, rug.w, rug.h, radius);
    ctx.fill();
    ctx.restore();

    // Dotted weave, clipped to the rug.
    ctx.save();
    pathRoundRect(ctx, rug.x, rug.y, rug.w, rug.h, radius);
    ctx.clip();
    ctx.fillStyle = PALETTE.rugPattern;
    for (let y = rug.y + 8; y < rug.y + rug.h; y += 16) {
      for (let x = rug.x + 8; x < rug.x + rug.w; x += 16) {
        ctx.beginPath();
        ctx.arc(x, y, 1.2, 0, TAU);
        ctx.fill();
      }
    }
    ctx.restore();

    ctx.strokeStyle = PALETTE.primaryContainer;
    ctx.lineWidth = 5;
    pathRoundRect(ctx, rug.x, rug.y, rug.w, rug.h, radius);
    ctx.stroke();

    const inset = 18;
    ctx.strokeStyle = PALETTE.outlineVariant;
    ctx.lineWidth = 2;
    pathRoundRect(ctx, rug.x + inset, rug.y + inset, rug.w - inset * 2, rug.h - inset * 2, 16);
    ctx.stroke();

    // Fringe along the short edges.
    ctx.strokeStyle = PALETTE.tertiaryFixed;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    for (let y = rug.y + 20; y < rug.y + rug.h - 12; y += 15) {
      ctx.beginPath();
      ctx.moveTo(rug.x - 9, y);
      ctx.lineTo(rug.x - 1, y);
      ctx.moveTo(rug.x + rug.w + 1, y);
      ctx.lineTo(rug.x + rug.w + 9, y);
      ctx.stroke();
    }
  }

  /**
   * Draws every uncleaned dirt patch as a clump of dog hair. Freshly shed hair
   * pops in and keeps a coral halo for a moment so the player notices it.
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
      const isFresh = dirt.isShed && dirt.age < CONFIG.freshHairSeconds;
      const popIn = clamp(dirt.age / 0.3, 0, 1);
      const scale = dirt.isShed && dirt.age < 0.3 ? lerp(0.3, 1.12, popIn) : 1;

      ctx.save();
      ctx.translate(dirt.x, dirt.y);
      ctx.scale(scale, scale);

      if (isFresh) {
        ctx.globalAlpha = 0.35 * (1 - dirt.age / CONFIG.freshHairSeconds);
        ctx.fillStyle = PALETTE.primaryContainer;
        ctx.beginPath();
        ctx.arc(0, 0, dirt.radius * 1.5, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      ctx.fillStyle = PALETTE.hair;
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, dirt.radius * 0.72, dirt.radius * 0.52, (seed % 180) * (Math.PI / 180), 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.strokeStyle = PALETTE.hairDark;
      ctx.lineWidth = 1.3;
      for (let i = 0; i < 8; i += 1) {
        const angle = (((seed >>> (i * 3)) % 360) + i * 45) * (Math.PI / 180);
        const length = dirt.radius * (0.55 + ((seed >>> i) % 6) / 20);
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * dirt.radius * 0.15, Math.sin(angle) * dirt.radius * 0.15);
        ctx.quadraticCurveTo(
          Math.cos(angle + 0.5) * length * 0.6,
          Math.sin(angle + 0.5) * length * 0.6,
          Math.cos(angle) * length,
          Math.sin(angle) * length,
        );
        ctx.stroke();
      }

      ctx.restore();
    });
  }

  /**
   * Draws Shiki. She creeps toward the rug as the meter fills, and wobbles hard
   * while shaking hair loose.
   *
   * @param {Dog} dog The dog instance from the logic layer.
   * @param {{x: number, y: number, w: number, h: number}} rug Rug rectangle.
   * @param {number} elapsedSeconds Total time the round has been running.
   * @returns {void}
   */
  drawDog(dog, rug, elapsedSeconds) {
    const ctx = this.ctx;
    const anchor = computeDogAnchor(dog, rug);
    const t = clamp(dog.getTemptationRatio(), 0, 1);
    const shake = dog.getShakeProgress();

    // Idle bob, plus a hard wobble during a shake.
    const bob = Math.sin(elapsedSeconds * 2.2) * 2;
    const wobble = dog.isShaking ? Math.sin(shake * Math.PI * 10) * 0.22 : 0;

    ctx.save();
    ctx.translate(anchor.x, anchor.y + bob);
    ctx.scale(anchor.scale, anchor.scale);
    ctx.rotate(wobble);

    // Ground shadow.
    ctx.fillStyle = 'rgba(60, 40, 30, 0.18)';
    ctx.beginPath();
    ctx.ellipse(0, 44, 40, 10, 0, 0, TAU);
    ctx.fill();

    const coat = PALETTE.tertiaryFixedDim;
    const coatDark = PALETTE.tertiaryContainer;

    ctx.strokeStyle = PALETTE.onTertiaryFixed;
    ctx.lineWidth = 3;

    // Tail - wags faster the more tempted she is.
    const tailSwing = Math.sin(elapsedSeconds * (3 + t * 9)) * (6 + t * 14);
    ctx.strokeStyle = coatDark;
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-28, 12);
    ctx.quadraticCurveTo(-50, 2 - tailSwing, -44, -20 - tailSwing);
    ctx.stroke();

    ctx.strokeStyle = PALETTE.onTertiaryFixed;
    ctx.lineWidth = 3;

    // Body.
    ctx.fillStyle = coat;
    ctx.beginPath();
    ctx.ellipse(-4, 16, 34, 27, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();

    // Chest fluff.
    ctx.fillStyle = PALETTE.tertiaryFixed;
    ctx.beginPath();
    ctx.ellipse(6, 24, 18, 15, 0, 0, TAU);
    ctx.fill();

    // Head.
    ctx.fillStyle = coat;
    ctx.beginPath();
    ctx.arc(20, -14, 22, 0, TAU);
    ctx.fill();
    ctx.stroke();

    // Ears - perk up with temptation.
    const earLift = t * 7;
    ctx.fillStyle = coatDark;
    ctx.beginPath();
    ctx.moveTo(6, -28);
    ctx.lineTo(-2, -48 - earLift);
    ctx.lineTo(18, -33);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(34, -29);
    ctx.lineTo(42, -48 - earLift);
    ctx.lineTo(24, -33);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Muzzle.
    ctx.fillStyle = PALETTE.tertiaryFixed;
    ctx.beginPath();
    ctx.ellipse(28, -6, 14, 11, 0, 0, TAU);
    ctx.fill();

    // Eyes - squeezed shut mid-shake.
    ctx.strokeStyle = PALETTE.onTertiaryFixed;
    ctx.fillStyle = PALETTE.onTertiaryFixed;
    if (dog.isShaking) {
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(11, -19);
      ctx.lineTo(19, -19);
      ctx.moveTo(27, -19);
      ctx.lineTo(35, -19);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(15, -19, 3, 0, TAU);
      ctx.arc(31, -19, 3, 0, TAU);
      ctx.fill();
    }

    // Nose.
    ctx.beginPath();
    ctx.arc(30, -7, 4.2, 0, TAU);
    ctx.fill();

    // Collar in the accent color for her current state.
    ctx.strokeStyle = dog.isSitting() ? PALETTE.primary : PALETTE.primaryContainer;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(20, -14, 22, 0.35, 1.15);
    ctx.stroke();

    // Loose hair flying off during a shake.
    if (dog.isShaking) {
      ctx.strokeStyle = PALETTE.hair;
      ctx.lineWidth = 2.5;
      const burst = 1 - shake;
      for (let i = 0; i < 10; i += 1) {
        const angle = (i / 10) * TAU + shake * 4;
        const distance = 42 + shake * 46;
        const x = Math.cos(angle) * distance;
        const y = Math.sin(angle) * distance * 0.7;
        ctx.globalAlpha = clamp(burst, 0, 1);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(angle) * 9, y + Math.sin(angle) * 9);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    this.drawDogLabel(dog, anchor);
  }

  /**
   * Draws Shiki's state label, and a warning while she is shaking hair loose.
   *
   * @param {Dog} dog The dog instance.
   * @param {{x: number, y: number, scale: number}} anchor Her drawing anchor.
   * @returns {void}
   */
  drawDogLabel(dog, anchor) {
    const ctx = this.ctx;
    const y = anchor.y + 60 * anchor.scale;
    const labelX = clamp(anchor.x, 62, Math.max(62, this.width - 62));

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (dog.isShaking) {
      const text = 'Shaking!';
      ctx.font = font(800, 15);
      const w = ctx.measureText(text).width + 22;

      ctx.fillStyle = PALETTE.primary;
      pathRoundRect(ctx, labelX - w / 2, y - 14, w, 28, 14);
      ctx.fill();

      ctx.fillStyle = PALETTE.onPrimary;
      ctx.fillText(text, labelX, y);
      return;
    }

    ctx.font = font(700, 13);
    ctx.fillStyle = PALETTE.surfaceBright;
    const label = dog.state;
    const width = ctx.measureText(label).width + 20;
    pathRoundRect(ctx, labelX - width / 2, y - 12, width, 24, 12);
    ctx.fill();

    ctx.fillStyle = PALETTE.onSurfaceVariant;
    ctx.fillText(label, labelX, y);
  }

  /**
   * Draws the top HUD bar: cleaning progress and Shiki's temptation meter.
   *
   * @param {{cleanedPercent: number, dog: Dog}} stats HUD data.
   * @returns {void}
   */
  drawTopBar(stats) {
    const ctx = this.ctx;
    const h = LAYOUT.topBarHeight;

    ctx.save();
    ctx.shadowColor = 'rgba(60, 40, 30, 0.18)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 3;
    ctx.fillStyle = PALETTE.surfaceBright;
    ctx.fillRect(0, 0, this.width, h);
    ctx.restore();

    const isNarrow = this.width < 560;
    const centerY = h / 2;

    // Logo chip with a paw print.
    const logoR = 22;
    const logoX = 20 + logoR;
    ctx.fillStyle = PALETTE.primaryFixed;
    ctx.beginPath();
    ctx.arc(logoX, centerY, logoR, 0, TAU);
    ctx.fill();

    ctx.fillStyle = PALETTE.primary;
    ctx.beginPath();
    ctx.ellipse(logoX, centerY + 5, 8, 6.5, 0, 0, TAU);
    ctx.fill();
    [-8, -3, 3, 8].forEach((offset, index) => {
      ctx.beginPath();
      ctx.ellipse(logoX + offset, centerY - 6 - (index === 1 || index === 2 ? 2 : 0), 2.8, 3.6, 0, 0, TAU);
      ctx.fill();
    });

    // Cleaning progress.
    const textX = logoX + logoR + 14;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';

    ctx.font = font(700, 11, FONTS.body);
    ctx.fillStyle = PALETTE.onSurfaceVariant;
    ctx.fillText('CLEAN', textX, centerY - 6);

    ctx.font = font(800, 30);
    ctx.fillStyle = PALETTE.primary;
    const percentText = `${Math.round(stats.cleanedPercent)}`;
    ctx.fillText(percentText, textX, centerY + 22);

    const percentWidth = ctx.measureText(percentText).width;
    ctx.font = font(500, 15, FONTS.body);
    ctx.fillText('%', textX + percentWidth + 3, centerY + 22);

    // Temptation meter.
    const meterW = isNarrow ? Math.max(110, this.width * 0.34) : 210;
    const meterX = this.width - meterW - 20;
    this.drawTemptationMeter(stats.dog, meterX, centerY - 6, meterW);
  }

  /**
   * Draws the temptation meter track, fill, knob and labels.
   *
   * @param {Dog} dog The dog whose meter is drawn.
   * @param {number} x Meter left edge.
   * @param {number} y Meter top edge.
   * @param {number} w Meter width.
   * @returns {void}
   */
  drawTemptationMeter(dog, x, y, w) {
    const ctx = this.ctx;
    const h = 14;
    const ratio = clamp(dog.getTemptationRatio(), 0, 1);

    ctx.font = font(700, 11, FONTS.body);
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = PALETTE.onSurfaceVariant;
    ctx.textAlign = 'left';
    ctx.fillText('SHIKI', x, y - 6);
    ctx.textAlign = 'right';
    ctx.fillText(dog.state.toUpperCase(), x + w, y - 6);

    ctx.fillStyle = PALETTE.surfaceVariant;
    pathRoundRect(ctx, x, y, w, h, h / 2);
    ctx.fill();

    if (ratio > 0) {
      const gradient = ctx.createLinearGradient(x, 0, x + w, 0);
      gradient.addColorStop(0, PALETTE.primary);
      gradient.addColorStop(1, PALETTE.inversePrimary);

      ctx.save();
      pathRoundRect(ctx, x, y, w, h, h / 2);
      ctx.clip();
      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, w * ratio, h);
      ctx.restore();

      // Knob at the head of the fill.
      const knobX = clamp(x + w * ratio, x + 8, x + w - 8);
      ctx.fillStyle = PALETTE.onPrimary;
      ctx.strokeStyle = PALETTE.surfaceVariant;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(knobX, y + h / 2, 8, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }

    // Tick at the Approaching threshold, and at the shake threshold.
    ctx.strokeStyle = 'rgba(86, 66, 62, 0.35)';
    ctx.lineWidth = 2;
    [Dog.THRESHOLDS.APPROACHING, Dog.SHAKE.threshold].forEach((value) => {
      const tickX = x + w * (value / Dog.THRESHOLDS.SITTING);
      ctx.beginPath();
      ctx.moveTo(tickX, y + 2);
      ctx.lineTo(tickX, y + h - 2);
      ctx.stroke();
    });
  }

  /**
   * Draws the bottom tool dock.
   *
   * @param {{x: number, y: number, w: number, h: number, buttons: object[]}} dock Dock layout.
   * @param {Tool} currentTool The equipped tool.
   * @returns {void}
   */
  drawToolDock(dock, currentTool) {
    const ctx = this.ctx;

    ctx.save();
    ctx.shadowColor = 'rgba(60, 40, 30, 0.28)';
    ctx.shadowBlur = 22;
    ctx.shadowOffsetY = 6;
    ctx.fillStyle = PALETTE.surfaceContainerLow;
    pathRoundRect(ctx, dock.x, dock.y, dock.w, dock.h, 22);
    ctx.fill();
    ctx.restore();

    dock.buttons.forEach((button) => {
      const tool = Tool.PRESETS[button.key]();
      const isActive = currentTool.key === button.key;
      const cx = button.x + button.w / 2;
      const cy = button.y + button.h / 2;

      if (isActive) {
        ctx.fillStyle = PALETTE.onSecondaryContainer;
        pathRoundRect(ctx, button.x + 4, button.y + 4, button.w - 8, button.h - 4, 18);
        ctx.fill();

        ctx.fillStyle = PALETTE.secondaryContainer;
        pathRoundRect(ctx, button.x + 4, button.y + 2, button.w - 8, button.h - 4, 18);
        ctx.fill();
      }

      const inkColor = isActive ? PALETTE.onSecondaryContainer : PALETTE.onSurfaceVariant;
      this.drawToolIcon(button.key, cx, cy - 9, inkColor);

      ctx.fillStyle = inkColor;
      ctx.font = font(700, 12, FONTS.body);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(tool.name.toUpperCase(), cx, cy + 16);
    });
  }

  /**
   * Draws a placeholder glyph for one tool.
   *
   * @param {string} key Tool preset key.
   * @param {number} cx Icon center X.
   * @param {number} cy Icon center Y.
   * @param {string} color Ink color.
   * @returns {void}
   */
  drawToolIcon(key, cx, cy, color) {
    const ctx = this.ctx;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';

    if (key === 'LINT_ROLLER') {
      pathRoundRect(ctx, -11, -7, 22, 9, 4);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, 2);
      ctx.lineTo(0, 9);
      ctx.stroke();
    } else if (key === 'BRUSH') {
      pathRoundRect(ctx, -11, -8, 22, 8, 3);
      ctx.fill();
      for (let i = -8; i <= 8; i += 4) {
        ctx.beginPath();
        ctx.moveTo(i, 1);
        ctx.lineTo(i, 8);
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.arc(-2, 0, 8, 0, TAU);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(5, -4);
      ctx.lineTo(12, -9);
      ctx.lineTo(12, 6);
      ctx.lineTo(5, 3);
      ctx.closePath();
      ctx.fill();
    }

    ctx.restore();
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
    ctx.globalAlpha = pointer.isDown ? 0.32 : 0.18;
    ctx.fillStyle = PALETTE.secondaryFixed;
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, tool.cleaningRadius, 0, TAU);
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.strokeStyle = PALETTE.secondaryContainer;
    ctx.lineWidth = pointer.isDown ? 4 : 2.5;
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, tool.cleaningRadius, 0, TAU);
    ctx.stroke();

    ctx.strokeStyle = PALETTE.secondary;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pointer.x - 7, pointer.y);
    ctx.lineTo(pointer.x + 7, pointer.y);
    ctx.moveTo(pointer.x, pointer.y - 7);
    ctx.lineTo(pointer.x, pointer.y + 7);
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Draws the end-of-round modal card.
   *
   * @param {{result: string, cleanedPercent: number, dog: Dog}} stats Round summary.
   * @returns {{x: number, y: number, w: number, h: number}|null} The button hit box.
   */
  drawOverlay(stats) {
    if (stats.result === GameManager.RESULT.IN_PROGRESS) return null;

    const ctx = this.ctx;
    const isWin = stats.result === GameManager.RESULT.WIN;

    ctx.fillStyle = 'rgba(49, 48, 45, 0.6)';
    ctx.fillRect(0, 0, this.width, this.height);

    // The card is drawn at a nominal size and scaled to fit, so it never
    // overflows a short viewport.
    const cardW = 360;
    const cardH = 392;
    const scale = Math.min(1, (this.width - 32) / cardW, (this.height - 32) / cardH);
    const originX = (this.width - cardW * scale) / 2;
    const originY = (this.height - cardH * scale) / 2;

    ctx.save();
    ctx.translate(originX, originY);
    ctx.scale(scale, scale);

    ctx.save();
    ctx.shadowColor = 'rgba(139, 94, 60, 0.4)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 18;
    ctx.fillStyle = PALETTE.surfaceBright;
    pathRoundRect(ctx, 0, 0, cardW, cardH, 24);
    ctx.fill();
    ctx.restore();

    // Decorative top border.
    ctx.save();
    pathRoundRect(ctx, 0, 0, cardW, cardH, 24);
    ctx.clip();
    ctx.fillStyle = isWin ? PALETTE.primaryContainer : PALETTE.primary;
    ctx.fillRect(0, 0, cardW, 14);
    ctx.restore();

    // Emblem.
    const emblemR = 40;
    const emblemY = 32 + emblemR;
    ctx.fillStyle = PALETTE.surfaceContainerLow;
    ctx.beginPath();
    ctx.arc(cardW / 2, emblemY, emblemR, 0, TAU);
    ctx.fill();

    ctx.font = font(800, 38);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isWin ? PALETTE.primary : PALETTE.tertiary;
    ctx.fillText(isWin ? '\u2726' : '\ud83d\udc3e', cardW / 2, emblemY + 2);

    // Headline and subtitle.
    ctx.fillStyle = PALETTE.primary;
    ctx.font = font(800, 25);
    ctx.fillText(isWin ? 'Mission Accomplished!' : 'Shiki got the rug!', cardW / 2, emblemY + emblemR + 26);

    ctx.fillStyle = PALETTE.onSurfaceVariant;
    ctx.font = font(400, 14, FONTS.body);
    ctx.fillText(
      isWin ? 'The rug is completely spotless.' : 'She sat down before you finished.',
      cardW / 2,
      emblemY + emblemR + 50,
    );

    // Stat rows.
    const rowW = cardW - 44;
    const rowX = 22;
    let rowY = emblemY + emblemR + 68;

    const rows = [
      { label: 'Hair Cleared', value: `${Math.round(stats.cleanedPercent)}%`, color: PALETTE.secondary },
      {
        label: 'Temptation Kept',
        value: `${Math.round(100 - stats.dog.temptationMeter)}%`,
        color: PALETTE.tertiary,
      },
    ];

    rows.forEach((row) => {
      ctx.fillStyle = PALETTE.surfaceContainerLow;
      pathRoundRect(ctx, rowX, rowY, rowW, 46, 14);
      ctx.fill();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = PALETTE.onSurface;
      ctx.font = font(700, 13, FONTS.body);
      ctx.fillText(row.label, rowX + 16, rowY + 23);

      ctx.textAlign = 'right';
      ctx.fillStyle = row.color;
      ctx.font = font(700, 20);
      ctx.fillText(row.value, rowX + rowW - 16, rowY + 23);

      rowY += 56;
    });

    // Primary action.
    const button = { x: rowX, y: rowY + 6, w: rowW, h: 48 };

    ctx.fillStyle = PALETTE.onPrimaryFixedVariant;
    pathRoundRect(ctx, button.x, button.y + 4, button.w, button.h, 14);
    ctx.fill();

    ctx.fillStyle = PALETTE.primary;
    pathRoundRect(ctx, button.x, button.y, button.w, button.h, 14);
    ctx.fill();

    ctx.fillStyle = PALETTE.onPrimary;
    ctx.font = font(800, 15);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('CLEAN AGAIN', button.x + button.w / 2, button.y + button.h / 2);

    ctx.restore();

    // Hand the hit box back in screen space.
    return {
      x: originX + button.x * scale,
      y: originY + button.y * scale,
      w: button.w * scale,
      h: button.h * scale,
    };
  }
}

// ------------------------------------------------------------
// Game engine
// ------------------------------------------------------------

/**
 * Wires the logic layer to the canvas: owns the round, the render loop and all
 * pointer and keyboard input.
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
    this.dock = null;

    this.currentTool = Tool.PRESETS.LINT_ROLLER();
    this.pointer = { x: 0, y: 0, isDown: false, isOnScreen: false };
    this.overlayButton = null;

    this.lastFrameMs = 0;
    this.elapsedSeconds = 0;
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

    this.game = new GameManager({
      dirtPatches,
      dog,
      // Shed hair lands around wherever Shiki is standing, never off the rug.
      shedDirt: (count) => shedDirtAround(count, this.rugRect, computeDogAnchor(this.game.dog, this.rugRect)),
    });

    this.elapsedSeconds = 0;
    this.overlayButton = null;
  }

  /**
   * Recomputes the canvas size, rug rectangle and dock layout, keeping any dirt
   * already on the rug at the same relative position.
   *
   * @returns {void}
   */
  handleResize() {
    const previousRug = this.rugRect;

    this.renderer.resize();
    this.rugRect = computeRugRect(this.renderer.width, this.renderer.height);
    this.dock = computeToolDockLayout(this.renderer.width, this.renderer.height);

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

    this.update(deltaTime);
    this.render();

    window.requestAnimationFrame((next) => this.loop(next));
  }

  /**
   * Advances one simulation step.
   *
   * @param {number} deltaTime Elapsed time since the previous frame, in seconds.
   * @returns {void}
   */
  update(deltaTime) {
    this.elapsedSeconds += deltaTime;

    if (this.game.result !== GameManager.RESULT.IN_PROGRESS) return;

    // Holding the tool down keeps cleaning, and keeps tempting Shiki. The
    // penalty is scaled by deltaTime, so frame rate never changes the balance.
    if (this.pointer.isDown && deltaTime > 0) {
      this.game.cleanAt(this.pointer.x, this.pointer.y, this.currentTool, deltaTime);
    }

    this.game.update(deltaTime);
  }

  /**
   * Renders one frame.
   *
   * @returns {void}
   */
  render() {
    const stats = {
      result: this.game.result,
      cleanedPercent: this.game.getCleanedPercent(),
      dog: this.game.dog,
    };

    this.renderer.drawBackground();
    this.renderer.drawRug(this.rugRect);
    this.renderer.drawDirt(this.game.dirtPatches);
    this.renderer.drawDog(this.game.dog, this.rugRect, this.elapsedSeconds);
    this.renderer.drawCursor(this.pointer, this.currentTool);
    this.renderer.drawTopBar(stats);
    this.renderer.drawToolDock(this.dock, this.currentTool);
    this.overlayButton = this.renderer.drawOverlay(stats);
  }

  /**
   * Percentage of all dirt cleaned so far, including hair Shiki shed.
   *
   * @returns {number} A value in [0, 100].
   */
  getCleanedPercent() {
    return this.game.getCleanedPercent();
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
   * True when a point sits inside the playable area, rather than on the HUD bar
   * or the tool dock.
   *
   * @param {number} x Point X.
   * @param {number} y Point Y.
   * @returns {boolean} True when cleaning is allowed there.
   */
  isInPlayArea(x, y) {
    const play = computePlayArea(this.renderer.width, this.renderer.height);
    return y >= play.y && y <= play.y + play.h && x >= 0 && x <= this.renderer.width;
  }

  /**
   * Handles a press: restarts a finished round, switches tools from the dock,
   * or starts cleaning.
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

    const toolKey = hitTestToolDock(this.dock, this.pointer.x, this.pointer.y);
    if (toolKey) {
      this.selectTool(toolKey);
      return;
    }

    if (!this.isInPlayArea(this.pointer.x, this.pointer.y)) return;

    this.pointer.isDown = true;

    // A single tap still costs a slice of tool time, so tapping is never free.
    this.game.cleanAt(this.pointer.x, this.pointer.y, this.currentTool, CONFIG.tapImpulseSeconds);
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
 * Waits for the display fonts so the first frame is drawn in Plus Jakarta Sans
 * rather than a fallback.
 *
 * @returns {Promise<void>} Resolves once the fonts are ready, or immediately.
 */
function loadDisplayFonts() {
  if (typeof document === 'undefined' || !document.fonts || !document.fonts.load) {
    return Promise.resolve();
  }

  return Promise.all([
    document.fonts.load('800 30px "Plus Jakarta Sans"'),
    document.fonts.load('700 13px "Plus Jakarta Sans"'),
    document.fonts.load('700 12px "Be Vietnam Pro"'),
    document.fonts.load('400 14px "Be Vietnam Pro"'),
  ]).then(() => undefined).catch(() => undefined);
}

/**
 * Boots the game once the DOM is ready.
 * Guarded so the file can also be loaded in a non-browser context (tests).
 */
if (typeof document !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('game-canvas');
    if (!canvas) return;

    const rugRush = new RugRush(canvas);

    // Handy for poking at the game from the browser console.
    window.rugRush = rugRush;

    loadDisplayFonts().then(() => rugRush.start());
  });
}
