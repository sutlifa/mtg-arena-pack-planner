import { sql } from "./db";
import { copyName } from "./copyName";

/**
 * Saved collections and saved comparisons, for the Pack Planner.
 *
 * Same rules as lib/guides: the owner's userId is always in the WHERE clause
 * and always comes from the server-side session, never from a request body.
 */

export interface CollectionSummary {
    id: number;
    name: string;
    arena_mode: boolean;
    cards: number;
    updated_at: string;
}

export interface AnalysisSummary {
    id: number;
    name: string;
    arena_mode: boolean;
    decks: number;
    updated_at: string;
}

/* ---------------------------- collections ---------------------------- */

export async function listCollections(userId: number): Promise<CollectionSummary[]> {
    return sql<CollectionSummary[]>`
        SELECT id,
               name,
               arena_mode,
               -- A rough line count, computed in SQL so the profile page
               -- doesn't download every collection just to show a size.
               array_length(string_to_array(trim(raw_text), E'\n'), 1) AS cards,
               updated_at
        FROM collections
        WHERE user_id = ${userId}
        ORDER BY updated_at DESC
        LIMIT 200
    `;
}

export async function getCollection(userId: number, id: number) {
    const rows = await sql<{ id: number; name: string; raw_text: string; arena_mode: boolean }[]>`
        SELECT id, name, raw_text, arena_mode
        FROM collections
        WHERE id = ${id} AND user_id = ${userId}
    `;
    return rows[0] ?? null;
}

export async function saveCollection(args: {
    userId: number;
    name: string;
    rawText: string;
    arenaMode: boolean;
}): Promise<number> {
    const rows = await sql<{ id: number }[]>`
        INSERT INTO collections (user_id, name, raw_text, arena_mode)
        VALUES (${args.userId}, ${args.name}, ${args.rawText}, ${args.arenaMode})
        -- Matches the (user_id, name, arena_mode) unique index: re-saving the
        -- same name in the same mode updates it, while the same name in the
        -- other mode is a separate collection.
        ON CONFLICT (user_id, name, arena_mode) DO UPDATE SET
          raw_text = EXCLUDED.raw_text,
          updated_at = now()
        RETURNING id
    `;
    return rows[0].id;
}

/**
 * Overwrite the collection the user currently has open, by id.
 *
 * saveCollection's upsert keys on (user_id, name, arena_mode), so it can only
 * ever reach the row with that exact name and mode. Once the planner knows
 * which saved collection is open, "Save" has to mean that row — including
 * when the name or the mode is the thing being changed, which an upsert would
 * turn into a second collection.
 *
 * Changing the name or the mode can collide with the unique index and raise
 * 23505; the route reports that as a 409.
 */
export async function updateCollection(args: {
    userId: number;
    id: number;
    name: string | null;
    rawText: string;
    arenaMode: boolean;
}): Promise<{ id: number; name: string } | null> {
    const rows = await sql<{ id: number; name: string }[]>`
        UPDATE collections SET
          name = COALESCE(${args.name}, name),
          raw_text = ${args.rawText},
          arena_mode = ${args.arenaMode},
          updated_at = now()
        WHERE id = ${args.id} AND user_id = ${args.userId}
        RETURNING id, name
    `;
    return rows[0] ?? null;
}

/**
 * Duplicate a collection without sending its text to the browser and back.
 *
 * Only names in the SAME mode count as taken: uniqueness here is
 * (user_id, name, arena_mode), so an Arena "Binder (copy)" does not block a
 * paper one, and numbering against the other mode's names would skip numbers
 * for no reason a user could see.
 */
export async function copyCollection(
    userId: number,
    id: number
): Promise<{ id: number; name: string } | null> {
    const source = await sql<{ name: string; raw_text: string; arena_mode: boolean }[]>`
        SELECT name, raw_text, arena_mode
        FROM collections
        WHERE id = ${id} AND user_id = ${userId}
    `;
    if (!source[0]) return null;

    const taken = await sql<{ name: string }[]>`
        SELECT name FROM collections
        WHERE user_id = ${userId} AND arena_mode = ${source[0].arena_mode}
    `;

    const rows = await sql<{ id: number; name: string }[]>`
        INSERT INTO collections (user_id, name, raw_text, arena_mode)
        VALUES (
          ${userId},
          ${copyName(source[0].name, taken.map((r) => r.name))},
          ${source[0].raw_text},
          ${source[0].arena_mode}
        )
        RETURNING id, name
    `;
    return rows[0];
}

