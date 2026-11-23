import { randomInt } from 'node:crypto';
import mongoose from 'mongoose';
import { PermissionFlagsBits } from 'discord.js';
import { GIVEAWAY_LIMITS, LOG_COLORS } from '../../config/constants.js';
import { DISCORD_ERR, isDiscordError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { missingChannelPermissions } from '../../lib/permissions.js';
import { nextSeq } from '../../models/Counter.js';
import { Giveaway } from '../../models/Giveaway.js';
import { logEvent } from '../logging/logEvent.js';
import { STRINGS } from './strings.js';
import { jump, pad, renderGiveaway } from './view.js';

const REQUIRED = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];
const UNIT_SECONDS = { w: 604_800, d: 86_400, h: 3600, m: 60, s: 1 };
const nowUnix = () => Math.floor(Date.now() / 1000);

/**
 * Parse "30m", "2h", "1d 12h" or a bare number of minutes into seconds, or null when it is
 * malformed or outside the allowed range.
 * @param {string} raw
 * @returns {number|null}
 */
export function parseDuration(raw) {
  const value = raw.trim().toLowerCase();
  if (/^\d+$/.test(value)) return bounded(Number(value) * 60);
  if (!/^(\s*\d+\s*[wdhms])+\s*$/.test(value)) return null;
  let total = 0;
  for (const [, n, unit] of value.matchAll(/(\d+)\s*([wdhms])/g)) {
    total += Number(n) * UNIT_SECONDS[unit];
  }
  return bounded(total);
}

const bounded = (sec) =>
  sec >= GIVEAWAY_LIMITS.minDurationSec && sec <= GIVEAWAY_LIMITS.maxDurationSec ? sec : null;

/**
 * Load a giveaway by the id carried in a custom id; a malformed id reads as "not found".
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function loadGiveaway(id) {
  if (!mongoose.isValidObjectId(id)) return null;
  return Giveaway.findById(id).lean();
}

/**
 * Draw up to `count` winners uniformly at random with a CSPRNG, skipping anyone who fails
 * `eligible` (left the server). Each entrant is checked at most once.
 * @param {string[]} pool entrant ids
 * @param {number} count
 * @param {(userId: string) => Promise<boolean>} eligible
 * @returns {Promise<string[]>}
 */
export async function drawWinners(pool, count, eligible) {
  const left = [...new Set(pool)];
  const winners = [];
  while (winners.length < count && left.length) {
    const [pick] = left.splice(randomInt(left.length), 1);
    if (await eligible(pick)) winners.push(pick);
  }
  return winners;
}

/** True when the user is still a member of the guild. */
function stillMember(guild) {
  return async (userId) => {
    if (!guild) return false;
    if (guild.members.cache.has(userId)) return true;
    const member = await guild.members.fetch(userId).catch(() => null);
    return Boolean(member);
  };
}

/** Fetch the giveaway's channel, or null when it is gone or hidden. */
async function channelOf(client, doc) {
  if (!doc.channelId) return null;
  return client.channels.fetch(doc.channelId).catch((err) => {
    if (!isDiscordError(err, DISCORD_ERR.unknownChannel, DISCORD_ERR.missingPermissions)) throw err;
    return null;
  });
}

/**
 * Re-render the public card from the stored document. A message deleted by hand is not an
 * error: the giveaway carries on in the database.
 * @param {import('discord.js').Client} client
 * @param {object} doc
 */
export async function refreshMessage(client, doc) {
  if (!doc.messageId) return;
  const channel = await channelOf(client, doc);
  if (!channel) return;
  await channel.messages.edit(doc.messageId, renderGiveaway(doc)).catch((err) => {
    if (!isDiscordError(err, DISCORD_ERR.unknownMessage)) throw err;
    logger.warn({ id: String(doc._id) }, 'Giveaway message is gone');
  });
}

/** Post a follow-up under the giveaway that pings exactly the given users. */
async function announce(client, doc, content, userIds) {
  const channel = await channelOf(client, doc);
  if (!channel) return;
  await channel
    .send({
      content,
      allowedMentions: { parse: [], users: userIds },
      ...(doc.messageId
        ? { reply: { messageReference: doc.messageId, failIfNotExists: false } }
        : {}),
    })
    .catch((err) => logger.warn({ err: err.message }, 'Giveaway announcement failed'));
}

