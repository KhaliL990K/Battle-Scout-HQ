import { PermissionFlagsBits } from 'discord.js';
import { AUTOMOD_LIMITS, AUTOMOD_SIGNALS, MAX_TIMEOUT_HOURS } from '../../config/constants.js';
import { DISCORD_ERR, isDiscordError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { canActOn, isStaff } from '../../lib/permissions.js';
import { nextSeq } from '../../models/Counter.js';
import { Infraction } from '../../models/Infraction.js';
import { logEvent } from '../logging/logEvent.js';
import { markIgnored, sendNow } from '../logging/queue.js';
import { clear, recent, record } from './buffer.js';
import { getConfig } from './config.js';
import { describe, evaluate } from './signals.js';
import { STRINGS } from './strings.js';
import { reviewCard } from './view.js';

/** userId -> when automod last acted on them, so a burst triggers one case, not twenty. */
const acted = new Map();

/** Forget old cooldowns. Wired to the buffer's prune timer. */
export function pruneActed(now = Date.now()) {
  for (const [userId, at] of acted) {
    if (now - at > AUTOMOD_LIMITS.actCooldownMs) acted.delete(userId);
  }
}

const isExempt = (member, cfg) =>
  isStaff(member) || cfg.exemptRoleIds.some((id) => member.roles.cache.has(id));

/**
 * Entry point from messageCreate. Returns true when the message was removed by automod, so the
 * rest of the message pipeline (suggestions) leaves it alone.
 * @param {import('discord.js').Message} message
 * @returns {Promise<boolean>}
 */
export async function handleAutomodMessage(message) {
  if (!message.guild || message.author.bot || message.webhookId || message.system) return false;
  if (!message.member) return false;
  const cfg = getConfig(message.guildId);
  if (!cfg.enabled || isExempt(message.member, cfg)) return false;

  const now = Date.now();
  const userId = message.author.id;
  const ctx = describe(
    message,
    message.member.permissions.has(PermissionFlagsBits.MentionEveryone),
    now,
  );
  ctx.isHoneypot = Boolean(cfg.honeypotChannelId) && message.channelId === cfg.honeypotChannelId;

  record(
    userId,
    {
      id: message.id,
      channelId: message.channelId,
      at: now,
      key: ctx.key,
      sample: message.content.slice(0, AUTOMOD_LIMITS.sampleChars),
    },
    cfg.lookbackMinutes * 60_000,
    now,
  );

  const last = acted.get(userId);
  if (last && now - last < AUTOMOD_LIMITS.actCooldownMs) {
    // Already handled: sweep stragglers that were in flight, but do not open another case.
    if (cfg.dryRun) return false;
    return removeMessage(message);
  }

  const hit = evaluate(ctx, recent(userId), cfg, now);
  if (!hit) return false;

  // Set before any await so a burst of messages cannot start a second case.
  acted.set(userId, now);
  return cfg.dryRun ? dryRun(message, hit, cfg) : act(message, hit, cfg);
}

async function removeMessage(message) {
  markIgnored(message.id);
  try {
    await message.delete();
    return true;
  } catch (err) {
    if (isDiscordError(err, DISCORD_ERR.unknownMessage)) return true;
    logger.warn({ err: err.message, messageId: message.id }, 'Automod could not delete a message');
    return false;
  }
}

/** Log what would have happened without touching anything. */
async function dryRun(message, hit, cfg) {
  const buffered = recent(message.author.id);
  await logEvent({
    type: 'automodAction',
    title: 'Automod dry run: would act',
    description: 'Dry-run is on, so nothing was deleted or applied.',
    target: message.author,
    fields: [
      { name: 'Signal', value: `${AUTOMOD_SIGNALS[hit.signal].label} · ${hit.detail}` },
      { name: 'Would delete', value: `${buffered.length} message(s)` },
      { name: 'Would time out', value: `${cfg.timeoutHours}h` },
      { name: 'Sample', value: message.content || '*no text*' },
    ],
  });
  return false;
}

/** Delete the buffered messages, grouped per channel. Returns how many are gone. */
async function deleteBuffered(client, entries) {
  const byChannel = new Map();
  for (const e of entries) {
    byChannel.set(e.channelId, [...(byChannel.get(e.channelId) ?? []), e.id]);
    markIgnored(e.id);
  }
  let deleted = 0;
  for (const [channelId, ids] of byChannel) {
    const channel = client.channels.cache.get(channelId);
    if (!channel) continue;
    const gone = await channel.bulkDelete(ids, true).catch((err) => {
      if (!isDiscordError(err, DISCORD_ERR.unknownChannel, DISCORD_ERR.missingPermissions)) {
        logger.warn({ err: err.message, channelId }, 'Automod bulk delete failed');
      }
      return null;
    });
    deleted += gone?.size ?? 0;
    // Bulk delete skips messages older than 14 days and ones it could not see; try singly.
    for (const id of ids.filter((x) => !gone?.has(x))) {
      const ok = await channel.messages
        .delete(id)
        .then(() => true)
        .catch(() => false);
      if (ok) deleted += 1;
    }
  }
  return deleted;
}

/** Apply the timeout, reporting instead of throwing when the bot cannot. */
async function applyTimeout(member, cfg, signal) {
  const me = member.guild.members.me;
  if (!me.permissions.has(PermissionFlagsBits.ModerateMembers)) {
    return { error: 'bot lacks Moderate Members' };
  }
  if (!canActOn(me, member)) return { error: 'member is above the bot or the owner' };
  const hours = Math.min(cfg.timeoutHours, MAX_TIMEOUT_HOURS);
  try {
    await member.timeout(hours * 3_600_000, STRINGS.timeoutReason(AUTOMOD_SIGNALS[signal].label));
    return { untilUnix: Math.floor((Date.now() + hours * 3_600_000) / 1000) };
  } catch (err) {
    return { error: err.message };
  }
}

async function tryDm(member, hours) {
  try {
    await member.send(STRINGS.dm(hours));
    return true;
  } catch (err) {
    if (!isDiscordError(err, DISCORD_ERR.cannotDm))
      logger.warn({ err: err.message }, 'Automod DM failed');
    return false;
  }
}

/** The real pipeline: delete, time out, record, post the review card, DM. */
async function act(message, hit, cfg) {
  const { client, member, author, guildId } = message;
  const entries = [...recent(author.id)];
  const channelIds = [...new Set(entries.map((e) => e.channelId))];

  // Intent first, so a crash mid-action is still traceable.
  logger.info(
    { userId: author.id, signal: hit.signal, messages: entries.length },
    'Automod acting on member',
  );
  const inf = await Infraction.create({
    guildId,
    number: await nextSeq(guildId, 'infraction'),
    userId: author.id,
    userTag: author.tag ?? author.username,
    avatarUrl: author.displayAvatarURL(),
    signal: hit.signal,
    detail: hit.detail,
    sample: message.content.slice(0, AUTOMOD_LIMITS.sampleChars),
    channelIds,
    messageCount: entries.length,
    accountCreatedUnix: Math.floor(author.createdTimestamp / 1000),
  });

  const deletedCount = await deleteBuffered(client, entries);
  clear(author.id);
  const timeout = await applyTimeout(member, cfg, hit.signal);
  const dmSent = cfg.dmMember ? await tryDm(member, cfg.timeoutHours) : false;

  const updated = await Infraction.findByIdAndUpdate(
    inf._id,
    {
      deletedCount,
      timeoutUntilUnix: timeout.untilUnix ?? null,
      timeoutError: timeout.error ?? null,
      dmSent,
    },
    { returnDocument: 'after' },
  ).lean();

  const posted = await sendNow(reviewCard(updated)).catch((err) => {
    logger.error({ err }, 'Could not post the automod review card');
    return null;
  });
  if (posted) {
    await Infraction.updateOne(
      { _id: inf._id },
      { logChannelId: posted.channelId, logMessageId: posted.id },
    );
  } else {
    logger.warn({ case: inf.number }, 'Automod acted but no log channel is writable');
  }
  return true;
}
