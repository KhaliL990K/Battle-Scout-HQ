import {
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { isStaff } from '../lib/permissions.js';
import { StickyMessage } from '../models/StickyMessage.js';
import { clearSticky } from '../modules/sticky/engine.js';
import { stickyModal } from '../modules/sticky/index.js';

export const data = new SlashCommandBuilder()
  .setName('sticky')
  .setDescription('Set or clear the sticky message in this channel')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((s) => s.setName('set').setDescription('Create or edit the sticky here'))
  .addSubcommand((s) => s.setName('clear').setDescription('Remove the sticky from this channel'));

const say = (interaction, content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

/**
 * /sticky set|clear for the current channel. `set` opens the same modal as the panel.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  if (!isStaff(interaction.member)) return say(interaction, 'Staff only.');
  const { guildId, channelId } = interaction;

  if (interaction.options.getSubcommand() === 'set') {
    const existing = await StickyMessage.findOne({ guildId, channelId, active: true }).lean();
    return interaction.showModal(stickyModal(channelId, existing ?? {}));
  }
  const removed = await clearSticky(guildId, channelId);
  return say(interaction, removed ? 'Sticky removed.' : 'There is no sticky in this channel.');
}
