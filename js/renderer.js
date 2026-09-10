import { CONFIG, FONTS, LAYOUT, PALETTE, TAU, font } from './config.js';
import { Dog, GameManager, Tool } from './game.js';
import { formatTime } from './time.js';
import { clamp, computeDogAnchor, hash2, lerp, pathRoundRect } from './geometry.js';

// ------------------------------------------------------------
// Renderer
// ------------------------------------------------------------

/**
 * Draws every visual element of the game onto a 2D canvas context.
 * The renderer is stateless with respect to gameplay: it only reads the objects
 * it is handed, so the logic layer stays free of drawing code.
 */
export class Renderer {
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

    this.floorImage.src = 'assets/images/rug-bg.png';

    this.rugImage = new Image();

    this.rugImage.onload = () => {
      console.log('Rug image loaded successfully');
    };

    this.rugImage.onerror = () => {
      console.error('Could not load rug image:', this.rugImage.src);
    };

    this.rugImage.src = 'assets/images/rug_level1.png';
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

    if (
      !this.rugImage.complete ||
      this.rugImage.naturalWidth === 0
    ) {
      return;
    }

    ctx.save();

    ctx.shadowColor = 'rgba(60, 40, 30, 0.25)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 10;

    ctx.drawImage(
      this.rugImage,
      rug.x,
      rug.y,
      rug.w,
      rug.h
    );

    ctx.restore();
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
      ctx.font = font(600, 15);
      const w = ctx.measureText(text).width + 22;

      ctx.fillStyle = PALETTE.primary;
      pathRoundRect(ctx, labelX - w / 2, y - 14, w, 28, 14);
      ctx.fill();

