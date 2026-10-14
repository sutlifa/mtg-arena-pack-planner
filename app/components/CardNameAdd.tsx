"use client";

import { useEffect, useId, useRef, useState } from "react";
// Shared with Deck Check's per-deck view (DeckShortfall); see there for what
// a verdict is.
import { resolveNames } from "./resolveNames";
import { MAX_CARD_SEARCH_CHARS } from "@/lib/inputLimits";

/**
 * The "add a card" box with name suggestions from the whole card pool —
 * /api/card-search as you type, /api/card-resolve before anything typed is
 * accepted.
 *
 * Moved out of CollectionEditor when the Decks page's list editor needed the
 * same box for each half of a deck. It is deliberately NOT CardAutocomplete:
 * that one suggests from a deck's own cards (the Sideboard Planner's Out and
 * In rows can only name what the deck holds), where this one is for naming
 * any real card at all.
 */

/** Why the add box turned a name away, with real names to tap instead. */
export interface AddProblem {
    message: string;
    suggestions: string[];
}

/**
 * `onAdd` is only ever called with a real card's official name. A name picked
 * from the list already is one (the list comes from the card data); anything
 * typed is checked with the server first, and a name that isn't a card stays
 * in the box with "No card called ..." and a few close names to tap instead.
 * A near miss is never added on a guess — the user picks.
 *
 * The problem line is held by the page, not here, because the page has its
 * own status line ("Added 1 Lightning Bolt — you now have 3.") a few rows
 * below. Kept apart, a rejection showed above an older success and the two
 * contradicted each other; with both in the page, whichever is newer clears
 * the other (see showNotice and onProblem there).
 */
