"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useOptionalSession } from "./useOptionalSession";
import { CollectionGroup, type CollectionSummary } from "./SavedCollectionPicker";
import { deckFormatLabel } from "@/lib/deckText";
import { formatLabel } from "@/lib/formats";

/**
 * "What do you want to work on?" — shown in place of the editor each time
 * the Decks page, the Sideboard Planner or the Collection page is entered,
 * and again from the page's "Open another..." button.
 *
 * Before this, the only way to open a saved deck, guide or collection was to
 * go to the profile page first and press its Open button; the pages
 * themselves just showed whatever was last in this browser. Now each page
 * asks on the way in: one of your saved ones, a fresh start, or — when there
 * is something already here — carrying on with it.
 *
 * An inline panel rather than a modal, the same on all three pages: it is
 * the page's starting point, not an interruption, and a modal on arrival
 * reads as the site blocking you. It never walls anyone off: signed out, or
 * on a deployment without sign-in, "Start new" (and "keep working", where
 * there's something to keep) is right there, and the saved list is replaced
 * by a sign-in link or by nothing at all.
 *
 * The list comes from the same GET endpoints the profile page uses, fetched
 * when the panel appears so it's never stale. Opening one is the page's job
 * (`onOpen`), because only the page knows what opening means for its state —
 * and it routes that through its leave-guard, so unsaved work is asked about
 * first.
 */

export type ChooserKind = "decks" | "guides" | "collections";

const NOUNS: Record<ChooserKind, { one: string; many: string }> = {
    decks: { one: "deck", many: "decks" },
    guides: { one: "sideboard guide", many: "sideboard guides" },
    collections: { one: "collection", many: "collections" },
};

interface DeckItem {
    id: number;
    name: string;
    format: string | null;
    main: number;
    side: number;
}

interface GuideItem {
    id: number;
    name: string;
    format: string | null;
    matchups: number;
}

/** The same button shape as GuideNameBar's Rename, so the bar reads as one row. */
export const SWITCH_BUTTON_CLASS =
    "shrink-0 px-4 py-2 rounded text-sm font-title bg-parchment text-ink shadow-card hover:bg-parchment/70";

/**
 * The bar at the top of a page whose work isn't a saved item yet — the
 * unsaved counterpart of GuideNameBar, which needs an id to rename. Same
 * card, same "Editing" eyebrow, so switching between a saved item and a new
 * one doesn't move the controls around.
 */
