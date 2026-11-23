import mongoose from 'mongoose';

const { Schema } = mongoose;

/**
 * A reusable changelog layout: how the header reads, which sections exist, their icons, the
 * footer, the accent colour and the role to ping. `emojiKey` is an emoji registry key.
 */
const changelogTemplateSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    name: { type: String, required: true },
    /** Placeholders: {version}, {title}, {date}. */
    headerFormat: { type: String, required: true },
    sections: [
      {
        _id: false,
        key: { type: String, required: true },
        label: { type: String, required: true },
        emojiKey: { type: String, default: 'changelog' },
      },
    ],
    footer: { type: String, default: '' },
    accent: { type: Number, required: true },
    pingRoleId: { type: String, default: null },
  },
  { timestamps: true },
);

export const ChangelogTemplate = mongoose.model('ChangelogTemplate', changelogTemplateSchema);
