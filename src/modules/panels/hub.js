import { MODULE_ACCENTS } from '../../config/constants.js';
import { inline } from '../../config/emoji.js';
import { encode } from '../../lib/customId.js';
import * as settings from '../../lib/settings.js';
import { card, controls, divider, render, text } from '../../lib/ui/card.js';
import { button, ButtonStyle, stringSelect } from '../../lib/ui/components.js';
import { backButton } from '../../lib/ui/nav.js';
import { getModule } from '../registry.js';
import { PANEL_CATALOG } from './catalog.js';

const onOff = (flag) => `${inline(flag ? 'on' : 'off')} ${flag ? 'On' : 'Off'}`;
const channelText = (id) => (id ? `<#${id}>` : 'no channel set');

/** Hub sections, in display order, keyed by the catalog's `group`. */
const HUB_GROUPS = Object.freeze({ community: 'Community', staff: 'Staff tools' });

/**
 * One-line live status per panel, derived from cached settings (no database reads).
 * @param {typeof PANEL_CATALOG[number]} def
 * @param {object} s guild settings
 * @returns {string}
 */
function summarise(def, s) {
  if (!getModule(def.key)?.panel) return `Arrives in phase ${def.phase}`;
  switch (def.key) {
    case 'logging':
      return `${onOff(s.logging.enabled)} · ${channelText(s.logging.channelId)}`;
    case 'automod':
      return `${onOff(s.automod.enabled)} · dry-run ${s.automod.dryRun ? 'on' : 'off'}`;
    case 'tickets':
      return `${s.tickets.categories.length} categories · ${channelText(s.tickets.panelChannelId)}`;
    case 'suggestions':
      return `${onOff(s.suggestions.enabled)} · ${channelText(s.suggestions.channelId)}`;
    case 'changelog':
      return channelText(s.changelog.channelId);
    case 'announcements':
      return channelText(s.announcements.channelId);
    default:
      return getModule(def.key).summary?.(s) ?? 'Ready';
  }
}

/**
 * Build the Staff Hub: live status rows, the navigator select, and the quick-action buttons.
 * @param {import('discord.js').Client} client
 * @param {string} guildId
 * @param {{ ephemeral?: boolean }} [opts]
 */
export function renderHub(client, guildId, { ephemeral = false } = {}) {
  const s = settings.get(guildId);
  const c = card({
    accent: MODULE_ACCENTS.hub,
    title: 'BattleScout HQ · Staff Hub',
    subtitle: 'Pick a panel below. Everything here is configured from Discord.',
    iconUrl: client.user.displayAvatarURL(),
  });
  divider(c, { large: true });

  // Plain status lines, one text block per group: a button beside every row costs three
  // components each and the hub outgrew the 40-component message limit. The select opens panels.
  for (const [group, heading] of Object.entries(HUB_GROUPS)) {
    const lines = PANEL_CATALOG.filter((d) => d.group === group).map(
      (d) => `${inline(d.emoji)} **${d.label}** · ${summarise(d, s)}`,
    );
    text(c, `### ${heading}\n${lines.join('\n')}`);
  }

  divider(c);
  controls(c, {
    select: stringSelect({
      id: encode('panels', 'nav'),
      placeholder: 'Open a panel…',
      options: PANEL_CATALOG.map((d) => ({
        label: d.label,
        value: d.key,
        description: d.description,
        emoji: d.emoji,
      })),
    }),
    buttons: [
      button({
        id: encode('panels', 'quick', 'changelog'),
        label: 'New changelog',
        emoji: 'changelog',
        style: ButtonStyle.Primary,
      }),
      button({
        id: encode('panels', 'quick', 'announcements'),
        label: 'New announcement',
        emoji: 'announcement',
        style: ButtonStyle.Primary,
      }),
      button({
        id: encode('panels', 'quick', 'giveaways'),
        label: 'New giveaway',
        emoji: 'giveaway',
        style: ButtonStyle.Primary,
      }),
      button({ id: encode('panels', 'refresh'), label: 'Refresh', emoji: 'refresh' }),
    ],
  });

  return render(c, { name: 'hub', ephemeral });
}

/**
 * Placeholder card for a panel whose module has not shipped yet.
 * @param {typeof PANEL_CATALOG[number]} def
 */
export function placeholderCard(def) {
  const c = card({
    accent: MODULE_ACCENTS[def.key] ?? MODULE_ACCENTS.hub,
    title: `${inline(def.emoji)} ${def.label}`,
    subtitle: def.description,
  });
  divider(c);
  text(c, `This panel is built in **phase ${def.phase}**. Nothing to configure yet.`);
  divider(c, { line: false });
  controls(c, { buttons: [backButton()] });
  return c;
}
