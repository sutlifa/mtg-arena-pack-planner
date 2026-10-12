"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import HelpTip from "./HelpTip";
import { DeckHandoffLoader } from "./DeckHandoff";
import { resolveNames } from "./resolveNames";
import { applyVerdicts, cardKey, mergeCards, type CollectionCard } from "@/lib/collectionText";
import { deckSections, deckFormatLabel, NO_CARDS_MESSAGE } from "@/lib/deckText";
import { totalCards } from "@/lib/deckSections";
import { BASIC_LAND_NAMES } from "@/lib/basicLands";
import { normalizeName } from "@/lib/nameUtils";
import { isGoldfishDeckUrl } from "@/lib/goldfishUrl";
import { checkDecklistSize } from "@/lib/inputLimits";
import type { HandoffDeck } from "@/lib/deckHandoff";

/** /api/card-images' per-request limit. A deck's missing cards fit in one. */
const MAX_IMAGE_NAMES = 150;

interface DeckSummary {
    id: number;
    name: string;
    format: string | null;
    main: number;
    side: number;
}

/** One card the deck asks for, under the name the collection would use. */
interface DeckNeed {
    name: string;
    qty: number;
    basic: boolean;
    /** False when the server says it isn't a card; null when it couldn't be asked. */
    recognised: boolean | null;
}

interface Compared {
    id: number | null;
    name: string | null;
    main: number;
    side: number;
    needs: DeckNeed[];
}

const isBasic = (name: string) => BASIC_LAND_NAMES.has(normalizeName(name));

/**
 * "What am I missing for this deck?", on the Collection page.
 *
 * Reads the collection, never writes it: the counts on screen are the deck's
 * against the cards above, live, so adding a card above updates the answer
 * here. It is a separate panel at the bottom of the page for that reason —
 * nothing in it should look like it edits the collection.
 *
 * The deck's names are put through /api/card-resolve before comparing, the
 * same check every card in the collection went through on the way in. A deck
 * typed with "Lim-Dul's Vault" and a collection holding the official
 * "Lim-Dûl's Vault" are one card; without resolving both sides to the same
 * spelling the card would show as missing while it sits in the binder.
 * Matching is then by cardKey, which is also how the collection merges
 * printings.
 *
 * Maindeck and sideboard are added together: you need every card in the 75
 * to play the deck. Basic lands are left out of the shortfall — Arena grants
 * them free, and nobody tracks paper basics in a collection — but are still
 * listed, so the deck's numbers add up.
 *
 * Saved decks need sign-in; pasting a list or receiving one from the Decks
 * page doesn't, so this works signed out like every other tool.
 */
