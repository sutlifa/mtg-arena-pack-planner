import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getGuide, deleteGuide } from "@/lib/guides";
import { hasDatabase } from "@/lib/db";

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
