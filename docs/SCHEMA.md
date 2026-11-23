# Schema

All Discord ids are strings. Every document has `createdAt` / `updatedAt`.

## `guildsettings` (model `GuildSettings`)

One document per guild, unique index on `guildId`. Cached in memory by `lib/settings.js`;
read with `settings.get(guildId)`, write only with `settings.set(guildId, path, value, actor)`.

| Path                                       | Type                                                                                                                                                              | Default  |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| `guildId`                                  | String, unique                                                                                                                                                    |          |
| `commandHash`                              | String                                                                                                                                                            | null     |
| `staff.roleIds`                            | [String]                                                                                                                                                          | []       |
| `staff.hubChannelId`, `staff.hubMessageId` | String                                                                                                                                                            | null     |
| `suggestions.*`                            | enabled, channelId, reviewChannelId, minLength (10), cooldownSec (60), ignoreStaff, pingRoleId, pingCooldownMin (10, 0 to 1440)                                   | disabled |
| `tickets.*`                                | panelChannelId, categoryId, staffRoleIds, transcriptChannelId, categories                                                                                         | empty    |
| `logging.enabled`                          | Boolean                                                                                                                                                           | false    |
| `logging.channelId`                        | String                                                                                                                                                            | null     |
| `logging.events`                           | Object, event type -> Boolean                                                                                                                                     | all true |
| `automod.*`                                | enabled (false), dryRun (true), timeoutHours (48, max 672), lookbackMinutes (10), honeypotChannelId, exemptRoleIds, quarantineRoleId, dmMember (true), thresholds |          |
| `changelog.*`                              | channelId, pingRoleId, defaultTemplateId                                                                                                                          | null     |
| `giveaways.*`                              | channelId, pingRoleId (defaults for new giveaways)                                                                                                                | null     |
| `announcements.*`                          | channelId, pingRoleId (defaults for new announcements)                                                                                                            | null     |
| `emoji`                                    | Map key -> emoji name override                                                                                                                                    | empty    |

## `counters` (model `Counter`)

`{ guildId, name, seq }`, unique index on `(guildId, name)`. `nextSeq(guildId, name)` uses
`findOneAndUpdate({ $inc })` so numbering never races.

## `suggestions` (model `Suggestion`)

Never deleted; `status` moves it through its lifecycle.

| Field                                        | Notes                                                                       |
| -------------------------------------------- | --------------------------------------------------------------------------- |
| `guildId`, `number`                          | unique together; `number` from `nextSeq(guildId, 'suggestion')`             |
| `authorId`, `authorName`, `authorAvatarUrl`  | snapshot at post time                                                       |
| `content`, `postedAtUnix`                    | original text and time (rendered as `<t:unix:R>`)                           |
| `channelId`, `messageId`, `threadId`         | the repost and its thread                                                   |
| `attachments[]`, `skippedAttachments`        | re-uploaded files (`name`, `contentType`, `isMedia`); count of failures     |
| `votes[]`                                    | `{ userId, value: 1 \| -1 }`, one per user, updated by one atomic pipeline  |
| `status`                                     | `pending`, `approved`, `denied`, `considered`, `implemented`, `duplicate`   |
| `statusReason`, `statusById`, `statusAtUnix` | who decided, when, and why                                                  |
| `pingRoleId`                                 | the role this suggestion pinged when posted (null when rate-limited or off) |

Indexes: `guildId`, `authorId`, `channelId`, `messageId`, `status`, unique `(guildId, number)`.

`suggestions.ignoreStaff` (Boolean, default false) was added to `GuildSettings`.

## `tickets` (model `Ticket`)

Never deleted. Closing removes the Discord channel; the document, answers and close reason stay.

| Field                                       | Notes                                                             |
| ------------------------------------------- | ----------------------------------------------------------------- |
| `guildId`, `number`                         | unique together; `number` from `nextSeq(guildId, 'ticket')`       |
| `openerId`, `openerName`                    | snapshot at open time                                             |
| `categoryKey`, `categoryLabel`              | the category's key in `tickets.categories` and its name then      |
| `channelId`, `controlMessageId`             | the private channel and its control card                          |
| `status`                                    | `open` or `closed`                                                |
| `claimedById`, `addedUserIds[]`             | claim holder; users added beyond the opener                       |
| `answers[]`                                 | `{ question, answer }` from the opening modal                     |
| `closedById`, `closeReason`, `closedAtUnix` | who, why, when                                                    |
| `transcriptSent`, `channelDeleted`          | close progress flags; a startup sweep finishes interrupted closes |

Indexes: `guildId`, `openerId`, `channelId`, `status`, unique `(guildId, number)`, and a unique
partial index on `(guildId, openerId, categoryKey)` where `status = open`, which is what enforces
one open ticket per member per category.

`tickets.categories` (in `GuildSettings`) is `[{ key, label, description, questions[] }]`;
`tickets.panelMessageId` was added.

## `changelogtemplates` (model `ChangelogTemplate`)

| Field          | Notes                                                                             |
| -------------- | --------------------------------------------------------------------------------- |
| `guildId`      | indexed                                                                           |
| `name`         | shown in pickers                                                                  |
| `headerFormat` | placeholders `{version}`, `{title}`, `{date}`                                     |
| `sections[]`   | `{ key, label, emojiKey }`; `emojiKey` is an emoji registry key, up to 8 sections |
| `footer`       | optional                                                                          |
| `accent`       | colour integer                                                                    |
| `pingRoleId`   | falls back to `changelog.pingRoleId`                                              |

