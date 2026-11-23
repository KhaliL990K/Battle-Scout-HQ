import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { CHANGELOG_LIMITS, MODULE_ACCENTS } from '../../config/constants.js';
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
import { pingProblem } from '../../lib/ui/ping.js';
import { backButton } from '../../lib/ui/nav.js';
import { Changelog } from '../../models/Changelog.js';
import { ChangelogTemplate } from '../../models/ChangelogTemplate.js';

const REQUIRED = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function channelLine(guild, channelId) {
  if (!channelId) return 'Pick a channel below.';
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
 * Build the Changelog settings card. Reads drafts and recent releases from the database, so
 * unlike most panels it is async.
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<import('discord.js').ContainerBuilder>}
 */
export async function buildChangelogCard(guild) {
  const s = settings.get(guild.id).changelog;
  const [drafts, recent, templates] = await Promise.all([
    Changelog.find({ guildId: guild.id, status: { $in: ['draft', 'publishing'] } })
      .sort({ updatedAt: -1 })
      .limit(CHANGELOG_LIMITS.maxDrafts)
      .lean(),
    Changelog.find({ guildId: guild.id, status: 'published' })
      .sort({ publishedAtUnix: -1 })
      .limit(CHANGELOG_LIMITS.recentPublished)
      .lean(),
    ChangelogTemplate.find({ guildId: guild.id }).select('name').lean(),
  ]);
  const defaultName = templates.find((t) => String(t._id) === s.defaultTemplateId)?.name;
  const warning = pingProblem(guild, s.pingRoleId);

  const c = card({
    accent: MODULE_ACCENTS.changelog,
    title: `${inline('changelog')} Changelog`,
    subtitle: 'Build from a template, preview, then publish',
  });
  divider(c);
  row(c, {
    label: 'New changelog',
    value: `${drafts.length} draft${drafts.length === 1 ? '' : 's'} in progress`,
    button: button({
      id: encode('changelog', 'newdraft'),
      label: 'New',
      emoji: 'changelog',
      style: ButtonStyle.Primary,
    }),
  });
  row(c, {
    label: 'Templates',
    value: `${templates.length || 'No'} template${templates.length === 1 ? '' : 's'}${defaultName ? ` · default: ${defaultName}` : ''}`,
    button: button({ id: encode('changelog', 'tpls'), label: 'Edit', emoji: 'settings' }),
  });
  row(c, { label: 'Publishes to', value: channelLine(guild, s.channelId) });
  row(c, {
    label: 'Default ping role',
    value: s.pingRoleId
      ? `<@&${s.pingRoleId}>${warning ? `\n${inline('warn')} ${warning}` : ''}`
      : 'None (templates can set their own)',
  });
  row(c, {
    label: 'Recently published',
    value: recent.length
      ? recent
          .map(
            (r) =>
              `**${r.version}** · ${clip(r.title, 50)} · https://discord.com/channels/${guild.id}/${r.channelId}/${r.messageId}`,
          )
          .join('\n')
      : 'Nothing yet.',
  });
  divider(c, { line: false });

  controls(c, {
    select: channelSelect({
      id: encode('changelog', 'channel'),
      placeholder: 'Channel to publish in…',
      channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
      defaults: s.channelId ? [s.channelId] : [],
    }),
  });
  controls(c, {
    select: roleSelect({
      id: encode('changelog', 'pingrole'),
      placeholder: 'Default role to ping…',
      min: 0,
      max: 1,
      defaults: s.pingRoleId ? [s.pingRoleId] : [],
    }),
  });
  if (drafts.length) {
    controls(c, {
      select: stringSelect({
        id: encode('changelog', 'draftpick'),
        placeholder: 'Resume a draft…',
        options: drafts.map((d) => ({
          label: clip(`${d.version} · ${d.title}`, 100),
          value: String(d._id),
          description: `Updated ${d.updatedAt.toISOString().slice(0, 10)}`,
        })),
      }),
    });
  }
  controls(c, { buttons: [backButton()] });
  return c;
}
