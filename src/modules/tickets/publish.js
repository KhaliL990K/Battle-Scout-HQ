import { DISCORD_ERR, isDiscordError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import * as settings from '../../lib/settings.js';
import { markIgnored } from '../logging/queue.js';
import { renderTicketPanel } from './view.js';

/**
 * Post the public ticket panel in the configured channel, replacing any earlier one. Always a
 * new message: a Components V2 message cannot be converted to or from a classic one.
 * @param {import('discord.js').Client} client
 * @param {string} guildId
 * @param {import('discord.js').User} actor
 * @returns {Promise<string>} the new message URL
 */
export async function postTicketPanel(client, guildId, actor) {
  const t = settings.get(guildId).tickets;
  const channel = await client.channels.fetch(t.panelChannelId);

  if (t.panelMessageId) {
    markIgnored(t.panelMessageId);
    await channel.messages.delete(t.panelMessageId).catch((err) => {
      if (!isDiscordError(err, DISCORD_ERR.unknownMessage)) throw err;
    });
  }
  const message = await channel.send(renderTicketPanel(t.categories));
  await settings.set(guildId, 'tickets.panelMessageId', message.id, actor);
  return message.url;
}

/**
 * Re-render the posted panel after the categories changed. Best effort: a deleted panel is
 * simply left for staff to repost.
 * @param {import('discord.js').Client} client
 * @param {string} guildId
 */
export async function refreshPostedPanel(client, guildId) {
  const t = settings.get(guildId).tickets;
  if (!t.panelChannelId || !t.panelMessageId || !t.categories.length) return;
  try {
    const channel = await client.channels.fetch(t.panelChannelId);
    await channel.messages.edit(t.panelMessageId, renderTicketPanel(t.categories));
  } catch (err) {
    logger.warn({ err: err.message }, 'Could not refresh the posted ticket panel');
  }
}
