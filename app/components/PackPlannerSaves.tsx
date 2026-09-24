"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import PackPlannerSave, { type SavedRef } from "./PackPlannerSave";
import { tidyCollection } from "@/lib/collectionText";

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
                                className="w-full text-left text-sm px-2 py-1 rounded hover:bg-brass/20"
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
 * Save and reload the Pack Planner's inputs against a signed-in profile.
 *
 * Only ever rendered when auth is configured (see lib/authConfig), because
 * useSession throws without a SessionProvider and the provider is not mounted
 * on deployments without Google credentials.
 *
 * Collections are filed as Arena or Paper because they are genuinely
 * different lists — an Arena export and a paper binder share almost nothing —
 * and the whole point is keeping both and choosing which to compare against.
 * The mode is picked explicitly when saving rather than silently inherited
 * from whatever the toggle happened to be on, and loading a collection puts
 * the planner into that collection's mode so the comparison that follows is
 * the one the user meant.
 *
 * Only inputs are saved, never the computed breakdown: prices, Arena
 * availability and set legality all move underneath us, so a stored result
 * would begin drifting the moment it was written.
 *
 * Which saved rows are *open* is owned by the parent, not by this panel. The
 * Start Over dialog lives up there and has to clear them along with the
 * decks and the collection — a reset that left an id behind would point the
 * next Save at the work you just abandoned.
 */
