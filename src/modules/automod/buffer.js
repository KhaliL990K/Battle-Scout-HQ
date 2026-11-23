import { AUTOMOD_LIMITS } from '../../config/constants.js';

/**
 * In-memory ring buffer of each member's recent messages, so deleting a spammer's messages is
 * exact and needs no history fetching. Lost on restart by design: it only has to cover the
 * lookback window.
 * @typedef {{ id: string, channelId: string, at: number, key: string, sample: string }} BufferedMessage
 */

/** @type {Map<string, BufferedMessage[]>} */
const buffers = new Map();

let timer = null;

/**
 * Remember a message, dropping anything older than the lookback and capping memory per member.
 * @param {string} userId
 * @param {BufferedMessage} entry
 * @param {number} lookbackMs
 * @param {number} [now]
 */
export function record(userId, entry, lookbackMs, now = Date.now()) {
  const list = (buffers.get(userId) ?? []).filter((m) => now - m.at <= lookbackMs);
  list.push(entry);
  if (list.length > AUTOMOD_LIMITS.bufferPerUser) list.shift();
  buffers.set(userId, list);
}

/**
 * @param {string} userId
 * @returns {BufferedMessage[]} oldest first
 */
export const recent = (userId) => buffers.get(userId) ?? [];

/** Forget a member's buffered messages, e.g. once they have been dealt with. */
export const clear = (userId) => buffers.delete(userId);

/** Number of members currently tracked (diagnostics and tests). */
export const size = () => buffers.size;

/**
 * Drop expired entries and empty buffers.
 * @param {number} lookbackMs
 * @param {number} [now]
 */
export function prune(lookbackMs, now = Date.now()) {
  for (const [userId, list] of buffers) {
    const kept = list.filter((m) => now - m.at <= lookbackMs);
    if (kept.length) buffers.set(userId, kept);
    else buffers.delete(userId);
  }
}

/**
 * Start the prune timer. The lookback is read each tick so a settings change applies without
 * a restart.
 * @param {() => number} getLookbackMs
 * @param {(now: number) => void} [onTick] extra housekeeping on the same timer
 */
export function startPruner(getLookbackMs, onTick) {
  timer = setInterval(() => {
    const now = Date.now();
    prune(getLookbackMs(), now);
    onTick?.(now);
  }, AUTOMOD_LIMITS.pruneEveryMs);
  timer.unref();
}

export function stopPruner() {
  clearInterval(timer);
}
