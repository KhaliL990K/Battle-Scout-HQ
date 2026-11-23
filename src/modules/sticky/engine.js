import { DISCORD_ERR, isDiscordError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { StickyMessage } from '../../models/StickyMessage.js';
import { markIgnored } from '../logging/queue.js';
import { renderSticky } from './view.js';

/**
 * channelId -> live state. The cache keeps the hot path (every message in the server) to a
 * single Map lookup; the database is only touched when a sticky is actually re-posted.
 * @typedef {{ doc: object, since: number, postedAt: number, timer: NodeJS.Timeout|null, busy: boolean }} StickyState
 */
/** @type {Map<string, StickyState>} */
const states = new Map();

/** @type {import('discord.js').Client|null} */
let client = null;

const unix = () => Math.floor(Date.now() / 1000);

/** Number of channels with an active sticky, for the hub summary. */
export const activeCount = () => states.size;

/**
 * Load every active sticky into the cache.
 * @param {import('discord.js').Client} c
 */
export async function loadStickies(c) {
  client = c;
  const docs = await StickyMessage.find({ active: true }).lean();
  for (const doc of docs) track(doc);
  logger.info({ count: docs.length }, 'Sticky messages loaded');
}

function track(doc) {
  const previous = states.get(doc.channelId);
  if (previous?.timer) clearTimeout(previous.timer);
  states.set(doc.channelId, {
    doc,
    since: 0,
    postedAt: (doc.lastPostedAtUnix ?? 0) * 1000,
    timer: null,
    busy: false,
  });
}

/**
 * Called for every guild message. Counts it toward the channel's sticky, if there is one, and
 * re-posts once both the message count and the time since the last post have been reached.
 * @param {import('discord.js').Message} message
 */
export function onMessage(message) {
  const s = states.get(message.channelId);
  if (!s || s.doc.paused) return;
  // The sticky's own post arrives as a message event; it must not count toward the next one.
  if (message.id === s.doc.messageId) return;
  if (s.busy && message.author.id === client.user.id) return;
  s.since += 1;
  consider(s);
}

/** Re-post now if due, otherwise arm a single timer for the moment it becomes due. */
function consider(s) {
  if (s.since < s.doc.afterMessages) return;
  const wait = s.postedAt + s.doc.afterSeconds * 1000 - Date.now();
  if (wait <= 0) {
    void repost(s);
  } else if (!s.timer) {
    s.timer = setTimeout(() => {
      s.timer = null;
      void repost(s);
    }, wait);
    s.timer.unref();
  }
}

/**
 * Swap the sticky: delete the previous post, send the new one, then store the new id. The
 * per-channel lock means a burst of messages cannot produce two stickies.
 * @param {StickyState} s
 */
async function repost(s) {
  if (s.busy) return;
  s.busy = true;
  const { doc } = s;
  try {
    const channel = await client.channels.fetch(doc.channelId);
    if (doc.messageId) {
      markIgnored(doc.messageId);
      await channel.messages.delete(doc.messageId).catch((err) => {
        if (!isDiscordError(err, DISCORD_ERR.unknownMessage)) throw err;
      });
    }
    const message = await channel.send(renderSticky(doc));
    markIgnored(message.id);
    s.doc = { ...doc, messageId: message.id, lastPostedAtUnix: unix() };
    s.postedAt = Date.now();
    s.since = 0;
    await StickyMessage.updateOne(
      { _id: doc._id },
      { messageId: message.id, lastPostedAtUnix: s.doc.lastPostedAtUnix },
    );
  } catch (err) {
    if (isDiscordError(err, DISCORD_ERR.unknownChannel, DISCORD_ERR.missingPermissions)) {
      logger.warn({ channelId: doc.channelId, code: err.code }, 'Sticky channel unavailable');
    } else {
      logger.error({ err, channelId: doc.channelId }, 'Sticky re-post failed');
    }
    // The old post may be gone; forget it so the next attempt does not chase a dead id.
    s.doc = { ...s.doc, messageId: null };
  } finally {
    s.busy = false;
  }
}

/**
 * Create or update the sticky in a channel and post it immediately.
 * @param {object} data guildId, channelId, title, body, afterMessages, afterSeconds, userId
 * @returns {Promise<object>} the stored sticky
 */
export async function setSticky(data) {
  const { userId, ...fields } = data;
  const doc = await StickyMessage.findOneAndUpdate(
    { guildId: data.guildId, channelId: data.channelId },
    { ...fields, active: true, paused: false, $setOnInsert: { createdById: userId } },
    { upsert: true, returnDocument: 'after' },
  ).lean();
  track(doc);
  await repost(states.get(doc.channelId));
  return states.get(doc.channelId).doc;
}

/**
 * Remove a sticky: stop tracking it and delete its post. The document stays, inactive.
 * @param {string} guildId
 * @param {string} channelId
 * @returns {Promise<boolean>} whether there was one
 */
export async function clearSticky(guildId, channelId) {
  const s = states.get(channelId);
  const doc = await StickyMessage.findOneAndUpdate(
    { guildId, channelId, active: true },
    { active: false, messageId: null },
    { returnDocument: 'before' },
  ).lean();
  if (!doc) return false;
  if (s?.timer) clearTimeout(s.timer);
  states.delete(channelId);
  if (doc.messageId) {
    markIgnored(doc.messageId);
    await client.channels
      .fetch(channelId)
      .then((ch) => ch.messages.delete(doc.messageId))
      .catch((err) => {
        if (!isDiscordError(err, DISCORD_ERR.unknownMessage, DISCORD_ERR.unknownChannel)) throw err;
      });
  }
  return true;
}

/**
 * Pause or resume re-posting without touching the message.
 * @param {string} channelId
 * @param {boolean} paused
 */
export async function setPaused(channelId, paused) {
  const s = states.get(channelId);
  if (!s) return;
  await StickyMessage.updateOne({ _id: s.doc._id }, { paused });
  s.doc = { ...s.doc, paused };
  if (paused && s.timer) {
    clearTimeout(s.timer);
    s.timer = null;
  }
}

/** Re-post straight away, ignoring the counters (the "Repost now" button). */
export async function repostNow(channelId) {
  const s = states.get(channelId);
  if (s) await repost(s);
}
