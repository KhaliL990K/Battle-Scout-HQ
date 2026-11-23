import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { AUTOMOD_LIMITS, AUTOMOD_SIGNALS, MAX_TIMEOUT_HOURS } from '../../config/constants.js';
import { env } from '../../config/env.js';
import { encode } from '../../lib/customId.js';
import * as settings from '../../lib/settings.js';
import { render } from '../../lib/ui/card.js';
import { startPruner } from './buffer.js';
import { getConfig, thresholdsOf } from './config.js';
import { pruneActed } from './pipeline.js';
import { buildAutomodCard } from './panel.js';
import * as review from './review.js';
import { STRINGS } from './strings.js';

const say = (interaction, content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

const refresh = async (interaction) =>
  interaction.update(render(await buildAutomodCard(interaction.guild), { name: 'automod' }));

const write = (interaction, path, value) =>
  settings.set(interaction.guildId, path, value, interaction.user);

const writeThresholds = (interaction, cfg) =>
  write(interaction, 'automod.thresholds', thresholdsOf(cfg));

async function power(interaction) {
  await write(interaction, 'automod.enabled', !getConfig(interaction.guildId).enabled);
  await refresh(interaction);
}

async function dryrun(interaction) {
  await write(interaction, 'automod.dryRun', !getConfig(interaction.guildId).dryRun);
  await refresh(interaction);
}

async function dmtoggle(interaction) {
  await write(interaction, 'automod.dmMember', !getConfig(interaction.guildId).dmMember);
  await refresh(interaction);
}

async function signals(interaction) {
  const cfg = getConfig(interaction.guildId);
  cfg.signals = Object.fromEntries(
    Object.keys(AUTOMOD_SIGNALS).map((k) => [k, interaction.values.includes(k)]),
  );
  await writeThresholds(interaction, cfg);
  await refresh(interaction);
}

async function exempt(interaction) {
  await write(interaction, 'automod.exemptRoleIds', [...interaction.values]);
  await refresh(interaction);
}

async function honeypot(interaction) {
  await write(interaction, 'automod.honeypotChannelId', interaction.values[0] ?? null);
  await refresh(interaction);
}

async function quarantinerole(interaction) {
  await write(interaction, 'automod.quarantineRoleId', interaction.values[0] ?? null);
  await refresh(interaction);
}

const input = (id, label, value, { max = 6 } = {}) =>
  new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(max)
      .setValue(String(value)),
  );

/**
 * Read whole numbers from a modal, each inside its range.
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 * @param {Record<string, [number, number]>} ranges field id -> [min, max]
 * @returns {Record<string, number>|null} null when anything is out of range
 */
function readNumbers(interaction, ranges) {
  const out = {};
  for (const [id, [min, max]] of Object.entries(ranges)) {
    const raw = interaction.fields.getTextInputValue(id).trim();
    const n = Number(raw);
    if (!/^\d+$/.test(raw) || n < min || n > max) return null;
    out[id] = n;
  }
  return out;
}

const TIMING = {
  timeoutHours: [1, MAX_TIMEOUT_HOURS],
  lookbackMinutes: [1, AUTOMOD_LIMITS.maxLookbackMinutes],
};
const THRESHOLDS = {
  channels: [2, 10],
  windowSec: [10, 600],
  count: [2, 30],
  seconds: [1, 60],
  max: [1, 50],
};
const LINKS = { accountAgeHours: [1, 8760], joinAgeHours: [1, 720] };

const timing = (interaction) => {
  const cfg = getConfig(interaction.guildId);
  return interaction.showModal(
    new ModalBuilder()
      .setCustomId(encode('automod', 'timingsubmit'))
      .setTitle('Timeout and memory')
      .addComponents(
        input('timeoutHours', `Timeout hours (1 to ${MAX_TIMEOUT_HOURS})`, cfg.timeoutHours),
        input(
          'lookbackMinutes',
          `Message memory in minutes (1 to ${AUTOMOD_LIMITS.maxLookbackMinutes})`,
          cfg.lookbackMinutes,
        ),
      ),
  );
};

async function timingsubmit(interaction) {
  const n = readNumbers(interaction, TIMING);
  if (!n) return say(interaction, STRINGS.badNumbers);
  await write(interaction, 'automod.timeoutHours', n.timeoutHours);
  await write(interaction, 'automod.lookbackMinutes', n.lookbackMinutes);
  await refresh(interaction);
}

const thresholds = (interaction) => {
  const cfg = getConfig(interaction.guildId);
  return interaction.showModal(
    new ModalBuilder()
      .setCustomId(encode('automod', 'thresholdssubmit'))
      .setTitle('Thresholds')
      .addComponents(
        input('channels', 'Duplicate: channels (2 to 10)', cfg.crossChannel.channels),
        input('windowSec', 'Duplicate: window in seconds (10 to 600)', cfg.crossChannel.windowSec),
        input('count', 'Rapid: messages (2 to 30)', cfg.rapidRepeat.count),
        input('seconds', 'Rapid: within seconds (1 to 60)', cfg.rapidRepeat.seconds),
        input('max', 'Mentions allowed per message (1 to 50)', cfg.massMention.max),
      ),
  );
};

async function thresholdssubmit(interaction) {
  const n = readNumbers(interaction, THRESHOLDS);
  if (!n) return say(interaction, STRINGS.badNumbers);
  const cfg = getConfig(interaction.guildId);
  cfg.crossChannel = { channels: n.channels, windowSec: n.windowSec };
  cfg.rapidRepeat = { count: n.count, seconds: n.seconds };
  cfg.massMention = { max: n.max };
  await writeThresholds(interaction, cfg);
  await refresh(interaction);
}

const linkrules = (interaction) => {
  const r = getConfig(interaction.guildId).riskyLink;
  return interaction.showModal(
    new ModalBuilder()
      .setCustomId(encode('automod', 'linkrulessubmit'))
      .setTitle('Link rules')
      .addComponents(
        input('accountAgeHours', 'Flag accounts younger than (hours)', r.accountAgeHours, {
          max: 4,
        }),
        input('joinAgeHours', 'Flag members who joined under (hours)', r.joinAgeHours, { max: 3 }),
        input(
          'flagNoRoles',
          'Also flag members with no roles (yes/no)',
          r.flagNoRoles ? 'yes' : 'no',
          {
            max: 3,
          },
        ),
      ),
  );
};

async function linkrulessubmit(interaction) {
  const flag = interaction.fields.getTextInputValue('flagNoRoles').trim().toLowerCase();
  const n = readNumbers(interaction, LINKS);
  if (!n || !['yes', 'no'].includes(flag)) return say(interaction, STRINGS.badNumbers);
  const cfg = getConfig(interaction.guildId);
  cfg.riskyLink = { ...n, flagNoRoles: flag === 'yes' };
  await writeThresholds(interaction, cfg);
  await refresh(interaction);
}

export default {
  name: 'automod',
  panel: (interaction) => buildAutomodCard(interaction.guild),
  init() {
    startPruner(
      () => getConfig(env.GUILD_ID).lookbackMinutes * 60_000,
      (now) => pruneActed(now),
    );
  },
  handlers: {
    power,
    dryrun,
    dmtoggle,
    signals,
    exempt,
    honeypot,
    quarantinerole,
    timing,
    timingsubmit,
    thresholds,
    thresholdssubmit,
    linkrules,
    linkrulessubmit,
    ...review,
    home: refresh,
  },
};