The standard template is created on first use from `DEFAULT_CHANGELOG_TEMPLATE`.

## `changelogs` (model `Changelog`)

Never deleted. `template` is a snapshot, so editing a template does not rewrite drafts or history.

| Field                                       | Notes                                           |
| ------------------------------------------- | ----------------------------------------------- |
| `guildId`, `templateId`, `template`         | template id and the layout copied at creation   |
| `version`, `title`                          | header                                          |
| `sections`                                  | Mixed: section key -> markdown                  |
| `status`                                    | `draft`, `publishing`, `published`, `cancelled` |
| `ping`                                      | whether this draft pings its role               |
| `authorId`                                  | who started it                                  |
| `channelId`, `messageId`, `publishedAtUnix` | set on publish                                  |

`publishing` is an atomic lock against double clicks; one older than 60 seconds is treated as a
crashed publish and can be claimed again. Indexes: `guildId`, `status`, `authorId`, `messageId`.

## `announcements` (model `Announcement`)

Never deleted.

| Field                               | Notes                                           |
| ----------------------------------- | ----------------------------------------------- |
| `guildId`, `authorId`, `authorName` | author snapshot, named in the send log          |
| `title`, `body`, `imageUrl`         | content (`imageUrl` is https or null)           |
| `channelId`, `pingRoleId`           | chosen in the composer, defaulted from settings |
| `status`                            | `draft`, `sending`, `sent`, `cancelled`         |
| `messageId`, `sentAtUnix`           | set on send                                     |
| `editCount`, `lastEditedById`       | edits applied to the live message               |

`sending` is the same crash-safe lock as `publishing`. Indexes: `guildId`, `authorId`, `status`, `messageId`.

## `infractions` (model `Infraction`)

Never deleted. `number` comes from `nextSeq(guildId, 'infraction')`, for `/case`.

| Field                                          | Notes                                                   |
| ---------------------------------------------- | ------------------------------------------------------- |
| `guildId`, `number`                            | unique together                                         |
| `userId`, `userTag`, `avatarUrl`               | snapshot at the time                                    |
| `signal`, `detail`, `sample`                   | what fired, why, and a clipped sample of the text       |
| `channelIds[]`, `messageCount`, `deletedCount` | where it was posted and how many messages were removed  |
| `accountCreatedUnix`                           | account age evidence                                    |
| `timeoutUntilUnix`, `timeoutError`, `dmSent`   | outcome of each automatic step                          |
| `status`                                       | `active`, `released`, `quarantined`, `kicked`, `banned` |
| `decidedById`, `decidedAtUnix`                 | the staff decision                                      |
| `removedRoleIds[]`                             | roles quarantine removed, restored by Release           |
| `logChannelId`, `logMessageId`                 | the review card, rewritten after a decision             |

`automod.thresholds` stores `{ signals, crossChannel, rapidRepeat, massMention, riskyLink }`;
anything missing falls back to `AUTOMOD_DEFAULTS` in `config/constants.js`.

## `rolepanels` (model `RolePanel`)

One per self-assign role panel. Removing sets `active: false` and clears `messageId`. Nothing is deleted.

| Field                               | Notes                                                                    |
| ----------------------------------- | ------------------------------------------------------------------------ |
| `guildId`, `channelId`, `messageId` | `messageId` is null until published                                      |
| `title`, `description`              | panel text                                                               |
| `mode`                              | `many` or `one`                                                          |
| `layout`                            | `buttons` (up to 20 roles) or `select` (up to 25)                        |
| `roles[]`                           | `{ roleId, label, emoji, description }`; label null uses the role's name |
| `active`, `createdById`             |                                                                          |

Indexes: `guildId`, `messageId`, `active`.

## `giveaways` (model `Giveaway`)

Never deleted. `status` moves `draft` to `running` to `ending` to `ended`, or to `cancelled`.
`ending` is a short lock; one older than a minute is taken over by the next sweep.

| Field                                                          | Notes                                                                                   |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `guildId`, `number`                                            | `number` is set on start from `nextSeq(guildId, 'giveaway')`; unique per guild once set |
| `prize`, `description`, `winnerCount` (1 to 20), `durationSec` | from the modal                                                                          |
| `channelId`, `messageId`, `pingRoleId`, `hostId`               | `hostId` is whoever pressed Start                                                       |
| `startedAtUnix`, `endsAtUnix`, `endedAtUnix`                   | unix seconds                                                                            |
| `entrants[]`                                                   | user ids, written with `$addToSet` / `$pull`                                            |
| `winners[]`, `rerolls[]`                                       | `rerolls`: `{ userId, byId, atUnix }`                                                   |
| `endedById`, `cancelledById`                                   | `endedById` is null when the timer ended it                                             |

Indexes: `guildId`, `status`, `channelId`, `messageId`, `(status, endsAtUnix)`, unique
`(guildId, number)` where `number` is set.

## `stickymessages` (model `StickyMessage`)

One per channel, unique on `(guildId, channelId)`. Removing sets `active: false`; re-adding reuses the document.

| Field                           | Notes                                                           |
| ------------------------------- | --------------------------------------------------------------- |
| `title`, `body`                 | the message                                                     |
| `afterMessages`, `afterSeconds` | re-post when both are reached (1 to 100 messages, 10 to 3600 s) |
| `active`, `paused`              | removed / not re-posted                                         |
| `messageId`, `lastPostedAtUnix` | the current post and when it was made                           |
| `createdById`                   | who first set it                                                |

The engine caches active stickies in memory (message counters and timers are not persisted; after a
restart the next due message re-posts as normal).
