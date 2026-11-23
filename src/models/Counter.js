import mongoose from 'mongoose';

const counterSchema = new mongoose.Schema(
  {
    guildId: { type: String, required: true },
    name: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { timestamps: true },
);
counterSchema.index({ guildId: 1, name: 1 }, { unique: true });

export const Counter = mongoose.model('Counter', counterSchema);

/**
 * Atomically take the next sequence number (suggestion #042, ticket #0117).
 * Never use countDocuments() for this: it races.
 * @param {string} guildId
 * @param {string} name e.g. 'suggestion', 'ticket', 'infraction'
 * @returns {Promise<number>}
 */
export async function nextSeq(guildId, name) {
  const doc = await Counter.findOneAndUpdate(
    { guildId, name },
    { $inc: { seq: 1 } },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true },
  ).lean();
  return doc.seq;
}
