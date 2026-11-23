# BattleScout HQ Management Bot

Private, single-guild staff bot for the BattleScout HQ Discord server. Panel-driven: staff work
through a persistent hub of select menus and buttons, built on Discord Components V2.

**Status:** all build phases are built: the original seven plus Phase 8 (self-assign role panels, suggestion pings and giveaways). See `CLAUDE.md` for the roadmap.

## Requirements

- Node 20+
- MongoDB (local service on `127.0.0.1:27017`)
- A Discord application with the **Server Members** and **Message Content** privileged intents

## Setup

```
npm install
cp .env.example .env     # fill DISCORD_TOKEN, CLIENT_ID, GUILD_ID
npm run seed
npm start
```

Then run `/panel` in your staff channel. Full steps, the invite permission list, the emoji
upload checklist and troubleshooting are in `docs/OPERATIONS.md`.

## Scripts

`npm start` · `npm run dev` (watch) · `npm run seed` · `npm run lint` · `npm run format`

## Docs

`docs/PANELS.md` panel tree and custom ids · `docs/SCHEMA.md` collections ·
`docs/OPERATIONS.md` deploy and 3am troubleshooting
