import {
  AUTOMOD_SIGNALS,
  INFRACTION_DECISIONS,
  LOG_COLORS,
  MODULE_ACCENTS,
} from '../../config/constants.js';
import { inline } from '../../config/emoji.js';
import { encode } from '../../lib/customId.js';
import { card, controls, divider, text } from '../../lib/ui/card.js';
import { button, ButtonStyle } from '../../lib/ui/components.js';

/** Four-digit case number, like tickets. */
export const pad = (n) => String(n).padStart(4, '0');

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * The red evidence card with the review row. The same builder renders it after a decision, so
 * the buttons disable themselves and the outcome is written on the card.
 * @param {object} inf Infraction (lean)
 * @returns {import('discord.js').ContainerBuilder}
 */
export function reviewCard(inf) {
  const decision = INFRACTION_DECISIONS[inf.status];
  const id = String(inf._id);
  const c = card({
    accent: decision ? LOG_COLORS[decision.color] : LOG_COLORS.red,
    title: `${inline('shield')} Automod · case #${pad(inf.number)}`,
    subtitle: decision ? decision.label : 'Needs review',
    iconUrl: inf.avatarUrl ?? undefined,
  });
  divider(c);

  const lines = [
    `**Member** <@${inf.userId}> (${inf.userTag})`,
    `**Signal** ${AUTOMOD_SIGNALS[inf.signal]?.label ?? inf.signal} · ${inf.detail}`,
    `**Deleted** ${inf.deletedCount} of ${inf.messageCount} message${inf.messageCount === 1 ? '' : 's'}${inf.channelIds.length ? ` in ${inf.channelIds.map((x) => `<#${x}>`).join(' ')}` : ''}`,
  ];
  if (inf.accountCreatedUnix) lines.push(`**Account created** <t:${inf.accountCreatedUnix}:R>`);
  lines.push(
    inf.timeoutUntilUnix
      ? `**Timeout** until <t:${inf.timeoutUntilUnix}:F>`
      : `**Timeout** not applied${inf.timeoutError ? `: ${inf.timeoutError}` : ''}`,
  );
  lines.push(`**DM** ${inf.dmSent ? 'sent' : 'not delivered'}`);
  if (inf.sample) lines.push(`**Sample**\n>>> ${clip(inf.sample, 300)}`);
  text(c, lines.join('\n'));

  if (inf.decidedById) {
    divider(c, { line: false });
    text(c, `**${decision.label}** by <@${inf.decidedById}> <t:${inf.decidedAtUnix}:R>`);
  }
  divider(c, { line: false });

  // Terminal decisions disable the whole row; quarantine is a holding state, so the follow-ups
  // (release, kick, ban) stay available.
  const done = ['released', 'kicked', 'banned'].includes(inf.status);
  const held = inf.status === 'quarantined';
  controls(c, {
    buttons: [
      button({
        id: encode('automod', 'release', id),
        label: 'Release',
        style: ButtonStyle.Success,
        disabled: done,
      }),
      button({
        id: encode('automod', 'quarantine', id),
        label: 'Quarantine',
        disabled: done || held,
      }),
      button({
        id: encode('automod', 'kick', id),
        label: 'Kick',
        style: ButtonStyle.Danger,
        disabled: done,
      }),
      button({
        id: encode('automod', 'ban', id),
        label: 'Ban',
        style: ButtonStyle.Danger,
        disabled: done,
      }),
    ],
  });
  return c;
}

/**
 * Ephemeral confirm step for the irreversible decisions.
 * @param {'kick'|'ban'} action
 * @param {string} id
 * @param {string} body
 */
export function confirmCard(action, id, body) {
  const c = card({
    accent: MODULE_ACCENTS.automod,
    title: `${inline('warn')} Confirm ${action}`,
  });
  text(c, body);
  divider(c, { line: false });
  controls(c, {
    buttons: [
      button({
        id: encode('automod', `${action}ok`, id),
        label: action === 'ban' ? 'Ban' : 'Kick',
        style: ButtonStyle.Danger,
      }),
      button({ id: encode('automod', 'cancelconfirm'), label: 'Cancel' }),
    ],
  });
  return c;
}

/** Plain result line that replaces a confirm card. */
export function doneCard(message) {
  const c = card({ accent: MODULE_ACCENTS.automod, title: `${inline('statusApproved')} Done` });
  text(c, message);
  return c;
}