export function DraftBar({ title, detail, children }: { title: string; detail?: string; children?: React.ReactNode }) {
    return (
        <div className="bg-parchment-dark shadow-card rounded-lg px-4 py-3 sm:px-6 flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1 basis-48">
                <p className="text-xs font-semibold uppercase tracking-wider text-ink/55">Editing</p>
                <p className="font-title text-xl truncate" title={title}>
                    {title}
                </p>
                {detail && <p className="text-sm text-ink/60">{detail}</p>}
            </div>
            {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
        </div>
    );
}

/** Your saved items of one kind, or why they can't be shown. */
function SavedItems({
    kind,
    authEnabled,
    activeId,
    onOpen,
}: {
    kind: ChooserKind;
    authEnabled: boolean;
    activeId: number | null;
    onOpen: (id: number) => Promise<string | null>;
}) {
    const { signedIn, loading } = useOptionalSession();
    const noun = NOUNS[kind];
    const [items, setItems] = useState<(DeckItem | GuideItem | CollectionSummary)[] | null>(null);
    const [listError, setListError] = useState<string | null>(null);
    const [openError, setOpenError] = useState<string | null>(null);
    const [busyId, setBusyId] = useState<number | null>(null);

    useEffect(() => {
        if (!signedIn) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch(`/api/${kind}`);
                const data = await res.json().catch(() => ({}));
                if (cancelled) return;
                if (!res.ok) {
                    setListError(
                        res.status === 401
                            ? `Sign in again to see your saved ${noun.many}.`
                            : (data.error ?? `Could not load your ${noun.many}.`)
                    );
                    return;
                }
                const list = data[kind];
                setItems(Array.isArray(list) ? list : []);
                setListError(null);
            } catch {
                if (!cancelled) setListError(`Could not load your ${noun.many}.`);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [signedIn, kind, noun.many]);

    if (!authEnabled) return null;

    if (loading) return <p className="text-sm text-ink/60">Checking for your saved {noun.many}...</p>;

    if (!signedIn) {
        const here = `/${kind === "guides" ? "sideboard" : kind === "decks" ? "decks" : "collection"}`;
        return (
            <p className="text-sm text-ink/70">
                <Link
                    href={`/signin?callbackUrl=${encodeURIComponent(here)}`}
                    className="text-brand underline underline-offset-2 hover:text-brand-dark"
                >
                    Sign in
                </Link>{" "}
                to open your saved {noun.many} here.
            </p>
        );
    }

    const pick = async (id: number) => {
        setBusyId(id);
        setOpenError(null);
        const problem = await onOpen(id);
        // On success the page has usually swapped the chooser out already;
        // setting state on an unmounted component is a no-op in React 19.
        setBusyId(null);
        if (problem) setOpenError(problem);
    };

    let list: React.ReactNode;
    if (listError) {
        list = <p className="text-sm text-red-700">{listError}</p>;
    } else if (items === null) {
        list = <p className="text-sm text-ink/60">Loading your saved {noun.many}...</p>;
    } else if (items.length === 0) {
        list = <p className="text-sm text-ink/70">You haven&apos;t saved any {noun.many} yet.</p>;
    } else if (kind === "collections") {
        const collections = items as CollectionSummary[];
        list = (
            <div className="grid sm:grid-cols-2 gap-4 max-h-80 overflow-y-auto">
                <CollectionGroup
                    title="Arena"
                    items={collections.filter((c) => c.arena_mode)}
                    activeId={activeId}
                    busyId={busyId}
                    onPick={(id) => void pick(id)}
                    activeLabel="open now"
                />
                <CollectionGroup
                    title="Paper"
                    items={collections.filter((c) => !c.arena_mode)}
                    activeId={activeId}
                    busyId={busyId}
                    onPick={(id) => void pick(id)}
                    activeLabel="open now"
                />
            </div>
        );
    } else {
        list = (
            <ul className="space-y-1 max-h-80 overflow-y-auto">
                {items.map((item) => {
                    const active = item.id === activeId;
                    let detail: string;
                    if (kind === "decks") {
                        const d = item as DeckItem;
                        detail = `${d.format ? `${deckFormatLabel(d.format)} · ` : ""}${d.main} main${d.side ? ` + ${d.side} side` : ""}`;
                    } else {
                        const g = item as GuideItem;
                        detail = `${g.format ? `${formatLabel(g.format)} · ` : ""}${g.matchups} matchup${g.matchups === 1 ? "" : "s"}`;
                    }
                    return (
                        <li key={item.id}>
                            <button
                                type="button"
                                onClick={active || busyId !== null ? undefined : () => void pick(item.id)}
                                disabled={active || busyId !== null}
                                className="w-full text-left text-sm px-2 py-2 rounded hover:bg-brass/20 disabled:hover:bg-transparent disabled:opacity-60 [overflow-wrap:anywhere]"
                            >
                                <span className="font-semibold">{item.name}</span>{" "}
                                <span className="text-ink/60">
                                    {detail}
                                    {active ? " · open now" : busyId === item.id ? " · opening..." : ""}
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        );
    }

    return (
        <div className="space-y-2">
            <p className="font-title text-lg">Your saved {noun.many}</p>
            {openError && (
                <p className="text-sm text-red-700 [overflow-wrap:anywhere]" role="alert">
                    {openError}
                </p>
            )}
            {list}
        </div>
    );
}

export default function EntryChooser({
    kind,
    authEnabled,
    mode,
    activeId = null,
    onOpen,
    onNew,
    newLabel,
    resume = null,
    onCancel,
    cancelLabel,
}: {
    kind: ChooserKind;
    authEnabled: boolean;
    /** "entry" on arrival; "switch" from the page's Open another... button. */
    mode: "entry" | "switch";
    /** The saved item already open, shown as such rather than offered again. */
    activeId?: number | null;
    /** Open a saved item by id. Resolves to a message when it couldn't. */
    onOpen: (id: number) => Promise<string | null>;
    onNew: () => void;
    newLabel: string;
    /**
     * Something already here to carry on with: the Collection page's local
     * collection, or a Decks / Sideboard draft that outlived the last visit
     * because it was left by Back, a reload or a closed tab (none of which
     * the leave-guard can intercept; see LeaveGuard).
     */
    resume?: { label: string; detail: string; onResume: () => void } | null;
    /** "switch" only: back to what's open, unchanged. */
    onCancel?: () => void;
    cancelLabel?: string;
}) {
    const noun = NOUNS[kind];
    return (
        <section
            aria-labelledby="entry-chooser-title"
            className="bg-parchment-dark shadow-card rounded-lg p-4 sm:p-6 space-y-5"
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 id="entry-chooser-title" className="text-2xl font-title">
                        {mode === "entry" ? "What do you want to work on?" : `Open another ${noun.one}`}
                    </h2>
                    <p className="text-sm text-ink/70">
                        {authEnabled
                            ? `Open one of your saved ${noun.many}, or start a new one.`
                            : `Start a new ${noun.one}${resume ? ", or carry on with the one here" : ""}.`}
                    </p>
                </div>
                {onCancel && (
                    <button type="button" onClick={onCancel} className={SWITCH_BUTTON_CLASS + " max-w-full truncate"}>
                        {cancelLabel ?? "Back"}
                    </button>
                )}
            </div>

            <div className="flex flex-wrap gap-3">
                {resume && (
                    <button
                        type="button"
                        onClick={resume.onResume}
                        className="text-left rounded shadow-card bg-parchment p-3 hover:bg-brass/15 flex-1 min-w-[14rem] [overflow-wrap:anywhere]"
                    >
                        <span className="block font-title text-lg">{resume.label}</span>
                        <span className="block text-xs text-ink/65 mt-1">{resume.detail}</span>
                    </button>
                )}
                <button
                    type="button"
                    onClick={onNew}
                    className="text-left rounded shadow-card bg-brand text-midnight-light p-3 hover:bg-brand-dark flex-1 min-w-[14rem]"
                >
                    <span className="block font-title text-lg">{newLabel}</span>
                    <span className="block text-xs text-midnight-light/80 mt-1">
                        An empty {noun.one}, ready to fill in.
                    </span>
                </button>
            </div>

            {authEnabled && (
                <div className="border-t border-brass/25 pt-4">
                    <SavedItems kind={kind} authEnabled={authEnabled} activeId={activeId} onOpen={onOpen} />
                </div>
            )}
        </section>
    );
}
