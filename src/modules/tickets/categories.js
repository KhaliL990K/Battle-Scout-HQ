import { randomBytes } from 'node:crypto';
import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import {
  DEFAULT_TICKET_CATEGORIES,
  MODULE_ACCENTS,
  TICKET_LIMITS,
} from '../../config/constants.js';
import { inline } from '../../config/emoji.js';
import { encode } from '../../lib/customId.js';
import * as settings from '../../lib/settings.js';
import { card, controls, divider, render, row, text } from '../../lib/ui/card.js';
import { button, ButtonStyle, stringSelect } from '../../lib/ui/components.js';
import { refreshPostedPanel } from './publish.js';

const say = (interaction, content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });
const read = (guildId) => settings.get(guildId).tickets.categories;
const back = (to = 'cats') => button({ id: encode('tickets', to), label: 'Back', emoji: 'back' });

async function save(interaction, categories) {
  await settings.set(interaction.guildId, 'tickets.categories', categories, interaction.user);
  await refreshPostedPanel(interaction.client, interaction.guildId);
}

/** The category list: pick one to edit, add one, or load the defaults. */
function listCard(categories) {
  const c = card({
    accent: MODULE_ACCENTS.tickets,
    title: `${inline('ticket')} Ticket categories`,
    subtitle: `${categories.length} of ${TICKET_LIMITS.maxCategories}`,
  });
  divider(c);
  if (categories.length) {
    text(
      c,
      categories
        .map(
          (x) =>
            `**${x.label}** · ${x.questions.length} question${x.questions.length === 1 ? '' : 's'}`,
        )
        .join('\n'),
    );
  } else {
    text(c, 'No categories yet. Load the defaults to start from five common ones.');
  }
  divider(c, { line: false });
  if (categories.length) {
    controls(c, {
      select: stringSelect({
        id: encode('tickets', 'catpick'),
        placeholder: 'Edit a category…',
        options: categories.map((x) => ({
          label: x.label,
          value: x.key,
          description: x.description || undefined,
        })),
      }),
    });
  }
  const buttons = [
    button({
      id: encode('tickets', 'catnew'),
      label: 'Add category',
      style: ButtonStyle.Primary,
      disabled: categories.length >= TICKET_LIMITS.maxCategories,
    }),
  ];
  if (!categories.length) {
    buttons.push(button({ id: encode('tickets', 'catdefaults'), label: 'Load defaults' }));
  }
  buttons.push(back('home'));
  controls(c, { buttons });
  return c;
}

/** One category: details, questions, and the actions on it. */
function editorCard(cat) {
  const c = card({
    accent: MODULE_ACCENTS.tickets,
    title: `${inline('ticket')} ${cat.label}`,
    subtitle: cat.description || 'No description',
  });
  divider(c);
  row(c, {
    label: 'Questions asked',
    value: cat.questions.map((q, i) => `${i + 1}. ${q}`).join('\n'),
  });
  divider(c, { line: false });
  controls(c, {
    buttons: [
      button({ id: encode('tickets', 'catdetails', cat.key), label: 'Edit details' }),
      button({ id: encode('tickets', 'catquestions', cat.key), label: 'Edit questions' }),
      button({
        id: encode('tickets', 'catdelete', cat.key),
        label: 'Delete',
        style: ButtonStyle.Danger,
      }),
      back(),
    ],
  });
  return c;
}

function confirmCard(cat) {
  const c = card({
    accent: MODULE_ACCENTS.tickets,
    title: `${inline('warn')} Delete "${cat.label}"?`,
    subtitle: 'Existing tickets in this category are not affected',
  });
  controls(c, {
    buttons: [
      button({
        id: encode('tickets', 'catdeleteok', cat.key),
        label: 'Delete',
        style: ButtonStyle.Danger,
      }),
      button({ id: encode('tickets', 'catpick', cat.key), label: 'Cancel' }),
    ],
  });
  return c;
}

const show = (interaction, c) => interaction.update(render(c, { name: 'ticket-categories' }));
const find = (guildId, key) => read(guildId).find((x) => x.key === key);

export const cats = (interaction) => show(interaction, listCard(read(interaction.guildId)));

