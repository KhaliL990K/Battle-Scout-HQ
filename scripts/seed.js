import { env } from '../src/config/env.js';
import { closeDb, connectDb } from '../src/lib/db.js';
import { logger } from '../src/lib/logger.js';
import * as settings from '../src/lib/settings.js';

/**
 * Create the GuildSettings document for local testing.
 * Usage: npm run seed -- [--log-channel <id>] [--staff-role <id>]
 */
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? null : args[i + 1];
};

await connectDb();
await settings.ensure(env.GUILD_ID);

const logChannel = flag('log-channel');
const staffRole = flag('staff-role');
if (logChannel) {
  await settings.set(env.GUILD_ID, 'logging.channelId', logChannel);
  await settings.set(env.GUILD_ID, 'logging.enabled', true);
}
if (staffRole) await settings.set(env.GUILD_ID, 'staff.roleIds', [staffRole]);

logger.info({ settings: settings.get(env.GUILD_ID) }, 'Seeded GuildSettings');
await closeDb();