export default function PackPlannerSaves({
    decks,
    collection,
    arenaMode,
    openCollection,
    openAnalysis,
    onLoad,
    onOpenChange,
}: {
    decks: string[];
    collection: string;
    arenaMode: boolean;
    openCollection: SavedRef;
    openAnalysis: SavedRef;
    onLoad: (next: { decks?: string[]; collection?: string; arenaMode?: boolean }) => void;
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
    // URL-param effect from re-running (and re-loading the saved item) on
    // every keystroke, without lying to the dependency linter.
    const onLoadRef = useRef(onLoad);
    const onOpenChangeRef = useRef(onOpenChange);
    useEffect(() => {
        onLoadRef.current = onLoad;
        onOpenChangeRef.current = onOpenChange;
    }, [onLoad, onOpenChange]);

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

    const loadCollection = useCallback(
        async (id: number | string) => {
            const res = await fetch(`/api/collections/${id}`);
            if (!res.ok) {
                setMessage("Could not load that collection.");
                return;
            }
            const { collection: loaded } = await res.json();
            // Switch the planner into the mode the collection was saved as —
            // comparing an Arena collection in Paper Mode silently gives the
            // wrong answer.
            // Loaded with each card on one line, copies of every printing
            // added together — the analysis counts them that way anyway, and
            // an Arena export's one-line-per-printing is hard to read.
            onLoad({ collection: tidyCollection(loaded.raw_text), arenaMode: loaded.arena_mode });
            // Now the open collection, so Save updates it instead of asking
            // for its name again. The open comparison is left alone: its
            // decklists are still on screen, so it is still the comparison
            // being edited.
            onOpenChange({
                collection: { id: loaded.id, name: loaded.name, arena: loaded.arena_mode },
            });
            setMessage(
                `Loaded ${loaded.arena_mode ? "Arena" : "Paper"} collection "${loaded.name}".`
            );
            setOpen(false);
        },
        [onLoad, onOpenChange]
    );

    const loadAnalysis = useCallback(
        async (id: number | string) => {
            const res = await fetch(`/api/analyses/${id}`);
            if (!res.ok) {
                setMessage("Could not load that comparison.");
                return;
            }
            const { analysis } = await res.json();
            onLoad({
                decks: analysis.decklists?.length ? analysis.decklists : [""],
                collection: tidyCollection(analysis.collection ?? ""),
                arenaMode: analysis.arena_mode,
            });
            // A comparison brings its own collection text with it, which is
            // not a saved collection row — so any open one stops applying.
            onOpenChange({
                analysis: { id: analysis.id, name: analysis.name, arena: analysis.arena_mode },
                collection: null,
            });
            setMessage(`Loaded comparison "${analysis.name}".`);
            setOpen(false);
        },
        [onLoad, onOpenChange]
    );

    // Opening a saved item from the profile page arrives as ?collection= or
    // ?analysis=.
    useEffect(() => {
        if (!signedIn) return;

        const collectionId = searchParams.get("collection");
        const analysisId = searchParams.get("analysis");
        if (!collectionId && !analysisId) return;

        let cancelled = false;

        (async () => {
            const url = collectionId
                ? `/api/collections/${collectionId}`
                : `/api/analyses/${analysisId}`;
            try {
                const res = await fetch(url);
                if (!res.ok || cancelled) return;
                const data = await res.json();
                if (cancelled) return;

                if (collectionId && data.collection) {
                    // Merged on load, like the Load Saved list below.
                    onLoadRef.current({
                        collection: tidyCollection(data.collection.raw_text ?? ""),
                        arenaMode: data.collection.arena_mode,
                    });
                    onOpenChangeRef.current({
                        collection: {
                            id: data.collection.id,
                            name: data.collection.name,
                            arena: data.collection.arena_mode,
                        },
                    });
                    setMessage(
                        `Loaded ${data.collection.arena_mode ? "Arena" : "Paper"} collection "${data.collection.name}".`
                    );
                } else if (data.analysis) {
                    onLoadRef.current({
                        decks: data.analysis.decklists?.length ? data.analysis.decklists : [""],
                        collection: tidyCollection(data.analysis.collection ?? ""),
                        arenaMode: data.analysis.arena_mode,
                    });
                    onOpenChangeRef.current({
                        analysis: {
                            id: data.analysis.id,
                            name: data.analysis.name,
                            arena: data.analysis.arena_mode,
                        },
                        collection: null,
                    });
                    setMessage(`Loaded comparison "${data.analysis.name}".`);
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
                if (!cancelled) setMessage("Could not load that saved item.");
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [signedIn, searchParams]);

    if (!signedIn) {
        return (
            <p className="text-sm text-ink/60 text-center">
                <a
                    href="/signin?callbackUrl=%2Fplanner"
                    className="text-brand underline underline-offset-2 hover:text-brand-dark"
                >
                    Sign in
                </a>{" "}
                to save your collections and comparisons to your profile.
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
        <div className="space-y-3">
            <div className="flex flex-wrap justify-center gap-3">
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
                        className="px-5 py-2 rounded shadow-card font-title bg-brand text-midnight-light hover:bg-brand-dark"
                    >
                        {open ? "Hide Saved" : "Load Saved"}
                    </button>
                )}
            </div>

            {/* What Save will overwrite, spelled out. Without it the button
                changes meaning invisibly depending on what was opened. */}
            {(openCollection || openAnalysis) && (
                <p className="text-sm text-center text-ink/70">
                    {openCollection && (
                        <>
                            Editing {openCollection.arena ? "Arena" : "Paper"} collection &quot;
                            {openCollection.name}&quot;.
                        </>
                    )}
                    {openCollection && openAnalysis && " "}
                    {openAnalysis && <>Editing comparison &quot;{openAnalysis.name}&quot;.</>}
                </p>
            )}

            {message && (
                <p className="text-sm text-center text-ink/80" role="status">
                    {message}
                </p>
            )}

            {open && (
                <div className="grid sm:grid-cols-2 gap-4">
                    <div className="bg-parchment rounded shadow-inner-parchment p-3 sm:p-4 space-y-3">
                        <p className="font-title text-lg">Collections</p>
                        <CollectionGroup title="Arena" items={arenaCollections} onPick={loadCollection} />
                        <CollectionGroup title="Paper" items={paperCollections} onPick={loadCollection} />
                    </div>

                    <div className="bg-parchment rounded shadow-inner-parchment p-3 sm:p-4">
                        <p className="font-title text-lg mb-2">Comparisons</p>
                        {analyses.length === 0 ? (
                            <p className="text-sm text-ink/50">None saved.</p>
                        ) : (
                            <ul className="space-y-1">
                                {analyses.map((a) => (
                                    <li key={a.id}>
                                        <button
                                            type="button"
                                            onClick={() => loadAnalysis(a.id)}
                                            className="w-full text-left text-sm px-2 py-1 rounded hover:bg-brass/20"
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
        </div>
    );
}
