import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import { ROLE_PANEL_LIMITS } from '../../config/constants.js';
import { env } from '../../config/env.js';
import { encode } from '../../lib/customId.js';
import { logger } from '../../lib/logger.js';
import { render } from '../../lib/ui/card.js';
import { showCard } from '../../lib/ui/respond.js';
import { RolePanel } from '../../models/RolePanel.js';
import { buildManageCard, buildRolesCard } from './panel.js';
import {
  activeCount,
  cleanEmoji,
  loadPanel,
  pickRoles,
  publishPanel,
  publishProblems,
  refreshCount,
  removePanel,
  roleProblem,
  setChannel,
  toggleRole,
} from './service.js';
import { STRINGS } from './strings.js';

const say = (interaction, content) =>
  interaction.reply({ content, flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });

const field = (id, label, value, { style = TextInputStyle.Short, max, required = false } = {}) => {
  const input = new TextInputBuilder()
    .setCustomId(id)
    .setLabel(label)
    .setStyle(style)
    .setRequired(required)
    .setMaxLength(max);
  if (value) input.setValue(String(value));
  return new ActionRowBuilder().addComponents(input);
};

/** Re-render the manage card for a panel after a change. */
async function showManage(interaction, id, opts) {
  const doc = await loadPanel(id);
  if (!doc?.active) return showCard(interaction, await buildRolesCard(interaction.guild), 'roles');
  return showCard(interaction, buildManageCard(interaction.guild, doc, opts), 'roles-manage');
}

// ---- staff: list and create

const home = async (interaction) =>
  showCard(interaction, await buildRolesCard(interaction.guild), 'roles');

/** Title/description modal, used to create a panel and to edit its text. */
function textModal(customId, doc = {}) {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle('Role panel')
    .addComponents(
      field('title', 'Title', doc.title, { max: ROLE_PANEL_LIMITS.titleChars, required: true }),
      field('description', 'Description (optional)', doc.description, {
        style: TextInputStyle.Paragraph,
        max: ROLE_PANEL_LIMITS.descriptionChars,
      }),
    );
}

const create = (interaction) => interaction.showModal(textModal(encode('roles', 'createsubmit')));

async function createsubmit(interaction) {
  const doc = await RolePanel.create({
    guildId: interaction.guildId,
    title: interaction.fields.getTextInputValue('title').trim(),
    description: interaction.fields.getTextInputValue('description').trim(),
    createdById: interaction.user.id,
  });
  await refreshCount(interaction.guildId);
  await showCard(interaction, buildManageCard(interaction.guild, doc.toObject()), 'roles-manage');
}

const manage = (interaction, [id]) => showManage(interaction, interaction.values?.[0] ?? id);

async function textedit(interaction, [id]) {
  const doc = await loadPanel(id);
  if (!doc?.active) return say(interaction, STRINGS.missing);
  await interaction.showModal(textModal(encode('roles', 'textsubmit', id), doc));
}

async function textsubmit(interaction, [id]) {
  await RolePanel.updateOne(
    { _id: id, active: true },
    {
      title: interaction.fields.getTextInputValue('title').trim(),
      description: interaction.fields.getTextInputValue('description').trim(),
    },
  );
  await showManage(interaction, id);
}

// ---- staff: configure

async function channel(interaction, [id]) {
  const doc = await loadPanel(id);
  if (!doc?.active) return home(interaction);
  await setChannel(interaction.guild, doc, interaction.values[0]);
  await showManage(interaction, id);
}

/**
 * Role select: the chosen roles become the panel's list. Existing labels are kept for roles that
 * stay; unsafe roles are refused and reported, the rest are saved.
 */
