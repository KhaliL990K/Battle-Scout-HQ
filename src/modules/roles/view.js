import { ButtonBuilder, parseEmoji, StringSelectMenuBuilder } from 'discord.js';
import { MODULE_ACCENTS, ROLE_PANEL_LIMITS } from '../../config/constants.js';
import { inline } from '../../config/emoji.js';
import { encode } from '../../lib/customId.js';
import { buttonRows, card, controls, divider, render, text } from '../../lib/ui/card.js';
import { ButtonStyle } from '../../lib/ui/components.js';
import { STRINGS } from './strings.js';

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/**
 * Component-ready emoji from a staff-typed string, or undefined. Staff emoji are configured
 * data stored per role, so they bypass the semantic registry on purpose.
 * @param {string|null} stored
 */
export const componentEmoji = (stored) => (stored ? (parseEmoji(stored) ?? undefined) : undefined);

/**
 * The panel's roles that still exist, with their display label resolved.
 * @param {import('discord.js').Guild} guild
 * @param {object} doc
 */
export function liveRoles(guild, doc) {
  return doc.roles
    .map((r) => ({ ...r, role: guild.roles.cache.get(r.roleId) }))
    .filter((r) => r.role)
    .map((r) => ({ ...r, label: clip(r.label ?? r.role.name, ROLE_PANEL_LIMITS.labelChars) }));
}

/**
 * The public card members click. Buttons toggle one role each; the select sets the whole choice.
 * @param {import('discord.js').Guild} guild
 * @param {object} doc
 * @returns {import('discord.js').ContainerBuilder}
 */
export function publicPanelCard(guild, doc) {
  const id = String(doc._id);
  const roles = liveRoles(guild, doc);
  const c = card({ accent: MODULE_ACCENTS.roles, title: `${inline('roles')} ${doc.title}` });
  if (doc.description) text(c, doc.description);
  if (roles.length) {
    const lines = roles.map(
      (r) =>
        `${r.emoji ? `${r.emoji} ` : ''}<@&${r.roleId}>${r.description ? ` · ${r.description}` : ''}`,
    );
    text(c, lines.join('\n'));
  }
  const hint =
    doc.mode === 'one'
      ? 'You can hold one role from this panel. Picking another swaps it.'
      : doc.layout === 'select'
        ? 'Choose every role you want; anything you leave out is removed.'
        : 'Click a role to add it. Click it again to remove it.';
  text(c, `-# ${hint}`);
  divider(c, { line: false });

  if (doc.layout === 'select') {
    const select = new StringSelectMenuBuilder()
      .setCustomId(encode('roles', 'pick', id))
      .setPlaceholder(doc.mode === 'one' ? STRINGS.pickOnePrompt : STRINGS.pickPrompt)
      .setMinValues(0)
      .setMaxValues(doc.mode === 'one' ? 1 : roles.length)
      .addOptions(
        roles.map((r) => ({
          label: r.label,
          value: r.roleId,
          ...(r.description ? { description: clip(r.description, 100) } : {}),
          ...(componentEmoji(r.emoji) ? { emoji: componentEmoji(r.emoji) } : {}),
        })),
      );
    controls(c, { select });
  } else {
    buttonRows(
      c,
      roles.map((r) => {
        const b = new ButtonBuilder()
          .setCustomId(encode('roles', 'toggle', id, r.roleId))
          .setStyle(ButtonStyle.Secondary)
          .setLabel(r.label);
        const emoji = componentEmoji(r.emoji);
        if (emoji) b.setEmoji(emoji);
        return b;
      }),
    );
  }
  return c;
}

/**
 * Message options for the public panel.
 * @param {import('discord.js').Guild} guild
 * @param {object} doc
 */
export const renderPublicPanel = (guild, doc) =>
  render(publicPanelCard(guild, doc), { name: 'role-panel' });
