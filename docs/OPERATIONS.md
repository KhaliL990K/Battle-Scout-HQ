# Operations

**Develop against a private test guild, never BattleScout HQ.** `GUILD_ID` in `.env` decides
which server the bot serves; it ignores every other guild.

## First-time setup

1. **Developer Portal** > your application > Bot: enable **Server Members Intent** and
   **Message Content Intent**. (Guild Moderation needs no toggle.) Without them login fails
   with a "disallowed intents" message.
2. Copy `.env.example` to `.env` and fill `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`.
3. **MongoDB (Windows):** install MongoDB Community Server from mongodb.com/try/download/community,
   choose "Install as a Service", keep the default port 27017. Verify in PowerShell:
   `Get-Service MongoDB` shows `Running`.
4. `npm install`, then `npm run seed` (optionally `-- --log-channel <id> --staff-role <id>`).
5. `npm start`. Then run `/panel` in your staff channel.

## Invite link permissions

Manage Messages, Manage Channels, Manage Roles, Moderate Members, Ban Members, Kick Members,
Read Message History, Send Messages, Embed Links, Attach Files, Create Public Threads,
Manage Threads. Scopes: `bot applications.commands`.

## Emoji upload checklist

Until uploaded, the bot uses Unicode fallbacks and logs one warning listing what is missing.
Upload these as **application emoji** (Developer Portal > Emojis), exact names:

`bs_up bs_down bs_why bs_manage bs_bulb bs_ticket bs_shield bs_changelog bs_announce bs_logs
bs_sticky bs_back bs_refresh bs_open bs_settings bs_on bs_off bs_warn
bs_pending bs_approved bs_denied bs_considered bs_implemented bs_duplicate
bs_added bs_fixed bs_changed bs_removed bs_known bs_draft bs_roles bs_ping bs_giveaway bs_enter`

Restart the bot after uploading; resolution happens once on ready.

## Troubleshooting

| Symptom                         | Cause / fix                                                                                                                                                                              |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "Cannot reach MongoDB" at start | Service not running: `Start-Service MongoDB`                                                                                                                                             |
| "Invalid environment"           | `.env` missing or a value malformed; the message lists each one                                                                                                                          |
| "disallowed intents"            | Enable the two privileged intents (setup step 1)                                                                                                                                         |
| "Bot is not in GUILD_ID"        | Invite the bot to that server, then restart                                                                                                                                              |
| Suggestion not reposted         | Suggestions panel: enabled, channel set, permissions row green; staff messages are reposted unless "Ignore them" is on                                                                   |
| Ticket not created              | Tickets panel: Discord category set, permissions row green (Manage Channels and Manage Roles are needed to build private channels), panel posted                                         |
| Ticket channel left behind      | Closed tickets are finished on the next start (transcript, then delete); check the log for "interrupted ticket closes"                                                                   |
| Changelog Publish is greyed out | Fill at least one section and set the publish channel in the Changelog panel                                                                                                             |
| Ping did not notify anyone      | The role must be mentionable, or the bot needs Mention Everyone; the panel and builder warn when neither is true                                                                         |
| Edit link "not sent from here"  | Only announcements sent through the Announcements panel are tracked; older ones cannot be edited by the bot                                                                              |
| Automod does nothing            | Panel: Enabled, signals selected, and the member is not staff or in an exempt role; remember dry-run only logs                                                                           |
| No review card on a hit         | A log channel must be set in the Logs panel; the card is sent even when other log events are switched off                                                                                |
| Timeout not applied             | The case card says why: the bot needs Moderate Members and its top role must sit above the member's                                                                                      |
| Nobody can open panels          | Only administrators and the Settings panel's staff roles can; an admin sets the roles there                                                                                              |
| Emoji still show as Unicode     | Upload the names in the checklist as application emoji, then Settings > Re-scan emoji                                                                                                    |
| Sticky not re-posting           | Both thresholds must pass (messages and seconds); check the Sticky manage card's permissions row                                                                                         |
| Role panel role not given       | The member sees "cannot be given right now" and the log has a warning. Move the bot's role above it, and make sure it grants no moderation permissions; the manage card flags the reason |
| Suggestion did not ping         | A ping role must be set in the Suggestions panel and be mentionable; at most one ping per cooldown (Limits modal)                                                                        |
| Giveaway did not end            | The sweep runs every 15 seconds and at startup; check the log for "Ending a giveaway failed". A message deleted by hand does not stop it ending                                          |
| Giveaway winner not pinged      | The announcement is a reply under the giveaway; the bot needs Send Messages there. Winners who left the server are skipped                                                               |
| Slash command missing           | Check the startup log for "registered"; hash is stored in `guildsettings.commandHash` (set it to null to force re-registration)                                                          |
| Control says "out of date"      | The module/action no longer exists; re-open the hub                                                                                                                                      |
| Error reply with `ERR-XXXX`     | Search the logs for that id; the stack and context are attached                                                                                                                          |