export default function CardNameAdd({
    onAdd,
    problem,
    onProblem,
    placeholder = "Type a card name...",
    nameLabel = "Card name",
    compact = false,
}: {
    onAdd: (name: string, qty: number) => void;
    problem: AddProblem | null;
    onProblem: (problem: AddProblem | null) => void;
    placeholder?: string;
    /** The name box's accessible name — the Decks page has one per half of the deck. */
    nameLabel?: string;
    /**
     * Smaller controls, for a box inside one column of the Decks page's
     * two-column list rather than across the whole Collection page. The
     * name box's minimum width drops with it, so the box and its Add button
     * still share a row in a half-width column at 375px.
     */
    compact?: boolean;
}) {
    const report = onProblem;
    const [query, setQuery] = useState("");
    // What the box holds right now, for an answer that arrives after the
    // user has kept typing: it still adds the card that was asked about,
    // but doesn't wipe out the newer text.
    const queryRef = useRef("");
    const [checking, setChecking] = useState(false);
    const [qty, setQty] = useState(1);
    // Suggestions are tied to the text they answer, so a slow response for
    // "lig" can't replace the list for "lightning".
    const [found, setFound] = useState<{ q: string; names: string[] }>({ q: "", names: [] });
    const [open, setOpen] = useState(false);
    const [highlight, setHighlight] = useState(0);
    const listId = useId();

    const trimmed = query.trim();
    useEffect(() => {
        // Past the route's limit it answers 400, so don't ask; the list just
        // stays empty. Add still works at any length: it checks the text
        // with card-resolve, which takes up to 150 characters — enough for
        // the handful of joke cards with names longer than 60.
        if (trimmed.length < 2 || trimmed.length > MAX_CARD_SEARCH_CHARS) return;
        let cancelled = false;
        // A short pause, so typing a name is one search rather than one per key.
        const t = setTimeout(async () => {
            try {
                const res = await fetch(`/api/card-search?q=${encodeURIComponent(trimmed)}`);
                const data = await res.json();
                if (!cancelled) setFound({ q: trimmed, names: Array.isArray(data.names) ? data.names : [] });
            } catch {
                /* suggestions are a convenience */
            }
        }, 150);
        return () => {
            cancelled = true;
            clearTimeout(t);
        };
    }, [trimmed]);

    const suggestions = found.q === trimmed ? found.names : [];

    /** `name` is a real card's name, from the list or the server. */
    const add = (name: string, asked = queryRef.current) => {
        onAdd(name, qty);
        report(null);
        setOpen(false);
        setHighlight(0);
        if (queryRef.current === asked) {
            setQuery("");
            queryRef.current = "";
            setQty(1);
        }
    };

    /** Whatever is in the box, checked before it goes anywhere. */
    const addTyped = async () => {
        if (checking) return;
        const asked = queryRef.current;
        const text = asked.replace(/\s+/g, " ").trim();
        if (!text) {
            report({ message: "Type a card name first.", suggestions: [] });
            return;
        }
        setChecking(true);
        setOpen(false);
        try {
            const verdict = (await resolveNames([text], true)).get(text);
            if (verdict?.name) add(verdict.name, asked);
            else
                report({
                    message: `No card called "${text}".`,
                    suggestions: verdict && verdict.name === null ? verdict.suggestions : [],
                });
        } catch {
            report({ message: "Couldn't check that name. Try again.", suggestions: [] });
        } finally {
            setChecking(false);
        }
    };

    const pad = compact ? "py-1.5 text-sm" : "py-2";

    return (
        <div className="flex flex-wrap items-start gap-2">
            <input
                type="number"
                min={1}
                max={999}
                value={qty}
                aria-label="Copies to add"
                onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    setQty(Number.isNaN(n) ? 1 : Math.min(999, Math.max(1, n)));
                }}
                className={(compact ? "w-14 " : "w-16 ") + pad + " px-2 rounded bg-parchment text-ink shadow-inner-parchment"}
            />
            <div className={"relative flex-1 " + (compact ? "min-w-[8rem]" : "min-w-[12rem]")}>
                <input
                    type="text"
                    role="combobox"
                    aria-expanded={open && suggestions.length > 0}
                    aria-controls={listId}
                    aria-autocomplete="list"
                    aria-label={nameLabel}
                    placeholder={placeholder}
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        queryRef.current = e.target.value;
                        report(null);
                        setOpen(true);
                        setHighlight(0);
                    }}
                    onFocus={() => setOpen(true)}
                    onBlur={() => setTimeout(() => setOpen(false), 120)}
                    onKeyDown={(e) => {
                        if (e.key === "ArrowDown") {
                            e.preventDefault();
                            setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
                        } else if (e.key === "ArrowUp") {
                            e.preventDefault();
                            setHighlight((h) => Math.max(h - 1, 0));
                        } else if (e.key === "Enter") {
                            e.preventDefault();
                            // A highlighted suggestion is a real name already;
                            // anything else is checked first.
                            if (open && suggestions[highlight]) add(suggestions[highlight]);
                            else void addTyped();
                        } else if (e.key === "Escape") {
                            setOpen(false);
                        }
                    }}
                    className={"w-full px-3 " + pad + " rounded bg-parchment text-ink shadow-inner-parchment"}
                />
                {open && suggestions.length > 0 && (
                    <ul
                        id={listId}
                        role="listbox"
                        className="absolute z-20 left-0 right-0 mt-1 max-h-72 overflow-y-auto rounded bg-parchment shadow-card border border-brass/30"
                    >
                        {suggestions.map((s, i) => (
                            <li key={s} role="option" aria-selected={i === highlight}>
                                <button
                                    type="button"
                                    // mousedown, so it lands before the input's blur closes the list
                                    onMouseDown={(e) => {
                                        e.preventDefault();
                                        add(s);
                                    }}
                                    onMouseEnter={() => setHighlight(i)}
                                    className={
                                        "w-full text-left px-3 py-1.5 text-sm " +
                                        (i === highlight ? "bg-brass/25" : "hover:bg-brass/15")
                                    }
                                >
                                    {s}
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
            <button
                type="button"
                onClick={() => void addTyped()}
                disabled={checking}
                className={
                    (compact ? "px-4 py-1.5 text-sm" : "px-5 py-2") +
                    " rounded shadow-card font-title bg-brand text-midnight-light hover:bg-brand-dark disabled:opacity-50"
                }
            >
                {checking ? "Checking..." : "Add"}
            </button>
            {problem && (
                <div className="basis-full text-sm" role="status">
                    {/* anywhere, not just break-words: the message echoes
                        whatever was typed, and one long unbroken token
                        otherwise widens the whole page on a phone. */}
                    <p className="text-red-700 [overflow-wrap:anywhere]">{problem.message}</p>
                    {problem.suggestions.length > 0 && (
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                            <span className="text-ink/70">Did you mean:</span>
                            {problem.suggestions.map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => add(s)}
                                    className="px-3 py-1 rounded bg-parchment text-ink shadow-inner-parchment hover:bg-brass/25"
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
