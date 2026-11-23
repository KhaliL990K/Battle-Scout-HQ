import { Events } from 'discord.js';
import { env } from '../config/env.js';
import { handleAutomodMessage } from '../modules/automod/pipeline.js';
import { onMessage as stickyOnMessage } from '../modules/sticky/engine.js';
import { handleSuggestionMessage } from '../modules/suggestions/intake.js';

export const name = Events.MessageCreate;

/**
 * Fan-out point for message-driven features. Automod runs first and can consume the message.
 * @param {import('discord.js').Message} message
 */
export async function execute(message) {
  if (message.guildId !== env.GUILD_ID) return;
  // A message automod removed must not reach the suggestion repost.
  if (await handleAutomodMessage(message)) return;
  stickyOnMessage(message);
  await handleSuggestionMessage(message);
}
