/** Copy for the tickets module. */
export const STRINGS = Object.freeze({
  panelTitle: 'Open a ticket',
  panelBody:
    'Pick the category that fits best. A private channel opens just for you and our staff.',
  panelPlaceholder: 'Choose a category…',
  alreadyOpen: (channelId) => `You already have an open ticket in this category: <#${channelId}>`,
  created: (channelId) => `Your ticket is ready: <#${channelId}>`,
  outOfDate: 'That category no longer exists. Ask staff to refresh the ticket panel.',
  notConfigured: 'Tickets are not fully set up yet. Ask an admin to finish the Tickets panel.',
  notStaff: 'Only ticket staff can do that.',
  notTicket: 'This is not an open ticket channel.',
  alreadyClosed: 'This ticket is already closed.',
  claimed: (id) => `<@${id}> claimed this ticket.`,
  released: (id) => `<@${id}> released this ticket.`,
  alreadyClaimed: (id) => `Already claimed by <@${id}>.`,
  added: (id) => `<@${id}> was added to the ticket.`,
  removed: (id) => `<@${id}> was removed from the ticket.`,
  closing: (seconds, by) => `Ticket closed by <@${by}>. This channel is deleted in ${seconds}s.`,
  dmClosed: (label, reason) =>
    `Your **${label}** ticket was closed.${reason ? `\nReason: ${reason}` : ''}\nThe transcript is attached.`,
  noCategories: 'No categories yet. Load the defaults or add one in the Tickets panel.',
});
