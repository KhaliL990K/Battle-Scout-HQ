import mongoose from 'mongoose';
import { AttachmentBuilder } from 'discord.js';
import { LOG_COLORS, SUGGESTION_LIMITS } from '../../config/constants.js';
import { DISCORD_ERR, isDiscordError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { isStaff } from '../../lib/permissions.js';
import * as settings from '../../lib/settings.js';
import { nextSeq } from '../../models/Counter.js';
import { Suggestion } from '../../models/Suggestion.js';
import { clip, logEvent } from '../logging/logEvent.js';
import { markIgnored } from '../logging/queue.js';
import { STRINGS } from './strings.js';
import { pad, renderSuggestion } from './view.js';

/** userId -> last accepted post (ms). Losing it on restart only forgives one cooldown. */
const lastPost = new Map();

/** guildId -> last role ping (ms). In memory: messageCreate never reads the database. */
const lastPing = new Map();

/**
 * The role to ping for this suggestion, or null while the ping cooldown is running. Stamps the
 * time as soon as it says yes, so a burst of suggestions cannot all ping.
 * @param {string} guildId
 * @param {{ pingRoleId: string|null, pingCooldownMin: number }} cfg
 * @returns {string|null}
 */
export function claimPing(guildId, cfg) {
  if (!cfg.pingRoleId) return null;
  const since = Date.now() - (lastPing.get(guildId) ?? 0);
  if (since < cfg.pingCooldownMin * 60_000) return null;
  lastPing.set(guildId, Date.now());
  return cfg.pingRoleId;
}

const ignoreGone = (err) => {
  if (!isDiscordError(err, DISCORD_ERR.unknownMessage)) throw err;
};

/** Delete a bot-side notice after a short delay; it is housekeeping, never logged. */
function expire(notice) {
  setTimeout(() => {
    markIgnored(notice.id);
    notice.delete().catch((err) => logger.debug({ err: err.message }, 'Notice already gone'));
  }, SUGGESTION_LIMITS.noticeTtlMs).unref();
}

/**
 * Remove a rejected message and tell the author why, quoting their text so nothing is lost.
 * A plain message cannot be answered ephemerally, so the notice self-deletes.
 */
async function reject(message, reason) {
  markIgnored(message.id);
  await message.delete().catch(ignoreGone);
  const quote = message.content ? `\n>>> ${clip(message.content, 400)}` : '';
  const notice = await message.channel.send({
    content: `<@${message.author.id}> ${reason}${quote}`,
    allowedMentions: { users: [message.author.id] },
  });
  expire(notice);
}

/** Collapse whitespace and cut to the thread-title budget. */
function snippet(content) {
  const clean = content.replace(/\s+/g, ' ').trim();
  if (!clean) return STRINGS.threadFallback;
  return clean.length > SUGGESTION_LIMITS.threadTitleChars
    ? `${clean.slice(0, SUGGESTION_LIMITS.threadTitleChars).trimEnd()}…`
    : clean;
}

const safeName = (index, original) =>
  `${index + 1}-${original.replace(/[^\w.-]+/g, '_').slice(-60) || 'file'}`;

/**
 * Re-upload attachments: the originals die with the deleted message.
 * @returns {Promise<{ files: AttachmentBuilder[], meta: object[], skipped: number }>}
 */
async function reuploadAttachments(message) {
  const files = [];
  const meta = [];
  const all = [...message.attachments.values()];
  let skipped = Math.max(0, all.length - SUGGESTION_LIMITS.maxAttachments);

  for (const [i, att] of all.slice(0, SUGGESTION_LIMITS.maxAttachments).entries()) {
    if (att.size > SUGGESTION_LIMITS.maxAttachmentBytes) {
      skipped += 1;
      continue;
    }
    try {
      const res = await fetch(att.url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const name = safeName(i, att.name ?? 'file');
      files.push(new AttachmentBuilder(Buffer.from(await res.arrayBuffer()), { name }));
      const type = att.contentType ?? '';
      meta.push({
        name,
        contentType: type || null,
        isMedia: type.startsWith('image/') || type.startsWith('video/'),
      });
    } catch (err) {
      skipped += 1;
      logger.warn({ err: err.message, name: att.name }, 'Could not re-upload attachment');
    }
  }
  return { files, meta, skipped };
}

/** Open the discussion thread on the repost. A failure must not undo the suggestion. */
async function openThread(sent, doc) {
  try {
    const thread = await sent.startThread({
      name: STRINGS.threadTitle(pad(doc.number), snippet(doc.content)),
      autoArchiveDuration: 10080,
    });
    await Suggestion.updateOne({ _id: doc._id }, { threadId: thread.id });
  } catch (err) {
    logger.warn({ err: err.message, number: doc.number }, 'Could not open suggestion thread');
  }
}

/** Let staff know about a new suggestion in the optional review channel. */
async function notifyReview(client, cfg, doc, link) {
  if (!cfg.reviewChannelId) return;
  const channel = await client.channels.fetch(cfg.reviewChannelId).catch(() => null);
  if (!channel?.isTextBased()) return;
  await channel
    .send({
      content: `New suggestion **#${pad(doc.number)}** from <@${doc.authorId}>: ${link}`,
      allowedMentions: { parse: [] },
    })
    .catch((err) => logger.warn({ err: err.message }, 'Review channel notice failed'));
}

/**
 * Repost a member's message as a suggestion card. Order matters: the repost is sent before the
 * original is deleted, so a failed send never costs the member their text.
 */
async function repost(message, cfg) {
  const { files, meta, skipped } = await reuploadAttachments(message);
  const number = await nextSeq(message.guildId, 'suggestion');
  const pingRoleId = claimPing(message.guildId, cfg);
  const draft = {
    _id: new mongoose.Types.ObjectId(),
    guildId: message.guildId,
    number,
    authorId: message.author.id,
    authorName: message.member?.displayName ?? message.author.username,
    authorAvatarUrl: message.member?.displayAvatarURL() ?? message.author.displayAvatarURL(),
    content: message.content,
    postedAtUnix: Math.floor(message.createdTimestamp / 1000),
    channelId: message.channelId,
    attachments: meta,
    skippedAttachments: skipped,
    votes: [],
    status: 'pending',
    pingRoleId,
  };

  const sent = await message.channel.send({
    ...renderSuggestion(draft),
    files,
    allowedMentions: { parse: [], roles: pingRoleId ? [pingRoleId] : [] },
  });
  markIgnored(message.id);
  await message.delete().catch(ignoreGone);

  const doc = await Suggestion.create({ ...draft, messageId: sent.id });
  await openThread(sent, doc);
  await notifyReview(message.client, cfg, doc, sent.url);
  await logEvent({
    type: 'suggestionEvent',
    title: `Suggestion #${pad(number)} posted`,
    color: LOG_COLORS.green,
    actor: message.author,
    fields: [
      { name: 'Link', value: sent.url },
      { name: 'Content', value: message.content || '*attachment only*' },
    ],
  });
}

/**
 * Entry point from the messageCreate event. Ignores everything that is not a member message in
 * the configured suggestions channel.
 * @param {import('discord.js').Message} message
 */
export async function handleSuggestionMessage(message) {
  const cfg = settings.get(message.guildId).suggestions;
  if (!cfg.enabled || message.channelId !== cfg.channelId) return;
  if (message.author.bot || message.webhookId || message.system) return;
  if (cfg.ignoreStaff && isStaff(message.member)) return;
  if (!message.content && message.attachments.size === 0) return;

  const text = message.content.trim();
  if (text.length < cfg.minLength) return reject(message, STRINGS.tooShort(cfg.minLength));

  const waitMs = (lastPost.get(message.author.id) ?? 0) + cfg.cooldownSec * 1000 - Date.now();
  if (waitMs > 0) return reject(message, STRINGS.cooldown(Math.ceil(waitMs / 1000)));
  // Stamp before the slow work so a burst of messages cannot slip past the cooldown.
  lastPost.set(message.author.id, Date.now());

  try {
    await repost(message, cfg);
  } catch (err) {
    lastPost.delete(message.author.id);
    throw err;
  }
}
