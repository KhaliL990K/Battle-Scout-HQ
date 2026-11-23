import { MessageFlags } from 'discord.js';
import { MODULE_ACCENTS } from '../../config/constants.js';
import { inline } from '../../config/emoji.js';
import { card, divider, text } from '../../lib/ui/card.js';

/**
 * The public sticky message.
 * @param {{ title: string, body: string }} doc
 * @returns {import('discord.js').MessageCreateOptions}
 */
export function renderSticky(doc) {
  const c = card({ accent: MODULE_ACCENTS.sticky, title: `${inline('sticky')} ${doc.title}` });
  divider(c, { line: false });
  text(c, doc.body);
  return {
    components: [c],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}
