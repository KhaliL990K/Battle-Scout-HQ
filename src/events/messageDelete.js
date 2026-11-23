import { Events } from 'discord.js';
import { env } from '../config/env.js';
import { logEvent } from '../modules/logging/logEvent.js';
import { isIgnored } from '../modules/logging/queue.js';

export const name = Events.MessageDelete;

/**
 * @param {import('discord.js').Message|import('discord.js').PartialMessage} message
 */
export async function execute(message) {
  if (message.guildId !== env.GUILD_ID) return;
  // Bot housekeeping (suggestion reposts, ticket teardown, sticky churn) must never be logged.
  if (isIgnored(message.id) || message.author?.bot) return;

  const attachments = message.attachments?.size ?? 0;
  await logEvent({
    type: 'messageDelete',
    title: 'Message deleted',
    actor: message.author ?? null,
    fields: [
      { name: 'Channel', value: `<#${message.channelId}>` },
      { name: 'Content', value: message.content || '*not cached or empty*' },
      ...(attachments ? [{ name: 'Attachments', value: String(attachments) }] : []),
    ],
  });
}
