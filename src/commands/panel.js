import {
  InteractionContextType,
  MessageFlags,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from 'discord.js';
import { DISCORD_ERR, isDiscordError } from '../lib/errors.js';
import { isAdmin } from '../lib/permissions.js';
import * as settings from '../lib/settings.js';
import { markIgnored } from '../modules/logging/queue.js';
import { renderHub } from '../modules/panels/hub.js';

export const data = new SlashCommandBuilder()
  .setName('panel')
  .setDescription('Post or refresh the staff hub in this channel')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .setContexts(InteractionContextType.Guild);

/** Remove the previous hub so there is only ever one. Missing message/channel is fine. */
async function removeOldHub(client, { hubChannelId, hubMessageId }) {
  if (!hubChannelId || !hubMessageId) return;
  try {
    const channel = await client.channels.fetch(hubChannelId);
    markIgnored(hubMessageId);
    await channel.messages.delete(hubMessageId);
  } catch (err) {
    if (!isDiscordError(err, DISCORD_ERR.unknownChannel, DISCORD_ERR.unknownMessage)) throw err;
  }
}

/**
 * /panel: post a fresh hub. Always a new message, never an edit, because a Components V2
 * message cannot be converted to or from a classic one.
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 */
export async function execute(interaction) {
  if (!isAdmin(interaction.member)) {
    await interaction.reply({ content: 'Admins only.', flags: MessageFlags.Ephemeral });
    return;
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const { guildId, client } = interaction;
  await removeOldHub(client, settings.get(guildId).staff);

  const message = await interaction.channel.send(renderHub(client, guildId));
  await settings.set(guildId, 'staff.hubChannelId', interaction.channelId, interaction.user);
  await settings.set(guildId, 'staff.hubMessageId', message.id, interaction.user);

  await interaction.editReply({ content: `Staff hub posted: ${message.url}` });
}
