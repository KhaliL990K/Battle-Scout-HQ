import * as settings from '../../lib/settings.js';
import { render } from '../../lib/ui/card.js';
import * as flows from './flows.js';
import { buildAnnouncementsCard } from './panel.js';

const refresh = async (interaction) =>
  interaction.update(
    render(await buildAnnouncementsCard(interaction.guild), { name: 'announcements' }),
  );

const write = (interaction, path, value) =>
  settings.set(interaction.guildId, path, value, interaction.user);

async function defaultchannel(interaction) {
  await write(interaction, 'announcements.channelId', interaction.values[0] ?? null);
  await refresh(interaction);
}

async function defaultping(interaction) {
  await write(interaction, 'announcements.pingRoleId', interaction.values[0] ?? null);
  await refresh(interaction);
}

export default {
  name: 'announcements',
  panel: (interaction) => buildAnnouncementsCard(interaction.guild),
  // The hub's "New announcement" button opens the compose modal directly.
  quick: flows.newdraft,
  handlers: { ...flows, defaultchannel, defaultping, home: refresh },
};
