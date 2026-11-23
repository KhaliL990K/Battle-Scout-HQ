import { ChannelType, PermissionFlagsBits } from 'discord.js';
import { LOG_COLORS, TICKET_LIMITS } from '../../config/constants.js';
import { DISCORD_ERR, isDiscordError } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';
import { isStaff } from '../../lib/permissions.js';
import * as settings from '../../lib/settings.js';
import { nextSeq } from '../../models/Counter.js';
import { Ticket } from '../../models/Ticket.js';
import { logEvent } from '../logging/logEvent.js';
import { STRINGS } from './strings.js';
import { buildTranscript, collectMessages } from './transcript.js';
import { pad, renderTicketCard, renderTranscriptCard } from './view.js';

const P = PermissionFlagsBits;
const MEMBER_ALLOW = [
  P.ViewChannel,
  P.SendMessages,
  P.ReadMessageHistory,
  P.AttachFiles,
  P.EmbedLinks,
];

/**
 * Ticket staff: general staff plus anyone holding a role configured for tickets.
 * @param {import('discord.js').GuildMember|null} member
 * @returns {boolean}
 */
export function isTicketStaff(member) {
  if (!member) return false;
  if (isStaff(member)) return true;
  const { staffRoleIds } = settings.get(member.guild.id).tickets;
  return staffRoleIds.some((id) => member.roles.cache.has(id));
}

/** Staff roles that exist in the guild, from both the general and the ticket-specific lists. */
function staffRoles(guild) {
  const s = settings.get(guild.id);
  const ids = new Set([...s.staff.roleIds, ...s.tickets.staffRoleIds]);
  return [...ids].filter((id) => guild.roles.cache.has(id));
}

const channelName = (number, username) =>
  `ticket-${pad(number)}-${
    username
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'user'
  }`.slice(0, 100);

/** Private to the opener, ticket staff and the bot. */
function overwrites(guild, openerId) {
  return [
    { id: guild.roles.everyone.id, deny: [P.ViewChannel] },
    { id: openerId, allow: MEMBER_ALLOW },
    ...staffRoles(guild).map((id) => ({ id, allow: [...MEMBER_ALLOW, P.ManageMessages] })),
    {
      id: guild.members.me.id,
      allow: [...MEMBER_ALLOW, P.ManageChannels, P.ManageMessages],
    },
  ];
}

/**
 * Open a ticket. The unique partial index is the real "one open ticket per category" guard, so
 * a double click cannot create two channels.
 * @param {import('discord.js').ModalSubmitInteraction} interaction
 * @param {{ key: string, label: string }} cat
 * @param {Array<{ question: string, answer: string }>} answers
 * @returns {Promise<{ ticket: object, existing: boolean }>}
 */
export async function createTicket(interaction, cat, answers) {
  const { guild, user, member } = interaction;
  const cfg = settings.get(guild.id).tickets;
  const number = await nextSeq(guild.id, 'ticket');

  let ticket;
  try {
    ticket = await Ticket.create({
      guildId: guild.id,
      number,
      openerId: user.id,
      openerName: member?.displayName ?? user.username,
      categoryKey: cat.key,
      categoryLabel: cat.label,
      answers,
    });
  } catch (err) {
    if (err.code !== 11000) throw err;
    const existing = await Ticket.findOne({
      guildId: guild.id,
      openerId: user.id,
      categoryKey: cat.key,
      status: 'open',
    }).lean();
    return { ticket: existing, existing: true };
  }

  let channel;
  try {
    channel = await guild.channels.create({
      name: channelName(number, user.username),
      type: ChannelType.GuildText,
      parent: cfg.categoryId,
      topic: `${cat.label} · ticket #${pad(number)} · opened by ${user.username}`,
      permissionOverwrites: overwrites(guild, user.id),
    });
  } catch (err) {
    // History is never deleted: free the slot by closing the record.
    await Ticket.updateOne(
      { _id: ticket._id },
      { status: 'closed', closeReason: 'Channel creation failed', channelDeleted: true },
    );
    throw err;
  }

  const sent = await channel.send({
    ...renderTicketCard(ticket),
    allowedMentions: { users: [user.id] },
  });
  const doc = await Ticket.findOneAndUpdate(
    { _id: ticket._id },
    { channelId: channel.id, controlMessageId: sent.id },
    { returnDocument: 'after' },
  ).lean();

  await logEvent({
    type: 'ticketEvent',
    title: `Ticket #${pad(number)} opened`,
    color: LOG_COLORS.green,
    actor: user,
    fields: [
      { name: 'Category', value: cat.label },
      { name: 'Channel', value: `<#${channel.id}>` },
    ],
  });
  return { ticket: doc, existing: false };
}

/**
 * Claim an unclaimed ticket, or release one you hold. Atomic, so two staff clicking at once
 * cannot both claim it.
 * @returns {Promise<{ doc: object|null, note: string, changed: boolean }>}
 */
export async function toggleClaim(ticketId, userId) {
  const claimed = await Ticket.findOneAndUpdate(
    { _id: ticketId, status: 'open', claimedById: null },
    { claimedById: userId },
    { returnDocument: 'after' },
  ).lean();
  if (claimed) return { doc: claimed, note: STRINGS.claimed(userId), changed: true };

  const released = await Ticket.findOneAndUpdate(
    { _id: ticketId, status: 'open', claimedById: userId },
    { claimedById: null },
    { returnDocument: 'after' },
  ).lean();
  if (released) return { doc: released, note: STRINGS.released(userId), changed: true };

  const current = await Ticket.findById(ticketId).lean();
  const note = current?.claimedById
    ? STRINGS.alreadyClaimed(current.claimedById)
    : STRINGS.alreadyClosed;
  return { doc: current, note, changed: false };
}

