import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from './logger.js';

/** Connect to MongoDB, exiting with a readable message if the server is unreachable. */
export async function connectDb() {
  try {
    await mongoose.connect(env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  } catch (err) {
    logger.fatal(
      { err: err.message },
      'Cannot reach MongoDB. Is the MongoDB service running? See docs/OPERATIONS.md',
    );
    process.exit(1);
  }
  logger.info({ db: mongoose.connection.name }, 'MongoDB connected');
}

/** Close the connection during graceful shutdown. */
export async function closeDb() {
  await mongoose.connection.close();
}
