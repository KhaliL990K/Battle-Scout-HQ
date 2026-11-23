import { GIVEAWAY_LIMITS } from '../../config/constants.js';
import { logger } from '../../lib/logger.js';
import { Giveaway } from '../../models/Giveaway.js';
import { endGiveaway, loadGiveaway, refreshMessage } from './service.js';

/**
 * Ends giveaways on time without long timers: a short sweep asks the database what is due. A
 * restart therefore loses nothing, and anything that came due while the bot was down ends on
 * the first sweep. setTimeout cannot hold durations past ~24.8 days anyway.
 */

/** Giveaways whose entry count changed since the public card was last edited. */
const dirty = new Set();
let running = 0;
let sweeping = false;

/** Running giveaways, from memory, for the hub summary. */
export const runningCount = () => running;

/**
 * Ask for the public entry count to be refreshed on the next tick, so a rush of entries costs
 * one message edit instead of one per click.
 * @param {string} id
 */
export const markDirty = (id) => dirty.add(String(id));

/**
 * End everything that is due, including draws a crash left half-done.
 * @param {import('discord.js').Client} client
 */
export async function sweep(client) {
  if (sweeping) return;
  sweeping = true;
  try {
    const now = Math.floor(Date.now() / 1000);
    const stale = new Date(Date.now() - GIVEAWAY_LIMITS.endLockMs);
    const due = await Giveaway.find(
      {
        $or: [
          { status: 'running', endsAtUnix: { $lte: now } },
          { status: 'ending', updatedAt: { $lt: stale } },
        ],
      },
      { _id: 1 },
    ).lean();
    for (const { _id } of due) {
      try {
        await endGiveaway(client, String(_id), null);
      } catch (err) {
        logger.error({ err, id: String(_id) }, 'Ending a giveaway failed');
      }
    }
    running = await Giveaway.countDocuments({ status: 'running' });
  } finally {
    sweeping = false;
  }
}

/**
 * Edit the public card of every giveaway whose entries changed.
 * @param {import('discord.js').Client} client
 */
export async function flushDirty(client) {
  const ids = [...dirty];
  dirty.clear();
  for (const id of ids) {
    const doc = await loadGiveaway(id);
    if (doc?.status !== 'running') continue;
    await refreshMessage(client, doc).catch((err) =>
      logger.warn({ err: err.message, id }, 'Giveaway refresh failed'),
    );
  }
}

/**
 * Start the sweep and the entry-count refresh. Runs one sweep immediately, so giveaways that
 * came due while the bot was offline end at startup.
 * @param {import('discord.js').Client} client
 */
export async function startScheduler(client) {
  const safe = (fn) => () =>
    fn(client).catch((err) => logger.error({ err }, 'Giveaway scheduler tick failed'));
  await safe(sweep)();
  setInterval(safe(sweep), GIVEAWAY_LIMITS.sweepMs).unref();
  setInterval(safe(flushDirty), GIVEAWAY_LIMITS.refreshMs).unref();
}
