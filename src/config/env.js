import 'dotenv/config';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DISCORD_TOKEN: z.string().min(20, 'DISCORD_TOKEN is required'),
  CLIENT_ID: z.string().regex(/^\d{17,20}$/, 'CLIENT_ID must be a Discord snowflake'),
  GUILD_ID: z.string().regex(/^\d{17,20}$/, 'GUILD_ID must be a Discord snowflake'),
  MONGODB_URI: z
    .string()
    .startsWith('mongodb', 'MONGODB_URI must be a mongodb:// or mongodb+srv:// URI'),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
  // Logger depends on env, so this one failure path writes directly.
  process.stderr.write(`\nInvalid environment. Fix .env and restart:\n${lines.join('\n')}\n\n`);
  process.exit(1);
}

/** Validated process.env. Secrets and the guild ID only; everything else is in MongoDB. */
export const env = Object.freeze(parsed.data);
