import { AttachmentBuilder } from 'discord.js';
import { TICKET_LIMITS } from '../../config/constants.js';

const escapeHtml = (s) =>
  String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Collect the text of a Components V2 message, which has no `content` of its own. */
function componentText(components) {
  const parts = [];
  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (typeof node.content === 'string') parts.push(node.content);
    for (const key of ['components', 'accessory']) {
      const child = node[key];
      if (Array.isArray(child)) child.forEach(walk);
      else walk(child);
    }
  };
  for (const c of components ?? []) walk(c.toJSON?.() ?? c);
  return parts.join('\n');
}

/**
 * Fetch the whole channel history, oldest first, up to the transcript cap.
 * @param {import('discord.js').TextChannel} channel
 * @returns {Promise<{ messages: import('discord.js').Message[], truncated: boolean }>}
 */
export async function collectMessages(channel) {
  const all = [];
  let before;
  while (all.length < TICKET_LIMITS.transcriptMaxMessages) {
    const batch = await channel.messages.fetch({ limit: 100, before });
    if (batch.size === 0) break;
    all.push(...batch.values());
    before = batch.last().id;
  }
  const truncated = all.length >= TICKET_LIMITS.transcriptMaxMessages;
  return { messages: all.reverse(), truncated };
}

function renderMessage(m) {
  const body = [m.content, componentText(m.components)].filter(Boolean).join('\n');
  const files = [...m.attachments.values()]
    .map((a) => `<a href="${escapeHtml(a.url)}">${escapeHtml(a.name)}</a>`)
    .join(' · ');
  const time = new Date(m.createdTimestamp).toISOString().replace('T', ' ').slice(0, 19);
  return `<div class="m${m.author.bot ? ' bot' : ''}">
  <div class="h"><b>${escapeHtml(m.member?.displayName ?? m.author.username)}</b>
  <span>${escapeHtml(m.author.id)} · ${time} UTC</span></div>
  <div class="b">${escapeHtml(body)}</div>${files ? `\n  <div class="f">${files}</div>` : ''}
</div>`;
}

/**
 * Build a self-contained HTML transcript file for a ticket.
 * @param {object} ticket Ticket document
 * @param {import('discord.js').Message[]} messages oldest first
 * @param {boolean} truncated
 * @returns {AttachmentBuilder}
 */
export function buildTranscript(ticket, messages, truncated) {
  const number = String(ticket.number).padStart(4, '0');
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Ticket ${number}</title>
<style>
body{font:14px/1.5 system-ui,sans-serif;background:#1e1f22;color:#dbdee1;max-width:860px;margin:2rem auto;padding:0 1rem}
h1{font-size:1.2rem}.m{padding:.5rem .75rem;border-left:3px solid #4e5058;margin:.5rem 0;background:#2b2d31}
.m.bot{border-left-color:#5865f2}.h span{color:#949ba4;font-size:.8rem;margin-left:.5rem}
.b{white-space:pre-wrap;word-break:break-word}.f a{color:#00a8fc}.note{color:#f0b232}
</style></head><body>
<h1>Ticket #${number} · ${escapeHtml(ticket.categoryLabel)}</h1>
<p>Opened by ${escapeHtml(ticket.openerName)} (${escapeHtml(ticket.openerId)}) · ${messages.length} messages</p>
${truncated ? '<p class="note">Transcript truncated: only the most recent messages are included.</p>' : ''}
${messages.map(renderMessage).join('\n')}
</body></html>`;
  return new AttachmentBuilder(Buffer.from(html, 'utf8'), { name: `ticket-${number}.html` });
}
