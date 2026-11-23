import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import {
  CHANGELOG_LIMITS,
  DEFAULT_CHANGELOG_TEMPLATE,
  MODULE_ACCENTS,
  SECTION_EMOJI_BY_LABEL,
} from '../../config/constants.js';
import { inline } from '../../config/emoji.js';
import { encode } from '../../lib/customId.js';
import * as settings from '../../lib/settings.js';
import { card, controls, divider, render, row, text } from '../../lib/ui/card.js';
import { button, ButtonStyle, roleSelect, stringSelect } from '../../lib/ui/components.js';
import { ChangelogTemplate } from '../../models/ChangelogTemplate.js';
import { STRINGS } from './strings.js';

const say = (interaction, content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
const back = (to = 'tpls') => button({ id: encode('changelog', to), label: 'Back', emoji: 'back' });
const show = (interaction, c) => interaction.update(render(c, { name: 'changelog-templates' }));

/**
 * All templates for the guild, creating the standard one on first use so the builder always
 * has something to offer.
 * @param {string} guildId
 * @returns {Promise<object[]>}
 */
export async function ensureTemplates(guildId) {
  let list = await ChangelogTemplate.find({ guildId }).sort({ createdAt: 1 }).lean();
  if (!list.length) {
    const { sections, ...rest } = DEFAULT_CHANGELOG_TEMPLATE;
    const created = await ChangelogTemplate.create({
      guildId,
      ...rest,
      sections: sections.map((s) => ({ ...s })),
    });
    await settings.set(guildId, 'changelog.defaultTemplateId', String(created._id));
    list = [created.toObject()];
  }
  return list;
}

/**
 * Turn the lines of the section editor into section definitions. Existing sections keep their
 * key (so already-written text survives a rename of nothing else) and icon; new labels get a
 * unique slug and an icon matched by name.
 * @param {string} input one section label per line
 * @param {Array<{ key: string, label: string, emojiKey: string }>} existing
 * @returns {Array<{ key: string, label: string, emojiKey: string }>}
 */
export function parseSections(input, existing = []) {
  // Labels are unique ignoring case, so "Fixed" and "fixed" cannot become two sections.
  const seen = new Set();
  const labels = input
    .split('\n')
    .map((l) => l.trim().slice(0, CHANGELOG_LIMITS.nameChars))
    .filter((l) => l && !seen.has(l.toLowerCase()) && seen.add(l.toLowerCase()))
    .slice(0, CHANGELOG_LIMITS.maxSections);

  const taken = new Set();
  return labels.map((label) => {
    const lower = label.toLowerCase();
    const known = existing.find((s) => s.label.toLowerCase() === lower && !taken.has(s.key));
    if (known) {
      taken.add(known.key);
      return { ...known, label };
    }
    const base = lower.replace(/[^a-z0-9]/g, '').slice(0, 12) || 'section';
    let key = base;
    for (let n = 2; taken.has(key) || existing.some((s) => s.key === key); n += 1) {
      key = `${base.slice(0, 10)}${n}`;
    }
    taken.add(key);
    return { key, label, emojiKey: SECTION_EMOJI_BY_LABEL[lower] ?? 'changelog' };
  });
}

/**
 * @param {string} input hex colour with or without #
 * @returns {number|null} the colour as an integer, or null when invalid
 */
export function parseColour(input) {
  const m = /^#?([0-9a-f]{6})$/i.exec(input.trim());
  return m ? parseInt(m[1], 16) : null;
}

const hex = (n) => `#${n.toString(16).padStart(6, '0').toUpperCase()}`;

function listCard(templates, defaultId) {
  const c = card({
    accent: MODULE_ACCENTS.changelog,
    title: `${inline('changelog')} Changelog templates`,
    subtitle: `${templates.length} of ${CHANGELOG_LIMITS.maxTemplates}`,
  });
  divider(c);
  text(
    c,
    templates
      .map(
        (t) =>
          `**${t.name}**${String(t._id) === defaultId ? ' · default' : ''} · ${t.sections.length} sections`,
      )
      .join('\n'),
  );
  divider(c, { line: false });
  controls(c, {
    select: stringSelect({
      id: encode('changelog', 'tplpick'),
      placeholder: 'Edit a template…',
      options: templates.map((t) => ({ label: t.name, value: String(t._id) })),
    }),
    buttons: [
      button({
        id: encode('changelog', 'tplnew'),
        label: 'New template',
        style: ButtonStyle.Primary,
        disabled: templates.length >= CHANGELOG_LIMITS.maxTemplates,
      }),
      button({ id: encode('changelog', 'home'), label: 'Back', emoji: 'back' }),
    ],
  });
  return c;
}

function editorCard(t, isDefault) {
  const id = String(t._id);
  const c = card({
    accent: t.accent,
    title: `${inline('changelog')} ${t.name}`,
    subtitle: isDefault ? 'Default template' : 'Template',
  });
  divider(c);
  row(c, { label: 'Header', value: `\`${t.headerFormat}\`\n-# {version} {title} {date}` });
  row(c, {
    label: 'Sections',
    value: t.sections.map((s) => `${inline(s.emojiKey)} ${s.label}`).join('\n'),
  });
  row(c, { label: 'Footer', value: t.footer || 'None' });
  row(c, { label: 'Accent colour', value: hex(t.accent) });
  row(c, {
    label: 'Ping role',
    value: t.pingRoleId ? `<@&${t.pingRoleId}>` : 'None (falls back to the panel setting)',
  });
  divider(c, { line: false });
  controls(c, {
    select: roleSelect({
      id: encode('changelog', 'tplping', id),
      placeholder: 'Ping role for this template…',
      min: 0,
      max: 1,
      defaults: t.pingRoleId ? [t.pingRoleId] : [],
    }),
  });
  controls(c, {
    buttons: [
      button({ id: encode('changelog', 'tpldetails', id), label: 'Edit details' }),
      button({ id: encode('changelog', 'tplsections', id), label: 'Edit sections' }),
      button({
        id: encode('changelog', 'tpldefault', id),
        label: 'Make default',
        disabled: isDefault,
      }),
      button({
        id: encode('changelog', 'tpldelete', id),
        label: 'Delete',
        style: ButtonStyle.Danger,
      }),
      back(),
    ],
  });
  return c;
}

const defaultId = (guildId) => settings.get(guildId).changelog.defaultTemplateId;

export async function tpls(interaction) {
  const list = await ensureTemplates(interaction.guildId);
  await show(interaction, listCard(list, defaultId(interaction.guildId)));
}

/** Template picker (select) or Cancel on the delete confirmation (button carrying the id). */
export async function tplpick(interaction, [id]) {
  const t = await ChangelogTemplate.findById(interaction.values?.[0] ?? id).lean();
  if (!t) return tpls(interaction);
  await show(interaction, editorCard(t, String(t._id) === defaultId(interaction.guildId)));
}

const input = (
  id,
  label,
  { value = '', required = true, style = TextInputStyle.Short, max, placeholder } = {},
) => {
  const i = new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(style)
    .setRequired(required)
    .setMaxLength(max)
    .setValue(value);
  if (placeholder) i.setPlaceholder(placeholder);
  return new ActionRowBuilder().addComponents(i);
};

function detailsModal(key, t) {
  return new ModalBuilder()
    .setCustomId(encode('changelog', 'tpldetailssubmit', key))
    .setTitle(key === 'new' ? 'New template' : 'Edit template')
    .addComponents(
      input('name', 'Name', { value: t.name ?? '', max: CHANGELOG_LIMITS.nameChars }),
      input('header', 'Header format', {
        value: t.headerFormat ?? 'Version {version} · {title}',
        max: CHANGELOG_LIMITS.headerChars,
        placeholder: '{version}, {title}, {date}',
      }),
      input('footer', 'Footer (optional)', {
        value: t.footer ?? '',
        required: false,
        max: CHANGELOG_LIMITS.footerChars,
      }),
      input('colour', 'Accent colour (hex)', {
        value: hex(t.accent ?? DEFAULT_CHANGELOG_TEMPLATE.accent),
        max: 7,
      }),
    );
}

export const tplnew = (interaction) => interaction.showModal(detailsModal('new', {}));

export async function tpldetails(interaction, [id]) {
  const t = await ChangelogTemplate.findById(id).lean();
  if (!t) return say(interaction, STRINGS.missingTemplate);
  await interaction.showModal(detailsModal(id, t));
}

export async function tpldetailssubmit(interaction, [key]) {
  const f = interaction.fields;
  const accent = parseColour(f.getTextInputValue('colour'));
  if (accent === null) return say(interaction, STRINGS.badColour);
  const fields = {
    name: f.getTextInputValue('name').trim(),
    headerFormat: f.getTextInputValue('header').trim(),
    footer: f.getTextInputValue('footer').trim(),
    accent,
  };

  let t;
  if (key === 'new') {
    t = (
      await ChangelogTemplate.create({
        guildId: interaction.guildId,
        ...fields,
        sections: DEFAULT_CHANGELOG_TEMPLATE.sections.map((s) => ({ ...s })),
      })
    ).toObject();
  } else {
    t = await ChangelogTemplate.findByIdAndUpdate(key, fields, { returnDocument: 'after' }).lean();
    if (!t) return say(interaction, STRINGS.missingTemplate);
  }
  await show(interaction, editorCard(t, String(t._id) === defaultId(interaction.guildId)));
}

export async function tplsections(interaction, [id]) {
  const t = await ChangelogTemplate.findById(id).lean();
  if (!t) return say(interaction, STRINGS.missingTemplate);
  await interaction.showModal(
    new ModalBuilder()
      .setCustomId(encode('changelog', 'tplsectionssubmit', id))
      .setTitle('Sections')
      .addComponents(
        input('sections', `One per line, up to ${CHANGELOG_LIMITS.maxSections}`, {
          value: t.sections.map((s) => s.label).join('\n'),
          style: TextInputStyle.Paragraph,
          max: 400,
        }),
      ),
  );
}

export async function tplsectionssubmit(interaction, [id]) {
  const t = await ChangelogTemplate.findById(id).lean();
  if (!t) return say(interaction, STRINGS.missingTemplate);
  const sections = parseSections(interaction.fields.getTextInputValue('sections'), t.sections);
  if (!sections.length) return say(interaction, STRINGS.needSection);
  const next = await ChangelogTemplate.findByIdAndUpdate(
    id,
    { sections },
    { returnDocument: 'after' },
  ).lean();
  await show(interaction, editorCard(next, String(next._id) === defaultId(interaction.guildId)));
}

export async function tplping(interaction, [id]) {
  const t = await ChangelogTemplate.findByIdAndUpdate(
    id,
    { pingRoleId: interaction.values[0] ?? null },
    { returnDocument: 'after' },
  ).lean();
  if (!t) return tpls(interaction);
  await show(interaction, editorCard(t, String(t._id) === defaultId(interaction.guildId)));
}

export async function tpldefault(interaction, [id]) {
  await settings.set(interaction.guildId, 'changelog.defaultTemplateId', id, interaction.user);
  return tplpick(interaction, [id]);
}

export async function tpldelete(interaction, [id]) {
  const t = await ChangelogTemplate.findById(id).lean();
  if (!t) return tpls(interaction);
  const count = await ChangelogTemplate.countDocuments({ guildId: interaction.guildId });
  if (count <= 1) return say(interaction, STRINGS.lastTemplate);
  const c = card({
    accent: MODULE_ACCENTS.changelog,
    title: `${inline('warn')} Delete "${t.name}"?`,
    subtitle: 'Drafts and published changelogs keep their own copy of the layout',
  });
  controls(c, {
    buttons: [
      button({
        id: encode('changelog', 'tpldeleteok', id),
        label: 'Delete',
        style: ButtonStyle.Danger,
      }),
      button({ id: encode('changelog', 'tplpick', id), label: 'Cancel' }),
    ],
  });
  await show(interaction, c);
}

export async function tpldeleteok(interaction, [id]) {
  await ChangelogTemplate.deleteOne({ _id: id });
  // The default must always point at a real template.
  if (defaultId(interaction.guildId) === id) {
    const first = await ChangelogTemplate.findOne({ guildId: interaction.guildId }).lean();
    await settings.set(
      interaction.guildId,
      'changelog.defaultTemplateId',
      first ? String(first._id) : null,
      interaction.user,
    );
  }
  await tpls(interaction);
}
