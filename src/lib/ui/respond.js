import { MessageFlags } from 'discord.js';
import { render } from './card.js';

/**
 * Show a card the way the panel rules want: edit in place when the interaction came from an
 * ephemeral panel message (so staff never accumulate stale messages), otherwise reply
 * ephemerally, which is what a click on the public hub needs so the hub itself is left alone.
 * @param {import('discord.js').MessageComponentInteraction|import('discord.js').ModalSubmitInteraction} interaction
 * @param {import('discord.js').ContainerBuilder|import('discord.js').ContainerBuilder[]} cards
 * @param {string} name panel name, used in limit errors
 * @returns {Promise<unknown>}
 */
export function showCard(interaction, cards, name) {
  const inEphemeral =
    Boolean(interaction.message?.flags?.has(MessageFlags.Ephemeral)) &&
    (interaction.isMessageComponent?.() || interaction.isFromMessage?.());
  if (inEphemeral) return interaction.update(render(cards, { name }));
  return interaction.reply(render(cards, { name, ephemeral: true }));
}
