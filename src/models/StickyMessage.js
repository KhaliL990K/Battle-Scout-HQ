import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * One sticky per channel. Removing a sticky sets `active: false` rather than deleting, so the
 * history and settings survive and re-adding reuses the same document.
 */
const stickyMessageSchema = new Schema(
  {
    guildId: { type: String, required: true },
    channelId: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    /** Re-post after this many messages AND this many seconds, whichever comes later. */
    afterMessages: { type: Number, required: true },
    afterSeconds: { type: Number, required: true },
    active: { type: Boolean, default: true },
    /** Paused stickies stay where they are but are no longer re-posted. */
    paused: { type: Boolean, default: false },
    messageId: { type: String, default: null },
    lastPostedAtUnix: { type: Number, default: null },
    createdById: { type: String, required: true },
  },
  { timestamps: true },
);

stickyMessageSchema.index({ guildId: 1, channelId: 1 }, { unique: true });

export const StickyMessage = mongoose.model('StickyMessage', stickyMessageSchema);
