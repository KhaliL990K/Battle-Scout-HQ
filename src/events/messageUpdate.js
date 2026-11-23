import { Events } from 'discord.js';
import { env } from '../config/env.js';
import { logEvent } from '../modules/logging/logEvent.js';

export const name = Events.MessageUpdate;

/**
 * @param {import('discord.js').Message|import('discord.js').PartialMessage} oldMessage
 * @param {import('discord.js').Message|import('discord.js').PartialMessage} newMessage
 */
export async function execute(oldMessage, newMessage) {
  if (newMessage.guildId !== env.GUILD_ID) return;

  const current = newMessage.partial ? await newMessage.fetch().catch(() => null) : newMessage;
  if (!current || current.author?.bot) return;
  // Embed unfurls fire an update with unchanged text; only real edits are interesting.
  if (!oldMessage.partial && oldMessage.content === current.content) return;

  await logEvent({
    type: 'messageEdit',
    title: 'Message edited',
    actor: current.author,
    fields: [
      { name: 'Channel', value: `${current.url}` },
      { name: 'Before', value: oldMessage.content ?? '*not cached*' },
      { name: 'After', value: current.content || '*empty*' },
    ],
  });
}
