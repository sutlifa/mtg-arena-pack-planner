import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getGuide, deleteGuide, updateGuide } from "@/lib/guides";
import { hasDatabase } from "@/lib/db";
import { isUniqueViolation } from "@/lib/savedRoutes";

/** Mirrors the POST limits in ../route.ts; a guide is user-typed JSON. */
const MAX_PLAN_BYTES = 512_000;
const MAX_NAME_LENGTH = 120;

async function resolve(context: { params: Promise<{ id: string }> }) {
    const { id } = await context.params;
    const numeric = Number(id);
    return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
    if (!hasDatabase) {
        return NextResponse.json({ error: "Saving isn't configured" }, { status: 503 });
    }

    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const id = await resolve(context);
    if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    try {
        const guide = await getGuide(userId, id);
        // Someone else's guide is reported as missing rather than forbidden —
        // a 403 would confirm that the id exists and belongs to somebody.
        if (!guide) return NextResponse.json({ error: "Not found" }, { status: 404 });
        return NextResponse.json({ guide });
    } catch (err) {
        console.error("GET GUIDE ERROR:", err);
        return NextResponse.json({ error: "Could not load that guide" }, { status: 500 });
    }
}

/**
 * Overwrite one guide in place.
 *
 * This is what the planner's Save button calls once a guide is open. POSTing
 * to /api/guides would key on the name instead, so a save after a rename
 * would quietly leave the original behind and create a second guide — the
 * exact confusion this endpoint exists to remove.
 *
 * `name` is optional: leaving it out keeps whatever the row is called, which
 * is the ordinary "save the thing I'm editing".
 */
export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
    if (!hasDatabase) {
        return NextResponse.json({ error: "Saving isn't configured" }, { status: 503 });
    }

    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const id = await resolve(context);
    if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    let name: string | null = null;

    try {
        const body = await req.json();
        const { format, plan } = body;

        if (body.name !== undefined) {
            const trimmed = typeof body.name === "string" ? body.name.trim() : "";
            if (!trimmed) {
                return NextResponse.json({ error: "Give the guide a name" }, { status: 400 });
            }
            if (trimmed.length > MAX_NAME_LENGTH) {
                return NextResponse.json(
                    { error: `Name is too long (max ${MAX_NAME_LENGTH} characters)` },
                    { status: 400 }
                );
            }
            name = trimmed;
        }

        if (!plan || typeof plan !== "object") {
            return NextResponse.json({ error: "Nothing to save" }, { status: 400 });
        }
        if (JSON.stringify(plan).length > MAX_PLAN_BYTES) {
            return NextResponse.json({ error: "That guide is too large to save" }, { status: 413 });
        }

        const updated = await updateGuide({
            userId,
            id,
            name,
            format: typeof format === "string" ? format : "",
            plan,
        });
        // Same reasoning as GET: a guide belonging to someone else is
        // reported missing rather than forbidden.
        if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });

        return NextResponse.json(updated);
    } catch (err) {
        if (isUniqueViolation(err)) {
            return NextResponse.json(
                { error: `You already have a guide called "${name}"` },
                { status: 409 }
            );
        }
        console.error("UPDATE GUIDE ERROR:", err);
        return NextResponse.json({ error: "Could not save your guide" }, { status: 500 });
    }
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
    if (!hasDatabase) {
        return NextResponse.json({ error: "Saving isn't configured" }, { status: 503 });
    }

    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const id = await resolve(context);
    if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    try {
        const removed = await deleteGuide(userId, id);
        if (!removed) return NextResponse.json({ error: "Not found" }, { status: 404 });
        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error("DELETE GUIDE ERROR:", err);
        return NextResponse.json({ error: "Could not delete that guide" }, { status: 500 });
    }
}
