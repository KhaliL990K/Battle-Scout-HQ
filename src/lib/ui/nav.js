import { encode } from '../customId.js';
import { button } from './components.js';

/**
 * The "Back to hub" button every sub-panel ends with.
 * @returns {import('discord.js').ButtonBuilder}
 */
export function backButton() {
  return button({ id: encode('panels', 'home'), label: 'Back to hub', emoji: 'back' });
}
