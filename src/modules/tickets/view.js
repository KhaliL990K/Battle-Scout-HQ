import { ContainerBuilder, FileBuilder } from 'discord.js';
import { MODULE_ACCENTS } from '../../config/constants.js';
import { inline } from '../../config/emoji.js';
import { encode } from '../../lib/customId.js';
import { card, controls, divider, render, row, text } from '../../lib/ui/card.js';
import { button, ButtonStyle, stringSelect, userSelect } from '../../lib/ui/components.js';
import { STRINGS } from './strings.js';

/** Zero-padded display number: 117 -> "0117". */
export const pad = (n) => String(n).padStart(4, '0');

/**
 * The public ticket panel: one select menu of categories, so categories can grow freely.
 * @param {Array<{ key: string, label: string, description?: string }>} categories
 */
export function renderTicketPanel(categories) {
  const c = card({
    accent: MODULE_ACCENTS.tickets,
    title: `${inline('ticket')} ${STRINGS.panelTitle}`,
    subtitle: STRINGS.panelBody,
  });
  divider(c);
  controls(c, {
    select: stringSelect({
      id: encode('tickets', 'open'),
      placeholder: STRINGS.panelPlaceholder,
      options: categories.map((cat) => ({
        label: cat.label,
        value: cat.key,
        description: cat.description || undefined,
        emoji: 'ticket',
      })),
    }),
  });
  return render(c, { name: 'ticket-panel' });
}

/**
 * The control card pinned at the top of every ticket channel.
 * @param {object} ticket Ticket document
 * @param {{ closed?: boolean }} [opts]
 */
export function ticketCard(ticket, { closed = false } = {}) {
  const id = String(ticket._id);
  const c = card({
    accent: MODULE_ACCENTS.tickets,
    title: `${inline('ticket')} Ticket #${pad(ticket.number)}`,
    subtitle: `${ticket.categoryLabel} · opened by ${ticket.openerName}`,
  });
  divider(c);
  row(c, {
    label: 'Opened by',
    value: `<@${ticket.openerId}>`,
  });
  row(c, {
    label: 'Claimed by',
    value: ticket.claimedById ? `<@${ticket.claimedById}>` : 'Nobody yet',
  });
  for (const a of ticket.answers ?? []) {
    text(c, `**${a.question}**\n${a.answer || '*no answer*'}`);
  }
  divider(c, { line: false });
  if (closed) return c;

  controls(c, {
    select: userSelect({ id: encode('tickets', 'adduser', id), placeholder: 'Add a user…' }),
  });
  controls(c, {
    buttons: [
      button({
        id: encode('tickets', 'claim', id),
        label: ticket.claimedById ? 'Release' : 'Claim',
        emoji: 'shield',
        style: ButtonStyle.Primary,
      }),
      button({
        id: encode('tickets', 'close', id),
        label: 'Close',
        emoji: 'off',
        style: ButtonStyle.Danger,
      }),
    ],
  });
  return c;
}

/** Message options for the control card. */
export const renderTicketCard = (ticket, opts) =>
  render(ticketCard(ticket, opts), { name: 'ticket' });

/**
 * Card posted in the transcript channel; the HTML file rides along as an attachment.
 * @param {object} ticket
 * @param {string} fileName attachment name the card references
 * @param {string} closedBy user id
 */
export function renderTranscriptCard(ticket, fileName, closedBy) {
  const c = new ContainerBuilder().setAccentColor(MODULE_ACCENTS.tickets);
  text(
    c,
    `## ${inline('ticket')} Ticket #${pad(ticket.number)} closed\n` +
      `**Category** ${ticket.categoryLabel}\n**Opened by** <@${ticket.openerId}>\n` +
      `**Closed by** <@${closedBy}>\n**Reason** ${ticket.closeReason || '*none given*'}`,
  );
  c.addFileComponents(new FileBuilder().setURL(`attachment://${fileName}`));
  return render(c, { name: 'ticket-transcript' });
}
