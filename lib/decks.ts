import { sql } from "./db";
import { copyName } from "./copyName";

/**
 * Saved decks, for the Decks page and everything it hands a deck to.
 *
 * Same rule as lib/guides and lib/saved: every function takes the owner's
 * userId and puts it in the WHERE clause, and that id only ever comes from
 * the server-side session. It is the only thing standing between two
 * accounts' decks, so it is never optional.
 *
 * `decklist` arrives here already normalised by lib/deckText (readDeckInput),
 * which is what the counts in listDecks rely on.
 */

export interface DeckSummary {
    id: number;
    name: string;
    format: string | null;
    main: number;
    side: number;
    updated_at: string;
}

export interface DeckRow {
    id: number;
    name: string;
    format: string | null;
    decklist: string;
    updated_at: string;
}

export async function listDecks(userId: number): Promise<DeckSummary[]> {
    // The card counts are summed in SQL so the profile and the Decks page can
    // show "60 + 15" without downloading every list. They lean on the
    // normalised form: a "\n\nSideboard\n" divider and "qty name" lines,
    // with quantities capped at three digits on the way in (lib/deckText),
    // so the sum can't overflow. ::int because postgres.js returns a SUM
    // (bigint) as a string.
    //
    // `[0-9]`, not `\d`: inside a tagged template a lone backslash before an
    // ordinary letter is dropped, so `\d` would reach Postgres as a plain "d".
    // The 'n' flag makes ^ match at the start of every line.
    return sql<DeckSummary[]>`
        SELECT id,
               name,
               format,
               (SELECT COALESCE(SUM(r.m[1]::int), 0)
                  FROM regexp_matches(split_part(decklist, E'\n\nSideboard\n', 1),
                                      '^([0-9]{1,4}) ', 'gn') AS r(m))::int AS main,
               (SELECT COALESCE(SUM(r.m[1]::int), 0)
                  FROM regexp_matches(split_part(decklist, E'\n\nSideboard\n', 2),
                                      '^([0-9]{1,4}) ', 'gn') AS r(m))::int AS side,
               updated_at
        FROM decks
        WHERE user_id = ${userId}
        ORDER BY updated_at DESC
        LIMIT 200
    `;
}

export async function getDeck(userId: number, id: number): Promise<DeckRow | null> {
    const rows = await sql<DeckRow[]>`
        SELECT id, name, format, decklist, updated_at
        FROM decks
        WHERE id = ${id} AND user_id = ${userId}
    `;
    return rows[0] ?? null;
}

/**
 * Saving under a name that already exists updates that deck in place —
 * unless `createOnly`, which is "Save as new": that promises a second deck
 * and must never land on an existing one, so it inserts plainly and lets a
 * name clash raise 23505 for the route to report as a 409.
 */
export async function saveDeck(args: {
    userId: number;
    name: string;
    format: string | null;
    decklist: string;
    createOnly?: boolean;
}): Promise<number> {
    if (args.createOnly) {
        const created = await sql<{ id: number }[]>`
            INSERT INTO decks (user_id, name, format, decklist)
            VALUES (${args.userId}, ${args.name}, ${args.format}, ${args.decklist})
            RETURNING id
        `;
        return created[0].id;
    }
    const rows = await sql<{ id: number }[]>`
        INSERT INTO decks (user_id, name, format, decklist)
        VALUES (${args.userId}, ${args.name}, ${args.format}, ${args.decklist})
        ON CONFLICT (user_id, name) DO UPDATE SET
          format = EXCLUDED.format,
          decklist = EXCLUDED.decklist,
          updated_at = now()
        RETURNING id
    `;
    return rows[0].id;
}

/**
 * Overwrite the deck the Decks page has open, by id. See updateGuide for why
 * Save can't go through the name upsert once something is open: a rename
 * would leave the original behind and write a second deck.
 *
 * A null `name` keeps the row's name. A non-null one can collide with the
 * (user_id, name) index and raise 23505, which the route reports as a 409.
 */
export async function updateDeck(args: {
    userId: number;
    id: number;
    name: string | null;
    format: string | null;
    decklist: string;
}): Promise<{ id: number; name: string } | null> {
    const rows = await sql<{ id: number; name: string }[]>`
        UPDATE decks SET
          name = COALESCE(${args.name}, name),
          format = ${args.format},
          decklist = ${args.decklist},
          updated_at = now()
        WHERE id = ${args.id} AND user_id = ${args.userId}
        RETURNING id, name
    `;
    return rows[0] ?? null;
}

/**
 * Rename without touching the list — so fixing a typo in a deck's name never
 * also commits half-finished edits sitting in the editor. See renameGuide.
 */
export async function renameDeck(
    userId: number,
    id: number,
    name: string
): Promise<{ id: number; name: string } | null> {
    const rows = await sql<{ id: number; name: string }[]>`
        UPDATE decks SET name = ${name}, updated_at = now()
        WHERE id = ${id} AND user_id = ${userId}
        RETURNING id, name
    `;
    return rows[0] ?? null;
}

/** Duplicate a deck inside the database. See copyGuide for why. */
export async function copyDeck(
    userId: number,
    id: number
): Promise<{ id: number; name: string } | null> {
    const source = await sql<{ name: string; format: string | null; decklist: string }[]>`
        SELECT name, format, decklist
        FROM decks
        WHERE id = ${id} AND user_id = ${userId}
    `;
    if (!source[0]) return null;

    const taken = await sql<{ name: string }[]>`
        SELECT name FROM decks WHERE user_id = ${userId}
    `;

    const rows = await sql<{ id: number; name: string }[]>`
        INSERT INTO decks (user_id, name, format, decklist)
        VALUES (
          ${userId},
          ${copyName(source[0].name, taken.map((r) => r.name))},
          ${source[0].format},
          ${source[0].decklist}
        )
        RETURNING id, name
    `;
    return rows[0];
}

export async function deleteDeck(userId: number, id: number): Promise<boolean> {
    const rows = await sql<{ id: number }[]>`
        DELETE FROM decks WHERE id = ${id} AND user_id = ${userId} RETURNING id
    `;
    return rows.length > 0;
}
