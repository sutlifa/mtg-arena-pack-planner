"use client";

import { Suspense, useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import HelpTip from "./HelpTip";
import PackPlannerSave, { type SavedRef } from "./PackPlannerSave";
import {
    applyVerdicts,
    cardKey,
    formatCollection,
    mergeCards,
    mergeCollection,
    parseCollectionRows,
    type CollectionCard,
    type NameVerdict,
} from "@/lib/collectionText";
import { MAX_CARD_SEARCH_CHARS } from "@/lib/inputLimits";
// The same keys the Pack Planner keeps its collection under. One collection,
// two views of it: edit it here with pictures, and the Pack Planner compares
// your decks against exactly what you left here — and the other way round.
// lib/openCollection explains why the open ref carries a fingerprint.
import {
    COLLECTION_KEY,
    MODE_KEY,
    OPEN_KEY,
    decodeOpen,
    encodeOpen,
} from "@/lib/openCollection";

const PAGE_SIZE = 48;

/**
 * Longest name worth asking /api/card-images about — its own per-name limit.
 * No card is anywhere near it; a longer "name" is a pasted paragraph, and
 * sending it would only earn a null back.
 */
const MAX_IMAGE_NAME = 150;

/** /api/card-resolve's per-request limit; longer lists go in chunks of it. */
const RESOLVE_CHUNK = 500;

/** Rejected paste lines listed with their suggestions; the rest are counted. */
const MAX_REJECTED_SHOWN = 10;

type Sort = "name" | "qty";

/** A pasted line that isn't a card, with what it might have meant. */
interface Rejected {
    name: string;
    qty: number;
    suggestions: string[];
}

/** Why the add box turned a name away, with real names to tap instead. */
interface AddProblem {
    message: string;
    suggestions: string[];
}

/**
 * What the server makes of each name: its official spelling, or null and a
 * few close real names. Throws when the server can't be asked, so a caller
 * never mistakes "couldn't check" for "not a card".
 *
 * Every card in the collection is a real card stored under its real name —
 * the add box, a paste and an Arena export all go through here first, and
 * nothing that comes back null is added. That's what lets every tile have a
 * picture and every name match the Pack Planner's card data exactly.
 *
 * `suggest: false` when only the verdict matters (checking a collection that
 * was already saved), which spares the server its "did you mean" search.
 */
async function resolveNames(names: string[], suggest: boolean): Promise<Map<string, NameVerdict>> {
    const out = new Map<string, NameVerdict>();
    const unique = [...new Set(names)];
    for (let i = 0; i < unique.length; i += RESOLVE_CHUNK) {
        const res = await fetch("/api/card-resolve", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ names: unique.slice(i, i + RESOLVE_CHUNK), suggest }),
        });
        if (!res.ok) throw new Error(`card-resolve ${res.status}`);
        const data = await res.json();
        // Object.entries rather than data.results[name]: a "__proto__" key
        // is an own property after JSON.parse, but indexing it reads the
        // prototype instead.
        const results: Record<string, { name?: unknown; suggestions?: unknown } | null> =
            data && typeof data.results === "object" && data.results ? data.results : {};
        for (const [asked, v] of Object.entries(results)) {
            if (typeof v?.name === "string") out.set(asked, { name: v.name });
            else if (v?.name === null) {
                out.set(asked, {
                    name: null,
                    suggestions: Array.isArray(v.suggestions)
                        ? v.suggestions.filter((s: unknown): s is string => typeof s === "string")
                        : [],
                });
            }
        }
    }
    return out;
}

/* ------------------------------------------------------------------ */
/* Loading a saved collection from ?collection=<id>                    */
/* ------------------------------------------------------------------ */

/**
 * Split out so useSearchParams sits under its own Suspense boundary and the
 * page can still prerender, the same arrangement as the Sideboard Planner's
 * GuideLoader.
 */
