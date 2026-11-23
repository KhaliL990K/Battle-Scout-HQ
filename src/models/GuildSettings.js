import mongoose from 'mongoose';
import { DEFAULT_LOG_EVENTS } from '../config/constants.js';

const { Schema } = mongoose;

/**
 * One document per guild, nested by module. Single-guild today, keyed by guildId so
 * multi-guild stays possible without a rewrite. All IDs are strings.
 */
const guildSettingsSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },

    /** Hash of the last registered slash-command definitions; skips redundant API calls. */
    commandHash: { type: String, default: null },

    staff: {
      roleIds: { type: [String], default: [] },
      hubChannelId: { type: String, default: null },
      hubMessageId: { type: String, default: null },
    },

    suggestions: {
      enabled: { type: Boolean, default: false },
      channelId: { type: String, default: null },
      reviewChannelId: { type: String, default: null },
      minLength: { type: Number, default: 10 },
      cooldownSec: { type: Number, default: 60 },
      /** Leave staff messages in the channel alone instead of reposting them. */
      ignoreStaff: { type: Boolean, default: false },
      /** Role mentioned on new suggestions, at most once per pingCooldownMin (0 = every one). */
      pingRoleId: { type: String, default: null },
      pingCooldownMin: { type: Number, default: 10, min: 0, max: 1440 },
    },

    tickets: {
      panelChannelId: { type: String, default: null },
      panelMessageId: { type: String, default: null },
      categoryId: { type: String, default: null },
      staffRoleIds: { type: [String], default: [] },
      transcriptChannelId: { type: String, default: null },
      categories: { type: [Schema.Types.Mixed], default: [] },
    },

    logging: {
      enabled: { type: Boolean, default: false },
      channelId: { type: String, default: null },
      events: { type: Schema.Types.Mixed, default: () => ({ ...DEFAULT_LOG_EVENTS }) },
    },

    automod: {
      enabled: { type: Boolean, default: false },
      dryRun: { type: Boolean, default: true },
      timeoutHours: { type: Number, default: 48, min: 1, max: 672 },
      lookbackMinutes: { type: Number, default: 10 },
      honeypotChannelId: { type: String, default: null },
      exemptRoleIds: { type: [String], default: [] },
      quarantineRoleId: { type: String, default: null },
      dmMember: { type: Boolean, default: true },
      thresholds: { type: Schema.Types.Mixed, default: () => ({}) },
    },

    changelog: {
      channelId: { type: String, default: null },
      pingRoleId: { type: String, default: null },
      defaultTemplateId: { type: String, default: null },
    },

    announcements: {
      channelId: { type: String, default: null },
      pingRoleId: { type: String, default: null },
    },

    /** Defaults for new giveaways; each giveaway can pick its own channel and ping. */
    giveaways: {
      channelId: { type: String, default: null },
      pingRoleId: { type: String, default: null },
    },

    /** Emoji registry overrides: semantic key -> emoji name to look up. */
    emoji: { type: Map, of: String, default: () => new Map() },
  },
  { timestamps: true, minimize: false },
);

export const GuildSettings = mongoose.model('GuildSettings', guildSettingsSchema);
