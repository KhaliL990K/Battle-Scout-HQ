import { ChannelType } from 'discord.js';
import { GIVEAWAY_LIMITS, MODULE_ACCENTS } from '../../config/constants.js';
import { inline } from '../../config/emoji.js';
import { encode } from '../../lib/customId.js';
import * as settings from '../../lib/settings.js';
import { card, controls, divider, row, text } from '../../lib/ui/card.js';
import {
  button,
  ButtonStyle,
  channelSelect,
  roleSelect,
  stringSelect,
} from '../../lib/ui/components.js';
import { backButton } from '../../lib/ui/nav.js';
import { Giveaway } from '../../models/Giveaway.js';
import { formatDuration, jump, pad } from './view.js';

const STATUS_LABEL = {
  draft: 'Draft',
  running: 'Running',
  ending: 'Drawing',
  ended: 'Ended',
  cancelled: 'Cancelled',
};

/** One-line summary of a giveaway for the list and the select. */
function summary(g) {
  if (g.status === 'running') return `ends <t:${g.endsAtUnix}:R> · ${g.entrants.length} entries`;
  if (g.status === 'draft') return `draft · ${formatDuration(g.durationSec)}`;
  if (g.status === 'ended') return `${g.winners.length} winner(s) · ${g.entrants.length} entries`;
  return STATUS_LABEL[g.status].toLowerCase();
}

/**
 * The Giveaways list: what is running, drafts, recent results, and the defaults.
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<import('discord.js').ContainerBuilder>}
 */
export async function buildGiveawaysCard(guild) {
  const s = settings.get(guild.id).giveaways;
  const list = await Giveaway.find({
    guildId: guild.id,
    // Discarded drafts never ran; leave them out.
    $or: [{ status: { $ne: 'cancelled' } }, { number: { $ne: null } }],
  })
    .sort({ createdAt: -1 })
    .limit(GIVEAWAY_LIMITS.maxListed)
    .select({
      entrants: 1,
      winners: 1,
      status: 1,
      prize: 1,
      number: 1,
      endsAtUnix: 1,
      durationSec: 1,
    })
    .lean();
  // Running first, then drafts, then the rest by recency.
  const order = { running: 0, ending: 1, draft: 2, ended: 3, cancelled: 4 };
  list.sort((a, b) => order[a.status] - order[b.status]);

  const c = card({
    accent: MODULE_ACCENTS.giveaways,
    title: `${inline('giveaway')} Giveaways`,
    subtitle: 'One button to enter; winners are drawn fairly when the timer ends',
  });
  divider(c);
  text(
    c,
    list.length
      ? list
          .map((g) => `**${g.number ? `#${pad(g.number)} ` : ''}${g.prize}** · ${summary(g)}`)
          .join('\n')
      : 'No giveaways yet.',
  );
  row(c, {
    label: 'Defaults for new giveaways',
    value: `Channel ${s.channelId ? `<#${s.channelId}>` : 'not set'} · ping ${s.pingRoleId ? `<@&${s.pingRoleId}>` : 'nobody'}`,
  });
  divider(c, { line: false });
  if (list.length) {
    controls(c, {
      select: stringSelect({
        id: encode('giveaways', 'manage'),
        placeholder: 'Open a giveaway…',
        options: list.map((g) => ({
          label: `${g.number ? `#${pad(g.number)} ` : ''}${g.prize}`.slice(0, 100),
          value: String(g._id),
          description: `${STATUS_LABEL[g.status]}`,
        })),
      }),
    });
  }
  controls(c, {
    select: channelSelect({
      id: encode('giveaways', 'defaultchannel'),
      placeholder: 'Default channel for new giveaways…',
      channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
      defaults: s.channelId ? [s.channelId] : [],
      min: 0,
    }),
  });
  controls(c, {
    select: roleSelect({
      id: encode('giveaways', 'defaultping'),
      placeholder: 'Default role to ping (optional)…',
      defaults: s.pingRoleId ? [s.pingRoleId] : [],
    }),
  });
  controls(c, {
    buttons: [
      button({
        id: encode('giveaways', 'new'),
        label: 'New giveaway',
        emoji: 'giveaway',
        style: ButtonStyle.Primary,
      }),
      backButton(),
    ],
  });
  return c;
}

/**
 * Manage one started giveaway: End now / Cancel while running, Reroll once ended.
 * @param {object} g
 * @param {{ confirmCancel?: boolean }} [opts]
 * @returns {import('discord.js').ContainerBuilder}
 */
export function buildManageCard(g, { confirmCancel = false } = {}) {
  const id = String(g._id);
  const c = card({
    accent: MODULE_ACCENTS.giveaways,
    title: `${inline('giveaway')} #${pad(g.number)} ${g.prize}`,
    subtitle: STATUS_LABEL[g.status],
  });
  divider(c);
  const lines = [
    `**Message** ${g.messageId ? jump(g) : 'not posted'}`,
    `**Entries** ${g.entrants.length} · **Winners** ${g.winnerCount}`,
  ];
  if (g.status === 'running') lines.push(`**Ends** <t:${g.endsAtUnix}:R> · <t:${g.endsAtUnix}:F>`);
  if (g.endedAtUnix) lines.push(`**Ended** <t:${g.endedAtUnix}:R>`);
  if (g.status === 'ended') {
    lines.push(
      `**Won by** ${g.winners.map((w) => `<@${w}>`).join(', ') || 'nobody (no valid entries)'}`,
    );
    for (const r of g.rerolls)
      lines.push(`-# Reroll: <@${r.userId}> by <@${r.byId}> <t:${r.atUnix}:R>`);
  }
  if (g.cancelledById) lines.push(`**Cancelled by** <@${g.cancelledById}>`);
  text(c, lines.join('\n'));
  divider(c, { line: false });

  const buttons = [];
  if (g.status === 'running') {
    buttons.push(
      button({
        id: encode('giveaways', 'endnow', id),
        label: 'End now',
        emoji: 'enter',
        style: ButtonStyle.Success,
      }),
      confirmCancel
        ? button({
            id: encode('giveaways', 'cancelconfirm', id),
            label: 'Confirm cancel',
            style: ButtonStyle.Danger,
          })
        : button({
            id: encode('giveaways', 'cancel', id),
            label: 'Cancel',
            style: ButtonStyle.Danger,
          }),
    );
  }
  if (g.status === 'ended') {
    buttons.push(
      button({
        id: encode('giveaways', 'reroll', id),
        label: 'Reroll one winner',
        emoji: 'refresh',
      }),
    );
  }
  if (g.status === 'ending') {
    buttons.push(
      button({ id: encode('giveaways', 'manage', id), label: 'Refresh', emoji: 'refresh' }),
    );
  }
  buttons.push(button({ id: encode('giveaways', 'home'), label: 'All giveaways', emoji: 'back' }));
  controls(c, { buttons });
  return c;
}
