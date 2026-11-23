import {
  ActionRowBuilder,
  ContainerBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { LOG_COLORS, SUGGESTION_LIMITS, SUGGESTION_STATUSES } from '../../config/constants.js';
import { inline } from '../../config/emoji.js';
import { encode } from '../../lib/customId.js';
import { DISCORD_ERR, isDiscordError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { card, controls, divider, render, row, text } from '../../lib/ui/card.js';
import { stringSelect } from '../../lib/ui/components.js';
import { Suggestion } from '../../models/Suggestion.js';
import { logEvent } from '../logging/logEvent.js';
import { STRINGS } from './strings.js';
import { pad, renderSuggestion } from './view.js';

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });
const ACCENT = SUGGESTION_STATUSES.pending.color;

/** The Manage menu, shown ephemerally to the staff member who clicked. */
function manageCard(doc) {
  const current = SUGGESTION_STATUSES[doc.status];
  const c = card({
    accent: current.color,
    title: `${inline('manage')} Manage #${pad(doc.number)}`,
    subtitle: 'Pick a new status',
  });
  divider(c);
  row(c, { label: 'Current status', value: `${inline(current.emoji)} ${current.label}` });
  divider(c, { line: false });
  controls(c, {
    select: stringSelect({
      id: encode('suggestions', 'status', String(doc._id)),
      placeholder: 'Choose a status…',
      options: Object.entries(SUGGESTION_STATUSES).map(([value, def]) => ({
        label: def.label,
        value,
        emoji: def.emoji,
        description: def.reason ? 'Asks for a reason' : undefined,
        default: value === doc.status,
      })),
    }),
  });
  return c;
}

/** Plain confirmation that replaces the Manage menu once a status is applied. */
function doneCard(message) {
  const c = card({ accent: ACCENT, title: `${inline('statusApproved')} Done` });
  text(c, message);
  return c;
}

/** Manage button (staff only): open the ephemeral status menu. */
export async function manage(interaction, [id]) {
  const doc = await Suggestion.findById(id).lean();
  if (!doc) return interaction.reply(ephemeral(STRINGS.missing));
  await interaction.reply(render(manageCard(doc), { name: 'suggestion-manage', ephemeral: true }));
}

function reasonModal(id, status) {
  const def = SUGGESTION_STATUSES[status];
  return new ModalBuilder()
    .setCustomId(encode('suggestions', 'reason', id, status))
    .setTitle(`${def.label}: add a reason`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Reason (shown on the suggestion)')
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(3)
          .setMaxLength(SUGGESTION_LIMITS.reasonMaxChars)
          .setRequired(true),
      ),
    );
}

/** Status select: ask for a reason when the status needs one, otherwise apply straight away. */
export async function status(interaction, [id]) {
  const next = interaction.values[0];
  const def = SUGGESTION_STATUSES[next];
  if (!def) throw new Error(`Unknown suggestion status: ${next}`);
  if (def.reason) return interaction.showModal(reasonModal(id, next));

  await interaction.deferUpdate();
  const result = await applyStatus(interaction.client, id, next, null, interaction.user);
  await interaction.editReply(render(doneCard(result), { name: 'suggestion-done' }));
}

/** Reason modal submit: apply the status with the staff member's reason. */
export async function reason(interaction, [id, next]) {
  if (!SUGGESTION_STATUSES[next]) throw new Error(`Unknown suggestion status: ${next}`);
  await interaction.deferUpdate();
  const why = interaction.fields.getTextInputValue('reason').trim();
  const result = await applyStatus(interaction.client, id, next, why, interaction.user);
  await interaction.editReply(render(doneCard(result), { name: 'suggestion-done' }));
}

/** Refresh the public card; a deleted message is reported, not fatal. */
async function refreshCard(client, doc) {
  try {
    const channel = await client.channels.fetch(doc.channelId);
    const message = await channel.messages.fetch(doc.messageId);
    await message.edit(renderSuggestion(doc));
    return true;
  } catch (err) {
    if (!isDiscordError(err, DISCORD_ERR.unknownChannel, DISCORD_ERR.unknownMessage)) throw err;
    return false;
  }
}

/** Announce the change in the thread and archive (never lock) it on a final status. */
async function updateThread(client, doc, def, actor, why) {
  if (!doc.threadId) return;
  try {
    const thread = await client.channels.fetch(doc.threadId);
    const container = new ContainerBuilder().setAccentColor(def.color);
    const reasonLine = why ? `\n>>> ${why}` : '';
    text(container, `${inline(def.emoji)} **${def.label}** by <@${actor.id}>${reasonLine}`);
    await thread.send({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
    if (def.final) await thread.setArchived(true);
  } catch (err) {
    if (!isDiscordError(err, DISCORD_ERR.unknownChannel, DISCORD_ERR.missingPermissions)) throw err;
    logger.warn({ err: err.message, threadId: doc.threadId }, 'Could not update suggestion thread');
  }
}

/**
 * Move a suggestion to a new status: persist, refresh the card, tell the thread, log it.
 * @param {import('discord.js').Client} client
 * @param {string} id suggestion _id
 * @param {keyof typeof SUGGESTION_STATUSES} next
 * @param {string|null} why
 * @param {import('discord.js').User} actor
 * @returns {Promise<string>} confirmation text for the staff member
 */
export async function applyStatus(client, id, next, why, actor) {
  const def = SUGGESTION_STATUSES[next];
  const doc = await Suggestion.findOneAndUpdate(
    { _id: id },
    {
      status: next,
      statusReason: why,
      statusById: actor.id,
      statusAtUnix: Math.floor(Date.now() / 1000),
    },
    { returnDocument: 'after' },
  ).lean();
  if (!doc) return STRINGS.missing;

  const refreshed = await refreshCard(client, doc);
  await updateThread(client, doc, def, actor, why);
  await logEvent({
    type: 'suggestionEvent',
    title: `Suggestion #${pad(doc.number)} ${def.label.toLowerCase()}`,
    color: next === 'implemented' ? LOG_COLORS.green : def.color,
    actor,
    target: { id: doc.authorId, username: doc.authorName },
    fields: [
      { name: 'Status', value: def.label },
      ...(why ? [{ name: 'Reason', value: why }] : []),
    ],
  });
  return refreshed
    ? STRINGS.statusSet(def.label)
    : `${STRINGS.statusSet(def.label)} ${STRINGS.messageGone}`;
}
