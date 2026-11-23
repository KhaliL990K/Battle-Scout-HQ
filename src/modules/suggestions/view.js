import { FileBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder } from 'discord.js';
import { SUGGESTION_STATUSES } from '../../config/constants.js';
import { inline } from '../../config/emoji.js';
import { encode } from '../../lib/customId.js';
import { card, controls, divider, render, text } from '../../lib/ui/card.js';
import { button } from '../../lib/ui/components.js';
import { STRINGS } from './strings.js';

/** Zero-padded display number: 42 -> "042". */
export const pad = (n) => String(n).padStart(3, '0');

const count = (votes, value) => votes.filter((v) => v.value === value).length;

/**
 * Add the re-uploaded attachments: images and video in a gallery, anything else as file cards.
 * They are referenced as attachment:// so they survive edits that do not re-send the files.
 */
function addAttachments(c, attachments) {
  const media = attachments.filter((a) => a.isMedia);
  if (media.length) {
    c.addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        media.map((a) => new MediaGalleryItemBuilder().setURL(`attachment://${a.name}`)),
      ),
    );
  }
  for (const a of attachments.filter((x) => !x.isMedia)) {
    c.addFileComponents(new FileBuilder().setURL(`attachment://${a.name}`));
  }
}

/**
 * Build the public suggestion card from a suggestion document (or an unsaved draft).
 * @param {object} doc
 * @returns {import('discord.js').ContainerBuilder}
 */
export function suggestionCard(doc) {
  const def = SUGGESTION_STATUSES[doc.status ?? 'pending'];
  const id = String(doc._id);
  const c = card({
    accent: def.color,
    title: `${inline('suggestion')} Suggestion #${pad(doc.number)}`,
    subtitle: `${doc.authorName} · <t:${doc.postedAtUnix}:R>`,
    iconUrl: doc.authorAvatarUrl ?? undefined,
  });
  // The mention stays on every re-render; edits never notify again, only the first send pings.
  if (doc.pingRoleId) text(c, `-# ${inline('ping')} <@&${doc.pingRoleId}>`);
  divider(c);
  if (doc.content) text(c, doc.content);
  addAttachments(c, doc.attachments ?? []);
  if (doc.skippedAttachments) text(c, `-# ${STRINGS.skippedNote(doc.skippedAttachments)}`);

  if (doc.status && doc.status !== 'pending') {
    divider(c);
    const by = doc.statusById ? ` by <@${doc.statusById}>` : '';
    const when = doc.statusAtUnix ? ` · <t:${doc.statusAtUnix}:R>` : '';
    const reason = doc.statusReason ? `\n>>> ${doc.statusReason}` : '';
    text(c, `**Status:** ${inline(def.emoji)} ${def.label}${by}${when}${reason}`);
  }

  divider(c, { line: false });
  const votes = doc.votes ?? [];
  controls(c, {
    buttons: [
      button({
        id: encode('suggestions', 'vote', 'up', id),
        label: String(count(votes, 1)),
        emoji: 'voteUp',
      }),
      button({
        id: encode('suggestions', 'vote', 'down', id),
        label: String(count(votes, -1)),
        emoji: 'voteDown',
      }),
      button({ id: encode('suggestions', 'why', id), label: 'Why', emoji: 'why' }),
      button({ id: encode('suggestions', 'manage', id), label: 'Manage', emoji: 'manage' }),
    ],
  });
  return c;
}

/**
 * Message options for the suggestion card.
 * @param {object} doc
 */
export const renderSuggestion = (doc) => render(suggestionCard(doc), { name: 'suggestion' });
