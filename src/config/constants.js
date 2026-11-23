/** Log embed colours, mandated by the server owner. Never inline these. */
export const LOG_COLORS = Object.freeze({
  red: 0xe74c3c,
  orange: 0xe67e22,
  yellow: 0xf1c40f,
  green: 0x2ecc71,
  blue: 0x3498db,
  grey: 0x95a5a6,
});

/** Accent bar per module so staff recognise a panel by its left edge. */
export const MODULE_ACCENTS = Object.freeze({
  hub: 0x5865f2,
  suggestions: LOG_COLORS.green,
  tickets: LOG_COLORS.blue,
  changelog: LOG_COLORS.blue,
  announcements: LOG_COLORS.blue,
  automod: LOG_COLORS.red,
  logging: LOG_COLORS.grey,
  sticky: LOG_COLORS.yellow,
  settings: LOG_COLORS.grey,
  roles: 0x9b59b6,
  giveaways: 0xe91e63,
});

/** Discord Components V2 hard limits. */
export const V2_LIMITS = Object.freeze({ components: 40, textChars: 4000 });

/** Discord timeout ceiling: 28 days. */
export const MAX_TIMEOUT_HOURS = 28 * 24;

export const CUSTOM_ID_MAX = 100;

/**
 * Every loggable event type. Key is the toggle name stored in GuildSettings.logging.events.
 * `color` is a LOG_COLORS key, resolved at log time.
 */
export const LOG_EVENT_TYPES = Object.freeze({
  messageDelete: { label: 'Message deleted', color: 'yellow' },
  messageEdit: { label: 'Message edited', color: 'yellow' },
  memberJoin: { label: 'Member joined', color: 'green' },
  memberLeave: { label: 'Member left', color: 'grey' },
  memberTimeout: { label: 'Member timed out', color: 'orange' },
  memberBan: { label: 'Member banned', color: 'red' },
  memberKick: { label: 'Member kicked', color: 'red' },
  roleChange: { label: 'Roles changed', color: 'blue' },
  settingsChange: { label: 'Settings changed', color: 'grey' },
  automodAction: { label: 'Automod action', color: 'red' },
  ticketEvent: { label: 'Ticket event', color: 'blue' },
  suggestionEvent: { label: 'Suggestion event', color: 'green' },
  announcement: { label: 'Announcement sent', color: 'blue' },
  changelog: { label: 'Changelog published', color: 'blue' },
  giveaway: { label: 'Giveaway event', color: 'blue' },
});

export const DEFAULT_LOG_EVENTS = Object.freeze(
  Object.fromEntries(Object.keys(LOG_EVENT_TYPES).map((k) => [k, true])),
);

/**
 * Suggestion lifecycle. `final` statuses archive the thread; `reason` ones ask staff for a
 * written reason in a modal. `color` is the accent bar of the suggestion card.
 */
export const SUGGESTION_STATUSES = Object.freeze({
  pending: { label: 'Pending', emoji: 'statusPending', color: LOG_COLORS.blue },
  approved: {
    label: 'Approved',
    emoji: 'statusApproved',
    color: LOG_COLORS.green,
    final: true,
    reason: true,
  },
  denied: {
    label: 'Denied',
    emoji: 'statusDenied',
    color: LOG_COLORS.red,
    final: true,
    reason: true,
  },
  considered: { label: 'Considered', emoji: 'statusConsidered', color: LOG_COLORS.yellow },
  implemented: { label: 'Implemented', emoji: 'statusImplemented', color: 0x9b59b6, final: true },
  duplicate: {
    label: 'Duplicate',
    emoji: 'statusDuplicate',
    color: LOG_COLORS.grey,
    final: true,
    reason: true,
  },
});

/** Intake limits for the suggestion repost flow. */
export const SUGGESTION_LIMITS = Object.freeze({
  maxAttachments: 4,
  maxAttachmentBytes: 8 * 1024 * 1024,
  noticeTtlMs: 10_000,
  threadTitleChars: 40,
  reasonMaxChars: 500,
  maxMinLength: 500,
  maxCooldownSec: 3600,
  /** Minutes between role pings for new suggestions; 0 pings on every one. */
  maxPingCooldownMin: 1440,
});

