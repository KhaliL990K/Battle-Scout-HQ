import { createHash } from 'node:crypto';
import { Routes } from 'discord.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { GuildSettings } from '../models/GuildSettings.js';
import * as caseCmd from './case.js';
import * as panel from './panel.js';
import * as sticky from './sticky.js';
import * as ticket from './ticket.js';

/** All slash commands. Deliberately few: anything else belongs in a panel. */
export const commands = new Map([
  [panel.data.name, panel],
  [ticket.data.name, ticket],
  [sticky.data.name, sticky],
  [caseCmd.data.name, caseCmd],
]);

/**
 * Register guild commands only when their definitions changed since the last run.
 * @param {import('discord.js').Client} client
 */
export async function registerCommands(client) {
  const body = [...commands.values()].map((c) => c.data.toJSON());
  const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex');

  const stored = await GuildSettings.findOne({ guildId: env.GUILD_ID }, 'commandHash').lean();
  if (stored?.commandHash === hash) {
    logger.info({ count: body.length }, 'Slash commands unchanged, skipped registration');
    return;
  }

  await client.rest.put(Routes.applicationGuildCommands(env.CLIENT_ID, env.GUILD_ID), { body });
  await GuildSettings.updateOne({ guildId: env.GUILD_ID }, { $set: { commandHash: hash } });
  logger.info({ count: body.length }, 'Slash commands registered');
}
