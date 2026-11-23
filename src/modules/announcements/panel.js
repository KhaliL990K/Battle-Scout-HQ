import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { ANNOUNCEMENT_LIMITS, MODULE_ACCENTS } from '../../config/constants.js';
import { inline } from '../../config/emoji.js';
import { encode } from '../../lib/customId.js';
import { missingChannelPermissions } from '../../lib/permissions.js';
import * as settings from '../../lib/settings.js';
import { card, controls, divider, row } from '../../lib/ui/card.js';
import {
  button,
  ButtonStyle,
  channelSelect,
  roleSelect,
  stringSelect,
} from '../../lib/ui/components.js';
import { backButton } from '../../lib/ui/nav.js';
import { pingProblem } from '../../lib/ui/ping.js';
import { Announcement } from '../../models/Announcement.js';

const REQUIRED = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function channelLine(guild, channelId) {
  if (!channelId) return 'None. Each announcement picks its own.';
  const missing = missingChannelPermissions(
    guild.channels.cache.get(channelId),
    guild.members.me,
    REQUIRED,
  );
  return missing.length
    ? `<#${channelId}>\n${inline('warn')} Missing: ${missing.join(', ')}`
    : `<#${channelId}> · ${inline('on')} bot can post there`;
}

/**
 * Build the Announcements panel. Reads drafts and recent sends from the database, so it is
 * async.
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<import('discord.js').ContainerBuilder>}
 */
export async function buildAnnouncementsCard(guild) {
  const s = settings.get(guild.id).announcements;
  const [drafts, recent] = await Promise.all([
    Announcement.find({ guildId: guild.id, status: { $in: ['draft', 'sending'] } })
      .sort({ updatedAt: -1 })
      .limit(ANNOUNCEMENT_LIMITS.maxDrafts)
      .lean(),
    Announcement.find({ guildId: guild.id, status: 'sent' })
      .sort({ sentAtUnix: -1 })
      .limit(ANNOUNCEMENT_LIMITS.recentSent)
      .lean(),
  ]);
  const warning = pingProblem(guild, s.pingRoleId);

  const c = card({
    accent: MODULE_ACCENTS.announcements,
    title: `${inline('announcement')} Announcements`,
    subtitle: 'Compose, preview, then send',
  });
  divider(c);
  row(c, {
    label: 'New announcement',
    value: `${drafts.length} draft${drafts.length === 1 ? '' : 's'} in progress`,
    button: button({
      id: encode('announcements', 'newdraft'),
      label: 'New',
      emoji: 'announcement',
      style: ButtonStyle.Primary,
    }),
  });
  row(c, {
    label: 'Edit a sent announcement',
    value: 'Paste its message link',
    button: button({ id: encode('announcements', 'editlink'), label: 'Edit', emoji: 'settings' }),
  });
  row(c, { label: 'Default channel', value: channelLine(guild, s.channelId) });
  row(c, {
    label: 'Default ping role',
    value: s.pingRoleId
      ? `<@&${s.pingRoleId}>${warning ? `\n${inline('warn')} ${warning}` : ''}`
      : 'No one',
  });
  row(c, {
    label: 'Recently sent',
    value: recent.length
      ? recent
          .map(
            (r) =>
              `**${clip(r.title, 40)}** by <@${r.authorId}> · <t:${r.sentAtUnix}:R> · https://discord.com/channels/${guild.id}/${r.channelId}/${r.messageId}`,
          )
          .join('\n')
      : 'Nothing yet.',
  });
  divider(c, { line: false });

  controls(c, {
    select: channelSelect({
      id: encode('announcements', 'defaultchannel'),
      placeholder: 'Default channel for new announcements…',
      channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
      defaults: s.channelId ? [s.channelId] : [],
      min: 0,
    }),
  });
  controls(c, {
    select: roleSelect({
      id: encode('announcements', 'defaultping'),
      placeholder: 'Default role to ping…',
      min: 0,
      max: 1,
      defaults: s.pingRoleId ? [s.pingRoleId] : [],
    }),
  });
  if (drafts.length) {
    controls(c, {
      select: stringSelect({
        id: encode('announcements', 'draftpick'),
        placeholder: 'Resume a draft…',
        options: drafts.map((d) => ({
          label: clip(d.title, 100),
          value: String(d._id),
          description: `Updated ${d.updatedAt.toISOString().slice(0, 10)}`,
        })),
      }),
    });
  }
  controls(c, { buttons: [backButton()] });
  return c;
}
