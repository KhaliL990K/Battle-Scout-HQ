import { Events, MessageFlags } from 'discord.js';
import { commands } from '../commands/index.js';
import { env } from '../config/env.js';
import { decode } from '../lib/customId.js';
import { reportInteractionError } from '../lib/errors.js';
import { isStaff } from '../lib/permissions.js';
import { getModule } from '../modules/registry.js';

export const name = Events.InteractionCreate;

const reply = (interaction, content) =>
  interaction.reply({ content, flags: MessageFlags.Ephemeral });

/** Resolve `module:action:params` to a handler and run it behind the permission check. */
async function routeComponent(interaction) {
  const { module, action, params } = decode(interaction.customId);
  const mod = getModule(module);
  const handler = mod?.handlers?.[action];

  if (!handler) {
    await reply(interaction, 'This control is out of date. Open the hub again.');
    return;
  }
  // A custom id is public: re-check permissions on every call, not just when the panel opens.
  if (!mod.publicActions?.includes(action) && !isStaff(interaction.member)) {
    await reply(interaction, 'Staff only.');
    return;
  }
  try {
    await handler(interaction, params);
  } catch (err) {
    await reportInteractionError(interaction, err, { module, action });
  }
}

async function routeCommand(interaction) {
  const command = commands.get(interaction.commandName);
  if (!command) {
    await reply(interaction, 'Unknown command.');
    return;
  }
  try {
    await command.execute(interaction);
  } catch (err) {
    await reportInteractionError(interaction, err, {
      module: 'commands',
      action: interaction.commandName,
    });
  }
}

/**
 * The single interaction router. No module registers its own interactionCreate listener.
 * @param {import('discord.js').Interaction} interaction
 */
export async function execute(interaction) {
  if (interaction.guildId !== env.GUILD_ID) return;
  if (interaction.isChatInputCommand()) return routeCommand(interaction);
  if (interaction.isMessageComponent() || interaction.isModalSubmit()) {
    return routeComponent(interaction);
  }
}
