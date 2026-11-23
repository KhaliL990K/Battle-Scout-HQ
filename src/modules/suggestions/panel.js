import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { MODULE_ACCENTS, SUGGESTION_STATUSES } from '../../config/constants.js';
import { inline } from '../../config/emoji.js';
import { encode } from '../../lib/customId.js';
import { missingChannelPermissions } from '../../lib/permissions.js';
import * as settings from '../../lib/settings.js';
import { card, controls, divider, row } from '../../lib/ui/card.js';
import { pingProblem } from '../../lib/ui/ping.js';
import { button, ButtonStyle, channelSelect, roleSelect } from '../../lib/ui/components.js';
import { backButton } from '../../lib/ui/nav.js';
import { Suggestion } from '../../models/Suggestion.js';

/** What the bot needs in the suggestions channel to run the repost flow end to end. */
const REQUIRED = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.CreatePublicThreads,
  PermissionFlagsBits.SendMessagesInThreads,
  PermissionFlagsBits.ManageThreads,
];

const onOff = (flag) => `${inline(flag ? 'on' : 'off')} ${flag ? 'On' : 'Off'}`;

/** Count suggestions per status for the stats row. */
async function statusCounts(guildId) {
  const rows = await Suggestion.aggregate([
    { $match: { guildId } },
    { $group: { _id: '$status', n: { $sum: 1 } } },
  ]);
  const counts = Object.fromEntries(rows.map((r) => [r._id, r.n]));
  return Object.entries(SUGGESTION_STATUSES)
    .map(([key, def]) => `${inline(def.emoji)} ${counts[key] ?? 0}`)
    .join('  ');
}

/** Warn about missing permissions up front instead of failing silently on the first post. */
function permissionLine(guild, channelId) {
  if (!channelId) return 'Pick a channel first.';
  const missing = missingChannelPermissions(
    guild.channels.cache.get(channelId),
    guild.members.me,
    REQUIRED,
  );
  return missing.length
    ? `${inline('warn')} Missing: ${missing.join(', ')}`
    : `${inline('on')} All required permissions present`;
}

/** The ping role, how often it fires, and a warning when the mention would not notify. */
function pingLine(guild, s) {
  if (!s.pingRoleId) return 'None. Offer the role on a Role panel so members can opt in.';
  const every = s.pingCooldownMin
    ? `at most once every **${s.pingCooldownMin} min**`
    : 'on every suggestion';
  const problem = pingProblem(guild, s.pingRoleId);
  return `<@&${s.pingRoleId}> · ${every}${problem ? `\n${inline('warn')} ${problem}` : ''}`;
}

/**
 * Build the Suggestions settings card.
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<import('discord.js').ContainerBuilder>}
 */
export async function buildSuggestionsCard(guild) {
  const s = settings.get(guild.id).suggestions;
  const c = card({
    accent: MODULE_ACCENTS.suggestions,
    title: `${inline('suggestion')} Suggestions`,
    subtitle: 'Members post, the bot reposts, everyone votes, staff decide',
  });
  divider(c);

  row(c, {
    label: 'Status',
    value: onOff(s.enabled),
    button: button({
      id: encode('suggestions', 'power'),
      label: s.enabled ? 'Disable' : 'Enable',
      style: s.enabled ? ButtonStyle.Secondary : ButtonStyle.Success,
    }),
  });
  row(c, {
    label: 'Suggestions channel',
    value: s.channelId ? `<#${s.channelId}>` : 'Not set. Pick one below.',
  });
  row(c, { label: 'Permissions', value: permissionLine(guild, s.channelId) });
  row(c, {
    label: 'Staff review channel',
    value: s.reviewChannelId ? `<#${s.reviewChannelId}>` : 'Not set (optional)',
  });
  row(c, {
    label: 'Limits',
    value: `Minimum **${s.minLength}** characters · cooldown **${s.cooldownSec}s** · ping every **${s.pingCooldownMin} min**`,
    button: button({ id: encode('suggestions', 'limits'), label: 'Edit', emoji: 'settings' }),
  });
  row(c, {
    label: 'Ping role for new suggestions',
    value: pingLine(guild, s),
  });
  row(c, {
    label: 'Staff messages',
    value: s.ignoreStaff ? 'Left alone in the channel' : 'Reposted like everyone else',
    button: button({
      id: encode('suggestions', 'ignorestaff'),
      label: s.ignoreStaff ? 'Repost them' : 'Ignore them',
    }),
  });
  row(c, { label: 'All time', value: await statusCounts(guild.id) });
  divider(c, { line: false });

  controls(c, {
    select: channelSelect({
      id: encode('suggestions', 'channel'),
      placeholder: 'Choose the suggestions channel…',
      channelTypes: [ChannelType.GuildText],
      defaults: s.channelId ? [s.channelId] : [],
    }),
  });
  controls(c, {
    select: channelSelect({
      id: encode('suggestions', 'review'),
      placeholder: 'Choose the staff review channel (optional)…',
      channelTypes: [ChannelType.GuildText],
      defaults: s.reviewChannelId ? [s.reviewChannelId] : [],
      min: 0,
    }),
  });
  controls(c, {
    select: roleSelect({
      id: encode('suggestions', 'pingrole'),
      placeholder: 'Role to ping on new suggestions (optional)…',
      defaults: s.pingRoleId ? [s.pingRoleId] : [],
    }),
  });
  controls(c, { buttons: [backButton()] });
  return c;
}