## Deploy (pm2)

```
pm2 start ecosystem.config.cjs
pm2 save
```

Single instance only: the gateway connection must not be clustered. The config backs off between crash restarts, gives the bot 10 seconds to flush logs and close MongoDB on stop, and restarts it above 400 MB. Shutdown on SIGINT/SIGTERM
flushes the log queue, closes MongoDB, then destroys the client.

## Backup

`mongodump --db battlescout_hq --out <dir>`; restore with `mongorestore`.

## Manual test checklist: foundation and logging

- [ ] `npm start` logs: env ok, MongoDB connected, emoji fallback warning, commands registered
- [ ] Second start logs "Slash commands unchanged, skipped registration"
- [ ] `/panel` as admin posts the hub; as non-admin it is refused
- [ ] Each navigator option opens an ephemeral sub-panel; Back to hub works
- [ ] Logs panel: set channel, toggle enable, change event types; each write logs a grey entry
- [ ] Edit and delete a message: yellow entries; join: green; leave: grey
- [ ] Switch one event type off and repeat it: nothing logged
- [ ] Restart the bot, then click a control in an older panel: it still works
- [ ] Ctrl+C: queue flushed, MongoDB closed, exit code 0

## Manual test checklist: suggestions

- [ ] Suggestions panel: pick a channel; the permissions row shows all present; Enable
- [ ] Post a 3-character message: deleted, short-lived notice quotes your text, nothing in the log
- [ ] Post a valid suggestion: original deleted, card appears with your name, avatar and relative time, thread `#001 – ...` opens
- [ ] Post again inside the cooldown: refused with the seconds left
- [ ] Post with an image and a PDF: both shown on the card and still there after a vote
- [ ] Vote up, up again (removed), then down (switched); counts follow; a second account votes independently
- [ ] Why: modal, reason appears in the thread tagged with your vote
- [ ] Manage as a non-staff account: refused. As staff: pick Considered (applies at once), then Approved (asks a reason)
- [ ] Approved: card turns green with a status block, thread gets a note and is archived (not locked)
- [ ] Log channel shows green `Suggestion posted` and status entries; the repost deletion is not logged
- [ ] Restart the bot, vote on an old suggestion: still works
- [ ] Edit limits in the panel: out-of-range values are refused

## Manual test checklist: tickets

- [ ] Tickets panel: Edit categories > Load defaults, then edit one category's questions and details
- [ ] Pick a Discord category, a panel channel and a transcript channel; the permissions row is green
- [ ] Post the panel; the select lists the categories
- [ ] Choose one as a non-staff account: the modal shows its questions; submit creates a channel named like ticket-0001-name
- [ ] The channel is private (a third account cannot see it) and the control card shows the answers
- [ ] Choose the same category again: refused with a link to the open ticket; a different category works
- [ ] Claim as staff, Release, claim as a second staff member while held: refused
- [ ] Add user (select): the user sees the channel; the /ticket remove command removes them; the opener cannot be removed
- [ ] Close as the opener with a reason: HTML transcript lands in the transcript channel, opener gets a DM (or nothing if DMs are closed), channel deleted after about 10 seconds
- [ ] Open a ticket, restart the bot mid-close, restart again: the channel still ends up deleted
- [ ] Edit a category while the panel is posted: the posted panel updates itself
- [ ] Log channel shows a green Ticket opened entry and a blue Ticket closed entry

## Manual test checklist: changelog

- [ ] Changelog panel: set the publish channel (permissions line is green) and optionally a default ping role
- [ ] Templates > Edit: change the header format, footer and colour; Edit sections adds, renames and reorders sections
- [ ] Add a second template, Make default, delete it again; deleting the last template is refused
- [ ] Hub New changelog: with one template it opens the version modal, with two it shows the picker
- [ ] Fill two sections: the preview above the controls updates and matches the template colour
- [ ] Overfill sections until an edit is refused with a characters-over message
- [ ] Ping off then on; Publish: the post appears with the role ping line above the card
- [ ] Click Publish twice quickly: only one post
- [ ] Start a draft, close the builder, restart the bot, resume it from the panel
- [ ] Cancel a draft: it disappears from the panel
- [ ] Log channel shows a blue Changelog published entry naming you

## Manual test checklist: announcements

- [ ] Announcements panel: set a default channel and ping role
- [ ] Hub New announcement opens the modal; an http:// image link is refused, an https:// one previews
- [ ] Change the channel and ping role in the composer; the preview stays correct
- [ ] Send: posts once even on a double click, with the role ping and the image
- [ ] Panel > Edit a sent announcement > paste its link > Edit message: the live post changes
- [ ] Paste a link from another server, a non-bot message and junk: each is refused with a clear message
- [ ] Log channel shows blue Announcement sent and Announcement edited entries naming you

