/**
 * Module registry. Kept separate from modules/index.js so a module (e.g. panels) can look up
 * its siblings without importing them and creating a circular dependency.
 */
const registry = new Map();

/**
 * @param {{ name: string }} mod a module exporting the standard interface
 */
export function register(mod) {
  if (registry.has(mod.name)) throw new Error(`Module registered twice: ${mod.name}`);
  registry.set(mod.name, mod);
}

/**
 * @param {string} name
 * @returns {object|undefined}
 */
export function getModule(name) {
  return registry.get(name);
}

/** @returns {object[]} */
export function allModules() {
  return [...registry.values()];
}
