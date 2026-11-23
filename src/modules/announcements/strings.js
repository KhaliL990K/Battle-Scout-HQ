/** Copy for the announcements module. */
export const STRINGS = Object.freeze({
  missingDraft: 'That announcement no longer exists.',
  notDraft: 'That announcement was already sent or cancelled.',
  noChannel: 'Choose a channel to send it to first.',
  badImage: 'The image must be a direct https:// link.',
  badLink: 'That is not a Discord message link.',
  wrongGuild: 'That link points to a different server.',
  notOurs: 'Only announcements sent from this panel can be edited here.',
  messageGone: 'The announcement message was deleted in Discord, so there is nothing to edit.',
  cannotPost: (missing) => `The bot cannot post there. Missing: ${missing}.`,
  sendFailed: 'Discord refused the message. Nothing was sent; the draft is intact.',
  alreadySending: 'This announcement is already being sent.',
  sent: (url) => `Sent: ${url}`,
  edited: (url) => `Updated: ${url}`,
});
