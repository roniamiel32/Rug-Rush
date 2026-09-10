const MUTE_STORAGE_KEY = 'rugRushMuted';

function getDefaultStorage() {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  return window.localStorage;
}

export class AudioManager {
  /**
   * @param {object} [options] Construction options.
   * @param {Storage|null} [options.storage=window.localStorage] Preference store.
   */
  constructor({ storage = getDefaultStorage() } = {}) {
    this.storage = storage;
    this.sounds = new Map();
    this.muted = this.readMutedPreference();
  }

  /**
   * @returns {boolean} True when audio playback is muted.
   */
  isMuted() {
    return this.muted;
  }

  /**
   * Sets and persists the mute preference.
   *
   * @param {boolean} muted Whether audio should be muted.
   * @returns {boolean} The updated mute state.
   */
  setMuted(muted) {
    this.muted = !!muted;
    this.writeMutedPreference();
    if (this.muted) this.stopAll();
    return this.muted;
  }

  /**
   * Toggles and persists the mute preference.
   *
   * @returns {boolean} The updated mute state.
   */
  toggleMuted() {
    return this.setMuted(!this.muted);
  }

  /**
   * Registers a named sound for future playback.
   *
   * @param {string} name Sound effect name.
   * @param {HTMLAudioElement|object} sound Audio-like object with play/pause.
   * @returns {void}
   */
  register(name, sound) {
    this.sounds.set(name, sound);
  }

  /**
   * Plays a named sound effect when one has been registered and audio is enabled.
   *
   * @param {string} name Sound effect name.
   * @returns {boolean} True when playback was attempted.
   */
  play(name) {
    if (this.muted) return false;

    const sound = this.sounds.get(name);
    if (!sound || typeof sound.play !== 'function') return false;

    sound.currentTime = 0;
    sound.play();
    return true;
  }

  /**
   * Stops one named sound if it exists.
   *
   * @param {string} name Sound effect name.
   * @returns {void}
   */
  stop(name) {
    const sound = this.sounds.get(name);
    if (!sound || typeof sound.pause !== 'function') return;

    sound.pause();
    sound.currentTime = 0;
  }

  /**
   * Stops every registered sound.
   *
   * @returns {void}
   */
  stopAll() {
    this.sounds.forEach((sound) => {
      if (!sound || typeof sound.pause !== 'function') return;

      sound.pause();
      sound.currentTime = 0;
    });
  }

  readMutedPreference() {
    if (!this.storage || typeof this.storage.getItem !== 'function') return false;

    try {
      return this.storage.getItem(MUTE_STORAGE_KEY) === 'true';
    } catch (error) {
      return false;
    }
  }

  writeMutedPreference() {
    if (!this.storage || typeof this.storage.setItem !== 'function') return;

    try {
      this.storage.setItem(MUTE_STORAGE_KEY, String(this.muted));
    } catch (error) {
      // Storage can be unavailable in private browsing or restricted contexts.
    }
  }
}

export { MUTE_STORAGE_KEY };
