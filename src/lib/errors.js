import { randomBytes } from 'node:crypto';
import { MessageFlags } from 'discord.js';
import { logger } from './logger.js';

/** Discord API codes handled by name rather than allowed to crash a handler. */
export const DISCORD_ERR = Object.freeze({
  unknownChannel: 10003,
  unknownMessage: 10008,
  cannotDm: 50007,
  missingPermissions: 50013,
});

/**
 * True when err is a DiscordAPIError carrying one of the given codes.
 * @param {unknown} err
 * @param {...number} codes
 * @returns {boolean}
 */
export function isDiscordError(err, ...codes) {
  return Boolean(err && typeof err === 'object' && codes.includes(err.code));
}

/**
 * Log an interaction failure with context and reply ephemerally with a short error id.
 * @param {import('discord.js').Interaction} interaction
 * @param {unknown} err
 * @param {{ module?: string, action?: string }} [ctx]
 */
export async function reportInteractionError(interaction, err, ctx = {}) {
  const errorId = `ERR-${randomBytes(2).toString('hex').toUpperCase()}`;
  logger.error(
    { err, errorId, ...ctx, userId: interaction.user?.id, guildId: interaction.guildId },
    'Interaction handler failed',
  );
  const payload = {
    content: `Something went wrong. Tell an admin the error id: \`${errorId}\``,
    flags: MessageFlags.Ephemeral,
  };
  try {
    if (interaction.deferred || interaction.replied) await interaction.followUp(payload);
    else await interaction.reply(payload);
  } catch (replyErr) {
    logger.warn({ err: replyErr.message, errorId }, 'Could not deliver error reply');
  }
}
