import { PermissionFlagsBits } from 'discord.js';
import { ANNOUNCEMENT_LIMITS } from '../../config/constants.js';
import { DISCORD_ERR, isDiscordError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { missingChannelPermissions } from '../../lib/permissions.js';
import { Announcement } from '../../models/Announcement.js';
import { logEvent } from '../logging/logEvent.js';
import { STRINGS } from './strings.js';
import { renderAnnouncementMessage } from './view.js';

const REQUIRED = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];

/**
 * Send a draft. The claim is atomic so a double click cannot post twice; a claim left in
 * "sending" by a crash becomes claimable again after a minute.
 * @param {import('discord.js').Client} client
 * @param {string} id Announcement _id
 * @param {import('discord.js').User} actor
 * @returns {Promise<{ ok: true, url: string, doc: object } | { ok: false, reason: string }>}
 */
export async function sendAnnouncement(client, id, actor) {
  const stale = new Date(Date.now() - ANNOUNCEMENT_LIMITS.sendLockMs);
  const doc = await Announcement.findOneAndUpdate(
    { _id: id, $or: [{ status: 'draft' }, { status: 'sending', updatedAt: { $lt: stale } }] },
    { status: 'sending' },
    { returnDocument: 'after' },
  ).lean();
  if (!doc) return { ok: false, reason: STRINGS.alreadySending };

  const release = (reason) =>
    Announcement.updateOne({ _id: id }, { status: 'draft' }).then(() => ({ ok: false, reason }));

  if (!doc.channelId) return release(STRINGS.noChannel);
  const channel = await client.channels.fetch(doc.channelId).catch((err) => {
    if (!isDiscordError(err, DISCORD_ERR.unknownChannel, DISCORD_ERR.missingPermissions)) throw err;
    return null;
  });
  const guild = client.guilds.cache.get(doc.guildId);
  const missing = missingChannelPermissions(channel, guild?.members.me, REQUIRED);
  if (missing.length) return release(STRINGS.cannotPost(missing.join(', ')));

  const unix = Math.floor(Date.now() / 1000);
  let message;
  try {
    message = await channel.send(renderAnnouncementMessage(doc, unix));
  } catch (err) {
    logger.warn({ err: err.message, id }, 'Announcement send failed');
    return release(STRINGS.sendFailed);
  }

  const sent = await Announcement.findByIdAndUpdate(
    id,
    { status: 'sent', messageId: message.id, sentAtUnix: unix },
    { returnDocument: 'after' },
  ).lean();
  await logEvent({
    type: 'announcement',
    title: 'Announcement sent',
    actor,
    fields: [
      { name: 'Title', value: doc.title },
      { name: 'Channel', value: `<#${doc.channelId}>` },
      { name: 'Message', value: message.url },
    ],
  });
  return { ok: true, url: message.url, doc: sent };
}

/**
 * Change the content of an announcement that is already live. The Discord message is edited
 * first, so a deleted message leaves the stored copy untouched.
 * @param {import('discord.js').Client} client
 * @param {object} doc a sent Announcement (lean)
 * @param {{ title: string, body: string, imageUrl: string|null }} fields
 * @param {import('discord.js').User} actor
 * @returns {Promise<{ ok: true, url: string, doc: object } | { ok: false, reason: string }>}
 */
export async function editSentAnnouncement(client, doc, fields, actor) {
  const next = { ...doc, ...fields };
  let message;
  try {
    const channel = await client.channels.fetch(doc.channelId);
    message = await channel.messages.edit(
      doc.messageId,
      renderAnnouncementMessage(next, doc.sentAtUnix),
    );
  } catch (err) {
    if (!isDiscordError(err, DISCORD_ERR.unknownChannel, DISCORD_ERR.unknownMessage)) throw err;
    return { ok: false, reason: STRINGS.messageGone };
  }

  const updated = await Announcement.findByIdAndUpdate(
    doc._id,
    { ...fields, $inc: { editCount: 1 }, lastEditedById: actor.id },
    { returnDocument: 'after' },
  ).lean();
  await logEvent({
    type: 'announcement',
    title: 'Announcement edited',
    actor,
    fields: [
      { name: 'Title', value: fields.title },
      { name: 'Message', value: message.url },
    ],
  });
  return { ok: true, url: message.url, doc: updated };
}
