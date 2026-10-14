# **MTG Planning App**

*Tools for planning a Magic: The Gathering deck — keep your decklists, see what they cost you to build and what you already own, what rotates out from under them, and how to sideboard against the field.*

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

Three of the tools are about your decks and your cards, and each has one
job: **Decks** holds your decklists, **Collection** holds your cards, and
**Deck Check** is the only place that compares the two.

### Opening, switching and leaving — Decks, Collection, Sideboard Planner

The three pages that edit something you can save work the same way
(`app/components/EntryChooser.tsx`, `app/components/LeaveGuard.tsx`):

- **On the way in**, the page asks what you want to work on: one of your saved
  decks / collections / guides (signed in), **Start new**, or carrying on with
  what's already here. A deep link (`?deck=`, `?guide=`, `?collection=`, or a
  deck handed over from the Decks page) skips the question and opens that
  item. Signed out it never blocks anything — Start new is always there.
- **Open another...** beside the name switches without going to the profile.
- **Leaving with unsaved work** — any in-app link, or opening/starting
  something else — asks first: *Save and leave* (signed in; leaves only if the
  save succeeds), *Leave without saving*, or *Stay*. Reload and tab close get
  the browser's own prompt. "Unsaved" means different from the last saved or
  opened version, or a non-empty draft that was never saved; an empty page or
  an untouched saved item never asks.
- **Decks and the Sideboard Planner clear their draft when you leave** through
  the site, so the next visit starts at the chooser. **The Collection page
  never clears**: it's Deck Check's default collection and, signed out, the
  only copy; leaving just asks whether to save first (and only when there's a
  Save to offer).
- **Back/Forward aren't intercepted** — the App Router gives no reliable way
  to, and a sentinel history entry fights Next's own history handling (see
  `LeaveGuard.tsx`). Nothing is lost: a draft left that way (or by a reload or
  a closed tab) stays in the browser and the chooser offers to pick up where
  you left off.

### Decks — `/decks`

Keep and edit your own decklists.

- A new deck asks how to begin: **Build it card by card** (an empty list
  editor) or **Paste a list or link**. A paste (Arena, MTGGoldfish or any
  "4 Card Name" list) turns straight into the list editor; a pasted
  MTGGoldfish link is imported at once (a typed one on Enter or Import).
  Typed text waits for **Show as cards** — it never converts on a timer.
- The list editor (`app/components/DeckListEditor.tsx`) shows Maindeck and
  Sideboard side by side (stacked below `lg`), one row per card: count with
  − / + (the box alone on a phone), **→ SB** / **→ Main**, remove, and an add
  box per half with suggestions from every card (`CardNameAdd`, shared with
  the Collection page). The picture sits beside the list from `md`; on a
  phone a tapped name shows it in a corner card.
- The deck stays **text** throughout: every edit is written back as the
  normalised list (`lib/deckEdit.ts`), so the draft, the "unsaved" check,
  Save and the hand-offs read exactly what they did before. **Edit as text**
  opens the same text in a box; going back re-parses it.
