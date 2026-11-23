import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * One announcement from draft to sent. The author is stored on every send so the log can name
 * them. Never deleted: a cancelled draft keeps `status: 'cancelled'`.
 */
const announcementSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    authorId: { type: String, required: true, index: true },
    authorName: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    imageUrl: { type: String, default: null },
    channelId: { type: String, default: null },
    pingRoleId: { type: String, default: null },
    status: {
      type: String,
      enum: ['draft', 'sending', 'sent', 'cancelled'],
      default: 'draft',
      index: true,
    },
    messageId: { type: String, default: null, index: true },
    sentAtUnix: { type: Number, default: null },
    editCount: { type: Number, default: 0 },
    lastEditedById: { type: String, default: null },
  },
  { timestamps: true },
);

export const Announcement = mongoose.model('Announcement', announcementSchema);
