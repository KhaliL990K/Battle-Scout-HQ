import { Events } from 'discord.js';
import { env } from '../config/env.js';
import { logEvent } from '../modules/logging/logEvent.js';

export const name = Events.GuildMemberAdd;

/**
 * @param {import('discord.js').GuildMember} member
 */
export async function execute(member) {
  if (member.guild.id !== env.GUILD_ID) return;
  const created = Math.floor(member.user.createdTimestamp / 1000);

  await logEvent({
    type: 'memberJoin',
    title: 'Member joined',
    target: member.user,
    fields: [
      { name: 'Account created', value: `<t:${created}:R>` },
      { name: 'Members', value: String(member.guild.memberCount) },
    ],
  });
}
