import { sql } from "./db";

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
        ON CONFLICT (user_id, name) DO UPDATE SET
          raw_text = EXCLUDED.raw_text,
          arena_mode = EXCLUDED.arena_mode,
          updated_at = now()
        RETURNING id
    `;
    return rows[0].id;
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

export async function deleteAnalysis(userId: number, id: number): Promise<boolean> {
    const rows = await sql<{ id: number }[]>`
        DELETE FROM saved_analyses WHERE id = ${id} AND user_id = ${userId} RETURNING id
    `;
    return rows.length > 0;
}
