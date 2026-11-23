import { AUTOMOD_DEFAULTS } from '../../config/constants.js';
import * as settings from '../../lib/settings.js';

/**
 * Automod settings with every missing threshold filled from AUTOMOD_DEFAULTS, so a partly
 * edited or brand-new document always yields a complete configuration.
 * @param {string} guildId
 */
export function getConfig(guildId) {
  const a = settings.get(guildId).automod;
  const t = a.thresholds ?? {};
  const merged = (key) => ({ ...AUTOMOD_DEFAULTS[key], ...(t[key] ?? {}) });
  return {
    ...a,
    signals: merged('signals'),
    crossChannel: merged('crossChannel'),
    rapidRepeat: merged('rapidRepeat'),
    massMention: merged('massMention'),
    riskyLink: merged('riskyLink'),
  };
}

/**
 * The part of a config that is stored under `automod.thresholds`.
 * @param {ReturnType<typeof getConfig>} cfg
 */
export const thresholdsOf = (cfg) => ({
  signals: cfg.signals,
  crossChannel: cfg.crossChannel,
  rapidRepeat: cfg.rapidRepeat,
  massMention: cfg.massMention,
  riskyLink: cfg.riskyLink,
});
