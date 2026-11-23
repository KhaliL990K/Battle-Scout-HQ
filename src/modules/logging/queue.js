import { MessageFlags } from 'discord.js';
import { LOG_QUEUE, V2_LIMITS } from '../../config/constants.js';
import { env } from '../../config/env.js';
import { DISCORD_ERR, isDiscordError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import * as settings from '../../lib/settings.js';
import { measure } from '../../lib/ui/card.js';

/** @type {import('discord.js').Client|null} */
let client = null;
let timer = null;
let inflight = null;

/** @type {Array<{ container: import('discord.js').ContainerBuilder, components: number, chars: number }>} */
const pending = [];

/** messageId -> expiry. The bot's own housekeeping deletions are never logged. */
const ignored = new Map();

/**
 * Start the periodic flush.
 * @param {import('discord.js').Client} c
 */
export function startQueue(c) {
  client = c;
  timer = setInterval(() => void flush(), LOG_QUEUE.flushMs);
  timer.unref();
}

/** Stop the timer and flush whatever is left. Called during graceful shutdown. */
export async function stopQueue() {
  clearInterval(timer);
  await flush();
}

/**
 * Queue a log container; flushes early once a full batch is waiting.
 * @param {import('discord.js').ContainerBuilder} container
 */
export function enqueue(container) {
  pending.push({ container, ...measure(container.toJSON()) });
  if (pending.length >= LOG_QUEUE.maxBatch) void flush();
}

/**
 * Send one log container straight away instead of batching, for entries that carry buttons and
 * whose message id must be remembered so the buttons can be disabled later.
 * @param {import('discord.js').ContainerBuilder} container
 * @returns {Promise<import('discord.js').Message|null>} null when no log channel is writable
 */
export async function sendNow(container) {
  const channelId = settings.get(env.GUILD_ID).logging.channelId;
  if (!channelId) return null;
  try {
    const channel =
      client.channels.cache.get(channelId) ?? (await client.channels.fetch(channelId));
    return await channel.send({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
  } catch (err) {
    if (!isDiscordError(err, DISCORD_ERR.unknownChannel, DISCORD_ERR.missingPermissions)) throw err;
    logger.warn({ channelId, code: err.code }, 'Log channel missing or not writable');
    return null;
  }
}

/**
 * Mark a message id as bot housekeeping so its delete event is not logged.
 * Call this BEFORE deleting.
 * @param {string} messageId
 */
export function markIgnored(messageId) {
  ignored.set(messageId, Date.now() + LOG_QUEUE.ignoreTtlMs);
}

/**
 * @param {string} messageId
 * @returns {boolean}
 */
export function isIgnored(messageId) {
  const expiry = ignored.get(messageId);
  if (expiry === undefined) return false;
  if (expiry < Date.now()) {
    ignored.delete(messageId);
    return false;
  }
  return true;
}

/** Flush the queue. Concurrent callers share the in-flight drain. */
export function flush() {
  if (!inflight) inflight = drain().finally(() => (inflight = null));
  return inflight;
}

/** Take as many entries as fit inside the Components V2 limits for one message. */
function takeBatch() {
  const batch = [];
  let components = 0;
  let chars = 0;
  while (pending.length) {
    const next = pending[0];
    const overflows =
      components + next.components > V2_LIMITS.components ||
      chars + next.chars > V2_LIMITS.textChars ||
      batch.length >= LOG_QUEUE.maxBatch;
    if (batch.length && overflows) break;
    batch.push(pending.shift());
    components += next.components;
    chars += next.chars;
  }
  return batch;
}

async function drain() {
  while (pending.length) {
    const batch = takeBatch();
    await send(batch.map((b) => b.container));
  }
}

async function send(containers) {
  const channelId = settings.get(env.GUILD_ID).logging.channelId;
  if (!channelId) {
    logger.debug({ dropped: containers.length }, 'Log entries dropped: no log channel set');
    return;
  }
  try {
    const channel =
      client.channels.cache.get(channelId) ?? (await client.channels.fetch(channelId));
    await channel.send({
      components: containers,
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
  } catch (err) {
    if (!isDiscordError(err, DISCORD_ERR.unknownChannel, DISCORD_ERR.missingPermissions)) {
      logger.error({ err }, 'Log flush failed');
      return;
    }
    logger.warn({ channelId, code: err.code }, 'Log channel missing or not writable');
  }
}
