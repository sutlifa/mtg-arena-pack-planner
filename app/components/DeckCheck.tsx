"use client";

import { useState, useEffect, useRef, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import HelpTip from "./HelpTip";
import { activate } from "./activate";
import FitText from "./FitText";
import PageHeader from "./PageHeader";
import { isGoldfishDeckUrl } from "@/lib/goldfishUrl";
import { mergeCollection, tidyCollection } from "@/lib/collectionText";
import { COLLECTION_KEY, MODE_KEY, OPEN_KEY, decodeOpen, type OpenRef } from "@/lib/openCollection";
import {
    DECK_CHECK_COLLECTION_KEY,
    decodeDeckCheckCollection,
    encodeDeckCheckCollection,
    type DeckCheckCollection,
} from "@/lib/deckCheckCollection";
import { deckCounts, deckFormatLabel, plannerDeckText } from "@/lib/deckText";
import {
    DECK_CHECK_SLOTS_KEY,
    decodeSlots,
    encodeSlots,
    isEdited,
    slotFromSaved,
    type DeckSlot,
    type LinkedDeck,
} from "@/lib/deckSlots";
import type { HandoffDeck } from "@/lib/deckHandoff";
import DeckCheckSaves, { type OpenedAnalysis } from "./DeckCheckSaves";
import SaveWorkButton, { type SavedRef } from "./SaveWorkButton";
import SavedDeckPicker, { type PickedDeck } from "./SavedDeckPicker";
import SavedCollectionPicker, { type OpenedCollection } from "./SavedCollectionPicker";
import DeckSlotSave from "./DeckSlotSave";
import DeckShortfall from "./DeckShortfall";
import { DeckHandoffLoader, type Arrival } from "./DeckHandoff";

type Wildcards = {
    common: number;
    uncommon: number;
    rare: number;
    mythic: number;
    other: number;
};

/**
 * What /api/analyze can answer with: a result, or just an `error` string (the
 * 413 size limits, a 400 bad body). Every field is optional so a failed
 * response can be read for its message without pretending it is a result.
 */
interface AnalyzeResponse {
    breakdown?: any[];
    shoppingList?: any[];
    recommendations?: any[];
    wildcards?: Wildcards | null;
    missingCards?: string[];
    error?: string;
}

/**
 * What was just opened into Deck Check, spelled out.
 *
 * Opening a comparison used to load its decklists and leave the user to
 * work out the rest — whether a collection came with it, which one was now
 * in use, and that nothing would happen until they pressed Analyze. This is
 * the answer to all three, kept on screen (not a toast) until the next open
 * or Start Over, so it is still there after scrolling down to the results
 * and back.
 */
interface OpenedSummary {
    headline: string;
    parts: string[];
    note: string | null;
}

/**
 * The inputs the results on screen were worked out from, captured when
 * Analyze succeeded. The per-deck "what's missing" view reads these rather
 * than the live boxes, so it always describes the same run as the breakdown
 * beside it — typing in a slot afterwards changes neither until the next
 * Analyze.
 */
interface Checked {
    decks: { key: number; title: string; savedId: number | null; text: string }[];
    collection: string;
    /** Which collection that was, in words, for the heading. */
    against: string;
    arena: boolean;
}

/** Copies, not lines — "1,204 cards" is what someone recognises as their collection. */
function collectionSize(text: string): number {
    return mergeCollection(text).reduce((n, c) => n + c.qty, 0);
}

function plural(n: number, one: string, many = `${one}s`): string {
    return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}

/**
 * The Collection page's collection, as it is in storage right now: its text,
 * which saved row it was opened from (if the fingerprint still matches — see
 * lib/openCollection), and its Arena/Paper type.
 */
function readLocalCollection(): { text: string; open: OpenRef | null; paper: boolean | null } {
    const raw = localStorage.getItem(COLLECTION_KEY);
    const mode = localStorage.getItem(MODE_KEY);
    return {
        // Merged on the way in, so a collection stored before merging existed
        // reads as one line per card too.
        text: raw ? tidyCollection(raw) : "",
        open: decodeOpen(localStorage.getItem(OPEN_KEY), raw),
        paper: mode ? mode === "paper" : null,
    };
}

const BADGE = "px-2 py-0.5 rounded-full text-xs font-semibold tracking-wide";

/**
 * Slot keys. They only ever go up, so a removed slot's key is never reused
 * and React never hands one slot's half-typed save form to another.
 *
 * A module-level counter rather than a useRef: slots are created from
 * handlers passed through activate(), which the React Compiler can't see
 * into, so it treats any ref those handlers touch as read during render.
 * Uniqueness within one page's list is all a key needs, and a counter shared
 * by every instance still gives that. The first slot is created in initial
 * state with key 0, below anything this hands out.
 */
let lastSlotKey = 0;
const nextSlotKey = () => ++lastSlotKey;

/**
 * Deck Check: decks against a collection — what's missing, and what it costs
 * to get.
 *
 * This was the Pack Planner. It became the one place that compares decks
 * with a collection when the Collection page's "Compare with a deck" panel and
 * the Decks page's "Check against my collection" were folded into it: the
 * Collection page now only edits the collection, the Decks page only edits
 * decks, and both send here. The per-deck missing-cards view that panel gave
 * is part of the results below (DeckShortfall).
 *
 * Two boxes feed it:
 *
 * - Deck slots (lib/deckSlots). Each is a saved deck added with "Add existing
 *   deck", or a pasted list / MTGGoldfish link, and says which. A pasted one
 *   can be saved to the Decks tab; a saved one that's been edited here says
 *   so and offers to save the changes or save a copy, never silently.
 * - The collection (lib/deckCheckCollection): your Collection page
 *   collection by default, a saved collection picked with "Load collection",
 *   or one pasted with "New". Whichever it is is always named on screen.
 *   Loading or pasting one here doesn't touch the Collection page's.
 *
 * Signed out everything works except saving and the two pickers, which show a
 * sign-in prompt; on a deployment without sign-in those don't render at all
 * (authEnabled comes from isAuthConfigured(), a plain env read, so the page
 * stays statically prerendered).
 */
export default function DeckCheck({ authEnabled }: { authEnabled: boolean }) {
    /* ---- deck slots ---- */

    const [slots, setSlots] = useState<DeckSlot[]>([{ key: 0, text: "", saved: null }]);
    const makeSlot = (text = "", saved: LinkedDeck | null = null): DeckSlot => ({
        key: nextSlotKey(),
        text,
        saved,
    });
    // What /api/analyze and a saved comparison take: the text of every slot.
    const decks = slots.map((s) => s.text);

    /* ---- the collection ---- */

    // The Collection page's collection, read from its storage (never written
    // from here — that page owns it).
    const [localText, setLocalText] = useState("");
    const [localOpen, setLocalOpen] = useState<OpenRef | null>(null);
    // Anything other than that one; null means "the Collection page's".
    const [chosen, setChosen] = useState<DeckCheckCollection | null>(null);
    const collection = chosen ? chosen.text : localText;
    // Set by the pasted collection box's paste event, read by the change it causes.
    const pastedRef = useRef(false);
    /** A collection switch waiting on "the pasted collection isn't saved — switch anyway?" */
    const [pendingSwitch, setPendingSwitch] = useState<{ label: string; run: () => void } | null>(null);

    /**
     * Which saved comparison is open, if any — what Save Comparison updates.
     * Held here rather than in DeckCheckSaves because Start Over has to clear
     * it with everything else: a reset that left an id behind would aim the
     * next Save at the work just abandoned.
     */
    const [openAnalysis, setOpenAnalysis] = useState<SavedRef>(null);
    const [opened, setOpened] = useState<OpenedSummary | null>(null);

    /**
     * Run the analysis once whatever was just opened has landed in state.
     *
     * Opening a comparison or a deck sets the decks, the collection and the
     * mode in one batch, but processAll reads them from the render it was
     * created in — calling it from the same handler would analyze what was on
     * screen *before* the open. So the opener bumps this token instead, and
     * the effect below runs processAll from the next render, where all three
     * are in place.
     *
     * lastRunToken is the double-run guard: an effect that runs twice for one
     * token (React StrictMode does that in development, and the Arena/Paper
     * effect can fire in the same commit) analyzes once.
     */
    const [runToken, setRunToken] = useState(0);
    const lastRunToken = useRef(0);
    const requestRun = () => setRunToken((t) => t + 1);

    const [breakdown, setBreakdown] = useState<any[]>([]);
    const [shoppingList, setShoppingList] = useState<any[]>([]);
    const [recommendations, setRecommendations] = useState<any[]>([]);
    const [wildcards, setWildcards] = useState<Wildcards | null>(null);
    const [missingCards, setMissingCards] = useState<string[]>([]);
    const [checked, setChecked] = useState<Checked | null>(null);
    // Two error surfaces, because they are two different things. importError
    // is a *warning* about the deck slots — a link that would not import —
    // and the analysis still runs on whatever did import, so it belongs under
    // the slots next to the input it is about. analyzeError is terminal: the
    // analysis produced nothing, so it sits at the Analyze button, the same
    // place /rotation puts its failures.
    const [importError, setImportError] = useState<string | null>(null);
    const [analyzeError, setAnalyzeError] = useState<string | null>(null);
    const [mergePaperCounts, setMergePaperCounts] = useState(false);
    const [disableArena, setDisableArena] = useState(false);
    const [openSets, setOpenSets] = useState<Record<string, boolean>>({});
    const [loading, setLoading] = useState(false);
    const [zoomCard, setZoomCard] = useState<any>(null);
    const [flip, setFlip] = useState(false);

    // Per-card chosen printing (art/version), keyed by canonical card name.
    const [printingOverrides, setPrintingOverrides] = useState<
        Record<string, { set: string; collector_number: string }>
    >({});
    const reanalyzeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const toggleSet = (code: string) => {
        setOpenSets((prev) => ({
            ...prev,
            [code]: !prev[code],
        }));
    };

    // ✅ ESC key closes modal
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                setZoomCard(null);
                setFlip(false);
            }
        };

        window.addEventListener("keydown", handleKey);
        return () => window.removeEventListener("keydown", handleKey);
    }, []);

    // Nothing is written back to storage until the saved values have been
    // read: the write effect below also runs on the very first render, with
    // nothing chosen, and would otherwise wipe a stored choice before the
    // restore landed.
    const [hydrated, setHydrated] = useState(false);

    // Restore once, after mount (not during the initial render, so the
    // server-rendered and first client render both start empty and hydration
    // stays consistent): the deck slots this tab had, the Collection page's
    // collection, and whichever other collection this tab had chosen.
    //
    // The slots restored here are only a starting point. A deck arriving by
    // ?deck= or hand-off joins them (openDeck); a comparison by ?analysis=
    // replaces them. Neither can be overwritten by this restore, because both
    // loaders wait for `hydrated`, which is set at the end of this same
    // effect. So the order is always: restore, then whatever the link asked
    // for, once.
    //
    // ?source=collection is the Collection page's "Check decks against this
    // collection" link. It asks for that page's collection specifically, so
    // it wins over a choice this tab remembered; a link that said "this
    // collection" and then compared against another would be a lie. Read from
    // window.location rather than useSearchParams so this component doesn't
    // need a Suspense boundary of its own.
    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        try {
            const storedSlots = decodeSlots(sessionStorage.getItem(DECK_CHECK_SLOTS_KEY));
            if (storedSlots) setSlots(storedSlots.map((s) => ({ ...s, key: nextSlotKey() })));
        } catch {
            // Unreadable — start with the one empty slot.
        }
        try {
            const local = readLocalCollection();
            setLocalText(local.text);
            setLocalOpen(local.open);

            let restored: DeckCheckCollection | null = null;
            const here = new URL(window.location.href);
            if (here.searchParams.get("source") === "collection") {
                sessionStorage.removeItem(DECK_CHECK_COLLECTION_KEY);
                here.searchParams.delete("source");
                window.history.replaceState(null, "", here.pathname + here.search + here.hash);
            } else {
                restored = decodeDeckCheckCollection(sessionStorage.getItem(DECK_CHECK_COLLECTION_KEY));
            }

            if (restored) {
                setChosen(restored);
                setDisableArena(!restored.arena);
            } else if (local.paper !== null) {
                setDisableArena(local.paper);
            }
        } catch {
            // Storage unavailable (private browsing, etc.) — start empty.
        }
        setHydrated(true);
    }, []);
    /* eslint-enable react-hooks/set-state-in-effect */

    // A collection chosen here (saved or pasted) survives a reload and the
    // trip through sign-in, in this tab only — lib/deckCheckCollection.
    useEffect(() => {
        if (!hydrated) return;
        try {
            const value = chosen ? encodeDeckCheckCollection({ ...chosen, arena: !disableArena }) : null;
            if (value) sessionStorage.setItem(DECK_CHECK_COLLECTION_KEY, value);
            else sessionStorage.removeItem(DECK_CHECK_COLLECTION_KEY);
        } catch {
            // Storage unavailable or full — the choice just won't outlive the page.
        }
    }, [hydrated, chosen, disableArena]);

    // The slots, kept for this tab — see lib/deckSlots for why (signing in
    // is a full-page trip). Start Over leaves one empty slot, which encodes
    // to nothing, so it clears this too.
    useEffect(() => {
        if (!hydrated) return;
        try {
            const value = encodeSlots(slots);
            if (value) sessionStorage.setItem(DECK_CHECK_SLOTS_KEY, value);
            else sessionStorage.removeItem(DECK_CHECK_SLOTS_KEY);
        } catch {
            // Full or unavailable: drop the stale copy rather than restore
            // an older version of the slots later.
            try {
                sessionStorage.removeItem(DECK_CHECK_SLOTS_KEY);
            } catch {
                /* nothing more to do */
            }
        }
    }, [hydrated, slots]);

    // The Collection page edited in another tab: keep "your Collection page
    // collection" true to its name. (The same tab needs nothing — moving
    // between the pages remounts this one, which reads storage afresh.)
    useEffect(() => {
        const onStorage = (e: StorageEvent) => {
            if (e.key !== null && e.key !== COLLECTION_KEY && e.key !== OPEN_KEY) return;
            try {
                const local = readLocalCollection();
                setLocalText(local.text);
                setLocalOpen(local.open);
            } catch {
                /* nothing readable; keep what's shown */
            }
        };
        window.addEventListener("storage", onStorage);
        return () => window.removeEventListener("storage", onStorage);
    }, []);

    const [confirmClear, setConfirmClear] = useState(false);

    /**
     * Drop every piece of a previous analysis.
     *
     * Called whenever an analyze fails. Leaving the last run's breakdown,
     * shopping list, wildcard counts and set recommendations on screen means
     * the previous deck's numbers silently become the answer to the deck that
     * was just submitted — a wrong verdict reads worse than no verdict, so a
     * failure clears the board and says so. Same rule as the Rotation Checker.
     */
    const clearResults = () => {
        setBreakdown([]);
        setShoppingList([]);
        setRecommendations([]);
        setWildcards(null);
        setMissingCards([]);
        setChecked(null);
    };

    const hasResults = breakdown.length > 0 || shoppingList.length > 0 || checked !== null;
    const hasDecks = slots.some((s) => s.text.trim());

    /* ---- describing the collection in use ---- */

    const pastedText = chosen?.source.kind === "pasted" ? chosen.text : "";

    /** Which collection is in use, in words — for headings and summaries. */
    const sourceName = (): string => {
        if (!chosen) return "your Collection page collection";
        if (chosen.source.kind === "saved") {
            return `saved ${chosen.source.arena ? "Arena" : "Paper"} collection "${chosen.source.name}"`;
        }
        return chosen.source.from
            ? `the collection saved with "${chosen.source.from}"`
            : "the collection pasted here";
    };

    /**
     * The "collection:" part of an opened summary, for an open that keeps
     * whatever collection is already in use (a comparison saved without one,
     * or a deck from the Decks page). Says which collection that is, because
     * "no collection" and "the one you had open" give very different answers.
     */
    const currentCollectionPart = (): string => {
        if (!collection.trim()) {
            return `${sourceName()} is empty, so every card counts as missing`;
        }
        return `using ${sourceName()} (${plural(collectionSize(collection), "card")})`;
    };

    /**
     * After the collection changes: results already on screen were worked out
     * against the old one, so they're re-run, and the banner says so. With no
     * results there is nothing to correct, and the collection box itself
     * already names what's in use.
     */
    const afterCollectionChange = (headline: string, parts: string[]) => {
        if (hasResults && hasDecks) {
            setOpened({
                headline,
                parts,
                note: "Your decks are unchanged; the results below have been re-run against it.",
            });
            requestRun();
        }
    };

    /**
     * Guard for the collection box's own switches: a collection pasted here
     * exists nowhere else until it's saved, so moving away from it asks
     * first. (Opening a comparison or a deck from elsewhere doesn't ask —
     * those are deliberate opens, and a comparison without a collection keeps
     * the one in use anyway.)
     */
    const guardPasted = (label: string, run: () => void) => {
        if (pastedText.trim()) setPendingSwitch({ label, run });
        else run();
    };

    /** Back to the Collection page's collection, in that collection's own mode. */
    const switchToLocal = (quiet = false) => {
        let paper: boolean | null = null;
        try {
            const local = readLocalCollection();
            setLocalText(local.text);
            setLocalOpen(local.open);
            paper = local.paper;
        } catch {
            /* keep what was read on arrival */
        }
        setChosen(null);
        if (paper !== null) setDisableArena(paper);
        if (!quiet) afterCollectionChange("Now checking against your Collection page collection", []);
    };

    /**
     * A saved collection — from "Load collection", or ?collection= from the
     * profile. Deck Check switches to its mode: comparing an Arena collection
     * in Paper Mode silently gives the wrong answer.
     */
    const loadSavedCollection = (c: OpenedCollection) => {
        const text = tidyCollection(c.raw_text ?? "");
        const mode = c.arena_mode ? "Arena" : "Paper";
        setChosen({ source: { kind: "saved", id: c.id, name: c.name, arena: c.arena_mode }, text, arena: c.arena_mode });
        setDisableArena(!c.arena_mode);
        afterCollectionChange(`Now checking against ${mode} collection "${c.name}"`, [
            plural(collectionSize(text), "card"),
            `${mode} mode`,
        ]);
    };

    const startPastedCollection = () => {
        setChosen({ source: { kind: "pasted", from: null }, text: "", arena: !disableArena });
    };

    const setPastedText = (text: string) =>
        setChosen((prev) => (prev && prev.source.kind === "pasted" ? { ...prev, text } : prev));

    /**
     * Full reset: every deck slot, a collection chosen here, the last
     * analysis, and the open comparison.
     *
     * It goes back to the Collection page's collection rather than to an
     * empty one: that collection was never Deck Check's to clear (it used to
     * be — Start Over here wiped the Collection page too). Arena/Paper goes
     * back to that collection's type with it, since the mode follows the
     * collection; the merge-counts checkbox survives, the way the Sideboard
     * Planner keeps the format through its Start Over — it is how you work,
     * not what you typed.
     */
    const resetEverything = () => {
        setSlots([makeSlot()]);
        switchToLocal(true);
        setPendingSwitch(null);
        setOpenAnalysis(null);
        setOpened(null);
        setPrintingOverrides({});
        setOpenSets({});
        setImportError(null);
        setAnalyzeError(null);
        clearResults();
    };

    // The empty-Analyze message, and the way it goes away: as soon as a slot
    // has something in it, it is no longer true. Only this message — a real
    // failure from the server stays until the next Analyze, since it
    // describes a run that did happen.
    const noDecksMessage = authEnabled
        ? "Paste a decklist or add a saved deck first."
        : "Paste a decklist first.";
    const clearNoDecksError = () =>
        setAnalyzeError((current) => (current === noDecksMessage ? null : current));

    const processAll = async (
        printingOverridesArg?: Record<string, { set: string; collector_number: string }>
    ) => {
        // Nothing to check: say so at the button instead of asking the server
        // to analyze nothing and showing "No breakdown yet", which reads as
        // if the click did nothing. Results already on screen stay — they
        // describe the last decks checked, and the message says why no new
        // ones came.
        if (!decks.some((d) => d.trim())) {
            setAnalyzeError(noDecksMessage);
            return;
        }

        setAnalyzeError(null);
        setLoading(true);

        try {
            // Resolve any slot that's just a pasted MTGGoldfish link into its
            // real decklist text before analyzing.
            let currentDecks = decks;

            if (decks.some((d) => isGoldfishDeckUrl(d.trim()))) {
                let anyFailed = false;

                currentDecks = await Promise.all(
                    decks.map(async (d) => {
                        const trimmed = d.trim();
                        if (!isGoldfishDeckUrl(trimmed)) return d;

                        try {
                            const importRes = await fetch("/api/import-deck", {
                                method: "POST",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ url: trimmed }),
                            });
                            const importData = await importRes.json();

                            if (importRes.ok && importData.decklist) {
                                return importData.decklist;
                            }
                        } catch {
                            // fall through to anyFailed below
                        }

                        anyFailed = true;
                        return d;
                    })
                );

                // Only the slots that were imported change, matched by key:
                // anything typed into another slot while the import was in
                // flight is kept.
                const imported = new Map<number, string>();
                slots.forEach((s, i) => {
                    if (currentDecks[i] !== s.text) imported.set(s.key, currentDecks[i]);
                });
                setSlots((prev) =>
                    prev.map((s) => (imported.has(s.key) ? { ...s, text: imported.get(s.key) ?? s.text } : s))
                );
                setImportError(
                    anyFailed
                        ? "Couldn't import one or more MTGGoldfish links — check the URL and try again."
                        : null
                );
            } else {
                setImportError(null);
            }

            const res = await fetch("/api/analyze", {

                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    decklist: currentDecks,
                    collection,
                    arenaMode: !disableArena,
                    mergePaperCounts,
                    printingOverrides: printingOverridesArg ?? printingOverrides,
                }),

            });

            // An error response is normally JSON carrying a user-facing
            // `error`, but a proxy or a crash can return HTML — so parsing is
            // allowed to fail without becoming the thing we report.
            const data = (await res.json().catch(() => null)) as AnalyzeResponse | null;

            if (!res.ok || !Array.isArray(data?.breakdown)) {
                console.error("Analyze API error:", res.status, data?.error ?? "(no message)");
                clearResults();
                setAnalyzeError(
                    data?.error ?? "Couldn't analyze those decks — please try again in a moment."
                );
                setLoading(false);
                return;
            }

            setBreakdown(data.breakdown || []);
            setShoppingList(data.shoppingList || []);

            // ⭐ Only update recommendations when backend includes them

            if (data.recommendations !== undefined) {
                setRecommendations(data.recommendations);
            }

            setWildcards(data.wildcards ?? null);
            setMissingCards(data.missingCards ?? []);

            setChecked({
                decks: slots
                    .map((s, i) => ({
                        key: s.key,
                        title: s.saved ? (isEdited(s) ? `${s.saved.name} (edited here)` : s.saved.name) : `Deck ${i + 1}`,
                        savedId: s.saved?.id ?? null,
                        text: currentDecks[i] ?? "",
                    }))
                    .filter((d) => d.text.trim()),
                collection,
                against: collection.trim()
                    ? `${sourceName()} (${plural(collectionSize(collection), "card")})`
                    : `${sourceName()}, which is empty`,
                arena: !disableArena,
            });
        } catch (err) {
            console.error("Request failed:", err);
            clearResults();
            setAnalyzeError("Couldn't analyze those decks — check your connection and try again.");
        }

        setLoading(false);
    };

    // Called when a card's art/version slider moves. Updates which printing
    // is chosen immediately (image/price/set redraw from data already on
    // hand — no server round-trip needed for that), then debounces a
    // re-analyze so Wildcards Needed / Set Recommendations catch up with
    // the newly-chosen set + rarity without spamming the server while the
    // user is still dragging.
    const handleVersionChange = (
        canonical: string,
        set: string,
        collectorNumber: string
    ) => {
        // Computed directly (not read back from state) so the debounced
        // call below always sees this exact update, not whatever
        // printingOverrides happened to be when this render's processAll
        // closure was created.
        const updated = {
            ...printingOverrides,
            [canonical]: { set, collector_number: collectorNumber },
        };
        setPrintingOverrides(updated);

        if (reanalyzeTimer.current) clearTimeout(reanalyzeTimer.current);
        reanalyzeTimer.current = setTimeout(() => {
            processAll(updated);
        }, 500);
    };

    // Re-run analysis when switching Arena/Paper mode, or when Paper Mode's
    // "Add counts together" changes — both change how needed counts (and
    // Arena-only data like wildcards/recommendations) are computed, so a
    // stale result from the previous mode would otherwise stick around
    // until the user manually clicks Analyze again.
    //
    // Skipped while an open is waiting to run (runToken ahead of
    // lastRunToken): opening a Paper comparison over Arena results changes
    // the mode in the same commit, and the run below already covers it.
    // This effect is declared first, so it sees the token before the run
    // effect marks it handled.
    /* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */
    useEffect(() => {
        if (runToken !== lastRunToken.current) return;
        // checked too: a deck you already own every card of has an empty
        // breakdown, but its per-deck view still names the mode it ran in.
        if (breakdown.length > 0 || shoppingList.length > 0 || checked) {
            processAll();
        }
    }, [disableArena, mergePaperCounts]);

    // The run an open asked for — see runToken.
    useEffect(() => {
        if (runToken === 0 || runToken === lastRunToken.current) return;
        lastRunToken.current = runToken;
        processAll();
    }, [runToken]);
    /* eslint-enable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

    /**
     * A saved comparison: its decklists, its collection if it has one, and
     * its mode — then the analysis, without a click. Only inputs were ever
     * saved (see lib/db/schema.sql), so this is the comparison re-run
     * against today's prices and card data, which is the only honest way to
     * "open" one.
     *
     * Its decks come back as pasted slots: a comparison stores deck text, not
     * links to saved decks, so it still opens after those decks are edited or
     * deleted.
     *
     * A comparison saved with no collection keeps the collection already in
     * use rather than emptying it: emptying it would make every card
     * "missing", for a comparison that never had an opinion about it.
     */
    const openComparison = (a: OpenedAnalysis) => {
        const decklists = (Array.isArray(a.decklists) ? a.decklists : []).filter(
            (d): d is string => typeof d === "string" && Boolean(d.trim())
        );
        const savedCollection = tidyCollection(a.collection ?? "");
        const mode = a.arena_mode ? "Arena" : "Paper";

        let collectionPart: string;
        if (savedCollection) {
            setChosen({ source: { kind: "pasted", from: a.name }, text: savedCollection, arena: a.arena_mode });
            collectionPart = `collection: ${plural(collectionSize(savedCollection), "card")}, saved with this comparison`;
        } else {
            collectionPart = `no collection saved with it — ${currentCollectionPart()}`;
        }

        setSlots(decklists.length ? decklists.map((d) => makeSlot(d)) : [makeSlot()]);
        setDisableArena(!a.arena_mode);
        setOpenAnalysis({ id: a.id, name: a.name, arena: a.arena_mode });
        setPendingSwitch(null);
        // Printing picks belong to the decks they were made for.
        setPrintingOverrides({});
        setOpenSets({});
        setOpened({
            headline: `Opened comparison "${a.name}"`,
            parts: [plural(decklists.length, "deck"), collectionPart, `${mode} mode`],
            note: decklists.length
                ? "Re-run against today's card data — the results are below."
                : "It has no decklists, so there is nothing to compare yet.",
        });
        if (decklists.length) requestRun();
    };

    /**
     * Where a deck joining the slots goes, as "Add existing deck" and an
     * arriving deck both place it: the first empty pasted slot, else a new
     * one at the end. Pure over `prev`, so it can run inside a state updater.
     */
    const placeSlot = (prev: DeckSlot[], slot: DeckSlot): DeckSlot[] => {
        const empty = prev.findIndex((s) => !s.saved && !s.text.trim());
        if (empty < 0) return [...prev, slot];
        const next = [...prev];
        next[empty] = slot;
        return next;
    };

    /**
     * A deck sent from the Decks page (or the profile's ?deck=), checked
     * against whatever collection is in use, in whatever mode is on.
     *
     * It joins the slots rather than replacing them. It used to replace them,
     * when slots lived only in component state and arriving from another page
     * meant there was nothing to lose; now they are kept for the tab
     * (lib/deckSlots), so the decks already here are real work, and sending a
     * second deck from the Decks page to check beside the first is exactly
     * what someone would do. A saved comparison (?analysis=) still replaces
     * everything — that is the comparison's contents — but a single deck
     * doesn't get to.
     *
     * The same saved deck (same id) is never added twice: the slot already
     * holding it is brought up to date with what was sent instead, and the
     * banner says which slot that was. A pasted deck identical to a pasted
     * slot is treated the same way, for the same reason.
     *
     * A deck with an id lands as that saved deck. If it came by hand-off it
     * carried edits the Decks page hadn't saved, so it is marked edited from
     * the start rather than claiming to be the stored deck.
     *
     * The open comparison, if any, stays open: its decks are all still on
     * screen, so adding one is an edit of it, as typing in a new slot would be.
     */
    const openDeck = (d: HandoffDeck, arrival: Arrival) => {
        const { main, side } = deckCounts(d.decklist);
        const text = plannerDeckText(d.decklist);
        const linked: LinkedDeck | null =
            d.id === null
                ? null
                : {
                      id: d.id,
                      name: d.name ?? "Saved deck",
                      format: d.format,
                      baseline: arrival.stored ? text : null,
                  };

        // `slots` is this render's — the loader calls the newest openDeck
        // through a ref, after hydration, so the restored slots are in it.
        const existing = slots.findIndex((s) =>
            linked ? s.saved?.id === linked.id : !s.saved && plannerDeckText(s.text) === text
        );
        const others = slots.filter((s, i) => i !== existing && (s.text.trim() || s.saved)).length;
        const name = d.name ? `"${d.name}"` : "your deck";

        let headline: string;
        if (existing >= 0) {
            const key = slots[existing].key;
            setSlots((prev) => prev.map((s) => (s.key === key ? { ...s, text, saved: linked } : s)));
            headline =
                plannerDeckText(slots[existing].text) === text
                    ? `${d.name ? `"${d.name}"` : "That deck"} is already in Deck ${existing + 1}`
                    : `Updated Deck ${existing + 1} with the version of ${name} you sent`;
        } else {
            const slot: DeckSlot = { key: nextSlotKey(), text, saved: linked };
            setSlots((prev) => placeSlot(prev, slot));
            headline = d.name ? `Added deck "${d.name}"` : "Added your deck from the Decks page";
        }

        setAnalyzeError(null);
        setOpened({
            headline,
            parts: [
                `${plural(main, "maindeck card")} + ${plural(side, "sideboard card")}`,
                ...(others > 0 ? [`alongside ${plural(others, "other deck")}`] : []),
                `collection: ${currentCollectionPart()}`,
                `${disableArena ? "Paper" : "Arena"} mode`,
            ],
            note: "Checked automatically — the results are below. Switch Arena/Paper to re-run it in the other mode.",
        });
        requestRun();
    };

    /** "Add existing deck": into the first empty pasted slot, or a new one. */
    const addExistingDeck = (deck: PickedDeck) => {
        const slot = slotFromSaved(nextSlotKey(), deck);
        setSlots((prev) => placeSlot(prev, slot));
        clearNoDecksError();
    };

    const rarityColor = (rarity: string) => {
        switch (rarity) {
            case "common":
                return "text-gray-700";
            case "uncommon":
                return "text-blue-700";
            case "rare":
                return "text-yellow-700";
            case "mythic":
            case "mythic rare":
                return "text-red-700";
            default:
                return "text-ink";
        }
    };

    const updateSlotText = (key: number, text: string) => {
        setSlots((prev) => prev.map((s) => (s.key === key ? { ...s, text } : s)));
        if (text.trim()) clearNoDecksError();
    };

    const addSlot = () => setSlots((prev) => [...prev, makeSlot()]);
    const removeSlot = (key: number) => setSlots((prev) => prev.filter((s) => s.key !== key));
    // The last slot is emptied rather than removed: the box always has one
    // to paste into. Same key, so React keeps the textarea (and its focus).
    const clearSlot = (key: number) =>
        setSlots((prev) => prev.map((s) => (s.key === key ? { key, text: "", saved: null } : s)));
    const linkSlot = (key: number, linked: LinkedDeck, text: string) =>
        setSlots((prev) => prev.map((s) => (s.key === key ? { ...s, text, saved: linked } : s)));

    const copyShoppingList = () => {
        const text = shoppingList
            .map((item) => {
                const printing = disableArena
                    ? item.lookup?.paperPrinting
                    : item.lookup?.arenaPrinting;

                const displayName =
                    printing?.printed_name ??
                    printing?.name ??
                    item.card;

                return `${item.needed} ${displayName}`;
            })
            .join("\n");

        navigator.clipboard.writeText(text);
    };

    // Totals for the shopping list / Arena import block.
    //
    // `totalCards` counts COPIES, not distinct names — that's the number
    // you're actually buying, and it's what the pasted list adds up to.
    // `uniqueCards` is the number of lines in that paste, which is what
    // TCGPlayer's mass entry shows as separate rows. The price total is
    // Paper Mode only; Arena has no dollar cost.
    const shoppingListSummary = () => {
        let total = 0;
        let missingPriceCount = 0;
        let totalCards = 0;

        for (const item of shoppingList) {
            totalCards += item.needed;

            const price = parseFloat(item.lookup?.paperPrinting?.prices_usd);
            if (Number.isNaN(price)) {
                missingPriceCount += 1;
            } else {
                total += price * item.needed;
            }
        }

        return {
            total,
            missingPriceCount,
            totalCards,
            uniqueCards: shoppingList.length,
        };
    };

    // Is there anything a reset would actually destroy? Saved decks and the
    // Collection page's collection live elsewhere and survive it, so only
    // the slots' text and a collection pasted here count. Nothing at risk
    // means the confirmation is pure friction, so Start Over just clears.
    const hasWork = hasDecks || Boolean(pastedText.trim());

    // A comparison stores the decklists AND the collection, so it is the save
    // that preserves everything on screen. With no decks there is no
    // comparison to make, and the only thing at risk is a pasted collection.
    const rescueKind = hasDecks ? "comparison" : "collection";

    // One element rendered in two places: the desktop and mobile analyze
    // blocks sit at different points in the page and only one is ever
    // displayed, the same arrangement the analyze error already uses. Written
    // once so the two copies cannot drift apart.
    const startOverButton = (
        <button
            type="button"
            {...activate(
                () => {
                    if (!hasWork) {
                        resetEverything();
                        return;
                    }
                    setConfirmClear(true);
                },
                // Disabled mid-analysis: the in-flight request would write its
                // breakdown into the page you just cleared.
                { disabled: loading }
            )}
            disabled={loading}
            className="px-5 py-3 rounded shadow-card font-title bg-parchment text-ink hover:bg-parchment/70 disabled:opacity-50"
        >
            Start Over
        </button>
    );

    const sourceButton = (active: boolean) =>
        "px-4 py-2 rounded font-title text-sm " +
        (active ? "bg-brass text-brass-ink" : "bg-parchment text-ink shadow-card hover:bg-parchment/70");

    const savedDeckIds = slots.flatMap((s) => (s.saved ? [s.saved.id] : []));
    const collectionCopies = collectionSize(collection);
    const collectionCards = mergeCollection(collection).length;

    return (
        <div className="px-6 pt-8">
            <main className="max-w-5xl mx-auto py-10 px-6 space-y-10 text-ink">

                    <PageHeader
                        title="Deck Check"
                        subtitle="Check your decks against the cards you own: what each deck is missing, the wildcards and packs it would take on Arena, or a priced shopping list for paper."
                        art="/art/banner-planner.svg"
                    />

                    {/* A deck sent from the Decks page or the profile. Outside the
                        authEnabled block on purpose: an unsaved deck arrives by
                        hand-off and needs no account. Suspense because it reads
                        ?deck= with useSearchParams; see DeckHandoff. */}
                    <Suspense fallback={null}>
                        <DeckHandoffLoader
                            target="deckCheck"
                            ready={hydrated}
                            authEnabled={authEnabled}
                            onDeck={openDeck}
                        />
                    </Suspense>

                    {opened && (
                        <section
                            role="status"
                            className="bg-parchment-dark shadow-card rounded-lg px-4 py-3 sm:px-6 border-l-4 border-brass"
                        >
                            <div className="flex items-start gap-3">
                                {/* overflow-wrap:anywhere — the headline quotes a
                                    saved name, which is the user's own text and
                                    can be one long unbroken token. */}
                                <div className="min-w-0 flex-1 space-y-1 [overflow-wrap:anywhere]">
                                    <p className="font-title text-lg leading-snug">{opened.headline}</p>
                                    {opened.parts.length > 0 && (
                                        <p className="text-sm text-ink/80">{opened.parts.join(" · ")}</p>
                                    )}
                                    {opened.note && <p className="text-sm text-ink/65">{opened.note}</p>}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setOpened(null)}
                                    aria-label="Dismiss"
                                    className="shrink-0 w-8 h-8 rounded text-ink/60 hover:bg-parchment"
                                >
                                    ✕
                                </button>
                            </div>
                        </section>
                    )}

                    {/* DECKS */}
                    <section className="bg-parchment-dark shadow-card rounded-lg p-4 sm:p-6 space-y-5">
                        {/* One wrapping row: heading, the picker's button, + New
                            deck — and the picker's panel, which is order-last
                            and full-width so it drops below the buttons instead
                            of splitting them. */}
                        <div className="flex flex-wrap items-center gap-3">
                            <h2 className="mr-auto text-xl sm:text-2xl font-title flex flex-wrap items-center whitespace-nowrap">
                                Decks
                                <HelpTip
                                    text={
                                        (authEnabled
                                            ? "Add decks you've saved on the Decks tab with 'Add existing deck', or paste a new one"
                                            : "Paste a deck, or send one here from the Decks tab") +
                                        " — plain text like '4 Lightning Bolt', or a link to an MTGGoldfish deck or archetype page and we'll pull the list for you. Add more slots with '+ New deck' to check several decks at once."
                                    }
                                />
                            </h2>
                            {authEnabled && <SavedDeckPicker addedIds={savedDeckIds} onPick={addExistingDeck} />}
                            <button
                                type="button"
                                {...activate(addSlot)}
                                className="shrink-0 whitespace-nowrap px-4 py-2 bg-parchment rounded shadow-inner-parchment text-ink font-title hover:bg-parchment-dark"
                            >
                                + New deck
                            </button>
                        </div>

                        {slots.map((slot, index) => {
                            const edited = isEdited(slot);
                            const isLink = isGoldfishDeckUrl(slot.text.trim());
                            return (
                                <div
                                    key={slot.key}
                                    className={
                                        "space-y-2 rounded-lg p-3 sm:p-4 " +
                                        (slot.saved
                                            ? "bg-brass/10 ring-1 ring-brass/40"
                                            : "bg-parchment/40 ring-1 ring-ink/10")
                                    }
                                >
                                    <div className="flex flex-wrap justify-between items-start gap-2">
                                        <div className="min-w-0 space-y-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h3 className="font-title text-xl">Deck {index + 1}</h3>
                                                {/* Which kind of slot this is, always: a saved
                                                    deck from the Decks tab, or a list that only
                                                    exists here. */}
                                                <span
                                                    className={
                                                        BADGE +
                                                        (slot.saved
                                                            ? " bg-brass text-brass-ink"
                                                            : " bg-parchment-dark text-ink/70")
                                                    }
                                                >
                                                    {slot.saved ? "Saved deck" : "Pasted"}
                                                </span>
                                                {edited && (
                                                    <span className={BADGE + " bg-amber-700/15 text-amber-800"}>
                                                        Edited
                                                    </span>
                                                )}
                                            </div>
                                            {slot.saved && (
                                                <p className="text-sm text-ink/80 [overflow-wrap:anywhere]">
                                                    <strong>{slot.saved.name}</strong>
                                                    {slot.saved.format ? ` · ${deckFormatLabel(slot.saved.format)}` : ""}
                                                    {" · "}
                                                    <Link
                                                        href={`/decks?deck=${slot.saved.id}`}
                                                        className="text-brand underline underline-offset-2 hover:text-brand-dark"
                                                    >
                                                        Open in Decks
                                                    </Link>
                                                </p>
                                            )}
                                            {edited && (
                                                <p className="text-xs text-amber-800">
                                                    Changed here since it was loaded. The saved deck stays as it
                                                    was unless you save these changes.
                                                </p>
                                            )}
                                        </div>
                                        {slots.length > 1 ? (
                                            <button
                                                type="button"
                                                {...activate(() => removeSlot(slot.key))}
                                                aria-label={`Remove deck ${index + 1} from this check`}
                                                className="text-red-800 font-title hover:underline"
                                            >
                                                Remove
                                            </button>
                                        ) : (
                                            (slot.text || slot.saved) && (
                                                <button
                                                    type="button"
                                                    {...activate(() => clearSlot(slot.key))}
                                                    className="text-red-800 font-title hover:underline"
                                                >
                                                    Clear
                                                </button>
                                            )
                                        )}
                                    </div>

                                    <textarea
                                        className="w-full h-40 p-4 bg-parchment shadow-inner-parchment rounded resize-none text-ink"
                                        placeholder="Paste a decklist here, or an MTGGoldfish deck link..."
                                        aria-label={`Deck ${index + 1}`}
                                        value={slot.text}
                                        onChange={(e) => updateSlotText(slot.key, e.target.value)}
                                    />

                                    {isLink && (
                                        <p className="text-xs text-ink/60">
                                            Analyze imports this MTGGoldfish link and puts the list in its place
                                            {authEnabled ? ", ready to save to Decks." : "."}
                                        </p>
                                    )}

                                    {authEnabled && (
                                        <DeckSlotSave
                                            slot={slot}
                                            onSaved={(linked, text) => linkSlot(slot.key, linked, text)}
                                        />
                                    )}
                                </div>
                            );
                        })}

                        {importError && (
                            <p className="text-red-700 text-sm">{importError}</p>
                        )}

                        <div className="text-sm">
                            <Link
                                href="/decks"
                                className="text-brand underline underline-offset-2 hover:text-brand-dark"
                            >
                                Edit and keep your decklists on the Decks tab
                            </Link>
                            <span className="text-ink/60"> — &quot;Check in Deck Check&quot; there sends a deck here.</span>
                        </div>
                    </section>
                    {/* Missing Cards Panel */}
                    {missingCards.length > 0 && (
                        <section className="bg-parchment-dark border border-red-700 shadow-card rounded-lg p-4 mt-4">
                            <h2 className="text-xl font-title text-red-600 mb-2">
                                Missing or Unrecognized Cards
                            </h2>

                            <p className="text-ink mb-2">
                                These card names could not be matched. Check for typos or formatting:
                            </p>

                            <ul className="list-disc list-inside text-ink">
                                {missingCards.map((name, i) => (
                                    <li key={i}>{name}</li>
                                ))}
                            </ul>
                        </section>
                    )}


                    {/* COLLECTION */}
                    <section className="bg-parchment-dark shadow-card rounded-lg p-4 sm:p-6 space-y-4">
                        <h2 className="text-2xl font-title flex flex-wrap items-center">
                            Collection
                            <HelpTip
                                text={
                                    authEnabled
                                        ? "What your decks are checked against. By default it's the collection on your Collection page. Load one of your saved collections, or paste a different one with New — neither changes your Collection page. Arena/Paper mode switches to match the collection you load."
                                        : "What your decks are checked against. By default it's the collection on your Collection page. Paste a different one with New to check against that instead — it doesn't change your Collection page."
                                }
                            />
                        </h2>

                        {/* What's in use, always on screen: comparing against the
                            wrong collection, or an empty one, gives a confident
                            wrong answer, so it's never left to be guessed. */}
                        <div role="status" className="rounded bg-parchment shadow-inner-parchment border-l-4 border-brass px-3 py-2 sm:px-4">
                            <p className="text-xs font-semibold uppercase tracking-wider text-ink/55">
                                Checking against
                            </p>
                            <p className="font-title text-lg leading-snug [overflow-wrap:anywhere]">
                                {!chosen
                                    ? "Your Collection page collection"
                                    : chosen.source.kind === "saved"
                                        ? `Saved ${chosen.source.arena ? "Arena" : "Paper"} collection "${chosen.source.name}"`
                                        : chosen.source.from
                                            ? `The collection saved with "${chosen.source.from}"`
                                            : "A collection pasted here (not saved)"}
                            </p>
                            <p className="text-sm text-ink/70">
                                {plural(collectionCopies, "card")}
                                {collectionCards > 0 ? ` (${plural(collectionCards, "different card")})` : ""} ·{" "}
                                {disableArena ? "Paper" : "Arena"} mode
                            </p>
                            {!chosen && localOpen && (
                                <p className="text-xs text-ink/60 [overflow-wrap:anywhere]">
                                    Opened there from your saved {localOpen.arena ? "Arena" : "Paper"} collection
                                    &quot;{localOpen.name}&quot;.
                                </p>
                            )}
                            {chosen?.source.kind === "saved" && (
                                <p className="text-xs text-ink/60">
                                    Loaded for Deck Check only — your Collection page is unchanged.
                                </p>
                            )}
                            {hydrated && !collection.trim() && chosen?.source.kind !== "pasted" && (
                                <p className="text-sm text-amber-700 mt-1">
                                    {chosen
                                        ? "This collection is empty, so every card will count as missing."
                                        : authEnabled
                                            ? "Your Collection page collection is empty, so every card will count as missing. Add cards there, load a saved collection, or paste one with New."
                                            : "Your Collection page collection is empty, so every card will count as missing. Add cards there, or paste one with New."}
                                </p>
                            )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                aria-pressed={!chosen}
                                onClick={() =>
                                    chosen && guardPasted("your Collection page collection", () => switchToLocal())
                                }
                                className={sourceButton(!chosen)}
                            >
                                Use my Collection page collection
                            </button>
                            {authEnabled && (
                                <SavedCollectionPicker
                                    activeId={chosen?.source.kind === "saved" ? chosen.source.id : null}
                                    onPick={(c) => guardPasted(`"${c.name}"`, () => loadSavedCollection(c))}
                                />
                            )}
                            <button
                                type="button"
                                aria-pressed={chosen?.source.kind === "pasted"}
                                onClick={() =>
                                    chosen?.source.kind === "pasted" ? undefined : startPastedCollection()
                                }
                                className={sourceButton(chosen?.source.kind === "pasted")}
                            >
                                New (paste)
                            </button>
                        </div>

                        {pendingSwitch && (
                            <div
                                role="alert"
                                className="flex flex-wrap items-center gap-2 rounded border border-amber-700/40 bg-amber-700/10 px-3 py-2 text-sm"
                            >
                                <p className="flex-1 min-w-[12rem] [overflow-wrap:anywhere]">
                                    The collection pasted here isn&apos;t saved anywhere. Switch to{" "}
                                    {pendingSwitch.label} and lose it?
                                </p>
                                <button
                                    type="button"
                                    onClick={() => setPendingSwitch(null)}
                                    className="px-3 py-1.5 rounded text-ink/70 hover:bg-parchment"
                                >
                                    Keep it
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        const run = pendingSwitch.run;
                                        setPendingSwitch(null);
                                        run();
                                    }}
                                    className="px-3 py-1.5 rounded font-title border border-amber-700/50 text-amber-800 hover:bg-amber-700/10"
                                >
                                    Switch
                                </button>
                            </div>
                        )}

                        {chosen?.source.kind === "pasted" && (
                            <div className="space-y-3">
                                <div className="flex justify-between items-center gap-2">
                                    <label htmlFor="deck-check-collection" className="text-sm text-ink/70">
                                        Paste a collection — an Arena export, a CSV, or any list with quantities
                                    </label>
                                    {pastedText && (
                                        <button
                                            type="button"
                                            {...activate(() => setPastedText(""))}
                                            className="shrink-0 text-red-800 font-title hover:underline"
                                        >
                                            Clear
                                        </button>
                                    )}
                                </div>
                                <textarea
                                    id="deck-check-collection"
                                    className="w-full h-48 p-4 bg-parchment shadow-inner-parchment rounded resize-none text-ink"
                                    placeholder="Paste your MTG collection here..."
                                    value={pastedText}
                                    // Copies of the same card are merged automatically — an
                                    // Arena export lists every printing on its own line. On
                                    // paste and on leaving the box, not on every keystroke:
                                    // merging re-sorts the list, which would jump around
                                    // under someone typing a card in by hand.
                                    onPaste={() => {
                                        pastedRef.current = true;
                                    }}
                                    onChange={(e) => {
                                        const next = e.target.value;
                                        if (pastedRef.current) {
                                            pastedRef.current = false;
                                            setPastedText(tidyCollection(next));
                                        } else {
                                            setPastedText(next);
                                        }
                                    }}
                                    onBlur={() => {
                                        const merged = tidyCollection(pastedText);
                                        if (merged !== pastedText) setPastedText(merged);
                                    }}
                                />
                                {authEnabled && pastedText.trim() && (
                                    <div className="flex flex-wrap items-center gap-3">
                                        <SaveWorkButton
                                            kind="collection"
                                            decks={[]}
                                            collection={pastedText}
                                            arenaMode={!disableArena}
                                            open={null}
                                            createOnly
                                            label="Save to Collection..."
                                            onSaved={(saved) => {
                                                // Now one of your saved collections:
                                                // shown, and kept, as that.
                                                setChosen((prev) =>
                                                    prev
                                                        ? {
                                                              source: {
                                                                  kind: "saved",
                                                                  id: saved.id,
                                                                  name: saved.name,
                                                                  arena: saved.arena,
                                                              },
                                                              text: prev.text,
                                                              arena: saved.arena,
                                                          }
                                                        : prev
                                                );
                                                setDisableArena(!saved.arena);
                                            }}
                                        />
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="text-sm">
                            {chosen?.source.kind === "saved" ? (
                                <Link
                                    href={`/collection?collection=${chosen.source.id}`}
                                    className="text-brand underline underline-offset-2 hover:text-brand-dark"
                                >
                                    Edit this collection on the Collection page
                                </Link>
                            ) : (
                                <Link
                                    href="/collection"
                                    className="text-brand underline underline-offset-2 hover:text-brand-dark"
                                >
                                    Edit your collection on the Collection page, with pictures
                                </Link>
                            )}
                        </div>
                    </section>

                    {/* TOGGLE + BUTTON */}
                    <div className="text-center space-y-3">

                        {/* Toggle Row
                            The two labels are buttons, not spans: clicking the
                            word "Paper Mode" is the first thing people try, and
                            as inert text it did nothing. They set a mode
                            outright rather than toggling, so clicking the mode
                            you are already in is a no-op instead of a surprise.
                            Grouped so a screen reader reads the three controls
                            as one switch with its two labels. */}
                        <div
                            role="group"
                            aria-label="Card source mode"
                            className="flex items-center justify-center gap-6 font-title text-lg text-ink"
                        >

                            {/* Left label — always visible */}
                            <button
                                type="button"
                                aria-pressed={!disableArena}
                                {...activate(() => setDisableArena(false))}
                                className="select-none cursor-pointer"
                            >
                                Arena Mode
                            </button>

                            {/* Toggle
                                role="switch" + aria-checked is what gives this
                                an announced state; without the aria-label it is
                                an unlabelled button, because its only content is
                                the knob <span>. "On" means Paper Mode, which is
                                what disableArena tracks. */}
                            <button
                                type="button"
                                role="switch"
                                aria-checked={disableArena}
                                aria-label="Paper Mode"
                                {...activate(() => setDisableArena(!disableArena))}
                                className={
                                    "relative w-20 h-10 rounded-full transition-colors duration-300 shadow-inner-parchment " +
                                    (disableArena ? "bg-brand" : "bg-parchment-dark")
                                }
                            >
                                <span
                                    className={
                                        "absolute top-1 left-1 w-8 h-8 rounded-full bg-parchment shadow-card transition-all duration-300 " +
                                        (disableArena ? "translate-x-10" : "translate-x-0")
                                    }
                                />
                            </button>

                            {/* Right label — always visible */}
                            <button
                                type="button"
                                aria-pressed={disableArena}
                                {...activate(() => setDisableArena(true))}
                                className="select-none cursor-pointer"
                            >
                                Paper Mode
                            </button>

                            <HelpTip
                                text={
                                    "Arena Mode looks up Arena printings, caps most cards at 4 copies (basics and a few special cards are unlimited), and shows wildcard costs. Paper Mode looks up paper printings and shows real-world prices instead. " +
                                    (authEnabled
                                        ? "It switches to match a collection you load; switching it here doesn't change the collection."
                                        : "It starts in your Collection page collection's mode; switching it here doesn't change the collection.")
                                }
                            />
                        </div>

                        {/* Checkbox for merge card counts in paper only */}
                        {disableArena && (
                            <label className="flex items-center justify-center gap-2 font-title text-ink mt-2">
                                <input
                                    type="checkbox"
                                    checked={mergePaperCounts}
                                    onChange={(e) => setMergePaperCounts(e.target.checked)}
                                />
                                <span>Add card counts together</span>
                                <HelpTip text="By default, if a card appears in multiple decks we only count the most any single deck needs (since you can share cards between decks). Turn this on to add every deck's need together instead — useful if you're building more than one deck at once." />
                            </label>
                        )}


                        <div className="hidden md:flex w-full flex-col items-center mt-10 mb-16 relative z-20">
                            {/* Rendered once per breakpoint block rather than
                                once above both: the desktop and mobile buttons
                                sit in different places on the page, and a
                                failure message a screen away from the button
                                that produced it is a message nobody reads.
                                Only one block is ever displayed, so this is
                                never duplicated on screen or in the
                                accessibility tree. */}
                            {analyzeError && (
                                <p className="text-red-700 text-sm mb-3 text-center">{analyzeError}</p>
                            )}

                            <div className="flex flex-wrap justify-center gap-3">
                                <button
                                    type="button"
                                    {...activate(() => processAll(), { disabled: loading })}
                                    disabled={loading}
                                    className={
                                        "px-6 py-3 rounded shadow-card font-title text-xl " +
                                        (loading
                                            ? "bg-gray-400 cursor-not-allowed"
                                            : "bg-brand text-midnight-light hover:bg-brand-dark")
                                    }
                                >
                                    {loading ? "Analyzing..." : "Analyze Decks & Collection"}
                                </button>
                                {startOverButton}
                            </div>

                            {loading && (
                                <div className="flex justify-center mt-3">
                                    <div className="animate-spin rounded-full h-8 w-8 border-4 border-ink border-t-transparent"></div>
                                </div>
                            )}
                        </div>

                    </div>
                    {authEnabled && (
                        <div className="mt-6">
                            {/* DeckCheckSaves reads ?collection= / ?analysis= with
                                useSearchParams, which opts a component out of
                                prerendering. Without this boundary the whole page
                                fails to build rather than just this panel deferring
                                to the client. */}
                            <Suspense fallback={null}>
                                <DeckCheckSaves
                                    decks={decks}
                                    collection={collection}
                                    arenaMode={!disableArena}
                                    openAnalysis={openAnalysis}
                                    // Held back until the stored collection has
                                    // been restored: a ?collection= open that
                                    // landed first would be overwritten by the
                                    // restore a moment later.
                                    ready={hydrated}
                                    onOpenCollection={loadSavedCollection}
                                    onOpenComparison={openComparison}
                                    onSaved={setOpenAnalysis}
                                />
                            </Suspense>
                        </div>
                    )}

                    {/* MOBILE ANALYZE BUTTON */}
                    <div className="md:hidden w-full flex flex-col items-center mt-10 mb-16 relative z-20">
                        {analyzeError && (
                            <p className="text-red-700 text-sm mb-3 text-center">{analyzeError}</p>
                        )}

                        <div className="flex flex-wrap justify-center gap-3">
                            <button
                                type="button"
                                {...activate(() => processAll(), { disabled: loading })}
                                disabled={loading}
                                className={`px-6 py-3 rounded shadow-card font-title text-xl ${loading
                                    ? "bg-gray-400 cursor-not-allowed"
                                    : "bg-brand text-midnight-light hover:bg-brand-dark"
                                    }`}
                            >
                                {loading ? "Analyzing..." : "Analyze Decks & Collection"}
                            </button>
                            {startOverButton}
                        </div>

                        {loading && (
                            <div className="flex justify-center mt-3">
                                <div className="animate-spin rounded-full h-8 w-8 border-4 border-ink border-t-transparent"></div>
                            </div>
                        )}
                    </div>

                    {/* WHAT EACH DECK IS MISSING
                        The Collection page's old "Compare with a deck" view,
                        one per deck, from the inputs of the run on screen.
                        First among the results because "what don't I have?"
                        is the question most people arrive with; the combined
                        breakdown, costs and packs follow. */}
                    {checked && checked.decks.length > 0 && (
                        <section className="bg-parchment-dark shadow-card rounded-lg p-4 sm:p-6 space-y-4">
                            <div className="space-y-1">
                                <h2 className="text-2xl font-title flex flex-wrap items-center">
                                    What each deck is missing
                                    <HelpTip text="Each deck on its own against your collection: the cards you don't have and how many copies you're short. Maindeck and sideboard count together, basic lands are left out, and nothing is capped at 4 — it's the deck exactly as written. The breakdown below combines every deck and works out the cost." />
                                </h2>
                                <p className="text-sm text-ink/70 [overflow-wrap:anywhere]">
                                    Against {checked.against}.
                                </p>
                            </div>
                            <div className="space-y-3">
                                {checked.decks.map((d, i) => (
                                    <DeckShortfall
                                        key={d.key}
                                        title={d.title}
                                        savedId={d.savedId}
                                        text={d.text}
                                        collection={checked.collection}
                                        arena={checked.arena}
                                        defaultOpen={i === 0}
                                    />
                                ))}
                            </div>
                        </section>
                    )}

                    {/* BREAKDOWN */}
                    <section className="bg-parchment-dark shadow-card rounded-lg p-4 sm:p-6 space-y-4">
                        <h2 className="text-2xl font-title flex flex-wrap items-center">
                            Card Breakdown
                            <HelpTip text="Every card your decks need, after subtracting what you already own. In Paper Mode you'll also see an estimated price per card." />
                        </h2>

                        {breakdown.length === 0 ? (
                            <p className="text-ink">No breakdown yet. Process your decks.</p>
                        ) : (
                            breakdown.map((item, i) => {
                                // A card with no printing at all in the current mode
                                // can't be priced/wildcarded/imported — show a clear
                                // notice instead of the normal row, and (server-side)
                                // it's already excluded from wildcards, set
                                // recommendations, and the shopping list.
                                const unavailable = disableArena
                                    ? item.lookup?.availableInPaper === false
                                    : item.lookup?.availableOnArena === false;

                                if (unavailable) {
                                    // The mode we're missing a printing for has nothing
                                    // to supply a properly-cased name — fall back to
                                    // whichever printing DOES exist (item.card itself
                                    // is the lowercased canonical lookup key).
                                    const fallbackName = disableArena
                                        ? item.lookup?.arenaPrinting?.printed_name ?? item.lookup?.arenaPrinting?.name
                                        : item.lookup?.paperPrinting?.printed_name ?? item.lookup?.paperPrinting?.name;

                                    return (
                                        <div
                                            key={i}
                                            className="flex items-center gap-4 p-4 bg-parchment rounded shadow-inner-parchment border border-red-700/40"
                                        >
                                            <div className="flex flex-col min-w-0">
                                                {/* Name on its own line so it can be fitted to the
                                                    width; the count follows underneath rather than
                                                    competing for the same line. */}
                                                <FitText
                                                    max={18}
                                                    min={12}
                                                    className="text-ink font-title"
                                                    title={fallbackName ?? item.card}
                                                >
                                                    {fallbackName ?? item.card}
                                                </FitText>
                                                <p className="text-sm text-ink/70">Need {item.needed}</p>
                                                <p className="text-red-700 text-sm mt-1">
                                                    {disableArena
                                                        ? "Not available in Paper — no real paper printing exists for this card."
                                                        : "Card Does Not Exist on Arena — not counted toward wildcards or set recommendations."}
                                                </p>
                                            </div>
                                        </div>
                                    );
                                }

                                // Auto-selected printing (server default)
                                const autoPrinting = disableArena
                                    ? item.lookup?.paperPrinting
                                    : item.lookup?.arenaPrinting;

                                // Every version selectable in the CURRENT mode — Arena
                                // Mode only offers Arena-legal printings (so the set +
                                // rarity shown are always something you can actually
                                // get on Arena); Paper Mode offers paper printings.
                                const modeVersions: any[] = (item.lookup?.versions ?? []).filter(
                                    (v: any) =>
                                        disableArena
                                            ? v.games?.includes("paper")
                                            : v.games?.includes("arena")
                                );

                                const override = printingOverrides[item.card];
                                const overrideIndex = override
                                    ? modeVersions.findIndex(
                                        (v: any) =>
                                            v.set === override.set &&
                                            v.collector_number === override.collector_number
                                    )
                                    : -1;

                                const defaultIndex = Math.max(
                                    0,
                                    modeVersions.findIndex(
                                        (v: any) =>
                                            v.set === autoPrinting?.set &&
                                            v.collector_number === autoPrinting?.collector_number
                                    )
                                );

                                const selectedIndex = overrideIndex >= 0 ? overrideIndex : defaultIndex;

                                // Dynamic printing selection — the chosen version if
                                // there is one, else whatever the server auto-picked.
                                const printing =
                                    modeVersions.length > 0
                                        ? modeVersions[selectedIndex] ?? autoPrinting
                                        : autoPrinting;

                                // UNIVERSAL IMAGE RESOLVER
                                const img =
                                    printing?.image_uris?.normal ||
                                    printing?.card_faces?.[0]?.image_uris?.normal ||
                                    printing?.card_faces?.[1]?.image_uris?.normal ||
                                    item.lookup?.image_uris?.normal ||
                                    item.lookup?.raw?.card_faces?.[0]?.image_uris?.normal ||
                                    item.lookup?.raw?.card_faces?.[1]?.image_uris?.normal;

                                const setSymbol =
                                    printing?.set_icon_svg_uri || item.lookup?.set_icon_svg_uri;

                                // ⭐ FINAL: Correct display name logic
                                const displayName =
                                    printing?.printed_name ?? printing?.name ?? item.card;

                                // Paper Mode only: per-card estimated price
                                const unitPrice = disableArena
                                    ? parseFloat(printing?.prices_usd)
                                    : NaN;

                                const tickListId = `printing-ticks-${i}`;

                                return (
                                    <div
                                        key={i}
                                        // flex-wrap + basis-full on the name: beside a thumbnail the
                                        // text column is only ~119px on a phone, so even at the
                                        // smallest readable size a long card name gets clipped.
                                        // Giving it its own full-width line roughly doubles the room
                                        // and lets it fit outright. Unchanged from sm up.
                                        className="flex flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-4 p-4 bg-parchment rounded shadow-inner-parchment"
                                    >
                                        {img && (
                                            <Image
                                                unoptimized
                                                src={img}
                                                alt={displayName}
                                                width={96}
                                                height={134}
                                                className="w-20 sm:w-24 shrink-0 h-auto rounded shadow-card cursor-pointer hover:scale-105 transition-transform"
                                                onClick={() => setZoomCard(item)}
                                            />
                                        )}

                                        <FitText
                                            max={18}
                                            min={12}
                                            className="text-ink font-title order-first basis-full sm:order-none sm:basis-auto sm:hidden"
                                            title={displayName}
                                        >
                                            {displayName}
                                        </FitText>

                                        <div className="flex flex-col min-w-0 flex-1">
                                            <FitText
                                                max={18}
                                                min={12}
                                                className="text-ink font-title hidden sm:block"
                                                title={displayName}
                                            >
                                                {displayName}
                                            </FitText>
                                            <p className="text-sm text-ink/70">
                                                Need {item.needed}
                                                {!Number.isNaN(unitPrice) && (
                                                    <>
                                                        {" · "}${unitPrice.toFixed(2)} ea (${(unitPrice * item.needed).toFixed(2)} total)
                                                    </>
                                                )}
                                            </p>

                                            {setSymbol && (
                                                <Image
                                                    src={setSymbol}
                                                    alt={printing?.set ?? "Set icon"}
                                                    width={24}
                                                    height={24}
                                                    className="w-6 h-6 mt-1 opacity-90"
                                                />
                                            )}

                                            {modeVersions.length > 1 && (
                                                <div className="mt-2 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 min-w-0">
                                                    <input
                                                        type="range"
                                                        list={tickListId}
                                                        min={0}
                                                        max={modeVersions.length - 1}
                                                        value={selectedIndex}
                                                        onChange={(e) => {
                                                            const v = modeVersions[Number(e.target.value)];
                                                            if (v) {
                                                                handleVersionChange(item.card, v.set, v.collector_number);
                                                            }
                                                        }}
                                                        className="w-full max-w-32 accent-brand"
                                                    />
                                                    <datalist id={tickListId}>
                                                        {modeVersions.map((_, vi) => (
                                                            <option key={vi} value={vi} />
                                                        ))}
                                                    </datalist>
                                                    <span className="text-xs text-ink/70 min-w-0 break-words">
                                                        {printing?.set_name}
                                                        {printing?.variant ? ` · ${printing.variant}` : ""}
                                                        {" "}({selectedIndex + 1}/{modeVersions.length})
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </section>


                    {/* SHOPPING LIST */}
                    <section className="bg-parchment-dark shadow-card rounded-lg p-4 sm:p-6 space-y-4">
                        <h2 className="text-2xl font-title flex flex-wrap items-center">
                            {disableArena ? "TCGPlayer Shopping List" : "Arena Import"}
                            <HelpTip text="A plain-text list of exactly what's missing, formatted to paste straight into Arena's deck import (Arena Mode) or TCGPlayer's mass entry (Paper Mode)." />
                        </h2>

                        {shoppingList.length === 0 ? (
                            <p className="text-ink">No missing cards yet.</p>
                        ) : (
                            <>
                                {(() => {
                                    const {
                                        total,
                                        missingPriceCount,
                                        totalCards,
                                        uniqueCards,
                                    } = shoppingListSummary();

                                    return (
                                        <p className="text-ink font-title text-base sm:text-lg break-words">
                                            {disableArena && (
                                                <>
                                                    {total.toLocaleString("en-US", {
                                                        style: "currency",
                                                        currency: "USD",
                                                    })}
                                                    {" — "}
                                                </>
                                            )}
                                            {totalCards} card{totalCards === 1 ? "" : "s"}
                                            <span className="text-sm text-ink/70">
                                                {" "}
                                                ({uniqueCards} unique)
                                            </span>
                                            {disableArena && missingPriceCount > 0 && (
                                                <span className="text-sm text-ink/70">
                                                    {" · "}
                                                    {missingPriceCount} missing price data
                                                </span>
                                            )}
                                        </p>
                                    );
                                })()}

                                <button
                                    type="button"
                                    {...activate(copyShoppingList)}
                                    className="px-4 py-2 bg-parchment rounded shadow-inner-parchment font-title hover:bg-parchment-dark"
                                >
                                    Copy to Clipboard
                                </button>

                                <div className="bg-parchment rounded shadow-inner-parchment p-3 sm:p-4">
                                    <pre className="whitespace-pre-wrap text-ink text-lg leading-relaxed">
                                        {shoppingList
                                            .map((item) => {
                                                // ⭐ Dynamic printing selection
                                                const printing = disableArena
                                                    ? item.lookup?.paperPrinting
                                                    : item.lookup?.arenaPrinting;

                                                // ⭐ FINAL: Correct display name logic
                                                const displayName =
                                                    printing?.printed_name ??
                                                    printing?.name ??
                                                    item.card;

                                                return `${item.needed} ${displayName}`;
                                            })
                                            .join("\n")}
                                    </pre>
                                </div>
                            </>
                        )}
                    </section>

                    {/* SET RECOMMENDATIONS — Only show in Arena Mode data stored in both modes*/}
                    {!disableArena && (
                        <section className="bg-parchment-dark shadow-card rounded-lg p-4 sm:p-6 space-y-4">
                            <h2 className="text-2xl font-title flex flex-wrap items-center">
                                Set Recommendations
                                <HelpTip text="Missing cards grouped by set, so you can see which booster packs or draft picks would cover the most of what you need at once." />
                            </h2>

                            {recommendations.length === 0 ? (
                                <p className="text-ink">No recommendations yet.</p>
                            ) : (
                                recommendations.map((set, i) => {
                                    const code = set.set;
                                    const isOpen = openSets[code] ?? false;

                                    return (
                                        <div key={i} className="space-y-3">
                                            {i > 0 && (
                                                <div className="border-t border-line my-2" />
                                            )}

                                            <div
                                                className="p-4 bg-parchment rounded shadow-inner-parchment cursor-pointer"
                                                onClick={() => toggleSet(code)}
                                            >
                                                <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                                                    <span className="text-2xl font-title select-none shrink-0">
                                                        {isOpen ? "▼" : "▶"}
                                                    </span>

                                                    {set.set_icon_svg_uri && (
                                                        <Image
                                                            src={set.set_icon_svg_uri}
                                                            alt={code ?? "Set icon"}
                                                            width={40}
                                                            height={40}
                                                            className="w-10 h-10 opacity-90 shrink-0"
                                                        />
                                                    )}

                                                    {/* min-w-0 so a long set name wraps instead of
                                                        forcing the row wider than the screen. */}
                                                    <div className="min-w-0">
                                                        <p className="text-ink font-title text-lg sm:text-xl break-words">
                                                            {set.set_name}
                                                        </p>
                                                        <p className="text-ink text-sm">
                                                            {set.uniqueCards} unique card{set.uniqueCards === 1 ? "" : "s"} needed —{" "}
                                                            {set.totalNeeded} total cop{set.totalNeeded === 1 ? "y" : "ies"}
                                                        </p>
                                                    </div>
                                                </div>

                                                {isOpen && (
                                                    <div className="mt-3 ml-14 space-y-1">
                                                        {set.cards.map((c: any, idx: number) => {
                                                            // ⭐ Dynamic printing selection
                                                            const printing = disableArena
                                                                ? c.paperPrinting
                                                                : c.arenaPrinting ?? c.paperPrinting;

                                                            // ⭐ FINAL: Correct display name logic
                                                            const displayName =
                                                                printing?.printed_name ??
                                                                printing?.name ??
                                                                c.printed_name ??
                                                                c.name;

                                                            return (
                                                                <p
                                                                    key={idx}
                                                                    className={`text-sm ${rarityColor(c.rarity)}`}
                                                                >
                                                                    • {displayName} — Need {c.needed} ({c.rarity})
                                                                </p>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </section>
                    )}

                    {/* WILDCARDS NEEDED — Arena Mode only */}
                    {!disableArena && (
                        <section className="bg-parchment-dark shadow-card rounded-lg p-4 sm:p-6 space-y-4">
                            <h2 className="text-2xl font-title flex flex-wrap items-center">
                                Wildcards Needed
                                <HelpTip text="How many wildcards of each rarity you'd need to craft everything that's missing. Basic lands don't count — Arena gives you those for free." />
                            </h2>

                            {!wildcards ? (
                                <p className="text-ink">No wildcards needed yet. Process your decks.</p>
                            ) : (
                                <>
                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                                        <div>
                                            <p className={`text-3xl font-title ${rarityColor("common")}`}>
                                                {wildcards.common}
                                            </p>
                                            <p className="text-ink text-sm">Common</p>
                                        </div>
                                        <div>
                                            <p className={`text-3xl font-title ${rarityColor("uncommon")}`}>
                                                {wildcards.uncommon}
                                            </p>
                                            <p className="text-ink text-sm">Uncommon</p>
                                        </div>
                                        <div>
                                            <p className={`text-3xl font-title ${rarityColor("rare")}`}>
                                                {wildcards.rare}
                                            </p>
                                            <p className="text-ink text-sm">Rare</p>
                                        </div>
                                        <div>
                                            <p className={`text-3xl font-title ${rarityColor("mythic")}`}>
                                                {wildcards.mythic}
                                            </p>
                                            <p className="text-ink text-sm">Mythic</p>
                                        </div>
                                    </div>

                                    {wildcards.other > 0 && (
                                        <p className="text-ink text-sm text-center">
                                            + {wildcards.other} card{wildcards.other === 1 ? "" : "s"} with a
                                            non-standard rarity (not craftable via wildcards)
                                        </p>
                                    )}
                                </>
                            )}
                        </section>
                    )}


                    {zoomCard && (
                        <div
                            className="card-zoom-backdrop"
                            onClick={() => {
                                setZoomCard(null);
                                setFlip(false);
                            }}
                        >
                            <div
                                className="relative"
                                onClick={(e) => e.stopPropagation()} // prevent backdrop close when tapping card
                            >
                                {/* CLOSE BUTTON (top-right) */}
                                <button
                                    type="button"
                                    className="absolute -top-3 -right-3 z-[1000] rounded-full bg-black/80 text-white px-2 py-1 text-sm md:text-base shadow-lg"
                                    onClick={() => {
                                        setZoomCard(null);
                                        setFlip(false);
                                    }}
                                >
                                    ✕
                                </button>

                                {(() => {
                                    // Same version resolution as the breakdown thumbnail,
                                    // so zooming in shows whatever art is currently chosen.
                                    const autoPrinting = disableArena
                                        ? zoomCard.lookup?.paperPrinting
                                        : zoomCard.lookup?.arenaPrinting;

                                    const modeVersions: any[] = (zoomCard.lookup?.versions ?? []).filter(
                                        (v: any) =>
                                            disableArena
                                                ? v.games?.includes("paper")
                                                : v.games?.includes("arena")
                                    );

                                    const override = printingOverrides[zoomCard.card];
                                    const overrideIndex = override
                                        ? modeVersions.findIndex(
                                            (v: any) =>
                                                v.set === override.set &&
                                                v.collector_number === override.collector_number
                                        )
                                        : -1;

                                    const defaultIndex = Math.max(
                                        0,
                                        modeVersions.findIndex(
                                            (v: any) =>
                                                v.set === autoPrinting?.set &&
                                                v.collector_number === autoPrinting?.collector_number
                                        )
                                    );

                                    const selectedIndex = overrideIndex >= 0 ? overrideIndex : defaultIndex;

                                    const printing =
                                        modeVersions.length > 0
                                            ? modeVersions[selectedIndex] ?? autoPrinting
                                            : autoPrinting;

                                    const front =
                                        printing?.image_uris?.normal ||
                                        printing?.card_faces?.[0]?.image_uris?.normal;

                                    const back =
                                        printing?.card_faces?.[1]?.image_uris?.normal;

                                    const displayName =
                                        printing?.printed_name ??
                                        printing?.name ??
                                        zoomCard.card;

                                    return (
                                        <>
                                            {/* DESKTOP FLIP CARD */}
                                            <div className="hidden md:block">
                                                <div className={`flip-wrapper ${back && flip ? "flipped" : ""}`}>

                                                    {front && (
                                                        <Image
                                                            unoptimized
                                                            fill
                                                            src={front}
                                                            alt={displayName}
                                                            sizes="(max-width: 640px) 90vw, 500px"
                                                            className="card-face front"
                                                        />
                                                    )}
                                                    {back && (
                                                        <Image
                                                            unoptimized
                                                            fill
                                                            src={back}
                                                            alt={displayName}
                                                            sizes="(max-width: 640px) 90vw, 500px"
                                                            className="card-face back"
                                                        />
                                                    )}

                                                    {back && (
                                                        <div
                                                            className="flip-hitbox hidden md:block"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setFlip(!flip);
                                                            }}
                                                        />
                                                    )}

                                                </div>
                                            </div>

                                            {/* MOBILE FLIP CARD */}
                                            <div className="md:hidden">
                                                <div className={`flip-wrapper ${back && flip ? "flipped" : ""}`}>
                                                    {front && (
                                                        <Image
                                                            unoptimized
                                                            fill
                                                            src={front}
                                                            alt={displayName}
                                                            sizes="90vw"
                                                            className="card-face front"
                                                        />
                                                    )}

                                                    {back && (
                                                        <Image
                                                            unoptimized
                                                            fill
                                                            src={back}
                                                            alt={displayName}
                                                            sizes="90vw"
                                                            className="card-face back"
                                                        />
                                                    )}

                                                    {/* MOBILE flip hitbox */}
                                                    {back && (
                                                        <div
                                                            className="flip-hitbox"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setFlip(!flip);
                                                            }}
                                                        />
                                                    )}
                                                </div>
                                            </div>

                                            {/* VERSION SWITCHER — click a set icon to jump straight to that printing */}
                                            {modeVersions.length > 1 && (
                                                <div className="mt-3 flex flex-wrap justify-center gap-2 max-w-[90vw]">
                                                    {modeVersions.map((v, vi) => (
                                                        <button
                                                            key={vi}
                                                            type="button"
                                                            title={`${v.set_name}${v.variant ? ` · ${v.variant}` : ""}`}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleVersionChange(zoomCard.card, v.set, v.collector_number);
                                                            }}
                                                            className={
                                                                "w-8 h-8 flex items-center justify-center rounded-full shadow-card transition-transform " +
                                                                (vi === selectedIndex
                                                                    ? "bg-brand scale-110"
                                                                    : "bg-parchment hover:bg-parchment-dark")
                                                            }
                                                        >
                                                            {v.set_icon_svg_uri ? (
                                                                <Image
                                                                    src={v.set_icon_svg_uri}
                                                                    alt={v.set_name ?? v.set}
                                                                    width={18}
                                                                    height={18}
                                                                    className={vi === selectedIndex ? "invert" : "opacity-80"}
                                                                />
                                                            ) : (
                                                                <span className="text-xs text-ink">{vi + 1}</span>
                                                            )}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}

                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    )}

                    {/* ---- clear confirmation, with a chance to save first ----
                        Deliberately the same three-way choice as the Sideboard
                        Planner's Start Over (keep / clear / save and clear)
                        rather than a second pattern: both pages are wiping
                        typed work, and a user who has learned one dialog
                        should not have to read the other. */}
                    {confirmClear && (
                        <div
                            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
                            role="dialog"
                            aria-modal="true"
                            aria-labelledby="clear-deck-check-title"
                            onClick={(e) => {
                                if (e.target === e.currentTarget) setConfirmClear(false);
                            }}
                        >
                            <div className="bg-parchment rounded-lg shadow-card p-6 max-w-md w-full space-y-4 text-ink">
                                <h3 id="clear-deck-check-title" className="font-title text-2xl">
                                    Start over?
                                </h3>

                                <p className="leading-relaxed">
                                    This clears every deck slot, any collection pasted here and the last
                                    results, and goes back to your Collection page collection. Your saved
                                    decks and your Collection page aren&apos;t touched.
                                </p>

                                {authEnabled ? (
                                    <p className="text-sm text-ink/70">
                                        {rescueKind === "comparison"
                                            ? "Saving keeps the decks, the collection and the mode as a comparison you can reopen."
                                            : "Saving keeps the collection you pasted as one of your saved collections."}
                                    </p>
                                ) : (
                                    <p className="text-sm text-amber-700">
                                        There&apos;s nowhere to save this on this deployment, so clearing
                                        is final.
                                    </p>
                                )}

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
                                            resetEverything();
                                            setConfirmClear(false);
                                        }}
                                        className="px-4 py-2 rounded font-title text-sm border border-red-700/40 text-red-700 hover:bg-red-700/10"
                                    >
                                        Clear without saving
                                    </button>

                                    {authEnabled && (
                                        <SaveWorkButton
                                            kind={rescueKind}
                                            decks={decks}
                                            collection={rescueKind === "comparison" ? collection : pastedText}
                                            arenaMode={!disableArena}
                                            open={rescueKind === "comparison" ? openAnalysis : null}
                                            // A pasted collection is saved alongside
                                            // the ones you have, as "Save to
                                            // Collection" does — never over one.
                                            createOnly={rescueKind === "collection"}
                                            // Branching a copy in the middle of a
                                            // reset is a different intent from
                                            // "keep this before I wipe it".
                                            allowSaveAsNew={false}
                                            variant="primary"
                                            label="Save and clear"
                                            onSaved={() => {
                                                resetEverything();
                                                setConfirmClear(false);
                                            }}
                                        />
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

            </main>
        </div>
    );
}
