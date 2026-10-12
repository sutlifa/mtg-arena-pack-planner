import { NextResponse } from "next/server";
import { copyDeck } from "@/lib/decks";
import { requireUser, isGuardFailure, isUniqueViolation, parseId } from "@/lib/savedRoutes";

/** Duplicate a saved deck. See /api/guides/[id]/copy for the shape. */
export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
    const g = await requireUser();
    if (isGuardFailure(g)) return g.response;

    const id = parseId((await context.params).id);
    if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    try {
        const copied = await copyDeck(g.userId, id);
        if (!copied) return NextResponse.json({ error: "Not found" }, { status: 404 });
        return NextResponse.json(copied);
    } catch (err) {
        if (isUniqueViolation(err)) {
            return NextResponse.json(
                { error: "A deck with that copy's name already exists — try again" },
                { status: 409 }
            );
        }
        console.error("COPY DECK ERROR:", err);
        return NextResponse.json({ error: "Could not duplicate that deck" }, { status: 500 });
    }
}
