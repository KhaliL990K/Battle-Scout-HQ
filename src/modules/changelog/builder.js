import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { CHANGELOG_LIMITS, MODULE_ACCENTS } from '../../config/constants.js';
import { inline } from '../../config/emoji.js';
import { encode } from '../../lib/customId.js';
import * as settings from '../../lib/settings.js';
import { card, controls, divider, render } from '../../lib/ui/card.js';
import { pingProblem } from '../../lib/ui/ping.js';
import { showCard } from '../../lib/ui/respond.js';
import { button, ButtonStyle, stringSelect } from '../../lib/ui/components.js';
import { Changelog } from '../../models/Changelog.js';
import { ChangelogTemplate } from '../../models/ChangelogTemplate.js';
import { pingRoleFor, publishChangelog } from './publish.js';
import { STRINGS } from './strings.js';
import { ensureTemplates } from './templates.js';
import { builderCard, changelogCard, contentChars, resultCard } from './view.js';

const say = (interaction, content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
const nowUnix = () => Math.floor(Date.now() / 1000);

/** The builder: the live preview stacked above its controls, in one message. */
function builderView(interaction, doc) {
  const guild = interaction.guild;
  const roleId = pingRoleFor({ ...doc, ping: true }, guild.id);
  const cards = [
    changelogCard(doc, nowUnix()),
    builderCard(doc, {
      channelId: settings.get(guild.id).changelog.channelId,
      roleId,
      problem: doc.ping ? pingProblem(guild, roleId) : null,
    }),
  ];
  return showCard(interaction, cards, 'changelog-builder');
}

/** Load an open draft or tell the user it is gone. Returns null after replying. */
async function openDraft(interaction, id) {
  const doc = await Changelog.findById(id).lean();
  if (!doc) {
    await say(interaction, STRINGS.missingDraft);
    return null;
  }
  if (doc.status !== 'draft') {
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

const titleModal = (customId, doc = {}) =>
  new ModalBuilder()
    .setCustomId(customId)
    .setTitle('Version and title')
    .addComponents(
      field('version', 'Version', { value: doc.version, max: CHANGELOG_LIMITS.versionChars }),
      field('title', 'Title', { value: doc.title, max: CHANGELOG_LIMITS.titleChars }),
    );

/**
 * New changelog: straight to the modal when there is one template, otherwise a template picker.
 * Reached from the hub's quick button and from the Changelog panel.
 */
export async function newdraft(interaction) {
  const templates = await ensureTemplates(interaction.guildId);
  if (templates.length === 1) {
    return interaction.showModal(titleModal(encode('changelog', 'startsubmit', templates[0]._id)));
  }
  const fallback = settings.get(interaction.guildId).changelog.defaultTemplateId;
  const c = card({
    accent: MODULE_ACCENTS.changelog,
    title: `${inline('changelog')} New changelog`,
    subtitle: 'Pick a template',
  });
  divider(c);
  controls(c, {
    select: stringSelect({
      id: encode('changelog', 'pickstart'),
      placeholder: 'Choose a template…',
      options: templates.map((t) => ({
        label: t.name,
        value: String(t._id),
        description: `${t.sections.length} sections`,
        default: String(t._id) === fallback,
      })),
    }),
    buttons: [button({ id: encode('changelog', 'home'), label: 'Back', emoji: 'back' })],
  });
  await showCard(interaction, c, 'changelog-pick');
}

export const pickstart = (interaction) =>
  interaction.showModal(titleModal(encode('changelog', 'startsubmit', interaction.values[0])));

export async function startsubmit(interaction, [templateId]) {
  const template = await ChangelogTemplate.findById(templateId).lean();
  if (!template) return say(interaction, STRINGS.missingTemplate);
  const snapshot = {
    name: template.name,
    headerFormat: template.headerFormat,
    sections: template.sections,
    footer: template.footer,
    accent: template.accent,
    pingRoleId: template.pingRoleId,
  };
  const doc = (
    await Changelog.create({
      guildId: interaction.guildId,
      templateId: String(template._id),
      template: snapshot,
      version: interaction.fields.getTextInputValue('version').trim(),
      title: interaction.fields.getTextInputValue('title').trim(),
      authorId: interaction.user.id,
    })
  ).toObject();
  await builderView(interaction, doc);
}

/** Resume a saved draft from the Changelog panel. */
export async function draftpick(interaction) {
  const doc = await openDraft(interaction, interaction.values[0]);
  if (doc) await builderView(interaction, doc);
}

export async function section(interaction, [id]) {
  const doc = await openDraft(interaction, id);
  if (!doc) return;
  const def = doc.template.sections.find((s) => s.key === interaction.values[0]);
  if (!def) return say(interaction, STRINGS.missingDraft);
  await interaction.showModal(
    new ModalBuilder()
      .setCustomId(encode('changelog', 'sectionsubmit', id, def.key))
      .setTitle(def.label.slice(0, 45))
      .addComponents(
        field('body', 'One change per line, start each with -', {
          value: doc.sections?.[def.key] ?? '',
          style: TextInputStyle.Paragraph,
          max: CHANGELOG_LIMITS.sectionChars,
          required: false,
        }),
      ),
  );
}

export async function sectionsubmit(interaction, [id, key]) {
  const doc = await openDraft(interaction, id);
  if (!doc) return;
  if (!doc.template.sections.some((s) => s.key === key))
    return say(interaction, STRINGS.missingDraft);

  const body = interaction.fields.getTextInputValue('body').trim();
  const next = { ...doc, sections: { ...doc.sections, [key]: body } };
  const over = contentChars(next) - CHANGELOG_LIMITS.totalChars;
  if (over > 0) return say(interaction, STRINGS.overBudget(over));

  await Changelog.updateOne({ _id: id }, { $set: { [`sections.${key}`]: body } });
  await builderView(interaction, next);
}

export async function titleedit(interaction, [id]) {
  const doc = await openDraft(interaction, id);
  if (doc) await interaction.showModal(titleModal(encode('changelog', 'titlesubmit', id), doc));
}

export async function titlesubmit(interaction, [id]) {
  const doc = await openDraft(interaction, id);
  if (!doc) return;
  const next = {
    ...doc,
    version: interaction.fields.getTextInputValue('version').trim(),
    title: interaction.fields.getTextInputValue('title').trim(),
  };
  const over = contentChars(next) - CHANGELOG_LIMITS.totalChars;
  if (over > 0) return say(interaction, STRINGS.overBudget(over));
  await Changelog.updateOne({ _id: id }, { version: next.version, title: next.title });
  await builderView(interaction, next);
}

export async function ping(interaction, [id]) {
  const doc = await openDraft(interaction, id);
  if (!doc) return;
  const next = { ...doc, ping: !doc.ping };
  await Changelog.updateOne({ _id: id }, { ping: next.ping });
  await builderView(interaction, next);
}

const toPanel = () => button({ id: encode('changelog', 'home'), label: 'Changelog panel' });

export async function savedraft(interaction, [id]) {
  const doc = await openDraft(interaction, id);
  if (!doc) return;
  await interaction.update(
    render(
      resultCard(
        `${inline('draft')} Draft saved`,
        `**${doc.version}** · ${doc.title} is saved. Resume it any time from the Changelog panel.`,
        [toPanel()],
      ),
      { name: 'changelog-saved' },
    ),
  );
}

export async function cancel(interaction, [id]) {
  const doc = await openDraft(interaction, id);
  if (!doc) return;
  // Kept for the record: status moves to cancelled, nothing is deleted.
  await Changelog.updateOne({ _id: id, status: 'draft' }, { status: 'cancelled' });
  await interaction.update(
    render(
      resultCard(`${inline('statusDenied')} Cancelled`, `**${doc.version}** was discarded.`, [
        toPanel(),
      ]),
      { name: 'changelog-cancelled' },
    ),
  );
}

export async function publish(interaction, [id]) {
  await interaction.deferUpdate();
  const result = await publishChangelog(interaction.client, id, interaction.user);
  const c = result.ok
    ? resultCard(`${inline('statusApproved')} Published`, STRINGS.published(result.url), [
        toPanel(),
      ])
    : resultCard(`${inline('warn')} Not published`, result.reason, [
        button({
          id: encode('changelog', 'resume', id),
          label: 'Back to the draft',
          style: ButtonStyle.Primary,
        }),
      ]);
  await interaction.editReply(render(c, { name: 'changelog-published' }));
}

/** "Back to the draft" after a failed publish. */
export async function resume(interaction, [id]) {
  const doc = await openDraft(interaction, id);
  if (doc) await builderView(interaction, doc);
}
