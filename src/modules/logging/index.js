import { MessageFlags } from 'discord.js';
import { LOG_EVENT_TYPES } from '../../config/constants.js';
import * as settings from '../../lib/settings.js';
import { render } from '../../lib/ui/card.js';
import { logEvent } from './logEvent.js';
import { buildLogsCard } from './panel.js';
import { startQueue } from './queue.js';

/** Paths written by housekeeping that would only add noise to the log. */
const SILENT_PATHS = new Set(['staff.hubChannelId', 'staff.hubMessageId']);

const fmt = (v) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s === undefined ? '—' : `\`${s.length > 200 ? `${s.slice(0, 199)}…` : s}\``;
};

/** Re-render the Logs card in place after a change. */
const refresh = (interaction) =>
  interaction.update(render(buildLogsCard(interaction.guildId), { name: 'logs' }));

async function power(interaction) {
  const enabled = !settings.get(interaction.guildId).logging.enabled;
  await settings.set(interaction.guildId, 'logging.enabled', enabled, interaction.user);
  await refresh(interaction);
}

async function channel(interaction) {
  await settings.set(
    interaction.guildId,
    'logging.channelId',
    interaction.values[0],
    interaction.user,
  );
  await refresh(interaction);
}

async function events(interaction) {
  const next = Object.fromEntries(
    Object.keys(LOG_EVENT_TYPES).map((key) => [key, interaction.values.includes(key)]),
  );
  await settings.set(interaction.guildId, 'logging.events', next, interaction.user);
  await refresh(interaction);
}

async function test(interaction) {
  const { channelId } = settings.get(interaction.guildId).logging;
  if (!channelId) {
    await interaction.reply({ content: 'Set a log channel first.', flags: MessageFlags.Ephemeral });
    return;
  }
  await logEvent({
    type: 'settingsChange',
    title: 'Test entry',
    description: 'If you can read this, the log channel is wired up correctly.',
    actor: interaction.user,
    force: true,
  });
  await interaction.reply({ content: 'Test entry queued.', flags: MessageFlags.Ephemeral });
}

export default {
  name: 'logging',
  panel: (interaction) => buildLogsCard(interaction.guildId),
  init(client) {
    startQueue(client);
    // Every settings write, from any module, becomes a grey log entry.
    settings.onSettingsChange(async ({ guildId, path, before, value, actor }) => {
      if (SILENT_PATHS.has(path)) return;
      await logEvent({
        type: 'settingsChange',
        title: 'Setting changed',
        actor,
        guildId,
        fields: [
          { name: 'Setting', value: `\`${path}\`` },
          { name: 'Before', value: fmt(before) },
          { name: 'After', value: fmt(value) },
        ],
      });
    });
  },
  handlers: { power, channel, events, test },
};
