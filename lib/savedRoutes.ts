import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { hasDatabase } from "./db";

/**
 * Shared guards for the saved-work endpoints.
 *
 * Collections, analyses and guides all need the same three checks in the same
 * order, and getting that order wrong is how an endpoint ends up leaking. One
 * implementation means one place to audit.
 */

export const MAX_NAME_LENGTH = 120;
export const MAX_TEXT_BYTES = 1_000_000;

export type Guarded = { userId: number } | { response: NextResponse };

export async function requireUser(): Promise<Guarded> {
    if (!hasDatabase) {
        return {
            response: NextResponse.json(
                { error: "Saving isn't configured on this deployment." },
                { status: 503 }
            ),
        };
    }

    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
        return { response: NextResponse.json({ error: "Not signed in" }, { status: 401 }) };
    }

    return { userId };
}

export function isGuardFailure(g: Guarded): g is { response: NextResponse } {
    return "response" in g;
}

/** Validates a user-supplied save name, returning an error message or null. */
export function checkName(name: unknown): string | null {
    const trimmed = typeof name === "string" ? name.trim() : "";
    if (!trimmed) return "Give it a name";
    if (trimmed.length > MAX_NAME_LENGTH) {
        return `Name is too long (max ${MAX_NAME_LENGTH} characters)`;
    }
    return null;
}

/** Parses a positive integer route id, or null if it isn't one. */
export function parseId(raw: string): number | null {
    const n = Number(raw);
    return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Postgres' unique_violation.
 *
 * Renaming a save into a name the account already uses breaks the
 * (user_id, name) index, and postgres.js throws with `code: "23505"`. That is
 * the user colliding with their own data, so it has to come back as a 409
 * with the offending name in it — the default catch-all would report a 500,
 * which reads as "the site is broken" for something the user can fix by
 * typing a different name.
 */
export function isUniqueViolation(err: unknown): boolean {
    return (
        typeof err === "object" &&
        err !== null &&
        (err as { code?: unknown }).code === "23505"
    );
}
