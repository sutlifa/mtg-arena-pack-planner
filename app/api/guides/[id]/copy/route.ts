import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { copyGuide } from "@/lib/guides";
import { hasDatabase } from "@/lib/db";
import { isUniqueViolation, parseId } from "@/lib/savedRoutes";

/**
 * Duplicate a saved guide.
 *
 * POST with no body: everything the copy needs is already in the row, and
 * the whole point is that the plan never travels to the browser and back
 * just to be written again. The new name is chosen server-side so two tabs
 * cannot both decide on "X (copy)".
 */
export async function POST(_req: Request, context: { params: Promise<{ id: string }> }) {
    if (!hasDatabase) {
        return NextResponse.json({ error: "Saving isn't configured" }, { status: 503 });
    }

    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const id = parseId((await context.params).id);
    if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    try {
        const copied = await copyGuide(userId, id);
        if (!copied) return NextResponse.json({ error: "Not found" }, { status: 404 });
        return NextResponse.json(copied);
    } catch (err) {
        // Two duplicates racing can still land on the same name between the
        // name check and the insert. Saying so beats a 500 for something a
        // second click will resolve.
        if (isUniqueViolation(err)) {
            return NextResponse.json(
                { error: "A guide with that copy's name already exists — try again" },
                { status: 409 }
            );
        }
        console.error("COPY GUIDE ERROR:", err);
        return NextResponse.json({ error: "Could not duplicate that guide" }, { status: 500 });
    }
}
