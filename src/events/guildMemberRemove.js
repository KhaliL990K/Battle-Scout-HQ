import { Events } from 'discord.js';
import { env } from '../config/env.js';
import { logEvent } from '../modules/logging/logEvent.js';

export const name = Events.GuildMemberRemove;

/**
 * @param {import('discord.js').GuildMember|import('discord.js').PartialGuildMember} member
 */
export async function execute(member) {
  if (member.guild.id !== env.GUILD_ID) return;

  const fields = [];
  if (member.joinedTimestamp) {
    fields.push({ name: 'Joined', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>` });
  }
  const roles = member.roles?.cache
    .filter((r) => r.id !== member.guild.id)
    .map((r) => `<@&${r.id}>`);
  if (roles?.length) fields.push({ name: 'Roles', value: roles.join(' ') });

  await logEvent({ type: 'memberLeave', title: 'Member left', target: member.user, fields });
}
