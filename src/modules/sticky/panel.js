import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { MODULE_ACCENTS, STICKY_LIMITS } from '../../config/constants.js';
import { inline } from '../../config/emoji.js';
import { encode } from '../../lib/customId.js';
import { missingChannelPermissions } from '../../lib/permissions.js';
import { card, controls, divider, row, text } from '../../lib/ui/card.js';
import { button, ButtonStyle, channelSelect, stringSelect } from '../../lib/ui/components.js';
import { backButton } from '../../lib/ui/nav.js';
import { StickyMessage } from '../../models/StickyMessage.js';

const REQUIRED = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
];

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * The Sticky Messages list: pick a channel to add or edit one, or pick an existing one to manage.
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<import('discord.js').ContainerBuilder>}
 */
export async function buildStickyCard(guild) {
  const docs = await StickyMessage.find({ guildId: guild.id, active: true })
    .sort({ updatedAt: -1 })
    .limit(STICKY_LIMITS.maxListed)
    .lean();

  const c = card({
    accent: MODULE_ACCENTS.sticky,
    title: `${inline('sticky')} Sticky messages`,
    subtitle: 'Keep a message at the bottom of an active channel',
  });
  divider(c);
  text(
    c,
    docs.length
      ? docs
          .map(
            (d) =>
              `<#${d.channelId}> · **${clip(d.title, 40)}** · every ${d.afterMessages} msgs and ${d.afterSeconds}s${d.paused ? ' · paused' : ''}`,
          )
          .join('\n')
      : 'No sticky messages yet. Pick a channel below to add one.',
  );
  divider(c, { line: false });

  controls(c, {
    select: channelSelect({
      id: encode('sticky', 'pick'),
      placeholder: 'Add or edit a sticky in…',
      channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
    }),
  });
  if (docs.length) {
    controls(c, {
      select: stringSelect({
        id: encode('sticky', 'manage'),
        placeholder: 'Manage a sticky…',
        options: docs.map((d) => ({
          label: clip(`#${guild.channels.cache.get(d.channelId)?.name ?? d.channelId}`, 100),
          value: String(d._id),
          description: clip(d.title, 100),
        })),
      }),
    });
  }
  controls(c, { buttons: [backButton()] });
  return c;
}

/**
 * Manage one sticky: preview, state, and the actions on it.
 * @param {import('discord.js').Guild} guild
 * @param {object} doc StickyMessage (lean)
 */
export function buildManageCard(guild, doc) {
  const id = String(doc._id);
  const missing = missingChannelPermissions(
    guild.channels.cache.get(doc.channelId),
    guild.members.me,
    REQUIRED,
  );
  const c = card({
    accent: MODULE_ACCENTS.sticky,
    title: `${inline('sticky')} Sticky in #${guild.channels.cache.get(doc.channelId)?.name ?? doc.channelId}`,
    subtitle: doc.paused ? 'Paused: stays put, no longer re-posted' : 'Active',
  });
  divider(c);
  row(c, { label: doc.title, value: clip(doc.body, 600) });
  row(c, {
    label: 'Re-posts after',
    value: `${doc.afterMessages} messages and ${doc.afterSeconds}s, whichever comes later`,
  });
  row(c, {
    label: 'Permissions',
    value: missing.length
      ? `${inline('warn')} Missing: ${missing.join(', ')}`
      : `${inline('on')} Bot can post there`,
  });
  divider(c, { line: false });
  controls(c, {
    buttons: [
      button({ id: encode('sticky', 'edit', id), label: 'Edit', style: ButtonStyle.Primary }),
      button({ id: encode('sticky', 'pause', id), label: doc.paused ? 'Resume' : 'Pause' }),
      button({ id: encode('sticky', 'repost', id), label: 'Repost now' }),
      button({ id: encode('sticky', 'remove', id), label: 'Remove', style: ButtonStyle.Danger }),
      button({ id: encode('sticky', 'home'), label: 'Back', emoji: 'back' }),
    ],
  });
  return c;
}