/** Category picker (select) or Cancel on the delete confirmation (button with a key param). */
export async function catpick(interaction, [key]) {
  const cat = find(interaction.guildId, interaction.values?.[0] ?? key);
  if (!cat) return cats(interaction);
  await show(interaction, editorCard(cat));
}

export async function catdefaults(interaction) {
  const loaded = DEFAULT_TICKET_CATEGORIES.map((x) => ({
    key: randomBytes(3).toString('hex'),
    ...x,
    questions: [...x.questions],
  }));
  await save(interaction, loaded);
  await cats(interaction);
}

const input = (
  id,
  label,
  { value = '', required = true, style = TextInputStyle.Short, max } = {},
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

/** Add category (key "new") and Edit details share one modal. */
export async function catnew(interaction) {
  await interaction.showModal(detailsModal('new', {}));
}

export async function catdetails(interaction, [key]) {
  const cat = find(interaction.guildId, key);
  if (!cat) return say(interaction, 'That category no longer exists.');
  await interaction.showModal(detailsModal(key, cat));
}

function detailsModal(key, cat) {
  return new ModalBuilder()
    .setCustomId(encode('tickets', 'catdetailssubmit', key))
    .setTitle(key === 'new' ? 'New category' : 'Edit category')
    .addComponents(
      input('label', 'Name', { value: cat.label ?? '', max: TICKET_LIMITS.maxLabelChars }),
      input('description', 'Short description', {
        value: cat.description ?? '',
        required: false,
        max: TICKET_LIMITS.maxDescriptionChars,
      }),
    );
}

export async function catdetailssubmit(interaction, [key]) {
  const label = interaction.fields.getTextInputValue('label').trim();
  const description = interaction.fields.getTextInputValue('description').trim();
  const categories = read(interaction.guildId);

  if (key === 'new') {
    if (categories.length >= TICKET_LIMITS.maxCategories)
      return say(interaction, 'Category limit reached.');
    // A new category starts with one generic question; "Edit questions" refines it.
    const cat = {
      key: randomBytes(3).toString('hex'),
      label,
      description,
      questions: ['How can we help?'],
    };
    await save(interaction, [...categories, cat]);
    return show(interaction, editorCard(cat));
  }
  const cat = find(interaction.guildId, key);
  if (!cat) return say(interaction, 'That category no longer exists.');
  const next = { ...cat, label, description };
  await save(
    interaction,
    categories.map((x) => (x.key === key ? next : x)),
  );
  await show(interaction, editorCard(next));
}

export async function catquestions(interaction, [key]) {
  const cat = find(interaction.guildId, key);
  if (!cat) return say(interaction, 'That category no longer exists.');
  await interaction.showModal(
    new ModalBuilder()
      .setCustomId(encode('tickets', 'catquestionssubmit', key))
      .setTitle('Questions (leave blank to remove)')
      .addComponents(
        Array.from({ length: TICKET_LIMITS.maxQuestions }, (_, i) =>
          input(`q${i}`, `Question ${i + 1}`, {
            value: cat.questions[i] ?? '',
            required: i === 0,
            max: TICKET_LIMITS.maxLabelChars,
          }),
        ),
      ),
  );
}

export async function catquestionssubmit(interaction, [key]) {
  const cat = find(interaction.guildId, key);
  if (!cat) return say(interaction, 'That category no longer exists.');
  const questions = Array.from({ length: TICKET_LIMITS.maxQuestions }, (_, i) =>
    interaction.fields.getTextInputValue(`q${i}`).trim(),
  ).filter(Boolean);
  const next = { ...cat, questions };
  await save(
    interaction,
    read(interaction.guildId).map((x) => (x.key === key ? next : x)),
  );
  await show(interaction, editorCard(next));
}

export async function catdelete(interaction, [key]) {
  const cat = find(interaction.guildId, key);
  if (!cat) return cats(interaction);
  await show(interaction, confirmCard(cat));
}

export async function catdeleteok(interaction, [key]) {
  await save(
    interaction,
    read(interaction.guildId).filter((x) => x.key !== key),
  );
  await cats(interaction);
}
