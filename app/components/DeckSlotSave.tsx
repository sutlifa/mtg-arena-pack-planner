"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { DECK_FORMATS, NO_CARDS_MESSAGE, deckFormatLabel, deckSections, plannerDeckText } from "@/lib/deckText";
import { isEdited, type DeckSlot, type LinkedDeck } from "@/lib/deckSlots";
import { isGoldfishDeckUrl } from "@/lib/goldfishUrl";
import { checkDecklistSize } from "@/lib/inputLimits";

/**
 * Saving one Deck Check slot to the Decks tab.
 *
 * Three cases, and the buttons say which:
 *
 * - A pasted list: "Save to Decks", with a name and a format. Always a NEW
 *   deck (createOnly) — this is adding a deck from somewhere else, and a name
 *   you already use is the server's 409, shown as it comes, never a silent
 *   overwrite of the deck that had it.
 * - A saved deck you've edited here: "Save changes to deck" overwrites that
 *   deck by id, and only on that click; "Save as new deck" leaves it alone and
 *   saves the edit as a second deck.
 * - A saved deck you haven't touched: nothing to save, so nothing is offered.
 *
 * After a save the slot is linked to the deck it saved, holding the server's
 * normalised list, so it immediately reads as saved and unedited.
 *
 * Only ever rendered where auth is configured: useSession throws without a
 * SessionProvider, and the provider isn't mounted on a deployment without
 * Google credentials (see Providers and lib/authConfig). Signed out it
 * renders nothing — the deck box has one sign-in prompt for every slot,
 * rather than one per slot.
 */
