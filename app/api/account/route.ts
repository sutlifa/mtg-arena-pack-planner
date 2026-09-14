import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { sql, hasDatabase } from "@/lib/db";

/**
 * Deletes the signed-in user's account and everything attached to it.
 *
 * Every table that references users(id) does so ON DELETE CASCADE, so this
 * one statement removes the account row, its saved guides, collections and
 * analyses together. The privacy policy promises this is possible from
 * inside the app; that promise needs a working endpoint behind it, not an
 * email address to write to.
 */
export async function DELETE() {
    if (!hasDatabase) {
        return NextResponse.json({ error: "Not configured" }, { status: 503 });
    }

    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    try {
        await sql`DELETE FROM users WHERE id = ${userId}`;
        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error("DELETE ACCOUNT ERROR:", err);
        return NextResponse.json({ error: "Could not delete your account" }, { status: 500 });
    }
}
