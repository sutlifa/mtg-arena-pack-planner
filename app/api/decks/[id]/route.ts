import { NextResponse } from "next/server";
import { getDeck, updateDeck, renameDeck, deleteDeck } from "@/lib/decks";
import { readDeckInput } from "@/lib/deckText";
import { readJsonBody } from "@/lib/requestBody";
import {
    requireUser,
    isGuardFailure,
    isUniqueViolation,
    checkName,
    parseId,
} from "@/lib/savedRoutes";

export async function GET(_req: Request, context: { params: Promise<{ id: string }> }) {
    const g = await requireUser();
    if (isGuardFailure(g)) return g.response;

    const id = parseId((await context.params).id);
    if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    try {
        const deck = await getDeck(g.userId, id);
        // Someone else's deck is reported missing rather than forbidden, so
        // the response can't be used to confirm that an id exists.
        if (!deck) return NextResponse.json({ error: "Not found" }, { status: 404 });
        return NextResponse.json({ deck });
    } catch (err) {
        console.error("GET DECK ERROR:", err);
        return NextResponse.json({ error: "Could not load that deck" }, { status: 500 });
    }
}

/**
 * Overwrite the deck the Decks page has open. See /api/guides/[id] PUT: once
 * a deck is open, Save has to mean this row, which the name upsert in POST
 * can't promise after a rename.
 *
 * `name` is optional; leaving it out keeps the row's name.
 */
export async function PUT(req: Request, context: { params: Promise<{ id: string }> }) {
    const g = await requireUser();
    if (isGuardFailure(g)) return g.response;

    const id = parseId((await context.params).id);
    if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    const body = await readJsonBody(req);
    if (!body) return NextResponse.json({ error: "Nothing to save" }, { status: 400 });

    let name: string | null = null;
    if (body.name !== undefined) {
        const nameError = checkName(body.name);
        if (nameError) return NextResponse.json({ error: nameError }, { status: 400 });
        name = String(body.name).trim();
    }

    const input = readDeckInput(body.decklist, body.format);
    if (!input.ok) return NextResponse.json({ error: input.error }, { status: input.status });

    try {
        const updated = await updateDeck({
            userId: g.userId,
            id,
            name,
            format: input.format,
            decklist: input.decklist,
        });
        if (!updated) return NextResponse.json({ error: "Not found" }, { status: 404 });
        return NextResponse.json({ ...updated, decklist: input.decklist, format: input.format });
    } catch (err) {
        if (isUniqueViolation(err)) {
            return NextResponse.json(
                { error: `You already have a deck called "${name}"` },
                { status: 409 }
            );
        }
        console.error("UPDATE DECK ERROR:", err);
        return NextResponse.json({ error: "Could not save your deck" }, { status: 500 });
    }
}

/** Rename only. See renameDeck for why this never touches the list. */
export async function PATCH(req: Request, context: { params: Promise<{ id: string }> }) {
    const g = await requireUser();
    if (isGuardFailure(g)) return g.response;

    const id = parseId((await context.params).id);
    if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    const body = await readJsonBody(req);
    const nameError = checkName(body?.name);
    if (nameError) return NextResponse.json({ error: nameError }, { status: 400 });
    const name = String(body?.name).trim();

    try {
        const renamed = await renameDeck(g.userId, id, name);
        if (!renamed) return NextResponse.json({ error: "Not found" }, { status: 404 });
        return NextResponse.json(renamed);
    } catch (err) {
        if (isUniqueViolation(err)) {
            return NextResponse.json(
                { error: `You already have a deck called "${name}"` },
                { status: 409 }
            );
        }
        console.error("RENAME DECK ERROR:", err);
        return NextResponse.json({ error: "Could not rename your deck" }, { status: 500 });
    }
}

export async function DELETE(_req: Request, context: { params: Promise<{ id: string }> }) {
    const g = await requireUser();
    if (isGuardFailure(g)) return g.response;

    const id = parseId((await context.params).id);
    if (!id) return NextResponse.json({ error: "Bad id" }, { status: 400 });

    try {
        const removed = await deleteDeck(g.userId, id);
        if (!removed) return NextResponse.json({ error: "Not found" }, { status: 404 });
        return NextResponse.json({ ok: true });
    } catch (err) {
        console.error("DELETE DECK ERROR:", err);
        return NextResponse.json({ error: "Could not delete that deck" }, { status: 500 });
    }
}
