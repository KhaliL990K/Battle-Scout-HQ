# CLAUDE.md — BattleScout HQ Management Bot

Project guide for Claude Code. Read this fully before writing or changing code.

---

## 1. What this project is

A **private, single-guild Discord management bot** for the **BattleScout HQ**
server. It is not the BattleScout product bot. It is the staff tooling that
runs the community server: suggestions, announcements, changelogs, tickets,
anti-spam moderation and logging.

**Design philosophy — read this twice:**

> The bot is **panel-driven, not command-driven.**
> Staff manage everything through **persistent panels** made of **buttons and
> select menus**. Slash commands exist only where a panel cannot reach.
> If you are about to add a slash command, stop and ask whether it belongs in a
> panel instead.

Secondary rule:

> **Nothing is hardcoded.** Channel IDs, role IDs, thresholds, colours, emoji,
> copy text and toggles all live in the database and are edited from the
> Settings panel. The only values in `.env` are secrets and the guild ID.

---

## 2. Stack

| Concern           | Choice                                | Notes                                                                                                           |
| ----------------- | ------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Language          | **JavaScript (ESM)**, Node 20+        | `"type": "module"` in package.json. No TypeScript.                                                              |
| Library           | **discord.js v14** (latest stable)    | Check installed version before using newer APIs.                                                                |
| Database          | **MongoDB** via **Mongoose**          | Local `mongodb://127.0.0.1:27017/battlescout_hq` in dev; Atlas later. Connection string comes from `.env` only. |
| Process           | **pm2** on the VPS                    | `ecosystem.config.cjs` included.                                                                                |
| Lint/format       | ESLint + Prettier                     | Run before declaring a phase done.                                                                              |
| Logging (console) | **pino** with pretty transport in dev | Never `console.log` outside `src/lib/logger.js`.                                                                |

**Dependency rule:** keep them few. `discord.js`, `mongoose`, `pino`,
`dotenv`, and `zod` for config validation. Do **not** add anti-spam, ticket or
sticky npm packages — those behaviours are written here so they can be tuned.

---

## 3. Folder structure

```
battlescout-hq-bot/
├── CLAUDE.md
├── README.md
├── .env.example
├── ecosystem.config.cjs
├── src/
│   ├── index.js                 # entry: connect db, load modules, login
│   ├── config/
│   │   ├── env.js               # zod-validated process.env
│   │   ├── constants.js         # colours, limits, defaults
│   │   └── emoji.js             # emoji registry + resolver (see §7)
│   ├── lib/
│   │   ├── logger.js
│   │   ├── db.js                # mongoose connection + graceful shutdown
│   │   ├── customId.js          # encode/decode interaction ids (see §5)
│   │   ├── embeds.js            # embed factory helpers
│   │   ├── components.js        # button/select builder helpers
│   │   ├── permissions.js       # staff checks
│   │   └── settings.js          # cached guild settings accessor
│   ├── models/                  # one mongoose model per file
│   │   ├── GuildSettings.js
│   │   ├── Suggestion.js
│   │   ├── Ticket.js
│   │   ├── Changelog.js
│   │   ├── ChangelogTemplate.js
│   │   ├── Infraction.js
│   │   ├── StickyMessage.js
│   │   ├── RolePanel.js
│   │   ├── Giveaway.js
│   │   └── Counter.js           # atomic per-entity sequence numbers
│   ├── events/                  # one file per gateway event
│   │   ├── ready.js
│   │   ├── interactionCreate.js # single router → §5
│   │   ├── messageCreate.js
│   │   ├── messageUpdate.js
│   │   ├── messageDelete.js
│   │   ├── guildMemberAdd.js
│   │   ├── guildMemberRemove.js
│   │   └── guildMemberUpdate.js
│   ├── modules/                 # feature modules, see §6
│   │   ├── panels/              # staff hub + sub-panels
│   │   ├── suggestions/
│   │   ├── tickets/
│   │   ├── changelog/
│   │   ├── announcements/
│   │   ├── automod/
│   │   ├── logging/
│   │   ├── sticky/
│   │   ├── roles/               # self-assign role panels
│   │   ├── giveaways/
│   │   └── settings/
│   └── commands/                # the FEW slash commands (§8)
└── docs/
    ├── PANELS.md                # every panel, its components, its ids
    ├── SCHEMA.md                # every collection and field
    └── OPERATIONS.md            # deploy, backup, restore, troubleshooting
```

**Module shape.** Every folder in `modules/` exports the same interface:

