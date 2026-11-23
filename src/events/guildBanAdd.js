import { Events } from 'discord.js';
import { env } from '../config/env.js';
import { logEvent } from '../modules/logging/logEvent.js';

export const name = Events.GuildBanAdd;

/**
 * @param {import('discord.js').GuildBan} ban
 */
export async function execute(ban) {
  if (ban.guild.id !== env.GUILD_ID) return;
  // The reason is only present on a full ban object.
  const full = ban.partial ? await ban.fetch().catch(() => ban) : ban;

  await logEvent({
    type: 'memberBan',
    title: 'Member banned',
    target: full.user,
    fields: [{ name: 'Reason', value: full.reason ?? '*none given*' }],
  });
}
