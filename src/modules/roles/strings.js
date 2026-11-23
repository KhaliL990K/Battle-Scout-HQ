/** Copy for the role panels module. */
export const STRINGS = Object.freeze({
  inactive: 'This role panel is no longer active.',
  notOffered: 'That role is no longer offered on this panel.',
  unavailable: 'That role cannot be given right now. Please tell a staff member.',
  added: (roleId) => `Added <@&${roleId}>.`,
  removed: (roleId) => `Removed <@&${roleId}>.`,
  swapped: (roleId, n) =>
    `Added <@&${roleId}> and removed ${n} other role${n === 1 ? '' : 's'} from this panel.`,
  unchanged: 'Nothing changed.',
  picked: (added, removed) =>
    [
      added.length ? `Added ${added.map((id) => `<@&${id}>`).join(' ')}` : null,
      removed.length ? `Removed ${removed.map((id) => `<@&${id}>`).join(' ')}` : null,
    ]
      .filter(Boolean)
      .join('\n'),
  missing: 'That role panel no longer exists.',
  tooManyButtons: (max) =>
    `The button layout holds at most ${max} roles. Switch to the select layout for more.`,
  refused: (lines) => `These roles were not added:\n${lines.join('\n')}`,
  needChannel: 'Pick a channel before publishing.',
  needRoles: 'Add at least one role before publishing.',
  cannotPost: (missing) => `The bot cannot post there. Missing: ${missing.join(', ')}.`,
  fixRoles: (lines) => `Fix these roles before publishing:\n${lines.join('\n')}`,
  badEmoji: 'The emoji must be a single emoji or a custom emoji like <:name:id>.',
  emptyHint: 'No roles yet. Pick some with the role menu below.',
  pickPrompt: 'Pick your roles…',
  pickOnePrompt: 'Pick a role…',
});
