import { MessageFlags } from 'discord.js';
import { render } from '../../lib/ui/card.js';
import { getModule } from '../registry.js';
import { findPanel } from './catalog.js';
import { placeholderCard, renderHub } from './hub.js';

/** True when the component lives on an ephemeral message, i.e. we should edit in place. */
const onEphemeral = (interaction) => interaction.message?.flags.has(MessageFlags.Ephemeral);

/**
 * Open a sub-panel: reply with a new ephemeral message from the public hub, or edit in place
 * when already inside an ephemeral panel so staff never accumulate stale messages.
 */
async function nav(interaction, params) {
  const key = interaction.isStringSelectMenu() ? interaction.values[0] : params[0];
  const def = findPanel(key);
  if (!def) throw new Error(`Unknown panel key: ${key}`);

  const mod = getModule(key);
  const c = mod?.panel ? await mod.panel(interaction) : placeholderCard(def);

  if (onEphemeral(interaction)) {
    await interaction.update(render(c, { name: key }));
  } else {
    await interaction.reply(render(c, { name: key, ephemeral: true }));
  }
}

/**
 * Hub quick buttons. A module that defines `quick` jumps straight into its main action (a
 * modal or picker); the rest just open their panel.
 */
async function quick(interaction, params) {
  const target = getModule(params[0]);
  if (target?.quick) return target.quick(interaction);
  return nav(interaction, params);
}

/** Back to hub / Refresh: re-render the hub in place. */
async function home(interaction) {
  await interaction.update(renderHub(interaction.client, interaction.guildId));
}

export default {
  name: 'panels',
  handlers: { nav, quick, home, refresh: home },
};