export async function deleteCollection(userId: number, id: number): Promise<boolean> {
    const rows = await sql<{ id: number }[]>`
        DELETE FROM collections WHERE id = ${id} AND user_id = ${userId} RETURNING id
    `;
    return rows.length > 0;
}

/* ----------------------------- analyses ------------------------------ */

export async function listAnalyses(userId: number): Promise<AnalysisSummary[]> {
    return sql<AnalysisSummary[]>`
        SELECT id,
               name,
               arena_mode,
               COALESCE(jsonb_array_length(decklists), 0) AS decks,
               updated_at
        FROM saved_analyses
        WHERE user_id = ${userId}
        ORDER BY updated_at DESC
        LIMIT 200
    `;
}

export async function getAnalysis(userId: number, id: number) {
    const rows = await sql<
        { id: number; name: string; decklists: string[]; collection: string; arena_mode: boolean }[]
    >`
        SELECT id, name, decklists, collection, arena_mode
        FROM saved_analyses
        WHERE id = ${id} AND user_id = ${userId}
    `;
    return rows[0] ?? null;
}

export async function saveAnalysis(args: {
    userId: number;
    name: string;
    decklists: string[];
    collection: string;
    arenaMode: boolean;
}): Promise<number> {
    const rows = await sql<{ id: number }[]>`
        INSERT INTO saved_analyses (user_id, name, decklists, collection, arena_mode)
        VALUES (
          ${args.userId},
          ${args.name},
          ${sql.json(args.decklists as never)},
          ${args.collection},
          ${args.arenaMode}
        )
        ON CONFLICT (user_id, name) DO UPDATE SET
          decklists = EXCLUDED.decklists,
          collection = EXCLUDED.collection,
          arena_mode = EXCLUDED.arena_mode,
          updated_at = now()
        RETURNING id
    `;
    return rows[0].id;
}

/** Overwrite the comparison the user has open, by id. See updateCollection. */
export async function updateAnalysis(args: {
    userId: number;
    id: number;
    name: string | null;
    decklists: string[];
    collection: string;
    arenaMode: boolean;
}): Promise<{ id: number; name: string } | null> {
    const rows = await sql<{ id: number; name: string }[]>`
        UPDATE saved_analyses SET
          name = COALESCE(${args.name}, name),
          decklists = ${sql.json(args.decklists as never)},
          collection = ${args.collection},
          arena_mode = ${args.arenaMode},
          updated_at = now()
        WHERE id = ${args.id} AND user_id = ${args.userId}
        RETURNING id, name
    `;
    return rows[0] ?? null;
}

/** Duplicate a comparison server-side. See copyGuide for why. */
export async function copyAnalysis(
    userId: number,
    id: number
): Promise<{ id: number; name: string } | null> {
    const source = await sql<
        { name: string; decklists: string[]; collection: string; arena_mode: boolean }[]
    >`
        SELECT name, decklists, collection, arena_mode
        FROM saved_analyses
        WHERE id = ${id} AND user_id = ${userId}
    `;
    if (!source[0]) return null;

    const taken = await sql<{ name: string }[]>`
        SELECT name FROM saved_analyses WHERE user_id = ${userId}
    `;

    const rows = await sql<{ id: number; name: string }[]>`
        INSERT INTO saved_analyses (user_id, name, decklists, collection, arena_mode)
        VALUES (
          ${userId},
          ${copyName(source[0].name, taken.map((r) => r.name))},
          ${sql.json(source[0].decklists as never)},
          ${source[0].collection},
          ${source[0].arena_mode}
        )
        RETURNING id, name
    `;
    return rows[0];
}

export async function deleteAnalysis(userId: number, id: number): Promise<boolean> {
    const rows = await sql<{ id: number }[]>`
        DELETE FROM saved_analyses WHERE id = ${id} AND user_id = ${userId} RETURNING id
    `;
    return rows.length > 0;
}
