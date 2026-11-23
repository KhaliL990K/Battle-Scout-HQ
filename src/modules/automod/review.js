import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import { AUTOMOD_LIMITS, INFRACTION_DECISIONS, LOG_COLORS } from '../../config/constants.js';
import { DISCORD_ERR, isDiscordError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { canActOn } from '../../lib/permissions.js';
import { render } from '../../lib/ui/card.js';
import { Infraction } from '../../models/Infraction.js';
import { logEvent } from '../logging/logEvent.js';
import { getConfig } from './config.js';
import { STRINGS } from './strings.js';
import { confirmCard, doneCard, pad, reviewCard } from './view.js';

const OPEN = ['active', 'quarantined'];
const say = (interaction, content) => interaction.reply({ content, flags: MessageFlags.Ephemeral });

/** Reply on the interaction whichever way it has already been acknowledged. */
const tell = (interaction, content) =>
  interaction.deferred || interaction.replied
    ? interaction.followUp({ content, flags: MessageFlags.Ephemeral })
    : say(interaction, content);

const fetchMember = (guild, userId) =>
  guild.members.fetch(userId).catch((err) => {
    if (isDiscordError(err, 10007)) return null; // Unknown Member: they left
    throw err;
  });

/**
 * Atomically move an open case to a new status. Only one staff member's click wins, so two
 * moderators cannot both ban, or release after a ban.
 */
function claim(id, status, actorId, extra = {}) {
  return Infraction.findOneAndUpdate(
    { _id: id, status: { $in: OPEN } },
    { status, decidedById: actorId, decidedAtUnix: Math.floor(Date.now() / 1000), ...extra },
    { returnDocument: 'before' },
  ).lean();
}

/** Put a case back after its action failed, so the buttons work again. */
const revert = (before) =>
  Infraction.updateOne(
    { _id: before._id },
    {
      status: before.status,
      decidedById: before.decidedById,
      decidedAtUnix: before.decidedAtUnix,
      removedRoleIds: before.removedRoleIds,
    },
  );

/** Rewrite the review card in Discord from the stored case, so buttons reflect its state. */
async function refreshCard(client, id) {
  const inf = await Infraction.findById(id).lean();
  if (!inf?.logMessageId) return;
  try {
    const channel = await client.channels.fetch(inf.logChannelId);
    await channel.messages.edit(
      inf.logMessageId,
      render(reviewCard(inf), { name: 'automod-case' }),
    );
  } catch (err) {
    if (!isDiscordError(err, DISCORD_ERR.unknownChannel, DISCORD_ERR.unknownMessage)) throw err;
    logger.warn({ case: inf.number }, 'Automod review card is gone; the case was still updated');
  }
}

async function recordDecision(interaction, inf, status) {
  await refreshCard(interaction.client, inf._id);
  const decision = INFRACTION_DECISIONS[status];
  await logEvent({
    type: 'automodAction',
    title: `Automod case #${pad(inf.number)}: ${decision.label}`,
    color: LOG_COLORS[decision.color],
    actor: interaction.user,
    fields: [
      { name: 'Member', value: `<@${inf.userId}> (${inf.userTag})` },
      { name: 'Signal', value: inf.signal },
    ],
    force: true,
  });
}

/** Load a case that can still be decided, or tell the clicker why not. */
async function openCase(interaction, id) {
  const inf = await Infraction.findById(id).lean();
  if (!inf) {
    await say(interaction, STRINGS.missingCase);
    return null;
  }
  if (!OPEN.includes(inf.status)) {
    await say(interaction, STRINGS.alreadyDecided);
    return null;
  }
  return inf;
}

/** Release: lift the timeout and give back any roles quarantine took. */
export async function release(interaction, [id]) {
  const inf = await openCase(interaction, id);
  if (!inf) return;
  await interaction.deferUpdate();

  const before = await claim(id, 'released', interaction.user.id);
  if (!before) return tell(interaction, STRINGS.alreadyDecided);
  try {
    const member = await fetchMember(interaction.guild, inf.userId);
    if (member) {
      await member.timeout(null, `Automod case #${pad(inf.number)} released`);
      await restoreRoles(member, inf, getConfig(interaction.guildId));
    }
  } catch (err) {
    await revert(before);
    logger.warn({ err: err.message, case: inf.number }, 'Automod release failed');
    return tell(interaction, STRINGS.failed('release that member'));
  }
  await recordDecision(interaction, inf, 'released');
}

async function restoreRoles(member, inf, cfg) {
  if (cfg.quarantineRoleId && member.roles.cache.has(cfg.quarantineRoleId)) {
    await member.roles.remove(cfg.quarantineRoleId, 'Automod release');
  }
  const back = inf.removedRoleIds.filter((r) => member.guild.roles.cache.has(r));
  if (back.length) await member.roles.add(back, 'Automod release');
}

/** Quarantine: strip roles, add the quarantine role, keep the timeout. */
export async function quarantine(interaction, [id]) {
  const inf = await openCase(interaction, id);
  if (!inf) return;
  const cfg = getConfig(interaction.guildId);
  if (!cfg.quarantineRoleId) return say(interaction, STRINGS.noQuarantineRole);
  await interaction.deferUpdate();

  const member = await fetchMember(interaction.guild, inf.userId);
  if (!member) return tell(interaction, STRINGS.memberGone);
  const me = interaction.guild.members.me;
  if (!me.permissions.has(PermissionFlagsBits.ManageRoles) || !canActOn(me, member)) {
    return tell(interaction, STRINGS.cannotAct);
  }

  const strip = member.roles.cache.filter(
    (r) =>
      r.id !== member.guild.id &&
      r.id !== cfg.quarantineRoleId &&
      !r.managed &&
      me.roles.highest.comparePositionTo(r) > 0,
  );
  const before = await claim(id, 'quarantined', interaction.user.id, {
    removedRoleIds: [...strip.keys()],
  });
  if (!before) return tell(interaction, STRINGS.alreadyDecided);
  try {
    await member.roles.add(cfg.quarantineRoleId, `Automod case #${pad(inf.number)}`);
    if (strip.size) await member.roles.remove([...strip.keys()], 'Automod quarantine');
  } catch (err) {
    await revert(before);
    logger.warn({ err: err.message, case: inf.number }, 'Automod quarantine failed');
    return tell(interaction, STRINGS.failed('quarantine that member'));
  }
  await recordDecision(interaction, inf, 'quarantined');
}

/** Kick and Ban first ask for confirmation, since neither can be undone from here. */
export async function kick(interaction, [id]) {
  const inf = await openCase(interaction, id);
  if (inf) await showConfirm(interaction, 'kick', inf, STRINGS.confirmKick(inf.userTag));
}

export async function ban(interaction, [id]) {
  const inf = await openCase(interaction, id);
  if (inf) await showConfirm(interaction, 'ban', inf, STRINGS.confirmBan(inf.userTag));
}

const showConfirm = (interaction, action, inf, body) =>
  interaction.reply(
    render(confirmCard(action, String(inf._id), body), {
      name: 'automod-confirm',
      ephemeral: true,
    }),
  );

export const cancelconfirm = (interaction) =>
  interaction.update(render(doneCard('Cancelled. Nothing changed.'), { name: 'automod-confirm' }));

export async function kickok(interaction, [id]) {
  await finalise(interaction, id, 'kicked', 'kick', async (inf) => {
    const member = await fetchMember(interaction.guild, inf.userId);
    if (!member) return STRINGS.memberGone;
    if (!canActOn(interaction.guild.members.me, member)) return STRINGS.cannotAct;
    await member.kick(`Automod case #${pad(inf.number)} by ${interaction.user.tag}`);
    return null;
  });
}

export async function banok(interaction, [id]) {
  await finalise(interaction, id, 'banned', 'ban', async (inf) => {
    const member = await fetchMember(interaction.guild, inf.userId);
    if (member && !canActOn(interaction.guild.members.me, member)) return STRINGS.cannotAct;
    await interaction.guild.bans.create(inf.userId, {
      deleteMessageSeconds: AUTOMOD_LIMITS.banDeleteSeconds,
      reason: `Automod case #${pad(inf.number)} by ${interaction.user.tag}`,
    });
    return null;
  });
}

/** Shared tail of kick and ban: claim, act (logging intent first), refresh, confirm. */
async function finalise(interaction, id, status, verb, action) {
  await interaction.deferUpdate();
  const before = await claim(id, status, interaction.user.id);
  if (!before) {
    return interaction.editReply(
      render(doneCard(STRINGS.alreadyDecided), { name: 'automod-done' }),
    );
  }
  logger.info({ case: before.number, status, by: interaction.user.id }, 'Automod decision');
  try {
    const problem = await action(before);
    if (problem) {
      await revert(before);
      return interaction.editReply(render(doneCard(problem), { name: 'automod-done' }));
    }
  } catch (err) {
    await revert(before);
    logger.warn({ err: err.message, case: before.number }, 'Automod decision failed');
    return interaction.editReply(render(doneCard(STRINGS.failed(verb)), { name: 'automod-done' }));
  }
  await recordDecision(interaction, before, status);
  await interaction.editReply(
    render(doneCard(`Case #${pad(before.number)}: ${INFRACTION_DECISIONS[status].label}.`), {
      name: 'automod-done',
    }),
  );
}
