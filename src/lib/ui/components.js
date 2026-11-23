import {
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  RoleSelectMenuBuilder,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
} from 'discord.js';
import { resolve } from '../../config/emoji.js';

/**
 * Button factory. `emoji` is a registry key, never a raw emoji.
 * @param {{ id: string, label?: string, emoji?: string, style?: ButtonStyle, disabled?: boolean }} opts
 * @returns {ButtonBuilder}
 */
export function button({ id, label, emoji, style = ButtonStyle.Secondary, disabled = false }) {
  const b = new ButtonBuilder().setCustomId(id).setStyle(style).setDisabled(disabled);
  if (label) b.setLabel(label);
  if (emoji) b.setEmoji(resolve(emoji));
  return b;
}

/**
 * String select factory. Options may carry an `emoji` registry key.
 * @param {{ id: string, placeholder: string, options: Array<{ label: string, value: string,
 *   description?: string, emoji?: string, default?: boolean }>, min?: number, max?: number }} opts
 * @returns {StringSelectMenuBuilder}
 */
export function stringSelect({ id, placeholder, options, min = 1, max = 1 }) {
  return new StringSelectMenuBuilder()
    .setCustomId(id)
    .setPlaceholder(placeholder)
    .setMinValues(min)
    .setMaxValues(max)
    .addOptions(
      options.map(({ emoji, ...o }) => ({ ...o, ...(emoji ? { emoji: resolve(emoji) } : {}) })),
    );
}

/**
 * Channel select factory.
 * @param {{ id: string, placeholder: string, channelTypes?: number[], defaults?: string[], min?: number }} opts
 * @returns {ChannelSelectMenuBuilder}
 */
export function channelSelect({ id, placeholder, channelTypes, defaults = [], min }) {
  const s = new ChannelSelectMenuBuilder().setCustomId(id).setPlaceholder(placeholder);
  if (min !== undefined) s.setMinValues(min);
  if (channelTypes?.length) s.setChannelTypes(channelTypes);
  if (defaults.length) s.setDefaultChannels(defaults);
  return s;
}

/**
 * Role select factory.
 * @param {{ id: string, placeholder: string, min?: number, max?: number, defaults?: string[] }} opts
 * @returns {RoleSelectMenuBuilder}
 */
export function roleSelect({ id, placeholder, min = 0, max = 1, defaults = [] }) {
  const s = new RoleSelectMenuBuilder()
    .setCustomId(id)
    .setPlaceholder(placeholder)
    .setMinValues(min)
    .setMaxValues(max);
  if (defaults.length) s.setDefaultRoles(defaults);
  return s;
}

/**
 * User select factory.
 * @param {{ id: string, placeholder: string }} opts
 * @returns {UserSelectMenuBuilder}
 */
export function userSelect({ id, placeholder }) {
  return new UserSelectMenuBuilder().setCustomId(id).setPlaceholder(placeholder);
}

export { ButtonStyle };
