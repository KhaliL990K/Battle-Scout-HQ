import { Client, GatewayIntentBits, Partials } from 'discord.js';
import { env } from './config/env.js';
import { bindEvents } from './events/index.js';
import { closeDb, connectDb } from './lib/db.js';
import { logger } from './lib/logger.js';
import { stopQueue } from './modules/logging/queue.js';
import './modules/index.js';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
  ],
  // Partials let delete/edit events arrive for messages cached before a restart.
  partials: [Partials.Message, Partials.GuildMember],
});

let shuttingDown = false;

/** Flush the log queue, close MongoDB, destroy the client. */
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down');
  await stopQueue().catch((err) => logger.error({ err }, 'Log flush failed on shutdown'));
  await closeDb().catch((err) => logger.error({ err }, 'MongoDB close failed'));
  await client.destroy();
  process.exit(0);
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('unhandledRejection', (err) => logger.error({ err }, 'Unhandled rejection'));

await connectDb();
bindEvents(client);

try {
  await client.login(env.DISCORD_TOKEN);
} catch (err) {
  const intents = /disallowed intents/i.test(err.message);
  logger.fatal(
    { err: err.message },
    intents
      ? 'Privileged intents are not enabled. In the Developer Portal > Bot, turn on Server Members Intent and Message Content Intent.'
      : 'Discord login failed. Check DISCORD_TOKEN.',
  );
  process.exit(1);
}
