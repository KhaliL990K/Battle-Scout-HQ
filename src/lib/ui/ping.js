import { MessageFlags, PermissionFlagsBits, TextDisplayBuilder } from 'discord.js';

/**
 * Wrap a finished card as a sendable public message that optionally pings a role. A Components
 * V2 message has no `content`, so the mention is a text line above the card, and
 * `allowedMentions` is pinned to that one role so nothing else in the text can ping.
 * @param {import('discord.js').ContainerBuilder} container
 * @param {string|null} [roleId]
 * @returns {import('discord.js').MessageCreateOptions}
 */
export function withPing(container, roleId = null) {
  const components = roleId
    ? [new TextDisplayBuilder().setContent(`<@&${roleId}>`), container]
    : [container];
  return {
    components,
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [], roles: roleId ? [roleId] : [] },
  };
}

/**
 * Explain why a role ping might not land, or null when it will. Pinging needs the role to be
 * mentionable or the bot to hold Mention Everyone.
 * @param {import('discord.js').Guild} guild
 * @param {string|null|undefined} roleId
 * @returns {string|null}
 */
export function pingProblem(guild, roleId) {
  if (!roleId) return null;
  const role = guild.roles.cache.get(roleId);
  if (!role) return 'That role no longer exists.';
  if (role.mentionable) return null;
  const me = guild.members.me;
  if (me?.permissions.has(PermissionFlagsBits.MentionEveryone)) return null;
  return `${role.name} is not mentionable and the bot lacks Mention Everyone, so the ping will not notify anyone.`;
}