export default function DeckSlotSave({
    slot,
    onSaved,
}: {
    slot: DeckSlot;
    /** The deck it now belongs to, and the text that is now the slot's. */
    onSaved: (linked: LinkedDeck, text: string) => void;
}) {
    const { data: session } = useSession();
    const [naming, setNaming] = useState(false);
    const [name, setName] = useState("");
    const [format, setFormat] = useState("");
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

    if (!session?.user) return null;

    const trimmed = slot.text.trim();
    // A link isn't a list yet: Analyze imports it, and Save appears then.
    if (!trimmed || isGoldfishDeckUrl(trimmed)) return null;

    const edited = isEdited(slot);
    if (slot.saved && !edited && !naming) {
        return message ? (
            <p className="text-sm text-ink/80 [overflow-wrap:anywhere]" role="status">
                {message.text}
            </p>
        ) : null;
    }

    /** What's wrong with the text as a deck, before it's sent anywhere. */
    const problem = (): string | null => {
        const sizeError = checkDecklistSize(slot.text);
        if (sizeError) return sizeError;
        const { maindeck, sideboard } = deckSections(slot.text);
        return maindeck.length === 0 && sideboard.length === 0 ? NO_CARDS_MESSAGE : null;
    };

    const startNaming = () => {
        const p = problem();
        if (p) {
            setMessage({ error: true, text: p });
            return;
        }
        setMessage(null);
        // Branching off a saved deck defaults to "<name> (copy)", matching
        // what Duplicate produces on the Decks page and the profile.
        setName(slot.saved ? `${slot.saved.name} (copy)` : "");
        setFormat(slot.saved?.format ?? "");
        setNaming(true);
    };

    const saveNew = async () => {
        if (!name.trim()) {
            setMessage({ error: true, text: "Give the deck a name first." });
            return;
        }
        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch("/api/decks", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: name.trim(),
                    decklist: slot.text,
                    format: format || null,
                    createOnly: true,
                }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.status === 401) {
                setMessage({ error: true, text: "Sign in again to save." });
            } else if (!res.ok) {
                // 409 carries 'You already have a deck called "…" — pick
                // another name', which is exactly what to show.
                setMessage({ error: true, text: data.error ?? "Could not save that deck." });
            } else {
                const text = plannerDeckText(data.decklist);
                setNaming(false);
                setMessage({ error: false, text: `Saved to Decks as "${data.name}".` });
                onSaved({ id: data.id, name: data.name, format: data.format ?? null, baseline: text }, text);
            }
        } catch {
            setMessage({ error: true, text: "Could not save that deck." });
        }
        setSaving(false);
    };

    const saveChanges = async () => {
        if (!slot.saved) return;
        const p = problem();
        if (p) {
            setMessage({ error: true, text: p });
            return;
        }
        const linked = slot.saved;
        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch(`/api/decks/${linked.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                // No name: the server keeps the deck's own. The format is the
                // one it was saved with — Deck Check has no format picker for
                // an existing deck, and clearing it here would be a side
                // effect nobody asked for.
                body: JSON.stringify({ decklist: slot.text, format: linked.format }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.status === 401) {
                setMessage({ error: true, text: "Sign in again to save." });
            } else if (res.status === 404) {
                setMessage({
                    error: true,
                    text: 'That deck no longer exists — use "Save as new deck" to keep this.',
                });
            } else if (!res.ok) {
                setMessage({ error: true, text: data.error ?? "Could not save that deck." });
            } else {
                const text = plannerDeckText(data.decklist);
                setMessage({ error: false, text: `Saved your changes to "${data.name}".` });
                onSaved({ id: data.id, name: data.name, format: data.format ?? null, baseline: text }, text);
            }
        } catch {
            setMessage({ error: true, text: "Could not save that deck." });
        }
        setSaving(false);
    };

    const knownFormat = format === "" || DECK_FORMATS.some((f) => f.slug === format);

    return (
        <div className="space-y-2">
            {!naming && (
                <div className="flex flex-wrap items-center gap-2">
                    {slot.saved ? (
                        <>
                            <button
                                type="button"
                                onClick={saving ? undefined : saveChanges}
                                disabled={saving}
                                className="px-4 py-2 rounded font-title text-sm bg-brand text-midnight-light hover:bg-brand-dark disabled:opacity-50"
                            >
                                {saving ? "Saving..." : "Save changes to deck"}
                            </button>
                            <button
                                type="button"
                                onClick={saving ? undefined : startNaming}
                                disabled={saving}
                                className="px-4 py-2 rounded font-title text-sm bg-parchment text-ink shadow-card hover:bg-parchment/70 disabled:opacity-50"
                            >
                                Save as new deck...
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            onClick={startNaming}
                            className="px-4 py-2 rounded font-title text-sm bg-parchment text-ink shadow-card hover:bg-parchment/70"
                        >
                            Save to Decks...
                        </button>
                    )}
                </div>
            )}

            {naming && (
                <div className="bg-parchment rounded shadow-inner-parchment p-3 sm:p-4 space-y-3 max-w-lg">
                    <p className="font-title text-lg">{slot.saved ? "Save as a new deck" : "Save to Decks"}</p>
                    <div className="flex flex-wrap gap-3">
                        <label className="flex flex-col gap-1 flex-1 min-w-[12rem]">
                            <span className="text-sm text-ink/70">Name</span>
                            <input
                                type="text"
                                autoFocus
                                value={name}
                                maxLength={120}
                                onChange={(e) => setName(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        e.preventDefault();
                                        if (!saving) void saveNew();
                                    }
                                    if (e.key === "Escape") setNaming(false);
                                }}
                                placeholder="Mono-Red Aggro"
                                className="px-3 py-2 rounded bg-parchment-dark text-ink shadow-inner-parchment"
                            />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="text-sm text-ink/70">Format</span>
                            <select
                                value={format}
                                onChange={(e) => setFormat(e.target.value)}
                                className="px-3 py-2 rounded bg-parchment-dark text-ink shadow-inner-parchment"
                            >
                                <option value="">No particular format</option>
                                {DECK_FORMATS.map((f) => (
                                    <option key={f.slug} value={f.slug}>
                                        {f.label}
                                    </option>
                                ))}
                                {!knownFormat && <option value={format}>{deckFormatLabel(format)}</option>}
                            </select>
                        </label>
                    </div>
                    <p className="text-xs text-ink/55 [overflow-wrap:anywhere]">
                        {slot.saved
                            ? `This saves a second deck and leaves "${slot.saved.name}" as it was.`
                            : "This adds a new deck to your Decks tab. It never replaces one you already have."}
                    </p>
                    <div className="flex gap-2 justify-end">
                        <button
                            type="button"
                            onClick={() => {
                                setNaming(false);
                                setMessage(null);
                            }}
                            className="px-4 py-2 rounded text-sm text-ink/70 hover:bg-parchment-dark"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={saving ? undefined : () => void saveNew()}
                            disabled={saving}
                            className="px-5 py-2 rounded font-title bg-brand text-midnight-light hover:bg-brand-dark disabled:opacity-50"
                        >
                            {saving ? "Saving..." : "Save"}
                        </button>
                    </div>
                </div>
            )}

            {/* Only failures here. A "Saved" line from earlier would be
                stale by now: reaching this branch means the slot has been
                edited since that save (the saved-and-unedited case returns
                above, with its message). */}
            {message?.error && (
                <p className="text-sm text-red-700 [overflow-wrap:anywhere]" role="alert">
                    {message.text}
                </p>
            )}
        </div>
    );
}
