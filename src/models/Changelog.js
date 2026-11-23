import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * A changelog entry from first draft to published. Drafts live here so a restart loses
 * nothing. `template` is a snapshot, so editing a template never rewrites a draft in flight
 * or a published entry. Never deleted: a cancelled draft keeps `status: 'cancelled'`.
 */
const changelogSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    templateId: { type: String, default: null },
    template: { type: Schema.Types.Mixed, required: true },
    version: { type: String, required: true },
    title: { type: String, required: true },
    /** section key -> markdown body. */
    sections: { type: Schema.Types.Mixed, default: () => ({}) },
    status: {
      type: String,
      enum: ['draft', 'publishing', 'published', 'cancelled'],
      default: 'draft',
      index: true,
    },
    ping: { type: Boolean, default: true },
    authorId: { type: String, required: true, index: true },
    channelId: { type: String, default: null },
    messageId: { type: String, default: null, index: true },
    publishedAtUnix: { type: Number, default: null },
  },
  { timestamps: true, minimize: false },
);

export const Changelog = mongoose.model('Changelog', changelogSchema);
