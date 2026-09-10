import { CONFIG } from './config.js';
import { AudioManager } from './audio.js';
import { Dog, GameManager, Tool } from './game.js';
import { Renderer } from './renderer.js';
import { clamp, computeDirtRect, computeDogAnchor, computePlayArea, computeRugRect, computeToolDockLayout, hitTestToolDock, remapDirtToRug, shedDirtAround, spawnDirt } from './geometry.js';

/** Semantic version of the game. Mirrors the "version" field in package.json. */
export const GAME_VERSION = '0.3.0';

export const APP_STATE = Object.freeze({
  START: 'start',
  PLAYING: 'playing',
  PAUSED: 'paused',
});

function hitTestRect(rect, x, y) {
  return !!rect && x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

// ------------------------------------------------------------
// Game engine
// ------------------------------------------------------------

/**
 * Wires the logic layer to the canvas: owns the round, the render loop and all
 * pointer and keyboard input.
 */
export class RugRush {
  /**
   * @param {HTMLCanvasElement} canvas Canvas element the game renders into.
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new Renderer(canvas);
    this.audio = new AudioManager();

    this.game = null;
    this.rugRect = null;
    this.dirtRect = null;
    this.dock = null;

    this.currentTool = Tool.PRESETS.LINT_ROLLER();
    this.pointer = { x: 0, y: 0, isDown: false, isOnScreen: false };
    this.appState = APP_STATE.START;
    this.hudControls = null;
    this.startButton = null;
    this.pauseButtons = null;
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
    this.reset(APP_STATE.START);
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
  reset(nextState = APP_STATE.PLAYING) {
  // Calculate the visual size and position of the rug.
  this.rugRect = computeRugRect(
    this.renderer.width,
    this.renderer.height
  );

  // Calculate the safe area where hair is allowed to appear.
  // This prevents hair from spawning underneath the HUD or tool dock.
  this.dirtRect = computeDirtRect(
    this.rugRect,
    this.renderer.width,
    this.renderer.height
  );

  // Spawn the starting hair only inside the safe area.
  const dirtPatches = spawnDirt(
    CONFIG.dirtCount,
    this.dirtRect
  );

  const dog = new Dog({
    baseIncreaseRate: CONFIG.passiveTemptationPerSecond
  });

  this.game = new GameManager({
    dirtPatches,
    dog,

    // Hair shed by Shiki also stays inside the safe cleaning area.
    shedDirt: (count) =>
      shedDirtAround(
        count,
        this.dirtRect,
        computeDogAnchor(this.game.dog, this.rugRect)
      ),
  });

  this.elapsedSeconds = 0;
  this.pointer.isDown = false;
  this.appState = nextState;
  this.startButton = null;
  this.pauseButtons = null;
  this.overlayButton = null;
}

  /**
   * Pauses a round in progress.
   *
   * @returns {void}
   */
  pause() {
    if (this.appState !== APP_STATE.PLAYING) return;
    if (this.game.result !== GameManager.RESULT.IN_PROGRESS) return;

    this.pointer.isDown = false;
    this.appState = APP_STATE.PAUSED;
  }

  /**
   * Resumes a paused round.
   *
   * @returns {void}
   */
  resume() {
    if (this.appState !== APP_STATE.PAUSED) return;

    this.pointer.isDown = false;
    this.appState = APP_STATE.PLAYING;
  }

  /**
   * Toggles pause for keyboard input.
   *
   * @returns {void}
   */
  togglePause() {
    if (this.appState === APP_STATE.PAUSED) {
      this.resume();
    } else {
      this.pause();
    }
  }

  /**
   * Recomputes the canvas size, rug rectangle and dock layout, keeping any dirt
   * already on the rug at the same relative position.
   *
   * @returns {void}
   */
  handleResize() {
  const previousDirtRect = this.dirtRect;

  this.renderer.resize();

  this.rugRect = computeRugRect(
    this.renderer.width,
    this.renderer.height
  );

  this.dirtRect = computeDirtRect(
    this.rugRect,
    this.renderer.width,
    this.renderer.height
  );

  this.dock = computeToolDockLayout(
    this.renderer.width,
    this.renderer.height
  );

  if (this.game && previousDirtRect) {
    remapDirtToRug(
      this.game.dirtPatches,
      previousDirtRect,
      this.dirtRect
    );
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
    if (this.appState !== APP_STATE.PLAYING) return;

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
    this.hudControls = this.renderer.drawTopBar(stats, this.audio.isMuted());
    this.renderer.drawToolDock(this.dock, this.currentTool);
    this.overlayButton = this.renderer.drawOverlay(stats);
    this.startButton = null;
    this.pauseButtons = null;

    if (this.appState === APP_STATE.START) {
      this.startButton = this.renderer.drawStartScreen();
    } else if (this.appState === APP_STATE.PAUSED) {
      this.pauseButtons = this.renderer.drawPauseOverlay();
    }
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

    if (this.appState === APP_STATE.START) {
      if (hitTestRect(this.startButton, this.pointer.x, this.pointer.y)) {
        this.reset(APP_STATE.PLAYING);
      }
      return;
    }

    if (this.appState === APP_STATE.PAUSED) {
      if (hitTestRect(this.pauseButtons?.resume, this.pointer.x, this.pointer.y)) {
        this.resume();
      } else if (hitTestRect(this.pauseButtons?.restart, this.pointer.x, this.pointer.y)) {
        this.reset(APP_STATE.PLAYING);
      }
      return;
    }

    if (this.game.result !== GameManager.RESULT.IN_PROGRESS) {
      this.reset();
      return;
    }

    if (hitTestRect(this.hudControls?.pause, this.pointer.x, this.pointer.y)) {
      this.pause();
      return;
    }

    if (hitTestRect(this.hudControls?.restart, this.pointer.x, this.pointer.y)) {
      this.reset(APP_STATE.PLAYING);
      return;
    }

    if (hitTestRect(this.hudControls?.mute, this.pointer.x, this.pointer.y)) {
      this.audio.toggleMuted();
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
      if (event.key === 'Escape') this.togglePause();
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
export function loadDisplayFonts() {
  if (typeof document === 'undefined' || !document.fonts || !document.fonts.load) {
    return Promise.resolve();
  }

  return Promise.all([
    document.fonts.load('700 30px "Fredoka"'),
    document.fonts.load('700 13px "Fredoka"'),
    document.fonts.load('600 12px "Fredoka"'),
    document.fonts.load('500 14px "Fredoka"'),
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
