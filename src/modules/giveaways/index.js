import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { GIVEAWAY_LIMITS } from '../../config/constants.js';
import { encode } from '../../lib/customId.js';
import * as settings from '../../lib/settings.js';
import { render } from '../../lib/ui/card.js';
import { button, ButtonStyle } from '../../lib/ui/components.js';
import { pingProblem } from '../../lib/ui/ping.js';
import { showCard } from '../../lib/ui/respond.js';
import { Giveaway } from '../../models/Giveaway.js';
import { buildGiveawaysCard, buildManageCard } from './panel.js';
import { markDirty, runningCount, startScheduler } from './scheduler.js';
import {
  cancelGiveaway,
  endGiveaway,
  enter as addEntry,
  leave as removeEntry,
  loadGiveaway,
  parseDuration,
  rerollGiveaway,
  startGiveaway,
} from './service.js';
import { STRINGS } from './strings.js';
import { composerCard, durationHint, formatDuration, giveawayCard } from './view.js';

const say = (interaction, content) =>
  interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });

const field = (
  id,
  label,
  value,
  { style = TextInputStyle.Short, max, required = true, placeholder } = {},
) => {
  const input = new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(style)
    .setRequired(required)
    .setMaxLength(max);
  if (value) input.setValue(String(value));
  if (placeholder) input.setPlaceholder(placeholder);
  return new ActionRowBuilder().addComponents(input);
};

/** Prize, description, winners and duration. Shared by New and Edit. */
function detailsModal(customId, doc = {}) {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle('Giveaway')
    .addComponents(
      field('prize', 'Prize', doc.prize, { max: GIVEAWAY_LIMITS.prizeChars }),
      field('description', 'Description (optional)', doc.description, {
        style: TextInputStyle.Paragraph,
        max: GIVEAWAY_LIMITS.descriptionChars,
        required: false,
      }),
      field(
        'winners',
        `Number of winners (1 to ${GIVEAWAY_LIMITS.maxWinners})`,
        doc.winnerCount ?? 1,
        {
          max: 2,
        },
      ),
      field(
        'duration',
        'Duration',
        doc.durationSec ? formatDuration(doc.durationSec) : GIVEAWAY_LIMITS.defaultDuration,
        { max: 20, placeholder: durationHint },
      ),
    );
}

/** Read and validate the details modal; replies and returns null when something is off. */
async function readDetails(interaction) {
  const f = interaction.fields;
  const winnerCount = Number(f.getTextInputValue('winners').trim());
  if (
    !Number.isInteger(winnerCount) ||
    winnerCount < 1 ||
    winnerCount > GIVEAWAY_LIMITS.maxWinners
  ) {
    await say(interaction, STRINGS.badWinners(GIVEAWAY_LIMITS.maxWinners));
    return null;
  }
  const durationSec = parseDuration(f.getTextInputValue('duration'));
  if (!durationSec) {
    await say(
      interaction,
      STRINGS.badDuration(
        formatDuration(GIVEAWAY_LIMITS.minDurationSec),
        formatDuration(GIVEAWAY_LIMITS.maxDurationSec),
      ),
    );
    return null;
  }
  return {
    prize: f.getTextInputValue('prize').trim(),
    description: f.getTextInputValue('description').trim(),
    winnerCount,
    durationSec,
  };
}

/** The composer: the live preview stacked above its controls. */
const composer = (interaction, doc) =>
  showCard(
    interaction,
    [
      giveawayCard(doc),
      composerCard(doc, { problem: pingProblem(interaction.guild, doc.pingRoleId) }),
    ],
    'giveaway-composer',
  );

/** Open whatever fits a giveaway's state: the composer for drafts, the manage card otherwise. */
async function open(interaction, id, opts) {
  const doc = await loadGiveaway(id);
  // A discarded draft never ran, so there is nothing to manage.
  if (!doc || (doc.status === 'cancelled' && !doc.number)) return home(interaction);
  if (doc.status === 'draft') return composer(interaction, doc);
  return showCard(interaction, buildManageCard(doc, opts), 'giveaway-manage');
}

/** Load a draft for the composer controls, or reply why not. */
async function draftOf(interaction, id) {
  const doc = await loadGiveaway(id);
  if (!doc) await say(interaction, STRINGS.missing);
  else if (doc.status !== 'draft') await say(interaction, STRINGS.notDraft);
  else return doc;
  return null;
}

// ---- staff

const home = async (interaction) =>
  showCard(interaction, await buildGiveawaysCard(interaction.guild), 'giveaways');

const create = (interaction) =>
  interaction.showModal(detailsModal(encode('giveaways', 'createsubmit')));

async function createsubmit(interaction) {
  const details = await readDetails(interaction);
  if (!details) return;
  const defaults = settings.get(interaction.guildId).giveaways;
  const doc = await Giveaway.create({
    ...details,
    guildId: interaction.guildId,
    channelId: defaults.channelId,
    pingRoleId: defaults.pingRoleId,
    hostId: interaction.user.id,
  });
  await composer(interaction, doc.toObject());
}

