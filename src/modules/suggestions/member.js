import {
  ActionRowBuilder,
  ContainerBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { LOG_COLORS, SUGGESTION_LIMITS } from '../../config/constants.js';
import { inline } from '../../config/emoji.js';
import { encode } from '../../lib/customId.js';
import { DISCORD_ERR, isDiscordError } from '../../lib/errors.js';
import { text } from '../../lib/ui/card.js';
import { Suggestion } from '../../models/Suggestion.js';
import { STRINGS } from './strings.js';
import { renderSuggestion } from './view.js';

const ephemeral = (content) => ({ content, flags: MessageFlags.Ephemeral });

/**
 * Toggle or switch a member's vote in one atomic pipeline update, so two simultaneous clicks
 * can never leave a user with two votes. Same side again removes the vote; the other side
 * replaces it.
 * @param {string} id suggestion _id
 * @param {string} userId
 * @param {1|-1} value
 */
export function applyVote(id, userId, value) {
  const mine = {
    $filter: { input: '$votes', as: 'v', cond: { $eq: ['$$v.userId', userId] } },
  };
  const others = {
    $filter: { input: '$votes', as: 'v', cond: { $ne: ['$$v.userId', userId] } },
  };
  return Suggestion.findOneAndUpdate(
    { _id: id },
    [
      {
        $set: {
          votes: {
            $let: {
              vars: { mine, others },
              in: {
                $cond: [
                  { $in: [value, '$$mine.value'] },
                  '$$others',
                  { $concatArrays: ['$$others', [{ userId, value }]] },
                ],
              },
            },
          },
        },
      },
    ],
    { returnDocument: 'after', updatePipeline: true },
  ).lean();
}

/** 👍 / 👎 button: `suggestions:vote:<up|down>:<id>`. */
export async function vote(interaction, [direction, id]) {
  const doc = await applyVote(id, interaction.user.id, direction === 'up' ? 1 : -1);
  if (!doc) return interaction.reply(ephemeral(STRINGS.missing));
  await interaction.update(renderSuggestion(doc));
}

/** Why button: ask for a short reason in a modal. */
export async function why(interaction, [id]) {
  const modal = new ModalBuilder()
    .setCustomId(encode('suggestions', 'whysubmit', id))
    .setTitle('Why do you feel this way?')
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('reason')
          .setLabel('Your reason')
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder(STRINGS.whyPlaceholder)
          .setMinLength(3)
          .setMaxLength(SUGGESTION_LIMITS.reasonMaxChars)
          .setRequired(true),
      ),
    );
  await interaction.showModal(modal);
}

/** Why modal submit: post the reason in the thread, attributed and tagged with their vote. */
export async function whysubmit(interaction, [id]) {
  const doc = await Suggestion.findById(id).lean();
  if (!doc) return interaction.reply(ephemeral(STRINGS.missing));
  if (!doc.threadId) return interaction.reply(ephemeral(STRINGS.noThread));

  const reason = interaction.fields.getTextInputValue('reason').trim();
  const myVote = doc.votes.find((v) => v.userId === interaction.user.id)?.value ?? 0;
  const label = { 1: ['voteUp', 'voted for'], '-1': ['voteDown', 'voted against'] }[myVote];
  const accent = myVote === 1 ? LOG_COLORS.green : myVote === -1 ? LOG_COLORS.red : LOG_COLORS.grey;
  const head = label
    ? `${inline(label[0])} <@${interaction.user.id}> ${label[1]} this`
    : `${inline('why')} <@${interaction.user.id}> shared a thought`;

  const container = new ContainerBuilder().setAccentColor(accent);
  text(container, `${head}\n>>> ${reason}`);

  try {
    const thread = await interaction.client.channels.fetch(doc.threadId);
    await thread.send({
      components: [container],
      flags: MessageFlags.IsComponentsV2,
      allowedMentions: { parse: [] },
    });
  } catch (err) {
    if (!isDiscordError(err, DISCORD_ERR.unknownChannel)) throw err;
    return interaction.reply(ephemeral(STRINGS.noThread));
  }
  await interaction.reply(ephemeral(STRINGS.whyPosted));
}