export const LOG_QUEUE = Object.freeze({ flushMs: 2000, maxBatch: 10, ignoreTtlMs: 30_000 });

/** Limits for the ticket flow. Discord caps a modal at 5 inputs and a label at 45 characters. */
export const TICKET_LIMITS = Object.freeze({
  maxCategories: 25,
  maxQuestions: 5,
  maxLabelChars: 45,
  maxDescriptionChars: 100,
  answerMaxChars: 1000,
  closeDelayMs: 10_000,
  transcriptMaxMessages: 5000,
});

/**
 * Starting categories, copied into the database by the "Load defaults" button. After that they
 * are edited from the Tickets panel, so nothing here is authoritative at runtime.
 */
export const DEFAULT_TICKET_CATEGORIES = Object.freeze([
  {
    label: 'Bug report',
    description: 'Something is broken or behaving oddly',
    questions: ['What happened?', 'What did you expect to happen?', 'How can we reproduce it?'],
  },
  {
    label: 'Support',
    description: 'Help using BattleScout',
    questions: ['What do you need help with?'],
  },
  {
    label: 'Premium / billing',
    description: 'Payments, subscriptions and refunds',
    questions: ['What is your question?', 'Email or payment reference (optional)'],
  },
  {
    label: 'Partnership',
    description: 'Collaborations and business enquiries',
    questions: ['Who are you and what do you represent?', 'What do you have in mind?'],
  },
  {
    label: 'Report a user',
    description: 'Report someone breaking the rules',
    questions: ['Who are you reporting (name or ID)?', 'What did they do?'],
  },
]);

/**
 * Limits for the changelog builder. Discord caps a Components V2 message at 4000 text
 * characters, and the builder shows the live preview beside its own controls, so the content
 * budget leaves headroom for that chrome.
 */
export const CHANGELOG_LIMITS = Object.freeze({
  maxTemplates: 25,
  maxSections: 8,
  sectionChars: 1000,
  totalChars: 3300,
  versionChars: 30,
  titleChars: 100,
  nameChars: 40,
  headerChars: 100,
  footerChars: 100,
  maxDrafts: 25,
  recentPublished: 5,
  /** A claim stuck in "publishing" longer than this is treated as a crashed publish. */
  publishLockMs: 60_000,
});

/**
 * Starting template, copied into the database on first use. After that it is edited from the
 * Changelog panel, so nothing here is authoritative at runtime. `emojiKey` is an emoji registry
 * key, so the icons can be swapped by uploading an emoji instead of editing code.
 */
export const DEFAULT_CHANGELOG_TEMPLATE = Object.freeze({
  name: 'Standard',
  headerFormat: 'Version {version} · {title}',
  footer: 'BattleScout',
  accent: LOG_COLORS.blue,
  sections: [
    { key: 'added', label: 'Added', emojiKey: 'sectionAdded' },
    { key: 'fixed', label: 'Fixed', emojiKey: 'sectionFixed' },
    { key: 'changed', label: 'Changed', emojiKey: 'sectionChanged' },
    { key: 'removed', label: 'Removed', emojiKey: 'sectionRemoved' },
    { key: 'known', label: 'Known issues', emojiKey: 'sectionKnown' },
  ],
});

/** Section labels that map to a dedicated icon when staff type them into the section editor. */
export const SECTION_EMOJI_BY_LABEL = Object.freeze({
  added: 'sectionAdded',
  new: 'sectionAdded',
  fixed: 'sectionFixed',
  fixes: 'sectionFixed',
  changed: 'sectionChanged',
  changes: 'sectionChanged',
  improved: 'sectionChanged',
  removed: 'sectionRemoved',
  deprecated: 'sectionRemoved',
  'known issues': 'sectionKnown',
});

/** Limits for the announcement composer (title and body share the 4000-character budget). */
export const ANNOUNCEMENT_LIMITS = Object.freeze({
  titleChars: 100,
  bodyChars: 3000,
  imageUrlChars: 500,
  maxDrafts: 25,
  recentSent: 5,
  /** A claim stuck in "sending" longer than this is treated as a crashed send. */
  sendLockMs: 60_000,
});

