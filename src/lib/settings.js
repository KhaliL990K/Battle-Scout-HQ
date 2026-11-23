import { GuildSettings } from '../models/GuildSettings.js';
import { logger } from './logger.js';

/** guildId -> plain settings object. Hot paths read this, never the database. */
const cache = new Map();

/** @type {null | ((change: SettingsChange) => Promise<void>)} */
let changeHook = null;

/**
 * @typedef {object} SettingsChange
 * @property {string} guildId
 * @property {string} path dotted path, e.g. 'automod.timeoutHours'
 * @property {unknown} before
 * @property {unknown} value
 * @property {import('discord.js').User|null} actor
 */

/**
 * Fill in schema defaults for fields added after the document was created. A lean read skips
 * them, so without this a new nested setting would be undefined on an existing install.
 * @param {object} doc lean GuildSettings document
 * @returns {object}
 */
const withDefaults = (doc) =>
  GuildSettings.hydrate(doc).toObject({ flattenMaps: true, minimize: false, versionKey: false });

const SAFE_PATH = /^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)*$/;

/**
 * Register the listener that turns every settings write into a log entry. Registered by the
 * logging module so this file never imports it (avoids a circular dependency).
 * @param {(change: SettingsChange) => Promise<void>} fn
 */
export function onSettingsChange(fn) {
  changeHook = fn;
}

/**
 * Load (creating if absent) the settings document and warm the cache.
 * @param {string} guildId
 * @returns {Promise<object>}
 */
export async function ensure(guildId) {
  const doc = await GuildSettings.findOneAndUpdate(
    { guildId },
    { $setOnInsert: { guildId } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  ).lean();
  const full = withDefaults(doc);
  cache.set(guildId, full);
  return full;
}

/**
 * Synchronous cached read.
 * @param {string} guildId
 * @returns {object}
 */
export function get(guildId) {
  const doc = cache.get(guildId);
  if (!doc) throw new Error(`Settings for guild ${guildId} are not loaded; call ensure() first`);
  return cache.get(guildId);
}

/**
 * Read a dotted path from a settings object.
 * @param {object} obj
 * @param {string} path
 */
export function readPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

/**
 * Write one setting, refresh the cache, and emit the change to the log hook.
 * @param {string} guildId
 * @param {string} path dotted path into the settings document
 * @param {unknown} value
 * @param {import('discord.js').User|null} [actor]
 * @returns {Promise<object>} the updated settings
 */
export async function set(guildId, path, value, actor = null) {
  if (!SAFE_PATH.test(path)) throw new Error(`Refusing unsafe settings path: ${path}`);
  const before = readPath(get(guildId), path);

  const doc = await GuildSettings.findOneAndUpdate(
    { guildId },
    { $set: { [path]: value } },
    { returnDocument: 'after', runValidators: true },
  ).lean();
  cache.set(guildId, withDefaults(doc));

  if (changeHook) {
    // A failing log must never fail the write that already succeeded.
    await changeHook({ guildId, path, before, value, actor }).catch((err) =>
      logger.warn({ err: err.message, path }, 'Settings change hook failed'),
    );
  }
  return cache.get(guildId);
}
