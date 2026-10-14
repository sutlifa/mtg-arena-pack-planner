"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import HelpTip from "./HelpTip";
import GuideNameBar from "./GuideNameBar";
import DeckSaves, { DeckSaveAndContinue, type SavedDeck } from "./DeckSaves";
import { DeckHandoffLoader, sendDeck } from "./DeckHandoff";
import EntryChooser, { DraftBar, SWITCH_BUTTON_CLASS } from "./EntryChooser";
import { LeaveDialog, useLeaveGuard } from "./LeaveGuard";
import { DECK_FORMATS, NO_CARDS_MESSAGE, deckFormatLabel, deckSections, formatDeck } from "@/lib/deckText";
import { totalCards, type DeckCard } from "@/lib/deckSections";
import { isGoldfishDeckUrl } from "@/lib/goldfishUrl";
import { checkDecklistSize } from "@/lib/inputLimits";
import type { HandoffDeck, HandoffTarget } from "@/lib/deckHandoff";

/**
 * The deck being worked on, kept in this browser while you're on the page.
 * Includes which saved deck is open and what it held when opened, so a
 * reload still knows what Save updates and whether anything is unsaved.
 *
 * Cleared when you leave the page through the site (after the leave-guard
 * has asked), so the next visit starts at the chooser. It survives what the
 * guard can't intercept — a reload, Back, a closed tab — and the chooser
 * then offers to pick up where you left off, so nothing is lost silently.
 */
const DRAFT_KEY = "mtgpp:decks-draft";

/** /api/card-images' per-request limit; a deck is well under it. */
const MAX_IMAGE_NAMES = 150;

type OpenDeck = { id: number; name: string };
/** The open deck as stored: what "unsaved changes" is measured against. */
type Baseline = { decklist: string; format: string | null };

interface Draft {
    text: string;
    name: string;
    format: string;
    open: OpenDeck | null;
    baseline: Baseline | null;
}

const EMPTY_DRAFT: Draft = { text: "", name: "", format: "", open: null, baseline: null };

/** Whatever shape was in storage, as a complete Draft — older or hand-edited values included. */
function readDraft(raw: string | null): Draft {
    if (!raw) return EMPTY_DRAFT;
    try {
        const v = JSON.parse(raw);
        const open =
            typeof v?.open?.id === "number" && typeof v?.open?.name === "string"
                ? { id: v.open.id, name: v.open.name }
                : null;
        const baseline =
            open && typeof v?.baseline?.decklist === "string"
                ? {
                      decklist: v.baseline.decklist,
                      format: typeof v.baseline.format === "string" ? v.baseline.format : null,
                  }
                : null;
        return {
            text: typeof v?.text === "string" ? v.text : "",
            name: typeof v?.name === "string" ? v.name : "",
            format: typeof v?.format === "string" ? v.format : "",
            // An open ref without the baseline it's measured against can't
            // say whether anything is unsaved, so it isn't trusted.
            open: baseline ? open : null,
            baseline,
        };
    } catch {
        return EMPTY_DRAFT;
    }
}

/**
 * Where a deck can go from here. This page only edits decks; checking one
 * against a collection is Deck Check's job. It used to be two buttons —
 * "Check against my collection", which went to the Collection page, and
 * "Open in Pack Planner" — for what is now one tool.
 */
const SEND_TARGETS: { target: HandoffTarget; label: string; hint: string }[] = [
    {
        target: "deckCheck",
        label: "Check in Deck Check",
        hint: "What you're missing, card by card, plus wildcards or a priced shopping list — run straight away against your collection.",
    },
    {
        target: "sideboard",
        label: "Build a sideboard guide",
        hint: "Loads it as the Sideboard Planner's decklist, split into maindeck and sideboard.",
    },
];

/**
 * The Decks page: paste a list, see it split, save it, and send it to the
 * other tools.
 *
 * Signed out (or on a deployment without sign-in) everything but saving
 * works — the split, the formats, and both "send to" actions, which hand the
 * deck over without an account (see lib/deckHandoff). Saving is in
 * DeckSaves, rendered only where auth is configured, because it needs
 * useSession.
 *
 * Each visit starts at the chooser (EntryChooser): one of your saved decks,
 * a new one, or — if a draft outlived the last visit — that. A ?deck=<id>
 * link skips it and opens the deck. The saved-deck list that used to fill
 * the bottom of the page is that chooser now, reachable again from "Open
 * another..." beside the deck's name.
 */
