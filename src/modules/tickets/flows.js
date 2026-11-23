import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { TICKET_LIMITS } from '../../config/constants.js';
import { encode } from '../../lib/customId.js';
import * as settings from '../../lib/settings.js';
import { Ticket } from '../../models/Ticket.js';
import { closeTicket, addTicketUser, createTicket, isTicketStaff, toggleClaim } from './service.js';
import { STRINGS } from './strings.js';
import { renderTicketCard, renderTicketPanel } from './view.js';

const say = (interaction, content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

const findCategory = (guildId, key) =>
  settings.get(guildId).tickets.categories.find((c) => c.key === key);

/**
 * A select menu keeps showing the chosen option, which would stop the same category from being
 * picked twice. Re-sending the panel resets it for everyone.
 */
async function resetPanel(interaction) {
  const cats = settings.get(interaction.guildId).tickets.categories;
  await interaction.message?.edit(renderTicketPanel(cats)).catch(() => null);
}

/** Category select (public): refuse a duplicate early, otherwise ask the category's questions. */
export async function open(interaction) {
  const cfg = settings.get(interaction.guildId).tickets;
  const cat = findCategory(interaction.guildId, interaction.values[0]);
  if (!cat) return say(interaction, STRINGS.outOfDate);
  if (!cfg.categoryId) return say(interaction, STRINGS.notConfigured);

  const existing = await Ticket.findOne({
    guildId: interaction.guildId,
    openerId: interaction.user.id,
    categoryKey: cat.key,
    status: 'open',
  }).lean();
  if (existing?.channelId) {
    await say(interaction, STRINGS.alreadyOpen(existing.channelId));
    return resetPanel(interaction);
  }

  const modal = new ModalBuilder()
    .setCustomId(encode('tickets', 'submit', cat.key))
    .setTitle(cat.label.slice(0, 45))
    .addComponents(
      cat.questions
        .slice(0, TICKET_LIMITS.maxQuestions)
        .map((q, i) =>
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId(`q${i}`)
              .setLabel(q.slice(0, TICKET_LIMITS.maxLabelChars))
              .setStyle(TextInputStyle.Paragraph)
              .setMaxLength(TICKET_LIMITS.answerMaxChars)
              .setRequired(true),
          ),
        ),
    );
  await interaction.showModal(modal);
}

/** Question modal submit: create the ticket channel and point the member at it. */
export async function submit(interaction, [key]) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const cat = findCategory(interaction.guildId, key);
  if (!cat) return interaction.editReply({ content: STRINGS.outOfDate });

  const answers = cat.questions.slice(0, TICKET_LIMITS.maxQuestions).map((question, i) => ({
    question,
    answer: interaction.fields.getTextInputValue(`q${i}`).trim(),
  }));
  const { ticket, existing } = await createTicket(interaction, cat, answers);
  await resetPanel(interaction);
  await interaction.editReply({
    content: existing ? STRINGS.alreadyOpen(ticket.channelId) : STRINGS.created(ticket.channelId),
  });
}

/** Load the open ticket a control belongs to, replying if it is gone. */
async function openTicket(interaction, id) {
  const ticket = await Ticket.findById(id).lean();
  if (!ticket || ticket.status !== 'open') {
    await say(interaction, STRINGS.alreadyClosed);
    return null;
  }
  return ticket;
}

/** Claim / Release button (ticket staff). */
export async function claim(interaction, [id]) {
  if (!isTicketStaff(interaction.member)) return say(interaction, STRINGS.notStaff);
  const { doc, note, changed } = await toggleClaim(id, interaction.user.id);
  if (!changed) return say(interaction, note);
  await interaction.update(renderTicketCard(doc));
  await interaction.channel.send({ content: note, allowedMentions: { parse: [] } });
}

/** Add-user select (ticket staff). */
export async function adduser(interaction, [id]) {
  if (!isTicketStaff(interaction.member)) return say(interaction, STRINGS.notStaff);
  const ticket = await openTicket(interaction, id);
  if (!ticket) return;

  const user = interaction.users.first();
  const doc = await addTicketUser(interaction.channel, ticket, user);
  // Updating the card also clears the select menu's remembered choice.
  await interaction.update(renderTicketCard(doc));
  await interaction.channel.send({
    content: STRINGS.added(user.id),
    allowedMentions: { users: [user.id] },
  });
}

/** Close button (opener or ticket staff): ask for an optional reason. */
export async function close(interaction, [id]) {
  const ticket = await openTicket(interaction, id);
  if (!ticket) return;
  if (ticket.openerId !== interaction.user.id && !isTicketStaff(interaction.member)) {
    return say(interaction, STRINGS.notStaff);
  }
  await interaction.showModal(
    new ModalBuilder()
      .setCustomId(encode('tickets', 'closesubmit', id))
      .setTitle('Close this ticket')
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('reason')
            .setLabel('Reason (optional)')
            .setStyle(TextInputStyle.Paragraph)
            .setMaxLength(500)
            .setRequired(false),
        ),
      ),
  );
}

/** Close modal submit: re-check who is asking, then run the close pipeline. */
export async function closesubmit(interaction, [id]) {
  const ticket = await Ticket.findById(id).lean();
  if (ticket && ticket.openerId !== interaction.user.id && !isTicketStaff(interaction.member)) {
    return say(interaction, STRINGS.notStaff);
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const reason = interaction.fields.getTextInputValue('reason').trim() || null;
  const closed = await closeTicket(interaction.client, id, interaction.user, reason);
  await interaction.editReply({ content: closed ? 'Ticket closed.' : STRINGS.alreadyClosed });
}
