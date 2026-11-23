import mongoose from 'mongoose';

const { Schema } = mongoose;

const answerSchema = new Schema(
  { question: { type: String, required: true }, answer: { type: String, default: '' } },
  { _id: false },
);

/**
 * One document per ticket. Never deleted: closing a ticket removes the Discord channel but the
 * document, its answers and the close reason stay as history.
 */
const ticketSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    number: { type: Number, required: true },
    openerId: { type: String, required: true, index: true },
    openerName: { type: String, required: true },
    categoryKey: { type: String, required: true },
    categoryLabel: { type: String, required: true },
    channelId: { type: String, default: null, index: true },
    /** The in-channel control message, edited when the ticket is claimed. */
    controlMessageId: { type: String, default: null },
    status: { type: String, enum: ['open', 'closed'], default: 'open', index: true },
    claimedById: { type: String, default: null },
    addedUserIds: { type: [String], default: [] },
    answers: { type: [answerSchema], default: [] },
    closedById: { type: String, default: null },
    closeReason: { type: String, default: null },
    closedAtUnix: { type: Number, default: null },
    /** False until the Discord channel is gone; a startup sweep finishes interrupted deletes. */
    transcriptSent: { type: Boolean, default: false },
    channelDeleted: { type: Boolean, default: false },
  },
  { timestamps: true },
);
ticketSchema.index({ guildId: 1, number: 1 }, { unique: true });
// The database, not the code, enforces one open ticket per member per category.
ticketSchema.index(
  { guildId: 1, openerId: 1, categoryKey: 1 },
  { unique: true, partialFilterExpression: { status: 'open' } },
);

export const Ticket = mongoose.model('Ticket', ticketSchema);
