/** Copy for the giveaways module. */
export const STRINGS = Object.freeze({
  badDuration: (min, max) =>
    `Duration must look like 30m, 2h or 1d 12h, between ${min} and ${max}.`,
  badWinners: (max) => `Winners must be a whole number from 1 to ${max}.`,
  missing: 'That giveaway no longer exists.',
  notDraft: 'That giveaway has already started.',
  needChannel: 'Pick a channel before starting.',
  cannotPost: (missing) => `The bot cannot post there. Missing: ${missing}.`,
  sendFailed: 'Sending failed. The giveaway is still a draft; try again.',
  started: (url) => `Giveaway started: ${url}`,
  entered: 'You are entered. Good luck!',
  alreadyIn: 'You are already entered in this giveaway.',
  left: 'You left the giveaway.',
  closed: 'This giveaway has ended.',
  notRunning: 'That giveaway is not running.',
  busy: 'That giveaway is being drawn right now.',
  notEnded: 'Reroll is only possible after the giveaway has ended.',
  noneLeft: 'There is nobody left to draw: every remaining entrant has already won or left.',
  winnersAnnounce: (mentions, prize, url) =>
    `Congratulations ${mentions}! You won **${prize}**.\n${url}`,
  rerollAnnounce: (mention, prize, url) => `New winner: ${mention} wins **${prize}**.\n${url}`,
  noWinners: (prize) => `The giveaway for **${prize}** ended with no valid entries.`,
  ended: (n) => `Giveaway ended with ${n} winner${n === 1 ? '' : 's'}.`,
  cancelled: 'Giveaway cancelled.',
  rerolled: (id) => `Rerolled: <@${id}> is the new winner.`,
});
