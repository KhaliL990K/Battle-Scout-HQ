import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { MODULE_ACCENTS } from '../../config/constants.js';
import { inline } from '../../config/emoji.js';
import { encode } from '../../lib/customId.js';
import { missingChannelPermissions } from '../../lib/permissions.js';
import * as settings from '../../lib/settings.js';
import { card, controls, divider, row } from '../../lib/ui/card.js';
import { button, ButtonStyle, channelSelect, roleSelect } from '../../lib/ui/components.js';
import { backButton } from '../../lib/ui/nav.js';

/** What the bot needs in the ticket category to create private channels with overwrites. */
const REQUIRED = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ManageMessages,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.ReadMessageHistory,
];

const mention = (id, empty) => (id ? `<#${id}>` : empty);

function permissionLine(guild, parentId) {
  if (!parentId) return 'Pick a category first.';
  const missing = missingChannelPermissions(
    guild.channels.cache.get(parentId),
    guild.members.me,
    REQUIRED,
  );
  return missing.length
    ? `${inline('warn')} Missing: ${missing.join(', ')}`
    : `${inline('on')} All required permissions present`;
}

/**
 * Build the Tickets settings card.
 * @param {import('discord.js').Guild} guild
 * @returns {import('discord.js').ContainerBuilder}
 */
export function buildTicketsCard(guild) {
  const t = settings.get(guild.id).tickets;
  const c = card({
    accent: MODULE_ACCENTS.tickets,
    title: `${inline('ticket')} Tickets`,
    subtitle: 'Members pick a category, answer a few questions, and get a private channel',
  });
  divider(c);

  row(c, {
    label: 'Ticket panel',
    value: t.panelChannelId
      ? `${mention(t.panelChannelId)} · ${t.panelMessageId ? 'posted' : 'not posted yet'}`
      : 'Pick a channel below.',
    button: button({
      id: encode('tickets', 'postpanel'),
      label: t.panelMessageId ? 'Repost' : 'Post',
      style: ButtonStyle.Success,
    }),
  });
  row(c, {
    label: 'Categories',
    value: t.categories.length
      ? t.categories.map((x) => x.label).join(' · ')
      : 'None yet. Open the editor to load the defaults.',
    button: button({ id: encode('tickets', 'cats'), label: 'Edit', emoji: 'settings' }),
  });
  row(c, { label: 'Ticket channels go under', value: mention(t.categoryId, 'Not set') });
  row(c, { label: 'Permissions', value: permissionLine(guild, t.categoryId) });
  row(c, {
    label: 'Ticket staff roles',
    value: t.staffRoleIds.length
      ? t.staffRoleIds.map((id) => `<@&${id}>`).join(' ')
      : 'Only general staff (set in the hub)',
  });
  row(c, { label: 'Transcripts', value: mention(t.transcriptChannelId, 'Not set (optional)') });
  divider(c, { line: false });

  controls(c, {
    select: channelSelect({
      id: encode('tickets', 'panelchannel'),
      placeholder: 'Channel for the ticket panel…',
      channelTypes: [ChannelType.GuildText],
      defaults: t.panelChannelId ? [t.panelChannelId] : [],
    }),
  });
  controls(c, {
    select: channelSelect({
      id: encode('tickets', 'parent'),
      placeholder: 'Discord category for new tickets…',
      channelTypes: [ChannelType.GuildCategory],
      defaults: t.categoryId ? [t.categoryId] : [],
    }),
  });
  controls(c, {
    select: roleSelect({
      id: encode('tickets', 'roles'),
      placeholder: 'Extra staff roles for tickets…',
      min: 0,
      max: 10,
      defaults: t.staffRoleIds,
    }),
  });
  controls(c, {
    select: channelSelect({
      id: encode('tickets', 'transcript'),
      placeholder: 'Transcript channel (optional)…',
      channelTypes: [ChannelType.GuildText],
      defaults: t.transcriptChannelId ? [t.transcriptChannelId] : [],
      min: 0,
    }),
  });
  controls(c, { buttons: [backButton()] });
  return c;
}
