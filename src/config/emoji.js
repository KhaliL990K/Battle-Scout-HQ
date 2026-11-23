import { logger } from '../lib/logger.js';

/**
 * Semantic emoji registry. `name` is the application/guild emoji name to upload;
 * `fallback` is used until it exists. Modules ask for keys, never raw emoji.
 */
export const EMOJI = Object.freeze({
  voteUp: { name: 'bs_up', fallback: '👍' },
  voteDown: { name: 'bs_down', fallback: '👎' },
  why: { name: 'bs_why', fallback: '💬' },
  manage: { name: 'bs_manage', fallback: '⚙️' },
  suggestion: { name: 'bs_bulb', fallback: '💡' },
  ticket: { name: 'bs_ticket', fallback: '🎫' },
  shield: { name: 'bs_shield', fallback: '🛡️' },
  changelog: { name: 'bs_changelog', fallback: '📜' },
  announcement: { name: 'bs_announce', fallback: '📣' },
  logs: { name: 'bs_logs', fallback: '🗒️' },
  sticky: { name: 'bs_sticky', fallback: '📌' },
  back: { name: 'bs_back', fallback: '◀️' },
  refresh: { name: 'bs_refresh', fallback: '🔄' },
  open: { name: 'bs_open', fallback: '▶️' },
  settings: { name: 'bs_settings', fallback: '🔧' },
  on: { name: 'bs_on', fallback: '🟢' },
  off: { name: 'bs_off', fallback: '⚫' },
  warn: { name: 'bs_warn', fallback: '⚠️' },
  statusPending: { name: 'bs_pending', fallback: '⏳' },
  statusApproved: { name: 'bs_approved', fallback: '✅' },
  statusDenied: { name: 'bs_denied', fallback: '❌' },
  statusConsidered: { name: 'bs_considered', fallback: '🤔' },
  statusImplemented: { name: 'bs_implemented', fallback: '🚀' },
  statusDuplicate: { name: 'bs_duplicate', fallback: '♻️' },
  sectionAdded: { name: 'bs_added', fallback: '✨' },
  sectionFixed: { name: 'bs_fixed', fallback: '🐛' },
  sectionChanged: { name: 'bs_changed', fallback: '🔀' },
  sectionRemoved: { name: 'bs_removed', fallback: '🗑️' },
  sectionKnown: { name: 'bs_known', fallback: '🚧' },
  draft: { name: 'bs_draft', fallback: '📝' },
  roles: { name: 'bs_roles', fallback: '🏷️' },
  ping: { name: 'bs_ping', fallback: '🔔' },
  giveaway: { name: 'bs_giveaway', fallback: '🎁' },
  enter: { name: 'bs_enter', fallback: '🎉' },
});

/** key -> resolved emoji ({ id, name, animated } or a unicode string). Filled once on ready. */
const resolved = new Map();

/**
 * Resolve every registry key once: application emoji, then guild emoji by name, then Unicode.
 * @param {import('discord.js').Client} client
 * @param {Record<string,string>} [overrideNames] settings-panel overrides (key -> emoji name)
 * @returns {Promise<string[]>} keys that fell back to Unicode
 */
export async function resolveAll(client, overrideNames = {}) {
  resolved.clear();

  const appEmojis = await client.application.emojis.fetch().catch((err) => {
    logger.warn({ err: err.message }, 'Could not fetch application emoji');
    return new Map();
  });
  const guildEmojis = client.guilds.cache.first()?.emojis.cache ?? new Map();

  const fellBack = [];
  for (const [key, def] of Object.entries(EMOJI)) {
    const wanted = overrideNames[key] ?? def.name;
    const found =
      [...appEmojis.values()].find((e) => e.name === wanted) ??
      [...guildEmojis.values()].find((e) => e.name === wanted);
    if (found) {
      resolved.set(key, { id: found.id, name: found.name, animated: Boolean(found.animated) });
    } else {
      resolved.set(key, def.fallback);
      fellBack.push(`${key} (${wanted})`);
    }
  }

  if (fellBack.length) {
    logger.warn({ missing: fellBack }, `${fellBack.length} emoji fell back to Unicode`);
  }
  return fellBack;
}

/**
 * Whether a key currently resolves to a real (application or guild) emoji rather than Unicode.
 * @param {keyof typeof EMOJI} key
 * @returns {boolean}
 */
export const isCustom = (key) => typeof resolved.get(key) === 'object';

/**
 * Get a component-ready emoji for a registry key. Safe before ready (returns the fallback).
 * @param {keyof typeof EMOJI} key
 */
export function resolve(key) {
  const def = EMOJI[key];
  if (!def) throw new Error(`Unknown emoji key: ${key}`);
  return resolved.get(key) ?? def.fallback;
}

/**
 * Render an emoji as inline text for TextDisplay content.
 * @param {keyof typeof EMOJI} key
 */
export function inline(key) {
  const e = resolve(key);
  return typeof e === 'string' ? e : `<${e.animated ? 'a' : ''}:${e.name}:${e.id}>`;
}
