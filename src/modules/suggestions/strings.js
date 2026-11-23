/** Copy for the suggestions module. Kept in one place so wording can change without a hunt. */
export const STRINGS = Object.freeze({
  tooShort: (min) =>
    `Your suggestion needs at least **${min}** characters. Here is your text to edit:`,
  cooldown: (sec) => `Slow down: you can post another suggestion in **${sec}s**. Your text:`,
  threadTitle: (num, snippet) => `#${num} – ${snippet}`,
  threadFallback: 'attachment',
  skippedNote: (n) => `${n} attachment${n === 1 ? '' : 's'} could not be re-uploaded.`,
  missing: 'This suggestion no longer exists in the database.',
  noThread: 'This suggestion has no thread to post in.',
  whyPosted: 'Your reason was posted in the thread.',
  whyPlaceholder: 'Tell staff and other members why you feel this way…',
  statusSet: (label) => `Status set to **${label}**.`,
  messageGone: 'The suggestion message was deleted, so the card could not be updated.',
  channelNeeded: 'Set a suggestions channel first.',
  badLimits: 'Both values must be whole numbers inside the allowed range.',
});