const manage = (interaction, [id]) => open(interaction, interaction.values?.[0] ?? id);

async function edit(interaction, [id]) {
  const doc = await draftOf(interaction, id);
  if (doc) await interaction.showModal(detailsModal(encode('giveaways', 'editsubmit', id), doc));
}

async function editsubmit(interaction, [id]) {
  const details = await readDetails(interaction);
  if (!details) return;
  await Giveaway.updateOne({ _id: id, status: 'draft' }, details);
  await open(interaction, id);
}

async function channel(interaction, [id]) {
  if (!(await draftOf(interaction, id))) return;
  await Giveaway.updateOne({ _id: id, status: 'draft' }, { channelId: interaction.values[0] });
  await open(interaction, id);
}

async function ping(interaction, [id]) {
  if (!(await draftOf(interaction, id))) return;
  await Giveaway.updateOne(
    { _id: id, status: 'draft' },
    { pingRoleId: interaction.values[0] ?? null },
  );
  await open(interaction, id);
}

async function start(interaction, [id]) {
  await interaction.deferUpdate();
  const result = await startGiveaway(interaction.client, id, interaction.user);
  if (!result.ok) {
    await interaction.followUp({ content: result.reason, flags: MessageFlags.Ephemeral });
    return;
  }
  const doc = await loadGiveaway(id);
  await interaction.editReply(render(buildManageCard(doc), { name: 'giveaway-manage' }));
}

/** Throw away a draft. It never ran, so it is simply marked cancelled and left out of the list. */
async function discard(interaction, [id]) {
  await Giveaway.updateOne(
    { _id: id, status: 'draft' },
    { status: 'cancelled', cancelledById: interaction.user.id },
  );
  await home(interaction);
}

async function endnow(interaction, [id]) {
  await interaction.deferUpdate();
  const result = await endGiveaway(interaction.client, id, interaction.user);
  if (!result.ok)
    await interaction.followUp({ content: result.reason, flags: MessageFlags.Ephemeral });
  const doc = await loadGiveaway(id);
  await interaction.editReply(render(buildManageCard(doc), { name: 'giveaway-manage' }));
}

const cancel = (interaction, [id]) => open(interaction, id, { confirmCancel: true });

async function cancelconfirm(interaction, [id]) {
  await interaction.deferUpdate();
  const result = await cancelGiveaway(interaction.client, id, interaction.user);
  if (!result.ok)
    await interaction.followUp({ content: result.reason, flags: MessageFlags.Ephemeral });
  const doc = await loadGiveaway(id);
  await interaction.editReply(render(buildManageCard(doc), { name: 'giveaway-manage' }));
}

async function reroll(interaction, [id]) {
  await interaction.deferUpdate();
  const result = await rerollGiveaway(interaction.client, id, interaction.user);
  await interaction.followUp({
    content: result.ok ? STRINGS.rerolled(result.userId) : result.reason,
    flags: MessageFlags.Ephemeral,
    allowedMentions: { parse: [] },
  });
  const doc = await loadGiveaway(id);
  await interaction.editReply(render(buildManageCard(doc), { name: 'giveaway-manage' }));
}

async function defaultchannel(interaction) {
  await settings.set(
    interaction.guildId,
    'giveaways.channelId',
    interaction.values[0] ?? null,
    interaction.user,
  );
  await home(interaction);
}

async function defaultping(interaction) {
  await settings.set(
    interaction.guildId,
    'giveaways.pingRoleId',
    interaction.values[0] ?? null,
    interaction.user,
  );
  await home(interaction);
}

// ---- members

/** Enter button: one entry per member; a second click offers Leave instead of removing. */
async function enter(interaction, [id]) {
  const result = await addEntry(id, interaction.user.id);
  if (result === 'entered') {
    markDirty(id);
    return say(interaction, STRINGS.entered);
  }
  if (result === 'closed') return say(interaction, STRINGS.closed);
  return interaction.reply({
    content: STRINGS.alreadyIn,
    flags: MessageFlags.Ephemeral,
    components: [
      new ActionRowBuilder().addComponents(
        button({
          id: encode('giveaways', 'leave', id),
          label: 'Leave giveaway',
          style: ButtonStyle.Danger,
        }),
      ),
    ],
  });
}

async function leave(interaction, [id]) {
  const removed = await removeEntry(id, interaction.user.id);
  if (removed) markDirty(id);
  await interaction.update({ content: removed ? STRINGS.left : STRINGS.closed, components: [] });
}

export default {
  name: 'giveaways',
  // Members enter and leave; everything else is staff-only and checked by the router.
  publicActions: ['enter', 'leave'],
  init: (client) => startScheduler(client),
  panel: (interaction) => buildGiveawaysCard(interaction.guild),
  quick: create,
  summary: () => `${runningCount()} running`,
  handlers: {
    home,
    new: create,
    createsubmit,
    manage,
    edit,
    editsubmit,
    channel,
    ping,
    start,
    discard,
    endnow,
    cancel,
    cancelconfirm,
    reroll,
    defaultchannel,
    defaultping,
    enter,
    leave,
  },
};
