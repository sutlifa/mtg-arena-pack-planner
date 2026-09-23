"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import HelpTip from "./HelpTip";
import FitText from "./FitText";
import CardAutocomplete, { type CardRow } from "./CardAutocomplete";
import SaveToProfileButton from "./SaveToProfileButton";
import GuideLoader from "./GuideLoader";
import GuideNameBar from "./GuideNameBar";
import OpponentDeck from "./OpponentDeck";
import { isGoldfishDeckUrl } from "@/lib/goldfishUrl";
import { splitDeckSections, totalCards, type DeckCard } from "@/lib/deckSections";
import {
    SUPPORTED_FORMATS,
    MAX_ARCHETYPES,
    SHEET_TARGET_MATCHUPS,
    META_PERIODS,
    DEFAULT_META_PERIOD,
    isMetaPeriod,
    formatLabel,
} from "@/lib/formats";
import { fitSheet, pxToPt, MIN_SHEET_PX, type SheetFit } from "@/lib/printFit";

const STORAGE_KEY = "mtgpp:sideboard";

interface Matchup {
    id: string;
    name: string;
    pct: number | null;
    /** The plan used on the play, and the only plan unless split is on. */
    out: CardRow[];
    in: CardRow[];
    /** Sideboarding often differs on the draw; opt in per matchup. */
    splitPlayDraw: boolean;
    drawOut: CardRow[];
    drawIn: CardRow[];
    notes: string;
    /**
     * An MTGGoldfish link pasted for this matchup's opponent list, overriding
     * the archetype's own. Null means "use the archetype's".
     */
    deckUrl: string | null;
}

const newId = () => Math.random().toString(36).slice(2, 10);

const emptyMatchup = (name: string, pct: number | null = null): Matchup => ({
    id: newId(),
    name,
    pct,
    out: [],
    in: [],
    splitPlayDraw: false,
    drawOut: [],
    drawIn: [],
    notes: "",
    deckUrl: null,
});

const sumQty = (rows: CardRow[]) =>
    rows.reduce((n, r) => n + (r.name.trim() ? r.qty : 0), 0);

/** Constructed minimum. Every format this tool supports is 60-card. */
const MIN_DECK = 60;

interface PlanCheck {
    out: number;
    in: number;
    /** Maindeck size once the swaps are made. */
    after: number;
    state: "empty" | "ok" | "short" | "over";
    /** False when no deck is loaded, so `after` is meaningless. */
    judged: boolean;
}

/**
 * Checks one out/in pair against the deck it's being made from.
 *
 * The rule that matters is the resulting deck size, not whether the two
 * columns happen to be equal. Swaps haven't had to be one-for-one since 2013
 * — someone running 61 who cuts 7 for 6 is still at 60 and perfectly legal,
 * and flagging that as an error would be wrong.
 *
 * `deckSize` of 0 (or a list shorter than 60, i.e. still half-pasted) means
 * there's nothing to judge against, so no verdict is given.
 */
function checkPlan(outRows: CardRow[], inRows: CardRow[], deckSize: number): PlanCheck {
    const out = sumQty(outRows);
    const inN = sumQty(inRows);
    const after = deckSize - out + inN;

    if (out === 0 && inN === 0) return { out, in: inN, after, state: "empty", judged: false };

    // No deck loaded (or a half-pasted one): `after` would be nonsense — it
    // read "0 cards" in the green "this is fine" colour — so the swap counts
    // are shown without any verdict about deck size.
    if (deckSize < MIN_DECK) return { out, in: inN, after, state: "ok", judged: false };

    if (after < MIN_DECK) return { out, in: inN, after, state: "short", judged: true };
    if (after > deckSize) return { out, in: inN, after, state: "over", judged: true };
    return { out, in: inN, after, state: "ok", judged: true };
}

/** Every plan in a matchup — one, or two when play and draw differ. */
function matchupChecks(m: Matchup, deckSize: number): PlanCheck[] {
    const checks = [checkPlan(m.out, m.in, deckSize)];
    if (m.splitPlayDraw) checks.push(checkPlan(m.drawOut, m.drawIn, deckSize));
    return checks;
}

/** "2 Torpor Orb, 1 Snakeskin Veil" — the compact form used on the printed sheet. */
const inlineList = (rows: CardRow[]) =>
    rows.filter((r) => r.name.trim()).map((r) => `${r.qty} ${r.name.trim()}`).join(", ");

/** One OUT or IN line of the printed sheet: two cells of the .sb-rows grid. */
function SheetRow({ label, rows }: { label: "out" | "in"; rows: CardRow[] }) {
    const list = inlineList(rows);
    return (
        <>
            <span className={`sb-label sb-label-${label}`}>{label.toUpperCase()}</span>
            <span className="sb-cards">{list || <span className="sb-empty">—</span>}</span>
        </>
    );
}

/**
 * Shared shape for the action bar under the matchups (Export, Save, Save as
 * new, Start Over), so they line up as one row of equal-height buttons; each
 * caller adds its own colours. Full-width on a phone, natural width above.
 */
const ACTION_BUTTON =
    "flex-1 sm:flex-none whitespace-nowrap px-5 py-2.5 rounded shadow-card font-title text-lg ";

/* ------------------------------------------------------------------ */
/* One Out or In box                                                   */
/* ------------------------------------------------------------------ */

