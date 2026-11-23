import { EMOJI_PAGE_SIZE, MODULE_ACCENTS } from '../../config/constants.js';
import { EMOJI, inline, isCustom } from '../../config/emoji.js';
import { encode } from '../../lib/customId.js';
import * as settings from '../../lib/settings.js';
import { card, controls, divider, row } from '../../lib/ui/card.js';
import { button, roleSelect, stringSelect } from '../../lib/ui/components.js';
import { backButton } from '../../lib/ui/nav.js';

/**
 * Build the Settings card: who counts as staff, and which emoji the bot uses.
 * @param {import('discord.js').Guild} guild
 * @param {number} [page] page of the emoji list
 * @returns {import('discord.js').ContainerBuilder}
 */
export function buildSettingsCard(guild, page = 0) {
  const s = settings.get(guild.id);
  const overrides = s.emoji ?? {};
  const keys = Object.keys(EMOJI);
  const pages = Math.ceil(keys.length / EMOJI_PAGE_SIZE);
  const p = Math.min(Math.max(page, 0), pages - 1);
  const shown = keys.slice(p * EMOJI_PAGE_SIZE, (p + 1) * EMOJI_PAGE_SIZE);
  const fallbacks = keys.filter((k) => !isCustom(k)).length;

  const c = card({
    accent: MODULE_ACCENTS.settings,
    title: `${inline('settings')} Settings`,
    subtitle: 'Who counts as staff, and the emoji the bot uses',
  });
  divider(c);
  row(c, {
    label: 'Staff roles',
    value: s.staff.roleIds.length
      ? `${s.staff.roleIds.map((id) => `<@&${id}>`).join(' ')}\nServer administrators are always staff.`
      : 'None set. Only server administrators can use the panels.',
  });
  row(c, {
    label: `Emoji (${keys.length - fallbacks} custom, ${fallbacks} on Unicode fallback)`,
    value: shown
      .map((k) => {
        const name = overrides[k] ?? EMOJI[k].name;
        return `${inline(k)} \`${k}\` → \`${name}\`${overrides[k] ? ' (override)' : ''}${isCustom(k) ? '' : ' · fallback'}`;
      })
      .join('\n'),
  });
  divider(c, { line: false });

  controls(c, {
    select: roleSelect({
      id: encode('settings', 'staffroles'),
      placeholder: 'Staff roles…',
      min: 0,
      max: 10,
      defaults: s.staff.roleIds,
    }),
  });
  controls(c, {
    select: stringSelect({
      id: encode('settings', 'emojipick'),
      placeholder: 'Override an emoji…',
      options: shown.map((k) => ({
        label: k,
        value: k,
        description: `Looks up "${overrides[k] ?? EMOJI[k].name}"`,
      })),
    }),
  });
  controls(c, {
    buttons: [
      button({
        id: encode('settings', 'emojiprev', Math.max(p - 1, 0)),
        label: 'Previous',
        disabled: p === 0,
      }),
      button({
        id: encode('settings', 'emojinext', Math.min(p + 1, pages - 1)),
        label: `Next (${p + 1} of ${pages})`,
        disabled: p >= pages - 1,
      }),
      button({
        id: encode('settings', 'emojirescan', p),
        label: 'Re-scan emoji',
        emoji: 'refresh',
      }),
      backButton(),
    ],
  });
  return c;
}