## Automod: going live safely

1. Create a text channel to be the honeypot, deny View Channel for @everyone and allow it for the
   roles you want to be exempt anyway, and pick it in the Automod panel. Anything posted there is
   treated as spam.
2. Optionally create a quarantine role with no permissions (and no access to channels) and pick
   it; the bot's top role must be above it.
3. Leave **dry-run on** and enable the module. Watch the log channel on real traffic: each "would
   act" entry shows the signal and a sample. Tune thresholds until there are no false positives.
4. Press **Go live**. Staff are never touched; an exempt role covers trusted bots or members.
5. The bot cannot time out the owner or anyone with a role above its own; the case card says so.

## Manual test checklist: automod

- [ ] Automod panel renders; Go live is labelled as the dangerous button; enabling logs a grey settings entry
- [ ] Dry-run: post the same message in three channels with a test account: a "would act" entry, nothing deleted
- [ ] Go live, repeat: all three messages disappear, the account is timed out, a red review card appears with evidence
- [ ] The test account receives the DM (or nothing if DMs are closed)
- [ ] A burst produces one case, not several
- [ ] Release lifts the timeout and the buttons disable; a second click shows "already decided"
- [ ] Quarantine without a role set explains itself; with one, roles are stripped and Release restores them
- [ ] Kick and Ban ask for confirmation; Ban also removes the last day of messages
- [ ] Two moderators clicking at the same moment: only one decision applies
- [ ] A staff or exempt-role account posting the same message is ignored
- [ ] Post in the honeypot channel with a test account: immediate case
- [ ] 10 pings in one message, and a new account posting an invite, each raise their signal
- [ ] Turn a signal off in the multi-select: it no longer fires
- [ ] A timeout above 672 hours in the Timeout modal is refused
- [ ] Case on a member above the bot's role: the card reports the failure instead of erroring

## Manual test checklist: sticky, settings and /case

- [ ] Settings panel: choose staff roles; a member with one can open the hub, one without cannot
- [ ] Settings > override an emoji with a name that exists as an application emoji: it changes in panels without a restart; a blank name resets it
- [ ] Sticky panel: pick a channel, fill the modal; the sticky posts immediately
- [ ] Chat in that channel: it does not move until both the message count and the seconds are reached, then it is replaced (never duplicated), even in a burst
- [ ] The log channel shows nothing for the sticky churn
- [ ] Pause leaves the message but stops re-posting; Resume restarts; Repost now swaps at once; Remove deletes the post
- [ ] `/sticky set` and `/sticky clear` do the same from the channel itself
- [ ] A seconds value under 10 is refused in the modal
- [ ] Restart the bot: stickies keep working
- [ ] `/case infraction 1`, `/case ticket 1`, `/case suggestion 1` show the record; a missing number says so; a non-staff user is refused

## Manual test checklist: role panels and suggestion pings

- [ ] `/panel`: the hub shows two status blocks (Community, Staff tools) and the select lists all ten panels
- [ ] Role panels > New: title "Ping roles". Pick a channel and add a "Suggestion alerts" role, then Publish
- [ ] Add a role above the bot, or one with Ban Members: it is refused with the reason
- [ ] As a member, click the button: the role is added and the reply is only visible to you. Click again: removed
- [ ] Switch to "one": taking one role removes the panel's other roles, and roles outside the panel are untouched
- [ ] Switch to the select layout and Update: the select sets exactly the chosen roles
- [ ] Delete the panel message by hand, then Update: it is re-posted
- [ ] Remove > Confirm remove: the message is gone and clicking an old copy says the panel is no longer active
- [ ] Suggestions panel: set the ping role. Post a suggestion: the role is pinged and the card shows 🔔 @role
- [ ] Post another within the cooldown: no ping. Vote on the first: the 🔔 line stays
- [ ] Limits modal: set ping minutes to 0, and every suggestion pings

## Manual test checklist: giveaways

- [ ] Giveaways panel: set a default channel. Then New giveaway: prize "Test", 2 winners, duration `2m`
- [ ] A duration of `10s` or `61d`, or 0 winners, is refused with the reason
- [ ] The composer preview matches. Pick a ping role, then Start: it posts, pings the role and shows "Ends in 2 minutes"
- [ ] Enter from two accounts: each gets a private "You are entered" and the button count updates within ~10 seconds
- [ ] Click Enter again: a Leave button is offered; Leave removes the entry
- [ ] Restart the bot before the end: it still ends on time
- [ ] At the end the button is disabled, the winners are listed and a reply pings exactly the winners
- [ ] Reroll one winner: a new winner who had not won is announced; with nobody left it says so
- [ ] Start another one and press End now: it ends immediately. Start a third and Cancel, then Confirm cancel: no draw
- [ ] `/case giveaway 1` shows the record; the log channel shows start, end, reroll and cancel entries
