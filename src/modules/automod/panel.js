import { ChannelType } from 'discord.js';
import { AUTOMOD_LIMITS, AUTOMOD_SIGNALS, MODULE_ACCENTS } from '../../config/constants.js';
import { inline } from '../../config/emoji.js';
import { encode } from '../../lib/customId.js';
import * as settings from '../../lib/settings.js';
import { card, controls, divider, row } from '../../lib/ui/card.js';
import {
  button,
  ButtonStyle,
  channelSelect,
  roleSelect,
  stringSelect,
} from '../../lib/ui/components.js';
import { backButton } from '../../lib/ui/nav.js';
import { Infraction } from '../../models/Infraction.js';
import { getConfig } from './config.js';

const onOff = (flag) => `${inline(flag ? 'on' : 'off')} ${flag ? 'On' : 'Off'}`;

function thresholdLines(cfg) {
  const on = cfg.signals;
  const lines = [];
  if (on.crossChannel) {
    lines.push(
      `Duplicate: ${cfg.crossChannel.channels}+ channels in ${cfg.crossChannel.windowSec}s`,
    );
  }
  if (on.rapidRepeat) {
    lines.push(`Rapid: ${cfg.rapidRepeat.count}+ messages in ${cfg.rapidRepeat.seconds}s`);
  }
  if (on.massMention) lines.push(`Mentions: more than ${cfg.massMention.max}`);
  if (on.riskyLink) {
    const r = cfg.riskyLink;
    lines.push(
      `Links: account under ${r.accountAgeHours}h or joined under ${r.joinAgeHours}h${r.flagNoRoles ? ', or no roles' : ''}`,
    );
  }
  if (on.honeypot) lines.push('Honeypot: any post');
  return lines.length ? lines.join('\n') : 'No signals are switched on.';
}

/**
 * Build the Automod settings card. Async because it counts recent cases.
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<import('discord.js').ContainerBuilder>}
 */
export async function buildAutomodCard(guild) {
  const cfg = getConfig(guild.id);
  const logging = settings.get(guild.id).logging;
  const since = Math.floor(Date.now() / 1000) - 86_400;
  const [cases, open] = await Promise.all([
    Infraction.countDocuments({ guildId: guild.id, createdAt: { $gte: new Date(since * 1000) } }),
    Infraction.countDocuments({ guildId: guild.id, status: { $in: ['active', 'quarantined'] } }),
  ]);

  const c = card({
    accent: MODULE_ACCENTS.automod,
    title: `${inline('shield')} Automod`,
    subtitle: 'Catches compromised accounts blasting the same message everywhere',
  });
  divider(c);
  row(c, {
    label: 'Status',
    value: `${onOff(cfg.enabled)} · ${
      cfg.dryRun
        ? `${inline('warn')} **dry-run**: logs what it would do, touches nothing`
        : '**LIVE**: deletes, times out and posts a review card'
    }`,
  });
  row(c, {
    label: 'On a hit',
    value: `Delete their recent messages · time out ${cfg.timeoutHours}h · DM ${cfg.dmMember ? 'on' : 'off'}\nRemembers the last ${cfg.lookbackMinutes} min of each member's messages`,
  });
  row(c, { label: 'Signals', value: thresholdLines(cfg) });
  row(c, {
    label: 'Honeypot / quarantine',
    value: `${cfg.honeypotChannelId ? `<#${cfg.honeypotChannelId}>` : 'No honeypot channel'} · ${
      cfg.quarantineRoleId ? `<@&${cfg.quarantineRoleId}>` : 'no quarantine role'
    }`,
  });
  row(c, {
    label: 'Exempt roles (staff always are)',
    value: cfg.exemptRoleIds.length ? cfg.exemptRoleIds.map((id) => `<@&${id}>`).join(' ') : 'None',
  });
  row(c, {
    label: 'Cases',
    value: `${cases} in the last 24h · ${open} awaiting a decision${
      logging.channelId
        ? ''
        : `\n${inline('warn')} No log channel is set, so review cards cannot be posted.`
    }`,
  });
  divider(c, { line: false });

  controls(c, {
    select: stringSelect({
      id: encode('automod', 'signals'),
      placeholder: 'Active signals…',
      min: 0,
      max: Object.keys(AUTOMOD_SIGNALS).length,
      options: Object.entries(AUTOMOD_SIGNALS).map(([value, def]) => ({
        label: def.label,
        value,
        description: def.description,
        default: Boolean(cfg.signals[value]),
      })),
    }),
  });
  controls(c, {
    select: roleSelect({
      id: encode('automod', 'exempt'),
      placeholder: 'Exempt roles…',
      min: 0,
      max: AUTOMOD_LIMITS.maxExemptRoles,
      defaults: cfg.exemptRoleIds,
    }),
  });
  controls(c, {
    select: channelSelect({
      id: encode('automod', 'honeypot'),
      placeholder: 'Honeypot channel (optional)…',
      channelTypes: [ChannelType.GuildText],
      defaults: cfg.honeypotChannelId ? [cfg.honeypotChannelId] : [],
      min: 0,
    }),
  });
  controls(c, {
    select: roleSelect({
      id: encode('automod', 'quarantinerole'),
      placeholder: 'Quarantine role (optional)…',
      min: 0,
      max: 1,
      defaults: cfg.quarantineRoleId ? [cfg.quarantineRoleId] : [],
    }),
  });
  controls(c, {
    buttons: [
      button({
        id: encode('automod', 'power'),
        label: cfg.enabled ? 'Disable' : 'Enable',
        style: cfg.enabled ? ButtonStyle.Secondary : ButtonStyle.Success,
      }),
      button({
        id: encode('automod', 'dryrun'),
        label: cfg.dryRun ? 'Go live' : 'Back to dry-run',
        style: cfg.dryRun ? ButtonStyle.Danger : ButtonStyle.Secondary,
      }),
      button({ id: encode('automod', 'dmtoggle'), label: cfg.dmMember ? 'DM: on' : 'DM: off' }),
    ],
  });
  controls(c, {
    buttons: [
      button({ id: encode('automod', 'timing'), label: 'Timeout and memory', emoji: 'settings' }),
      button({ id: encode('automod', 'thresholds'), label: 'Thresholds', emoji: 'settings' }),
      button({ id: encode('automod', 'linkrules'), label: 'Link rules', emoji: 'settings' }),
      backButton(),
    ],
  });
  return c;
}
