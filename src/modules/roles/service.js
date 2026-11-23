import mongoose from 'mongoose';
import { PermissionFlagsBits } from 'discord.js';
import { LOG_COLORS, ROLE_PANEL_FORBIDDEN_PERMISSIONS } from '../../config/constants.js';
import { DISCORD_ERR, isDiscordError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { missingChannelPermissions } from '../../lib/permissions.js';
import * as settings from '../../lib/settings.js';
import { RolePanel } from '../../models/RolePanel.js';
import { logEvent } from '../logging/logEvent.js';
import { markIgnored } from '../logging/queue.js';
import { STRINGS } from './strings.js';
import { renderPublicPanel } from './view.js';

/** Active panels per guild, for the hub summary (which must not read the database). */
const activeCounts = new Map();

/**
 * Number of active role panels, from memory.
 * @param {string} guildId
 * @returns {number}
 */
export const activeCount = (guildId) => activeCounts.get(guildId) ?? 0;

/**
 * Recount active panels after a create or remove.
 * @param {string} guildId
 */
export async function refreshCount(guildId) {
  activeCounts.set(guildId, await RolePanel.countDocuments({ guildId, active: true }));
}

/**
 * Load a panel by the id carried in a custom id. A custom id is public, so a malformed id is
 * treated as "not found" instead of throwing a cast error.
 * @param {string} id
 * @returns {Promise<object|null>}
 */
export async function loadPanel(id) {
  if (!mongoose.isValidObjectId(id)) return null;
  return RolePanel.findById(id).lean();
}

/**
 * Why a role cannot be offered on a self-assign panel, or null when it is safe. Checked when
 * staff add the role and again on every click, since roles and the bot's position change.
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').Role|undefined} role
 * @returns {string|null}
 */
export function roleProblem(guild, role) {
  if (!role) return 'the role no longer exists';
  if (role.id === guild.id) return '@everyone cannot be self-assigned';
  if (role.managed) return 'it is managed by an integration or bot';
  const me = guild.members.me;
  if (!me?.permissions.has(PermissionFlagsBits.ManageRoles)) return 'the bot lacks Manage Roles';
  if (me.roles.highest.comparePositionTo(role) <= 0) {
    return "it is at or above the bot's highest role";
  }
  const risky = ROLE_PANEL_FORBIDDEN_PERMISSIONS.filter((p) =>
    role.permissions.has(PermissionFlagsBits[p]),
  );
  if (risky.length) return `it grants ${risky.join(', ')}`;
  return botRoleProblem(guild.id, role.id);
}

/**
 * Roles that carry power inside this bot without any Discord permission bit: staff roles open
 * every panel, exempt roles skip automod entirely. Read from the settings cache, not the database.
 * @param {string} guildId
 * @param {string} roleId
 * @returns {string|null}
 */
function botRoleProblem(guildId, roleId) {
  const s = settings.get(guildId);
  if (s.staff.roleIds.includes(roleId)) return 'it is a bot staff role';
  if (s.tickets.staffRoleIds.includes(roleId)) return 'it is a ticket staff role';
  if (s.automod.exemptRoleIds.includes(roleId)) return 'it is exempt from automod';
  if (s.automod.quarantineRoleId === roleId) return 'it is the automod quarantine role';
  return null;
}

/**
 * Validate a staff-typed emoji: one Unicode emoji or a custom `<:name:id>`. Returns the string
 * to store, null for blank, or false when it is not an emoji.
 * @param {string} raw
 * @returns {string|null|false}
 */
export function cleanEmoji(raw) {
  const value = raw.trim();
  if (!value) return null;
  if (/^<a?:\w{2,32}:\d{17,20}>$/.test(value)) return value;
  const graphemes = [...new Intl.Segmenter().segment(value)];
  if (graphemes.length === 1 && /\p{Extended_Pictographic}|\p{Regional_Indicator}/u.test(value)) {
    return value;
  }
  return false;
}

/** Remove the published message, if any. The bot's own housekeeping is never logged. */
async function deleteMessage(guild, doc) {
  if (!doc.messageId || !doc.channelId) return;
  const channel = guild.channels.cache.get(doc.channelId);
  if (!channel?.isTextBased()) return;
  markIgnored(doc.messageId);
  await channel.messages.delete(doc.messageId).catch((err) => {
    if (!isDiscordError(err, DISCORD_ERR.unknownMessage, DISCORD_ERR.unknownChannel)) throw err;
  });
}

/**
 * Move a panel to another channel. A published message in the old channel is deleted, so the
 * next publish posts fresh in the new one.
 * @param {import('discord.js').Guild} guild
 * @param {object} doc
 * @param {string} channelId
 */
export async function setChannel(guild, doc, channelId) {
  if (doc.channelId === channelId) return;
  await deleteMessage(guild, doc);
  await RolePanel.updateOne({ _id: doc._id }, { channelId, messageId: null });
}

/**
 * Problems that block publishing, as user-facing lines; empty when the panel can go out.
 * @param {import('discord.js').Guild} guild
 * @param {object} doc
 * @returns {string[]}
 */
export function publishProblems(guild, doc) {
  if (!doc.channelId) return [STRINGS.needChannel];
  if (!doc.roles.length) return [STRINGS.needRoles];
  const missing = missingChannelPermissions(
    guild.channels.cache.get(doc.channelId),
    guild.members.me,
    [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
  );
  if (missing.length) return [STRINGS.cannotPost(missing)];
  const bad = doc.roles
    .map((r) => [r.roleId, roleProblem(guild, guild.roles.cache.get(r.roleId))])
    .filter(([, problem]) => problem)
    .map(([id, problem]) => `- <@&${id}>: ${problem}`);
  return bad.length ? [STRINGS.fixRoles(bad)] : [];
}

/**
 * Send or update the public panel. Edits the existing message; a message that was deleted by
 * hand is replaced with a new one.
 * @param {import('discord.js').Guild} guild
 * @param {object} doc
 * @param {import('discord.js').User} actor
 * @returns {Promise<string>} the message URL
 */
export async function publishPanel(guild, doc, actor) {
  const channel = guild.channels.cache.get(doc.channelId);
  const payload = { ...renderPublicPanel(guild, doc), allowedMentions: { parse: [] } };
  let message = null;
  if (doc.messageId) {
    message = await channel.messages.edit(doc.messageId, payload).catch((err) => {
      if (isDiscordError(err, DISCORD_ERR.unknownMessage)) return null;
      throw err;
    });
  }
  const isNew = !message;
  if (isNew) message = await channel.send(payload);
  await RolePanel.updateOne({ _id: doc._id }, { messageId: message.id });
  await logEvent({
    type: 'settingsChange',
    title: isNew ? 'Role panel published' : 'Role panel updated',
    color: LOG_COLORS.grey,
    actor,
    fields: [
      { name: 'Panel', value: doc.title },
      { name: 'Roles', value: doc.roles.map((r) => `<@&${r.roleId}>`).join(' ') },
      { name: 'Link', value: message.url },
    ],
  });
  return message.url;
}

/**
 * Take a panel down: delete its message and mark it inactive. The document is kept.
 * @param {import('discord.js').Guild} guild
 * @param {object} doc
 * @param {import('discord.js').User} actor
 */
export async function removePanel(guild, doc, actor) {
  await deleteMessage(guild, doc);
  await RolePanel.updateOne({ _id: doc._id }, { active: false, messageId: null });
  await refreshCount(guild.id);
  await logEvent({
    type: 'settingsChange',
    title: 'Role panel removed',
    color: LOG_COLORS.grey,
    actor,
    fields: [{ name: 'Panel', value: doc.title }],
  });
}

/**
 * Add or remove one role for the member who clicked. In `one` mode, taking a role drops the
 * panel's other roles.
 * @param {import('discord.js').GuildMember} member
 * @param {object} panel
 * @param {string} roleId
 * @returns {Promise<string>} the ephemeral reply
 */
export async function toggleRole(member, panel, roleId) {
  const reason = `Role panel: ${panel.title}`;
  if (member.roles.cache.has(roleId)) {
    await member.roles.remove(roleId, reason);
    return STRINGS.removed(roleId);
  }
  await member.roles.add(roleId, reason);
  if (panel.mode !== 'one') return STRINGS.added(roleId);
  const others = panel.roles
    .map((r) => r.roleId)
    .filter((id) => id !== roleId && member.roles.cache.has(id));
  if (!others.length) return STRINGS.added(roleId);
  await member.roles.remove(others, reason);
  return STRINGS.swapped(roleId, others.length);
}

/**
 * Make the member's panel roles match a select-menu choice.
 * @param {import('discord.js').GuildMember} member
 * @param {object} panel
 * @param {string[]} chosen role ids, already checked against the panel
 * @returns {Promise<string>} the ephemeral reply
 */
export async function pickRoles(member, panel, chosen) {
  const reason = `Role panel: ${panel.title}`;
  const offered = panel.roles.map((r) => r.roleId);
  const add = chosen.filter((id) => !member.roles.cache.has(id));
  const remove = offered.filter((id) => !chosen.includes(id) && member.roles.cache.has(id));
  if (!add.length && !remove.length) return STRINGS.unchanged;
  if (add.length) await member.roles.add(add, reason);
  if (remove.length) await member.roles.remove(remove, reason);
  logger.debug({ userId: member.id, add, remove }, 'Role panel pick');
  return STRINGS.picked(add, remove);
}
