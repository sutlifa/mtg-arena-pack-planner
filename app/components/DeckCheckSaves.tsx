"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import SaveWorkButton, { type SavedRef } from "./SaveWorkButton";
import type { OpenedCollection } from "./SavedCollectionPicker";

interface AnalysisSummary {
    id: number;
    name: string;
    arena_mode: boolean;
    decks: number;
    updated_at: string;
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
 * Deck Check's saved comparisons, plus the ?collection= / ?analysis= links
 * the profile opens Deck Check with.
 *
 * A comparison is the decklists, the collection and the Arena/Paper mode
 * together; opening one puts all three back and runs it again. This panel
 * used to save and open collections too, when the Pack Planner had no other
 * way to; that's now the collection box's "Load collection" and "Save to
 * Collection", so this is comparisons only and says so.
 *
 * Comparisons store deck *text*, not saved-deck ids: a comparison is a
 * snapshot of what was checked, and keeps working if the deck it came from is
 * later edited or deleted. Opening one gives pasted slots.
 *
 * Only ever rendered when auth is configured (see lib/authConfig), because
 * useSession throws without a SessionProvider and the provider is not mounted
 * on deployments without Google credentials.
 *
 * This panel only fetches. What an open *does* — which state it replaces,
 * whether it runs, and the summary that says so — belongs to DeckCheck
 * (openComparison / loadSavedCollection), because the same opens arrive from
 * several places and one place has to decide them all.
 */
export default function DeckCheckSaves({
    decks,
    collection,
    arenaMode,
    openAnalysis,
    ready,
    onOpenCollection,
    onOpenComparison,
    onSaved,
}: {
    decks: string[];
    collection: string;
    arenaMode: boolean;
    openAnalysis: SavedRef;
    /** False until Deck Check has restored its collection from storage. */
    ready: boolean;
    onOpenCollection: (c: OpenedCollection) => void;
    onOpenComparison: (a: OpenedAnalysis) => void;
    onSaved: (ref: NonNullable<SavedRef>) => void;
}) {
    const { data: session, status } = useSession();
    const searchParams = useSearchParams();

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

    const fetchList = useCallback(async (): Promise<AnalysisSummary[]> => {
        const res = await fetch("/api/analyses");
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data.analyses) ? data.analyses : [];
    }, []);

    const refresh = useCallback(async () => {
        try {
            setAnalyses(await fetchList());
        } catch {
            /* listing is a convenience; failing to load it shouldn't break the page */
        }
    }, [fetchList]);

    useEffect(() => {
        if (!signedIn) return;

        // Guarded so a response that arrives after unmount (or after signing
        // out) can't write into a component that no longer wants it.
        let cancelled = false;

        (async () => {
            try {
                const next = await fetchList();
                if (!cancelled) setAnalyses(next);
            } catch {
                /* see above */
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [signedIn, fetchList]);

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

    const collectionId = searchParams.get("collection");
    const analysisId = searchParams.get("analysis");

    // Opening a saved item from the profile page arrives as ?collection= or
    // ?analysis=.
    useEffect(() => {
        if (!signedIn || !ready) return;
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
    }, [signedIn, ready, collectionId, analysisId]);

    if (status === "loading") return null;

    if (!signedIn) {
        // A profile link followed while signed out (an expired session, a
        // bookmarked link): say what it was for, and come back to it after
        // signing in rather than to a bare /deck-check.
        const pending = collectionId ? "collection" : analysisId ? "comparison" : null;
        const back = pending
            ? `/deck-check?${collectionId ? `collection=${encodeURIComponent(collectionId)}` : `analysis=${encodeURIComponent(analysisId ?? "")}`}`
            : "/deck-check";
        return (
            <p className="text-sm text-ink/60 text-center">
                <a
                    href={`/signin?callbackUrl=${encodeURIComponent(back)}`}
                    className="text-brand underline underline-offset-2 hover:text-brand-dark"
                >
                    Sign in
                </a>{" "}
                {pending
                    ? `to open that saved ${pending}.`
                    : "to save this comparison — decks, collection and mode — and reopen it later."}
            </p>
        );
    }

    return (
        <section className="bg-parchment-dark shadow-card rounded-lg p-4 sm:p-5 space-y-3">
            <div className="space-y-1">
                <h2 className="text-xl font-title">Saved comparisons</h2>
                <p className="text-sm text-ink/70 leading-relaxed">
                    A <strong>comparison</strong> keeps the decks, the collection and the Arena/Paper
                    mode together. Opening one puts all three back and checks them again against
                    today&apos;s card data.
                </p>
            </div>

            <div className="flex flex-wrap gap-3">
                <SaveWorkButton
                    kind="comparison"
                    decks={decks}
                    collection={collection}
                    arenaMode={arenaMode}
                    open={openAnalysis}
                    onSaved={(saved) => {
                        onSaved({ id: saved.id, name: saved.name, arena: saved.arena });
                        void refresh();
                    }}
                />
                {analyses.length > 0 && (
                    <button
                        type="button"
                        onClick={() => setOpen((v) => !v)}
                        aria-expanded={open}
                        className="px-5 py-2 rounded shadow-card font-title bg-brand text-midnight-light hover:bg-brand-dark"
                    >
                        {open ? "Hide saved" : "Open a comparison..."}
                    </button>
                )}
            </div>

            {/* What Save will overwrite, spelled out. Without it the button
                changes meaning invisibly depending on what was opened. */}
            {openAnalysis && (
                <p className="text-sm text-ink/70 [overflow-wrap:anywhere]">
                    Save Comparison updates &quot;{openAnalysis.name}&quot;.
                </p>
            )}

            {message && (
                <p className="text-sm text-red-700" role="status">
                    {message}
                </p>
            )}

            {open && (
                <div className="bg-parchment rounded shadow-inner-parchment p-3 sm:p-4 space-y-2">
                    <p className="text-xs text-ink/60">
                        Replaces the deck slots, the collection (if one was saved with it) and the mode,
                        then runs.
                    </p>
                    <ul className="space-y-1">
                        {analyses.map((a) => (
                            <li key={a.id}>
                                <button
                                    type="button"
                                    onClick={() => void loadAnalysis(a.id)}
                                    className="w-full text-left text-sm px-2 py-1 rounded hover:bg-brass/20 [overflow-wrap:anywhere]"
                                >
                                    {a.name}{" "}
                                    <span className="text-ink/50">
                                        ({a.decks} deck{a.decks === 1 ? "" : "s"}, {a.arena_mode ? "Arena" : "Paper"})
                                    </span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </section>
    );
}
