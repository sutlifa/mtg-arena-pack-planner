"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import HelpTip from "./HelpTip";
import CardAutocomplete, { type CardRow } from "./CardAutocomplete";
import { useSession } from "next-auth/react";
import { isGoldfishDeckUrl } from "@/lib/goldfishUrl";
import { splitDeckSections, totalCards, type DeckCard } from "@/lib/deckSections";
import { SUPPORTED_FORMATS, MAX_ARCHETYPES, ONE_PAGE_MATCHUPS, formatLabel } from "@/lib/formats";

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
});

const sumQty = (rows: CardRow[]) =>
    rows.reduce((n, r) => n + (r.name.trim() ? r.qty : 0), 0);

/** "2 Torpor Orb, 1 Snakeskin Veil" — the compact form used on the printed sheet. */
const inlineList = (rows: CardRow[]) =>
    rows.filter((r) => r.name.trim()).map((r) => `${r.qty} ${r.name.trim()}`).join(", ");

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
    onOut,
    onIn,
}: {
    heading: string | null;
    outRows: CardRow[];
    inRows: CardRow[];
    maindeck: DeckCard[];
    sideboard: DeckCard[];
    onOut: (rows: CardRow[]) => void;
    onIn: (rows: CardRow[]) => void;
}) {
    const outN = sumQty(outRows);
    const inN = sumQty(inRows);
    const unbalanced = outN !== inN;

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

            {(outN > 0 || inN > 0) && (
                <p className={"text-xs " + (unbalanced ? "text-amber-700" : "text-green-800/80")}>
                    {outN} out / {inN} in
                    {unbalanced ? " — these do not match, so your deck would change size." : ""}
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
    matchups: Matchup[];
    /** The archetypes pulled from the metagame, for the picker. */
    available: Archetype[];
    /**
     * Plans for archetypes the user has unchecked. Unticking a box should hide
     * a matchup, not destroy work — re-ticking it brings the plan back.
     */
    stash: Record<string, Matchup>;
}

const EMPTY_PLAN: PlanState = {
    decklist: "",
    loadedText: "",
    format: "modern",
    count: 50,
    matchups: [],
    available: [],
    stash: {},
};

export default function SideboardPlanner() {
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

    const { decklist, format, count, matchups, available } = plan;

    const setDecklist = (v: string) => setPlan((p) => ({ ...p, decklist: v }));
    const setFormat = (v: string) => setPlan((p) => ({ ...p, format: v }));
    const setCount = (v: number) => setPlan((p) => ({ ...p, count: v }));
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
                const parsed = JSON.parse(saved);
                const restored: PlanState = {
                    decklist: typeof parsed.decklist === "string" ? parsed.decklist : "",
                    loadedText:
                        typeof parsed.loadedText === "string"
                            ? parsed.loadedText
                            : typeof parsed.decklist === "string"
                                ? parsed.decklist
                                : "",
                    format: typeof parsed.format === "string" ? parsed.format : EMPTY_PLAN.format,
                    count: typeof parsed.count === "number" ? parsed.count : EMPTY_PLAN.count,
                    matchups: Array.isArray(parsed.matchups)
                        // Tolerate plans saved before the Play/Draw split existed.
                        ? parsed.matchups.map((m: Partial<Matchup>) => ({
                            ...emptyMatchup(m.name ?? "Matchup"),
                            ...m,
                            id: m.id ?? newId(),
                            splitPlayDraw: m.splitPlayDraw ?? false,
                            drawOut: m.drawOut ?? [],
                            drawIn: m.drawIn ?? [],
                        }))
                        : [],
                    available: Array.isArray(parsed.available) ? parsed.available : [],
                    stash:
                        parsed.stash && typeof parsed.stash === "object" ? parsed.stash : {},
                };
                setPlan(restored);
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
                body: JSON.stringify({ format, limit: count }),
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
                return {
                    ...p,
                    available: data.archetypes,
                    matchups: p.matchups.map((m) =>
                        pcts.has(m.name.toLowerCase())
                            ? { ...m, pct: pcts.get(m.name.toLowerCase()) ?? m.pct }
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

    /* ---- saving to a profile ---- */

    const { data: session } = useSession();
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState<string | null>(null);

    const saveToProfile = async () => {
        const suggested =
            matchups.length > 0 ? `${formatLabel(format)} sideboard guide` : "Sideboard guide";
        const name = window.prompt("Save this guide as:", suggested);
        if (name === null) return; // cancelled
        if (!name.trim()) {
            setSaveMsg("Give the guide a name.");
            return;
        }

        setSaving(true);
        setSaveMsg(null);
        try {
            const res = await fetch("/api/guides", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                // The whole plan goes up as-is: it is the same object already
                // kept in localStorage, so a saved guide and a local one are
                // the same shape and load into the editor identically.
                body: JSON.stringify({ name: name.trim(), format, plan }),
            });
            const data = await res.json().catch(() => ({}));

            if (res.status === 401) {
                setSaveMsg("Sign in first to save to your profile.");
            } else if (!res.ok) {
                setSaveMsg(data.error ?? "Could not save that guide.");
            } else {
                setSaveMsg(`Saved as "${data.name}".`);
            }
        } catch {
            setSaveMsg("Could not save that guide.");
        }
        setSaving(false);
    };

    /* ---- printing ---- */

    const printRef = useRef<HTMLDivElement>(null);
    const [exporting, setExporting] = useState(false);

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
     * The page's own @media print rules are still the single source of truth for
     * how the sheet looks — the iframe loads the same stylesheets rather than
     * carrying a second copy of them. Falls back to window.print() if anything
     * about the iframe path fails.
     */
    const exportSheet = () => {
        const src = printRef.current;
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
                    "</head><body><div class=\"sb-print\">" +
                    src.innerHTML +
                    "</div></body></html>";

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
                    if (!doc || !doc.querySelector(".sb-print-item")) return;

                    settled = true;
                    try {
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

    const patch = (id: string, fields: Partial<Matchup>) =>
        setMatchups((prev) => prev.map((m) => (m.id === id ? { ...m, ...fields } : m)));

    const maindeck = sections?.maindeck ?? [];
    const sideboard = sections?.sideboard ?? [];

    const planned = useMemo(
        () => matchups.filter((m) => m.out.length || m.in.length || m.notes.trim()).length,
        [matchups]
    );

    return (
        <div className="space-y-10">
            {/* ===================== screen UI ===================== */}
            <div className="sb-noprint space-y-10">

                {/* ---- decklist ---- */}
                <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-4">
                    <h2 className="text-2xl font-title flex items-center">
                        Your Decklist
                        <HelpTip text="Paste a decklist with its sideboard, or an MTGGoldfish deck or archetype link. Lists are split into maindeck and sideboard automatically — either by a 'Sideboard' line, or by the blank line MTGGoldfish uses to separate them." />
                    </h2>

                    <textarea
                        className="w-full h-40 p-4 bg-parchment shadow-inner-parchment rounded resize-none text-ink"
                        placeholder="Paste your decklist (with sideboard) here, or an MTGGoldfish deck link..."
                        value={decklist}
                        onChange={(e) => setDecklist(e.target.value)}
                    />

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
                            <div className="bg-parchment rounded shadow-inner-parchment p-4">
                                <p className="font-title text-lg mb-2">
                                    Maindeck{" "}
                                    <span className="text-ink/60 text-base">({totalCards(maindeck)} cards)</span>
                                </p>
                                <ul className="text-sm text-ink/85 space-y-0.5 max-h-64 overflow-y-auto">
                                    {maindeck.map((c) => (
                                        <li key={c.name}>{c.qty} {c.name}</li>
                                    ))}
                                </ul>
                            </div>

                            <div className="bg-parchment rounded shadow-inner-parchment p-4">
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
                                            <li key={c.name}>{c.qty} {c.name}</li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        </div>
                    )}
                </section>

                {/* ---- format and archetypes ---- */}
                <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-4">
                    <h2 className="text-2xl font-title flex items-center">
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
                            onClick={() => setMatchups((p) => [...p, emptyMatchup("New matchup")])}
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
                                    {available.length} archetypes in the current {formatLabel(format)} metagame
                                    &mdash; tick the ones you want in your guide.
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
                                        onClick={() => selectTop(ONE_PAGE_MATCHUPS)}
                                        className="text-xs px-2 py-1 rounded bg-parchment text-ink hover:bg-parchment/70 shadow-inner-parchment"
                                    >
                                        Tick top {ONE_PAGE_MATCHUPS}
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
                                    (matchups.length > ONE_PAGE_MATCHUPS ? "text-amber-700" : "text-ink/70")
                                }
                            >
                                {matchups.length} selected for your guide.
                                {matchups.length > ONE_PAGE_MATCHUPS
                                    ? ` Around ${ONE_PAGE_MATCHUPS} fully written matchups fills a printed page, so this many may run onto a second — it depends how much you write.`
                                    : ""}
                            </p>
                        </div>
                    )}
                </section>

                {/* ---- matchups ---- */}
                {matchups.length > 0 && (
                    <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <h2 className="text-2xl font-title flex items-center">
                                Sideboard Plans
                                <HelpTip text="For each matchup, list what comes out of your maindeck and what comes in from your sideboard. Quantities are capped at the copies you actually run. Tick Separate Play / Draw when a matchup needs a different plan depending on who goes first." />
                            </h2>
                            <p className="text-sm text-ink/60">{planned} of {matchups.length} planned</p>
                        </div>

                        {!sections && (
                            <p className="text-amber-700 text-sm">
                                Load a decklist above to turn on card suggestions and quantity limits.
                            </p>
                        )}

                        <div className="space-y-4">
                            {matchups.map((m, idx) => (
                                <div key={m.id} className="bg-parchment rounded shadow-inner-parchment p-4 space-y-3">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-ink/40 text-sm w-6 shrink-0">{idx + 1}.</span>

                                        <input
                                            type="text"
                                            aria-label="Archetype name"
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
                                                onOut={(rows) => patch(m.id, { out: rows })}
                                                onIn={(rows) => patch(m.id, { in: rows })}
                                            />
                                            <PlanPair
                                                heading="On the Draw"
                                                outRows={m.drawOut}
                                                inRows={m.drawIn}
                                                maindeck={maindeck}
                                                sideboard={sideboard}
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
                                            placeholder="Keep removal for their threats, cut the slow cards on the draw..."
                                            className="mt-1 w-full px-2 py-1.5 rounded bg-parchment-dark text-ink text-sm font-normal normal-case tracking-normal shadow-inner-parchment resize-y"
                                        />
                                    </label>
                                </div>
                            ))}
                        </div>

                        <div className="flex flex-wrap justify-center gap-3 pt-2">
                            <button
                                type="button"
                                onClick={exporting ? undefined : exportSheet}
                                disabled={exporting}
                                aria-busy={exporting}
                                className={
                                    "px-6 py-3 rounded shadow-card font-title text-xl " +
                                    (exporting
                                        ? "bg-gray-400 cursor-not-allowed text-midnight-light"
                                        : "bg-brass text-brass-ink hover:bg-brass-dark")
                                }
                            >
                                {exporting ? "Preparing..." : "Export PDF"}
                            </button>
                            {session?.user ? (
                                <button
                                    type="button"
                                    onClick={saving ? undefined : saveToProfile}
                                    disabled={saving}
                                    className={
                                        "px-6 py-3 rounded shadow-card font-title text-xl " +
                                        (saving
                                            ? "bg-gray-400 cursor-not-allowed text-midnight-light"
                                            : "bg-brand text-midnight-light hover:bg-brand-dark")
                                    }
                                >
                                    {saving ? "Saving..." : "Save to Profile"}
                                </button>
                            ) : (
                                <a
                                    href="/signin?callbackUrl=%2Fsideboard"
                                    className="px-6 py-3 rounded shadow-card font-title text-xl bg-parchment text-ink hover:bg-parchment/70"
                                >
                                    Sign in to Save
                                </a>
                            )}

                            <button
                                type="button"
                                onClick={() => {
                                    if (confirm("Clear every matchup and plan? This cannot be undone.")) {
                                        setMatchups(() => []);
                                    }
                                }}
                                className="px-5 py-3 rounded shadow-card font-title bg-parchment text-ink hover:bg-parchment/70"
                            >
                                Clear All
                            </button>
                        </div>

                        {saveMsg && (
                            <p className="text-sm text-center text-ink/80" role="status">
                                {saveMsg}
                            </p>
                        )}

                        <p className="text-xs text-ink/55 text-center">
                            Export opens your browser&apos;s print dialog — choose &quot;Save as PDF&quot; as the
                            destination. The sheet prints in three columns to fit on a single page.
                        </p>
                    </section>
                )}
            </div>

            {/* ===================== printed sheet ===================== */}
            {/* Hidden on screen; globals.css swaps the two in @media print. The
                printed layout is deliberately separate markup rather than a
                restyling of the editor, because fitting 25 matchups on one side
                of one page needs inline card lists, not stacked input rows. */}
            <div ref={printRef} className="sb-print" aria-hidden="true">
                <div className="sb-print-head">
                    <strong>Sideboard Guide</strong>
                    <span>
                        {formatLabel(format)}
                        {sections ? ` · ${totalCards(maindeck)} main / ${totalCards(sideboard)} side` : ""}
                    </span>
                </div>

                <div className="sb-print-cols">
                    {matchups.map((m) => (
                        <div key={m.id} className="sb-print-item">
                            <div className="sb-print-title">
                                {m.name}
                                {m.pct !== null && <span className="sb-print-pct">{m.pct}%</span>}
                            </div>

                            {m.splitPlayDraw ? (
                                <>
                                    <div className="sb-print-line"><i>Play</i></div>
                                    <div className="sb-print-line"><b>OUT</b> {inlineList(m.out) || "—"}</div>
                                    <div className="sb-print-line"><b>IN</b> {inlineList(m.in) || "—"}</div>
                                    <div className="sb-print-line"><i>Draw</i></div>
                                    <div className="sb-print-line"><b>OUT</b> {inlineList(m.drawOut) || "—"}</div>
                                    <div className="sb-print-line"><b>IN</b> {inlineList(m.drawIn) || "—"}</div>
                                </>
                            ) : (
                                <>
                                    <div className="sb-print-line"><b>OUT</b> {inlineList(m.out) || "—"}</div>
                                    <div className="sb-print-line"><b>IN</b> {inlineList(m.in) || "—"}</div>
                                </>
                            )}

                            {m.notes.trim() && <div className="sb-print-notes">{m.notes.trim()}</div>}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
