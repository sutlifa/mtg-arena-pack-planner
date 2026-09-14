"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";

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
 * Save and reload the Pack Planner's inputs against a signed-in profile.
 *
 * Only ever rendered when auth is configured (see lib/authConfig), because
 * useSession throws without a SessionProvider and the provider is not mounted
 * on deployments without Google credentials.
 *
 * Only inputs are saved — decklists, collection text and the mode. The
 * computed breakdown is deliberately not stored: prices, Arena availability
 * and set legality all move underneath us, so a saved result would begin
 * drifting the moment it was written. Re-running on load is cheap and always
 * current.
 */
export default function PackPlannerSaves({
    decks,
    collection,
    arenaMode,
    onLoad,
}: {
    decks: string[];
    collection: string;
    arenaMode: boolean;
    onLoad: (next: { decks?: string[]; collection?: string; arenaMode?: boolean }) => void;
}) {
    const { data: session } = useSession();
    const searchParams = useSearchParams();

    const [collections, setCollections] = useState<CollectionSummary[]>([]);
    const [analyses, setAnalyses] = useState<AnalysisSummary[]>([]);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [open, setOpen] = useState(false);

    const signedIn = Boolean(session?.user);

    /** Fetches both lists. Returns them rather than setting state, so callers
     *  decide whether the result is still wanted. */
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

    // Opening a saved item from the profile page arrives as ?collection= or
    // ?analysis=. Loading happens here rather than in the planner so the
    // planner stays unaware of accounts entirely.
    useEffect(() => {
        if (!signedIn) return;

        const collectionId = searchParams.get("collection");
        const analysisId = searchParams.get("analysis");
        if (!collectionId && !analysisId) return;

        let cancelled = false;

        (async () => {
            try {
                if (collectionId) {
                    const res = await fetch(`/api/collections/${collectionId}`);
                    if (!res.ok) return;
                    const { collection: c } = await res.json();
                    if (!cancelled && c) {
                        onLoad({ collection: c.raw_text, arenaMode: c.arena_mode });
                        setMessage(`Loaded collection "${c.name}".`);
                    }
                } else if (analysisId) {
                    const res = await fetch(`/api/analyses/${analysisId}`);
                    if (!res.ok) return;
                    const { analysis } = await res.json();
                    if (!cancelled && analysis) {
                        onLoad({
                            decks: analysis.decklists?.length ? analysis.decklists : [""],
                            collection: analysis.collection ?? "",
                            arenaMode: analysis.arena_mode,
                        });
                        setMessage(`Loaded comparison "${analysis.name}".`);
                    }
                }
            } catch {
                if (!cancelled) setMessage("Could not load that saved item.");
            }
        })();

        return () => {
            cancelled = true;
        };
        // onLoad is recreated each render by the parent; depending on it would
        // re-run this effect (and re-load) on every keystroke.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [signedIn, searchParams]);

    if (!signedIn) {
        return (
            <p className="text-sm text-ink/60 text-center">
                <a
                    href="/signin?callbackUrl=%2F"
                    className="text-brand underline underline-offset-2 hover:text-brand-dark"
                >
                    Sign in
                </a>{" "}
                to save your collection and comparisons to your profile.
            </p>
        );
    }

    const post = async (url: string, body: unknown, label: string) => {
        setBusy(true);
        setMessage(null);
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) setMessage(data.error ?? `Could not save that ${label}.`);
            else {
                setMessage(`Saved as "${data.name}".`);
                refresh();
            }
        } catch {
            setMessage(`Could not save that ${label}.`);
        }
        setBusy(false);
    };

    const saveCollection = () => {
        if (!collection.trim()) {
            setMessage("Paste a collection first.");
            return;
        }
        const name = window.prompt("Save this collection as:", "My collection");
        if (name === null) return;
        post("/api/collections", { name, rawText: collection, arenaMode }, "collection");
    };

    const saveComparison = () => {
        if (!decks.some((d) => d.trim())) {
            setMessage("Add at least one decklist first.");
            return;
        }
        const name = window.prompt("Save this comparison as:", "My comparison");
        if (name === null) return;
        post("/api/analyses", { name, decklists: decks, collection, arenaMode }, "comparison");
    };

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap justify-center gap-3">
                <button
                    type="button"
                    onClick={busy ? undefined : saveCollection}
                    disabled={busy}
                    className="px-5 py-2 rounded shadow-card font-title bg-parchment text-ink hover:bg-parchment/70 disabled:opacity-50"
                >
                    Save Collection
                </button>
                <button
                    type="button"
                    onClick={busy ? undefined : saveComparison}
                    disabled={busy}
                    className="px-5 py-2 rounded shadow-card font-title bg-parchment text-ink hover:bg-parchment/70 disabled:opacity-50"
                >
                    Save Comparison
                </button>
                {(collections.length > 0 || analyses.length > 0) && (
                    <button
                        type="button"
                        onClick={() => setOpen((v) => !v)}
                        className="px-5 py-2 rounded shadow-card font-title bg-parchment text-ink hover:bg-parchment/70"
                    >
                        {open ? "Hide Saved" : "Load Saved"}
                    </button>
                )}
            </div>

            {message && (
                <p className="text-sm text-center text-ink/80" role="status">
                    {message}
                </p>
            )}

            {open && (
                <div className="grid sm:grid-cols-2 gap-4">
                    <div className="bg-parchment rounded shadow-inner-parchment p-4">
                        <p className="font-title text-lg mb-2">Collections</p>
                        {collections.length === 0 ? (
                            <p className="text-sm text-ink/60">None saved yet.</p>
                        ) : (
                            <ul className="space-y-1">
                                {collections.map((c) => (
                                    <li key={c.id}>
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                const res = await fetch(`/api/collections/${c.id}`);
                                                if (!res.ok) return setMessage("Could not load that collection.");
                                                const { collection: loaded } = await res.json();
                                                onLoad({
                                                    collection: loaded.raw_text,
                                                    arenaMode: loaded.arena_mode,
                                                });
                                                setMessage(`Loaded collection "${loaded.name}".`);
                                            }}
                                            className="w-full text-left text-sm px-2 py-1 rounded hover:bg-brass/15"
                                        >
                                            {c.name}{" "}
                                            <span className="text-ink/50">
                                                ({c.cards} lines, {c.arena_mode ? "Arena" : "Paper"})
                                            </span>
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>

                    <div className="bg-parchment rounded shadow-inner-parchment p-4">
                        <p className="font-title text-lg mb-2">Comparisons</p>
                        {analyses.length === 0 ? (
                            <p className="text-sm text-ink/60">None saved yet.</p>
                        ) : (
                            <ul className="space-y-1">
                                {analyses.map((a) => (
                                    <li key={a.id}>
                                        <button
                                            type="button"
                                            onClick={async () => {
                                                const res = await fetch(`/api/analyses/${a.id}`);
                                                if (!res.ok) return setMessage("Could not load that comparison.");
                                                const { analysis } = await res.json();
                                                onLoad({
                                                    decks: analysis.decklists?.length
                                                        ? analysis.decklists
                                                        : [""],
                                                    collection: analysis.collection ?? "",
                                                    arenaMode: analysis.arena_mode,
                                                });
                                                setMessage(`Loaded comparison "${analysis.name}".`);
                                            }}
                                            className="w-full text-left text-sm px-2 py-1 rounded hover:bg-brass/15"
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
