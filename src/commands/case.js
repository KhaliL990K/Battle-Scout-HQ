import {
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import {
  AUTOMOD_SIGNALS,
  INFRACTION_DECISIONS,
  MODULE_ACCENTS,
  SUGGESTION_STATUSES,
} from '../config/constants.js';
import { inline } from '../config/emoji.js';
import { isStaff } from '../lib/permissions.js';
import { card, divider, render, text } from '../lib/ui/card.js';
import { Giveaway } from '../models/Giveaway.js';
import { Infraction } from '../models/Infraction.js';
import { Suggestion } from '../models/Suggestion.js';
import { Ticket } from '../models/Ticket.js';

export const data = new SlashCommandBuilder()
  .setName('case')
  .setDescription('Look up an infraction, suggestion, ticket or giveaway by number')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .setContexts(InteractionContextType.Guild)
  .addStringOption((o) =>
    o
      .setName('type')
      .setDescription('What kind of record')
      .setRequired(true)
      .addChoices(
        { name: 'Infraction (automod)', value: 'infraction' },
        { name: 'Suggestion', value: 'suggestion' },
        { name: 'Ticket', value: 'ticket' },
        { name: 'Giveaway', value: 'giveaway' },
      ),
  )
  .addIntegerOption((o) =>
    o.setName('number').setDescription('The case number').setRequired(true).setMinValue(1),
  );

const pad = (n) => String(n).padStart(4, '0');
const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const link = (g, c, m) => `https://discord.com/channels/${g}/${c}/${m}`;

function infractionCard(d) {
  const decision = INFRACTION_DECISIONS[d.status];
  const c = card({
    accent: MODULE_ACCENTS.automod,
    title: `${inline('shield')} Infraction #${pad(d.number)}`,
    subtitle: decision?.label ?? 'Awaiting a decision',
  });
  divider(c);
  const lines = [
    `**Member** <@${d.userId}> (${d.userTag})`,
    `**Signal** ${AUTOMOD_SIGNALS[d.signal]?.label ?? d.signal} · ${d.detail}`,
    `**Messages** ${d.deletedCount} deleted of ${d.messageCount}`,
    `**Opened** <t:${Math.floor(d.createdAt.getTime() / 1000)}:F>`,
  ];
  if (d.decidedById)
    lines.push(`**Decision** ${decision.label} by <@${d.decidedById}> <t:${d.decidedAtUnix}:R>`);
  if (d.logMessageId) lines.push(link(d.guildId, d.logChannelId, d.logMessageId));
  if (d.sample) lines.push(`>>> ${clip(d.sample, 300)}`);
  text(c, lines.join('\n'));
  return c;
}

function suggestionCard(d) {
  const def = SUGGESTION_STATUSES[d.status];
  const up = d.votes.filter((v) => v.value === 1).length;
  const c = card({
    accent: def.color,
    title: `${inline('suggestion')} Suggestion #${pad(d.number)}`,
    subtitle: def.label,
  });
  divider(c);
  const lines = [
    `**Author** <@${d.authorId}> (${d.authorName})`,
    `**Votes** ${up} up · ${d.votes.length - up} down`,
    `**Posted** <t:${d.postedAtUnix}:R>`,
    link(d.guildId, d.channelId, d.messageId),
    `>>> ${clip(d.content, 500)}`,
  ];
  if (d.statusReason) lines.splice(3, 0, `**Reason** ${clip(d.statusReason, 300)}`);
  if (d.statusById) lines.splice(3, 0, `**Decided by** <@${d.statusById}>`);
  text(c, lines.join('\n'));
  return c;
}

function ticketCard(d) {
  const c = card({
    accent: MODULE_ACCENTS.tickets,
    title: `${inline('ticket')} Ticket #${pad(d.number)}`,
    subtitle: `${d.status === 'open' ? 'Open' : 'Closed'} · ${d.categoryLabel}`,
  });
  divider(c);
  const lines = [
    `**Opener** <@${d.openerId}> (${d.openerName})`,
    `**Opened** <t:${Math.floor(d.createdAt.getTime() / 1000)}:F>`,
  ];
  if (d.claimedById) lines.push(`**Claimed by** <@${d.claimedById}>`);
  if (d.status === 'open') lines.push(`**Channel** <#${d.channelId}>`);
  if (d.closedById) {
    lines.push(`**Closed by** <@${d.closedById}> <t:${d.closedAtUnix}:R>`);
    if (d.closeReason) lines.push(`**Reason** ${clip(d.closeReason, 300)}`);
  }
  for (const a of d.answers) lines.push(`**${clip(a.question, 60)}**\n${clip(a.answer, 300)}`);
  text(c, lines.join('\n'));
  return c;
}

function giveawayCard(d) {
  const c = card({
    accent: MODULE_ACCENTS.giveaways,
    title: `${inline('giveaway')} Giveaway #${pad(d.number)}`,
    subtitle: `${d.status[0].toUpperCase()}${d.status.slice(1)} · ${d.prize}`,
  });
  divider(c);
  const lines = [
    `**Host** <@${d.hostId}>`,
    `**Entries** ${d.entrants.length} · **Winners** ${d.winnerCount}`,
    d.endedAtUnix ? `**Ended** <t:${d.endedAtUnix}:F>` : `**Ends** <t:${d.endsAtUnix}:F>`,
  ];
  if (d.winners.length) lines.push(`**Won by** ${d.winners.map((w) => `<@${w}>`).join(', ')}`);
  if (d.cancelledById) lines.push(`**Cancelled by** <@${d.cancelledById}>`);
  if (d.messageId) lines.push(link(d.guildId, d.channelId, d.messageId));
  text(c, lines.join('\n'));
  return c;
}

const LOOKUPS = {
  infraction: [Infraction, infractionCard],
  suggestion: [Suggestion, suggestionCard],
  ticket: [Ticket, ticketCard],
  giveaway: [Giveaway, giveawayCard],
};

/**
 * /case <type> <number>: read-only lookup, shown only to the staff member who asked.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  if (!isStaff(interaction.member)) {
    return interaction.reply({ content: 'Staff only.', flags: MessageFlags.Ephemeral });
  }
  const type = interaction.options.getString('type', true);
  const number = interaction.options.getInteger('number', true);
  const [Model, build] = LOOKUPS[type];

  const doc = await Model.findOne({ guildId: interaction.guildId, number }).lean();
  if (!doc) {
    return interaction.reply({
      content: `No ${type} with number ${number}.`,
      flags: MessageFlags.Ephemeral,
    });
  }
  return interaction.reply(render(build(doc), { name: `case-${type}`, ephemeral: true }));
}
