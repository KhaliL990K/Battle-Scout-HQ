import { MODULE_ACCENTS } from '../../config/constants.js';
import { EMOJI, inline } from '../../config/emoji.js';
import { encode } from '../../lib/customId.js';
import { card, controls, divider, measure, row, text } from '../../lib/ui/card.js';
import { button, ButtonStyle, stringSelect } from '../../lib/ui/components.js';
import { withPing } from '../../lib/ui/ping.js';

/** A stored emoji key may predate a registry change; never let that break a render. */
const icon = (key) => inline(EMOJI[key] ? key : 'changelog');

/**
 * Fill a template's header format.
 * @param {string} format may contain {version}, {title}, {date}
 * @param {{ version: string, title: string }} doc
 * @param {number} unix
 * @returns {string}
 */
export function formatHeader(format, doc, unix) {
  return format
    .replaceAll('{version}', doc.version)
    .replaceAll('{title}', doc.title)
    .replaceAll('{date}', `<t:${unix}:D>`);
}

/**
 * The changelog exactly as it will be posted. Empty sections are left out.
 * @param {object} doc Changelog document (lean) with its template snapshot
 * @param {number} unix timestamp shown in the footer
 * @returns {import('discord.js').ContainerBuilder}
 */
export function changelogCard(doc, unix) {
  const t = doc.template;
  const c = card({ accent: t.accent, title: formatHeader(t.headerFormat, doc, unix) });
  const filled = t.sections.filter((s) => doc.sections?.[s.key]?.trim());

  if (!filled.length) {
    divider(c);
    text(c, '*Nothing written yet. Pick a section below to start.*');
  }
  for (const s of filled) {
    divider(c);
    text(c, `### ${icon(s.emojiKey)} ${s.label}\n${doc.sections[s.key].trim()}`);
  }
  divider(c);
  text(c, `-# ${t.footer ? `${t.footer} · ` : ''}<t:${unix}:D>`);
  return c;
}

/**
 * Characters the posted card would use; the builder checks this before accepting an edit.
 * @param {object} doc
 * @returns {number}
 */
export const contentChars = (doc) => measure(changelogCard(doc, 0).toJSON()).chars;

/**
 * The public message for a publish.
 * @param {object} doc
 * @param {string|null} roleId
 * @param {number} unix
 */
export const renderChangelogMessage = (doc, roleId, unix) =>
  withPing(changelogCard(doc, unix), roleId);

/**
 * The builder's control card, shown beneath the live preview.
 * @param {object} doc
 * @param {{ channelId: string|null, roleId: string|null, problem: string|null }} ctx
 * @returns {import('discord.js').ContainerBuilder}
 */
export function builderCard(doc, { channelId, roleId, problem }) {
  const id = String(doc._id);
  const t = doc.template;
  const filled = t.sections.filter((s) => doc.sections?.[s.key]?.trim()).length;
  const c = card({
    accent: MODULE_ACCENTS.changelog,
    title: `${inline('draft')} Changelog builder`,
    subtitle: `Draft · ${t.name} · ${filled} of ${t.sections.length} sections filled`,
  });
  divider(c);
  row(c, {
    label: 'Publishes to',
    value: channelId ? `<#${channelId}>` : 'No channel set. Choose one in the Changelog panel.',
  });
  row(c, {
    label: 'Ping',
    value: roleId
      ? `<@&${roleId}> · ${doc.ping ? 'will ping' : 'ping off'}${problem ? `\n${inline('warn')} ${problem}` : ''}`
      : 'No role set on the template or in the panel.',
  });
  divider(c, { line: false });
  controls(c, {
    select: stringSelect({
      id: encode('changelog', 'section', id),
      placeholder: 'Edit a section…',
      options: t.sections.map((s) => ({
        label: s.label,
        value: s.key,
        description: doc.sections?.[s.key]?.trim() ? 'Filled' : 'Empty',
        emoji: EMOJI[s.emojiKey] ? s.emojiKey : 'changelog',
      })),
    }),
    buttons: [
      button({
        id: encode('changelog', 'publish', id),
        label: 'Publish',
        style: ButtonStyle.Success,
        disabled: !filled || !channelId,
      }),
      button({
        id: encode('changelog', 'ping', id),
        label: doc.ping ? 'Ping: on' : 'Ping: off',
        disabled: !roleId,
      }),
      button({ id: encode('changelog', 'titleedit', id), label: 'Edit title' }),
      button({ id: encode('changelog', 'savedraft', id), label: 'Save as draft' }),
      button({
        id: encode('changelog', 'cancel', id),
        label: 'Cancel',
        style: ButtonStyle.Danger,
      }),
    ],
  });
  return c;
}

/**
 * Plain result card that replaces the builder after Publish, Save or Cancel.
 * @param {string} title
 * @param {string} body
 * @param {import('discord.js').ButtonBuilder[]} buttons
 */
export function resultCard(title, body, buttons) {
  const c = card({ accent: MODULE_ACCENTS.changelog, title });
  text(c, body);
  divider(c, { line: false });
  controls(c, { buttons });
  return c;
}
