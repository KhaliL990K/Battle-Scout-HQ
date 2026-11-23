import { LOG_COLORS, LOG_EVENT_TYPES } from '../../config/constants.js';
import { env } from '../../config/env.js';
import * as settings from '../../lib/settings.js';
import { card, text } from '../../lib/ui/card.js';
import { enqueue } from './queue.js';

const FIELD_MAX = 900;

/**
 * Truncate for display so one noisy event cannot blow the 4000-char message budget.
 * @param {string} value
 * @param {number} [max]
 * @returns {string}
 */
export function clip(value, max = FIELD_MAX) {
  const s = String(value ?? '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** "<@id> (tag)" so a log stays readable after the member leaves. */
const who = (user) => `<@${user.id}> (${user.tag ?? user.username})`;

/**
 * Build the log card for an event, or null when logging is off for it.
 */
function buildEntry({
  type,
  title,
  description,
  fields = [],
  actor = null,
  target = null,
  color,
  force = false,
  guildId = env.GUILD_ID,
}) {
  const def = LOG_EVENT_TYPES[type];
  if (!def) throw new Error(`Unknown log event type: ${type}`);

  const cfg = settings.get(guildId).logging;
  if (!cfg.channelId) return null;
  if (!force && (!cfg.enabled || cfg.events?.[type] === false)) return null;

  const now = Math.floor(Date.now() / 1000);
  const subject = target ?? actor;
  const c = card({
    accent: color ?? LOG_COLORS[def.color],
    title,
    subtitle: `<t:${now}:F> · <t:${now}:R>`,
    iconUrl: subject?.displayAvatarURL?.(),
  });

  const lines = [];
  if (description) lines.push(clip(description));
  if (actor) lines.push(`**Actor** ${who(actor)}`);
  if (target) lines.push(`**Target** ${who(target)}`);
  for (const f of fields) lines.push(`**${f.name}** ${clip(f.value)}`);
  if (lines.length) text(c, lines.join('\n'));
  return c;
}

/**
 * The only way anything in the bot writes a log entry. Colour comes from the event type
 * unless overridden. Honours the master switch and the per-event toggle.
 * @param {object} opts
 * @param {keyof typeof LOG_EVENT_TYPES} opts.type
 * @param {string} opts.title
 * @param {string} [opts.description]
 * @param {Array<{ name: string, value: string }>} [opts.fields]
 * @param {import('discord.js').User|null} [opts.actor] who did it
 * @param {import('discord.js').User|null} [opts.target] who it was done to
 * @param {number} [opts.color] override the type's colour
 * @param {boolean} [opts.force] bypass the enabled switch and event toggle (test entries)
 * @param {string} [opts.guildId]
 * @returns {Promise<boolean>} whether an entry was queued
 */
export async function logEvent(opts) {
  const c = buildEntry(opts);
  if (!c) return false;
  enqueue(c);
  return true;
}