      ctx.fillStyle = PALETTE.onPrimary;
      ctx.fillText(text, labelX, y);
      return;
    }

    ctx.font = font(500, 13);
    ctx.fillStyle = PALETTE.surfaceBright;
    const label = dog.state;
    const width = ctx.measureText(label).width + 20;
    pathRoundRect(ctx, labelX - width / 2, y - 12, width, 24, 12);
    ctx.fill();

    ctx.fillStyle = PALETTE.onSurfaceVariant;
    ctx.fillText(label, labelX, y);
  }

  /**
   * Draws the top HUD bar: cleaning progress, round time and Shiki's
   * temptation meter.
   *
   * @param {{cleanedPercent: number, dog: Dog, elapsedSeconds: number, bestTimeSeconds: number|null}} stats HUD data.
   * @param {boolean} isMuted Whether audio is currently muted.
   * @returns {{pause: object, restart: object, mute: object}} Button hit boxes.
   */
  drawTopBar(stats, isMuted = false) {
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

    ctx.font = font(500, 11, FONTS.body);
    ctx.fillStyle = PALETTE.onSurfaceVariant;
    ctx.fillText('CLEAN', textX, centerY - 6);

    ctx.font = font(600, 30);
    ctx.fillStyle = PALETTE.primary;
    const percentText = `${Math.round(stats.cleanedPercent)}`;
    ctx.fillText(percentText, textX, centerY + 22);

    const percentWidth = ctx.measureText(percentText).width;
    ctx.font = font(400, 15, FONTS.body);
    ctx.fillText('%', textX + percentWidth + 3, centerY + 22);

    // Temptation meter.
    const meterW = isNarrow ? Math.max(110, this.width * 0.34) : 210;
    const meterX = this.width - meterW - 20;
    this.drawTemptationMeter(stats.dog, meterX, centerY - 10, meterW);

    const controls = this.drawHudControls(isMuted);
    this.drawHudTimeStats(stats, controls);

    return controls;
  }

  /**
   * Draws non-interactive TIME and BEST readouts near the HUD controls.
   *
   * @param {{elapsedSeconds: number, bestTimeSeconds: number|null}} stats Timer data.
   * @param {{pause: object, restart: object, mute: object}} controls Button hit boxes.
   * @returns {void}
   */
  drawHudTimeStats(stats, controls) {
    const ctx = this.ctx;
    const centerX = controls.pause.x + (controls.mute.x + controls.mute.w - controls.pause.x) / 2;
    const timeText = formatTime(stats.elapsedSeconds || 0);
    const bestText = stats.bestTimeSeconds === null ? '--:--' : formatTime(stats.bestTimeSeconds);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (this.width < 700) {
      this.drawHudTimeLine('TIME', timeText, centerX, 50);
      this.drawHudTimeLine('BEST', bestText, centerX, 67);
    } else {
      this.drawHudTimeColumn('TIME', timeText, centerX - 46, 54);
      this.drawHudTimeColumn('BEST', bestText, centerX + 46, 54);
    }

    ctx.restore();
  }

  /**
   * Draws one compact timer row for narrower HUDs.
   *
   * @param {string} label Row label.
   * @param {string} value Formatted time.
   * @param {number} x Center X.
   * @param {number} y Center Y.
   * @returns {void}
   */
  drawHudTimeLine(label, value, x, y) {
    const ctx = this.ctx;

    ctx.font = font(500, 9, FONTS.body);
    ctx.fillStyle = PALETTE.onSurfaceVariant;
    ctx.fillText(label, x - 24, y);

    ctx.font = font(600, 13);
    ctx.fillStyle = PALETTE.tertiary;
    ctx.fillText(value, x + 18, y);
  }

  /**
   * Draws one stacked timer readout for roomier HUDs.
   *
   * @param {string} label Column label.
   * @param {string} value Formatted time.
   * @param {number} x Center X.
   * @param {number} y Label center Y.
   * @returns {void}
   */
  drawHudTimeColumn(label, value, x, y) {
    const ctx = this.ctx;

    ctx.font = font(500, 9, FONTS.body);
    ctx.fillStyle = PALETTE.onSurfaceVariant;
    ctx.fillText(label, x, y);

    ctx.font = font(600, 15);
    ctx.fillStyle = PALETTE.tertiary;
    ctx.fillText(value, x, y + 16);
  }

  /**
   * Draws compact pause and restart controls in the top HUD.
   *
   * @param {boolean} isMuted Whether audio is currently muted.
   * @returns {{pause: object, restart: object, mute: object}} Button hit boxes.
   */
  drawHudControls(isMuted) {
    const ctx = this.ctx;
    const size = 28;
    const gap = 8;
    const totalW = size * 3 + gap * 2;
    const y = 8;
    const pause = {
      x: (this.width - totalW) / 2,
      y,
      w: size,
      h: size,
    };
    const restart = {
      x: pause.x + size + gap,
      y,
      w: size,
      h: size,
    };
    const mute = {
      x: restart.x + size + gap,
      y,
      w: size,
      h: size,
    };

    this.drawHudIconButton(pause, 'pause');
    this.drawHudIconButton(restart, 'restart');
    this.drawHudIconButton(mute, isMuted ? 'volume-x' : 'volume-2');

    return { pause, restart, mute };
  }

  /**
   * Draws one small icon button for the HUD controls.
   *
   * @param {{x: number, y: number, w: number, h: number}} button Button bounds.
   * @param {'pause'|'restart'|'volume-2'|'volume-x'} icon Icon type.
   * @returns {void}
   */
  drawHudIconButton(button, icon) {
    const ctx = this.ctx;
    const cx = button.x + button.w / 2;
    const cy = button.y + button.h / 2;

    ctx.save();
    ctx.fillStyle = PALETTE.surfaceContainerLow;
    pathRoundRect(ctx, button.x, button.y, button.w, button.h, 10);
    ctx.fill();

    ctx.strokeStyle = 'rgba(86, 66, 62, 0.18)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.strokeStyle = PALETTE.onSurfaceVariant;
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const iconSize = 18;
    const iconX = cx - iconSize / 2;
    const iconY = cy - iconSize / 2;
    const scale = iconSize / 24;

    ctx.translate(iconX, iconY);
    ctx.scale(scale, scale);
    ctx.lineWidth = 2;

    if (icon === 'pause') {
      ctx.beginPath();
      ctx.rect(6, 4, 4, 16);
      ctx.rect(14, 4, 4, 16);
      ctx.stroke();
    } else if (icon === 'restart') {
      ctx.stroke(new Path2D('M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8'));
      ctx.stroke(new Path2D('M3 3v5h5'));
    } else if (icon === 'volume-2') {
      ctx.stroke(new Path2D('M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z'));
      ctx.stroke(new Path2D('M16 9a5 5 0 0 1 0 6'));
      ctx.stroke(new Path2D('M19.364 18.364a9 9 0 0 0 0-12.728'));
    } else {
      ctx.stroke(new Path2D('M11 4.702a.7.7 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.7.7 0 0 0 11 19.298z'));
      ctx.stroke(new Path2D('m16.5 14.5 5-5'));
      ctx.stroke(new Path2D('m16.5 9.5 5 5'));
    }

    ctx.restore();
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

    ctx.font = font(500, 11);
    ctx.textBaseline = 'alphabetic';

    ctx.fillStyle = PALETTE.onSurfaceVariant;
    ctx.textAlign = 'left';
    ctx.fillText('SHIKI', x, y - 8);

    ctx.textAlign = 'right';
    ctx.fillText(dog.state.toUpperCase(), x + w, y - 8);

    // Track
    ctx.fillStyle = '#ebe6df';
    pathRoundRect(ctx, x, y, w, h, h / 2);
    ctx.fill();

    // Colored meter
    if (ratio > 0) {
      const gradient = ctx.createLinearGradient(x, 0, x + w, 0);

      gradient.addColorStop(0, '#6da36f');    // green
      gradient.addColorStop(0.38, '#a6b76a');
      gradient.addColorStop(0.62, '#e0b04e'); // yellow
      gradient.addColorStop(0.82, '#df7d3f'); // orange
      gradient.addColorStop(1, '#c84c35');    // red

      ctx.save();

      pathRoundRect(ctx, x, y, w, h, h / 2);
      ctx.clip();

      ctx.fillStyle = gradient;
      ctx.fillRect(x, y, w * ratio, h);

      ctx.restore();
    }

    // Small state markers
    const approachingX =
      x + w * (Dog.THRESHOLDS.APPROACHING / Dog.THRESHOLDS.SITTING);

    const shakeX =
      x + w * (Dog.SHAKE.threshold / Dog.THRESHOLDS.SITTING);

    ctx.strokeStyle = 'rgba(86, 66, 62, 0.25)';
    ctx.lineWidth = 1.5;

    [approachingX, shakeX].forEach((tickX) => {
      ctx.beginPath();
      ctx.moveTo(tickX, y + 2);
      ctx.lineTo(tickX, y + h - 2);
      ctx.stroke();
    });

    // White knob
    const knobX = clamp(
      x + w * ratio,
      x + 7,
      x + w - 7
    );

    ctx.fillStyle = '#fffaf5';
    ctx.strokeStyle = 'rgba(86, 66, 62, 0.18)';
    ctx.lineWidth = 1.5;

    ctx.beginPath();
    ctx.arc(knobX, y + h / 2, 8, 0, TAU);
    ctx.fill();
    ctx.stroke();
    // Labels under the meter
    ctx.font = font(500, 9);
    ctx.textBaseline = 'top';

    // CALM
    ctx.textAlign = 'left';
    ctx.fillStyle = '#6da36f';
    ctx.fillText('CALM', x, y + h + 6);

    // WATCHING
    ctx.textAlign = 'center';
    ctx.fillStyle = '#9a7445';
    ctx.fillText('WATCHING', x + w / 2, y + h + 6);

    // OH NO
    ctx.textAlign = 'right';
    ctx.fillStyle = '#c84c35';
    ctx.fillText('OH NO', x + w, y + h + 6);
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

    // Main container
    ctx.save();
    ctx.shadowColor = 'rgba(60, 40, 30, 0.22)';
    ctx.shadowBlur = 20;
    ctx.shadowOffsetY = 6;

    ctx.fillStyle = '#fbf7f2';
    pathRoundRect(ctx, dock.x, dock.y, dock.w, dock.h, 22);
    ctx.fill();

    ctx.strokeStyle = '#e4ddd6';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.restore();

    dock.buttons.forEach((button) => {
      const tool = Tool.PRESETS[button.key]();
      const isActive = currentTool.key === button.key;

      const cx = button.x + button.w / 2;
      const cy = button.y + button.h / 2;

      if (isActive) {
        // Dark lower edge
        ctx.fillStyle = '#005d87';
        pathRoundRect(
          ctx,
          button.x + 4,
          button.y + 6,
          button.w - 8,
          button.h - 8,
          16
        );
        ctx.fill();

        // Blue selected area
        ctx.fillStyle = '#70baf0';
        pathRoundRect(
          ctx,
          button.x + 4,
          button.y + 2,
          button.w - 8,
          button.h - 8,
          16
        );
        ctx.fill();
      }

      const inkColor = isActive ? '#005476' : '#5a4540';

      this.drawToolIcon(
        button.key,
        cx,
        cy - 9,
        inkColor
      );

      ctx.fillStyle = inkColor;
      ctx.font = font(500, 12);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.fillText(
        tool.name.toUpperCase(),
        cx,
        cy + 17
      );
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
    const iconSize = 27;
    const scale = iconSize / 24;
    ctx.translate(cx - iconSize / 2, cy - iconSize / 2);
    ctx.scale(scale, scale);

    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // --------------------------------------------------------
    // VACUUM
    // --------------------------------------------------------
    if (key === 'VACUUM') {
      ctx.stroke(new Path2D('M11 17h2'));
      ctx.stroke(new Path2D('M12 12h.01'));
      ctx.stroke(new Path2D('M17 12a5 5 0 0 0-10 0'));
      ctx.stroke(new Path2D('M19 2v2.8'));
      ctx.stroke(new Path2D('M2 5h2.8'));
      ctx.stroke(new Path2D('M22 5h-2.8'));
      ctx.stroke(new Path2D('M5 2v2.8'));
      ctx.beginPath();
      ctx.arc(12, 12, 10, 0, TAU);
      ctx.stroke();
    }

    // --------------------------------------------------------
    // ROLLER
    // --------------------------------------------------------
    else if (key === 'LINT_ROLLER') {
      pathRoundRect(ctx, 5, 4, 14, 8, 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(9, 12);
      ctx.lineTo(12, 16);
      ctx.lineTo(12, 21);
      ctx.moveTo(10, 21);
      ctx.lineTo(14, 21);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(7, 8);
      ctx.lineTo(17, 8);
      ctx.stroke();
    }

    // --------------------------------------------------------
    // BRUSH
    // --------------------------------------------------------
    else if (key === 'BRUSH') {
      ctx.stroke(new Path2D('m16 22-1-4'));
      ctx.stroke(new Path2D('M19 14a1 1 0 0 0 1-1v-1a2 2 0 0 0-2-2h-3a1 1 0 0 1-1-1V4a2 2 0 0 0-4 0v5a1 1 0 0 1-1 1H6a2 2 0 0 0-2 2v1a1 1 0 0 0 1 1'));
      ctx.stroke(new Path2D('M19 14H5l-1.973 6.767A1 1 0 0 0 4 22h16a1 1 0 0 0 .973-1.233z'));
      ctx.stroke(new Path2D('m8 22 1-4'));
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
   * @param {{result: string, cleanedPercent: number, dog: Dog, finalTimeSeconds: number|null, bestTimeSeconds: number|null, isNewBestTime: boolean}} stats Round summary.
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
    const cardH = isWin ? 506 : 392;
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
    ctx.font = font(600, 25);
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

    if (isWin) {
      rows.push(
        {
          label: 'TIME',
          value: formatTime(stats.finalTimeSeconds || 0),
          color: PALETTE.primary,
        },
        {
          label: 'BEST',
          value: stats.bestTimeSeconds === null ? '--:--' : formatTime(stats.bestTimeSeconds),
          color: PALETTE.secondary,
          badge: stats.isNewBestTime ? 'NEW BEST!' : '',
        },
      );
    }

    rows.forEach((row) => {
      ctx.fillStyle = PALETTE.surfaceContainerLow;
      pathRoundRect(ctx, rowX, rowY, rowW, 46, 14);
      ctx.fill();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = PALETTE.onSurface;
      ctx.font = font(500, 13, FONTS.body);
      ctx.fillText(row.label, rowX + 16, rowY + 23);

      if (row.badge) {
        ctx.fillStyle = PALETTE.primary;
        ctx.font = font(600, 10);
        ctx.fillText(row.badge, rowX + 64, rowY + 23);
      }

      ctx.textAlign = 'right';
      ctx.fillStyle = row.color;
      ctx.font = font(600, 20);
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
    ctx.font = font(500, 15);
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

  /**
   * Draws the first-load start screen over the game canvas.
   *
   * @returns {{x: number, y: number, w: number, h: number}} Play button hit box.
   */
  drawStartScreen() {
    const ctx = this.ctx;

    ctx.fillStyle = 'rgba(49, 48, 45, 0.42)';
    ctx.fillRect(0, 0, this.width, this.height);

    const cardW = 340;
    const cardH = 274;
    const scale = Math.min(1, (this.width - 32) / cardW, (this.height - 32) / cardH);
    const originX = (this.width - cardW * scale) / 2;
    const originY = (this.height - cardH * scale) / 2;

    ctx.save();
    ctx.translate(originX, originY);
    ctx.scale(scale, scale);

    ctx.save();
    ctx.shadowColor = 'rgba(139, 94, 60, 0.35)';
    ctx.shadowBlur = 34;
    ctx.shadowOffsetY = 14;
    ctx.fillStyle = PALETTE.surfaceBright;
    pathRoundRect(ctx, 0, 0, cardW, cardH, 24);
    ctx.fill();
    ctx.restore();

    ctx.save();
    pathRoundRect(ctx, 0, 0, cardW, cardH, 24);
    ctx.clip();
    ctx.fillStyle = PALETTE.primaryContainer;
    ctx.fillRect(0, 0, cardW, 14);
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = PALETTE.primary;
    ctx.font = font(700, 38);
    ctx.fillText('RUG RUSH', cardW / 2, 68);

    ctx.fillStyle = PALETTE.onSurfaceVariant;
    ctx.font = font(500, 16, FONTS.body);
    ctx.fillText('Clean the rug before Shiki gets to it.', cardW / 2, 112);

    ctx.fillStyle = PALETTE.tertiary;
    ctx.font = font(400, 14, FONTS.body);
    ctx.fillText('Some tools get her attention faster.', cardW / 2, 140);

    const button = { x: 44, y: 184, w: cardW - 88, h: 48 };

    ctx.fillStyle = PALETTE.onPrimaryFixedVariant;
    pathRoundRect(ctx, button.x, button.y + 4, button.w, button.h, 14);
    ctx.fill();

    ctx.fillStyle = PALETTE.primary;
    pathRoundRect(ctx, button.x, button.y, button.w, button.h, 14);
    ctx.fill();

    ctx.fillStyle = PALETTE.onPrimary;
    ctx.font = font(600, 16);
    ctx.fillText('PLAY', button.x + button.w / 2, button.y + button.h / 2);

    ctx.restore();

    return {
      x: originX + button.x * scale,
      y: originY + button.y * scale,
      w: button.w * scale,
      h: button.h * scale,
    };
  }

  /**
   * Draws the pause overlay over the current frozen round.
   *
   * @returns {{resume: object, restart: object}} Button hit boxes.
   */
  drawPauseOverlay() {
    const ctx = this.ctx;

    ctx.fillStyle = 'rgba(49, 48, 45, 0.52)';
    ctx.fillRect(0, 0, this.width, this.height);

    const cardW = 300;
    const cardH = 238;
    const scale = Math.min(1, (this.width - 32) / cardW, (this.height - 32) / cardH);
    const originX = (this.width - cardW * scale) / 2;
    const originY = (this.height - cardH * scale) / 2;

    ctx.save();
    ctx.translate(originX, originY);
    ctx.scale(scale, scale);

    ctx.save();
    ctx.shadowColor = 'rgba(139, 94, 60, 0.35)';
    ctx.shadowBlur = 34;
    ctx.shadowOffsetY = 14;
    ctx.fillStyle = PALETTE.surfaceBright;
    pathRoundRect(ctx, 0, 0, cardW, cardH, 24);
    ctx.fill();
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = PALETTE.primary;
    ctx.font = font(700, 30);
    ctx.fillText('PAUSED', cardW / 2, 58);

    const resume = { x: 36, y: 102, w: cardW - 72, h: 46 };
    const restart = { x: 36, y: 162, w: cardW - 72, h: 46 };

    this.drawModalButton(resume, 'RESUME', true);
    this.drawModalButton(restart, 'RESTART', false);

    ctx.restore();

    return {
      resume: {
        x: originX + resume.x * scale,
        y: originY + resume.y * scale,
        w: resume.w * scale,
        h: resume.h * scale,
      },
      restart: {
        x: originX + restart.x * scale,
        y: originY + restart.y * scale,
        w: restart.w * scale,
        h: restart.h * scale,
      },
    };
  }

  /**
   * Draws a pause/start modal action button.
   *
   * @param {{x: number, y: number, w: number, h: number}} button Button bounds.
   * @param {string} label Button label.
   * @param {boolean} isPrimary Whether to use the primary filled style.
   * @returns {void}
   */
  drawModalButton(button, label, isPrimary) {
    const ctx = this.ctx;

    if (isPrimary) {
      ctx.fillStyle = PALETTE.onPrimaryFixedVariant;
      pathRoundRect(ctx, button.x, button.y + 4, button.w, button.h, 14);
      ctx.fill();

      ctx.fillStyle = PALETTE.primary;
      pathRoundRect(ctx, button.x, button.y, button.w, button.h, 14);
      ctx.fill();

      ctx.fillStyle = PALETTE.onPrimary;
    } else {
      ctx.fillStyle = PALETTE.surfaceContainerLow;
      pathRoundRect(ctx, button.x, button.y, button.w, button.h, 14);
      ctx.fill();

      ctx.strokeStyle = PALETTE.outlineVariant;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = PALETTE.primary;
    }

    ctx.font = font(600, 15);
    ctx.fillText(label, button.x + button.w / 2, button.y + button.h / 2);
  }
}
