import { NextResponse } from "next/server";
import { listDecks, saveDeck } from "@/lib/decks";
import { readDeckInput } from "@/lib/deckText";
import { readJsonBody } from "@/lib/requestBody";
import { requireUser, isGuardFailure, isUniqueViolation, checkName } from "@/lib/savedRoutes";

export async function GET() {
    const g = await requireUser();
    if (isGuardFailure(g)) return g.response;

    try {
        return NextResponse.json({ decks: await listDecks(g.userId) });
    } catch (err) {
        console.error("LIST DECKS ERROR:", err);
        return NextResponse.json({ error: "Could not load your decks" }, { status: 500 });
    }
}

/**
 * Save a new deck, or update the one with that name.
 *
 * The decklist is normalised here (lib/deckText) whatever the client sent.
 * The Decks page normalises too, but the stored shape is what the profile's
 * card counts and every other tool rely on, so the server is the guarantee.
 */
export async function POST(req: Request) {
    const g = await requireUser();
    if (isGuardFailure(g)) return g.response;

    // Read before the try: a body that isn't JSON is the client's mistake
    // and a 400, not a server fault to log (see lib/requestBody).
    const body = await readJsonBody(req);
    if (!body) return NextResponse.json({ error: "Nothing to save" }, { status: 400 });

    const nameError = checkName(body.name);
    if (nameError) return NextResponse.json({ error: nameError }, { status: 400 });

    const input = readDeckInput(body.decklist, body.format);
    if (!input.ok) return NextResponse.json({ error: input.error }, { status: input.status });

    const name = String(body.name).trim();
    // "Save as new" sends createOnly: it promised a second deck, so landing
    // on an existing name is a 409 to resolve, never an overwrite.
    const createOnly = body.createOnly === true;

    try {
        const id = await saveDeck({
            userId: g.userId,
            name,
            format: input.format,
            decklist: input.decklist,
            createOnly,
        });
        // The normalised list goes back so the page can show exactly what was
        // stored, and know it is no longer holding unsaved changes.
        return NextResponse.json({ id, name, decklist: input.decklist, format: input.format });
    } catch (err) {
        if (isUniqueViolation(err)) {
            return NextResponse.json(
                { error: `You already have a deck called "${name}" — pick another name` },
                { status: 409 }
            );
        }
        console.error("SAVE DECK ERROR:", err);
        return NextResponse.json({ error: "Could not save your deck" }, { status: 500 });
    }
}
