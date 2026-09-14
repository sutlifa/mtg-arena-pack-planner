-- MTG Card Acquiring Tool schema. Idempotent: every statement is guarded so
-- `npm run db:migrate` can be re-run against an existing database.

CREATE TABLE IF NOT EXISTS users (
  id          SERIAL PRIMARY KEY,
  google_id   TEXT NOT NULL UNIQUE,
  email       TEXT NOT NULL UNIQUE,
  name        TEXT,
  image       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- A saved sideboard guide: the decklist it was built against, the format,
-- and the matchup plans.
--
-- `plan` holds the same shape the Sideboard Planner already keeps in
-- localStorage (decklist, loadedText, format, count, matchups, stash) rather
-- than being normalised into matchup/card tables. That is deliberate: the
-- plan is only ever read and written whole, by one owner, and is never
-- queried across users or aggregated. Normalising it would add a dozen joins
-- to buy query shapes nothing asks for, and would couple the schema to a UI
-- structure that is still moving. If a future feature needs to query inside a
-- plan -- "which cards do people board out most?" -- that is the point to
-- normalise, with real usage to design against.
CREATE TABLE IF NOT EXISTS sideboard_guides (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  format      TEXT NOT NULL,
  plan        JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Saving under a name the user already used overwrites that guide rather
  -- than silently creating a second one with the same label.
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS sideboard_guides_user_idx
  ON sideboard_guides (user_id, updated_at DESC);

-- A saved collection: the raw pasted text, kept verbatim.
--
-- Stored as text rather than parsed rows because the parse is lossy and the
-- parser keeps improving -- re-parsing the original on read means a saved
-- collection gets better as the card data and alias handling do, instead of
-- being frozen at whatever the parser understood on the day it was saved.
CREATE TABLE IF NOT EXISTS collections (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  raw_text     TEXT NOT NULL,
  arena_mode   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS collections_user_idx
  ON collections (user_id, updated_at DESC);

-- A saved Pack Planner comparison: the decklists and collection that went in,
-- plus the mode they were run under.
--
-- Only the inputs are stored, never the computed breakdown. Prices, Arena
-- availability and set legality all move underneath us, so a stored result
-- would start drifting from the truth the moment it was written -- and a
-- stale price presented as a saved answer is worse than no saved answer.
-- Re-running the comparison on open is cheap and always current.
CREATE TABLE IF NOT EXISTS saved_analyses (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  decklists     JSONB NOT NULL,
  collection    TEXT NOT NULL DEFAULT '',
  arena_mode    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS saved_analyses_user_idx
  ON saved_analyses (user_id, updated_at DESC);
