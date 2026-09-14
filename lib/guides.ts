import { sql } from "./db";

export interface GuideSummary {
    id: number;
    name: string;
    format: string;
    matchups: number;
    updated_at: string;
}

/**
 * Every function here takes the owner's userId and puts it in the WHERE
 * clause. That is the only thing standing between two accounts' data, so it
 * is never optional and never comes from the request body — the route
 * handlers read it from the server-side session.
 */

export async function listGuides(userId: number): Promise<GuideSummary[]> {
    return sql<GuideSummary[]>`
        SELECT id,
               name,
               format,
               -- Counted in SQL so listing the profile page doesn't ship
               -- every full plan to the client just to show a number.
               COALESCE(jsonb_array_length(plan -> 'matchups'), 0) AS matchups,
               updated_at
        FROM sideboard_guides
        WHERE user_id = ${userId}
        ORDER BY updated_at DESC
        LIMIT 200
    `;
}

export async function getGuide(userId: number, id: number) {
    const rows = await sql<{ id: number; name: string; plan: unknown }[]>`
        SELECT id, name, plan
        FROM sideboard_guides
        WHERE id = ${id} AND user_id = ${userId}
    `;
    return rows[0] ?? null;
}

/** Saving under a name that already exists updates that guide in place. */
export async function saveGuide(args: {
    userId: number;
    name: string;
    format: string;
    plan: unknown;
}): Promise<number> {
    const rows = await sql<{ id: number }[]>`
        INSERT INTO sideboard_guides (user_id, name, format, plan)
        VALUES (${args.userId}, ${args.name}, ${args.format}, ${sql.json(args.plan as never)})
        ON CONFLICT (user_id, name) DO UPDATE SET
          format = EXCLUDED.format,
          plan = EXCLUDED.plan,
          updated_at = now()
        RETURNING id
    `;
    return rows[0].id;
}

export async function deleteGuide(userId: number, id: number): Promise<boolean> {
    const rows = await sql<{ id: number }[]>`
        DELETE FROM sideboard_guides
        WHERE id = ${id} AND user_id = ${userId}
        RETURNING id
    `;
    return rows.length > 0;
}
