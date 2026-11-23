import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { STICKY_LIMITS } from '../../config/constants.js';
import { encode } from '../../lib/customId.js';
import { render } from '../../lib/ui/card.js';
import { StickyMessage } from '../../models/StickyMessage.js';
import {
  activeCount,
  clearSticky,
  loadStickies,
  repostNow,
  setPaused,
  setSticky,
} from './engine.js';
import { buildManageCard, buildStickyCard } from './panel.js';

const say = (interaction, content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
const MISSING = 'That sticky no longer exists.';

const refresh = async (interaction) =>
  interaction.update(render(await buildStickyCard(interaction.guild), { name: 'sticky' }));

const field = (id, label, value, { style = TextInputStyle.Short, max, required = true } = {}) =>
  new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setStyle(style)
      .setRequired(required)
      .setMaxLength(max)
      .setValue(String(value)),
  );

/**
 * The add/edit modal, shared by the panel and `/sticky set`.
 * @param {string} channelId
 * @param {object} [existing] current sticky, to prefill
 * @returns {ModalBuilder}
 */
export function stickyModal(channelId, existing = {}) {
  return new ModalBuilder()
    .setCustomId(encode('sticky', 'setsubmit', channelId))
    .setTitle('Sticky message')
    .addComponents(
      field('title', 'Title', existing.title ?? '', { max: STICKY_LIMITS.titleChars }),
      field('body', 'Message', existing.body ?? '', {
        style: TextInputStyle.Paragraph,
        max: STICKY_LIMITS.bodyChars,
      }),
      field(
        'messages',
        `Re-post after N messages (${STICKY_LIMITS.minMessages} to ${STICKY_LIMITS.maxMessages})`,
        existing.afterMessages ?? STICKY_LIMITS.defaultMessages,
        { max: 3 },
      ),
      field(
        'seconds',
        `...and at least N seconds (${STICKY_LIMITS.minSeconds} to ${STICKY_LIMITS.maxSeconds})`,
        existing.afterSeconds ?? STICKY_LIMITS.defaultSeconds,
        { max: 4 },
      ),
    );
}

async function pick(interaction) {
  const channelId = interaction.values[0];
  const existing = await StickyMessage.findOne({
    guildId: interaction.guildId,
    channelId,
    active: true,
  }).lean();
  await interaction.showModal(stickyModal(channelId, existing ?? {}));
}

async function setsubmit(interaction, [channelId]) {
  const f = interaction.fields;
  const messages = Number(f.getTextInputValue('messages').trim());
  const seconds = Number(f.getTextInputValue('seconds').trim());
  const ok = (n, min, max) => Number.isInteger(n) && n >= min && n <= max;
  if (
    !ok(messages, STICKY_LIMITS.minMessages, STICKY_LIMITS.maxMessages) ||
    !ok(seconds, STICKY_LIMITS.minSeconds, STICKY_LIMITS.maxSeconds)
  ) {
    return say(interaction, 'Both numbers must be whole numbers inside the allowed range.');
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const doc = await setSticky({
    guildId: interaction.guildId,
    channelId,
    title: f.getTextInputValue('title').trim(),
    body: f.getTextInputValue('body').trim(),
    afterMessages: messages,
    afterSeconds: seconds,
    userId: interaction.user.id,
  });
  await interaction.editReply(
    doc.messageId
      ? { content: `Sticky posted in <#${channelId}>.` }
      : {
          content: `Saved, but the bot could not post in <#${channelId}>. Check its permissions there.`,
        },
  );
}

async function manage(interaction, [id]) {
  const doc = await StickyMessage.findById(interaction.values?.[0] ?? id).lean();
  if (!doc?.active) return refresh(interaction);
  await interaction.update(
    render(buildManageCard(interaction.guild, doc), { name: 'sticky-manage' }),
  );
}

async function edit(interaction, [id]) {
  const doc = await StickyMessage.findById(id).lean();
  if (!doc?.active) return say(interaction, MISSING);
  await interaction.showModal(stickyModal(doc.channelId, doc));
}

async function pause(interaction, [id]) {
  const doc = await StickyMessage.findById(id).lean();
  if (!doc?.active) return refresh(interaction);
  await setPaused(doc.channelId, !doc.paused);
  await manage(interaction, [id]);
}

async function repost(interaction, [id]) {
  const doc = await StickyMessage.findById(id).lean();
  if (!doc?.active) return refresh(interaction);
  await interaction.deferUpdate();
  await repostNow(doc.channelId);
  const fresh = await StickyMessage.findById(id).lean();
  await interaction.editReply(
    render(buildManageCard(interaction.guild, fresh), { name: 'sticky-manage' }),
  );
}

async function remove(interaction, [id]) {
  const doc = await StickyMessage.findById(id).lean();
  if (doc?.active) await clearSticky(interaction.guildId, doc.channelId);
  await refresh(interaction);
}

export default {
  name: 'sticky',
  panel: (interaction) => buildStickyCard(interaction.guild),
  summary: () => `${activeCount()} active`,
  init: (client) => loadStickies(client),
  handlers: { pick, setsubmit, manage, edit, pause, repost, remove, home: refresh },
};
