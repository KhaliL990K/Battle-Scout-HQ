import mongoose from 'mongoose';

const { Schema } = mongoose;

const roleEntrySchema = new Schema(
  {
    roleId: { type: String, required: true },
    /** Shown on the button or select option; null falls back to the role's current name. */
    label: { type: String, default: null },
    /** Raw emoji typed by staff (Unicode or <:name:id>), parsed when the panel renders. */
    emoji: { type: String, default: null },
    /** Select-layout option description; ignored by the button layout. */
    description: { type: String, default: null },
  },
  { _id: false },
);

/**
 * A self-assign role panel. Members click to add or remove the listed roles. Removing a panel
 * deletes its message and sets `active: false`; the document stays as history.
 */
const rolePanelSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    channelId: { type: String, default: null },
    /** The published message; null until the first publish. */
    messageId: { type: String, default: null, index: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    /** `many`: toggle any role. `one`: picking a role removes the panel's other roles. */
    mode: { type: String, enum: ['many', 'one'], default: 'many' },
    layout: { type: String, enum: ['buttons', 'select'], default: 'buttons' },
    roles: { type: [roleEntrySchema], default: [] },
    active: { type: Boolean, default: true, index: true },
    createdById: { type: String, required: true },
  },
  { timestamps: true },
);

export const RolePanel = mongoose.model('RolePanel', rolePanelSchema);