function SavedCollectionLoader({
    onLoad,
}: {
    onLoad: (text: string, open: NonNullable<SavedRef>) => void;
}) {
    const searchParams = useSearchParams();
    const id = searchParams.get("collection");
    const [status, setStatus] = useState<{ id: string; message: string } | null>(null);

    const onLoadRef = useRef(onLoad);
    useEffect(() => {
        onLoadRef.current = onLoad;
    }, [onLoad]);

    useEffect(() => {
        if (!id) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/collections/${id}`);
                if (cancelled) return;
                if (res.status === 401) {
                    setStatus({ id, message: "Sign in to open that saved collection." });
                    return;
                }
                if (res.status === 404) {
                    setStatus({ id, message: "That collection no longer exists." });
                    return;
                }
                if (!res.ok) {
                    setStatus({ id, message: "Could not open that collection." });
                    return;
                }
                const { collection } = await res.json();
                if (cancelled) return;
                onLoadRef.current(collection.raw_text ?? "", {
                    id: collection.id,
                    name: collection.name,
                    arena: collection.arena_mode,
                });
                // The ?collection= link has done its job, so take it out of
                // the address. Left in, a reload — or Back from the Pack
                // Planner — would fetch the saved copy again and silently
                // replace whatever was edited since. Without it the page
                // restores from localStorage like any other visit, and a
                // fresh Edit click from the profile still arrives with the
                // parameter and still loads.
                //
                // The native replaceState rather than router.replace: Next
                // syncs useSearchParams with it (see "Native History API" in
                // the linking-and-navigating guide) without a server round
                // trip or a new history entry.
                const url = new URL(window.location.href);
                url.searchParams.delete("collection");
                window.history.replaceState(null, "", url.pathname + url.search + url.hash);
            } catch {
                if (!cancelled) setStatus({ id, message: "Could not open that collection." });
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [id]);

    const message = status && status.id === id ? status.message : null;
    if (!message) return null;
    return (
        <p className="text-sm text-center text-red-700" role="status">
            {message}
        </p>
    );
}

/* ------------------------------------------------------------------ */
/* Add-a-card box with name suggestions                                */
/* ------------------------------------------------------------------ */

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
function AddCard({
    onAdd,
    problem,
    onProblem,
}: {
    onAdd: (name: string, qty: number) => void;
    problem: AddProblem | null;
    onProblem: (problem: AddProblem | null) => void;
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
                className="w-16 px-2 py-2 rounded bg-parchment text-ink shadow-inner-parchment"
            />
            <div className="relative flex-1 min-w-[12rem]">
                <input
                    type="text"
                    role="combobox"
                    aria-expanded={open && suggestions.length > 0}
                    aria-controls={listId}
                    aria-autocomplete="list"
                    aria-label="Card name"
                    placeholder="Type a card name..."
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
                    className="w-full px-3 py-2 rounded bg-parchment text-ink shadow-inner-parchment"
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
                className="px-5 py-2 rounded shadow-card font-title bg-brand text-midnight-light hover:bg-brand-dark disabled:opacity-50"
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

/* ------------------------------------------------------------------ */
/* One card                                                            */
/* ------------------------------------------------------------------ */

/**
 * A card's picture, name and count.
 *
 * Its own component so each tile owns its half-typed count. The grid is keyed
 * by card name, so a draft held here belongs to exactly one card and goes
 * away with it — held in the page instead, one shared draft would show up in
 * whichever tile rendered next.
 *
 * `img` is undefined while the picture is loading and null when there isn't
 * one, which read differently on the placeholder. Every card added here is a
 * real card, so a missing picture is a hiccup in the card data, not a typo.
 *
 * `unrecognised` marks a card from a collection made before names were
 * checked, whose name the server doesn't know. It stays until the user
 * removes it (see the notice above the grid) — never deleted unasked.
 */
function CardTile({
    card,
    img,
    unrecognised,
    onSetQty,
}: {
    card: CollectionCard;
    img: string | null | undefined;
    unrecognised: boolean;
    onSetQty: (qty: number) => void;
}) {
    // The count box's text while it doesn't hold a number — the box someone
    // just emptied to type a new count. Same arrangement as CardAutocomplete's
    // qtyDraft: bound straight to card.qty, an emptied box snapped back to the
    // old number and the next digit was appended to it ("6" became "69").
    const [draft, setDraft] = useState<string | null>(null);

    const step = (qty: number) => {
        setDraft(null);
        onSetQty(qty);
    };

    return (
        <li
            className={
                "bg-parchment rounded shadow-inner-parchment p-2 flex flex-col gap-2" +
                (unrecognised ? " ring-2 ring-red-700/60" : "")
            }
        >
            {img && !unrecognised ? (
                <Image
                    unoptimized
                    src={img}
                    alt={card.name}
                    width={244}
                    height={340}
                    className="w-full h-auto rounded-[4.5%] shadow-card"
                />
            ) : (
                // Same card shape while loading, or with no picture, so the
                // grid doesn't jump.
                <div
                    className={
                        "aspect-[244/340] rounded-[4.5%] bg-parchment-dark flex items-center justify-center p-2 text-center text-xs " +
                        (unrecognised ? "text-red-700" : "text-ink/60")
                    }
                >
                    {unrecognised ? "Not a card we recognise" : img === null ? "No picture available" : ""}
                </div>
            )}
            <p className="text-sm leading-tight break-words" title={card.name}>
                {card.name}
            </p>
            {/* Pinned to the bottom, so the counts line up across a
                row whatever length the names above them are. */}
            <div className="mt-auto flex items-center gap-1">
                {/* shrink-0 on both buttons: in a two-column phone grid the
                    count box's min-width was winning the squeeze and the
                    buttons collapsed to 19px — too small to tap. */}
                <button
                    type="button"
                    aria-label={`One fewer ${card.name}`}
                    onClick={() => step(card.qty - 1)}
                    className="w-8 h-8 shrink-0 rounded bg-parchment-dark hover:bg-brass/25 font-title"
                >
                    −
                </button>
                <input
                    type="number"
                    min={0}
                    max={9999}
                    value={draft ?? card.qty}
                    aria-label={`Copies of ${card.name}`}
                    onChange={(e) => {
                        const n = parseInt(e.target.value, 10);
                        // An emptied box is mid-edit, not "remove": show it
                        // empty and keep the real count until a number lands.
                        if (Number.isNaN(n)) {
                            setDraft(e.target.value);
                            return;
                        }
                        // 0 or less removes the card (the page's setQty does
                        // that), the same as stepping down with −.
                        step(n);
                    }}
                    // Left empty: show the count it still has.
                    onBlur={() => setDraft(null)}
                    className="w-full min-w-0 px-1 py-1 rounded bg-parchment-dark text-center text-sm shadow-inner-parchment"
                />
                <button
                    type="button"
                    aria-label={`One more ${card.name}`}
                    onClick={() => step(card.qty + 1)}
                    className="w-8 h-8 shrink-0 rounded bg-parchment-dark hover:bg-brass/25 font-title"
                >
                    +
                </button>
            </div>
        </li>
    );
}

/* ------------------------------------------------------------------ */
/* The page                                                            */
/* ------------------------------------------------------------------ */

/**
 * Build and edit a collection with pictures of what's in it.
 *
 * The Pack Planner's collection is a text box, which is fine for pasting an
 * export and hard to read or edit card by card — especially an Arena export,
 * which lists every printing of a card on its own line. Here every card is
 * one tile with its art and one count, whatever printings it came from.
 *
 * It stores the collection in the same place the Pack Planner reads it, as
 * merged "qty name" text, and saves to the same profile collections — so
 * nothing about the planner, its comparisons or saved collections changes.
 */
export default function CollectionEditor({ authEnabled }: { authEnabled: boolean }) {
    const [cards, setCards] = useState<CollectionCard[]>([]);
    const [arena, setArena] = useState(true);
    const [open, setOpen] = useState<SavedRef>(null);
    const [hydrated, setHydrated] = useState(false);

    const [paste, setPaste] = useState("");
    const [notice, setNotice] = useState<string | null>(null);
    // The add box's "No card called ..." line. One status channel with
    // `notice`: each clears the other, so only the latest outcome shows.
    const [addProblem, setAddProblem] = useState<AddProblem | null>(null);
    const showNotice = (message: string | null) => {
        setNotice(message);
        setAddProblem(null);
    };
    const onAddProblem = (problem: AddProblem | null) => {
        setAddProblem(problem);
        // Only a new problem retires the notice. Clearing the problem (the
        // user typing again, or a card going in) must not, or the
        // "Added ..." that a successful add just set would vanish with it.
        if (problem) setNotice(null);
    };
    const [filter, setFilter] = useState("");
    const [sort, setSort] = useState<Sort>("name");
    const [page, setPage] = useState(0);
    const [confirmClear, setConfirmClear] = useState(false);

    const [images, setImages] = useState<Record<string, string | null>>({});
    const requested = useRef(new Set<string>());

    // Pasted lines that aren't cards, with "did you mean" names to tap.
    const [rejected, setRejected] = useState<Rejected[]>([]);
    const [pasting, setPasting] = useState(false);
    // Names in the collection the server doesn't recognise. Only collections
    // made before names were checked can hold one; see checkCollection.
    const [unknown, setUnknown] = useState<ReadonlySet<string>>(() => new Set());
    // Which checkCollection call is the latest; see there.
    const checkGen = useRef(0);

    /**
     * Bring a collection that was already here — from localStorage, a saved
     * collection, or the Pack Planner's shared text — up to the same standard
     * as anything added now: names that resolve are put under their official
     * spelling (merging where two spellings were one card), and names that
     * don't are marked, not deleted. Spelling is the only thing changed
     * without asking; removing what isn't a card is the user's button.
     *
     * The verdicts are applied to the cards as they are when the answer
     * arrives, not as they were when it was asked, so a card added in the
     * meantime is neither lost nor second-guessed. If the server can't be
     * reached nothing changes; the collection is shown exactly as stored.
     */
    const checkCollection = (list: readonly CollectionCard[]) => {
        // Only the newest check may apply. The localStorage restore and a
        // ?collection= load both start one, moments apart, and either can
        // answer last: a restore's late answer would otherwise mark the
        // loaded collection's cards against the wrong list's verdicts. The
        // old list's unknowns go now, too — they described cards that may
        // no longer be here. Called with [] it does just that and checks
        // nothing: Replace and Start Over use it to retire a check in flight.
        const gen = ++checkGen.current;
        setUnknown(new Set());
        if (list.length === 0) return;
        resolveNames(
            list.map((c) => c.name),
            false
        )
            .then((verdicts) => {
                if (gen !== checkGen.current) return;
                setCards((prev) => applyVerdicts(prev, verdicts).cards);
                setUnknown(
                    new Set([...verdicts].filter(([, v]) => v.name === null).map(([name]) => name))
                );
            })
            .catch(() => {
                /* unchecked is still usable; it just isn't tidied */
            });
    };

    /* ---- persistence, shared with the Pack Planner ---- */

    // Restored after mount, as the planners do, so server and first client
    // render agree. See the same exception in SideboardPlanner.
    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        try {
            const text = localStorage.getItem(COLLECTION_KEY);
            if (text) {
                const restored = mergeCollection(text);
                setCards(restored);
                checkCollection(restored);
            }
            const mode = localStorage.getItem(MODE_KEY);
            if (mode) setArena(mode !== "paper");
            // Only if it still belongs to that text: the Pack Planner may
            // have replaced the collection since this page last saw it.
            setOpen(decodeOpen(localStorage.getItem(OPEN_KEY), text));
        } catch {
            /* unavailable or corrupt storage just means starting empty */
        }
        setHydrated(true);
    }, []);
    /* eslint-enable react-hooks/set-state-in-effect */

    const text = formatCollection(cards);

    useEffect(() => {
        if (!hydrated) return;
        try {
            if (text) localStorage.setItem(COLLECTION_KEY, text);
            else localStorage.removeItem(COLLECTION_KEY);
            localStorage.setItem(MODE_KEY, arena ? "arena" : "paper");
            // Rewritten with every change to the text, so the fingerprint
            // always describes what was just stored — an edit here is still
            // an edit of the open collection.
            const openValue = encodeOpen(open, text);
            if (openValue) localStorage.setItem(OPEN_KEY, openValue);
            else localStorage.removeItem(OPEN_KEY);
        } catch {
            /* the page still works; it just won't remember */
        }
    }, [hydrated, text, arena, open]);

    /* ---- editing ---- */

    const addCards = (incoming: CollectionCard[]) => setCards((prev) => mergeCards([...prev, ...incoming]));

    const setQty = (name: string, qty: number) =>
        setCards((prev) =>
            qty <= 0
                ? prev.filter((c) => c.name !== name)
                : prev.map((c) => (c.name === name ? { ...c, qty: Math.min(9999, qty) } : c))
        );

    /**
     * One card from the name box, already resolved to its official name by
     * AddCard — see there for how an unknown name is turned away.
     */
    const addOne = (name: string, qty: number) => {
        // When it lands on a card already here, say so under that card's
        // existing name — the one on the tile.
        const key = cardKey(name);
        const existing = cards.find((c) => cardKey(c.name) === key);
        addCards([{ name, qty }]);
        showNotice(
            existing
                ? `Added ${qty} ${existing.name} — you now have ${Math.min(9999, existing.qty + qty)}.`
                : `Added ${qty} ${name}.`
        );
    };

    /**
     * A pasted list or Arena export. Every line is resolved first; the cards
     * that exist go in under their official names, and the lines that don't
     * are left out and listed, each with the real names it might have meant.
     * If the names can't be checked at all, nothing is added and the paste
     * stays in the box to try again — adding unchecked names is exactly what
     * this replaced.
     */
    const addPasted = async (replace: boolean) => {
        if (pasting) return;
        // Rows, not lines: "Deck", "Sideboard", comments and blank lines
        // aren't cards, and counting them made "3 lines combined into 2"
        // out of a list with nothing to combine.
        const rows = parseCollectionRows(paste);
        if (rows.length === 0) {
            showNotice("Nothing to add — paste a list with one card per line.");
            setRejected([]);
            return;
        }

        setPasting(true);
        let verdicts: Map<string, NameVerdict>;
        try {
            verdicts = await resolveNames(
                rows.map((r) => r.name),
                true
            );
        } catch {
            showNotice("Couldn't check those card names, so nothing was added. Try again.");
            return;
        } finally {
            setPasting(false);
        }

        const good: CollectionCard[] = [];
        // Keyed by the line's own spelling, so a typo repeated on two lines
        // is listed once with both lines' copies.
        const bad = new Map<string, Rejected>();
        for (const r of rows) {
            const v = verdicts.get(r.name);
            if (v?.name) {
                good.push({ name: v.name, qty: r.qty });
                continue;
            }
            const have = bad.get(r.name);
            if (have) have.qty = Math.min(9999, have.qty + r.qty);
            else bad.set(r.name, { name: r.name, qty: r.qty, suggestions: v && v.name === null ? v.suggestions : [] });
        }
        setRejected([...bad.values()]);

        const incoming = mergeCards(good);
        if (incoming.length === 0) {
            // Nothing real to add — and for Replace, certainly no reason to
            // empty the collection. The paste stays in the box to be fixed.
            showNotice("Nothing added — none of those lines is a card we recognise.");
            return;
        }
        // A replaced collection is all checked names; a check still running
        // on the one it replaced must not land on it.
        if (replace) checkCollection([]);
        setCards((prev) => (replace ? incoming : mergeCards([...prev, ...incoming])));
        setPaste("");
        const copies = incoming.reduce((n, c) => n + c.qty, 0);
        showNotice(
            `${replace ? "Replaced with" : "Added"} ${copies} card${copies === 1 ? "" : "s"}` +
                (good.length > incoming.length
                    ? ` — ${good.length} lines combined into ${incoming.length} different card${incoming.length === 1 ? "" : "s"}.`
                    : ".")
        );
    };

    /** One tap on a rejected line's suggestion: add it, and the line is done. */
    const addSuggestion = (miss: Rejected, name: string) => {
        addOne(name, miss.qty);
        setRejected((prev) => prev.filter((r) => r !== miss));
    };

    const unknownHere = cards.filter((c) => unknown.has(c.name));
    const removeUnknown = () => {
        const n = unknownHere.length;
        setCards((prev) => prev.filter((c) => !unknown.has(c.name)));
        setUnknown(new Set());
        showNotice(`Removed ${n} unrecognised card${n === 1 ? "" : "s"}.`);
    };

    /* ---- what's on screen ---- */

    const needle = filter.trim().toLowerCase();
    const shown = cards
        .filter((c) => !needle || c.name.toLowerCase().includes(needle))
        .sort((a, b) => (sort === "qty" ? b.qty - a.qty || a.name.localeCompare(b.name) : a.name.localeCompare(b.name)));
    const pages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
    const current = Math.min(page, pages - 1);
    const pageCards = shown.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);
    const totalCopies = cards.reduce((n, c) => n + c.qty, 0);

    // Pictures only for the page on screen: a whole Arena collection is
    // thousands of cards, and the lookup takes at most 150 names at a time.
    const pageKey = pageCards.map((c) => c.name).join("\n");
    useEffect(() => {
        const names = pageKey
            ? pageKey
                  .split("\n")
                  .filter((n) => n.length <= MAX_IMAGE_NAME && !requested.current.has(n))
            : [];
        if (names.length === 0) return;
        for (const n of names) requested.current.add(n);
        (async () => {
            try {
                const res = await fetch("/api/card-images", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ names }),
                });
                if (!res.ok) throw new Error();
                const data = await res.json();
                setImages((prev) => ({ ...prev, ...(data.images ?? {}) }));
            } catch {
                // Let the next visit to this page try again.
                for (const n of names) requested.current.delete(n);
            }
        })();
    }, [pageKey]);

    /**
     * Turn the page and bring the top of the grid back into view. The pager
     * sits under the last row, so without this the next page opened with its
     * last row on screen and its first somewhere above.
     */
    const gridRef = useRef<HTMLElement>(null);
    const goToPage = (next: number) => {
        setPage(next);
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        gridRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
    };

    const loadSaved = (loadedText: string, loaded: NonNullable<SavedRef>) => {
        const loadedCards = mergeCollection(loadedText);
        setCards(loadedCards);
        setRejected([]);
        checkCollection(loadedCards);
        setArena(loaded.arena);
        setOpen(loaded);
        setPage(0);
        setFilter("");
        showNotice(`Opened ${loaded.arena ? "Arena" : "Paper"} collection "${loaded.name}".`);
    };

    return (
        <div className="space-y-8">
            <Suspense fallback={null}>
                <SavedCollectionLoader onLoad={loadSaved} />
            </Suspense>

            {/* ---- summary and saving ---- */}
            <section className="bg-parchment-dark shadow-card rounded-lg p-4 sm:p-6 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                        <p className="text-xs font-semibold uppercase tracking-wider text-ink/55">
                            {open ? "Editing" : "Your collection"}
                        </p>
                        <h2 className="text-2xl font-title break-words">
                            {open ? open.name : "Unsaved collection"}
                        </h2>
                        <p className="text-sm text-ink/70">
                            {cards.length.toLocaleString()} different card{cards.length === 1 ? "" : "s"} ·{" "}
                            {totalCopies.toLocaleString()} total
                        </p>
                    </div>

                    <div className="flex gap-2" role="group" aria-label="Collection type">
                        {[
                            { label: "Arena", value: true },
                            { label: "Paper", value: false },
                        ].map((opt) => (
                            <button
                                key={opt.label}
                                type="button"
                                aria-pressed={arena === opt.value}
                                onClick={() => setArena(opt.value)}
                                className={
                                    "px-4 py-2 rounded font-title text-sm " +
                                    (arena === opt.value
                                        ? "bg-brass text-brass-ink"
                                        : "bg-parchment text-ink/70 hover:bg-parchment/70")
                                }
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 border-t border-brass/25 pt-4">
                    {authEnabled && (
                        <PackPlannerSave
                            kind="collection"
                            decks={[]}
                            collection={text}
                            arenaMode={arena}
                            open={open}
                            returnTo="/collection"
                            onSaved={(saved) => {
                                setOpen({ id: saved.id, name: saved.name, arena: saved.arena });
                                setArena(saved.arena);
                            }}
                        />
                    )}
                    <Link
                        href="/planner"
                        className="px-5 py-2 rounded shadow-card font-title bg-parchment text-ink hover:bg-parchment/70"
                    >
                        Compare in Pack Planner
                    </Link>
                    <button
                        type="button"
                        onClick={() => (cards.length === 0 ? null : setConfirmClear(true))}
                        disabled={cards.length === 0}
                        className="sm:ml-auto px-5 py-2 rounded shadow-card font-title bg-red-700 text-white hover:bg-red-800 disabled:opacity-40"
                    >
                        Start Over
                    </button>
                </div>
                <p className="text-xs text-ink/55">
                    This is the same collection the Pack Planner compares your decks against — change it
                    here and the planner sees it.
                </p>
            </section>

            {/* ---- adding ---- */}
            <section className="bg-parchment-dark shadow-card rounded-lg p-4 sm:p-6 space-y-4">
                <h2 className="text-2xl font-title flex items-center">
                    Add Cards
                    <HelpTip text="Type a card name and pick it from the list, or paste a whole list or an Arena export below. Copies of the same card are always added together, whichever set or printing they came from." />
                </h2>

                <AddCard onAdd={addOne} problem={addProblem} onProblem={onAddProblem} />

                <details className="group">
                    <summary className="cursor-pointer text-sm text-brand hover:text-brand-dark underline underline-offset-2">
                        Paste a list or an Arena export
                    </summary>
                    <div className="pt-3 space-y-3">
                        <textarea
                            value={paste}
                            onChange={(e) => setPaste(e.target.value)}
                            rows={8}
                            placeholder={"4 Lightning Bolt\n2 Opt (XLN) 65\n..."}
                            className="w-full px-3 py-2 rounded bg-parchment text-ink text-sm shadow-inner-parchment font-mono"
                        />
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={() => void addPasted(false)}
                                disabled={pasting}
                                className="px-5 py-2 rounded shadow-card font-title bg-brand text-midnight-light hover:bg-brand-dark disabled:opacity-50"
                            >
                                Add to collection
                            </button>
                            <button
                                type="button"
                                onClick={() => void addPasted(true)}
                                disabled={pasting}
                                className="px-5 py-2 rounded shadow-card font-title bg-parchment text-ink hover:bg-parchment/70 disabled:opacity-50"
                            >
                                Replace collection
                            </button>
                            {pasting && <span className="text-sm text-ink/70">Checking card names...</span>}
                        </div>
                    </div>
                </details>

                {notice && (
                    // Can quote a saved collection's name, which is the
                    // user's own text — see the add box's problem line.
                    <p className="text-sm text-ink/80 [overflow-wrap:anywhere]" role="status">
                        {notice}
                    </p>
                )}

                {rejected.length > 0 && (
                    <div className="text-sm rounded border border-red-700/30 bg-red-700/5 px-3 py-2 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                            <p className="font-semibold text-red-800">
                                Couldn&apos;t find {rejected.length} line{rejected.length === 1 ? "" : "s"}, so{" "}
                                {rejected.length === 1 ? "it wasn't" : "they weren't"} added:
                            </p>
                            <button
                                type="button"
                                onClick={() => setRejected([])}
                                className="shrink-0 px-2 py-1 rounded text-ink/70 hover:bg-parchment"
                            >
                                Dismiss
                            </button>
                        </div>
                        <ul className="space-y-1.5">
                            {rejected.slice(0, MAX_REJECTED_SHOWN).map((miss) => (
                                <li key={miss.name} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                    <span className="break-all">&ldquo;{miss.name}&rdquo;</span>
                                    {miss.suggestions.length > 0 && (
                                        <>
                                            <span className="text-ink/70">did you mean</span>
                                            {miss.suggestions.map((s) => (
                                                <button
                                                    key={s}
                                                    type="button"
                                                    onClick={() => addSuggestion(miss, s)}
                                                    aria-label={`Add ${miss.qty} ${s} instead of ${miss.name}`}
                                                    className="px-2 py-0.5 rounded bg-parchment text-ink shadow-inner-parchment hover:bg-brass/25"
                                                >
                                                    {s}
                                                </button>
                                            ))}
                                        </>
                                    )}
                                </li>
                            ))}
                        </ul>
                        {rejected.length > MAX_REJECTED_SHOWN && (
                            <p className="text-ink/70">
                                ...and {rejected.length - MAX_REJECTED_SHOWN} more.
                            </p>
                        )}
                    </div>
                )}
            </section>

            {/* ---- the cards ---- */}
            <section
                ref={gridRef}
                className="scroll-mt-4 bg-parchment-dark shadow-card rounded-lg p-4 sm:p-6 space-y-4"
            >
                {unknownHere.length > 0 && (
                    <div className="flex flex-wrap items-center gap-3 text-sm rounded border border-red-700/30 bg-red-700/5 px-3 py-2">
                        {/* Quotes names from an old collection, which can be
                            any text at all — a long unbroken one widened the
                            page to 590px on a phone without overflow-wrap. */}
                        <p className="flex-1 min-w-[12rem] [overflow-wrap:anywhere]">
                            {unknownHere.length} card{unknownHere.length === 1 ? " in this collection isn't" : "s in this collection aren't"}{" "}
                            recognised:{" "}
                            {unknownHere
                                .slice(0, 5)
                                .map((c) => `“${c.name}”`)
                                .join(", ")}
                            {unknownHere.length > 5 ? `, and ${unknownHere.length - 5} more` : ""}.
                        </p>
                        <button
                            type="button"
                            onClick={removeUnknown}
                            className="px-4 py-2 rounded font-title text-sm border border-red-700/40 text-red-700 hover:bg-red-700/10"
                        >
                            Remove {unknownHere.length === 1 ? "it" : "them"}
                        </button>
                    </div>
                )}

                <div className="flex flex-wrap items-end gap-3">
                    <label className="flex-1 min-w-[12rem]">
                        <span className="text-sm text-ink/70">Find in collection</span>
                        <input
                            type="search"
                            value={filter}
                            onChange={(e) => {
                                setFilter(e.target.value);
                                setPage(0);
                            }}
                            placeholder="Card name"
                            className="mt-1 w-full px-3 py-2 rounded bg-parchment text-ink shadow-inner-parchment"
                        />
                    </label>
                    <label>
                        <span className="text-sm text-ink/70">Sort</span>
                        <select
                            value={sort}
                            onChange={(e) => {
                                setSort(e.target.value as Sort);
                                setPage(0);
                            }}
                            className="mt-1 block px-3 py-2 rounded bg-parchment text-ink shadow-inner-parchment"
                        >
                            <option value="name">Name A–Z</option>
                            <option value="qty">Most copies</option>
                        </select>
                    </label>
                </div>

                {cards.length === 0 ? (
                    <p className="text-ink/70 py-8 text-center">
                        {hydrated ? "No cards yet. Add some above, or paste a list." : "Loading..."}
                    </p>
                ) : shown.length === 0 ? (
                    <p className="text-ink/70 py-8 text-center">Nothing in your collection matches that.</p>
                ) : (
                    <>
                        <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                            {pageCards.map((c) => (
                                <CardTile
                                    key={c.name}
                                    card={c}
                                    // A name too long to be a card was never
                                    // looked up (see MAX_IMAGE_NAME), so it
                                    // reads as "no picture", not as loading.
                                    img={c.name.length > MAX_IMAGE_NAME ? null : images[c.name]}
                                    unrecognised={unknown.has(c.name)}
                                    onSetQty={(qty) => setQty(c.name, qty)}
                                />
                            ))}
                        </ul>

                        {pages > 1 && (
                            <div className="flex items-center justify-center gap-3">
                                <button
                                    type="button"
                                    onClick={() => goToPage(Math.max(0, current - 1))}
                                    disabled={current === 0}
                                    className="px-4 py-2 rounded font-title bg-parchment hover:bg-parchment/70 disabled:opacity-40"
                                >
                                    ‹ Previous
                                </button>
                                <span className="text-sm text-ink/70">
                                    Page {current + 1} of {pages}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => goToPage(Math.min(pages - 1, current + 1))}
                                    disabled={current >= pages - 1}
                                    className="px-4 py-2 rounded font-title bg-parchment hover:bg-parchment/70 disabled:opacity-40"
                                >
                                    Next ›
                                </button>
                            </div>
                        )}
                    </>
                )}
            </section>

            {/* ---- start over, with a chance to save first ---- */}
            {confirmClear && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="clear-collection-title"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setConfirmClear(false);
                    }}
                >
                    <div className="bg-parchment rounded-lg shadow-card p-6 max-w-md w-full space-y-4 text-ink">
                        <h3 id="clear-collection-title" className="font-title text-2xl text-red-800">
                            Start over?
                        </h3>
                        <p className="leading-relaxed">
                            This empties the collection here and in the Pack Planner.
                        </p>
                        <p className="text-sm font-semibold text-red-800 bg-red-700/10 border border-red-700/30 rounded px-3 py-2">
                            There&apos;s no undo. Anything you haven&apos;t saved is gone.
                        </p>
                        <div className="flex flex-wrap gap-2 justify-end pt-1">
                            <button
                                type="button"
                                onClick={() => setConfirmClear(false)}
                                className="px-4 py-2 rounded text-sm text-ink/70 hover:bg-parchment-dark"
                            >
                                Keep it
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setCards([]);
                                    checkCollection([]);
                                    setOpen(null);
                                    setPage(0);
                                    showNotice(null);
                                    setRejected([]);
                                    setConfirmClear(false);
                                }}
                                className="px-4 py-2 rounded font-title text-sm border border-red-700/40 text-red-700 hover:bg-red-700/10"
                            >
                                Clear without saving
                            </button>
                            {authEnabled && (
                                <PackPlannerSave
                                    kind="collection"
                                    decks={[]}
                                    collection={text}
                                    arenaMode={arena}
                                    open={open}
                                    label="Save and clear"
                                    allowSaveAsNew={false}
                                    variant="primary"
                                    returnTo="/collection"
                                    onSaved={() => {
                                        setCards([]);
                                        checkCollection([]);
                                        setOpen(null);
                                        setPage(0);
                                        showNotice(null);
                                        setRejected([]);
                                        setConfirmClear(false);
                                    }}
                                />
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
