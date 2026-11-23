import { ChannelType } from 'discord.js';
import { LOG_EVENT_TYPES, MODULE_ACCENTS } from '../../config/constants.js';
import { inline } from '../../config/emoji.js';
import { encode } from '../../lib/customId.js';
import * as settings from '../../lib/settings.js';
import { card, controls, divider, row } from '../../lib/ui/card.js';
import { button, ButtonStyle, channelSelect, stringSelect } from '../../lib/ui/components.js';
import { backButton } from '../../lib/ui/nav.js';

/**
 * Build the Logs settings card from cached settings.
 * @param {string} guildId
 * @returns {import('discord.js').ContainerBuilder}
 */
export function buildLogsCard(guildId) {
  const { logging } = settings.get(guildId);
  const activeCount = Object.keys(LOG_EVENT_TYPES).filter(
    (k) => logging.events?.[k] !== false,
  ).length;

  const c = card({
    accent: MODULE_ACCENTS.logging,
    title: `${inline('logs')} Logs`,
    subtitle: 'One colour-coded channel for everything the bot sees and does',
  });
  divider(c);

  row(c, {
    label: 'Status',
    value: `${inline(logging.enabled ? 'on' : 'off')} ${logging.enabled ? 'Enabled' : 'Disabled'}`,
    button: button({
      id: encode('logging', 'power'),
      label: logging.enabled ? 'Disable' : 'Enable',
      style: logging.enabled ? ButtonStyle.Secondary : ButtonStyle.Success,
    }),
  });
  row(c, {
    label: 'Log channel',
    value: logging.channelId ? `<#${logging.channelId}>` : 'Not set. Pick one below.',
  });
  row(c, {
    label: 'Event types',
    value: `${activeCount} of ${Object.keys(LOG_EVENT_TYPES).length} enabled`,
  });
  divider(c, { line: false });

  controls(c, {
    select: channelSelect({
      id: encode('logging', 'channel'),
      placeholder: 'Choose the log channel…',
      channelTypes: [ChannelType.GuildText],
      defaults: logging.channelId ? [logging.channelId] : [],
    }),
  });
  controls(c, {
    select: stringSelect({
      id: encode('logging', 'events'),
      placeholder: 'Choose which events are logged…',
      min: 0,
      max: Object.keys(LOG_EVENT_TYPES).length,
      options: Object.entries(LOG_EVENT_TYPES).map(([key, def]) => ({
        label: def.label,
        value: key,
        default: logging.events?.[key] !== false,
      })),
    }),
  });
  controls(c, {
    buttons: [
      button({ id: encode('logging', 'test'), label: 'Send test entry', emoji: 'logs' }),
      backButton(),
    ],
  });
  return c;
}
