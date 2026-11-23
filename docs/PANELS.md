# Panels

Every panel is a Components V2 card built with `src/lib/ui/card.js`. Custom ids follow
`module:action:param1:param2` and are built only with `lib/customId.js`.

## Card grammar

```
Container (accent = module colour)
 ├─ header     title + subtitle, optional thumbnail
 ├─ divider
 ├─ rows       label + value, optional button beside the text
 └─ controls   select menus, then up to 5 buttons
```

Limits asserted by `render()`: 40 components, 4000 text characters per message.

## Staff Hub (persistent, posted by `/panel`)

| Component        | Custom id                    | Behaviour                              |
| ---------------- | ---------------------------- | -------------------------------------- |
| Navigator select | `panels:nav`                 | Opens the chosen sub-panel ephemerally |
| New changelog    | `panels:quick:changelog`     | Template picker, or version modal      |
| New announcement | `panels:quick:announcements` | Opens the compose modal directly       |
| New giveaway     | `panels:quick:giveaways`     | Opens the new-giveaway modal           |
| Refresh          | `panels:refresh`             | Re-renders the hub in place            |

Sub-panels edit in place when already ephemeral; from the public hub they reply ephemerally.
Every sub-panel ends with **Back to hub** (`panels:home`).

Panel keys: `suggestions`, `tickets`, `changelog`, `announcements`, `roles`, `giveaways`, `automod`,
`logging`, `sticky`, `settings`. The hub lists every panel as one status line under **Community** or
**Staff tools** (the catalog's `group`), and the navigator select opens them. Per-row Open buttons
were dropped in Phase 8: at three components a row they pushed the hub past Discord's 40-component
limit. The hub now uses about 15. Old hub messages still work, because `panels:nav:<key>` still routes.

## Logs panel (`logging`)

| Component               | Custom id         | Writes                                   |
| ----------------------- | ----------------- | ---------------------------------------- |
| Enable / Disable button | `logging:power`   | `logging.enabled`                        |
| Channel select          | `logging:channel` | `logging.channelId`                      |
| Event multi-select      | `logging:events`  | `logging.events` (every type true/false) |
| Send test entry         | `logging:test`    | nothing; queues a forced entry           |
| Back to hub             | `panels:home`     |                                          |

Every settings write produces a grey "Setting changed" log entry with actor, path, before, after.

## Suggestions panel (`suggestions`)

| Component               | Custom id                 | Writes                                         |
| ----------------------- | ------------------------- | ---------------------------------------------- |
| Enable / Disable button | `suggestions:power`       | `suggestions.enabled` (needs a channel)        |
| Channel select          | `suggestions:channel`     | `suggestions.channelId`                        |
| Review channel select   | `suggestions:review`      | `suggestions.reviewChannelId` (clearable)      |
| Limits Edit button      | `suggestions:limits`      | opens modal, submits `suggestions:limitsubmit` |
| Staff messages toggle   | `suggestions:ignorestaff` | `suggestions.ignoreStaff`                      |
| Ping role select        | `suggestions:pingrole`    | `suggestions.pingRoleId` (clearable)           |
| Back to hub             | `panels:home`             |                                                |

The card also shows a live permission check for the suggestions channel and all-time counts per status.
The Limits modal holds a third field, **minutes between role pings** (`suggestions.pingCooldownMin`, 0 to
1440, where 0 pings on every suggestion).

When a ping role is set, a new suggestion mentions it unless another suggestion pinged within the
cooldown. The cooldown is kept in memory, so a restart allows one early ping. A suggestion that pinged
stores `pingRoleId`, and its card keeps a small `🔔 @role` line on every re-render. Edits never notify
again. Members opt in through a Role panel.

## Suggestion card (public, in the suggestions channel)

| Component   | Custom id                          | Who    | Behaviour                                                                         |
| ----------- | ---------------------------------- | ------ | --------------------------------------------------------------------------------- |
| 👍 n / 👎 n | `suggestions:vote:<up\|down>:<id>` | anyone | One vote per member; same side removes, other side switches; atomic               |
| Why         | `suggestions:why:<id>`             | anyone | Modal (`suggestions:whysubmit:<id>`); reason posted in the thread with their vote |
| Manage      | `suggestions:manage:<id>`          | staff  | Ephemeral status select `suggestions:status:<id>`                                 |
| (modal)     | `suggestions:reason:<id>:<status>` | staff  | Reason for Approved / Denied / Duplicate, then applies the status                 |

Statuses: Pending, Approved, Denied, Considered, Implemented, Duplicate. Approved, Denied,
Implemented and Duplicate archive the thread (never lock it). Each change edits the card (accent
colour plus a status block), posts in the thread and logs a `suggestionEvent`.

## Tickets panel (`tickets`)

| Component                 | Custom id              | Writes                                           |
| ------------------------- | ---------------------- | ------------------------------------------------ |
| Post / Repost button      | `tickets:postpanel`    | posts the public panel, `tickets.panelMessageId` |
| Panel channel select      | `tickets:panelchannel` | `tickets.panelChannelId`                         |
| Ticket category select    | `tickets:parent`       | `tickets.categoryId` (a Discord category)        |
| Staff roles select        | `tickets:roles`        | `tickets.staffRoleIds` (extra to general staff)  |
| Transcript channel select | `tickets:transcript`   | `tickets.transcriptChannelId` (clearable)        |
| Categories Edit button    | `tickets:cats`         | opens the category list                          |

Category editor (all write `tickets.categories`, then refresh the posted panel):
`tickets:catpick` (select), `catnew`, `catdetails:<key>` + `catdetailssubmit:<key>`,
`catquestions:<key>` + `catquestionssubmit:<key>`, `catdelete:<key>` then `catdeleteok:<key>`,
`catdefaults` (loads the five starter categories when none exist), `home` (back to Tickets).
A category has a name, a short description and 1 to 5 questions (each up to 45 characters,
the Discord modal label limit).

## Ticket panel (public) and ticket channel

| Component       | Custom id              | Who                    | Behaviour                                                  |
| --------------- | ---------------------- | ---------------------- | ---------------------------------------------------------- |
| Category select | `tickets:open`         | anyone                 | Opens the category's question modal `tickets:submit:<key>` |
| Add user select | `tickets:adduser:<id>` | ticket staff           | Grants the user access, notes it in the channel            |
| Claim / Release | `tickets:claim:<id>`   | ticket staff           | Atomic; only the holder can release                        |
| Close           | `tickets:close:<id>`   | opener or ticket staff | Optional reason modal `tickets:closesubmit:<id>`           |

"Ticket staff" = general staff (hub setting) plus the roles chosen in the Tickets panel.

## Changelog panel (`changelog`)

| Component             | Custom id             | Writes / behaviour                                    |
| --------------------- | --------------------- | ----------------------------------------------------- |
| New button            | `changelog:newdraft`  | One template: version modal. Several: template picker |
| Templates Edit button | `changelog:tpls`      | Opens the template list                               |
| Channel select        | `changelog:channel`   | `changelog.channelId`                                 |
| Default ping role     | `changelog:pingrole`  | `changelog.pingRoleId` (clearable)                    |
| Resume a draft        | `changelog:draftpick` | Opens the draft in the builder                        |

The hub's **New changelog** button (`panels:quick:changelog`) runs `newdraft` directly.

Template editor: `tplpick` (select), `tplnew`, `tpldetails:<id>` + `tpldetailssubmit:<id|new>`
(name, header format, footer, hex colour), `tplsections:<id>` + `tplsectionssubmit:<id>` (one section
per line, up to 8; existing sections keep their key and icon), `tplping:<id>` (role select),
`tpldefault:<id>`, `tpldelete:<id>` then `tpldeleteok:<id>`. The last template cannot be deleted.
Header placeholders: `{version}`, `{title}`, `{date}` (rendered as a Discord timestamp).

**Builder** (ephemeral): the live preview card, exactly as it will be posted, above a control card.

| Component      | Custom id                     | Behaviour                                                                        |
| -------------- | ----------------------------- | -------------------------------------------------------------------------------- |
| Start          | `changelog:startsubmit:<tpl>` | Version + title modal creates the draft                                          |
| Edit a section | `changelog:section:<id>`      | Select opens `sectionsubmit:<id>:<key>`, a paragraph modal                       |
| Publish        | `changelog:publish:<id>`      | Atomic claim, post, log; disabled until a section is filled and a channel is set |
| Ping on/off    | `changelog:ping:<id>`         | Toggles the role ping for this draft                                             |
| Edit title     | `changelog:titleedit:<id>`    | Modal `titlesubmit:<id>`                                                         |
| Save as draft  | `changelog:savedraft:<id>`    | Drafts save on every edit; this just closes the builder                          |
| Cancel         | `changelog:cancel:<id>`       | Status becomes `cancelled` (kept, not deleted)                                   |

The total text is capped at 3300 characters so the preview and controls fit Discord's 4000
limit; an edit that goes over is refused with the amount to cut. The ping role is the
template's own, else the panel default.

## Announcements panel (`announcements`)

| Component              | Custom id                      | Writes / behaviour                                   |
| ---------------------- | ------------------------------ | ---------------------------------------------------- |
| New button             | `announcements:newdraft`       | Compose modal (title, message, optional https image) |
| Edit a sent one        | `announcements:editlink`       | Asks for the message link, `editlinksubmit`          |
| Default channel select | `announcements:defaultchannel` | `announcements.channelId` (clearable)                |
| Default ping role      | `announcements:defaultping`    | `announcements.pingRoleId` (clearable)               |
| Resume a draft         | `announcements:draftpick`      | Opens the draft in the composer                      |

**Composer** (ephemeral): live preview above a channel select (`channel:<id>`), a ping role select
(`pingrole:<id>`) and the buttons Send (`send:<id>`), Edit (`edit:<id>` then `composesubmit:<id>`),
Cancel (`cancel:<id>`) and Save for later (`home`). Drafts save on every change. Sending is an
atomic claim, so a double click posts once. Editing a sent announcement (from its link, or the
Edit message button) changes the live Discord message in place and is logged. Only announcements
sent through this panel can be edited this way.

Both flows log to the blue `announcement` / `changelog` events with the author.

## Automod panel (`automod`)

| Component                 | Custom id                                 | Writes                                                                |
| ------------------------- | ----------------------------------------- | --------------------------------------------------------------------- |
| Enable / Disable          | `automod:power`                           | `automod.enabled`                                                     |
| Go live / Back to dry-run | `automod:dryrun`                          | `automod.dryRun` (starts on)                                          |
| DM toggle                 | `automod:dmtoggle`                        | `automod.dmMember`                                                    |
| Active signals (multi)    | `automod:signals`                         | `automod.thresholds.signals`                                          |
| Exempt roles              | `automod:exempt`                          | `automod.exemptRoleIds` (staff are always exempt)                     |
| Honeypot channel          | `automod:honeypot`                        | `automod.honeypotChannelId` (clearable)                               |
| Quarantine role           | `automod:quarantinerole`                  | `automod.quarantineRoleId` (clearable)                                |
| Timeout and memory        | `automod:timing` + `timingsubmit`         | `timeoutHours` (1 to 672), `lookbackMinutes` (1 to 60)                |
| Thresholds                | `automod:thresholds` + `thresholdssubmit` | duplicate channels and window, rapid count and seconds, mention limit |
| Link rules                | `automod:linkrules` + `linkrulessubmit`   | account age, join age, flag members with no roles                     |

Signals, first match wins: honeypot, cross-channel duplicate (normalised text, 90% similar, in
N or more channels within the window), mass mentions (over the limit, or @everyone/@here from a
member who cannot ping), risky link (a link or invite from a young account or a recent joiner),
rapid repeat. Staff, exempt roles, bots and webhooks are skipped entirely.

**Review card** (posted to the log channel when a case opens, red, one message per case):

| Button     | Custom id                 | Effect                                                             |
| ---------- | ------------------------- | ------------------------------------------------------------------ |
| Release    | `automod:release:<id>`    | Lifts the timeout, restores roles taken by quarantine              |
| Quarantine | `automod:quarantine:<id>` | Strips roles, adds the quarantine role, keeps the timeout          |
| Kick       | `automod:kick:<id>`       | Asks to confirm (`kickok:<id>`), then kicks                        |
| Ban        | `automod:ban:<id>`        | Asks to confirm (`banok:<id>`), then bans and removes the last day |

A decision is an atomic claim, so two moderators cannot both act. The card rewrites itself with
who decided and disables its buttons; after Quarantine, Release, Kick and Ban stay available.
Every decision also logs an entry naming the staff member.

## Role panels (`roles`)

Staff build self-assign role panels. Members click to give themselves roles, for example a
"Suggestion alerts" ping role.

| Component                   | Custom id                                       | Behaviour                                                            |
| --------------------------- | ----------------------------------------------- | -------------------------------------------------------------------- |
| Panel select                | `roles:manage`                                  | Opens a panel's manage card                                          |
| New role panel              | `roles:new`                                     | Title/description modal (`roles:createsubmit`)                       |
| Members can · Switch        | `roles:mode:<id>`                               | `many` (toggle any) or `one` (picking one swaps the others)          |
| Layout · Switch             | `roles:layout:<id>`                             | Buttons (up to 20 roles) or a select menu (up to 25)                 |
| Channel select              | `roles:channel:<id>`                            | Where it posts; moving deletes the old message                       |
| Role select                 | `roles:setroles:<id>`                           | The panel's roles; unsafe roles are refused and listed               |
| Role label select           | `roles:label:<id>`                              | Modal (`roles:labelsubmit:<id>:<roleId>`): label, emoji, description |
| Publish / Update            | `roles:publish:<id>`                            | Sends the panel, or edits the existing message                       |
| Edit text                   | `roles:text:<id>`                               | Modal (`roles:textsubmit:<id>`)                                      |
| Remove, then Confirm remove | `roles:remove:<id>`, `roles:removeconfirm:<id>` | Deletes the message; the record stays, inactive                      |
| All panels                  | `roles:home`                                    | Back to the list                                                     |

**Public panel.** In the buttons layout, `roles:toggle:<panelId>:<roleId>` adds the role on the first
click and removes it on the next. In the select layout, `roles:pick:<panelId>` makes the member's
roles from that panel match the selection. Both are public actions and reply ephemerally. The public
message is never edited by a click.

Every click is checked against the panel document, not the custom id. A role that is not on the panel
is refused, and so is a role that is no longer safe.

A role is **unsafe** when any of these is true:

- it is `@everyone` or managed by an integration;
- it sits at or above the bot's highest role;
- the bot lacks Manage Roles;
- it grants any of Administrator, Manage Server/Roles/Channels/Messages/Webhooks, Ban, Kick,
  Timeout or Mention Everyone;
- it has power inside this bot: a bot staff role (Settings), a ticket staff role, an automod-exempt
  role, or the quarantine role. These carry no Discord permission bit, but clicking one would make
  a member staff or let them skip automod.

The existing `roleChange` log records each change, and the audit-log reason is
`Role panel: <title>`. Publishing and removing log a grey settings entry with who did it.

## Giveaways (`giveaways`)

Staff run giveaways from this panel or from the hub's **New giveaway** button. Anyone can enter, and
there are no entry rules.

| Component              | Custom id                  | Behaviour                                                                         |
| ---------------------- | -------------------------- | --------------------------------------------------------------------------------- |
| Giveaway select        | `giveaways:manage`         | Opens the composer (drafts) or the manage card                                    |
| Default channel select | `giveaways:defaultchannel` | `giveaways.channelId` (clearable)                                                 |
| Default ping select    | `giveaways:defaultping`    | `giveaways.pingRoleId` (clearable)                                                |
| New giveaway           | `giveaways:new`            | Modal (`giveaways:createsubmit`): prize, description, winners (1 to 20), duration |

**Composer** (a draft): a live preview above the controls.

| Component      | Custom id                | Behaviour                                                                     |
| -------------- | ------------------------ | ----------------------------------------------------------------------------- |
| Edit           | `giveaways:edit:<id>`    | Same modal, prefilled (`giveaways:editsubmit:<id>`)                           |
| Channel select | `giveaways:channel:<id>` | Where it posts                                                                |
| Ping select    | `giveaways:ping:<id>`    | Role mentioned when it starts, with the usual mentionable warning             |
| Start          | `giveaways:start:<id>`   | Atomic claim, takes the next number, posts; a failed send returns it to draft |
| Discard        | `giveaways:discard:<id>` | Marks the draft cancelled and hides it from the list                          |

**Manage card**:

- While running: **End now** (`giveaways:endnow:<id>`) and **Cancel**, then **Confirm cancel**
  (`giveaways:cancel:<id>`, `giveaways:cancelconfirm:<id>`).
- Once ended: **Reroll one winner** (`giveaways:reroll:<id>`).

**Public card.** The **Enter (n)** button is `giveaways:enter:<id>`, a public action.

- The first click enters and replies ephemerally.
- A second click replies with a **Leave giveaway** button (`giveaways:leave:<id>`, public), so an
  accidental click never drops an entry.
- Entry is atomic, so a double click counts once.
- The count on the button refreshes at most every 10 seconds.
- When the giveaway ends, the button is disabled and the winners are listed.

**Ending.** A 15-second sweep ends whatever is due. There are no long timers, so a restart, or a
giveaway that came due while the bot was offline, still ends correctly. Ending works like this:

1. The giveaway is claimed atomically (`running` to `ending`). A claim left by a crash is taken over
   after a minute.
2. Winners are drawn with `crypto.randomInt`, skipping entrants who have left the server.
3. The card is edited.
4. A reply under the giveaway pings exactly the winners.

**Reroll** draws one new winner from entrants who have not won yet. Start, end, reroll and cancel each
log a `giveaway` entry with who did it ("timer" for automatic ends).

## Sticky panel (`sticky`)

| Component      | Custom id            | Behaviour                                                                |
| -------------- | -------------------- | ------------------------------------------------------------------------ |
| Channel select | `sticky:pick`        | Opens the add/edit modal for that channel (`sticky:setsubmit:<channel>`) |
| Manage select  | `sticky:manage`      | Opens the manage card for an existing sticky                             |
| Edit           | `sticky:edit:<id>`   | Same modal, prefilled                                                    |
| Pause / Resume | `sticky:pause:<id>`  | Stops re-posting without touching the message                            |
| Repost now     | `sticky:repost:<id>` | Swaps the message immediately                                            |
| Remove         | `sticky:remove:<id>` | Deletes the post; the record stays, inactive                             |

The modal holds title, message (1800 characters), "re-post after N messages" (1 to 100) and
"and at least N seconds" (10 to 3600). It re-posts only when **both** are reached. The swap is
delete old, send new, store the id, behind a per-channel lock. The sticky's own post and the
bot's housekeeping deletes never reach the log.

## Settings panel (`settings`)

| Component          | Custom id                                  | Writes                                               |
| ------------------ | ------------------------------------------ | ---------------------------------------------------- |
| Staff roles select | `settings:staffroles`                      | `staff.roleIds` (administrators are always staff)    |
| Emoji select       | `settings:emojipick` + `emojisubmit:<key>` | `emoji` override map, then re-resolves live          |
| Previous / Next    | `settings:emojiprev` / `emojinext`         | pages through the emoji registry (20 per page)       |
| Re-scan emoji      | `settings:emojirescan:<page>`              | re-resolves after uploading emoji, no restart needed |

## Where every setting is edited

| Setting (GuildSettings path)                            | Panel           |
| ------------------------------------------------------- | --------------- |
| `staff.roleIds`                                         | Settings        |
| `staff.hubChannelId`, `staff.hubMessageId`              | set by `/panel` |
| `emoji.*`                                               | Settings        |
| `logging.enabled`, `channelId`, `events`                | Logs            |
| `suggestions.*`                                         | Suggestions     |
| `tickets.*` (categories, questions, staff, transcripts) | Tickets         |
| `changelog.*`, templates                                | Changelog       |
| `announcements.*`                                       | Announcements   |
| `suggestions.pingRoleId`, `pingCooldownMin`             | Suggestions     |
| Role panels (own collection)                            | Role panels     |
| `giveaways.channelId`, `giveaways.pingRoleId`           | Giveaways       |
| `automod.*` (every signal, threshold and toggle)        | Automod         |
| Sticky messages (own collection)                        | Sticky          |
| `commandHash`                                           | internal        |

Only secrets and `GUILD_ID` live in `.env`. Colours, limits and starter copy live in
`src/config/constants.js` and the per-module `strings.js` files.

## Log events and colours

| Type                                                                                         | Colour             | Emitted by                             |
| -------------------------------------------------------------------------------------------- | ------------------ | -------------------------------------- |
| `messageDelete`, `messageEdit`                                                               | yellow             | `messageDelete.js`, `messageUpdate.js` |
| `memberJoin`                                                                                 | green              | `guildMemberAdd.js`                    |
| `memberLeave`                                                                                | grey               | `guildMemberRemove.js`                 |
| `memberTimeout`                                                                              | orange             | `guildMemberUpdate.js`                 |
| `roleChange`                                                                                 | blue               | `guildMemberUpdate.js`                 |
| `memberBan`                                                                                  | red                | `guildBanAdd.js`                       |
| `settingsChange`                                                                             | grey               | `settings.set()` via the logging hook  |
| `memberKick`, `automodAction`, `ticketEvent`, `suggestionEvent`, `announcement`, `changelog` | per `constants.js` | later phases                           |
| `giveaway` (start, end, reroll; cancel is grey)                                              | blue               | `giveaways/service.js`                 |

## Slash commands

`/panel` (admin only): deletes the previous hub, posts a new one, stores its message id.
`/ticket add|remove|close` (ticket staff, inside a ticket channel): add or remove a user, or close the ticket.
`/sticky set|clear` (staff, in the current channel): `set` opens the same modal as the Sticky panel.
`/case <type> <number>` (staff): read-only lookup of an infraction, suggestion, ticket or giveaway. The
type is required because the number sequences overlap.