async function setroles(interaction, [id]) {
  const doc = await loadPanel(id);
  if (!doc?.active) return home(interaction);
  const max = doc.layout === 'select' ? ROLE_PANEL_LIMITS.maxSelect : ROLE_PANEL_LIMITS.maxButtons;
  if (interaction.values.length > max) return say(interaction, STRINGS.tooManyButtons(max));

  const refused = [];
  const roles = [];
  for (const roleId of interaction.values) {
    const problem = roleProblem(interaction.guild, interaction.guild.roles.cache.get(roleId));
    if (problem) refused.push(`- <@&${roleId}>: ${problem}`);
    else roles.push(doc.roles.find((r) => r.roleId === roleId) ?? { roleId });
  }
  await RolePanel.updateOne({ _id: id }, { roles });
  await showManage(interaction, id);
  if (refused.length) {
    await interaction.followUp({
      content: STRINGS.refused(refused),
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
  }
}

async function mode(interaction, [id]) {
  const doc = await loadPanel(id);
  if (!doc?.active) return home(interaction);
  await RolePanel.updateOne({ _id: id }, { mode: doc.mode === 'one' ? 'many' : 'one' });
  await showManage(interaction, id);
}

async function layout(interaction, [id]) {
  const doc = await loadPanel(id);
  if (!doc?.active) return home(interaction);
  const next = doc.layout === 'select' ? 'buttons' : 'select';
  if (next === 'buttons' && doc.roles.length > ROLE_PANEL_LIMITS.maxButtons) {
    return say(interaction, STRINGS.tooManyButtons(ROLE_PANEL_LIMITS.maxButtons));
  }
  await RolePanel.updateOne({ _id: id }, { layout: next });
  await showManage(interaction, id);
}

/** Label select: open the per-role modal. */
async function label(interaction, [id]) {
  const doc = await loadPanel(id);
  const roleId = interaction.values[0];
  const entry = doc?.roles.find((r) => r.roleId === roleId);
  if (!entry) return say(interaction, STRINGS.missing);
  const name = interaction.guild.roles.cache.get(roleId)?.name ?? 'role';
  await interaction.showModal(
    new ModalBuilder()
      .setCustomId(encode('roles', 'labelsubmit', id, roleId))
      .setTitle(`Role: ${name}`.slice(0, 45))
      .addComponents(
        field('label', `Label (blank uses the role name)`, entry.label, {
          max: ROLE_PANEL_LIMITS.labelChars,
        }),
        field('emoji', 'Emoji (optional, e.g. 🔔 or <:name:id>)', entry.emoji, { max: 64 }),
        field('description', 'Description (optional)', entry.description, {
          max: ROLE_PANEL_LIMITS.roleDescriptionChars,
        }),
      ),
  );
}

async function labelsubmit(interaction, [id, roleId]) {
  const emoji = cleanEmoji(interaction.fields.getTextInputValue('emoji'));
  if (emoji === false) return say(interaction, STRINGS.badEmoji);
  const text = (k) => interaction.fields.getTextInputValue(k).trim() || null;
  await RolePanel.updateOne(
    { _id: id, 'roles.roleId': roleId },
    {
      $set: {
        'roles.$.label': text('label'),
        'roles.$.emoji': emoji,
        'roles.$.description': text('description'),
      },
    },
  );
  await showManage(interaction, id);
}

async function publish(interaction, [id]) {
  const doc = await loadPanel(id);
  if (!doc?.active) return home(interaction);
  const problems = publishProblems(interaction.guild, doc);
  if (problems.length) return say(interaction, problems.join('\n'));
  await interaction.deferUpdate();
  await publishPanel(interaction.guild, doc, interaction.user);
  const fresh = await loadPanel(id);
  await interaction.editReply(
    render(buildManageCard(interaction.guild, fresh), { name: 'roles-manage' }),
  );
}

const remove = (interaction, [id]) => showManage(interaction, id, { confirmRemove: true });

async function removeconfirm(interaction, [id]) {
  const doc = await loadPanel(id);
  if (doc?.active) await removePanel(interaction.guild, doc, interaction.user);
  await home(interaction);
}

// ---- members

/** Check the clicked role is still on this panel and still safe to hand out. */
function checkRole(interaction, panel, roleId) {
  if (!panel?.active) return STRINGS.inactive;
  if (!panel.roles.some((r) => r.roleId === roleId)) return STRINGS.notOffered;
  const problem = roleProblem(interaction.guild, interaction.guild.roles.cache.get(roleId));
  if (problem) {
    logger.warn({ panel: String(panel._id), roleId, problem }, 'Role panel role is unusable');
    return STRINGS.unavailable;
  }
  return null;
}

/** Button: `roles:toggle:<panelId>:<roleId>`. The panel document, not the id, decides. */
async function toggle(interaction, [id, roleId]) {
  const panel = await loadPanel(id);
  const problem = checkRole(interaction, panel, roleId);
  if (problem) return say(interaction, problem);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await interaction.editReply({
    content: await toggleRole(interaction.member, panel, roleId),
    allowedMentions: { parse: [] },
  });
}

/** Select: `roles:pick:<panelId>`, the chosen roles become the member's roles from this panel. */
async function pick(interaction, [id]) {
  const panel = await loadPanel(id);
  if (!panel?.active) return say(interaction, STRINGS.inactive);
  const chosen = panel.mode === 'one' ? interaction.values.slice(0, 1) : interaction.values;
  const offered = panel.roles.map((r) => r.roleId);
  // Every role this pick could add or remove has to be offered here and safe to touch.
  const touched = [
    ...new Set([...chosen, ...offered.filter((r) => interaction.member.roles.cache.has(r))]),
  ];
  for (const roleId of touched) {
    const problem = checkRole(interaction, panel, roleId);
    if (problem) return say(interaction, problem);
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await interaction.editReply({
    content: await pickRoles(interaction.member, panel, chosen),
    allowedMentions: { parse: [] },
  });
}

export default {
  name: 'roles',
  // Members click the public panel; everything else is staff-only and checked by the router.
  publicActions: ['toggle', 'pick'],
  init: () => refreshCount(env.GUILD_ID),
  panel: (interaction) => buildRolesCard(interaction.guild),
  summary: (s) => {
    const n = activeCount(s.guildId);
    return `${n} panel${n === 1 ? '' : 's'}`;
  },
  handlers: {
    home,
    new: create,
    createsubmit,
    manage,
    text: textedit,
    textsubmit,
    channel,
    setroles,
    mode,
    layout,
    label,
    labelsubmit,
    publish,
    remove,
    removeconfirm,
    toggle,
    pick,
  },
};
