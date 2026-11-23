import { ChannelType } from 'discord.js';
import { GIVEAWAY_LIMITS, MODULE_ACCENTS } from '../../config/constants.js';
import { inline } from '../../config/emoji.js';
import { encode } from '../../lib/customId.js';
import { card, controls, divider, row, text } from '../../lib/ui/card.js';
import { button, ButtonStyle, channelSelect, roleSelect } from '../../lib/ui/components.js';
import { withPing } from '../../lib/ui/ping.js';

/** Zero-padded giveaway number: 7 -> "007". */
export const pad = (n) => String(n ?? 0).padStart(3, '0');

const UNITS = [
  ['d', 86_400],
  ['h', 3600],
  ['m', 60],
  ['s', 1],
];

/**
 * Format seconds as "1d 2h 30m".
 * @param {number} sec
 * @returns {string}
 */
export function formatDuration(sec) {
  const parts = [];
  let left = sec;
  for (const [unit, size] of UNITS) {
    if (left >= size) {
      parts.push(`${Math.floor(left / size)}${unit}`);
      left %= size;
    }
  }
  return parts.join(' ') || '0s';
}

export const jump = (doc) =>
  `https://discord.com/channels/${doc.guildId}/${doc.channelId}/${doc.messageId}`;

const mentions = (ids) => ids.map((id) => `<@${id}>`).join(', ');

/**
 * The public giveaway card. While running it carries the Enter button with the entry count;
 * once ended or cancelled the button is disabled and the winners are listed.
 * @param {object} doc
 * @returns {import('discord.js').ContainerBuilder}
 */
export function giveawayCard(doc) {
  const running = doc.status === 'running' || doc.status === 'draft';
  const c = card({
    accent: MODULE_ACCENTS.giveaways,
    title: `${inline('giveaway')} ${doc.prize}`,
    subtitle: doc.number ? `Giveaway #${pad(doc.number)}` : 'Giveaway preview',
  });
  if (doc.description) text(c, doc.description);
  divider(c);

  const lines = [];
  if (doc.status === 'draft') {
    lines.push(`**Runs for** ${formatDuration(doc.durationSec)}`);
  } else if (running) {
    lines.push(`**Ends** <t:${doc.endsAtUnix}:R> · <t:${doc.endsAtUnix}:F>`);
  } else if (doc.status === 'cancelled') {
    lines.push('**Cancelled** by staff');
  } else if (doc.endedAtUnix) {
    lines.push(`**Ended** <t:${doc.endedAtUnix}:R>`);
  } else {
    lines.push('**Drawing winners…**');
  }
  lines.push(`**Winners** ${doc.winnerCount} · **Hosted by** <@${doc.hostId}>`);
  if (doc.status === 'ended') {
    lines.push(doc.winners.length ? `**Won by** ${mentions(doc.winners)}` : '**No valid entries**');
  }
  text(c, lines.join('\n'));
  divider(c, { line: false });

  controls(c, {
    buttons: [
      button({
        id: encode('giveaways', 'enter', String(doc._id)),
        label: `${running ? 'Enter' : 'Entries'} (${doc.entrants?.length ?? 0})`,
        emoji: 'enter',
        style: running ? ButtonStyle.Success : ButtonStyle.Secondary,
        disabled: !running || doc.status === 'draft',
      }),
    ],
  });
  return c;
}

/**
 * Message options for the public giveaway. The ping line stays on every edit; only the first
 * send notifies.
 * @param {object} doc
 */
export const renderGiveaway = (doc) => withPing(giveawayCard(doc), doc.pingRoleId);

/**
 * Composer for a draft: where it goes, who to ping, then Start.
 * @param {object} doc
 * @param {{ problem?: string|null }} [opts] ping warning
 * @returns {import('discord.js').ContainerBuilder}
 */
export function composerCard(doc, { problem = null } = {}) {
  const id = String(doc._id);
  const c = card({
    accent: MODULE_ACCENTS.giveaways,
    title: `${inline('draft')} New giveaway`,
    subtitle: 'The preview above is what members will see',
  });
  divider(c);
  row(c, {
    label: 'Prize and length',
    value: `${doc.prize} · ${doc.winnerCount} winner${doc.winnerCount === 1 ? '' : 's'} · ${formatDuration(doc.durationSec)}`,
    button: button({ id: encode('giveaways', 'edit', id), label: 'Edit', emoji: 'draft' }),
  });
  row(c, {
    label: 'Channel',
    value: doc.channelId ? `<#${doc.channelId}>` : 'Not set. Pick one below.',
  });
  row(c, {
    label: 'Ping',
    value: doc.pingRoleId
      ? `<@&${doc.pingRoleId}>${problem ? `\n${inline('warn')} ${problem}` : ''}`
      : 'Nobody',
  });
  divider(c, { line: false });
  controls(c, {
    select: channelSelect({
      id: encode('giveaways', 'channel', id),
      placeholder: 'Channel to post in…',
      channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
      defaults: doc.channelId ? [doc.channelId] : [],
    }),
  });
  controls(c, {
    select: roleSelect({
      id: encode('giveaways', 'ping', id),
      placeholder: 'Role to ping (optional)…',
      defaults: doc.pingRoleId ? [doc.pingRoleId] : [],
    }),
  });
  controls(c, {
    buttons: [
      button({
        id: encode('giveaways', 'start', id),
        label: 'Start',
        emoji: 'enter',
        style: ButtonStyle.Success,
        disabled: !doc.channelId,
      }),
      button({
        id: encode('giveaways', 'discard', id),
        label: 'Discard',
        style: ButtonStyle.Danger,
      }),
      button({ id: encode('giveaways', 'home'), label: 'All giveaways', emoji: 'back' }),
    ],
  });
  return c;
}

/** Limits shown in the new-giveaway modal labels. */
export const durationHint = `e.g. 30m, 2h, 1d 12h (${formatDuration(GIVEAWAY_LIMITS.minDurationSec)} to ${formatDuration(GIVEAWAY_LIMITS.maxDurationSec)})`;