function PlanBox({
    label,
    rows,
    options,
    emptyHint,
    onRows,
}: {
    label: string;
    rows: CardRow[];
    options: DeckCard[];
    emptyHint: string;
    onRows: (rows: CardRow[]) => void;
}) {
    const addRow = useCallback(() => onRows([...rows, { qty: 1, name: "" }]), [rows, onRows]);

    return (
        <div className="flex-1 min-w-0 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-ink/60">{label}</p>

            <div className="space-y-1.5">
                {rows.map((row, i) => (
                    <CardAutocomplete
                        key={i}
                        row={row}
                        options={options}
                        placeholder={emptyHint}
                        onChange={(next) => onRows(rows.map((r, j) => (j === i ? next : r)))}
                        onRemove={() => onRows(rows.filter((_, j) => j !== i))}
                        onEnterCommit={i === rows.length - 1 ? addRow : undefined}
                    />
                ))}
            </div>

            <button
                type="button"
                onClick={addRow}
                className="text-xs text-brand hover:text-brand-dark underline underline-offset-2"
            >
                + Add card
            </button>
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* An Out/In pair, with a balance readout                              */
/* ------------------------------------------------------------------ */

function PlanPair({
    heading,
    outRows,
    inRows,
    maindeck,
    sideboard,
    deckSize,
    onOut,
    onIn,
}: {
    heading: string | null;
    outRows: CardRow[];
    inRows: CardRow[];
    maindeck: DeckCard[];
    sideboard: DeckCard[];
    deckSize: number;
    onOut: (rows: CardRow[]) => void;
    onIn: (rows: CardRow[]) => void;
}) {
    const check = checkPlan(outRows, inRows, deckSize);

    return (
        <div className="space-y-2">
            {heading && (
                <p className="text-sm font-title text-ink/80 border-b border-brass/25 pb-1">{heading}</p>
            )}

            <div className="flex flex-col sm:flex-row gap-4">
                <PlanBox
                    label="Out"
                    rows={outRows}
                    options={maindeck}
                    emptyHint="Card from your maindeck"
                    onRows={onOut}
                />
                <PlanBox
                    label="In"
                    rows={inRows}
                    options={sideboard}
                    emptyHint="Card from your sideboard"
                    onRows={onIn}
                />
            </div>

            {check.state !== "empty" && (
                <p
                    className={
                        "text-xs " +
                        (!check.judged
                            ? "text-ink/60"
                            : check.state === "short"
                                ? "text-red-700 font-semibold"
                                : check.state === "over"
                                    ? "text-amber-700"
                                    : "text-green-800/80")
                    }
                >
                    &minus;{check.out} / +{check.in}
                    {check.judged
                        ? ` · ${check.after} cards`
                        : " · load your deck to check the count"}
                    {check.state === "short" &&
                        ` — illegal, you can't board below ${MIN_DECK}. Bring in ${MIN_DECK - check.after} more.`}
                    {check.state === "over" &&
                        ` — legal, but you're ${check.after - deckSize} over what you registered.`}
                </p>
            )}
        </div>
    );
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

interface Archetype {
    name: string;
    pct: number | null;
    /** Its MTGGoldfish page, for the opponent list. Absent in older saved plans. */
    url?: string | null;
}

/**
 * Whether the screen is wide enough for the opponent list to sit beside the
 * matchups. Below that it opens inline under each matchup instead.
 *
 * A media query rather than a CSS-only `hidden xl:block`: a hidden panel
 * would still mount, and mounting it is what fetches the list from
 * MTGGoldfish — a phone would download lists it never shows.
 */
const WIDE_QUERY = "(min-width: 1280px)";
function useWide(): boolean {
    return useSyncExternalStore(
        (onChange) => {
            const mq = window.matchMedia(WIDE_QUERY);
            mq.addEventListener("change", onChange);
            return () => mq.removeEventListener("change", onChange);
        },
        () => window.matchMedia(WIDE_QUERY).matches,
        // The server can't know the screen; render the narrow layout and let
        // the client switch after hydration.
        () => false
    );
}

interface PlanState {
    /** What is currently in the textarea. */
    decklist: string;
    /** The text that was actually loaded — the maindeck/sideboard split is
     *  derived from this, so editing the textarea does not disturb the
     *  suggestions until the user presses Load Deck again. */
    loadedText: string;
    format: string;
    count: number;
    /** Metagame window to pull, in days — MTGGoldfish's "Show decks from the last". */
    period: number;
    matchups: Matchup[];
    /** The archetypes pulled from the metagame, for the picker. */
    available: Archetype[];
    /**
     * The window `available` (and the percentages on the matchups) came from.
     * Separate from `period` because changing the dropdown doesn't re-pull:
     * until Load Metagame is pressed again, the list is still the old window,
     * and the picker and printed sheet should say so.
     */
    availablePeriod: number | null;
    /**
     * Plans for archetypes the user has unchecked. Unticking a box should hide
     * a matchup, not destroy work — re-ticking it brings the plan back.
     */
    stash: Record<string, Matchup>;
    /**
     * Which saved guide this plan came from, if any.
     *
     * Without it the planner had no idea what was open, so Save could only
     * ever ask for a name and match on it — overwriting the guide you were
     * editing meant retyping its name exactly, and a near-miss quietly
     * created a second guide instead. Kept inside PlanState rather than
     * beside it so it survives a reload with the work it belongs to:
     * reopening the tab tomorrow still knows you were editing "Azorious
     * Control".
     */
    savedId: number | null;
    savedName: string | null;
}

/**
 * Turns whatever shape a stored plan happens to be into a complete PlanState.
 *
 * Shared by both restore paths — localStorage and a guide loaded from the
 * database. They used to be separate, and only one of them existed: guides
 * could be saved and listed but never actually opened, so "Open" on the
 * profile page quietly left the planner showing localStorage instead. On a
 * machine with nothing in localStorage that looked exactly like the saved
 * work had been wiped.
 *
 * Every field is defaulted because plans written by older versions of the app
 * genuinely lack some of them.
 */
export function normalisePlan(parsed: Record<string, unknown>, fallback: PlanState): PlanState {
    const raw = parsed ?? {};
    const decklist = typeof raw.decklist === "string" ? raw.decklist : "";

    return {
        decklist,
        loadedText: typeof raw.loadedText === "string" ? raw.loadedText : decklist,
        format: typeof raw.format === "string" ? raw.format : fallback.format,
        count: typeof raw.count === "number" ? raw.count : fallback.count,
        // Plans saved before the time frame existed were all pulled at
        // MTGGoldfish's default, which is what they get here.
        period: isMetaPeriod(raw.period) ? raw.period : DEFAULT_META_PERIOD,
        matchups: Array.isArray(raw.matchups)
            // Tolerate plans saved before the Play/Draw split existed.
            ? (raw.matchups as Partial<Matchup>[]).map((m) => ({
                ...emptyMatchup(m.name ?? "Matchup"),
                ...m,
                id: m.id ?? newId(),
                splitPlayDraw: m.splitPlayDraw ?? false,
                drawOut: m.drawOut ?? [],
                drawIn: m.drawIn ?? [],
                // Only ever an MTGGoldfish link: it becomes the panel's
                // "MTGGoldfish ↗" href, and a saved plan is user-editable JSON.
                deckUrl:
                    typeof m.deckUrl === "string" && isGoldfishDeckUrl(m.deckUrl)
                        ? m.deckUrl
                        : null,
            }))
            : [],
        available: Array.isArray(raw.available) ? (raw.available as Archetype[]) : [],
        availablePeriod: isMetaPeriod(raw.availablePeriod)
            ? raw.availablePeriod
            : Array.isArray(raw.available) && raw.available.length > 0
                ? DEFAULT_META_PERIOD
                : null,
        stash:
            raw.stash && typeof raw.stash === "object"
                ? (raw.stash as Record<string, Matchup>)
                : {},
        // Present in plans written since the planner started tracking what is
        // open, absent in every older one — and deliberately overridden by the
        // guide loader, which knows the row it actually fetched.
        savedId: typeof raw.savedId === "number" ? raw.savedId : null,
        savedName: typeof raw.savedName === "string" ? raw.savedName : null,
    };
}

const EMPTY_PLAN: PlanState = {
    decklist: "",
    loadedText: "",
    format: "modern",
    count: 50,
    period: DEFAULT_META_PERIOD,
    matchups: [],
    available: [],
    availablePeriod: null,
    stash: {},
    savedId: null,
    savedName: null,
};

export default function SideboardPlanner({ authEnabled }: { authEnabled: boolean }) {
    // Everything persisted lives in one object so restoring from storage is a
    // single state update. Restoring field-by-field would fire a cascade of
    // synchronous setStates from the effect, which React flags as a source of
    // repeated re-renders.
    const [plan, setPlan] = useState<PlanState>(EMPTY_PLAN);
    const [hydrated, setHydrated] = useState(false);

    const [deckLoading, setDeckLoading] = useState(false);
    const [deckError, setDeckError] = useState<string | null>(null);
    const [archLoading, setArchLoading] = useState(false);
    const [archError, setArchError] = useState<string | null>(null);

    const { decklist, format, count, period, matchups, available } = plan;

    const setDecklist = (v: string) => setPlan((p) => ({ ...p, decklist: v }));
    const setFormat = (v: string) => setPlan((p) => ({ ...p, format: v }));
    const setCount = (v: number) => setPlan((p) => ({ ...p, count: v }));
    const setPeriod = (v: number) => setPlan((p) => ({ ...p, period: v }));
    const setMatchups = (fn: (prev: Matchup[]) => Matchup[]) =>
        setPlan((p) => ({ ...p, matchups: fn(p.matchups) }));

    // Derived, not stored — one less piece of state to keep in sync.
    const sections = useMemo(
        () => (plan.loadedText.trim() ? splitDeckSections(plan.loadedText) : null),
        [plan.loadedText]
    );

    /* ---- persistence: browser-local only, never uploaded ---- */

    // Restore once, after mount rather than during the initial render, so the
    // server-rendered and first client render both start empty and hydration
    // stays consistent. A lazy useState initializer would read storage during
    // render and produce markup the server never emitted, which is a worse
    // problem than the lint rule this suppresses. Matches the same deliberate
    // exception in the Pack Planner.
    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                setPlan(normalisePlan(JSON.parse(saved), EMPTY_PLAN));
            }
        } catch {
            /* corrupt or unavailable storage is not worth failing over */
        }
        setHydrated(true);
    }, []);
    /* eslint-enable react-hooks/set-state-in-effect */

    useEffect(() => {
        if (!hydrated) return;
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(plan));
        } catch {
            /* quota or private mode — the app still works, it just will not persist */
        }
    }, [hydrated, plan]);

    /* ---- deck loading ---- */

    const loadDeck = async () => {
        setDeckLoading(true);
        setDeckError(null);

        let text = decklist.trim();

        if (isGoldfishDeckUrl(text)) {
            try {
                const res = await fetch("/api/import-deck", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ url: text }),
                });
                const data = await res.json();
                if (res.ok && data.decklist) {
                    text = data.decklist;
                } else {
                    setDeckError("Could not import that MTGGoldfish link — check the URL and try again.");
                    setDeckLoading(false);
                    return;
                }
            } catch {
                setDeckError("Could not import that MTGGoldfish link — check the URL and try again.");
                setDeckLoading(false);
                return;
            }
        }

        const split = splitDeckSections(text);

        if (split.maindeck.length === 0 && split.sideboard.length === 0) {
            setDeckError("No cards found in that list. Paste a decklist or an MTGGoldfish link.");
            setPlan((p) => ({ ...p, loadedText: "" }));
            setDeckLoading(false);
            return;
        }

        // Show the resolved list in the textarea when a link was imported, and
        // record it as the loaded text the suggestions derive from.
        setPlan((p) => ({ ...p, decklist: text, loadedText: text }));
        setDeckLoading(false);
    };

    /* ---- archetypes ---- */

    const loadArchetypes = async () => {
        setArchLoading(true);
        setArchError(null);
        try {
            const res = await fetch("/api/archetypes", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ format, limit: count, period }),
            });
            const data = await res.json();

            if (!res.ok || !Array.isArray(data.archetypes)) {
                setArchError(data.error ?? "Could not load the current metagame.");
                setArchLoading(false);
                return;
            }

            // Only fills the picker. Nothing is added to the guide until the
            // user ticks it, and refreshing the metagame leaves existing plans
            // alone — it just refreshes each one's metagame share.
            setPlan((p) => {
                const pcts = new Map<string, number | null>(
                    data.archetypes.map((a: Archetype) => [a.name.toLowerCase(), a.pct])
                );
                const pulled = typeof data.period === "number" ? data.period : period;
                // A matchup missing from a pull over a DIFFERENT window loses
                // its share: keeping it would print an old window's figure
                // under the new window's heading. Over the same window it
                // keeps it — pulling the top 10 after the top 50 shouldn't
                // wipe the shares of decks 11 to 50 you'd already ticked.
                const windowChanged = p.availablePeriod !== null && p.availablePeriod !== pulled;
                return {
                    ...p,
                    available: data.archetypes,
                    availablePeriod: pulled,
                    matchups: p.matchups.map((m) =>
                        pcts.has(m.name.toLowerCase())
                            ? { ...m, pct: pcts.get(m.name.toLowerCase()) ?? m.pct }
                            : windowChanged
                                ? { ...m, pct: null }
                                : m
                    ),
                };
            });
        } catch {
            setArchError("Could not load the current metagame.");
        }
        setArchLoading(false);
    };

    /** Whether an archetype is currently in the guide. */
    const isIncluded = (name: string) =>
        matchups.some((m) => m.name.toLowerCase() === name.toLowerCase());

    /**
     * Tick / untick an archetype. Unticking stashes its plan rather than
     * dropping it, so an accidental click costs nothing.
     */
    const toggleArchetype = (a: Archetype) => {
        const key = a.name.toLowerCase();

        setPlan((p) => {
            const existing = p.matchups.find((m) => m.name.toLowerCase() === key);

            if (existing) {
                return {
                    ...p,
                    matchups: p.matchups.filter((m) => m.name.toLowerCase() !== key),
                    stash: { ...p.stash, [key]: existing },
                };
            }

            const revived = p.stash[key];
            const nextStash = { ...p.stash };
            delete nextStash[key];

            return {
                ...p,
                matchups: [...p.matchups, revived ? { ...revived, pct: a.pct } : emptyMatchup(a.name, a.pct)],
                stash: nextStash,
            };
        });
    };

    /** Clear the guide, stashing every plan so nothing is lost. */
    const untickAll = () =>
        setPlan((p) => {
            const nextStash = { ...p.stash };
            for (const m of p.matchups) nextStash[m.name.toLowerCase()] = m;
            return { ...p, matchups: [], stash: nextStash };
        });

    /** Tick the first n archetypes by metagame share, leaving the rest alone. */
    const selectTop = (n: number) => {
        setPlan((p) => {
            const wanted = p.available.slice(0, n);
            const have = new Set(p.matchups.map((m) => m.name.toLowerCase()));
            const nextStash = { ...p.stash };

            const added = wanted
                .filter((a) => !have.has(a.name.toLowerCase()))
                .map((a) => {
                    const key = a.name.toLowerCase();
                    const revived = nextStash[key];
                    delete nextStash[key];
                    return revived ? { ...revived, pct: a.pct } : emptyMatchup(a.name, a.pct);
                });

            return { ...p, matchups: [...p.matchups, ...added], stash: nextStash };
        });
    };

    /* ---- printing ---- */

    const [confirmClear, setConfirmClear] = useState(false);
    const [confirmDeckClear, setConfirmDeckClear] = useState(false);

    /**
     * Full reset: decklist, the loaded maindeck/sideboard split, every matchup
     * plan and the stash of unticked ones.
     *
     * Format, the archetype count and the pulled metagame list are kept — they
     * are fetched data rather than your work, and re-pulling the metagame on
     * every reset is a pointless round trip.
     *
     * The open guide is cleared too, and has to be: leaving it set would aim
     * the next Save at the guide you just walked away from and overwrite it
     * with the blank plan you started instead.
     */
    const resetEverything = () =>
        setPlan((prev) => ({
            ...prev,
            decklist: "",
            loadedText: "",
            matchups: [],
            stash: {},
            savedId: null,
            savedName: null,
        }));

    const printRef = useRef<HTMLDivElement>(null);
    const [exporting, setExporting] = useState(false);

    /**
     * How big the printed sheet's text can be while it still fits one page,
     * and whether it fits at all — measured, so the planner can say "this will
     * run onto a second page" before you print rather than after.
     *
     * The sheet lives inside .sb-print, which is display:none on screen and so
     * has no size to measure. A clone goes into an invisible off-screen host,
     * gets measured there, and is thrown away; the real template only receives
     * the answer, through the --sb-size style below.
     *
     * Debounced, because it lays the sheet out a dozen or so times and there
     * is no point doing that on every keystroke in a notes box. The setState
     * runs in the timer, not in the effect body.
     *
     * `count` records how many matchups the answer was measured for. Until a
     * change in that number has been re-measured, the result is not shown:
     * ticking the top 30 would otherwise flash the size measured for the old
     * selection. Notes edits don't hide it — a quarter-second-old size while
     * you type is close enough, and hiding it on every keystroke would flicker.
     */
    const [fit, setFit] = useState<(SheetFit & { count: number }) | null>(null);
    const fitNow = fit && fit.count === matchups.length ? fit : null;
    useEffect(() => {
        const timer = setTimeout(() => {
            const sheet = printRef.current?.querySelector<HTMLElement>(".sb-sheet");
            if (!sheet) return;

            const host = document.createElement("div");
            host.setAttribute("aria-hidden", "true");
            host.style.cssText =
                "position:absolute;left:-10000px;top:0;visibility:hidden;pointer-events:none;";
            const clone = sheet.cloneNode(true) as HTMLElement;
            host.appendChild(clone);
            document.body.appendChild(host);
            try {
                setFit({ ...fitSheet(clone), count: matchups.length });
            } finally {
                host.remove();
            }
        }, 250);
        return () => clearTimeout(timer);
    }, [matchups, format, plan.savedName]);

    /**
     * Prints the guide from an isolated iframe rather than calling
     * window.print() on this page.
     *
     * window.print() blocks the main thread for as long as the dialog is open —
     * that part is unavoidable — but it also makes the browser generate a print
     * preview of the *entire* document. With 25 matchups that is ~1,800 nodes
     * and 300-plus form controls, a fixed-attachment background image and a
     * webfont, all re-laid-out in print media just to produce a sheet of about
     * 250 static nodes. Printing a document that contains only the sheet cuts
     * that work down to the part that actually ends up on paper, and makes the
     * output deterministic: nothing from the editor can leak in because nothing
     * from the editor is in the document.
     *
     * globals.css is still the single source of truth for how the sheet looks —
     * the iframe loads the same stylesheets rather than carrying a second copy
     * of them. The one rule it adds is the page box: zero margin, which is what
     * keeps the browser from stamping the date, title, web address and page
     * number on the sheet (they are drawn in the margin, and there is none).
     * The sheet is re-fitted inside the iframe right before printing, so the
     * size that prints is measured in the document that prints. Falls back to
     * window.print() if anything about the iframe path fails.
     */
    const exportSheet = () => {
        // Guarded here as well as on the button: a disabled button is a hint,
        // not a rule, and nothing should print a guide that boards you to an
        // illegal deck.
        if (illegal.length > 0) return;

        const src = printRef.current?.querySelector(".sb-sheet");
        if (!src) {
            window.print();
            return;
        }

        setExporting(true);

        // Let the button paint its busy state before the dialog seizes the
        // main thread; without this the click looks like a freeze.
        setTimeout(() => {
            let iframe: HTMLIFrameElement | null = null;
            let settled = false;

            const cleanup = () => {
                if (iframe) {
                    iframe.remove();
                    iframe = null;
                }
                setExporting(false);
            };

            try {
                // Same stylesheets as the page, so the printed sheet is styled by
                // globals.css and there is no duplicated CSS to drift.
                const head = Array.from(
                    document.querySelectorAll('link[rel="stylesheet"], style')
                )
                    .map((n) => n.outerHTML)
                    .join("");

                const html =
                    "<!doctype html><html><head><meta charset=\"utf-8\">" +
                    head +
                    "<style>@page{size:letter portrait;margin:0}" +
                    "html,body{margin:0;padding:0;background:#fff}</style>" +
                    "</head><body>" +
                    src.outerHTML +
                    "</body></html>";

                iframe = document.createElement("iframe");
                iframe.setAttribute("aria-hidden", "true");
                iframe.style.cssText =
                    "position:fixed;right:0;bottom:0;width:1px;height:1px;opacity:0;border:0;";

                iframe.onload = () => {
                    if (settled) return;

                    // Appending an iframe fires load once for its initial
                    // about:blank document, before srcdoc has parsed. Printing
                    // on that event produces a blank page, so wait for the load
                    // that actually carries the sheet.
                    const doc = iframe?.contentDocument;
                    const sheet = doc?.querySelector<HTMLElement>(".sb-sheet");
                    if (!sheet) return;

                    settled = true;
                    try {
                        fitSheet(sheet);
                        iframe?.contentWindow?.focus();
                        iframe?.contentWindow?.print();
                    } catch {
                        window.print();
                    }
                    // Keep the frame alive briefly: removing it while the dialog
                    // is still reading from it cancels the print in some browsers.
                    setTimeout(cleanup, 1000);
                };

                // srcdoc before insertion, so the first load event that matters
                // is the one for this content.
                iframe.srcdoc = html;
                document.body.appendChild(iframe);

                // If the frame never loads, do not leave the user with a button
                // stuck on "Preparing..." and no dialog.
                setTimeout(() => {
                    if (settled) return;
                    settled = true;
                    cleanup();
                    window.print();
                }, 3000);
            } catch {
                settled = true;
                cleanup();
                window.print();
            }
        }, 0);
    };

    /* ---- opponent lists ---- */

    const wide = useWide();
    // The matchup the side panel shows: whichever one you last clicked or
    // tabbed into. Not saved — it's where you are, not part of the guide.
    const [activeId, setActiveId] = useState<string | null>(null);
    const active = matchups.find((m) => m.id === activeId) ?? matchups[0] ?? null;
    // Narrow screens: which matchups have their list opened inline.
    const [openLists, setOpenLists] = useState<Record<string, boolean>>({});

    const archetypeUrls = new Map(
        available
            .filter((a) => a.url)
            .map((a) => [a.name.toLowerCase(), a.url as string])
    );
    const listUrl = (m: Matchup) => m.deckUrl ?? archetypeUrls.get(m.name.toLowerCase()) ?? null;

    const opponentDeck = (m: Matchup) => (
        <OpponentDeck
            name={m.name}
            url={listUrl(m)}
            customUrl={m.deckUrl !== null}
            onSetUrl={(url) => patch(m.id, { deckUrl: url })}
            stickyPreview={wide}
        />
    );

    /**
     * Adds a blank matchup at the end of the list and puts the cursor in its
     * name, so you can type the archetype straight away. There are two Add
     * buttons — beside Load Metagame and under the last matchup — so a long
     * guide doesn't mean scrolling back to the top to add one more; focusing
     * the new name also brings it into view from either one.
     */
    const focusMatchupId = useRef<string | null>(null);
    const addMatchup = () => {
        const m = emptyMatchup("New matchup");
        focusMatchupId.current = m.id;
        setMatchups((p) => [...p, m]);
    };

    // Runs after the new row has rendered. An effect rather than a timer or
    // animation frame, which can fire before the commit or not at all in a
    // background tab.
    useEffect(() => {
        const id = focusMatchupId.current;
        if (!id) return;
        focusMatchupId.current = null;
        const input = document.querySelector<HTMLInputElement>(`[data-matchup-name="${id}"]`);
        input?.focus();
        input?.select();
    }, [matchups]);

    const patch = (id: string, fields: Partial<Matchup>) =>
        setMatchups((prev) => prev.map((m) => (m.id === id ? { ...m, ...fields } : m)));

    const maindeck = sections?.maindeck ?? [];
    const sideboard = sections?.sideboard ?? [];

    const deckSize = totalCards(maindeck);

    // Plain computations rather than useMemo: React Compiler memoizes these
    // itself, and a hand-written useMemo it can't preserve makes it bail out
    // of optimizing the whole component. Filtering a few dozen matchups is
    // nothing next to losing auto-memoization everywhere else.
    //
    // `illegal` blocks printing and saving — a guide that boards you down to
    // 59 is worse than no guide, because you'd only find out at the table.
    const illegal = matchups.filter((m) =>
        matchupChecks(m, deckSize).some((c) => c.state === "short")
    );

    const overSized = matchups.filter((m) =>
        matchupChecks(m, deckSize).some((c) => c.state === "over")
    );

    const planned = matchups.filter(
        (m) => m.out.length || m.in.length || m.notes.trim()
    ).length;

    return (
        <div className="space-y-10">
            {/* Opening a saved guide arrives as ?guide=<id>. This lives in its
                own Suspense-wrapped child because useSearchParams opts a
                component out of prerendering, and /sideboard is static. */}
            <Suspense fallback={null}>
                <GuideLoader
                    onLoad={(loaded, opened) =>
                        setPlan({
                            ...normalisePlan(loaded, EMPTY_PLAN),
                            // From the row that was actually fetched, not from
                            // whatever id the stored JSON happens to carry.
                            savedId: opened.id,
                            savedName: opened.name,
                        })
                    }
                />
            </Suspense>

            {/* ===================== screen UI ===================== */}
            <div className="sb-noprint space-y-10">
                {plan.savedId !== null && plan.savedName && (
                    <GuideNameBar
                        id={plan.savedId}
                        name={plan.savedName}
                        onRenamed={(name) => setPlan((p) => ({ ...p, savedName: name }))}
                    />
                )}

                {/* ---- decklist ---- */}
                <section className="bg-parchment-dark shadow-card rounded-lg p-4 sm:p-6 space-y-4">
                    <h2 className="text-2xl font-title flex flex-wrap items-center">
                        Your Decklist
                        <HelpTip text="Paste a decklist with its sideboard, or an MTGGoldfish deck or archetype link. Lists are split into maindeck and sideboard automatically — either by a 'Sideboard' line, or by the blank line MTGGoldfish uses to separate them." />
                    </h2>

                    <div className="relative">
                        <textarea
                            className="w-full h-40 p-4 bg-parchment shadow-inner-parchment rounded resize-none text-ink"
                            placeholder="Paste your decklist (with sideboard) here, or an MTGGoldfish deck link..."
                            value={decklist}
                            onChange={(e) => setDecklist(e.target.value)}
                        />

                        {(decklist.trim() || sections) &&
                            (confirmDeckClear ? (
                                // Confirmed in the page rather than through a
                                // browser dialog: the native one is chrome, not
                                // app, and reads as the browser interrupting you.
                                <span className="absolute top-2 right-2 flex items-center gap-1 bg-parchment-dark rounded px-2 py-1 shadow-card">
                                    <span className="text-xs text-ink/70">Clear the list?</span>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            // Only the list goes. The matchup plans are
                                            // written against card names, so they survive
                                            // a different deck being pasted in.
                                            setPlan((prev) => ({ ...prev, decklist: "", loadedText: "" }));
                                            setDeckError(null);
                                            setConfirmDeckClear(false);
                                        }}
                                        className="px-2 py-0.5 rounded text-xs font-semibold text-red-700 hover:bg-red-700/10"
                                    >
                                        Yes
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setConfirmDeckClear(false)}
                                        className="px-2 py-0.5 rounded text-xs text-ink/60 hover:bg-parchment"
                                    >
                                        No
                                    </button>
                                </span>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setConfirmDeckClear(true)}
                                    className="absolute top-2 right-2 px-3 py-1 rounded text-xs font-semibold bg-parchment-dark text-ink/70 hover:text-red-700 hover:bg-red-700/10 transition-colors"
                                >
                                    Clear
                                </button>
                            ))}
                    </div>

                    {deckError && <p className="text-red-700 text-sm">{deckError}</p>}

                    <div className="flex justify-center">
                        <button
                            type="button"
                            onClick={deckLoading ? undefined : loadDeck}
                            disabled={deckLoading}
                            className={
                                "px-6 py-3 rounded shadow-card font-title text-xl " +
                                (deckLoading
                                    ? "bg-gray-400 cursor-not-allowed"
                                    : "bg-brand text-midnight-light hover:bg-brand-dark")
                            }
                        >
                            {deckLoading ? "Loading..." : "Load Deck"}
                        </button>
                    </div>

                    {sections && (
                        <div className="grid sm:grid-cols-2 gap-4 pt-2">
                            <div className="bg-parchment rounded shadow-inner-parchment p-3 sm:p-4">
                                <p className="font-title text-lg mb-2">
                                    Maindeck{" "}
                                    <span className="text-ink/60 text-base">({totalCards(maindeck)} cards)</span>
                                </p>
                                <ul className="text-sm text-ink/85 space-y-0.5 max-h-64 overflow-y-auto">
                                    {maindeck.map((c) => (
                                        <li key={c.name}>
                                                <FitText max={14} min={10} title={`${c.qty} ${c.name}`}>
                                                    {c.qty} {c.name}
                                                </FitText>
                                            </li>
                                    ))}
                                </ul>
                            </div>

                            <div className="bg-parchment rounded shadow-inner-parchment p-3 sm:p-4">
                                <p className="font-title text-lg mb-2">
                                    Sideboard{" "}
                                    <span className="text-ink/60 text-base">({totalCards(sideboard)} cards)</span>
                                </p>
                                {sideboard.length === 0 ? (
                                    <p className="text-sm text-amber-700">
                                        No sideboard found in that list. The &quot;In&quot; boxes draw from it, so add
                                        one below a blank line or a &quot;Sideboard&quot; heading.
                                    </p>
                                ) : (
                                    <ul className="text-sm text-ink/85 space-y-0.5 max-h-64 overflow-y-auto">
                                        {sideboard.map((c) => (
                                            <li key={c.name}>
                                                <FitText max={14} min={10} title={`${c.qty} ${c.name}`}>
                                                    {c.qty} {c.name}
                                                </FitText>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    )}
                </section>

                {/* ---- format and archetypes ---- */}
                <section className="bg-parchment-dark shadow-card rounded-lg p-4 sm:p-6 space-y-4">
                    <h2 className="text-2xl font-title flex flex-wrap items-center">
                        Format &amp; Archetypes
                        <HelpTip text="Pick a format and how many of the top metagame decks to plan against. Archetype names and metagame share come from MTGGoldfish. You can rename, add or remove any of them afterwards." />
                    </h2>

                    <div className="flex flex-wrap items-end gap-4">
                        <label className="flex flex-col gap-1">
                            <span className="text-sm text-ink/70">Format</span>
                            <select
                                value={format}
                                onChange={(e) => setFormat(e.target.value)}
                                className="px-3 py-2 rounded bg-parchment text-ink shadow-inner-parchment"
                            >
                                {SUPPORTED_FORMATS.map((f) => (
                                    <option key={f.slug} value={f.slug}>{f.label}</option>
                                ))}
                            </select>
                        </label>

                        <label className="flex flex-col gap-1">
                            <span className="text-sm text-ink/70">Decks from the last</span>
                            <select
                                value={period}
                                onChange={(e) => setPeriod(Number(e.target.value))}
                                className="px-3 py-2 rounded bg-parchment text-ink shadow-inner-parchment"
                            >
                                {META_PERIODS.map((d) => (
                                    <option key={d} value={d}>{d} days</option>
                                ))}
                            </select>
                        </label>

                        <label className="flex flex-col gap-1">
                            <span className="text-sm text-ink/70">Pull top (1–{MAX_ARCHETYPES})</span>
                            <input
                                type="number"
                                min={1}
                                max={MAX_ARCHETYPES}
                                value={count}
                                onChange={(e) => {
                                    const raw = parseInt(e.target.value, 10);
                                    const n = Number.isNaN(raw) ? 1 : raw;
                                    setCount(Math.min(MAX_ARCHETYPES, Math.max(1, n)));
                                }}
                                className="w-24 px-3 py-2 rounded bg-parchment text-ink shadow-inner-parchment"
                            />
                        </label>

                        <button
                            type="button"
                            onClick={archLoading ? undefined : loadArchetypes}
                            disabled={archLoading}
                            className={
                                "px-5 py-2 rounded shadow-card font-title " +
                                (archLoading
                                    ? "bg-gray-400 cursor-not-allowed"
                                    : "bg-brand text-midnight-light hover:bg-brand-dark")
                            }
                        >
                            {archLoading ? "Loading..." : "Load Metagame"}
                        </button>

                        <button
                            type="button"
                            onClick={addMatchup}
                            className="px-5 py-2 rounded shadow-card font-title bg-parchment text-ink hover:bg-parchment/70"
                        >
                            + Add Matchup
                        </button>
                    </div>

                    {archError && <p className="text-red-700 text-sm">{archError}</p>}

                    {available.length > 0 && (
                        <div className="space-y-3 pt-2">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-sm text-ink/70">
                                    {available.length} archetypes in the {formatLabel(format)} metagame
                                    {plan.availablePeriod ? ` over the last ${plan.availablePeriod} days` : ""}
                                    {" "}&mdash; tick the ones you want in your guide.
                                    {plan.availablePeriod !== null && plan.availablePeriod !== period && (
                                        <span className="text-amber-700">
                                            {" "}Press Load Metagame to switch to the last {period} days.
                                        </span>
                                    )}
                                </p>
                                <div className="flex flex-wrap gap-2">
                                    <button
                                        type="button"
                                        onClick={() => selectTop(10)}
                                        className="text-xs px-2 py-1 rounded bg-parchment text-ink hover:bg-parchment/70 shadow-inner-parchment"
                                    >
                                        Tick top 10
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => selectTop(SHEET_TARGET_MATCHUPS)}
                                        className="text-xs px-2 py-1 rounded bg-parchment text-ink hover:bg-parchment/70 shadow-inner-parchment"
                                    >
                                        Tick top {SHEET_TARGET_MATCHUPS}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={untickAll}
                                        className="text-xs px-2 py-1 rounded bg-parchment text-ink hover:bg-parchment/70 shadow-inner-parchment"
                                    >
                                        Untick all
                                    </button>
                                </div>
                            </div>

                            <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1 max-h-96 overflow-y-auto bg-parchment rounded shadow-inner-parchment p-3">
                                {available.map((a) => {
                                    const on = isIncluded(a.name);
                                    return (
                                        <li key={a.name}>
                                            <label
                                                className={
                                                    "flex items-center gap-2 px-2 py-1 rounded cursor-pointer text-sm " +
                                                    (on ? "bg-brass/20 text-ink" : "text-ink/85 hover:bg-brass/10")
                                                }
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={on}
                                                    onChange={() => toggleArchetype(a)}
                                                    className="accent-[#2f4a3a] shrink-0"
                                                />
                                                <span className="truncate flex-1" title={a.name}>{a.name}</span>
                                                {a.pct !== null && (
                                                    <span className="shrink-0 text-xs text-ink/50">{a.pct}%</span>
                                                )}
                                            </label>
                                        </li>
                                    );
                                })}
                            </ul>

                            <p
                                className={
                                    "text-sm " +
                                    (fitNow && !fitNow.fits && matchups.length > 0 ? "text-amber-700" : "text-ink/70")
                                }
                            >
                                {matchups.length} selected for your guide.
                                {fitNow && !fitNow.fits && matchups.length > 0
                                    ? " With everything you've written, the printed guide runs onto a second page."
                                    : ""}
                            </p>
                        </div>
                    )}
                </section>

                {/* ---- matchups ---- */}
                {matchups.length > 0 && (
                    <section className="bg-parchment-dark shadow-card rounded-lg p-4 sm:p-6 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <h2 className="text-2xl font-title flex flex-wrap items-center">
                                Sideboard Plans
                                <HelpTip text="For each matchup, list what you're boarding out of the maindeck and in from the sideboard. You can't list more copies than you actually run, and the card count has to land on 60 or better. Tick Separate Play / Draw when you board differently on the play than on the draw." />
                            </h2>
                            <p className="text-sm text-ink/60">{planned} of {matchups.length} planned</p>
                        </div>

                        {!sections && (
                            <p className="text-amber-700 text-sm">
                                Paste your deck above to get card suggestions and real copy counts.
                            </p>
                        )}

                        <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-6 xl:items-start">
                        <div className="space-y-4">
                            {matchups.map((m, idx) => (
                                <div
                                    key={m.id}
                                    // Capture phase, so clicking or tabbing into any
                                    // field inside counts as working on this matchup.
                                    onPointerDownCapture={() => setActiveId(m.id)}
                                    onFocusCapture={() => setActiveId(m.id)}
                                    className={
                                        "bg-parchment rounded shadow-inner-parchment p-3 sm:p-4 space-y-3 " +
                                        (wide && active?.id === m.id ? "ring-2 ring-brass/70" : "")
                                    }
                                >
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-ink/40 text-sm w-6 shrink-0">{idx + 1}.</span>

                                        <input
                                            type="text"
                                            aria-label="Archetype name"
                                            data-matchup-name={m.id}
                                            value={m.name}
                                            onChange={(e) => patch(m.id, { name: e.target.value })}
                                            className="flex-1 min-w-[12rem] px-2 py-1 rounded bg-parchment-dark text-ink font-title text-lg shadow-inner-parchment"
                                        />

                                        {m.pct !== null && (
                                            <span
                                                className="text-xs text-ink/55 shrink-0"
                                                title="Share of the current metagame, per MTGGoldfish"
                                            >
                                                {m.pct}% of meta
                                            </span>
                                        )}

                                        <label className="flex items-center gap-1.5 text-xs text-ink/70 shrink-0 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={m.splitPlayDraw}
                                                onChange={(e) => {
                                                    const on = e.target.checked;
                                                    patch(m.id, {
                                                        splitPlayDraw: on,
                                                        // Seed the draw plan from the play plan — it is
                                                        // usually the same list give or take a card.
                                                        drawOut:
                                                            on && m.drawOut.length === 0
                                                                ? m.out.map((r) => ({ ...r }))
                                                                : m.drawOut,
                                                        drawIn:
                                                            on && m.drawIn.length === 0
                                                                ? m.in.map((r) => ({ ...r }))
                                                                : m.drawIn,
                                                    });
                                                }}
                                                className="accent-[#2f4a3a]"
                                            />
                                            Separate Play / Draw
                                        </label>

                                        <button
                                            type="button"
                                            aria-label={`Remove ${m.name}`}
                                            onClick={() => setMatchups((p) => p.filter((x) => x.id !== m.id))}
                                            className="shrink-0 w-7 h-7 rounded text-ink/50 hover:text-red-700 hover:bg-red-700/10"
                                        >
                                            ×
                                        </button>
                                    </div>

                                    {m.splitPlayDraw ? (
                                        <div className="space-y-4">
                                            <PlanPair
                                                heading="On the Play"
                                                outRows={m.out}
                                                inRows={m.in}
                                                maindeck={maindeck}
                                                sideboard={sideboard}
                                                deckSize={deckSize}
                                                onOut={(rows) => patch(m.id, { out: rows })}
                                                onIn={(rows) => patch(m.id, { in: rows })}
                                            />
                                            <PlanPair
                                                heading="On the Draw"
                                                outRows={m.drawOut}
                                                inRows={m.drawIn}
                                                maindeck={maindeck}
                                                sideboard={sideboard}
                                                deckSize={deckSize}
                                                onOut={(rows) => patch(m.id, { drawOut: rows })}
                                                onIn={(rows) => patch(m.id, { drawIn: rows })}
                                            />
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    patch(m.id, {
                                                        drawOut: m.out.map((r) => ({ ...r })),
                                                        drawIn: m.in.map((r) => ({ ...r })),
                                                    })
                                                }
                                                className="text-xs text-brand hover:text-brand-dark underline underline-offset-2"
                                            >
                                                Copy the Play plan into the Draw plan
                                            </button>
                                        </div>
                                    ) : (
                                        <PlanPair
                                            heading={null}
                                            outRows={m.out}
                                            inRows={m.in}
                                            maindeck={maindeck}
                                            sideboard={sideboard}
                                            deckSize={deckSize}
                                            onOut={(rows) => patch(m.id, { out: rows })}
                                            onIn={(rows) => patch(m.id, { in: rows })}
                                        />
                                    )}

                                    <label className="block text-xs font-semibold uppercase tracking-wider text-ink/60">
                                        Notes
                                        <textarea
                                            value={m.notes}
                                            onChange={(e) => patch(m.id, { notes: e.target.value })}
                                            rows={2}
                                            placeholder="Keep removal for their threats, cut the clunky top end on the draw..."
                                            className="mt-1 w-full px-2 py-1.5 rounded bg-parchment-dark text-ink text-sm font-normal normal-case tracking-normal shadow-inner-parchment resize-y"
                                        />
                                    </label>

                                    {!wide && (
                                        <div className="border-t border-brass/20 pt-2">
                                            <button
                                                type="button"
                                                aria-expanded={!!openLists[m.id]}
                                                onClick={() =>
                                                    setOpenLists((o) => ({ ...o, [m.id]: !o[m.id] }))
                                                }
                                                className="text-sm text-brand hover:text-brand-dark underline underline-offset-2"
                                            >
                                                {openLists[m.id] ? "Hide their list" : "Show their list"}
                                            </button>
                                            {openLists[m.id] && (
                                                <div className="pt-3">{opponentDeck(m)}</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {wide && active && (
                            <aside className="sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto bg-parchment rounded shadow-inner-parchment p-4">
                                {/* Keyed by matchup so the preview resets when you
                                    switch to a different opponent. */}
                                <div key={active.id}>{opponentDeck(active)}</div>
                            </aside>
                        )}
                        </div>

                        <div className="flex justify-center">
                            <button
                                type="button"
                                onClick={addMatchup}
                                className="px-5 py-2 rounded shadow-card font-title bg-parchment text-ink hover:bg-parchment/70"
                            >
                                + Add Matchup
                            </button>
                        </div>

                        {illegal.length > 0 && (
                            <div
                                role="alert"
                                className="bg-red-700/10 border border-red-700/40 rounded p-4 space-y-1"
                            >
                                <p className="font-title text-lg text-red-700">
                                    Illegal deck &mdash;{" "}
                                    {illegal.length === 1
                                        ? "1 matchup boards"
                                        : `${illegal.length} matchups board`}{" "}
                                    you below {MIN_DECK}
                                </p>
                                <p className="text-sm text-ink/80">
                                    You&apos;re taking out more than you&apos;re bringing in:{" "}
                                    {illegal.slice(0, 4).map((m) => m.name).join(", ")}
                                    {illegal.length > 4 ? `, and ${illegal.length - 4} more` : ""}. Fix
                                    those before you print &mdash; you&apos;d be shuffling up with an
                                    illegal deck.
                                </p>
                            </div>
                        )}

                        {illegal.length === 0 && overSized.length > 0 && (
                            <div className="bg-amber-700/10 border border-amber-700/40 rounded p-4 space-y-1">
                                <p className="font-title text-lg text-amber-800">
                                    {overSized.length === 1
                                        ? "1 matchup goes"
                                        : `${overSized.length} matchups go`}{" "}
                                    over {deckSize}
                                </p>
                                <p className="text-sm text-ink/80">
                                    Legal, but you&apos;re bringing in more than you&apos;re taking out in{" "}
                                    {overSized.slice(0, 4).map((m) => m.name).join(", ")}
                                    {overSized.length > 4 ? `, and ${overSized.length - 4} more` : ""}.
                                    Worth a second look if you didn&apos;t mean to run a bigger deck.
                                </p>
                            </div>
                        )}

                        {/* Keep, print, save on the left; Start Over apart on the right
                            and in red, so the one button that throws work away never
                            sits in the same row of look-alikes as Save. */}
                        <div className="border-t border-brass/25 pt-5 flex flex-col sm:flex-row sm:items-start gap-3">
                            <div className="flex flex-wrap gap-3 flex-1">
                                <button
                                    type="button"
                                    onClick={exporting || illegal.length > 0 ? undefined : exportSheet}
                                    disabled={exporting || illegal.length > 0}
                                    aria-busy={exporting}
                                    title={
                                        illegal.length > 0
                                            ? "Fix the matchups that board you below 60 first"
                                            : undefined
                                    }
                                    className={
                                        ACTION_BUTTON +
                                        (exporting || illegal.length > 0
                                            ? "bg-gray-400 cursor-not-allowed text-midnight-light"
                                            : "bg-brass text-brass-ink hover:bg-brass-dark")
                                    }
                                >
                                    {exporting ? "Preparing..." : "Export PDF"}
                                </button>
                                {authEnabled &&
                                    (illegal.length > 0 ? (
                                        <button
                                            type="button"
                                            disabled
                                            title="Fix the matchups that board you below 60 first"
                                            className={ACTION_BUTTON + "bg-gray-400 cursor-not-allowed text-midnight-light"}
                                        >
                                            {plan.savedId === null ? "Save to Profile" : "Save"}
                                        </button>
                                    ) : (
                                        <SaveToProfileButton
                                            plan={plan}
                                            format={format}
                                            formatLabel={formatLabel(format)}
                                            savedId={plan.savedId}
                                            savedName={plan.savedName}
                                            buttonClass={ACTION_BUTTON}
                                            onSaved={(saved) =>
                                                // Whichever way it saved — updating
                                                // the open guide, or branching a new
                                                // one — that row is now what is open.
                                                setPlan((p) => ({
                                                    ...p,
                                                    savedId: saved.id,
                                                    savedName: saved.name,
                                                }))
                                            }
                                        />
                                    ))}
                            </div>

                            <button
                                type="button"
                                onClick={() => {
                                    // Nothing written yet — no point asking.
                                    if (planned === 0 && !plan.loadedText.trim()) {
                                        resetEverything();
                                        return;
                                    }
                                    setConfirmClear(true);
                                }}
                                className={ACTION_BUTTON + "bg-red-700 text-white hover:bg-red-800"}
                            >
                                Start Over
                            </button>
                        </div>

                        {fitNow &&
                            (fitNow.fits ? (
                                <p className="text-sm text-ink/60 flex items-center">
                                    Fits on one page at {pxToPt(fitNow.px)} pt
                                    <HelpTip text="Export opens your browser's print dialog; pick Save as PDF. Text sizes itself to fill one page, so fewer matchups print bigger. If a date or web address still shows up, untick Headers and footers." />
                                </p>
                            ) : (
                                <div className="bg-amber-700/10 border border-amber-700/40 rounded p-4 space-y-1">
                                    <p className="font-title text-lg text-amber-800">
                                        This guide runs onto a second page
                                    </p>
                                    <p className="text-sm text-ink/80">
                                        Even at {pxToPt(MIN_SHEET_PX)} pt it won&apos;t fit. Trim some notes or
                                        cut a matchup to keep it to one sheet.
                                    </p>
                                </div>
                            ))}

                    </section>
                )}
            </div>

            {/* ---- clear confirmation, with a chance to save first ---- */}
            {confirmClear && (
                <div
                    className="sb-noprint fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="clear-plan-title"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) setConfirmClear(false);
                    }}
                >
                    <div className="bg-parchment rounded-lg shadow-card p-6 max-w-md w-full space-y-4 text-ink">
                        <h3 id="clear-plan-title" className="font-title text-2xl text-red-800">
                            Start over?
                        </h3>

                        <p className="leading-relaxed">
                            This wipes the decklist, the maindeck and sideboard it was split into, and
                            every matchup
                            {planned > 0
                                ? ` — including the ${planned} you've written up`
                                : " on the list"}
                            . The format and the archetypes you pulled stay, so you can paste a new list
                            straight in.
                        </p>

                        <p className="text-sm font-semibold text-red-800 bg-red-700/10 border border-red-700/30 rounded px-3 py-2">
                            There&apos;s no undo. Anything you haven&apos;t saved is gone.
                        </p>

                        {authEnabled ? (
                            <p className="text-sm text-ink/70">
                                {plan.savedName
                                    ? `Save your progress first: Save and clear updates “${plan.savedName}”, so you can open it again from your profile.`
                                    : "Save your progress first if you want it back later. Save and clear puts it in your profile, then starts fresh."}
                            </p>
                        ) : (
                            <p className="text-sm text-amber-700">
                                There&apos;s nowhere to save this on this deployment, so clearing is
                                final. Print it first if you want a copy.
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
                                <SaveToProfileButton
                                    plan={plan}
                                    format={format}
                                    formatLabel={formatLabel(format)}
                                    savedId={plan.savedId}
                                    savedName={plan.savedName}
                                    // Branching a copy in the middle of a reset
                                    // is a different intent from "keep this
                                    // before I wipe it"; a second button here
                                    // only invites a misclick.
                                    allowSaveAsNew={false}
                                    label="Save and clear"
                                    buttonClass="px-4 py-2 rounded shadow-card font-title text-sm "
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

            {/* ===================== printed sheet ===================== */}
            {/* Hidden on screen; globals.css swaps the two in @media print. The
                printed layout is deliberately separate markup rather than a
                restyling of the editor, because fitting 30 matchups on one side
                of one page needs inline card lists, not stacked input rows.
                --sb-size is the measured text size from `fit`; until there is
                one, the stylesheet's default applies. */}
            {/* The page box for Ctrl+P on this page. margin: 0 leaves the browser
                nowhere to stamp its date, title, web address and page number —
                they are drawn in the page margin. Rendered here rather than in
                globals.css so it applies only while the planner is mounted, not
                to printing every page on the site. */}
            <style>{"@media print { @page { size: letter portrait; margin: 0; } }"}</style>
            <div ref={printRef} className="sb-print" aria-hidden="true">
                <div
                    className={fit && !fit.fits ? "sb-sheet sb-overflow" : "sb-sheet"}
                    style={fit ? ({ "--sb-size": `${fit.px}px` } as React.CSSProperties) : undefined}
                >
                    <div className="sb-sheet-head">
                        <span className="sb-sheet-title">{plan.savedName ?? "Sideboard Guide"}</span>
                        <span className="sb-sheet-format">
                            {formatLabel(format)}
                            {/* The percentages on the sheet only mean something
                                with the window they were measured over. */}
                            {plan.availablePeriod && matchups.some((m) => m.pct !== null)
                                ? ` · meta % over ${plan.availablePeriod} days`
                                : ""}
                        </span>
                    </div>

                    <div className="sb-cols">
                        {matchups.map((m) => (
                            <div key={m.id} className="sb-item">
                                <div className="sb-item-title">
                                    <span className="sb-item-name">{m.name}</span>
                                    {m.pct !== null && <span className="sb-item-pct">{m.pct}%</span>}
                                </div>

                                {m.splitPlayDraw ? (
                                    <div className="sb-rows sb-split">
                                        <span className="sb-when">Play</span>
                                        <SheetRow label="out" rows={m.out} />
                                        <span />
                                        <SheetRow label="in" rows={m.in} />
                                        <span className="sb-when">Draw</span>
                                        <SheetRow label="out" rows={m.drawOut} />
                                        <span />
                                        <SheetRow label="in" rows={m.drawIn} />
                                    </div>
                                ) : (
                                    <div className="sb-rows">
                                        <SheetRow label="out" rows={m.out} />
                                        <SheetRow label="in" rows={m.in} />
                                    </div>
                                )}

                                {m.notes.trim() && <div className="sb-notes">{m.notes.trim()}</div>}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
