import { sql } from "./db";
import { copyName } from "./copyName";

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

/**
 * Overwrite one guide the user already has open, found by id rather than by
 * name.
 *
 * saveGuide's upsert can only ever hit the row whose name matches, so
 * renaming an open guide through it would create a second guide instead of
 * renaming the one on screen. Updating by id is what makes "Save" mean "save
 * this thing I am editing".
 *
 * A null `name` leaves the existing one alone, which is the ordinary Save;
 * a non-null one is a rename and can collide with the (user_id, name) unique
 * index. That raises 23505, which the route turns into a 409 — it is a
 * conflict with the user's own data, not a server fault.
 */
export async function updateGuide(args: {
    userId: number;
    id: number;
    name: string | null;
    format: string;
    plan: unknown;
}): Promise<{ id: number; name: string } | null> {
    const rows = await sql<{ id: number; name: string }[]>`
        UPDATE sideboard_guides SET
          name = COALESCE(${args.name}, name),
          format = ${args.format},
          plan = ${sql.json(args.plan as never)},
          updated_at = now()
        WHERE id = ${args.id} AND user_id = ${args.userId}
        RETURNING id, name
    `;
    return rows[0] ?? null;
}

/**
 * Duplicate a guide entirely inside the database.
 *
 * The plan never round-trips through the browser: a copy made client-side
 * would have to download the whole plan and post it back, which is slower,
 * bounded by the same size limits as a save, and silently rewrites the copy
 * with whatever the current tab happens to hold rather than what is stored.
 */
export async function copyGuide(
    userId: number,
    id: number
): Promise<{ id: number; name: string } | null> {
    const source = await sql<{ name: string; format: string; plan: unknown }[]>`
        SELECT name, format, plan
        FROM sideboard_guides
        WHERE id = ${id} AND user_id = ${userId}
    `;
    if (!source[0]) return null;

    const taken = await sql<{ name: string }[]>`
        SELECT name FROM sideboard_guides WHERE user_id = ${userId}
    `;

    const rows = await sql<{ id: number; name: string }[]>`
        INSERT INTO sideboard_guides (user_id, name, format, plan)
        VALUES (
          ${userId},
          ${copyName(source[0].name, taken.map((r) => r.name))},
          ${source[0].format},
          ${sql.json(source[0].plan as never)}
        )
        RETURNING id, name
    `;
    return rows[0];
}

export async function deleteGuide(userId: number, id: number): Promise<boolean> {
    const rows = await sql<{ id: number }[]>`
        DELETE FROM sideboard_guides
        WHERE id = ${id} AND user_id = ${userId}
        RETURNING id
    `;
    return rows.length > 0;
}
