import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * One automod hit on one member. Never deleted: staff decisions move `status` along and the
 * evidence stays. `number` comes from nextSeq(guildId, 'infraction') so `/case` can find it.
 */
const infractionSchema = new Schema(
  {
    guildId: { type: String, required: true },
    number: { type: Number, required: true },
    userId: { type: String, required: true, index: true },
    userTag: { type: String, required: true },
    avatarUrl: { type: String, default: null },
    signal: { type: String, required: true },
    detail: { type: String, default: '' },
    sample: { type: String, default: '' },
    channelIds: { type: [String], default: [] },
    messageCount: { type: Number, default: 0 },
    deletedCount: { type: Number, default: 0 },
    accountCreatedUnix: { type: Number, default: null },
    /** Outcome of each automatic step, so the log shows what really happened. */
    timeoutUntilUnix: { type: Number, default: null },
    timeoutError: { type: String, default: null },
    dmSent: { type: Boolean, default: false },
    status: {
      type: String,
      enum: ['active', 'released', 'quarantined', 'kicked', 'banned'],
      default: 'active',
      index: true,
    },
    decidedById: { type: String, default: null },
    decidedAtUnix: { type: Number, default: null },
    /** Roles taken away by Quarantine, put back by Release. */
    removedRoleIds: { type: [String], default: [] },
    logChannelId: { type: String, default: null },
    logMessageId: { type: String, default: null },
  },
  { timestamps: true },
);

infractionSchema.index({ guildId: 1, number: 1 }, { unique: true });

export const Infraction = mongoose.model('Infraction', infractionSchema);
