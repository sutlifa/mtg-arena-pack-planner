"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import PackPlannerSave, { type SavedRef } from "./PackPlannerSave";

interface CollectionSummary {
    id: number;
    name: string;
    arena_mode: boolean;
    cards: number;
    updated_at: string;
}

interface AnalysisSummary {
    id: number;
    name: string;
    arena_mode: boolean;
    decks: number;
    updated_at: string;
}

/** A saved collection as GET /api/collections/[id] returns it. */
export interface OpenedCollection {
    id: number;
    name: string;
    raw_text: string;
    arena_mode: boolean;
}

/** A saved comparison as GET /api/analyses/[id] returns it. */
export interface OpenedAnalysis {
    id: number;
    name: string;
    decklists: string[];
    collection: string;
    arena_mode: boolean;
}

/**
 * One mode's worth of saved collections.
 *
 * Defined at module scope rather than inside the component: a component
 * created during render is a brand-new type on every render, so React
 * unmounts and remounts the whole subtree each time, throwing away its state
 * and DOM.
 */
function CollectionGroup({
    title,
    items,
    onPick,
}: {
    title: string;
    items: CollectionSummary[];
    onPick: (id: number) => void;
}) {
    return (
        <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink/60 mb-1">
                {title} ({items.length})
            </p>
            {items.length === 0 ? (
                <p className="text-sm text-ink/50 px-2 py-1">None saved.</p>
            ) : (
                <ul className="space-y-1">
                    {items.map((c) => (
                        <li key={c.id}>
                            <button
                                type="button"
                                onClick={() => onPick(c.id)}
                                className="w-full text-left text-sm px-2 py-1 rounded hover:bg-brass/20 [overflow-wrap:anywhere]"
                            >
                                {c.name}{" "}
                                <span className="text-ink/50">
                                    ({c.cards} line{c.cards === 1 ? "" : "s"})
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

/**
 * Save and reopen the Pack Planner's inputs against a signed-in profile.
 *
 * Only ever rendered when auth is configured (see lib/authConfig), because
 * useSession throws without a SessionProvider and the provider is not mounted
 * on deployments without Google credentials.
 *
 * There are two kinds of save, and the panel says so in one line, because
 * the difference was the confusing part: a COLLECTION is just your cards; a
 * COMPARISON is the decklists, the collection and the Arena/Paper mode
 * together, and opening one re-runs it. The open list labels each column
 * with what opening it will replace.
 *
 * Collections are filed as Arena or Paper because they are genuinely
 * different lists, and the mode is picked explicitly when saving rather than
 * silently inherited from the toggle.
 *
 * This panel only fetches. What an open *does* — which state it replaces,
 * whether it runs, and the summary that says so — belongs to the planner
 * (openComparison / openSavedCollection), because the same opens also arrive
 * from the profile page's links and from the Decks page, and one place has
 * to decide them all. Which rows are open is owned up there too, because
 * Start Over has to clear them along with everything else.
 */
export default function PackPlannerSaves({
    decks,
    collection,
    arenaMode,
    openCollection,
    openAnalysis,
    ready,
    onOpenCollection,
    onOpenComparison,
    onOpenChange,
}: {
    decks: string[];
    collection: string;
    arenaMode: boolean;
    openCollection: SavedRef;
    openAnalysis: SavedRef;
    /** False until the planner has restored its stored collection. */
    ready: boolean;
    onOpenCollection: (c: OpenedCollection) => void;
    onOpenComparison: (a: OpenedAnalysis) => void;
    onOpenChange: (next: { collection?: SavedRef; analysis?: SavedRef }) => void;
}) {
    const { data: session } = useSession();
    const searchParams = useSearchParams();

    const [collections, setCollections] = useState<CollectionSummary[]>([]);
    const [analyses, setAnalyses] = useState<AnalysisSummary[]>([]);
    const [message, setMessage] = useState<string | null>(null);
    const [open, setOpen] = useState(false);

    const signedIn = Boolean(session?.user);

    // The parent recreates these every render. Holding them in refs keeps the
    // URL-param effect from re-running (and re-opening the saved item) on
    // every keystroke, without lying to the dependency linter.
    const onOpenCollectionRef = useRef(onOpenCollection);
    const onOpenComparisonRef = useRef(onOpenComparison);
    useEffect(() => {
        onOpenCollectionRef.current = onOpenCollection;
        onOpenComparisonRef.current = onOpenComparison;
    }, [onOpenCollection, onOpenComparison]);

    const fetchLists = useCallback(async () => {
        const [c, a] = await Promise.all([
            fetch("/api/collections").then((r) => (r.ok ? r.json() : { collections: [] })),
            fetch("/api/analyses").then((r) => (r.ok ? r.json() : { analyses: [] })),
        ]);
        return { collections: c.collections ?? [], analyses: a.analyses ?? [] };
    }, []);

    const refresh = useCallback(async () => {
        try {
            const next = await fetchLists();
            setCollections(next.collections);
            setAnalyses(next.analyses);
        } catch {
            /* listing is a convenience; failing to load it shouldn't break the page */
        }
    }, [fetchLists]);

    useEffect(() => {
        if (!signedIn) return;

        // Guarded so a response that arrives after unmount (or after signing
        // out) can't write into a component that no longer wants it.
        let cancelled = false;

        (async () => {
            try {
                const next = await fetchLists();
                if (cancelled) return;
                setCollections(next.collections);
                setAnalyses(next.analyses);
            } catch {
                /* see above */
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [signedIn, fetchLists]);

    const loadCollection = async (id: number) => {
        try {
            const res = await fetch(`/api/collections/${id}`);
            if (!res.ok) {
                setMessage("Could not open that collection.");
                return;
            }
            const { collection: loaded } = await res.json();
            setMessage(null);
            onOpenCollection(loaded);
            setOpen(false);
        } catch {
            setMessage("Could not open that collection.");
        }
    };

    const loadAnalysis = async (id: number) => {
        try {
            const res = await fetch(`/api/analyses/${id}`);
            if (!res.ok) {
                setMessage("Could not open that comparison.");
                return;
            }
            const { analysis } = await res.json();
            setMessage(null);
            onOpenComparison(analysis);
            setOpen(false);
        } catch {
            setMessage("Could not open that comparison.");
        }
    };

    // Opening a saved item from the profile page arrives as ?collection= or
    // ?analysis=.
    useEffect(() => {
        if (!signedIn || !ready) return;

        const collectionId = searchParams.get("collection");
        const analysisId = searchParams.get("analysis");
        if (!collectionId && !analysisId) return;

        let cancelled = false;

        (async () => {
            const url = collectionId
                ? `/api/collections/${encodeURIComponent(collectionId)}`
                : `/api/analyses/${encodeURIComponent(analysisId ?? "")}`;
            try {
                const res = await fetch(url);
                if (cancelled) return;
                if (!res.ok) {
                    setMessage(
                        res.status === 404
                            ? `That ${collectionId ? "collection" : "comparison"} no longer exists.`
                            : `Could not open that ${collectionId ? "collection" : "comparison"}.`
                    );
                    return;
                }
                const data = await res.json();
                if (cancelled) return;

                if (collectionId && data.collection) {
                    onOpenCollectionRef.current(data.collection);
                } else if (data.analysis) {
                    onOpenComparisonRef.current(data.analysis);
                }

                // Drop the parameter once it has loaded, as the Collection
                // page does: left in the address, a reload or Back to this
                // page fetched the saved copy again over everything edited
                // since. Native replaceState, which Next keeps
                // useSearchParams in step with; re-running this effect with
                // no parameter is then a no-op.
                const here = new URL(window.location.href);
                here.searchParams.delete("collection");
                here.searchParams.delete("analysis");
                window.history.replaceState(null, "", here.pathname + here.search + here.hash);
            } catch {
                if (!cancelled) setMessage("Could not open that saved item.");
            }
        })();

        // A cancelled first run (React StrictMode in development) is thrown
        // away before it opens anything, so the open — and the analysis it
        // starts — happens once.
        return () => {
            cancelled = true;
        };
    }, [signedIn, ready, searchParams]);

    if (!signedIn) {
        return (
            <p className="text-sm text-ink/60 text-center">
                <a
                    href="/signin?callbackUrl=%2Fplanner"
                    className="text-brand underline underline-offset-2 hover:text-brand-dark"
                >
                    Sign in
                </a>{" "}
                to save your collection, or a whole comparison — decklists, collection and mode —
                to reopen later.
            </p>
        );
    }

    const arenaCollections = collections.filter((c) => c.arena_mode);
    const paperCollections = collections.filter((c) => !c.arena_mode);

    const saved = (next: { id: number; name: string; arena: boolean; kind: "collection" | "comparison" }) => {
        onOpenChange(
            next.kind === "collection"
                ? { collection: { id: next.id, name: next.name, arena: next.arena } }
                : { analysis: { id: next.id, name: next.name, arena: next.arena } }
        );
        refresh();
    };

    return (
        <section className="bg-parchment-dark shadow-card rounded-lg p-4 sm:p-5 space-y-3">
            <div className="space-y-1">
                <h2 className="text-xl font-title">Save or open</h2>
                <p className="text-sm text-ink/70 leading-relaxed">
                    A <strong>collection</strong> is just your cards. A <strong>comparison</strong> is
                    your decklists, collection and Arena/Paper mode together — opening one puts all
                    three back and runs it again.
                </p>
            </div>

            <div className="flex flex-wrap gap-3">
                <PackPlannerSave
                    kind="collection"
                    decks={decks}
                    collection={collection}
                    arenaMode={arenaMode}
                    open={openCollection}
                    onSaved={saved}
                />
                <PackPlannerSave
                    kind="comparison"
                    decks={decks}
                    collection={collection}
                    arenaMode={arenaMode}
                    open={openAnalysis}
                    onSaved={saved}
                />
                {(collections.length > 0 || analyses.length > 0) && (
                    <button
                        type="button"
                        onClick={() => setOpen((v) => !v)}
                        aria-expanded={open}
                        className="px-5 py-2 rounded shadow-card font-title bg-brand text-midnight-light hover:bg-brand-dark"
                    >
                        {open ? "Hide saved" : "Open saved..."}
                    </button>
                )}
            </div>

            {/* What Save will overwrite, spelled out. Without it the buttons
                change meaning invisibly depending on what was opened. */}
            {(openCollection || openAnalysis) && (
                <p className="text-sm text-ink/70 [overflow-wrap:anywhere]">
                    {openCollection && (
                        <>
                            Save Collection updates {openCollection.arena ? "Arena" : "Paper"} collection
                            &quot;{openCollection.name}&quot;.
                        </>
                    )}
                    {openCollection && openAnalysis && " "}
                    {openAnalysis && (
                        <>Save Comparison updates &quot;{openAnalysis.name}&quot;.</>
                    )}
                </p>
            )}

            {message && (
                <p className="text-sm text-red-700" role="status">
                    {message}
                </p>
            )}

            {open && (
                <div className="grid sm:grid-cols-2 gap-4">
                    <div className="bg-parchment rounded shadow-inner-parchment p-3 sm:p-4 space-y-3">
                        <div>
                            <p className="font-title text-lg">Collections</p>
                            <p className="text-xs text-ink/60">
                                Replaces the collection box and switches to its mode. Your decklists
                                stay.
                            </p>
                        </div>
                        <CollectionGroup title="Arena" items={arenaCollections} onPick={loadCollection} />
                        <CollectionGroup title="Paper" items={paperCollections} onPick={loadCollection} />
                    </div>

                    <div className="bg-parchment rounded shadow-inner-parchment p-3 sm:p-4 space-y-2">
                        <div>
                            <p className="font-title text-lg">Comparisons</p>
                            <p className="text-xs text-ink/60">
                                Replaces the decklists, the collection (if one was saved with it) and
                                the mode, then runs.
                            </p>
                        </div>
                        {analyses.length === 0 ? (
                            <p className="text-sm text-ink/50">None saved.</p>
                        ) : (
                            <ul className="space-y-1">
                                {analyses.map((a) => (
                                    <li key={a.id}>
                                        <button
                                            type="button"
                                            onClick={() => loadAnalysis(a.id)}
                                            className="w-full text-left text-sm px-2 py-1 rounded hover:bg-brass/20 [overflow-wrap:anywhere]"
                                        >
                                            {a.name}{" "}
                                            <span className="text-ink/50">
                                                ({a.decks} deck{a.decks === 1 ? "" : "s"},{" "}
                                                {a.arena_mode ? "Arena" : "Paper"})
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>
            )}
        </section>
    );
}