export default function DeckCompare({
    cards,
    arena,
    authEnabled,
    ready,
}: {
    cards: readonly CollectionCard[];
    arena: boolean;
    authEnabled: boolean;
    /** The page has restored the collection from localStorage. */
    ready: boolean;
}) {
    const rootRef = useRef<HTMLElement>(null);

    const [paste, setPaste] = useState("");
    const [compared, setCompared] = useState<Compared | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Names couldn't be checked: compared as typed, and said so.
    const [unchecked, setUnchecked] = useState(false);
    // Only the newest comparison may land; picking a second deck while the
    // first is still resolving must not end with the first one's answer.
    const gen = useRef(0);

    const [saved, setSaved] = useState<DeckSummary[]>([]);
    const [savedState, setSavedState] = useState<"loading" | "ready" | "signedOut" | "off">(
        authEnabled ? "loading" : "off"
    );
    const [picked, setPicked] = useState("");

    const [images, setImages] = useState<Record<string, string | null>>({});
    const requested = useRef(new Set<string>());
    const [copied, setCopied] = useState(false);

    /* ---- the saved decks to pick from ---- */

    useEffect(() => {
        if (!authEnabled) return;
        let cancelled = false;
        (async () => {
            try {
                const res = await fetch("/api/decks");
                if (cancelled) return;
                if (res.status === 401) {
                    setSavedState("signedOut");
                    return;
                }
                // 503 (no database here) or a fault: no picker, and pasting
                // still works, so there's nothing worth an error line.
                if (!res.ok) {
                    setSavedState("off");
                    return;
                }
                const data = await res.json();
                if (cancelled) return;
                setSaved(Array.isArray(data.decks) ? data.decks : []);
                setSavedState("ready");
            } catch {
                if (!cancelled) setSavedState("off");
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [authEnabled]);

    /* ---- comparing ---- */

    const compare = async (text: string, meta: { id: number | null; name: string | null }) => {
        const g = ++gen.current;
        setError(null);
        setCopied(false);

        let deckText = text.trim();
        if (!deckText) {
            setError("Paste a decklist first, or pick one of your saved decks.");
            return;
        }

        setBusy(true);
        try {
            if (isGoldfishDeckUrl(deckText)) {
                const res = await fetch("/api/import-deck", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ url: deckText }),
                });
                const data = await res.json().catch(() => ({}));
                if (g !== gen.current) return;
                if (!res.ok || typeof data.decklist !== "string") {
                    setError("Could not import that MTGGoldfish link — check the URL and try again.");
                    return;
                }
                deckText = data.decklist;
            }

            const sizeError = checkDecklistSize(deckText);
            if (sizeError) {
                setError(sizeError);
                return;
            }

            const { maindeck, sideboard } = deckSections(deckText);
            if (maindeck.length === 0 && sideboard.length === 0) {
                setError(NO_CARDS_MESSAGE);
                return;
            }

            // The 75 as one list, copies of a card across both halves added.
            const merged = mergeCards([...maindeck, ...sideboard]);

            let needs: DeckNeed[];
            let wasChecked = true;
            try {
                const verdicts = await resolveNames(
                    merged.map((c) => c.name),
                    false
                );
                if (g !== gen.current) return;
                const { cards: resolved, unknown } = applyVerdicts(merged, verdicts);
                const notCards = new Set(unknown);
                needs = resolved.map((c) => ({
                    name: c.name,
                    qty: c.qty,
                    basic: isBasic(c.name),
                    recognised: !notCards.has(c.name),
                }));
            } catch {
                if (g !== gen.current) return;
                // Still worth an answer: most names are spelled the way the
                // collection spells them. The panel says it couldn't check.
                wasChecked = false;
                needs = merged.map((c) => ({
                    name: c.name,
                    qty: c.qty,
                    basic: isBasic(c.name),
                    recognised: null,
                }));
            }

            setUnchecked(!wasChecked);
            setCompared({
                id: meta.id,
                name: meta.name,
                main: totalCards(maindeck),
                side: totalCards(sideboard),
                needs,
            });
            const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
            rootRef.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "start" });
        } catch {
            if (g === gen.current) setError("Couldn't compare that deck. Try again.");
        } finally {
            if (g === gen.current) setBusy(false);
        }
    };

    const pickSaved = async (value: string) => {
        setPicked(value);
        if (!value) return;
        const g = gen.current;
        try {
            const res = await fetch(`/api/decks/${encodeURIComponent(value)}`);
            // Another pick or paste started meanwhile; let that one answer.
            if (g !== gen.current) return;
            if (res.status === 401) {
                setError("Sign in again to open your saved decks.");
                return;
            }
            if (!res.ok) {
                setError(res.status === 404 ? "That deck no longer exists." : "Could not open that deck.");
                return;
            }
            const { deck } = await res.json();
            await compare(deck.decklist ?? "", { id: deck.id, name: deck.name });
        } catch {
            setError("Could not open that deck.");
        }
    };

    const fromHandoff = (d: HandoffDeck) => {
        setPicked(d.id !== null ? String(d.id) : "");
        void compare(d.decklist, { id: d.id, name: d.name });
    };

    /* ---- the answer, against the collection as it is right now ---- */

    const owned = useMemo(() => {
        const m = new Map<string, number>();
        for (const c of cards) m.set(cardKey(c.name), (m.get(cardKey(c.name)) ?? 0) + c.qty);
        return m;
    }, [cards]);

    const lines = (compared?.needs ?? [])
        .map((n) => {
            const own = owned.get(cardKey(n.name)) ?? 0;
            return { ...n, own, short: n.basic ? 0 : Math.max(0, n.qty - own) };
        })
        .sort((a, b) => b.short - a.short || a.name.localeCompare(b.name));
    const missing = lines.filter((l) => l.short > 0);
    const totalMissing = missing.reduce((n, l) => n + l.short, 0);
    const basics = lines.filter((l) => l.basic);
    const basicCopies = basics.reduce((n, l) => n + l.qty, 0);
    const notCards = lines.filter((l) => l.recognised === false);
    const collectionCopies = cards.reduce((n, c) => n + c.qty, 0);
    const missingText = missing.map((l) => `${l.short} ${l.name}`).join("\n");

    // Pictures for the missing cards only — the ones worth looking at.
    const missingKey = missing
        .map((l) => l.name)
        .slice(0, MAX_IMAGE_NAMES)
        .join("\n");
    useEffect(() => {
        const names = missingKey ? missingKey.split("\n").filter((n) => !requested.current.has(n)) : [];
        if (names.length === 0) return;
        for (const n of names) requested.current.add(n);
        (async () => {
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
                // Let the next comparison try again; the list still shows.
                for (const n of names) requested.current.delete(n);
            }
        })();
    }, [missingKey]);

    const copyMissing = async () => {
        try {
            await navigator.clipboard.writeText(missingText);
            setCopied(true);
        } catch {
            setError("Couldn't copy — select the list and copy it by hand.");
        }
    };

    const modeLabel = arena ? "Arena" : "Paper";

    return (
        <section
            ref={rootRef}
            aria-labelledby="deck-compare-title"
            className="scroll-mt-4 bg-parchment-dark shadow-card rounded-lg p-4 sm:p-6 space-y-4"
        >
            <Suspense fallback={null}>
                <DeckHandoffLoader
                    target="collection"
                    ready={ready}
                    authEnabled={authEnabled}
                    onDeck={fromHandoff}
                />
            </Suspense>

            <div className="space-y-1">
                <h2 id="deck-compare-title" className="text-2xl font-title flex flex-wrap items-center">
                    Compare with a deck
                    <HelpTip text="Shows which cards in a deck you don't own yet, and how many copies you're short, against the collection above. Maindeck and sideboard count together. Basic lands are left out. This only reads your collection; nothing here changes it." />
                </h2>
                <p className="text-sm text-ink/70">
                    What a deck needs that your collection doesn&apos;t have. This only reads your
                    collection — nothing here adds or removes cards.
                </p>
            </div>

            <div className={authEnabled && savedState !== "off" ? "grid md:grid-cols-2 gap-4" : ""}>
                {authEnabled && savedState !== "off" && (
                    <div className="space-y-2">
                        <span className="block text-sm text-ink/70">One of your saved decks</span>
                        {savedState === "loading" ? (
                            <p className="text-sm text-ink/60">Loading your decks...</p>
                        ) : savedState === "signedOut" ? (
                            <p className="text-sm text-ink/70">
                                <a
                                    href="/signin?callbackUrl=%2Fcollection"
                                    className="text-brand underline underline-offset-2 hover:text-brand-dark"
                                >
                                    Sign in
                                </a>{" "}
                                to pick from your saved decks, or paste one.
                            </p>
                        ) : saved.length === 0 ? (
                            <p className="text-sm text-ink/70">
                                None saved yet. Save one on the{" "}
                                <Link
                                    href="/decks"
                                    className="text-brand underline underline-offset-2 hover:text-brand-dark"
                                >
                                    Decks
                                </Link>{" "}
                                page, or paste one.
                            </p>
                        ) : (
                            <select
                                value={picked}
                                onChange={(e) => void pickSaved(e.target.value)}
                                aria-label="Saved deck to compare"
                                className="w-full px-3 py-2 rounded bg-parchment text-ink shadow-inner-parchment"
                            >
                                <option value="">Pick a deck...</option>
                                {saved.map((d) => (
                                    <option key={d.id} value={String(d.id)}>
                                        {d.name}
                                        {d.format ? ` · ${deckFormatLabel(d.format)}` : ""} ({d.main}
                                        {d.side ? ` + ${d.side}` : ""})
                                    </option>
                                ))}
                            </select>
                        )}
                    </div>
                )}

                <div className="space-y-2">
                    <label htmlFor="deck-compare-paste" className="block text-sm text-ink/70">
                        {authEnabled && savedState !== "off" ? "Or paste" : "Paste"} a decklist or an
                        MTGGoldfish link
                    </label>
                    <textarea
                        id="deck-compare-paste"
                        value={paste}
                        onChange={(e) => setPaste(e.target.value)}
                        rows={5}
                        placeholder={"4 Lightning Bolt\n4 Monastery Swiftspear\n...\n\nSideboard\n2 Pyroblast"}
                        className="w-full px-3 py-2 rounded bg-parchment text-ink text-sm shadow-inner-parchment font-mono"
                    />
                    <button
                        type="button"
                        onClick={() => {
                            setPicked("");
                            void compare(paste, { id: null, name: null });
                        }}
                        disabled={busy}
                        className="px-5 py-2 rounded shadow-card font-title bg-brand text-midnight-light hover:bg-brand-dark disabled:opacity-50"
                    >
                        {busy ? "Comparing..." : "Compare"}
                    </button>
                </div>
            </div>

            {error && (
                <p className="text-sm text-red-700 [overflow-wrap:anywhere]" role="alert">
                    {error}
                </p>
            )}

            {compared && (
                <div className="border-t border-brass/25 pt-4 space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-wider text-ink/55">
                                Compared
                            </p>
                            <h3 className="font-title text-xl [overflow-wrap:anywhere]">
                                {compared.name ?? "Your pasted deck"}
                            </h3>
                            <p className="text-sm text-ink/70">
                                {compared.main} maindeck + {compared.side} sideboard · against your{" "}
                                {modeLabel} collection ({collectionCopies.toLocaleString()} card
                                {collectionCopies === 1 ? "" : "s"})
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {compared.id !== null && (
                                <Link
                                    href={`/decks?deck=${compared.id}`}
                                    className="px-4 py-2 rounded font-title text-sm bg-parchment text-ink shadow-card hover:bg-parchment/70"
                                >
                                    Open in Decks
                                </Link>
                            )}
                            <button
                                type="button"
                                onClick={() => {
                                    gen.current++;
                                    setCompared(null);
                                    setPicked("");
                                    setError(null);
                                    setBusy(false);
                                }}
                                className="px-4 py-2 rounded text-sm text-ink/70 hover:bg-parchment"
                            >
                                Clear
                            </button>
                        </div>
                    </div>

                    {totalMissing === 0 ? (
                        <p className="font-title text-lg text-green-800">
                            You own every card in this deck.
                        </p>
                    ) : (
                        <p className="font-title text-lg">
                            Missing {totalMissing.toLocaleString()} card{totalMissing === 1 ? "" : "s"}
                            <span className="text-base text-ink/70">
                                {" "}
                                — {missing.length} different
                            </span>
                        </p>
                    )}

                    <ul className="text-sm text-ink/70 space-y-1">
                        {cards.length === 0 && (
                            <li className="text-amber-700">
                                Your collection is empty, so every card shows as missing. Add cards
                                above, or open a saved collection.
                            </li>
                        )}
                        {basicCopies > 0 && (
                            <li>
                                {basicCopies} basic land{basicCopies === 1 ? "" : "s"} not counted
                                {arena ? " — Arena gives you those free." : " — they're not worth tracking in a collection."}
                            </li>
                        )}
                        {unchecked && (
                            <li className="text-amber-700">
                                Couldn&apos;t check the deck&apos;s card names just now, so they&apos;re
                                compared as typed. A different spelling of a card you own will show as
                                missing.
                            </li>
                        )}
                        {notCards.length > 0 && (
                            <li className="text-amber-700 [overflow-wrap:anywhere]">
                                {notCards.length === 1 ? "One name isn't" : `${notCards.length} names aren't`} a
                                card we recognise:{" "}
                                {notCards
                                    .slice(0, 5)
                                    .map((l) => `“${l.name}”`)
                                    .join(", ")}
                                {notCards.length > 5 ? `, and ${notCards.length - 5} more` : ""}. Check the
                                spelling in the deck.
                            </li>
                        )}
                    </ul>

                    {missing.length > 0 && (
                        <>
                            <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                {missing.map((l) => {
                                    const img = images[l.name];
                                    return (
                                        <li
                                            key={l.name}
                                            className="bg-parchment rounded shadow-inner-parchment p-2 flex flex-col gap-2"
                                        >
                                            {img ? (
                                                <Image
                                                    unoptimized
                                                    src={img}
                                                    alt={l.name}
                                                    width={244}
                                                    height={340}
                                                    className="w-full h-auto rounded-[4.5%] shadow-card"
                                                />
                                            ) : (
                                                <div className="aspect-[244/340] rounded-[4.5%] bg-parchment-dark flex items-center justify-center p-2 text-center text-xs text-ink/60">
                                                    {img === null ? "No picture available" : ""}
                                                </div>
                                            )}
                                            <p className="text-sm leading-tight break-words" title={l.name}>
                                                {l.name}
                                            </p>
                                            <p className="mt-auto text-xs text-ink/70">
                                                Need {l.qty} · own {l.own} ·{" "}
                                                <strong className="text-red-800">missing {l.short}</strong>
                                            </p>
                                        </li>
                                    );
                                })}
                            </ul>

                            <div className="space-y-2">
                                <div className="flex flex-wrap items-center gap-3">
                                    <p className="font-title text-lg">Missing list</p>
                                    <button
                                        type="button"
                                        onClick={() => void copyMissing()}
                                        className="px-4 py-2 rounded font-title text-sm bg-parchment text-ink shadow-card hover:bg-parchment/70"
                                    >
                                        {copied ? "Copied" : "Copy to clipboard"}
                                    </button>
                                    <span className="text-xs text-ink/60">
                                        {arena
                                            ? "Pastes into Arena's deck import."
                                            : "Pastes into TCGPlayer's mass entry."}
                                    </span>
                                </div>
                                <pre className="whitespace-pre-wrap break-words bg-parchment rounded shadow-inner-parchment p-3 text-sm max-h-64 overflow-y-auto">
                                    {missingText}
                                </pre>
                            </div>
                        </>
                    )}

                    <details>
                        <summary className="cursor-pointer text-sm text-brand hover:text-brand-dark underline underline-offset-2">
                            Every card in the deck ({lines.length})
                        </summary>
                        <div className="pt-3 overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="text-left text-ink/60">
                                        <th className="font-semibold py-1 pr-2">Card</th>
                                        <th className="font-semibold py-1 px-2 text-right">Deck</th>
                                        <th className="font-semibold py-1 px-2 text-right">Own</th>
                                        <th className="font-semibold py-1 pl-2 text-right">Short</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {lines.map((l) => (
                                        <tr key={l.name} className="border-t border-brass/15">
                                            <td className="py-1 pr-2 [overflow-wrap:anywhere]">
                                                {l.name}
                                                {l.basic && <span className="text-ink/50"> (basic)</span>}
                                            </td>
                                            <td className="py-1 px-2 text-right tabular-nums">{l.qty}</td>
                                            <td className="py-1 px-2 text-right tabular-nums">{l.own}</td>
                                            <td
                                                className={
                                                    "py-1 pl-2 text-right tabular-nums " +
                                                    (l.short > 0 ? "text-red-800 font-semibold" : "text-ink/50")
                                                }
                                            >
                                                {l.basic ? "—" : l.short}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </details>
                </div>
            )}
        </section>
    );
}