- Names go through `/api/card-resolve`. On a paste or import, names it
  recognises are put under their official spelling; unknown ones are marked
  on their row with suggestions, and Save waits until they're fixed or
  removed (sending to the other tools doesn't). Opening a saved deck only
  marks — it never rewrites a stored spelling, so an untouched deck never
  reads as unsaved.
- Pick a format (the Sideboard Planner's five, plus Historic, Explorer,
  Timeless, Alchemy, Brawl, Commander) or none.
- **Check in Deck Check** → `/deck-check`, which runs the comparison against
  your collection straight away. **Build a sideboard guide** → `/sideboard`,
  which loads it as the decklist and sets the format; if a guide is already
  there it asks first (keep the matchups, start fresh, or save then start
  fresh).
- A saved, unchanged deck travels as `?deck=<id>`; anything else (signed out,
  or unsaved edits) is handed over in `sessionStorage`, never in the URL
  (`lib/deckHandoff.ts`).
- Every action but saving works signed out. Signed in: open a saved deck from
  the chooser or **Open another...**, save, save as new, rename, duplicate
  and delete (confirmed in the page). Sending a deck to another tool counts as
  leaving, so unsaved work is asked about first. Decks are stored normalised —
  a `Deck` and a `Sideboard` section, one line per card (`lib/deckText.ts`).
- The draft (`mtgpp:decks-draft`) is cleared when you leave the page.

### Collection — `/collection`

Your cards, with a picture of every one. Only the collection — comparing decks
against it is Deck Check's job.

- Add cards by name with suggestions as you type, or paste a list or an Arena
  export. Every name is checked against the card data first; lines that aren't
  cards are listed with "did you mean" suggestions, and cards from an older
  collection that aren't recognised can be removed in one click.
- A tile per card with +/− counts, plus filter, sort and pagination.
- Copies across printings always merge into one line — whether pasted, saved,
  loaded or compared (`lib/collectionText.ts`).
- Kept in localStorage (`mtgpp:collection`, its Arena/Paper type in
  `mtgpp:collection-mode`, and which saved collection it came from — plus a
  fingerprint of its saved version, for the unsaved-changes check — in
  `mtgpp:collection-open`; `lib/openCollection.ts`). Deck Check reads it as
  its default collection and never writes it. Leaving the page never clears
  it.
- Signed in: save to your profile as Arena or Paper; open a saved collection
  from the chooser or **Open another...**, or with **Edit** on the profile.
- **Check decks against it** → `/deck-check?source=collection`, which makes
  Deck Check use this collection even if the tab had chosen another.
- Old `/collection?deck=<id>` links (the "Compare with a deck" panel this page
  used to have) are redirected to `/deck-check?deck=<id>` in `next.config.js`.

### Deck Check — `/deck-check`

Decks against a collection: what each deck is missing, and what it costs to
get. Formerly the Pack Planner at `/planner`, which now permanently redirects
here with its query string (`next.config.js`).

- **Decks box** — a list of deck slots (`lib/deckSlots.ts`), each labelled
  *Saved deck* or *Pasted*:
  - **Add existing deck** (signed in) picks from your saved decks; the slot
    shows the deck's name and format and links to it on the Decks page.
  - **+ New deck** adds a slot to paste a list or an MTGGoldfish deck/archetype
    link into (Analyze imports the link).
  - A pasted slot has **Save to Decks** (name + format, always a new deck; a
    name you already use is a 409, shown as such). After saving, the slot is
    linked to that deck.
  - A saved deck edited in its slot is marked *Edited* and offers **Save
    changes to deck** (PUT, only on that click) or **Save as new deck**.
  - Signed out, one sign-in prompt covers adding and saving; without auth
    configured none of it renders.
- **Collection box** — always says what's being checked against, its card
  count and the mode (`lib/deckCheckCollection.ts`):
  - **Use my Collection page collection** — the default, read from
    `mtgpp:collection`.
  - **Load collection** (signed in) — a saved collection, grouped Arena /
    Paper; Deck Check switches to its mode.
  - **New (paste)** — paste one, with **Save to Collection** (name + Arena or
    Paper, always a new collection, 409 on a clash).
  - Loading or pasting here doesn't change the Collection page's collection.
    The choice is kept in `sessionStorage` (`mtgpp:deck-check-collection`) so
    it survives a reload in that tab. Switching away from an unsaved pasted
    collection asks first.
- **Results**:
  - **What each deck is missing** — per deck, the cards you don't own with
    pictures, need / own / short counts, a copyable missing list and the full
    card table. Maindeck and sideboard count together; basic lands are not
    counted. Names are resolved through `/api/card-resolve` so spellings match
    the collection (`lib/deckShortfall.ts`, `app/components/DeckShortfall.tsx`).
  - **Arena Mode** — wildcards you'd spend by rarity, and what's missing grouped
    by set so you can see which packs cover the most ground.
  - **Paper Mode** — the shortfall priced and formatted for TCGPlayer's mass
    entry, with a card count to check your cart against.
  - Pick the exact printing and art for any card in the combined breakdown.
- **Saved comparisons** (signed in) — the decks' text, the collection and the
  mode together. Opening one (from Deck Check or `?analysis=` from the
  profile) puts back its decks as pasted slots, its collection if it has one —
  otherwise the one in use is kept — and its mode, then **runs the analysis
  automatically**, with a summary banner saying what was opened and which
  collection is being compared against.
- `?deck=<id>` and the Decks page's hand-off add the deck alongside the slots
  already there (first empty slot, else a new one) and run once; a saved deck
  that's already in a slot isn't added twice — that slot is updated and the
  banner says so. `?collection=<id>` loads a saved collection.
- The slots are kept in `sessionStorage` (`mtgpp:deck-check-slots`,
  `lib/deckSlots.ts`) so they survive a reload and signing in.
- **Start Over** clears the slots, any pasted collection and the results, and
  goes back to the Collection page collection. If there is work to lose it asks
  first, and where sign-in is configured it offers to save before clearing.

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
- Signed in: open a saved guide from the chooser or **Open another...**, save
  to your profile, rename the open guide in place, duplicate it.
- The plan (`mtgpp:sideboard`) is cleared down to its format and pulled
  metagame when you leave the page; `mtgpp:sideboard-baseline` fingerprints
  the open guide's saved version for the unsaved-changes check.
- Accepts a deck from the Decks page (`?deck=<id>` or a hand-off): loads it as
  the decklist, splits it and sets the format if supported. With a guide
  already in progress it asks first rather than replacing anything.

### Standard Rotation — `/rotation`

Paste a Standard list, or an MTGGoldfish link, to see which cards leave at the
next rotation.

A card only counts as rotating if **every** Standard-legal printing it has is in
a set that's leaving. If it's also printed in a set that's sticking around —
including one that hasn't released yet — it stays.

### Profile — `/profile`

Only exists when auth is configured. Lists saved decks (Open, Check in Deck
Check, Sideboard guide, Duplicate, Delete), sideboard guides, collections
(grouped Arena / Paper; Edit, Use in Deck Check) and comparisons (Open in Deck
Check), each of which can also be duplicated or deleted; and deletes the whole
account on request.

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
  decks/                Decks
  collection/           Collection
  deck-check/           Deck Check (was /planner; redirected in next.config.js)
  sideboard/            Sideboard Planner
  rotation/             Standard Rotation
  profile/              saved decks, guides, collections, comparisons (auth only)
  signin/               Google sign-in (auth only)
  about/ privacy/ report/
  components/           shared client components
  api/
    analyze/            Deck Check's combined comparison
    rotation/           rotation check
    import-deck/        MTGGoldfish deck or archetype link -> decklist
    archetypes/         live metagame: { format, limit, period } -> name, share, url
    card-search/        card-name suggestions (Collection, Decks)
    card-resolve/       official spelling for card names (Collection, Decks, Deck Check)
    card-images/        card pictures by name, from the bundled data
    decks/ guides/ collections/ analyses/
                        saved items: list, create, get, update, delete, [id]/copy
    account/            delete account
    auth/               Auth.js
lib/
  db.ts                 Neon client
  db/schema.sql         schema, idempotent and re-runnable: users,
                        sideboard_guides, collections, saved_analyses, decks
  scryfall.ts           card lookup
  deckParser.ts         decklist parsing
  deckSections.ts       maindeck / sideboard split
  deckText.ts           saved-deck normal form, formats, validation
  deckEdit.ts           card-by-card edits for the Decks page's list editor
  decks.ts              saved-deck queries (decks table)
  deckHandoff.ts        passing an unsaved deck between pages via sessionStorage
  deckSlots.ts          Deck Check's deck slots: saved or pasted, edited or not
  deckShortfall.ts      one deck's missing cards against a collection
  deckCheckCollection.ts
                        which collection Deck Check is using, kept per tab
  collectionText.ts     merges copies of a card across printings into one line
  openCollection.ts     the Collection page's collection keys, which Deck Check reads
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