/**
 * Start a draft: claim it, number it, post it. A failed send puts it back to draft.
 * @param {import('discord.js').Client} client
 * @param {string} id
 * @param {import('discord.js').User} actor
 * @returns {Promise<{ ok: true, url: string } | { ok: false, reason: string }>}
 */
export async function startGiveaway(client, id, actor) {
  const draft = await loadGiveaway(id);
  if (!draft) return { ok: false, reason: STRINGS.missing };
  if (draft.status !== 'draft') return { ok: false, reason: STRINGS.notDraft };
  if (!draft.channelId) return { ok: false, reason: STRINGS.needChannel };
  const channel = await channelOf(client, draft);
  const guild = client.guilds.cache.get(draft.guildId);
  const missing = missingChannelPermissions(channel, guild?.members.me, REQUIRED);
  if (missing.length) return { ok: false, reason: STRINGS.cannotPost(missing.join(', ')) };

  const startedAtUnix = nowUnix();
  const doc = await Giveaway.findOneAndUpdate(
    { _id: id, status: 'draft' },
    {
      status: 'running',
      number: draft.number ?? (await nextSeq(draft.guildId, 'giveaway')),
      startedAtUnix,
      endsAtUnix: startedAtUnix + draft.durationSec,
      hostId: actor.id,
    },
    { returnDocument: 'after' },
  ).lean();
  if (!doc) return { ok: false, reason: STRINGS.notDraft };

  let message;
  try {
    message = await channel.send(renderGiveaway(doc));
  } catch (err) {
    logger.warn({ err: err.message, id }, 'Giveaway send failed');
    await Giveaway.updateOne(
      { _id: id },
      { status: 'draft', startedAtUnix: null, endsAtUnix: null },
    );
    return { ok: false, reason: STRINGS.sendFailed };
  }
  await Giveaway.updateOne({ _id: id }, { messageId: message.id });
  await logEvent({
    type: 'giveaway',
    title: `Giveaway #${pad(doc.number)} started`,
    actor,
    fields: [
      { name: 'Prize', value: doc.prize },
      { name: 'Winners', value: String(doc.winnerCount) },
      { name: 'Ends', value: `<t:${doc.endsAtUnix}:F>` },
      { name: 'Message', value: message.url },
    ],
  });
  return { ok: true, url: message.url };
}

/**
 * End a giveaway and draw its winners. The claim is atomic, so the scheduler, End now and a
 * restart can never draw twice; a claim left in "ending" by a crash is taken over after a minute.
 * @param {import('discord.js').Client} client
 * @param {string} id
 * @param {import('discord.js').User|null} actor null when the timer ended it
 * @returns {Promise<{ ok: true, doc: object } | { ok: false, reason: string }>}
 */
export async function endGiveaway(client, id, actor = null) {
  const stale = new Date(Date.now() - GIVEAWAY_LIMITS.endLockMs);
  const claimed = await Giveaway.findOneAndUpdate(
    { _id: id, $or: [{ status: 'running' }, { status: 'ending', updatedAt: { $lt: stale } }] },
    { status: 'ending' },
    { returnDocument: 'after' },
  ).lean();
  if (!claimed) return { ok: false, reason: STRINGS.notRunning };

  const guild = client.guilds.cache.get(claimed.guildId);
  const winners = await drawWinners(claimed.entrants, claimed.winnerCount, stillMember(guild));
  const doc = await Giveaway.findOneAndUpdate(
    { _id: id, status: 'ending' },
    { status: 'ended', winners, endedAtUnix: nowUnix(), endedById: actor?.id ?? null },
    { returnDocument: 'after' },
  ).lean();

  await refreshMessage(client, doc);
  await announce(
    client,
    doc,
    winners.length
      ? STRINGS.winnersAnnounce(winners.map((w) => `<@${w}>`).join(', '), doc.prize, jump(doc))
      : STRINGS.noWinners(doc.prize),
    winners,
  );
  await logEvent({
    type: 'giveaway',
    title: `Giveaway #${pad(doc.number)} ended`,
    actor,
    fields: [
      { name: 'Prize', value: doc.prize },
      { name: 'Entries', value: String(doc.entrants.length) },
      { name: 'Winners', value: winners.map((w) => `<@${w}>`).join(' ') || 'none' },
      { name: 'Ended by', value: actor ? `<@${actor.id}>` : 'timer' },
    ],
  });
  return { ok: true, doc };
}

