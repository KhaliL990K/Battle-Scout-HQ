import * as settings from '../../lib/settings.js';
import { render } from '../../lib/ui/card.js';
import * as builder from './builder.js';
import { buildChangelogCard } from './panel.js';
import * as templates from './templates.js';

const refresh = async (interaction) =>
  interaction.update(render(await buildChangelogCard(interaction.guild), { name: 'changelog' }));

const write = (interaction, path, value) =>
  settings.set(interaction.guildId, path, value, interaction.user);

async function channel(interaction) {
  await write(interaction, 'changelog.channelId', interaction.values[0]);
  await refresh(interaction);
}

async function pingrole(interaction) {
  await write(interaction, 'changelog.pingRoleId', interaction.values[0] ?? null);
  await refresh(interaction);
}

export default {
  name: 'changelog',
  panel: (interaction) => buildChangelogCard(interaction.guild),
  // The hub's "New changelog" button goes straight into the builder.
  quick: builder.newdraft,
  handlers: {
    ...builder,
    ...templates,
    channel,
    pingrole,
    home: refresh,
  },
};
