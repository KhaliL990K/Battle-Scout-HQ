import { CUSTOM_ID_MAX } from '../config/constants.js';

/**
 * Build a custom id: `module:action:param1:param2`.
 * @param {string} module
 * @param {string} action
 * @param {...(string|number)} params document ids / enums only, never user text
 * @returns {string}
 */
export function encode(module, action, ...params) {
  const parts = [module, action, ...params].map(String);
  if (parts.some((p) => p.includes(':') || p.length === 0)) {
    throw new Error(`customId part is empty or contains ':' -> ${JSON.stringify(parts)}`);
  }
  const id = parts.join(':');
  if (id.length > CUSTOM_ID_MAX) {
    throw new Error(`customId exceeds ${CUSTOM_ID_MAX} chars (${id.length}): ${id}`);
  }
  return id;
}

/**
 * Parse a custom id.
 * @param {string} id
 * @returns {{ module: string, action: string, params: string[] }}
 */
export function decode(id) {
  const [module, action, ...params] = id.split(':');
  return { module, action, params };
}
