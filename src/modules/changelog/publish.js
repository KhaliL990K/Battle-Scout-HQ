import { PermissionFlagsBits } from 'discord.js';
import { DISCORD_ERR, isDiscordError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { missingChannelPermissions } from '../../lib/permissions.js';
import * as settings from '../../lib/settings.js';
import { Changelog } from '../../models/Changelog.js';
import { CHANGELOG_LIMITS } from '../../config/constants.js';
import { logEvent } from '../logging/logEvent.js';
import { STRINGS } from './strings.js';
import { renderChangelogMessage } from './view.js';

const REQUIRED = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];

/**
 * The role a changelog pings: the template's own, else the panel-wide default, and none when
 * the draft has pinging switched off.
 * @param {object} doc
 * @param {string} guildId
 * @returns {string|null}
 */
export const pingRoleFor = (doc, guildId) =>
  doc.ping ? (doc.template.pingRoleId ?? settings.get(guildId).changelog.pingRoleId) : null;

/**
 * Publish a draft. The claim is atomic, so a double click cannot post twice; a claim left in
 * "publishing" by a crash becomes claimable again after a minute.
 * @param {import('discord.js').Client} client
 * @param {string} id Changelog _id
 * @param {import('discord.js').User} actor
 * @returns {Promise<{ ok: true, url: string } | { ok: false, reason: string }>}
 */
export async function publishChangelog(client, id, actor) {
  const stale = new Date(Date.now() - CHANGELOG_LIMITS.publishLockMs);
  const doc = await Changelog.findOneAndUpdate(
    {
      _id: id,
      $or: [{ status: 'draft' }, { status: 'publishing', updatedAt: { $lt: stale } }],
    },
    { status: 'publishing' },
    { returnDocument: 'after' },
  ).lean();
  if (!doc) return { ok: false, reason: STRINGS.alreadyPublishing };

  const release = (reason) =>
    Changelog.updateOne({ _id: id }, { status: 'draft' }).then(() => ({ ok: false, reason }));

  const channelId = settings.get(doc.guildId).changelog.channelId;
  if (!channelId) return release(STRINGS.noChannel);

  const guild = client.guilds.cache.get(doc.guildId);
  const channel = await client.channels.fetch(channelId).catch((err) => {
    if (!isDiscordError(err, DISCORD_ERR.unknownChannel, DISCORD_ERR.missingPermissions)) throw err;
    return null;
  });
  const missing = missingChannelPermissions(channel, guild?.members.me, REQUIRED);
  if (missing.length) return release(STRINGS.cannotPost(missing.join(', ')));

  const unix = Math.floor(Date.now() / 1000);
  let message;
  try {
    message = await channel.send(renderChangelogMessage(doc, pingRoleFor(doc, doc.guildId), unix));
  } catch (err) {
    logger.warn({ err: err.message, id }, 'Changelog send failed');
    return release(STRINGS.sendFailed);
  }

  await Changelog.updateOne(
    { _id: id },
    { status: 'published', channelId, messageId: message.id, publishedAtUnix: unix },
  );
  await logEvent({
    type: 'changelog',
    title: 'Changelog published',
    actor,
    fields: [
      { name: 'Version', value: doc.version },
      { name: 'Title', value: doc.title },
      { name: 'Message', value: message.url },
    ],
  });
  return { ok: true, url: message.url };
}
