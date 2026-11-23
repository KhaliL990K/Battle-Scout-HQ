import { Events } from 'discord.js';
import { env } from '../config/env.js';
import { logEvent } from '../modules/logging/logEvent.js';

export const name = Events.GuildMemberUpdate;

const mentions = (roles) => roles.map((r) => `<@&${r.id}>`).join(' ');

/** Timeout set or cleared. */
async function logTimeout(oldMember, newMember) {
  const until = newMember.communicationDisabledUntilTimestamp;
  const active = until && until > Date.now();
  await logEvent({
    type: 'memberTimeout',
    title: active ? 'Member timed out' : 'Timeout removed',
    target: newMember.user,
    fields: active ? [{ name: 'Until', value: `<t:${Math.floor(until / 1000)}:F>` }] : [],
  });
}

/** Roles added or removed. */
async function logRoles(oldMember, newMember) {
  const added = newMember.roles.cache.filter((r) => !oldMember.roles.cache.has(r.id));
  const removed = oldMember.roles.cache.filter((r) => !newMember.roles.cache.has(r.id));
  if (!added.size && !removed.size) return;

  await logEvent({
    type: 'roleChange',
    title: 'Roles changed',
    target: newMember.user,
    fields: [
      ...(added.size ? [{ name: 'Added', value: mentions(added) }] : []),
      ...(removed.size ? [{ name: 'Removed', value: mentions(removed) }] : []),
    ],
  });
}

/**
 * @param {import('discord.js').GuildMember|import('discord.js').PartialGuildMember} oldMember
 * @param {import('discord.js').GuildMember} newMember
 */
export async function execute(oldMember, newMember) {
  if (newMember.guild.id !== env.GUILD_ID) return;
  // A partial old member has no previous state to diff against.
  if (oldMember.partial) return;

  if (
    oldMember.communicationDisabledUntilTimestamp !== newMember.communicationDisabledUntilTimestamp
  ) {
    await logTimeout(oldMember, newMember);
  }
  await logRoles(oldMember, newMember);
}