/**
 * Draw one extra winner from the entrants who have not won yet, after the giveaway ended.
 * @param {import('discord.js').Client} client
 * @param {string} id
 * @param {import('discord.js').User} actor
 * @returns {Promise<{ ok: true, userId: string, doc: object } | { ok: false, reason: string }>}
 */
export async function rerollGiveaway(client, id, actor) {
  const doc = await loadGiveaway(id);
  if (!doc) return { ok: false, reason: STRINGS.missing };
  if (doc.status !== 'ended') return { ok: false, reason: STRINGS.notEnded };

  const pool = doc.entrants.filter((u) => !doc.winners.includes(u));
  const guild = client.guilds.cache.get(doc.guildId);
  const [userId] = await drawWinners(pool, 1, stillMember(guild));
  if (!userId) return { ok: false, reason: STRINGS.noneLeft };

  // The filter refuses the write if a parallel reroll already picked the same member.
  const updated = await Giveaway.findOneAndUpdate(
    { _id: id, status: 'ended', winners: { $ne: userId } },
    { $push: { winners: userId, rerolls: { userId, byId: actor.id, atUnix: nowUnix() } } },
    { returnDocument: 'after' },
  ).lean();
  if (!updated) return { ok: false, reason: STRINGS.busy };

  await refreshMessage(client, updated);
  await announce(client, updated, STRINGS.rerollAnnounce(`<@${userId}>`, doc.prize, jump(doc)), [
    userId,
  ]);
  await logEvent({
    type: 'giveaway',
    title: `Giveaway #${pad(doc.number)} rerolled`,
    actor,
    fields: [
      { name: 'Prize', value: doc.prize },
      { name: 'New winner', value: `<@${userId}>` },
    ],
  });
  return { ok: true, userId, doc: updated };
}

/**
 * Cancel a running giveaway without drawing. Entries are kept as history.
 * @param {import('discord.js').Client} client
 * @param {string} id
 * @param {import('discord.js').User} actor
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
export async function cancelGiveaway(client, id, actor) {
  const doc = await Giveaway.findOneAndUpdate(
    { _id: id, status: 'running' },
    { status: 'cancelled', cancelledById: actor.id, endedAtUnix: nowUnix() },
    { returnDocument: 'after' },
  ).lean();
  if (!doc) return { ok: false, reason: STRINGS.notRunning };
  await refreshMessage(client, doc);
  await logEvent({
    type: 'giveaway',
    title: `Giveaway #${pad(doc.number)} cancelled`,
    color: LOG_COLORS.grey,
    actor,
    fields: [
      { name: 'Prize', value: doc.prize },
      { name: 'Entries', value: String(doc.entrants.length) },
    ],
  });
  return { ok: true };
}

/**
 * Add a member's entry. Atomic and idempotent: a double click is one entry.
 * @param {string} id
 * @param {string} userId
 * @returns {Promise<'entered'|'already'|'closed'>}
 */
export async function enter(id, userId) {
  if (!mongoose.isValidObjectId(id)) return 'closed';
  const res = await Giveaway.updateOne(
    { _id: id, status: 'running', endsAtUnix: { $gt: nowUnix() }, entrants: { $ne: userId } },
    { $addToSet: { entrants: userId } },
  );
  if (res.modifiedCount) return 'entered';
  const already = await Giveaway.exists({
    _id: id,
    status: 'running',
    endsAtUnix: { $gt: nowUnix() },
    entrants: userId,
  });
  return already ? 'already' : 'closed';
}

/**
 * Remove a member's entry while the giveaway runs.
 * @param {string} id
 * @param {string} userId
 * @returns {Promise<boolean>} whether they were removed
 */
export async function leave(id, userId) {
  if (!mongoose.isValidObjectId(id)) return false;
  const res = await Giveaway.updateOne(
    { _id: id, status: 'running', endsAtUnix: { $gt: nowUnix() } },
    { $pull: { entrants: userId } },
  );
  return res.modifiedCount > 0;
}
