import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { ANNOUNCEMENT_LIMITS } from '../../config/constants.js';
import { inline } from '../../config/emoji.js';
import { encode } from '../../lib/customId.js';
import * as settings from '../../lib/settings.js';
import { render } from '../../lib/ui/card.js';
import { pingProblem } from '../../lib/ui/ping.js';
import { showCard } from '../../lib/ui/respond.js';
import { Announcement } from '../../models/Announcement.js';
import { sendAnnouncement, editSentAnnouncement } from './service.js';
import { STRINGS } from './strings.js';
import { announcementCard, composerCard, noticeCard, sentCard } from './view.js';

const say = (interaction, content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
const nowUnix = () => Math.floor(Date.now() / 1000);
const LINK = /discord(?:app)?\.com\/channels\/(\d+)\/(\d+)\/(\d+)/;

const jump = (doc) =>
  `https://discord.com/channels/${doc.guildId}/${doc.channelId}/${doc.messageId}`;

/** The composer: the live preview stacked above its controls, in one message. */
function composerView(interaction, doc) {
  const cards = [
    announcementCard(doc, nowUnix()),
    composerCard(doc, { problem: pingProblem(interaction.guild, doc.pingRoleId) }),
  ];
  return showCard(interaction, cards, 'announcement-composer');
}

/** Load an announcement in one of the allowed states, or reply that it is gone. */
async function load(interaction, id, ...statuses) {
  const doc = await Announcement.findById(id).lean();
  if (!doc) {
    await say(interaction, STRINGS.missingDraft);
    return null;
  }
  if (!statuses.includes(doc.status)) {
    await say(interaction, STRINGS.notDraft);
    return null;
  }
  return doc;
}

const field = (
  id,
  label,
  { value = '', style = TextInputStyle.Short, max, required = true } = {},
) =>
  new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId(id)
      .setLabel(label)
      .setStyle(style)
      .setRequired(required)
      .setMaxLength(max)
      .setValue(value),
  );

const composeModal = (customId, doc = {}) =>
  new ModalBuilder()
    .setCustomId(customId)
    .setTitle('Announcement')
    .addComponents(
      field('title', 'Title', { value: doc.title, max: ANNOUNCEMENT_LIMITS.titleChars }),
      field('body', 'Message', {
        value: doc.body,
        style: TextInputStyle.Paragraph,
        max: ANNOUNCEMENT_LIMITS.bodyChars,
      }),
      field('image', 'Image link (optional, https)', {
        value: doc.imageUrl ?? '',
        required: false,
        max: ANNOUNCEMENT_LIMITS.imageUrlChars,
      }),
    );

/** @returns {string|null|false} the URL, null when blank, false when invalid */
function parseImage(raw) {
  const value = raw.trim();
  if (!value) return null;
  try {
    return new URL(value).protocol === 'https:' ? value : false;
  } catch {
    return false;
  }
}

/** New announcement. Reached from the hub's quick button and from the Announcements panel. */
export const newdraft = (interaction) =>
  interaction.showModal(composeModal(encode('announcements', 'composesubmit', 'new')));

export async function edit(interaction, [id]) {
  const doc = await load(interaction, id, 'draft', 'sent');
  if (doc)
    await interaction.showModal(composeModal(encode('announcements', 'composesubmit', id), doc));
}

/** Compose modal submit: create a draft, update one, or edit a live message in place. */
export async function composesubmit(interaction, [id]) {
  const imageUrl = parseImage(interaction.fields.getTextInputValue('image'));
  if (imageUrl === false) return say(interaction, STRINGS.badImage);
  const fields = {
    title: interaction.fields.getTextInputValue('title').trim(),
    body: interaction.fields.getTextInputValue('body').trim(),
    imageUrl,
  };

  if (id === 'new') {
    const defaults = settings.get(interaction.guildId).announcements;
    const doc = (
      await Announcement.create({
        guildId: interaction.guildId,
        authorId: interaction.user.id,
        authorName: interaction.user.username,
        channelId: defaults.channelId,
        pingRoleId: defaults.pingRoleId,
        ...fields,
      })
    ).toObject();
    return composerView(interaction, doc);
  }

  const doc = await load(interaction, id, 'draft', 'sent');
  if (!doc) return;
  if (doc.status === 'draft') {
    await Announcement.updateOne({ _id: id }, fields);
    return composerView(interaction, { ...doc, ...fields });
  }
  const result = await editSentAnnouncement(interaction.client, doc, fields, interaction.user);
  if (!result.ok) return say(interaction, result.reason);
  await showCard(interaction, sentCard(result.doc, result.url, 'Updated'), 'announcement-sent');
}

export async function channel(interaction, [id]) {
  const doc = await load(interaction, id, 'draft');
  if (!doc) return;
  const channelId = interaction.values[0];
  await Announcement.updateOne({ _id: id }, { channelId });
  await composerView(interaction, { ...doc, channelId });
}

export async function pingrole(interaction, [id]) {
  const doc = await load(interaction, id, 'draft');
  if (!doc) return;
  const pingRoleId = interaction.values[0] ?? null;
  await Announcement.updateOne({ _id: id }, { pingRoleId });
  await composerView(interaction, { ...doc, pingRoleId });
}

/** Resume a saved draft from the Announcements panel. */
export async function draftpick(interaction) {
  const doc = await load(interaction, interaction.values[0], 'draft');
  if (doc) await composerView(interaction, doc);
}

export async function send(interaction, [id]) {
  await interaction.deferUpdate();
  const result = await sendAnnouncement(interaction.client, id, interaction.user);
  const c = result.ok
    ? sentCard(result.doc, result.url)
    : noticeCard(`${inline('warn')} Not sent`, result.reason);
  await interaction.editReply(render(c, { name: 'announcement-result' }));
}

export async function cancel(interaction, [id]) {
  const doc = await load(interaction, id, 'draft');
  if (!doc) return;
  // Kept for the record: status moves to cancelled, nothing is deleted.
  await Announcement.updateOne({ _id: id, status: 'draft' }, { status: 'cancelled' });
  await interaction.update(
    render(noticeCard(`${inline('statusDenied')} Cancelled`, `**${doc.title}** was discarded.`), {
      name: 'announcement-cancelled',
    }),
  );
}

/** "Edit a sent announcement": ask for its message link. */
export const editlink = (interaction) =>
  interaction.showModal(
    new ModalBuilder()
      .setCustomId(encode('announcements', 'editlinksubmit'))
      .setTitle('Edit a sent announcement')
      .addComponents(field('link', 'Message link', { max: 200 })),
  );

export async function editlinksubmit(interaction) {
  const match = LINK.exec(interaction.fields.getTextInputValue('link'));
  if (!match) return say(interaction, STRINGS.badLink);
  const [, guildId, , messageId] = match;
  if (guildId !== interaction.guildId) return say(interaction, STRINGS.wrongGuild);

  const doc = await Announcement.findOne({ guildId, messageId, status: 'sent' }).lean();
  if (!doc) return say(interaction, STRINGS.notOurs);
  await showCard(interaction, sentCard(doc, jump(doc), 'Sent announcement'), 'announcement-sent');
}
