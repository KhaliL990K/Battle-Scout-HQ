/**
 * Every panel the hub can open. `group` is the hub section it is listed under and `phase` the
 * build phase that delivers it; until a module
 * exports a real `panel()`, opening it shows a placeholder card.
 */
export const PANEL_CATALOG = Object.freeze([
  {
    key: 'suggestions',
    group: 'community',
    label: 'Suggestions',
    emoji: 'suggestion',
    description: 'Repost flow, votes and staff review',
    phase: 3,
  },
  {
    key: 'tickets',
    group: 'community',
    label: 'Tickets',
    emoji: 'ticket',
    description: 'Categories, questions, transcripts',
    phase: 4,
  },
  {
    key: 'changelog',
    group: 'community',
    label: 'Changelog',
    emoji: 'changelog',
    description: 'Template builder and publishing',
    phase: 5,
  },
  {
    key: 'announcements',
    group: 'community',
    label: 'Announcements',
    emoji: 'announcement',
    description: 'Compose, preview and send',
    phase: 5,
  },
  {
    key: 'roles',
    group: 'community',
    label: 'Role panels',
    emoji: 'roles',
    description: 'Buttons members click to pick their own roles',
    phase: 8,
  },
  {
    key: 'giveaways',
    group: 'community',
    label: 'Giveaways',
    emoji: 'giveaway',
    description: 'Start, end and reroll giveaways',
    phase: 8,
  },
  {
    key: 'automod',
    group: 'staff',
    label: 'Automod',
    emoji: 'shield',
    description: 'Anti-spam signals and review queue',
    phase: 6,
  },
  {
    key: 'logging',
    group: 'staff',
    label: 'Logs',
    emoji: 'logs',
    description: 'Log channel and per-event toggles',
    phase: 2,
  },
  {
    key: 'sticky',
    group: 'staff',
    label: 'Sticky messages',
    emoji: 'sticky',
    description: 'Keep a panel at the bottom of a channel',
    phase: 7,
  },
  {
    key: 'settings',
    group: 'staff',
    label: 'Settings',
    emoji: 'settings',
    description: 'Staff roles and emoji overrides',
    phase: 7,
  },
]);

/**
 * @param {string} key
 * @returns {typeof PANEL_CATALOG[number]|undefined}
 */
export function findPanel(key) {
  return PANEL_CATALOG.find((p) => p.key === key);
}
