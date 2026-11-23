import {
  ActionRowBuilder,
  ContainerBuilder,
  MessageFlags,
  SectionBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js';
import { V2_LIMITS } from '../../config/constants.js';

/**
 * The card grammar. Every panel is built from these helpers so no module hand-rolls layout:
 *   header (title + subtitle, optional thumbnail) / divider / rows / divider / controls.
 */

/**
 * Start a card: an accent-barred container with a header.
 * @param {{ accent: number, title: string, subtitle?: string, iconUrl?: string }} opts
 * @returns {ContainerBuilder}
 */
export function card({ accent, title, subtitle, iconUrl }) {
  const container = new ContainerBuilder().setAccentColor(accent);
  const content = subtitle ? `## ${title}\n-# ${subtitle}` : `## ${title}`;
  const header = new TextDisplayBuilder().setContent(content);

  if (iconUrl) {
    container.addSectionComponents(
      new SectionBuilder()
        .addTextDisplayComponents(header)
        .setThumbnailAccessory(new ThumbnailBuilder().setURL(iconUrl)),
    );
  } else {
    container.addTextDisplayComponents(header);
  }
  return container;
}

/**
 * Add free markdown text.
 * @param {ContainerBuilder} c
 * @param {string} markdown
 * @returns {ContainerBuilder}
 */
export function text(c, markdown) {
  return c.addTextDisplayComponents(new TextDisplayBuilder().setContent(markdown));
}

/**
 * Add a label/value row; with a button it renders the button beside the text.
 * @param {ContainerBuilder} c
 * @param {{ label: string, value: string, button?: import('discord.js').ButtonBuilder }} row
 * @returns {ContainerBuilder}
 */
export function row(c, { label, value, button }) {
  const display = new TextDisplayBuilder().setContent(`**${label}**\n${value}`);
  if (!button) return c.addTextDisplayComponents(display);
  return c.addSectionComponents(
    new SectionBuilder().addTextDisplayComponents(display).setButtonAccessory(button),
  );
}

/**
 * Add a divider (visible line) or, with `line: false`, plain breathing room.
 * @param {ContainerBuilder} c
 * @param {{ large?: boolean, line?: boolean }} [opts]
 * @returns {ContainerBuilder}
 */
export function divider(c, { large = false, line = true } = {}) {
  return c.addSeparatorComponents(
    new SeparatorBuilder()
      .setDivider(line)
      .setSpacing(large ? SeparatorSpacingSize.Large : SeparatorSpacingSize.Small),
  );
}

/**
 * Add the terminal controls: an optional select menu on its own row, then up to 5 buttons.
 * @param {ContainerBuilder} c
 * @param {{ select?: object, buttons?: import('discord.js').ButtonBuilder[] }} controls
 * @returns {ContainerBuilder}
 */
export function controls(c, { select, buttons }) {
  if (select) c.addActionRowComponents(new ActionRowBuilder().addComponents(select));
  if (buttons?.length) {
    if (buttons.length > 5) throw new Error('A button row holds at most 5 buttons');
    c.addActionRowComponents(new ActionRowBuilder().addComponents(buttons));
  }
  return c;
}

/**
 * Add any number of buttons, five per row, for public grids such as a role panel. Panels use
 * `controls()`, which keeps terminal actions to a single row.
 * @param {ContainerBuilder} c
 * @param {import('discord.js').ButtonBuilder[]} buttons
 * @returns {ContainerBuilder}
 */
export function buttonRows(c, buttons) {
  for (let i = 0; i < buttons.length; i += 5) {
    c.addActionRowComponents(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
  }
  return c;
}

/**
 * Count components and text characters in a built container (recursively).
 * @param {object} json container.toJSON()
 * @returns {{ components: number, chars: number, duplicates: string[], ids: string[] }}
 */
export function measure(json) {
  let components = 0;
  let chars = 0;
  const ids = new Set();
  const duplicates = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (typeof node.custom_id === 'string') {
      if (ids.has(node.custom_id)) duplicates.push(node.custom_id);
      ids.add(node.custom_id);
    }
    if (node.type !== undefined) components += 1;
    if (typeof node.content === 'string') chars += node.content.length;
    for (const key of ['components', 'accessory']) {
      const child = node[key];
      if (Array.isArray(child)) child.forEach(walk);
      else walk(child);
    }
  };
  walk(json);
  return { components, chars, duplicates, ids: [...ids] };
}

/**
 * Finalise one card, or several stacked in one message (a live preview above its controls),
 * asserting Components V2 limits across the whole message so overflow is caught in development
 * with the panel's name instead of failing at send time.
 * @param {ContainerBuilder|ContainerBuilder[]} cards
 * @param {{ name: string, ephemeral?: boolean }} opts
 * @returns {{ components: ContainerBuilder[], flags: number }}
 */
export function render(cards, { name, ephemeral = false }) {
  const list = Array.isArray(cards) ? cards : [cards];
  let components = 0;
  let chars = 0;
  const ids = new Set();
  const duplicates = [];
  for (const c of list) {
    const m = measure(c.toJSON());
    components += m.components;
    chars += m.chars;
    for (const id of m.ids) {
      if (ids.has(id)) duplicates.push(id);
      ids.add(id);
    }
    duplicates.push(...m.duplicates);
  }
  // Discord rejects a message that repeats a custom id, and only at send time.
  if (duplicates.length) {
    throw new Error(`Panel "${name}" repeats custom ids: ${duplicates.join(', ')}`);
  }
  if (components > V2_LIMITS.components) {
    throw new Error(`Panel "${name}" has ${components} components (max ${V2_LIMITS.components})`);
  }
  if (chars > V2_LIMITS.textChars) {
    throw new Error(`Panel "${name}" has ${chars} text chars (max ${V2_LIMITS.textChars})`);
  }
  const flags = ephemeral
    ? MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral
    : MessageFlags.IsComponentsV2;
  return { components: list, flags };
}
