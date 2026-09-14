"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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

type Draft = { kind: "collection" | "comparison"; name: string; arena: boolean } | null;

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
    const [draft, setDraft] = useState<Draft>(null);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [open, setOpen] = useState(false);

    const signedIn = Boolean(session?.user);

    // The parent recreates onLoad every render. Holding it in a ref keeps the
    // URL-param effect from re-running (and re-loading the saved item) on
    // every keystroke, without lying to the dependency linter.
    const onLoadRef = useRef(onLoad);
    useEffect(() => {
        onLoadRef.current = onLoad;
    }, [onLoad]);

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
            onLoad({ collection: loaded.raw_text, arenaMode: loaded.arena_mode });
            setMessage(
                `Loaded ${loaded.arena_mode ? "Arena" : "Paper"} collection "${loaded.name}".`
            );
            setOpen(false);
        },
        [onLoad]
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
                collection: analysis.collection ?? "",
                arenaMode: analysis.arena_mode,
            });
            setMessage(`Loaded comparison "${analysis.name}".`);
            setOpen(false);
        },
        [onLoad]
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
                    onLoadRef.current({
                        collection: data.collection.raw_text,
                        arenaMode: data.collection.arena_mode,
                    });
                    setMessage(
                        `Loaded ${data.collection.arena_mode ? "Arena" : "Paper"} collection "${data.collection.name}".`
                    );
                } else if (data.analysis) {
                    onLoadRef.current({
                        decks: data.analysis.decklists?.length ? data.analysis.decklists : [""],
                        collection: data.analysis.collection ?? "",
                        arenaMode: data.analysis.arena_mode,
                    });
                    setMessage(`Loaded comparison "${data.analysis.name}".`);
                }
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

    const submitDraft = async () => {
        if (!draft) return;

        if (!draft.name.trim()) {
            setMessage("Give it a name.");
            return;
        }

        setBusy(true);
        setMessage(null);

        const [url, body, label] =
            draft.kind === "collection"
                ? ["/api/collections", { name: draft.name, rawText: collection, arenaMode: draft.arena }, "collection"]
                : [
                    "/api/analyses",
                    { name: draft.name, decklists: decks, collection, arenaMode: draft.arena },
                    "comparison",
                ];

        try {
            const res = await fetch(url as string, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body),
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) {
                setMessage(data.error ?? `Could not save that ${label}.`);
            } else {
                setMessage(`Saved "${data.name}" as ${draft.arena ? "Arena" : "Paper"}.`);
                setDraft(null);
                refresh();
            }
        } catch {
            setMessage(`Could not save that ${label}.`);
        }
        setBusy(false);
    };

    const startCollection = () => {
        if (!collection.trim()) {
            setMessage("Paste a collection first.");
            return;
        }
        setMessage(null);
        // Defaults to the mode you're in, but stays changeable — you might be
        // pasting an Arena export while the toggle is still on Paper.
        setDraft({ kind: "collection", name: "", arena: arenaMode });
    };

    const startComparison = () => {
        if (!decks.some((d) => d.trim())) {
            setMessage("Add at least one decklist first.");
            return;
        }
        setMessage(null);
        setDraft({ kind: "comparison", name: "", arena: arenaMode });
    };

    const arenaCollections = collections.filter((c) => c.arena_mode);
    const paperCollections = collections.filter((c) => !c.arena_mode);

    return (
        <div className="space-y-3">
            <div className="flex flex-wrap justify-center gap-3">
                <button
                    type="button"
                    onClick={busy ? undefined : startCollection}
                    disabled={busy}
                    className="px-5 py-2 rounded shadow-card font-title bg-parchment text-ink hover:bg-parchment/70 disabled:opacity-50"
                >
                    Save Collection
                </button>
                <button
                    type="button"
                    onClick={busy ? undefined : startComparison}
                    disabled={busy}
                    className="px-5 py-2 rounded shadow-card font-title bg-parchment text-ink hover:bg-parchment/70 disabled:opacity-50"
                >
                    Save Comparison
                </button>
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

            {draft && (
                <div className="bg-parchment rounded shadow-inner-parchment p-3 sm:p-4 space-y-3 max-w-lg mx-auto">
                    <p className="font-title text-lg">
                        Save {draft.kind === "collection" ? "collection" : "comparison"}
                    </p>

                    <label className="block">
                        <span className="text-sm text-ink/70">Name</span>
                        <input
                            type="text"
                            autoFocus
                            value={draft.name}
                            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                            onKeyDown={(e) => {
                                if (e.key === "Enter") submitDraft();
                                if (e.key === "Escape") setDraft(null);
                            }}
                            placeholder={
                                draft.kind === "collection"
                                    ? draft.arena
                                        ? "My Arena collection"
                                        : "My paper collection"
                                    : "My comparison"
                            }
                            className="mt-1 w-full px-3 py-2 rounded bg-parchment-dark text-ink shadow-inner-parchment"
                        />
                    </label>

                    <div>
                        <span className="text-sm text-ink/70">Save as</span>
                        <div className="mt-1 flex gap-2">
                            {[
                                { label: "Arena", value: true },
                                { label: "Paper", value: false },
                            ].map((opt) => (
                                <button
                                    key={opt.label}
                                    type="button"
                                    onClick={() => setDraft({ ...draft, arena: opt.value })}
                                    aria-pressed={draft.arena === opt.value}
                                    className={
                                        "px-4 py-2 rounded font-title text-sm transition-colors " +
                                        (draft.arena === opt.value
                                            ? "bg-brass text-brass-ink"
                                            : "bg-parchment-dark text-ink/70 hover:bg-parchment-dark/70")
                                    }
                                >
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                        <p className="text-xs text-ink/55 mt-1">
                            Loading it later puts the planner back into this mode.
                        </p>
                    </div>

                    <div className="flex gap-2 justify-end">
                        <button
                            type="button"
                            onClick={() => setDraft(null)}
                            className="px-4 py-2 rounded text-sm text-ink/70 hover:bg-parchment-dark"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            onClick={busy ? undefined : submitDraft}
                            disabled={busy}
                            className="px-5 py-2 rounded font-title bg-brand text-midnight-light hover:bg-brand-dark disabled:opacity-50"
                        >
                            {busy ? "Saving..." : "Save"}
                        </button>
                    </div>
                </div>
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
