# **MTG Planning App**

*Four tools for planning a Magic: The Gathering deck — what it costs you to build, what you already own, what rotates out from under it, and how to sideboard against the field.*

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
to save your work so it follows you to another device. There is no separate
sign-up: the first Google sign-in creates the account. Auth is optional by
design — nothing may ever gate a tool behind it.

---

## The tools

### Pack Planner — `/planner`

Paste one or more decklists (or MTGGoldfish deck/archetype links) plus the
collection you already own; it subtracts one from the other and reports only
what you still need.

- **Arena Mode** — wildcards you'd spend by rarity, and what's missing grouped by
  set so you can see which packs cover the most ground.
- **Paper Mode** — the shortfall priced and formatted for TCGPlayer's mass entry,
  with a card count to check your cart against.
- Pick the exact printing and art for any card; compare several decks at once.
- The collection box merges copies of the same card into one line, on paste and
  when you leave the box, and links to the Collection page to edit it with
  pictures.
- Signed in: save the collection (as Arena or Paper) or the whole comparison to
  your profile, then reopen it, update it in place, save it as new, or
  duplicate it.
- **Start Over** clears the decklists, the collection, printing picks and the
  last breakdown, but keeps Arena/Paper mode. If there is work to lose it asks first, and where
  sign-in is configured it offers to save before clearing.

### Collection — `/collection`

Build the collection the Pack Planner compares against, with a picture of every
card.

- Add cards by name with suggestions as you type, or paste a list or an Arena
  export.
- A tile per card with +/− counts, plus filter, sort and pagination.
- Copies across printings always merge into one line — whether pasted, saved,
  loaded or compared (`lib/collectionText.ts`).
- Shares one collection and one Arena/Paper mode with the Pack Planner through
  localStorage, including which saved collection is open (`lib/openCollection.ts`).
- Signed in: save to your profile as Arena or Paper; a saved collection's
  **Edit** button on the profile opens it here.

### Standard Rotation — `/rotation`

Paste a Standard list, or an MTGGoldfish link, to see which cards leave at the
next rotation.

A card only counts as rotating if **every** Standard-legal printing it has is in
a set that's leaving. If it's also printed in a set that's sticking around —
including one that hasn't released yet — it stays.

### Sideboard Planner — `/sideboard`

Build a matchup-by-matchup sideboard guide, then print it on one page.

- Paste a decklist or an MTGGoldfish deck/archetype link; it splits into
  maindeck and sideboard.
- Standard, Pioneer, Modern, Legacy and Pauper.
- Pulls up to the top 50 archetypes from the live MTGGoldfish metagame, over the
  last 7, 14, 30, 90 or 365 days; tick the ones you face, or add your own.
- Out/In suggestions come from your own deck, with quantities capped at the
  copies you actually run (0 removes a card).
- Optional separate plans for the play and the draw, and notes, per matchup.
- A plan that boards you below 60 blocks export and saving until it's fixed; one
  that grows the deck gets a warning.
- Beside each matchup, the opponent's decklist from MTGGoldfish with card
  pictures, matched automatically to the closest archetype and marked "best
  guess" (`lib/archetypeMatch.ts`). Change it from a picker or by pasting a link.
- **Export PDF** prints the whole guide on one page in three columns, from a
  phone as well as a desktop. The text sizes itself to fill the page and the
  matchups are dealt into the columns by measurement (`lib/printFit.ts`) rather
  than by CSS multi-column layout, which phone print engines get wrong. 30
  matchups still fit, and the planner warns when a guide would run onto a
  second page. The print page has
  a zero margin, which leaves most browsers nowhere to draw their own URL/date
  header and footer; where one still appears, the planner's help tip says to
  untick "Headers and footers" in the print dialog.
- **Start Over** clears the deck and matchups but keeps the format and the
  archetypes you pulled. It asks first if there is work to lose, and where
  sign-in is configured it offers to save before clearing.
- Signed in: save to your profile, rename the open guide in place, duplicate it.

### Profile — `/profile`

Only exists when auth is configured. Lists saved sideboard guides, collections
(grouped Arena / Paper) and comparisons, each of which can be opened, edited,
duplicated or deleted; and deletes the whole account on request.

---

## Data sources

| Source | Used for |
| --- | --- |
| [Scryfall](https://scryfall.com) bulk data | Card names, printings, rarities, set membership, images, prices. Rebuilt daily by a scheduled workflow. Card images are hotlinked from Scryfall's CDN. |
| [MTGGoldfish](https://www.mtggoldfish.com) | Deck imports from pasted links, the metagame archetype list, and the opponent lists beside each matchup. Fetched server-side, mtggoldfish.com only (`lib/goldfishFetch.ts`). |

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
  collection/           Collection
  rotation/             Standard Rotation
  sideboard/            Sideboard Planner
  profile/              saved guides, collections, comparisons (auth only)
  signin/               Google sign-in (auth only)
  about/ privacy/ report/
  components/           shared client components
  api/
    analyze/            Pack Planner comparison
    rotation/           rotation check
    import-deck/        MTGGoldfish deck or archetype link -> decklist
    archetypes/         live metagame: { format, limit, period } -> name, share, url
    card-search/        card-name suggestions for the Collection page
    card-images/        card pictures by name, from the bundled data
    guides/ collections/ analyses/
                        saved items: list, create, get, update, delete, [id]/copy
    account/            delete account
    auth/               Auth.js
lib/
  db.ts                 Neon client
  db/schema.sql         schema, idempotent and re-runnable
  scryfall.ts           card lookup
  deckParser.ts         decklist parsing
  deckSections.ts       maindeck / sideboard split
  collectionText.ts     merges copies of a card across printings into one line
  openCollection.ts     the collection shared by Pack Planner and Collection page
  formats.ts            supported formats, metagame periods, archetype limits
  archetypeMatch.ts     matches a matchup name to its closest archetype
  printFit.ts           sizes the printed sideboard sheet to fill one page
  goldfishFetch.ts      hardened MTGGoldfish transport
scripts/
  build-cards.js        rebuilds the local card dataset
  migrate.ts            applies lib/db/schema.sql
.github/workflows/
  update-cards.yml      daily card data rebuild
  cleanup-neon-branch.yml
                        deletes a PR's Neon preview branch when it closes
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
DEV_ORIGIN=             # optional: your LAN IP, to open the dev server from a phone
```

`.env.example` lists the same variables with the reasoning for each.

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