/**
 * Grant a user access to a ticket channel.
 * @param {import('discord.js').TextChannel} channel
 * @param {object} ticket
 * @param {import('discord.js').User} user
 */
export async function addTicketUser(channel, ticket, user) {
  await channel.permissionOverwrites.edit(user.id, {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
    AttachFiles: true,
  });
  return Ticket.findOneAndUpdate(
    { _id: ticket._id },
    { $addToSet: { addedUserIds: user.id } },
    { returnDocument: 'after' },
  ).lean();
}

/**
 * Revoke a user's access. The opener cannot be removed from their own ticket.
 * @returns {Promise<boolean>} whether anything was removed
 */
export async function removeTicketUser(channel, ticket, user) {
  if (user.id === ticket.openerId) return false;
  await channel.permissionOverwrites.delete(user.id);
  await Ticket.updateOne({ _id: ticket._id }, { $pull: { addedUserIds: user.id } });
  return true;
}

/** Build and deliver the transcript (transcript channel, then the opener's DMs). */
async function archiveTicket(client, ticket) {
  const channel = await client.channels.fetch(ticket.channelId).catch((err) => {
    if (!isDiscordError(err, DISCORD_ERR.unknownChannel)) throw err;
    return null;
  });
  if (!channel) {
    logger.warn({ number: ticket.number }, 'Ticket channel already gone; no transcript possible');
    await Ticket.updateOne({ _id: ticket._id }, { transcriptSent: true });
    return;
  }

  const { messages, truncated } = await collectMessages(channel);
  const file = buildTranscript(ticket, messages, truncated);
  const cfg = settings.get(ticket.guildId).tickets;

  const target = cfg.transcriptChannelId
    ? await client.channels.fetch(cfg.transcriptChannelId).catch(() => null)
    : null;
  if (target?.isTextBased()) {
    await target.send({
      ...renderTranscriptCard(ticket, file.name, ticket.closedById),
      files: [file],
      allowedMentions: { parse: [] },
    });
  }

  // Closed DMs are normal; the transcript channel copy is the record.
  const opener = await client.users.fetch(ticket.openerId).catch(() => null);
  await opener
    ?.send({
      content: STRINGS.dmClosed(ticket.categoryLabel, ticket.closeReason),
      files: [file],
    })
    .catch((err) => {
      if (!isDiscordError(err, DISCORD_ERR.cannotDm)) throw err;
    });
  await Ticket.updateOne({ _id: ticket._id }, { transcriptSent: true });
}

/** Delete the Discord channel of a closed ticket. Already gone counts as done. */
async function removeChannel(client, ticket) {
  try {
    const channel = await client.channels.fetch(ticket.channelId);
    await channel.delete(`Ticket #${pad(ticket.number)} closed`);
  } catch (err) {
    if (!isDiscordError(err, DISCORD_ERR.unknownChannel)) throw err;
  }
  await Ticket.updateOne({ _id: ticket._id }, { channelDeleted: true });
}

/**
 * Close a ticket: mark it closed, post the transcript, DM the opener, then delete the channel
 * after a short delay. Returns null when the ticket was not open (someone else got there first).
 * @param {import('discord.js').Client} client
 * @param {string} ticketId
 * @param {import('discord.js').User} actor
 * @param {string|null} reason
 * @returns {Promise<object|null>} the closed ticket
 */
export async function closeTicket(client, ticketId, actor, reason) {
  const ticket = await Ticket.findOneAndUpdate(
    { _id: ticketId, status: 'open' },
    {
      status: 'closed',
      closedById: actor.id,
      closeReason: reason || null,
      closedAtUnix: Math.floor(Date.now() / 1000),
    },
    { returnDocument: 'after' },
  ).lean();
  if (!ticket) return null;

  // Log the intent before the destructive part so a crash mid-close is still traceable.
  await logEvent({
    type: 'ticketEvent',
    title: `Ticket #${pad(ticket.number)} closed`,
    actor,
    target: { id: ticket.openerId, username: ticket.openerName },
    fields: [
      { name: 'Category', value: ticket.categoryLabel },
      { name: 'Reason', value: reason || '*none given*' },
    ],
  });

  const channel = await client.channels.fetch(ticket.channelId).catch(() => null);
  if (channel) {
    await channel
      .send({
        content: STRINGS.closing(TICKET_LIMITS.closeDelayMs / 1000, actor.id),
        allowedMentions: { parse: [] },
      })
      .catch((err) => logger.warn({ err: err.message }, 'Close notice failed'));
    if (ticket.controlMessageId) {
      await channel.messages
        .edit(ticket.controlMessageId, renderTicketCard(ticket, { closed: true }))
        .catch((err) => logger.warn({ err: err.message }, 'Could not retire control card'));
    }
  }

  await archiveTicket(client, ticket);
  setTimeout(() => {
    removeChannel(client, ticket).catch((err) =>
      logger.error({ err, number: ticket.number }, 'Ticket channel delete failed'),
    );
  }, TICKET_LIMITS.closeDelayMs);
  return ticket;
}

/**
 * Finish any close that a restart interrupted: missing transcript, undeleted channel.
 * @param {import('discord.js').Client} client
 */
export async function sweepClosedTickets(client) {
  const pending = await Ticket.find({
    status: 'closed',
    channelDeleted: false,
    channelId: { $ne: null },
  }).lean();
  for (const ticket of pending) {
    try {
      if (!ticket.transcriptSent) await archiveTicket(client, ticket);
      await removeChannel(client, ticket);
    } catch (err) {
      logger.error({ err, number: ticket.number }, 'Could not finish interrupted ticket close');
    }
  }
  if (pending.length) logger.info({ count: pending.length }, 'Finished interrupted ticket closes');
}
