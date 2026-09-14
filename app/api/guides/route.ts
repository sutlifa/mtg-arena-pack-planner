import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { listGuides, saveGuide } from "@/lib/guides";
import { hasDatabase } from "@/lib/db";

/** A plan is JSON the user typed; bound it so one account can't fill the table. */
const MAX_PLAN_BYTES = 512_000;
const MAX_NAME_LENGTH = 120;

function unauthorized() {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
}

function notConfigured() {
    return NextResponse.json(
        { error: "Saving isn't configured on this deployment." },
        { status: 503 }
    );
}

export async function GET() {
    if (!hasDatabase) return notConfigured();

    const session = await auth();
    // The user id comes from the signed session cookie, never from the
    // request — a client-supplied id would let anyone read another account.
    const userId = session?.user?.id;
    if (!userId) return unauthorized();

    try {
        return NextResponse.json({ guides: await listGuides(userId) });
    } catch (err) {
        console.error("LIST GUIDES ERROR:", err);
        return NextResponse.json({ error: "Could not load your guides" }, { status: 500 });
    }
}

export async function POST(req: Request) {
    if (!hasDatabase) return notConfigured();

    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) return unauthorized();

    try {
        const { name, format, plan } = await req.json();

        const trimmed = typeof name === "string" ? name.trim() : "";
        if (!trimmed) {
            return NextResponse.json({ error: "Give the guide a name" }, { status: 400 });
        }
        if (trimmed.length > MAX_NAME_LENGTH) {
            return NextResponse.json(
                { error: `Name is too long (max ${MAX_NAME_LENGTH} characters)` },
                { status: 400 }
            );
        }
        if (!plan || typeof plan !== "object") {
            return NextResponse.json({ error: "Nothing to save" }, { status: 400 });
        }
        if (JSON.stringify(plan).length > MAX_PLAN_BYTES) {
            return NextResponse.json({ error: "That guide is too large to save" }, { status: 413 });
        }

        const id = await saveGuide({
            userId,
            name: trimmed,
            format: typeof format === "string" ? format : "",
            plan,
        });

        return NextResponse.json({ id, name: trimmed });
    } catch (err) {
        console.error("SAVE GUIDE ERROR:", err);
        return NextResponse.json({ error: "Could not save your guide" }, { status: 500 });
    }
}
