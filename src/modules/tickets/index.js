import { MessageFlags } from 'discord.js';
import * as settings from '../../lib/settings.js';
import { render } from '../../lib/ui/card.js';
import * as categories from './categories.js';
import * as flows from './flows.js';
import { buildTicketsCard } from './panel.js';
import { postTicketPanel } from './publish.js';
import { sweepClosedTickets } from './service.js';
import { STRINGS } from './strings.js';

const say = (interaction, content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

const refresh = (interaction) =>
  interaction.update(render(buildTicketsCard(interaction.guild), { name: 'tickets' }));

const write = (interaction, path, value) =>
  settings.set(interaction.guildId, path, value, interaction.user);

async function panelchannel(interaction) {
  const t = settings.get(interaction.guildId).tickets;
  // A different channel means the old panel message no longer belongs to this setting.
  if (t.panelChannelId !== interaction.values[0]) {
    await write(interaction, 'tickets.panelMessageId', null);
  }
  await write(interaction, 'tickets.panelChannelId', interaction.values[0]);
  await refresh(interaction);
}

async function parent(interaction) {
  await write(interaction, 'tickets.categoryId', interaction.values[0]);
  await refresh(interaction);
}

async function roles(interaction) {
  await write(interaction, 'tickets.staffRoleIds', [...interaction.values]);
  await refresh(interaction);
}

async function transcript(interaction) {
  await write(interaction, 'tickets.transcriptChannelId', interaction.values[0] ?? null);
  await refresh(interaction);
}

async function postpanel(interaction) {
  const t = settings.get(interaction.guildId).tickets;
  if (!t.panelChannelId) return say(interaction, 'Pick a channel for the ticket panel first.');
  if (!t.categories.length) return say(interaction, STRINGS.noCategories);
  await interaction.deferUpdate();
  await postTicketPanel(interaction.client, interaction.guildId, interaction.user);
  await interaction.editReply(render(buildTicketsCard(interaction.guild), { name: 'tickets' }));
}

export default {
  name: 'tickets',
  // Members open and close tickets; staff-only controls re-check ticket staff themselves
  // because ticket staff can include roles the general staff check does not know about.
  publicActions: ['open', 'submit', 'claim', 'adduser', 'close', 'closesubmit'],
  panel: (interaction) => buildTicketsCard(interaction.guild),
  init: (client) => sweepClosedTickets(client),
  handlers: {
    ...flows,
    ...categories,
    panelchannel,
    parent,
    roles,
    transcript,
    postpanel,
    home: refresh,
  },
};
