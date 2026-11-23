import { AUTOMOD_LIMITS } from '../../config/constants.js';

const LINK = /https?:\/\/|discord\.gg\/|discord(?:app)?\.com\/invite\//i;
const EVERYONE = /@(?:everyone|here)\b/;

/**
 * Reduce a message to a comparison key: case, punctuation and spacing differences are what
 * scammers vary between channels, so they must not defeat the duplicate check.
 * @param {string} content
 * @returns {string}
 */
export function normalize(content) {
  return content
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function bigrams(s) {
  const map = new Map();
  for (let i = 0; i < s.length - 1; i += 1) {
    const g = s.slice(i, i + 2);
    map.set(g, (map.get(g) ?? 0) + 1);
  }
  return map;
}

/**
 * Sørensen–Dice similarity of two normalized strings, 0 to 1.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function similarity(a, b) {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const ga = bigrams(a);
  const gb = bigrams(b);
  let overlap = 0;
  for (const [g, n] of ga) overlap += Math.min(n, gb.get(g) ?? 0);
  return (2 * overlap) / (a.length - 1 + (b.length - 1));
}

/**
 * Whether a message is (nearly) the same text as another.
 * @param {string} a normalized
 * @param {string} b normalized
 * @returns {boolean}
 */
export const isSimilar = (a, b) =>
  a.length >= AUTOMOD_LIMITS.minSimilarChars &&
  b.length >= AUTOMOD_LIMITS.minSimilarChars &&
  similarity(a, b) >= AUTOMOD_LIMITS.similarity;

/**
 * Facts about one message that the signals need, derived once from Discord objects so the
 * signal logic itself stays pure and testable.
 * @param {import('discord.js').Message} message
 * @param {boolean} canMentionEveryone
 * @param {number} [now]
 */
export function describe(message, canMentionEveryone, now = Date.now()) {
  const content = message.content ?? '';
  return {
    key: normalize(content),
    sample: content,
    channelId: message.channelId,
    mentionCount: message.mentions.users.size + message.mentions.roles.size,
    badEveryone: EVERYONE.test(content) && !canMentionEveryone,
    hasLink: LINK.test(content),
    accountAgeMs: now - message.author.createdTimestamp,
    joinAgeMs: message.member?.joinedTimestamp ? now - message.member.joinedTimestamp : Infinity,
    roleCount: message.member ? message.member.roles.cache.size - 1 : 0,
  };
}

const HOUR = 3_600_000;

/**
 * Run the enabled signals over a message and the member's recent history (which already
 * includes this message). Returns the first signal that fires, most specific first.
 * @param {ReturnType<typeof describe> & { isHoneypot?: boolean }} ctx
 * @param {Array<{ channelId: string, at: number, key: string }>} history oldest first
 * @param {ReturnType<import('./config.js').getConfig>} cfg
 * @param {number} [now]
 * @returns {{ signal: string, detail: string } | null}
 */
export function evaluate(ctx, history, cfg, now = Date.now()) {
  const on = cfg.signals;

  if (on.honeypot && ctx.isHoneypot) {
    return { signal: 'honeypot', detail: 'Posted in the honeypot channel' };
  }

  if (on.crossChannel && ctx.key.length >= AUTOMOD_LIMITS.minSimilarChars) {
    const cutoff = now - cfg.crossChannel.windowSec * 1000;
    const channels = new Set(
      history.filter((m) => m.at >= cutoff && isSimilar(ctx.key, m.key)).map((m) => m.channelId),
    );
    if (channels.size >= cfg.crossChannel.channels) {
      return {
        signal: 'crossChannel',
        detail: `Same message in ${channels.size} channels within ${cfg.crossChannel.windowSec}s`,
      };
    }
  }

  if (on.massMention) {
    if (ctx.badEveryone) {
      return { signal: 'massMention', detail: '@everyone or @here without permission' };
    }
    if (ctx.mentionCount > cfg.massMention.max) {
      return {
        signal: 'massMention',
        detail: `${ctx.mentionCount} mentions (limit ${cfg.massMention.max})`,
      };
    }
  }

  if (on.riskyLink && ctx.hasLink) {
    const r = cfg.riskyLink;
    const reasons = [];
    if (ctx.accountAgeMs < r.accountAgeHours * HOUR) reasons.push('new account');
    if (ctx.joinAgeMs < r.joinAgeHours * HOUR) reasons.push('just joined');
    if (r.flagNoRoles && ctx.roleCount === 0) reasons.push('no roles');
    if (reasons.length) {
      return {
        signal: 'riskyLink',
        detail: `Link or invite from a member with ${reasons.join(', ')}`,
      };
    }
  }

  if (on.rapidRepeat) {
    const cutoff = now - cfg.rapidRepeat.seconds * 1000;
    const burst = history.filter((m) => m.at >= cutoff).length;
    if (burst >= cfg.rapidRepeat.count) {
      return {
        signal: 'rapidRepeat',
        detail: `${burst} messages in ${cfg.rapidRepeat.seconds}s`,
      };
    }
  }

  return null;
}
