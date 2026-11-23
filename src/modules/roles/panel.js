import { ChannelType } from 'discord.js';
import { MODULE_ACCENTS, ROLE_PANEL_LIMITS } from '../../config/constants.js';
import { inline } from '../../config/emoji.js';
import { encode } from '../../lib/customId.js';
import { card, controls, divider, row, text } from '../../lib/ui/card.js';
import {
  button,
  ButtonStyle,
  channelSelect,
  roleSelect,
  stringSelect,
} from '../../lib/ui/components.js';
import { backButton } from '../../lib/ui/nav.js';
import { RolePanel } from '../../models/RolePanel.js';
import { roleProblem } from './service.js';
import { STRINGS } from './strings.js';

const link = (g, c, m) => `https://discord.com/channels/${g}/${c}/${m}`;

/**
 * The Role panels list: every active panel and a button to start a new one.
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<import('discord.js').ContainerBuilder>}
 */
export async function buildRolesCard(guild) {
  const panels = await RolePanel.find({ guildId: guild.id, active: true })
    .sort({ createdAt: -1 })
    .limit(ROLE_PANEL_LIMITS.maxListed)
    .lean();
  const c = card({
    accent: MODULE_ACCENTS.roles,
    title: `${inline('roles')} Role panels`,
    subtitle: 'Buttons members click to give themselves roles, such as ping roles',
  });
  divider(c);
  text(
    c,
    panels.length
      ? panels
          .map((p) => {
            const where = p.messageId
              ? link(guild.id, p.channelId, p.messageId)
              : p.channelId
                ? `<#${p.channelId}> · not published`
                : 'no channel yet';
            return `**${p.title}** · ${p.roles.length} role${p.roles.length === 1 ? '' : 's'} · ${where}`;
          })
          .join('\n')
      : 'No role panels yet. Create one below.',
  );
  divider(c, { line: false });
  if (panels.length) {
    controls(c, {
      select: stringSelect({
        id: encode('roles', 'manage'),
        placeholder: 'Edit a role panel…',
        options: panels.map((p) => ({
          label: p.title.slice(0, 100),
          value: String(p._id),
          description: `${p.roles.length} roles · ${p.layout} · ${p.mode === 'one' ? 'pick one' : 'pick any'}`,
        })),
      }),
    });
  }
  controls(c, {
    buttons: [
      button({
        id: encode('roles', 'new'),
        label: 'New role panel',
        emoji: 'roles',
        style: ButtonStyle.Primary,
      }),
      backButton(),
    ],
  });
  return c;
}

/** One line per role: its label, emoji, and anything that stops it from being given. */
function roleLines(guild, doc) {
  if (!doc.roles.length) return STRINGS.emptyHint;
  return doc.roles
    .map((r) => {
      const problem = roleProblem(guild, guild.roles.cache.get(r.roleId));
      const label = r.label ? ` as "${r.label}"` : '';
      const flag = problem ? ` ${inline('warn')} ${problem}` : '';
      return `${r.emoji ? `${r.emoji} ` : ''}<@&${r.roleId}>${label}${flag}`;
    })
    .join('\n');
}

/**
 * Edit one role panel: where it goes, which roles, how members pick, then publish.
 * @param {import('discord.js').Guild} guild
 * @param {object} doc
 * @param {{ confirmRemove?: boolean }} [opts]
 * @returns {import('discord.js').ContainerBuilder}
 */
export function buildManageCard(guild, doc, { confirmRemove = false } = {}) {
  const id = String(doc._id);
  const c = card({
    accent: MODULE_ACCENTS.roles,
    title: `${inline('roles')} ${doc.title}`,
    subtitle: doc.description ? doc.description.slice(0, 200) : 'No description',
  });
  divider(c);
  row(c, {
    label: 'Published',
    value: doc.messageId
      ? `${link(guild.id, doc.channelId, doc.messageId)}\nChanges show after you press Update.`
      : doc.channelId
        ? `Not yet. It will post in <#${doc.channelId}>.`
        : 'Not yet. Pick a channel below.',
  });
  row(c, {
    label: 'Members can',
    value: doc.mode === 'one' ? 'Hold one role from this panel' : 'Pick any number of roles',
    button: button({ id: encode('roles', 'mode', id), label: 'Switch' }),
  });
  row(c, {
    label: 'Layout',
    value:
      doc.layout === 'select'
        ? `Select menu (up to ${ROLE_PANEL_LIMITS.maxSelect} roles)`
        : `Buttons (up to ${ROLE_PANEL_LIMITS.maxButtons} roles)`,
    button: button({ id: encode('roles', 'layout', id), label: 'Switch' }),
  });
  row(c, { label: `Roles (${doc.roles.length})`, value: roleLines(guild, doc) });
  divider(c, { line: false });

  controls(c, {
    select: channelSelect({
      id: encode('roles', 'channel', id),
      placeholder: 'Channel to post the panel in…',
      channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
      defaults: doc.channelId ? [doc.channelId] : [],
    }),
  });
  controls(c, {
    select: roleSelect({
      id: encode('roles', 'setroles', id),
      placeholder: 'Roles on this panel…',
      min: 0,
      max: ROLE_PANEL_LIMITS.maxSelect,
      defaults: doc.roles.map((r) => r.roleId),
    }),
  });
  if (doc.roles.length) {
    controls(c, {
      select: stringSelect({
        id: encode('roles', 'label', id),
        placeholder: "Edit a role's label, emoji or description…",
        options: doc.roles.map((r) => ({
          label: (r.label ?? guild.roles.cache.get(r.roleId)?.name ?? 'Deleted role').slice(0, 100),
          value: r.roleId,
        })),
      }),
    });
  }
  controls(c, {
    buttons: [
      button({
        id: encode('roles', 'publish', id),
        label: doc.messageId ? 'Update' : 'Publish',
        emoji: 'open',
        style: ButtonStyle.Success,
      }),
      button({ id: encode('roles', 'text', id), label: 'Edit text', emoji: 'draft' }),
      confirmRemove
        ? button({
            id: encode('roles', 'removeconfirm', id),
            label: 'Confirm remove',
            style: ButtonStyle.Danger,
          })
        : button({ id: encode('roles', 'remove', id), label: 'Remove', style: ButtonStyle.Danger }),
      button({ id: encode('roles', 'home'), label: 'All panels', emoji: 'back' }),
    ],
  });
  return c;
}
