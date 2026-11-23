import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { EMOJI, resolveAll } from '../../config/emoji.js';
import { encode } from '../../lib/customId.js';
import * as settings from '../../lib/settings.js';
import { render } from '../../lib/ui/card.js';
import { buildSettingsCard } from './panel.js';

const say = (interaction, content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

const view = (interaction, page = 0) =>
  interaction.update(render(buildSettingsCard(interaction.guild, page), { name: 'settings' }));

async function staffroles(interaction) {
  await settings.set(
    interaction.guildId,
    'staff.roleIds',
    [...interaction.values],
    interaction.user,
  );
  await view(interaction);
}

/** Emoji select: ask for the application/guild emoji name to use for this key. */
async function emojipick(interaction) {
  const key = interaction.values[0];
  if (!EMOJI[key]) return say(interaction, 'Unknown emoji key.');
  const current = settings.get(interaction.guildId).emoji?.[key] ?? '';
  await interaction.showModal(
    new ModalBuilder()
      .setCustomId(encode('settings', 'emojisubmit', key))
      .setTitle(`Emoji: ${key}`.slice(0, 45))
      .addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('name')
            .setLabel(`Emoji name (default ${EMOJI[key].name}); blank resets`)
            .setStyle(TextInputStyle.Short)
            .setRequired(false)
            .setMaxLength(32)
            .setValue(current),
        ),
      ),
  );
}

/** Save or clear an override, then re-resolve so the change shows up without a restart. */
async function emojisubmit(interaction, [key]) {
  if (!EMOJI[key]) return say(interaction, 'Unknown emoji key.');
  const name = interaction.fields.getTextInputValue('name').trim();
  if (name && !/^\w{2,32}$/.test(name)) {
    return say(interaction, 'Emoji names are 2 to 32 letters, numbers or underscores.');
  }
  const next = { ...(settings.get(interaction.guildId).emoji ?? {}) };
  if (name) next[key] = name;
  else delete next[key];
  await settings.set(interaction.guildId, 'emoji', next, interaction.user);
  await resolveAll(interaction.client, next);
  await view(interaction, pageOf(key));
}

/** Re-scan after uploading emoji, so a restart is not needed. */
async function emojirescan(interaction, [page]) {
  await interaction.deferUpdate();
  await resolveAll(interaction.client, settings.get(interaction.guildId).emoji ?? {});
  await interaction.editReply(
    render(buildSettingsCard(interaction.guild, Number(page) || 0), { name: 'settings' }),
  );
}

const emojipage = (interaction, [page]) => view(interaction, Number(page) || 0);

const pageOf = (key) => Math.floor(Object.keys(EMOJI).indexOf(key) / 20);

export default {
  name: 'settings',
  panel: (interaction) => buildSettingsCard(interaction.guild, 0),
  summary: (s) => `${s.staff.roleIds.length} staff role${s.staff.roleIds.length === 1 ? '' : 's'}`,
  handlers: {
    staffroles,
    emojipick,
    emojisubmit,
    emojirescan,
    emojiprev: emojipage,
    emojinext: emojipage,
    home: (interaction) => view(interaction),
  },
};
