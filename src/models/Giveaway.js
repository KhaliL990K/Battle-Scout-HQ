import mongoose from 'mongoose';

const { Schema } = mongoose;

const rerollSchema = new Schema(
  {
    userId: { type: String, required: true },
    byId: { type: String, required: true },
    atUnix: { type: Number, required: true },
  },
  { _id: false },
);

/**
 * One giveaway. Never deleted: `status` moves draft → running → ending → ended, or to
 * cancelled. `ending` is a short lock so the scheduler, End now and a restart cannot draw twice.
 */
const giveawaySchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    /** Assigned when the giveaway starts, from nextSeq(guildId, 'giveaway'). */
    number: { type: Number, default: null },
    status: {
      type: String,
      enum: ['draft', 'running', 'ending', 'ended', 'cancelled'],
      default: 'draft',
      index: true,
    },
    prize: { type: String, required: true },
    description: { type: String, default: '' },
    winnerCount: { type: Number, default: 1, min: 1, max: 20 },
    durationSec: { type: Number, required: true },
    channelId: { type: String, default: null, index: true },
    messageId: { type: String, default: null, index: true },
    pingRoleId: { type: String, default: null },
    hostId: { type: String, required: true },
    startedAtUnix: { type: Number, default: null },
    endsAtUnix: { type: Number, default: null },
    entrants: { type: [String], default: [] },
    winners: { type: [String], default: [] },
    rerolls: { type: [rerollSchema], default: [] },
    endedAtUnix: { type: Number, default: null },
    /** Who pressed End now; null when the timer ended it. */
    endedById: { type: String, default: null },
    cancelledById: { type: String, default: null },
  },
  { timestamps: true },
);
giveawaySchema.index({ status: 1, endsAtUnix: 1 });
giveawaySchema.index(
  { guildId: 1, number: 1 },
  { unique: true, partialFilterExpression: { number: { $type: 'number' } } },
);

export const Giveaway = mongoose.model('Giveaway', giveawaySchema);
