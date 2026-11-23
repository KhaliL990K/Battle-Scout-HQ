import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { SUGGESTION_LIMITS } from '../../config/constants.js';
import { encode } from '../../lib/customId.js';
import * as settings from '../../lib/settings.js';
import { render } from '../../lib/ui/card.js';
import { manage, reason, status } from './lifecycle.js';
import { vote, why, whysubmit } from './member.js';
import { buildSuggestionsCard } from './panel.js';
import { STRINGS } from './strings.js';

const say = (interaction, content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

/** Re-render the settings card in place after a change. */
async function refresh(interaction) {
  const c = await buildSuggestionsCard(interaction.guild);
  await interaction.update(render(c, { name: 'suggestions' }));
}

const write = (interaction, path, value) =>
  settings.set(interaction.guildId, path, value, interaction.user);

async function power(interaction) {
  const s = settings.get(interaction.guildId).suggestions;
  if (!s.enabled && !s.channelId) return say(interaction, STRINGS.channelNeeded);
  await write(interaction, 'suggestions.enabled', !s.enabled);
  await refresh(interaction);
}

async function channel(interaction) {
  await write(interaction, 'suggestions.channelId', interaction.values[0]);
  await refresh(interaction);
}

async function review(interaction) {
  await write(interaction, 'suggestions.reviewChannelId', interaction.values[0] ?? null);
  await refresh(interaction);
}

async function pingrole(interaction) {
  await write(interaction, 'suggestions.pingRoleId', interaction.values[0] ?? null);
  await refresh(interaction);
}

async function ignorestaff(interaction) {
  const s = settings.get(interaction.guildId).suggestions;
  await write(interaction, 'suggestions.ignoreStaff', !s.ignoreStaff);
  await refresh(interaction);
}

const numberInput = (id, label, value, max) =>
  new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId(id)
      .setLabel(`${label} (0 to ${max})`)
      .setStyle(TextInputStyle.Short)
      .setValue(String(value))
      .setRequired(true)
      .setMaxLength(5),
  );

async function limits(interaction) {
  const s = settings.get(interaction.guildId).suggestions;
  await interaction.showModal(
    new ModalBuilder()
      .setCustomId(encode('suggestions', 'limitsubmit'))
      .setTitle('Suggestion limits')
      .addComponents(
        numberInput('minLength', 'Minimum characters', s.minLength, SUGGESTION_LIMITS.maxMinLength),
        numberInput(
          'cooldownSec',
          'Cooldown in seconds',
          s.cooldownSec,
          SUGGESTION_LIMITS.maxCooldownSec,
        ),
        numberInput(
          'pingCooldownMin',
          'Minutes between role pings',
          s.pingCooldownMin,
          SUGGESTION_LIMITS.maxPingCooldownMin,
        ),
      ),
  );
}

/** Parse a whole number inside [0, max]; null when it is anything else. */
const parseBounded = (raw, max) => {
  const n = Number(raw.trim());
  return Number.isInteger(n) && n >= 0 && n <= max ? n : null;
};

async function limitsubmit(interaction) {
  const minLength = parseBounded(
    interaction.fields.getTextInputValue('minLength'),
    SUGGESTION_LIMITS.maxMinLength,
  );
  const cooldownSec = parseBounded(
    interaction.fields.getTextInputValue('cooldownSec'),
    SUGGESTION_LIMITS.maxCooldownSec,
  );
  const pingCooldownMin = parseBounded(
    interaction.fields.getTextInputValue('pingCooldownMin'),
    SUGGESTION_LIMITS.maxPingCooldownMin,
  );
  if (minLength === null || cooldownSec === null || pingCooldownMin === null) {
    return say(interaction, STRINGS.badLimits);
  }

  await write(interaction, 'suggestions.minLength', minLength);
  await write(interaction, 'suggestions.cooldownSec', cooldownSec);
  await write(interaction, 'suggestions.pingCooldownMin', pingCooldownMin);
  await refresh(interaction);
}

export default {
  name: 'suggestions',
  // Members vote, explain and answer the Why modal; everything else is staff-only and the
  // router rejects non-staff before the handler runs.
  publicActions: ['vote', 'why', 'whysubmit'],
  panel: (interaction) => buildSuggestionsCard(interaction.guild),
  handlers: {
    vote,
    why,
    whysubmit,
    manage,
    status,
    reason,
    power,
    channel,
    review,
    ignorestaff,
    pingrole,
    limits,
    limitsubmit,
  },
};