```js
export default {
  name: 'suggestions',
  init(client) {}, // optional startup work (restore panels, caches)
  handlers: {
    // keyed by the "action" part of a custom id
    vote: async (interaction, params) => {},
    staff: async (interaction, params) => {},
  },
};
```

The router in `events/interactionCreate.js` resolves `module → handler`. No
module registers its own `interactionCreate` listener.

---

## 4. Data model (MongoDB / Mongoose)

Rules:

- One **`GuildSettings`** document per guild, keyed by `guildId`, even though
  the bot is single-guild. This keeps multi-guild possible later without a
  rewrite.
- Every document stores `createdAt` / `updatedAt` (`{ timestamps: true }`).
- Store Discord IDs as **strings**, never numbers.
- Index anything queried: `messageId`, `channelId`, `userId`, `status`.
- Use the **`Counter`** collection with `findOneAndUpdate({ $inc })` for
  sequential numbers (suggestion #042, ticket #0117). Never `countDocuments()`
  — it races.
- Never delete history. Tickets, suggestions and infractions get a `status`
  field and stay in the database.

`GuildSettings` is nested by module, for example:

```js
{
  guildId: String,
  suggestions: { channelId, reviewChannelId, enabled, minLength, cooldownSec, anonymousAllowed },
  tickets:     { panelChannelId, categoryId, staffRoleIds, transcriptChannelId, categories: [...] },
  logging:     { channelId, enabled, events: { messageDelete: true, ... } },
  automod:     { enabled, timeoutHours, lookbackMinutes, honeypotChannelId, exemptRoleIds, thresholds: {...} },
  changelog:   { channelId, pingRoleId, defaultTemplateId },
  emoji:       { /* id overrides, see §7 */ },
}
```

Settings are **cached in memory** on ready and refreshed on every write through
`lib/settings.js`. Never query the database inside a hot path like
`messageCreate`.

---

## 5. Interaction routing — the backbone

Every button, select menu and modal is routed by a structured custom id.

**Format:** `module:action:param1:param2` (colon separated, max 100 chars)

```
suggestions:vote:up:6523f1a2c9
suggestions:staff:menu:6523f1a2c9
tickets:open:bug
panels:nav:automod
settings:set:automod:timeoutHours
```

Use `lib/customId.js` for `encode(module, action, ...params)` and
`decode(id)`. Never build these strings by hand in a module.

**Hard rules:**

- **Panels must survive restarts.** All state lives in the custom id and in
  MongoDB. Never store a pending interaction in a variable that dies with the
  process, and never use collectors (`awaitMessageComponent`) for anything that
  must work after a restart. Collectors are acceptable only inside a single
  ephemeral confirm-or-cancel flow with a short timeout.
- Pass a **document `_id`**, never user-supplied text, in params.
- Every handler **re-checks permissions**. A custom id is public.
- Acknowledge within 3 seconds: `deferUpdate()` for panel navigation,
  `deferReply({ flags: MessageFlags.Ephemeral })` for slow work.
- Use `MessageFlags.Ephemeral`, not the deprecated `ephemeral: true`.

---

## 6. Modules — required behaviour

### 6.1 Panels (the Staff Hub)

One persistent message in the staff channel. Layout:

- A **select menu** ("Open a panel…") listing every module. The select menu is
  the primary navigator — prefer it over a wall of buttons.
- A small row of buttons for the most frequent actions (New changelog, New
  announcement, Refresh).

Sub-panels render **ephemerally** so several staff can work at once without
clobbering each other. Each sub-panel ends with a "Back to hub" button.

**Select menus are the default control.** Use them for: choosing a channel
(`ChannelSelectMenuBuilder`), a role (`RoleSelectMenuBuilder`), a user
(`UserSelectMenuBuilder`), a status, a template, a category, or any list of 3+
options. Use buttons only for 1–5 terminal actions (Confirm, Cancel, Publish,
Back) and for vote counters.

`/panel` (admin only) re-posts the hub and stores the new message id.

### 6.2 Suggestions

Flow, exactly:

1. A member posts in the suggestions channel.
2. The bot **deletes** the original message.
3. The bot **reposts it as an embed**, preserving: author name and avatar, the
   original text, the original timestamp (as a Discord relative timestamp so it
   renders in each viewer's local time), and any attachments
   (**re-uploaded**, because the original links die with the message).
4. Components: `👍 n` · `👎 n` · `💬 Why` · `⚙️ Manage`.
5. The bot opens a **public thread** on the repost named
   `#042 – <first ~40 chars>`.

Details:

- One vote per user, stored as `{ userId, value }` in the document. Clicking
  the same side again removes the vote; clicking the other side switches it.
  Update the counts on the button labels.
- **Why** opens a modal asking for a short reason; the bot posts it in the
  thread attributed to the user, and records which way they voted.
- **Manage** is staff-only and opens an ephemeral **select menu**: Approve,
  Deny, Considered, Implemented, Duplicate. Approve/Deny/Duplicate open a
  reason modal. The status changes the embed colour, adds a status field, and
  posts in the thread. On a final status, archive (do not lock) the thread.
- Ignore bots and staff announcements in that channel; enforce `minLength` and
  a per-user cooldown, replying ephemerally when rejected.
- Requires the **Message Content** intent (Developer Portal) and **Manage
  Messages**.

### 6.3 Tickets

- A panel in the ticket channel: one **select menu** of categories (Bug report,
  Support, Premium/billing, Partnership, Report a user) rather than a row of
  buttons, so categories can grow.
- Choosing a category opens a **modal of questions** configured per category.
- The bot creates a private channel under the configured category, named
  `ticket-0117-username`, with permission overwrites for the opener and the
  staff roles.
- In-channel controls: `Claim`, `Add user` (user select menu), `Close`.
- Close asks for a reason, posts a **transcript** (an HTML or text file
  generated from the channel history) to the transcript channel, DMs the opener
  (tolerate closed DMs), then deletes the channel after a short delay.
- One open ticket per user per category, enforced in the database.

### 6.4 Changelog (template builder)

- `ChangelogTemplate` documents hold: header format, which sections exist
  (Added / Fixed / Changed / Removed / Known issues), emoji per section, footer,
  ping role and accent colour.
- The panel flow: pick a template (select menu) → modal for version and title →
  a builder view where each section is filled through a modal → live
  **preview** with `Publish`, `Edit section` (select menu), `Save as draft`,
  `Cancel`.
- Publishing posts the embed, saves the `Changelog` document, and optionally
  pings the role. Drafts persist in MongoDB so a restart loses nothing.
- Editing the templates themselves is its own panel.

### 6.5 Announcements

- Panel → modal (title, body, optional image URL) → channel select → ping role
  select → preview → `Send` / `Edit` / `Cancel`.
- Support editing a previously sent announcement by message link.
- Log every send with the author.

### 6.6 Automod (anti-spam / scam)

Targets the "MrBeast giveaway" pattern: compromised accounts blasting the same
message across many channels.

Detection signals (each individually configurable):

- **Cross-channel duplicate** — the same or near-identical content in N+
  channels within a short window. This is the primary signal.
- **Rapid repeat** — N messages within X seconds.
- **Mass mentions** — more than N user/role mentions, or `@everyone` from a
  member who cannot ping.
- **Risky link or invite from a low-trust account** — account or join age below
  a threshold, or no roles.
- **Honeypot channel** — a locked, hidden-from-humans channel; anything posted
  there is spam.

Maintain an **in-memory ring buffer of each member's recent messages**
(configurable lookback, default 10 minutes) so deletion is exact and needs no
history fetching. Prune it on a timer.

Action pipeline when a signal fires:

1. Delete the offending messages across all channels (from the buffer).
2. **Timeout the member for 48 hours** (`timeoutHours`, default 48).
   Discord's maximum is 28 days, so validate the setting against that ceiling.
3. Write an `Infraction` document.
4. Post a red log embed with the evidence (matched signal, sample content,
   channels hit, account age) and a **review row**:
   `Release` · `Quarantine` · `Kick` · `Ban`.
   `Ban` bans with `deleteMessageSeconds` to sweep anything missed.
5. Optionally DM the member that their account may be compromised and they
   should change their password and check authorised apps. Tolerate failure.

Every staff decision is logged with who clicked it, and the review buttons
disable themselves afterwards.

**Exemptions:** staff roles, bots, and any configured exempt roles are skipped
entirely. The bot cannot moderate members above its own role or the owner —
detect this and report it in the log instead of throwing.

Start in a **dry-run mode** flag that logs what it _would_ do without acting.
This is essential for tuning before the bot touches real members.

### 6.7 Logging

- **One channel**, colour-coded, as specified by the owner.

| Colour | Hex       | Events                                           |
| ------ | --------- | ------------------------------------------------ |
| Red    | `#E74C3C` | Ban, kick, automod action                        |
| Orange | `#E67E22` | Timeout, quarantine, release                     |
| Yellow | `#F1C40F` | Message edit, message delete                     |
| Green  | `#2ECC71` | Join, ticket opened, suggestion approved         |
| Blue   | `#3498DB` | Ticket events, announcement, changelog, giveaway |
| Grey   | `#95A5A6` | Leave, settings change                           |

- Define these in `config/constants.js` as `LOG_COLORS`, never inline.
- Every event type can be toggled from the Logs panel (a multi-select of event
  types is the right control here).
- A single `logEvent({ type, color, title, fields, actor, target })` helper is
  the only way modules write logs.
- **Never log the bot's own housekeeping** — the suggestion repost deletion, a
  ticket channel the bot just deleted, sticky message churn.
- Queue log writes and flush them in batches to respect rate limits.

### 6.8 Sticky messages

Only used where a panel must stay at the bottom of an active channel.

- One sticky per channel, stored in MongoDB and cached in memory.
- Re-post after **N messages or T seconds, whichever comes later** — never on
  every message. Minimum interval enforced in code.
- Lock the channel while swapping so a burst cannot create duplicates.
- Delete the previous sticky, then send the new one, then update the stored
  message id. Handle "already deleted" errors silently.

### 6.9 Role panels (self-assign roles)

- Staff build panels in the Role panels panel: title, description, channel, roles (a role select),
  mode (`many` toggles any role, `one` swaps), and layout (up to 20 buttons, or a select of up to 25).
- Members click to add or remove a role; the reply is ephemeral and the public message is never
  edited by a click.
- Every click is checked against the panel **document**, never the custom id, and the role is
  re-checked for safety. Never offer `@everyone`, managed roles, roles at or above the bot, roles
  that grant moderation or admin permissions, or roles with power inside this bot (staff, ticket
  staff, automod-exempt, quarantine).
- The main use is opt-in **ping roles**. The Suggestions panel can mention one on every new
  suggestion, rate-limited in memory by `suggestions.pingCooldownMin`.

### 6.10 Giveaways

- Panel → modal (prize, description, winners, duration) → composer with preview, channel and ping
  role → Start. No entry rules: one Enter button, one entry per member, and a second click offers Leave.
- End on time **without long timers**: a short sweep queries what is due, so restarts and long
  durations are safe. End with an atomic `running → ending` claim so nothing draws twice.
- Draw with `crypto.randomInt`, skip members who left, and ping exactly the winners. Reroll draws one
  more winner from those who have not won. Every action is logged.

---

## 7. Emoji — the custom emoji rule

> **The bot must use custom BattleScout emoji for its UI, not stock Unicode
> emoji.** Unicode is a _fallback_, never the design.

Implementation, required:

- `src/config/emoji.js` exports a **registry** mapping semantic keys to
  `{ id, name, fallback, animated }`:

  ```js
  export const EMOJI = {
    voteUp: { key: 'bs_up', fallback: '👍' },
    voteDown: { key: 'bs_down', fallback: '👎' },
    suggestion: { key: 'bs_bulb', fallback: '💡' },
    ticket: { key: 'bs_ticket', fallback: '🎫' },
    shield: { key: 'bs_shield', fallback: '🛡️' },
    // ...
  };
  ```

- A `resolve(key)` function returns a usable emoji:
  1. an **application emoji** (bot-owned, usable anywhere) if uploaded;
  2. otherwise a **guild emoji** matched by name in the HQ server;
  3. otherwise the **Unicode fallback**.
- Resolution happens **once on ready**, caching ids in memory. Never look up
  emoji per interaction.
- **Prefer application emoji** (`client.application.emojis`) over guild emoji —
  they are not bound to the server and never break if the emoji is removed from
  the guild.
- Components take `{ emoji: resolve('voteUp') }`. Never hardcode `<:name:id>`
  strings in module code, and never paste a raw Unicode emoji into an embed
  outside the registry.
- Log a warning on startup listing any key that fell back, so missing uploads
  are visible.
- Settings panel exposes emoji overrides so you can swap one without a deploy.

Same discipline for **colours** (`constants.js`), **copy text** (one strings
file per module), and **timestamps** (always `<t:unix:R>` or `<t:unix:F>`,
never a formatted date string — Discord renders it in each viewer's timezone).

---

## 8. Slash commands (deliberately few)

Only these, all guild-scoped and admin/staff gated:

- `/panel` — post or refresh the staff hub.
- `/sticky` — set or clear a sticky in the current channel (subcommands).
- `/ticket add|remove|close` — in-channel ticket convenience.
- `/case <type> <number>` — look up an infraction, suggestion, ticket or giveaway by number.

Anything else belongs in a panel. Register commands on startup only when the
command definitions have changed (hash them) to avoid pointless API calls.

---

## 9. Code standards

- **ESM everywhere**, named exports, no default-exported god objects except the
  module interface in §3.
- Async/await only. No `.then()` chains.
- **Never swallow errors.** Wrap every handler in the router's try/catch, log
  with context (module, action, user, guild), and reply ephemerally with a
  friendly message plus a short error id.
- Discord API calls can fail — always handle `10008` (unknown message),
  `10003` (unknown channel), `50013` (missing permissions), `50007` (cannot DM)
  explicitly rather than crashing.
- **Validate before acting**: does the channel still exist, is the member still
  in the guild, is the bot's role high enough.
- Keep functions small; a handler that exceeds ~60 lines should delegate to a
  service file in its module.
- JSDoc on every exported function. Comments explain _why_, not _what_.
- No secrets in code, logs, or embeds. `.env` is gitignored; `.env.example` is
  committed.
- Graceful shutdown: on `SIGINT`/`SIGTERM`, flush the log queue, close the
  Mongoose connection, destroy the client.

---

## 10. Required intents and permissions

**Intents:** `Guilds`, `GuildMessages`, `MessageContent`, `GuildMembers`,
`GuildModeration`. The last three are privileged — enable them in the
Developer Portal or the bot will not start. Fail loudly with a clear message if
a required intent is missing.

**Permissions:** Manage Messages, Manage Channels, Manage Roles, Moderate
Members, Ban Members, Kick Members, Read Message History, Send Messages,
Embed Links, Attach Files, Create Public Threads, Manage Threads.

---

## 11. Build phases

Build in this order. **Finish and verify a phase before starting the next.**
Each phase ends with: updated docs, a working `npm start`, and a manual test
checklist in the PR or summary.

| Phase                             | Deliverable                                                                                                                                                                                                                                                          |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1 — Foundation**                | Project scaffold, env validation, Mongoose connection, logger, `GuildSettings` model + cache, `customId` helpers, embed/component factories, emoji registry + resolver, the interaction router, `/panel`, and a working Staff Hub whose sub-panels are placeholders. |
| **2 — Logging**                   | `logEvent` helper, the one colour-coded channel, all gateway listeners, per-event toggles in the Logs panel, batching. Everything later logs through it.                                                                                                             |
| **3 — Suggestions**               | Repost flow, votes, Why modal, thread creation, staff status select, full settings panel.                                                                                                                                                                            |
| **4 — Tickets**                   | Category select panel, question modals, channel creation, claim/add/close, transcripts, settings.                                                                                                                                                                    |
| **5 — Changelog + Announcements** | Template model and editor, builder flow with preview and drafts, publishing, announcement flow.                                                                                                                                                                      |
| **6 — Automod**                   | Message ring buffer, the detection signals, dry-run mode, the action pipeline, the review row, infractions, honeypot.                                                                                                                                                |
| **7 — Sticky + polish**           | Sticky engine, `/case`, `/sticky`, settings coverage audit, docs pass, pm2 config.                                                                                                                                                                                   |
| **8 — Roles + giveaways**         | Self-assign role panels, rate-limited suggestion ping role, giveaways with scheduler, draw and reroll, `/case giveaway`.                                                                                                                                             |

---

## 12. Testing and safety

- Develop against a **private test guild**, never BattleScout HQ. `GUILD_ID`
  comes from `.env`.
- Automod ships **dry-run first**. Only disable dry-run after watching the logs
  on live traffic.
- Before any destructive action (delete channel, ban, mass delete) log the
  intent first, so a crash mid-action is still traceable.
- Seed script (`npm run seed`) to create a plausible `GuildSettings` document
  for local testing.
- Manual test checklist per module lives in `docs/`.

---

## 13. Documentation duties

Whenever you add or change a feature, update in the same change:

- `docs/PANELS.md` — the panel tree, each component, each custom id.
- `docs/SCHEMA.md` — collections, fields, indexes.
- `docs/OPERATIONS.md` — anything an operator needs at 3am.
- `README.md` — setup steps, required intents, permission invite link.

Undocumented features are considered unfinished.

---

## 14. Future-proofing

BattleScout is planned to grow into a network of bots and tools. Therefore:

- Keep `guildId` on every document.
- Keep modules self-contained with the `init` + `handlers` interface, so one
  can be lifted out.
- Do not couple this bot to the BattleScout product bot or its dashboard. If a
  premium-role sync is ever added, it enters through a clearly separated
  `modules/integrations/` with its own credentials.
