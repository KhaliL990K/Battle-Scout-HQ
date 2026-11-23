import announcements from './announcements/index.js';
import automod from './automod/index.js';
import changelog from './changelog/index.js';
import giveaways from './giveaways/index.js';
import logging from './logging/index.js';
import panels from './panels/index.js';
import roles from './roles/index.js';
import settingsModule from './settings/index.js';
import sticky from './sticky/index.js';
import suggestions from './suggestions/index.js';
import tickets from './tickets/index.js';
import { allModules, register } from './registry.js';

/** Register every feature module. The router and panels resolve modules through the registry. */
for (const mod of [
  panels,
  logging,
  suggestions,
  tickets,
  changelog,
  announcements,
  roles,
  giveaways,
  automod,
  sticky,
  settingsModule,
])
  register(mod);

/**
 * Run each module's optional startup hook.
 * @param {import('discord.js').Client} client
 */
export async function initModules(client) {
  for (const mod of allModules()) await mod.init?.(client);
}
