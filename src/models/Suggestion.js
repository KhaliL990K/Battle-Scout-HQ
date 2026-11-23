import mongoose from 'mongoose';

const { Schema } = mongoose;

const voteSchema = new Schema(
  {
    userId: { type: String, required: true },
    value: { type: Number, enum: [1, -1], required: true },
  },
  { _id: false },
);

const attachmentSchema = new Schema(
  {
    name: { type: String, required: true },
    contentType: { type: String, default: null },
    isMedia: { type: Boolean, default: false },
  },
  { _id: false },
);

/**
 * One document per suggestion. Never deleted: status moves it through its lifecycle and the
 * document stays as history. Votes live here (one entry per user) rather than on the message.
 */
const suggestionSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    number: { type: Number, required: true },
    authorId: { type: String, required: true, index: true },
    authorName: { type: String, required: true },
    authorAvatarUrl: { type: String, default: null },
    content: { type: String, default: '' },
    /** When the member originally posted, as a unix-seconds value for <t:unix:R>. */
    postedAtUnix: { type: Number, required: true },
    channelId: { type: String, required: true, index: true },
    messageId: { type: String, required: true, index: true },
    threadId: { type: String, default: null },
    attachments: { type: [attachmentSchema], default: [] },
    /** Attachments that were too large or failed to download, so the card can say so. */
    skippedAttachments: { type: Number, default: 0 },
    votes: { type: [voteSchema], default: [] },
    status: {
      type: String,
      enum: ['pending', 'approved', 'denied', 'considered', 'implemented', 'duplicate'],
      default: 'pending',
      index: true,
    },
    statusReason: { type: String, default: null },
    statusById: { type: String, default: null },
    statusAtUnix: { type: Number, default: null },
    /** The role this suggestion pinged when posted, kept so every re-render shows the line. */
    pingRoleId: { type: String, default: null },
  },
  { timestamps: true },
);
suggestionSchema.index({ guildId: 1, number: 1 }, { unique: true });

export const Suggestion = mongoose.model('Suggestion', suggestionSchema);
