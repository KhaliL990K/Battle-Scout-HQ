/** Copy for the changelog module. */
export const STRINGS = Object.freeze({
  noChannel: 'Pick a changelog channel in the Changelog panel first.',
  noContent: 'Fill in at least one section before publishing.',
  missingDraft: 'That draft no longer exists.',
  notDraft: 'That changelog was already published or cancelled.',
  missingTemplate: 'That template no longer exists.',
  overBudget: (over) =>
    `That would put the changelog **${over}** characters over Discord's message limit. Shorten it and try again.`,
  badColour: 'Colour must be a six-digit hex code such as `#3498DB`.',
  needSection: 'Add at least one section.',
  lastTemplate: 'You need at least one template. Edit this one instead of deleting it.',
  published: (url) => `Published: ${url}`,
  cannotPost: (missing) => `The bot cannot post there. Missing: ${missing}.`,
  sendFailed: 'Discord refused the message. Nothing was published; the draft is intact.',
  alreadyPublishing: 'This changelog is already being published.',
});
