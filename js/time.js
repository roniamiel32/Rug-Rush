const BEST_TIME_STORAGE_KEY = 'rugRushBestTime';

function getDefaultStorage() {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  return window.localStorage;
}

export function formatTime(seconds) {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;

  return `${String(minutes).padStart(2, '0')}:${String(remainingSeconds).padStart(2, '0')}`;
}

export class BestTimeManager {
  /**
   * @param {object} [options] Construction options.
   * @param {Storage|null} [options.storage=window.localStorage] Best-time store.
   */
  constructor({ storage = getDefaultStorage() } = {}) {
    this.storage = storage;
  }

  /**
   * @returns {number|null} Best time in seconds, or null when none is stored.
   */
  getBestTime() {
    if (!this.storage || typeof this.storage.getItem !== 'function') return null;

    try {
      const value = Number(this.storage.getItem(BEST_TIME_STORAGE_KEY));
      return Number.isFinite(value) && value > 0 ? value : null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Saves a successful result only when it is the first or fastest time.
   *
   * @param {number} seconds Completed round time, in seconds.
   * @returns {{bestTime: number, isNewBest: boolean}} Updated best-time status.
   */
  recordSuccess(seconds) {
    const currentBest = this.getBestTime();
    const isNewBest = currentBest === null || seconds < currentBest;
    const bestTime = isNewBest ? seconds : currentBest;

    if (isNewBest) this.writeBestTime(seconds);

    return { bestTime, isNewBest };
  }

  writeBestTime(seconds) {
    if (!this.storage || typeof this.storage.setItem !== 'function') return;

    try {
      this.storage.setItem(BEST_TIME_STORAGE_KEY, String(seconds));
    } catch (error) {
      // Storage can be unavailable in private browsing or restricted contexts.
    }
  }
}

export { BEST_TIME_STORAGE_KEY };
