import { Events } from 'discord.js';
import { registerCommands } from '../commands/index.js';
import { resolveAll } from '../config/emoji.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import * as settings from '../lib/settings.js';
import { initModules } from '../modules/index.js';

export const name = Events.ClientReady;
export const once = true;

/**
 * Warm everything the hot paths rely on, exactly once: settings cache, emoji ids, modules.
 * @param {import('discord.js').Client} client
 */
export async function execute(client) {
  if (!client.guilds.cache.has(env.GUILD_ID)) {
    logger.fatal({ guildId: env.GUILD_ID }, 'Bot is not in GUILD_ID. Invite it, then restart.');
    process.exit(1);
  }

  const s = await settings.ensure(env.GUILD_ID);
  await resolveAll(client, s.emoji ?? {});
  await initModules(client);
  await registerCommands(client);

  logger.info({ tag: client.user.tag, guildId: env.GUILD_ID }, 'Ready');
}
