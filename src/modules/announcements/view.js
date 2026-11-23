import { ChannelType } from 'discord.js';
import { MediaGalleryBuilder, MediaGalleryItemBuilder } from 'discord.js';
import { MODULE_ACCENTS } from '../../config/constants.js';
import { inline } from '../../config/emoji.js';
import { encode } from '../../lib/customId.js';
import { card, controls, divider, row, text } from '../../lib/ui/card.js';
import { button, ButtonStyle, channelSelect, roleSelect } from '../../lib/ui/components.js';
import { withPing } from '../../lib/ui/ping.js';

/**
 * The announcement exactly as members will see it.
 * @param {{ title: string, body: string, imageUrl?: string|null }} doc
 * @param {number} unix timestamp shown in the footer
 * @returns {import('discord.js').ContainerBuilder}
 */
export function announcementCard(doc, unix) {
  const c = card({ accent: MODULE_ACCENTS.announcements, title: doc.title });
  text(c, doc.body);
  if (doc.imageUrl) {
    c.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(doc.imageUrl)),
    );
  }
  divider(c);
  text(c, `-# <t:${unix}:F>`);
  return c;
}

/**
 * The public message, with the optional role ping above the card.
 * @param {object} doc
 * @param {number} unix
 */
export const renderAnnouncementMessage = (doc, unix) =>
  withPing(announcementCard(doc, unix), doc.pingRoleId);

/**
 * Composer controls for a draft, shown beneath the live preview.
 * @param {object} doc
 * @param {{ problem: string|null }} ctx
 * @returns {import('discord.js').ContainerBuilder}
 */
export function composerCard(doc, { problem }) {
  const id = String(doc._id);
  const c = card({
    accent: MODULE_ACCENTS.announcements,
    title: `${inline('announcement')} Announcement composer`,
    subtitle: 'Draft · saved automatically',
  });
  divider(c);
  row(c, {
    label: 'Sends to',
    value: doc.channelId ? `<#${doc.channelId}>` : 'Choose a channel below.',
  });
  row(c, {
    label: 'Ping',
    value: doc.pingRoleId
      ? `<@&${doc.pingRoleId}>${problem ? `\n${inline('warn')} ${problem}` : ''}`
      : 'No one',
  });
  divider(c, { line: false });
  controls(c, {
    select: channelSelect({
      id: encode('announcements', 'channel', id),
      placeholder: 'Channel to send to…',
      channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
      defaults: doc.channelId ? [doc.channelId] : [],
    }),
  });
  controls(c, {
    select: roleSelect({
      id: encode('announcements', 'pingrole', id),
      placeholder: 'Role to ping (optional)…',
      min: 0,
      max: 1,
      defaults: doc.pingRoleId ? [doc.pingRoleId] : [],
    }),
  });
  controls(c, {
    buttons: [
      button({
        id: encode('announcements', 'send', id),
        label: 'Send',
        style: ButtonStyle.Success,
        disabled: !doc.channelId,
      }),
      button({ id: encode('announcements', 'edit', id), label: 'Edit' }),
      button({
        id: encode('announcements', 'cancel', id),
        label: 'Cancel',
        style: ButtonStyle.Danger,
      }),
      button({ id: encode('announcements', 'home'), label: 'Save for later', emoji: 'draft' }),
    ],
  });
  return c;
}

/**
 * Controls for an announcement that is already live: edit it in place, or go back.
 * @param {object} doc
 * @param {string} url jump link
 * @param {string} [note] result line such as "Updated"
 */
export function sentCard(doc, url, note) {
  const id = String(doc._id);
  const c = card({
    accent: MODULE_ACCENTS.announcements,
    title: `${inline('statusApproved')} ${note ?? 'Sent'}`,
    subtitle: `${doc.editCount} edit${doc.editCount === 1 ? '' : 's'} so far`,
  });
  divider(c);
  text(c, `**${doc.title}**\n${url}`);
  divider(c, { line: false });
  controls(c, {
    buttons: [
      button({
        id: encode('announcements', 'edit', id),
        label: 'Edit message',
        style: ButtonStyle.Primary,
      }),
      button({ id: encode('announcements', 'home'), label: 'Announcements panel' }),
    ],
  });
  return c;
}

/** Plain result card (cancelled, errors). */
export function noticeCard(title, body) {
  const c = card({ accent: MODULE_ACCENTS.announcements, title });
  text(c, body);
  divider(c, { line: false });
  controls(c, {
    buttons: [button({ id: encode('announcements', 'home'), label: 'Announcements panel' })],
  });
  return c;
}
