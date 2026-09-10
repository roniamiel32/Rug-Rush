// ============================================================
// RUG RUSH - Core Game Logic & Data Structures
// No rendering/UI code - pure logic layer
// ============================================================

/**
 * Represents a single patch of dog hair/dirt on the rug.
 */
export class Dirt {
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
export class Tool {
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
Tool.ORDER = ['VACUUM', 'LINT_ROLLER', 'BRUSH'];
/**
 * Represents Shiki, the dog, with a temptation meter and state machine.
 */
export class Dog {
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
export class GameManager {
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

