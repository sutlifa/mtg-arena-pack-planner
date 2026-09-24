"use client";

import { Suspense, useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import HelpTip from "./HelpTip";
import PackPlannerSave, { type SavedRef } from "./PackPlannerSave";
import {
    cardKey,
    formatCollection,
    mergeCards,
    mergeCollection,
    parseCollectionRows,
    type CollectionCard,
} from "@/lib/collectionText";
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

type Sort = "name" | "qty";

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
 * `onAdd` answers whether the card went in, so a rejected name (an empty
 * box) stays in the box to be fixed rather than vanishing.
 */
function AddCard({ onAdd }: { onAdd: (name: string, qty: number) => boolean }) {
    const [query, setQuery] = useState("");
    const [qty, setQty] = useState(1);
    // Suggestions are tied to the text they answer, so a slow response for
    // "lig" can't replace the list for "lightning".
    const [found, setFound] = useState<{ q: string; names: string[] }>({ q: "", names: [] });
    const [open, setOpen] = useState(false);
    const [highlight, setHighlight] = useState(0);
    const listId = useId();

    const trimmed = query.trim();
    useEffect(() => {
        if (trimmed.length < 2) return;
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

    const add = (name: string) => {
        if (!onAdd(name, qty)) return;
        setQuery("");
        setQty(1);
        setOpen(false);
        setHighlight(0);
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
                            add(open && suggestions[highlight] ? suggestions[highlight] : query);
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
                onClick={() => add(query)}
                className="px-5 py-2 rounded shadow-card font-title bg-brand text-midnight-light hover:bg-brand-dark"
            >
                Add
            </button>
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
 * one, which read differently on the placeholder.
 */
function CardTile({
    card,
    img,
    onSetQty,
}: {
    card: CollectionCard;
    img: string | null | undefined;
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
        <li className="bg-parchment rounded shadow-inner-parchment p-2 flex flex-col gap-2">
            {img ? (
                <Image
                    unoptimized
                    src={img}
                    alt={card.name}
                    width={244}
                    height={340}
                    className="w-full h-auto rounded-[4.5%] shadow-card"
                />
            ) : (
                // Same card shape while loading, or for a name the
                // card data doesn't know, so the grid doesn't jump.
                <div className="aspect-[244/340] rounded-[4.5%] bg-parchment-dark flex items-center justify-center p-2 text-center text-xs text-ink/60">
                    {img === null ? "No picture for this name" : ""}
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
    const [filter, setFilter] = useState("");
    const [sort, setSort] = useState<Sort>("name");
    const [page, setPage] = useState(0);
    const [confirmClear, setConfirmClear] = useState(false);

    const [images, setImages] = useState<Record<string, string | null>>({});
    const requested = useRef(new Set<string>());

    /* ---- persistence, shared with the Pack Planner ---- */

    // Restored after mount, as the planners do, so server and first client
    // render agree. See the same exception in SideboardPlanner.
    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        try {
            const text = localStorage.getItem(COLLECTION_KEY);
            if (text) setCards(mergeCollection(text));
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

    /** One card from the name box. False when there's no name to add. */
    const addOne = (rawName: string, qty: number): boolean => {
        // Internal runs of spaces collapsed too, so "Lightning   Bolt" is
        // stored and announced the way it will be shown.
        const name = rawName.replace(/\s+/g, " ").trim();
        const key = cardKey(name);
        if (!key) {
            setNotice("Type a card name first.");
            return false;
        }
        // When it lands on a card already here, say so under that card's
        // existing name — the one on the tile — not the spelling just typed,
        // which mergeCards drops.
        const existing = cards.find((c) => cardKey(c.name) === key);
        addCards([{ name, qty }]);
        setNotice(
            existing
                ? `Added ${qty} ${existing.name} — you now have ${Math.min(9999, existing.qty + qty)}.`
                : `Added ${qty} ${name}.`
        );
        return true;
    };

    const addPasted = (replace: boolean) => {
        // Rows, not lines: "Deck", "Sideboard", comments and blank lines
        // aren't cards, and counting them made "3 lines combined into 2"
        // out of a list with nothing to combine.
        const rows = parseCollectionRows(paste);
        const incoming = mergeCards(rows);
        if (incoming.length === 0) {
            setNotice("Nothing to add — paste a list with one card per line.");
            return;
        }
        const lines = rows.length;
        setCards((prev) => (replace ? incoming : mergeCards([...prev, ...incoming])));
        setPaste("");
        const copies = incoming.reduce((n, c) => n + c.qty, 0);
        setNotice(
            `${replace ? "Replaced with" : "Added"} ${copies} card${copies === 1 ? "" : "s"}` +
                (lines > incoming.length
                    ? ` — ${lines} lines combined into ${incoming.length} different card${incoming.length === 1 ? "" : "s"}.`
                    : ".")
        );
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
        setCards(mergeCollection(loadedText));
        setArena(loaded.arena);
        setOpen(loaded);
        setPage(0);
        setFilter("");
        setNotice(`Opened ${loaded.arena ? "Arena" : "Paper"} collection "${loaded.name}".`);
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

                <AddCard onAdd={addOne} />

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
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={() => addPasted(false)}
                                className="px-5 py-2 rounded shadow-card font-title bg-brand text-midnight-light hover:bg-brand-dark"
                            >
                                Add to collection
                            </button>
                            <button
                                type="button"
                                onClick={() => addPasted(true)}
                                className="px-5 py-2 rounded shadow-card font-title bg-parchment text-ink hover:bg-parchment/70"
                            >
                                Replace collection
                            </button>
                        </div>
                    </div>
                </details>

                {notice && (
                    <p className="text-sm text-ink/80" role="status">
                        {notice}
                    </p>
                )}
            </section>

            {/* ---- the cards ---- */}
            <section
                ref={gridRef}
                className="scroll-mt-4 bg-parchment-dark shadow-card rounded-lg p-4 sm:p-6 space-y-4"
            >
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
                                    setOpen(null);
                                    setPage(0);
                                    setNotice(null);
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
                                        setOpen(null);
                                        setPage(0);
                                        setNotice(null);
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