export default function DeckBuilder({ authEnabled }: { authEnabled: boolean }) {
    const router = useRouter();

    // One object, restored in one update — see SideboardPlanner's PlanState
    // for why field-by-field restores are avoided.
    const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
    const [hydrated, setHydrated] = useState(false);
    const { text, name, format, open, baseline } = draft;
    const patch = (fields: Partial<Draft>) => setDraft((d) => ({ ...d, ...fields }));

    /**
     * Chooser or editor. "loading" until the draft has been read, because
     * whether there's a draft to offer — and whether a ?deck= link skips the
     * chooser — is only known in the browser. `chooser` says why the chooser
     * is up: arriving, or "Open another..." from the editor (which can go
     * back to the deck unchanged).
     */
    const [phase, setPhase] = useState<"loading" | "choosing" | "editing">("loading");
    const [chooser, setChooser] = useState<"entry" | "switch">("entry");
    /**
     * Set once the page is being left. A save made by "Save and leave"
     * updates the draft a moment before the navigation unmounts the page,
     * and without this the persistence effect would write that draft straight
     * back after it had been cleared.
     */
    const leaving = useRef(false);
    const clearStoredDraft = () => {
        leaving.current = true;
        try {
            localStorage.removeItem(DRAFT_KEY);
        } catch {
            /* nothing stored to clear */
        }
    };

    const [importing, setImporting] = useState(false);
    /**
     * One status line, holding only the latest outcome. Kept as separate
     * notice and error states, an import that failed after one that worked
     * showed "Imported from MTGGoldfish." beside the new error — the same
     * contradiction the Collection page's add box once had. Setting either
     * replaces whatever was there; editing the list clears it, because by
     * then it describes a list that's no longer on screen.
     */
    const [status, setStatus] = useState<{ kind: "error" | "notice"; text: string } | null>(null);
    const setNotice = (text: string | null) => setStatus(text === null ? null : { kind: "notice", text });
    const setError = (text: string | null) => setStatus(text === null ? null : { kind: "error", text });
    const notice = status?.kind === "notice" ? status.text : null;
    const error = status?.kind === "error" ? status.text : null;
    const [listVersion, setListVersion] = useState(0);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [busy, setBusy] = useState(false);

    /* ---- persistence ---- */

    // After mount rather than in a lazy initializer, so the server render and
    // the first client render agree. The same deliberate exception as the
    // other tools. The address is read here too, rather than through
    // useSearchParams, so the page stays statically prerendered: a ?deck=
    // link goes straight to the editor (DeckHandoffLoader opens the deck);
    // anything else starts at the chooser — except where there's nothing to
    // choose between (no sign-in on this deployment and no draft), which
    // would be a menu with one button.
    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        let restored = EMPTY_DRAFT;
        try {
            restored = readDraft(localStorage.getItem(DRAFT_KEY));
            setDraft(restored);
        } catch {
            /* unavailable storage just means starting empty */
        }
        const hasDraft = Boolean(restored.text || restored.name || restored.open);
        const viaLink = new URLSearchParams(window.location.search).has("deck");
        setPhase(viaLink || (!authEnabled && !hasDraft) ? "editing" : "choosing");
        setHydrated(true);
    }, [authEnabled]);
    /* eslint-enable react-hooks/set-state-in-effect */

    useEffect(() => {
        if (!hydrated || leaving.current) return;
        try {
            if (draft.text || draft.name || draft.open) {
                localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
            } else {
                localStorage.removeItem(DRAFT_KEY);
            }
        } catch {
            /* the page still works; it just won't remember */
        }
    }, [hydrated, draft]);

    /* ---- what's in the editor ---- */

    const isLink = isGoldfishDeckUrl(text.trim());
    const sections = useMemo(() => deckSections(isLink ? "" : text), [text, isLink]);
    const normalized = useMemo(() => formatDeck(sections), [sections]);
    const mainCount = totalCards(sections.maindeck);
    const sideCount = totalCards(sections.sideboard);
    const hasCards = sections.maindeck.length + sections.sideboard.length > 0;
    const sizeError = text.length > 0 ? checkDecklistSize(text) : null;
    const usable = hasCards && !sizeError;
    // Text that isn't a link but has no card lines: say what the parser
    // wants, rather than the generic "paste a decklist" that reads as if
    // nothing had been pasted at all.
    const noCards = Boolean(text.trim()) && !isLink && !hasCards;

    // An open deck is measured against what's stored, in normalised form,
    // so retyping a line the same way isn't "unsaved". Anything else counts
    // as unsaved work as soon as the box holds text — whether or not it
    // parses. Keying this on `usable` let "New deck" wipe an over-limit or
    // unparseable paste without asking, and that paste may be exactly what
    // the user is about to fix.
    const dirty = open && baseline
        ? normalized !== baseline.decklist || (format || null) !== baseline.format
        : Boolean(text.trim());

    const knownFormat = format === "" || DECK_FORMATS.some((f) => f.slug === format);

    /* ---- opening, saving, starting again ---- */

    /**
     * The leave-guard: in-app links away from the page, reload / tab close,
     * and every switch below (open another deck, start a new one, send this
     * one to another tool) ask first while there's unsaved work. Leaving
     * through the site clears the draft — see DRAFT_KEY.
     */
    const guard = useLeaveGuard({ dirty: Boolean(dirty), onLeavePage: clearStoredDraft });

    const applyOpen = (d: SavedDeck, message?: string) => {
        setDraft({
            text: d.decklist,
            name: "",
            format: d.format ?? "",
            open: { id: d.id, name: d.name },
            baseline: { decklist: d.decklist, format: d.format ?? null },
        });
        setConfirmDelete(false);
        setError(null);
        setNotice(message ?? `Opened "${d.name}".`);
        setPhase("editing");
    };

    /** Open a saved deck, asking first if that would drop unsaved work. */
    const requestOpen = (d: SavedDeck) => {
        if (open?.id === d.id && !dirty) {
            applyOpen(d);
            return;
        }
        guard.request({
            run: () => applyOpen(d),
            title: `Open “${d.name}”?`,
            consequence: "Opening it replaces what's in the editor.",
            proceedLabel: "Open without saving",
        });
    };

    /** The chooser's pick. Resolves to a message when the deck can't be opened. */
    const openById = async (id: number): Promise<string | null> => {
        try {
            const res = await fetch(`/api/decks/${id}`);
            if (res.status === 401) return "Sign in again to open your saved decks.";
            if (!res.ok) return res.status === 404 ? "That deck no longer exists." : "Could not open that deck.";
            const { deck } = await res.json();
            requestOpen({ id: deck.id, name: deck.name, decklist: deck.decklist, format: deck.format ?? null });
            return null;
        } catch {
            return "Could not open that deck.";
        }
    };

    const onSaved = (saved: SavedDeck) => {
        // The stored, normalised list goes into the editor, so what's on
        // screen is exactly what was saved and nothing reads as unsaved.
        setDraft({
            text: saved.decklist,
            name: "",
            format: saved.format ?? "",
            open: { id: saved.id, name: saved.name },
            baseline: { decklist: saved.decklist, format: saved.format },
        });
        setNotice(null);
        setError(null);
    };

    const startNew = () =>
        guard.request({
            run: () => {
                setDraft(EMPTY_DRAFT);
                setConfirmDelete(false);
                setError(null);
                setNotice(null);
                setPhase("editing");
            },
            title: "Start a new deck?",
            consequence: "Starting a new deck empties the editor.",
            proceedLabel: "Start new without saving",
        });

    const importLink = async () => {
        setImporting(true);
        setError(null);
        try {
            const res = await fetch("/api/import-deck", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ url: text.trim() }),
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && typeof data.decklist === "string") {
                patch({ text: data.decklist });
                setNotice("Imported from MTGGoldfish.");
            } else {
                setError(data.error ?? "Could not import that MTGGoldfish link — check the URL and try again.");
            }
        } catch {
            setError("Could not import that MTGGoldfish link — check the URL and try again.");
        }
        setImporting(false);
    };

    const duplicateOpen = async () => {
        if (!open) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`/api/decks/${open.id}/copy`, { method: "POST" });
            const data = await res.json().catch(() => ({}));
            if (res.ok) {
                setNotice(`Saved a copy as "${data.name}". You're still editing "${open.name}".`);
                setListVersion((n) => n + 1);
            } else {
                setError(data.error ?? "Could not duplicate that deck.");
            }
        } catch {
            setError("Could not duplicate that deck.");
        }
        setBusy(false);
    };

    const deleteOpen = async () => {
        if (!open) return;
        setBusy(true);
        setError(null);
        try {
            const res = await fetch(`/api/decks/${open.id}`, { method: "DELETE" });
            if (res.ok || res.status === 404) {
                // The list stays in the editor, unsaved, so a delete you
                // regret is one Save away from undone.
                const gone = open.name;
                setDraft((d) => ({ ...d, name: gone, open: null, baseline: null }));
                setNotice(`Deleted "${gone}". The list is still here, unsaved, if you want it back.`);
                setListVersion((n) => n + 1);
                setConfirmDelete(false);
            } else {
                const data = await res.json().catch(() => ({}));
                setError(data.error ?? "Could not delete that deck.");
            }
        } catch {
            setError("Could not delete that deck.");
        }
        setBusy(false);
    };

    /**
     * Sending is leaving: the deck goes with you, but the page is cleared
     * behind you like any other way out, so unsaved work is asked about
     * first — the same dialog, with the same Save. After a save from that
     * dialog the deck still travels as the editor holds it (a hand-off, not
     * ?deck=), which is the same list the save just stored.
     */
    const send = (target: HandoffTarget) => {
        if (!usable) return;
        const deck: HandoffDeck = {
            id: open?.id ?? null,
            name: open?.name ?? (name.trim() || null),
            format: format || null,
            decklist: normalized,
        };
        const label = SEND_TARGETS.find((s) => s.target === target)?.label ?? "the next tool";
        guard.request({
            run: () => {
                // By id only when what's stored is what's on screen;
                // otherwise the editor's own list goes, so unsaved edits
                // aren't silently swapped for the saved copy.
                const href = sendDeck(target, deck, { saved: open !== null && !dirty });
                clearStoredDraft();
                router.push(href);
            },
            title: `${label}?`,
            consequence:
                "The deck goes with you as it is, but this page is cleared when you leave — it won't be here when you come back unless it's saved.",
            proceedLabel: "Go without saving",
        });
    };

    /* ---- card pictures for the preview ---- */

    const [images, setImages] = useState<Record<string, string | null>>({});
    const requested = useRef(new Set<string>());
    const [preview, setPreview] = useState<string | null>(null);

    const namesKey = [...new Set([...sections.maindeck, ...sections.sideboard].map((c) => c.name))]
        .slice(0, MAX_IMAGE_NAMES)
        .join("\n");
    useEffect(() => {
        // A pause first, so typing a list is one lookup rather than one per key.
        const t = setTimeout(async () => {
            const names = namesKey ? namesKey.split("\n").filter((n) => !requested.current.has(n)) : [];
            if (names.length === 0) return;
            for (const n of names) requested.current.add(n);
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
                for (const n of names) requested.current.delete(n);
            }
        }, 500);
        return () => clearTimeout(t);
    }, [namesKey]);

    const firstWithImage = [...sections.maindeck, ...sections.sideboard].find((c) => images[c.name])?.name;
    const shown = preview && images[preview] ? preview : firstWithImage ?? null;
    const shownImage = shown ? images[shown] : null;

    const cardList = (title: string, cards: DeckCard[], count: number) => (
        <div>
            <p className="font-title text-lg mb-1">
                {title} <span className="text-ink/60 text-base">({count})</span>
            </p>
            {cards.length === 0 ? (
                <p className="text-sm text-ink/60">
                    {title === "Sideboard"
                        ? "None — add one after a blank line or a \"Sideboard\" line."
                        : "No maindeck cards yet."}
                </p>
            ) : (
                <ul className="text-sm leading-snug">
                    {cards.map((c) => (
                        <li key={c.name}>
                            {/* Buttons, so a tap and Tab move the preview as
                                well as a mouse does — OpponentDeck's pattern. */}
                            <button
                                type="button"
                                onMouseEnter={() => setPreview(c.name)}
                                onFocus={() => setPreview(c.name)}
                                onClick={() => setPreview(c.name)}
                                className={
                                    "w-full flex gap-2 px-1.5 py-0.5 rounded text-left " +
                                    (c.name === shown ? "bg-brass/20" : "hover:bg-brass/10")
                                }
                            >
                                <span className="w-7 shrink-0 text-right text-ink/55 tabular-nums">{c.qty}</span>
                                <span className="min-w-0 break-words">{c.name}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );

    return (
        <div className="space-y-8">
            {/* Opening from the profile arrives as ?deck=<id>. Mounted even
                without sign-in, where it opens nothing but says "Saved decks
                aren't available on this site." — left out, a ?deck= link
                showed an empty editor with no word of why. */}
            <Suspense fallback={null}>
                <DeckHandoffLoader
                    target="decks"
                    authEnabled={authEnabled}
                    ready={hydrated}
                    onDeck={(d) => {
                        if (d.id === null) return;
                        requestOpen({ id: d.id, name: d.name ?? "Deck", decklist: d.decklist, format: d.format });
                    }}
                />
            </Suspense>

            {phase === "loading" && (
                <section className="bg-parchment-dark shadow-card rounded-lg p-4 sm:p-6">
                    <p className="text-ink/60">Loading...</p>
                </section>
            )}

            {phase === "choosing" && (
                <EntryChooser
                    kind="decks"
                    authEnabled={authEnabled}
                    mode={chooser}
                    activeId={chooser === "switch" ? (open?.id ?? null) : null}
                    onOpen={openById}
                    onNew={startNew}
                    newLabel="Start a new deck"
                    // On arrival, a draft that outlived the last visit. When
                    // switching, the deck on the page is what "Back" returns
                    // to, so it isn't offered twice.
                    resume={
                        chooser === "entry" && (text || name || open)
                            ? {
                                  label: "Pick up where you left off",
                                  detail: open
                                      ? `“${open.name}”${dirty ? ", with changes you haven't saved" : ""}.`
                                      : `${name.trim() ? `“${name.trim()}”` : "A deck"} you hadn't saved yet.`,
                                  onResume: () => setPhase("editing"),
                              }
                            : null
                    }
                    onCancel={chooser === "switch" ? () => setPhase("editing") : undefined}
                    cancelLabel={open ? `Back to “${open.name}”` : "Back to your deck"}
                />
            )}

            {phase === "editing" && (
                <>
                    {open ? (
                        <div className="space-y-2">
                            <GuideNameBar
                                kind="decks"
                                id={open.id}
                                name={open.name}
                                onRenamed={(next) => {
                                    patch({ open: { id: open.id, name: next } });
                                    setListVersion((n) => n + 1);
                                }}
                                actions={
                                    <>
                                        <button
                                            type="button"
                                            onClick={() => {
                                                setChooser("switch");
                                                setPhase("choosing");
                                            }}
                                            className={SWITCH_BUTTON_CLASS}
                                        >
                                            Open another...
                                        </button>
                                        <button
                                            type="button"
                                            onClick={busy ? undefined : duplicateOpen}
                                            disabled={busy}
                                            className="px-4 py-2 rounded text-sm font-title bg-parchment text-ink shadow-card hover:bg-parchment/70 disabled:opacity-50"
                                        >
                                            Duplicate
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setConfirmDelete(true)}
                                            disabled={busy}
                                            className="px-4 py-2 rounded text-sm text-ink/70 hover:text-red-700 hover:bg-red-700/10 disabled:opacity-50"
                                        >
                                            Delete
                                        </button>
                                    </>
                                }
                            />
                            {/* Confirmed in the page, not with window.confirm: the
                                native dialog is browser chrome and reads as the
                                browser interrupting, the same reasoning as the
                                Sideboard Planner's Clear. */}
                            {confirmDelete && (
                                <div
                                    role="alert"
                                    className="flex flex-wrap items-center gap-2 rounded border border-red-700/40 bg-red-700/5 px-3 py-2 text-sm"
                                >
                                    <p className="flex-1 min-w-[12rem] [overflow-wrap:anywhere]">
                                        Delete &quot;{open.name}&quot; from your profile? This can&apos;t be undone.
                                    </p>
                                    <button
                                        type="button"
                                        onClick={() => setConfirmDelete(false)}
                                        className="px-3 py-1.5 rounded text-ink/70 hover:bg-parchment"
                                    >
                                        Keep it
                                    </button>
                                    <button
                                        type="button"
                                        onClick={busy ? undefined : deleteOpen}
                                        disabled={busy}
                                        className="px-3 py-1.5 rounded font-title border border-red-700/40 text-red-700 hover:bg-red-700/10 disabled:opacity-50"
                                    >
                                        {busy ? "Deleting..." : "Delete"}
                                    </button>
                                </div>
                            )}
                        </div>
                    ) : (
                        // Without sign-in there's nothing else to open, so no bar
                        // whose only button would lead to a one-option chooser.
                        authEnabled && (
                            <DraftBar title={name.trim() || "New deck"} detail="Not saved yet">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setChooser("switch");
                                        setPhase("choosing");
                                    }}
                                    className={SWITCH_BUTTON_CLASS}
                                >
                                    Open another...
                                </button>
                            </DraftBar>
                        )
                    )}

                    {/* ---- the editor ---- */}
                    <section className="bg-parchment-dark shadow-card rounded-lg p-4 sm:p-6 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <h2 className="text-2xl font-title flex flex-wrap items-center">
                                {/* Not "New deck": that is the button beside it. */}
                                {open ? "Decklist" : "Your deck"}
                                <HelpTip text="Paste a decklist with its sideboard — from Arena, MTGGoldfish or anywhere with one card per line — or an MTGGoldfish deck link. The sideboard starts after a 'Sideboard' line or a single blank line." />
                            </h2>
                            {/* Asks through the leave-guard's dialog when there's
                                unsaved work, like every other way of replacing it. */}
                            {(text || open) && (
                                <button
                                    type="button"
                                    onClick={startNew}
                                    className="px-4 py-2 rounded text-sm font-title bg-parchment text-ink shadow-card hover:bg-parchment/70"
                                >
                                    New deck
                                </button>
                            )}
                        </div>

                        <div className="flex flex-wrap gap-4">
                            {!open && (
                                <label className="flex flex-col gap-1 flex-1 min-w-[12rem]">
                                    <span className="text-sm text-ink/70">Name</span>
                                    <input
                                        type="text"
                                        value={name}
                                        maxLength={120}
                                        onChange={(e) => patch({ name: e.target.value })}
                                        placeholder="Mono-Red Aggro"
                                        className="px-3 py-2 rounded bg-parchment text-ink shadow-inner-parchment"
                                    />
                                </label>
                            )}
                            <label className="flex flex-col gap-1">
                                <span className="text-sm text-ink/70">Format</span>
                                <select
                                    value={format}
                                    onChange={(e) => patch({ format: e.target.value })}
                                    className="px-3 py-2 rounded bg-parchment text-ink shadow-inner-parchment"
                                >
                                    <option value="">No particular format</option>
                                    {DECK_FORMATS.map((f) => (
                                        <option key={f.slug} value={f.slug}>
                                            {f.label}
                                        </option>
                                    ))}
                                    {/* A format saved through the API that isn't in
                                        the list still shows as itself. */}
                                    {!knownFormat && <option value={format}>{deckFormatLabel(format)}</option>}
                                </select>
                            </label>
                        </div>

                        <textarea
                            value={text}
                            onChange={(e) => {
                                patch({ text: e.target.value });
                                setStatus(null);
                            }}
                            aria-label="Decklist"
                            placeholder={"Deck\n4 Lightning Bolt\n4 Monastery Swiftspear\n...\n\nSideboard\n2 Pyroblast\n\nor paste an MTGGoldfish deck link"}
                            className="w-full h-56 p-4 bg-parchment shadow-inner-parchment rounded resize-y text-ink font-mono text-sm"
                        />

                        {isLink && (
                            <div className="flex flex-wrap items-center gap-3">
                                <p className="text-sm text-ink/80">That&apos;s an MTGGoldfish link. Import it to get the list.</p>
                                <button
                                    type="button"
                                    onClick={importing ? undefined : importLink}
                                    disabled={importing}
                                    className="px-5 py-2 rounded shadow-card font-title bg-brand text-midnight-light hover:bg-brand-dark disabled:opacity-50"
                                >
                                    {importing ? "Importing..." : "Import"}
                                </button>
                            </div>
                        )}

                        {sizeError && <p className="text-sm text-red-700">{sizeError}</p>}
                        {noCards && !sizeError && <p className="text-sm text-amber-700">{NO_CARDS_MESSAGE}</p>}
                        {error && (
                            <p className="text-sm text-red-700 [overflow-wrap:anywhere]" role="alert">
                                {error}
                            </p>
                        )}
                        {notice && (
                            <p className="text-sm text-ink/80 [overflow-wrap:anywhere]" role="status">
                                {notice}
                            </p>
                        )}

                        {hasCards && (
                            <div className="flex gap-4 items-start pt-2">
                                <div className="flex-1 min-w-0 grid sm:grid-cols-2 gap-4">
                                    <div className="bg-parchment rounded shadow-inner-parchment p-3">
                                        {cardList("Maindeck", sections.maindeck, mainCount)}
                                    </div>
                                    <div className="bg-parchment rounded shadow-inner-parchment p-3">
                                        {cardList("Sideboard", sections.sideboard, sideCount)}
                                    </div>
                                </div>
                                {/* Beside the list on a wide screen only, pinned while
                                    it scrolls; on a phone there's no room beside it. */}
                                <div className="hidden md:block w-[176px] shrink-0 sticky top-4">
                                    {shownImage && (
                                        <Image
                                            unoptimized
                                            src={shownImage}
                                            alt={shown ?? ""}
                                            width={244}
                                            height={340}
                                            className="w-full h-auto rounded-[4.5%] shadow-card"
                                        />
                                    )}
                                </div>
                            </div>
                        )}
                    </section>

                    {/* Right under the editor: with the saved-deck list gone from
                        the bottom, saving is the page's next step, not its last. */}
                    {authEnabled && (
                        <DeckSaves
                            decklist={normalized}
                            format={format || null}
                            draftName={name}
                            open={open}
                            dirty={Boolean(dirty)}
                            canSave={usable}
                            listVersion={listVersion}
                            onSaved={onSaved}
                        />
                    )}

                    {/* ---- send it somewhere ---- */}
                    <section className="bg-parchment-dark shadow-card rounded-lg p-4 sm:p-6 space-y-3">
                        <h2 className="text-2xl font-title">Use this deck</h2>
                        {!usable && (
                            <p className="text-sm text-ink/70">
                                {isLink
                                    ? "Import the link first."
                                    : sizeError
                                        ? sizeError
                                        : noCards
                                            ? NO_CARDS_MESSAGE
                                            : "Paste a decklist above to use it in the other tools."}
                            </p>
                        )}
                        <div className="grid sm:grid-cols-2 gap-3">
                            {SEND_TARGETS.map((s) => (
                                <button
                                    key={s.target}
                                    type="button"
                                    onClick={() => send(s.target)}
                                    disabled={!usable}
                                    className="text-left rounded shadow-card bg-parchment p-3 hover:bg-brass/15 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <span className="block font-title text-lg">{s.label}</span>
                                    <span className="block text-xs text-ink/65 mt-1">{s.hint}</span>
                                </button>
                            ))}
                        </div>
                        {open && dirty && usable && (
                            <p className="text-xs text-ink/60">
                                Sends the list as it is in the editor, including changes you haven&apos;t saved.
                            </p>
                        )}
                    </section>
                </>
            )}

            {guard.pending && (
                <LeaveDialog
                    pending={guard.pending}
                    onStay={guard.stay}
                    onProceed={guard.proceed}
                    authEnabled={authEnabled}
                    noun="deck"
                    itemName={open?.name ?? (name.trim() || null)}
                    isSaved={open !== null}
                    clearsOnLeave
                    renderSave={(done, label) => (
                        <DeckSaveAndContinue
                            decklist={normalized}
                            format={format || null}
                            draftName={name}
                            open={open}
                            canSave={usable}
                            cannotSaveReason={
                                isLink
                                    ? "There's no list to save yet — the MTGGoldfish link hasn't been imported."
                                    : (sizeError ?? NO_CARDS_MESSAGE)
                            }
                            label={label}
                            onSaved={onSaved}
                            done={done}
                        />
                    )}
                />
            )}
        </div>
    );
}
