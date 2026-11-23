import { logger } from '../lib/logger.js';
import * as guildBanAdd from './guildBanAdd.js';
import * as guildMemberAdd from './guildMemberAdd.js';
import * as guildMemberRemove from './guildMemberRemove.js';
import * as guildMemberUpdate from './guildMemberUpdate.js';
import * as interactionCreate from './interactionCreate.js';
import * as messageCreate from './messageCreate.js';
import * as messageDelete from './messageDelete.js';
import * as messageUpdate from './messageUpdate.js';
import * as ready from './ready.js';

const events = [
  ready,
  interactionCreate,
  messageCreate,
  messageDelete,
  messageUpdate,
  guildMemberAdd,
  guildMemberRemove,
  guildMemberUpdate,
  guildBanAdd,
];

/**
 * Attach every gateway listener. Each is wrapped so one failing handler is logged, not fatal.
 * @param {import('discord.js').Client} client
 */
export function bindEvents(client) {
  for (const event of events) {
    const run = async (...args) => {
      try {
        await event.execute(...args);
      } catch (err) {
        logger.error({ err, event: event.name }, 'Event handler failed');
      }
    };
    if (event.once) client.once(event.name, run);
    else client.on(event.name, run);
  }
}
