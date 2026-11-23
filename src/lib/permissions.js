import { PermissionFlagsBits, PermissionsBitField } from 'discord.js';
import * as settings from './settings.js';

/**
 * Admins can run /panel and change configuration.
 * @param {import('discord.js').GuildMember|null} member
 * @returns {boolean}
 */
export function isAdmin(member) {
  if (!member?.permissions) return false;
  return member.permissions.has(PermissionFlagsBits.Administrator);
}

/**
 * Staff are admins or hold any configured staff role.
 * @param {import('discord.js').GuildMember|null} member
 * @returns {boolean}
 */
export function isStaff(member) {
  if (!member) return false;
  if (isAdmin(member)) return true;
  const { roleIds } = settings.get(member.guild.id).staff;
  return roleIds.some((id) => member.roles.cache.has(id));
}

/**
 * Whether the bot can moderate a target (role hierarchy, owner, self).
 * Detect this up front and report it instead of letting the API throw.
 * @param {import('discord.js').GuildMember} botMember
 * @param {import('discord.js').GuildMember} target
 * @returns {boolean}
 */
export function canActOn(botMember, target) {
  if (target.id === target.guild.ownerId) return false;
  if (target.id === botMember.id) return false;
  return botMember.roles.highest.comparePositionTo(target.roles.highest) > 0;
}

/**
 * Names of the permissions the bot lacks in a channel, so a panel can warn before a feature
 * fails silently.
 * @param {import('discord.js').GuildBasedChannel|null|undefined} channel
 * @param {import('discord.js').GuildMember|null} botMember
 * @param {bigint[]} required PermissionFlagsBits values
 * @returns {string[]} human-readable names; ['Channel not found'] when the channel is gone
 */
export function missingChannelPermissions(channel, botMember, required) {
  if (!channel || !botMember) return ['Channel not found'];
  const have = channel.permissionsFor(botMember);
  const missing = required.filter((flag) => !have?.has(flag));
  return new PermissionsBitField(missing).toArray();
}
