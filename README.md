# **MTG Planning App**

*Three tools for planning a Magic: The Gathering deck — what it costs you to build, what rotates out from under it, and how to sideboard against the field.*

Live at **[mtg-card-acquiring-tool.vercel.app](https://mtg-card-acquiring-tool.vercel.app)**.

> The deployment URL and the repository name still carry the project's original
> name. Renaming either would invalidate the Google OAuth redirect URI and break
> sign-in, so they are deliberately left alone; only the displayed name changed.

---

## Overview

Deckbuilding sites tell you what a deck contains. They are much less good at
telling you what it costs **you** — the person who already owns two of the four
copies and has a stack of wildcards sitting unspent.

Everything here answers a concrete question about a real deck, rather than being
another card database.

Every tool works without an account. Signing in with Google only adds somewhere
to save your work so it follows you to another device.

---

## The tools

### Pack Planner — `/planner`

Paste one or more decklists plus the collection you already own; it subtracts one
from the other and reports only what you still need.

- **Arena Mode** — wildcards you'd spend by rarity, and what's missing grouped by
  set so you can see which packs cover the most ground.
- **Paper Mode** — the shortfall priced and formatted for TCGPlayer's mass entry,
  with a card count to check your cart against.
- Pick the exact printing and art for any card; compare several decks at once.

### Standard Rotation — `/rotation`

Paste a Standard list to see which cards leave at the next rotation.

A card only counts as rotating if **every** Standard-legal printing it has is in
a set that's leaving. If it's also printed in a set that's sticking around —
including one that hasn't released yet — it stays.

### Sideboard Planner — `/sideboard`

Build a matchup-by-matchup sideboard guide, then print it on one page.

- Pulls the top 50 archetypes for your format from the live metagame; tick the
  ones you want.
- Card suggestions come from your own deck, with quantities capped at the copies
  you actually run.
- Optional separate plans for the play and the draw, per matchup.
- Prints to a single side of paper in three columns.

---

## Data sources

| Source | Used for |
| --- | --- |
| [Scryfall](https://scryfall.com) bulk data | Card names, printings, rarities, set membership, images, prices. Rebuilt daily by a scheduled workflow. |
| [MTGGoldfish](https://www.mtggoldfish.com) | Deck imports from pasted links, and the metagame archetype list. |

Prices are Scryfall's recorded market price for a specific printing, refreshed
daily — **estimates, not live quotes**.

---

## Tech

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript**
- **Tailwind CSS**
- **Auth.js v5** with Google, JWT sessions
- **Neon Postgres** via the `postgres` client
- Deployed on **Vercel**

### Layout

```
app/
  page.tsx              landing page describing each tool
  planner/              Pack Planner
  rotation/             Standard Rotation
  sideboard/            Sideboard Planner
  profile/              saved guides, collections, comparisons
  api/                  analyze, rotation, archetypes, import-deck,
                        guides, collections, analyses, account, auth
lib/
  db.ts                 Neon client
  db/schema.sql         schema, idempotent and re-runnable
  scryfall.ts           card lookup
  deckParser.ts         decklist parsing
  deckSections.ts       maindeck / sideboard split
  goldfishFetch.ts      hardened MTGGoldfish transport
scripts/
  build-cards.js        rebuilds the local card dataset
  migrate.ts            applies lib/db/schema.sql
```

---

## Running locally

```bash
npm install
npm run dev
```

The app runs without any configuration — every tool works signed out.

To enable sign-in and saving, create `.env.local`:

```
AUTH_SECRET=            # npx auth secret
AUTH_GOOGLE_ID=         # Google Cloud Console > Credentials
AUTH_GOOGLE_SECRET=
DATABASE_URL=           # Neon connection string
```

Add `http://localhost:3000/api/auth/callback/google` to the OAuth client's
authorized redirect URIs, then create the tables:

```bash
npm run db:migrate
```

Without those variables the app hides all sign-in UI and `/signin` and `/profile`
return 404, so a half-configured environment looks exactly like the site did
before accounts existed.

### Scripts

| Script | Does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run build:cards` | Rebuild the card dataset from Scryfall |
| `npm run db:migrate` | Apply `lib/db/schema.sql` |

---

## Contributing

Bug reports are welcome, especially card data that looks wrong — that's the
hardest kind to catch from the inside. See `/report` in the app, or open an
issue directly. The exact decklist you pasted is the single most useful thing to
include.

---

## Licence and affiliation

Not affiliated with, endorsed by, or sponsored by Wizards of the Coast. Magic:
The Gathering and all associated card names and imagery are property of Wizards
of the Coast LLC. Card images are served by Scryfall; the artwork in this repo is
original and unrelated to any Wizards property.