/** Detection signals the automod can raise, each switchable on its own. */
export const AUTOMOD_SIGNALS = Object.freeze({
  crossChannel: {
    label: 'Cross-channel duplicate',
    description: 'Same message in several channels (the giveaway-scam pattern)',
  },
  rapidRepeat: { label: 'Rapid repeat', description: 'Many messages in a few seconds' },
  massMention: {
    label: 'Mass mentions',
    description: 'Too many pings, or @everyone without rights',
  },
  riskyLink: { label: 'Risky link', description: 'Link or invite from a very new account or join' },
  honeypot: { label: 'Honeypot channel', description: 'Anything posted in the trap channel' },
});

/**
 * Starting thresholds. Stored under GuildSettings.automod.thresholds and edited from the Automod
 * panel; whatever is missing there falls back to these.
 */
export const AUTOMOD_DEFAULTS = Object.freeze({
  signals: Object.freeze(Object.fromEntries(Object.keys(AUTOMOD_SIGNALS).map((k) => [k, true]))),
  crossChannel: Object.freeze({ channels: 3, windowSec: 120 }),
  rapidRepeat: Object.freeze({ count: 5, seconds: 10 }),
  massMention: Object.freeze({ max: 5 }),
  riskyLink: Object.freeze({ accountAgeHours: 72, joinAgeHours: 24, flagNoRoles: false }),
});

export const AUTOMOD_LIMITS = Object.freeze({
  maxLookbackMinutes: 60,
  bufferPerUser: 50,
  pruneEveryMs: 60_000,
  /** After acting on a member, further hits from them inside this window are ignored. */
  actCooldownMs: 60_000,
  banDeleteSeconds: 86_400,
  maxExemptRoles: 10,
  sampleChars: 300,
  similarity: 0.9,
  minSimilarChars: 8,
});

/** What a staff decision does to an infraction; `color` is a LOG_COLORS key. */
export const INFRACTION_DECISIONS = Object.freeze({
  released: { label: 'Released', color: 'orange' },
  quarantined: { label: 'Quarantined', color: 'orange' },
  kicked: { label: 'Kicked', color: 'red' },
  banned: { label: 'Banned', color: 'red' },
});

/**
 * Sticky messages. The minimums exist so a busy channel can never turn a sticky into a
 * delete-and-resend loop that rate-limits the bot.
 */
export const STICKY_LIMITS = Object.freeze({
  minMessages: 1,
  maxMessages: 100,
  minSeconds: 10,
  maxSeconds: 3600,
  titleChars: 100,
  bodyChars: 1800,
  defaultMessages: 5,
  defaultSeconds: 60,
  maxListed: 25,
});

/** Emoji override rows shown per page in the Settings panel (a select holds 25 at most). */
export const EMOJI_PAGE_SIZE = 20;

/** Self-assign role panels. A button panel stops at 20 roles (4 rows of 5); a select at 25. */
export const ROLE_PANEL_LIMITS = Object.freeze({
  maxButtons: 20,
  maxSelect: 25,
  titleChars: 100,
  descriptionChars: 1000,
  labelChars: 80,
  roleDescriptionChars: 100,
  maxListed: 25,
});

/**
 * Permissions a self-assign role must never carry: a panel would hand them to anyone who clicks.
 * Names are PermissionFlagsBits keys.
 */
export const ROLE_PANEL_FORBIDDEN_PERMISSIONS = Object.freeze([
  'Administrator',
  'ManageGuild',
  'ManageRoles',
  'ManageChannels',
  'ManageMessages',
  'ManageWebhooks',
  'BanMembers',
  'KickMembers',
  'ModerateMembers',
  'MentionEveryone',
]);

/** Giveaways. Durations are seconds; the sweep ends anything due, so long durations are safe. */
export const GIVEAWAY_LIMITS = Object.freeze({
  minDurationSec: 60,
  maxDurationSec: 60 * 24 * 3600,
  maxWinners: 20,
  prizeChars: 100,
  descriptionChars: 1000,
  defaultDuration: '1d',
  /** How often the scheduler looks for giveaways that are due. */
  sweepMs: 15_000,
  /** The public entry count is refreshed at most this often per giveaway. */
  refreshMs: 10_000,
  /** A claim stuck in "ending" longer than this is treated as a crashed draw. */
  endLockMs: 60_000,
  maxListed: 20,
});
