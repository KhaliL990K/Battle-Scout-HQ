import {
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { Ticket } from '../models/Ticket.js';
import {
  addTicketUser,
  closeTicket,
  isTicketStaff,
  removeTicketUser,
} from '../modules/tickets/service.js';
import { STRINGS } from '../modules/tickets/strings.js';
import { renderTicketCard } from '../modules/tickets/view.js';

export const data = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Ticket helpers, used inside a ticket channel')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) =>
    s
      .setName('add')
      .setDescription('Add a user to this ticket')
      .addUserOption((o) => o.setName('user').setDescription('Who to add').setRequired(true)),
  )
  .addSubcommand((s) =>
    s
      .setName('remove')
      .setDescription('Remove a user from this ticket')
      .addUserOption((o) => o.setName('user').setDescription('Who to remove').setRequired(true)),
  )
  .addSubcommand((s) =>
    s
      .setName('close')
      .setDescription('Close this ticket')
      .addStringOption((o) =>
        o.setName('reason').setDescription('Why it is being closed').setMaxLength(500),
      ),
  );

const say = (interaction, content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

/**
 * /ticket add|remove|close, valid only inside an open ticket channel.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  if (!isTicketStaff(interaction.member)) return say(interaction, STRINGS.notStaff);
  const ticket = await Ticket.findOne({ channelId: interaction.channelId, status: 'open' }).lean();
  if (!ticket) return say(interaction, STRINGS.notTicket);

  const sub = interaction.options.getSubcommand();
  if (sub === 'close') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const closed = await closeTicket(
      interaction.client,
      String(ticket._id),
      interaction.user,
      interaction.options.getString('reason'),
    );
    return interaction.editReply({ content: closed ? 'Ticket closed.' : STRINGS.alreadyClosed });
  }

  const user = interaction.options.getUser('user', true);
  if (sub === 'add') {
    const doc = await addTicketUser(interaction.channel, ticket, user);
    await interaction.channel.messages
      .edit(ticket.controlMessageId, renderTicketCard(doc))
      .catch(() => null);
    return interaction.reply({
      content: STRINGS.added(user.id),
      allowedMentions: { users: [user.id] },
    });
  }
  const removed = await removeTicketUser(interaction.channel, ticket, user);
  return removed
    ? interaction.reply({ content: STRINGS.removed(user.id), allowedMentions: { parse: [] } })
    : say(interaction, 'The opener cannot be removed from their own ticket.');
}
