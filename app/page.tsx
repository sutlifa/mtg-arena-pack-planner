"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import HelpTip from "./components/HelpTip";
import PageHeader from "./components/PageHeader";
import { isGoldfishDeckUrl } from "@/lib/goldfishUrl";

const COLLECTION_STORAGE_KEY = "mtgpp:collection";

export default function Page() {
    const [decks, setDecks] = useState<string[]>([""]);
    const [collection, setCollection] = useState("");

    const [breakdown, setBreakdown] = useState<any[]>([]);
    const [shoppingList, setShoppingList] = useState<any[]>([]);
    const [recommendations, setRecommendations] = useState<any[]>([]);
    const [wildcards, setWildcards] = useState<{
        common: number;
        uncommon: number;
        rare: number;
        mythic: number;
        other: number;
    } | null>(null);
    const [missingCards, setMissingCards] = useState<string[]>([]);
    const [importError, setImportError] = useState<string | null>(null);
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

    // Load any previously-saved collection once, after mount (not during the
    // initial render, so the server-rendered and first client render both
    // start empty and hydration stays consistent).
    /* eslint-disable react-hooks/set-state-in-effect */
    useEffect(() => {
        try {
            const saved = localStorage.getItem(COLLECTION_STORAGE_KEY);
            if (saved) setCollection(saved);
        } catch {
            // localStorage unavailable (private browsing, etc.) — ignore
        }
    }, []);
    /* eslint-enable react-hooks/set-state-in-effect */

    // Keep the saved collection in sync as the user edits it.
    useEffect(() => {
        try {
            if (collection) {
                localStorage.setItem(COLLECTION_STORAGE_KEY, collection);
            } else {
                localStorage.removeItem(COLLECTION_STORAGE_KEY);
            }
        } catch {
            // localStorage unavailable — ignore
        }
    }, [collection]);

    const clearCollection = () => setCollection("");

    const processAll = async (
        printingOverridesArg?: Record<string, { set: string; collector_number: string }>
    ) => {
        setLoading(true);

        try {
            // Resolve any deck box that's just a pasted MTGGoldfish link into
            // its real decklist text before analyzing.
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

                setDecks(currentDecks);
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

            if (!res.ok) {
                console.error("API error:", await res.text());
                setLoading(false);
                return;
            }

            const data = await res.json();

            setBreakdown(data.breakdown || []);
            setShoppingList(data.shoppingList || []);

            // ⭐ Only update recommendations when backend includes them

            if (data.recommendations !== undefined) {
                setRecommendations(data.recommendations);
            }

            setWildcards(data.wildcards ?? null);
            setMissingCards(data.missingCards ?? []);



        } catch (err) {
            console.error("Request failed:", err);
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
    /* eslint-disable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */
    useEffect(() => {
        if (breakdown.length > 0 || shoppingList.length > 0) {
            processAll();
        }
    }, [disableArena, mergePaperCounts]);
    /* eslint-enable react-hooks/exhaustive-deps, react-hooks/set-state-in-effect */

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

    const updateDeck = (index: number, value: string) => {
        const updated = [...decks];
        updated[index] = value;
        setDecks(updated);
    };

    const addDeck = () => setDecks([...decks, ""]);
    const removeDeck = (index: number) =>
        setDecks(decks.filter((_, i) => i !== index));

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

    return (
        <div className="px-6 pt-8">
            <main className="max-w-5xl mx-auto py-10 px-6 space-y-10 text-ink">

                    <PageHeader
                        title="Pack Planner"
                        subtitle="Compare your decklists against the cards you already own, then see exactly what's missing — wildcard costs and pack recommendations for Arena, or a priced shopping list for paper."
                        art="/art/banner-planner.svg"
                    />

                    {/* DECK INPUTS */}
                    <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-6">
                        <div className="flex justify-between items-center">
                            <h2 className="text-2xl font-title flex items-center">
                                Deck Lists
                                <HelpTip text="Paste one or more decklists — plain text like '4 Lightning Bolt', or a link to an MTGGoldfish deck or archetype page and we'll pull the list for you. Add more decks with '+ Add Deck' if you're comparing needs across several." />
                            </h2>
                            <button
                                onPointerUp={addDeck}
                                className="px-4 py-2 bg-parchment rounded shadow-inner-parchment text-ink font-title hover:bg-parchment-dark"
                            >
                                + Add Deck
                            </button>
                        </div>

                        {decks.map((deck, index) => (
                            <div key={index} className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <h3 className="font-title text-xl">Deck {index + 1}</h3>
                                    {index > 0 && (
                                        <button
                                            onPointerUp={() => removeDeck(index)}
                                            className="text-red-800 font-title hover:underline"
                                        >
                                            Remove
                                        </button>
                                    )}
                                </div>

                                <textarea
                                    className="w-full h-40 p-4 bg-parchment shadow-inner-parchment rounded resize-none text-ink"
                                    placeholder="Paste deck list here, or paste an MTGGoldfish deck link..."
                                    value={deck}
                                    onChange={(e) => updateDeck(index, e.target.value)}
                                />
                            </div>
                        ))}

                        {importError && (
                            <p className="text-red-700 text-sm">{importError}</p>
                        )}
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


                    {/* COLLECTION INPUT */}
                    <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-4">
                        <div className="flex justify-between items-center">
                            <h2 className="text-2xl font-title flex items-center">
                                MTG Collection (Paper OR Arena)
                                <HelpTip text="Paste what you already own — an Arena collection export, a CSV, or any list with quantities. We'll subtract this from what your decks need so you only see what's missing. Saved automatically in this browser, so you won't need to paste it again next time." />
                            </h2>
                            {collection && (
                                <button
                                    onPointerUp={clearCollection}
                                    className="text-red-800 font-title hover:underline"
                                >
                                    Clear
                                </button>
                            )}
                        </div>
                        <textarea
                            className="w-full h-48 p-4 bg-parchment shadow-inner-parchment rounded resize-none text-ink"
                            placeholder="Paste your MTG collection here..."
                            value={collection}
                            onChange={(e) => setCollection(e.target.value)}
                        />
                    </section>

                    {/* TOGGLE + BUTTON */}
                    <div className="text-center space-y-3">

                        {/* Toggle Row */}
                        <div className="flex items-center justify-center gap-6 font-title text-lg text-ink">

                            {/* Left label — always visible */}
                            <span className="select-none">Arena Mode</span>

                            {/* Toggle */}
                            <button
                                onPointerUp={() => setDisableArena(!disableArena)}
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
                            <span className="select-none">Paper Mode</span>

                            <HelpTip text="Arena Mode looks up Arena printings, caps most cards at 4 copies (basics and a few special cards are unlimited), and shows wildcard costs. Paper Mode looks up paper printings and shows real-world prices instead." />
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
                            <button
                                type="button"
                                onPointerUp={!loading ? () => processAll() : undefined}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter" && !loading) {
                                        processAll();
                                    }
                                }}
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

                            {loading && (
                                <div className="flex justify-center mt-3">
                                    <div className="animate-spin rounded-full h-8 w-8 border-4 border-ink border-t-transparent"></div>
                                </div>
                            )}
                        </div>

                    </div>
                    {/* MOBILE ANALYZE BUTTON */}
                    <div className="md:hidden w-full flex flex-col items-center mt-10 mb-16 relative z-20">
                        <button
                            onPointerUp={!loading ? () => processAll() : undefined}
                            disabled={loading}
                            className={`px-6 py-3 rounded shadow-card font-title text-xl ${loading
                                ? "bg-gray-400 cursor-not-allowed"
                                : "bg-brand text-midnight-light hover:bg-brand-dark"
                                }`}
                        >
                            {loading ? "Analyzing..." : "Analyze Decks & Collection"}
                        </button>

                        {loading && (
                            <div className="flex justify-center mt-3">
                                <div className="animate-spin rounded-full h-8 w-8 border-4 border-ink border-t-transparent"></div>
                            </div>
                        )}
                    </div>





                    {/* BREAKDOWN */}
                    <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-4">
                        <h2 className="text-2xl font-title flex items-center">
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
                                            <div className="flex flex-col">
                                                <p className="text-ink font-title text-lg">
                                                    {fallbackName ?? item.card} — Need {item.needed}
                                                </p>
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
                                        className="flex items-center gap-4 p-4 bg-parchment rounded shadow-inner-parchment"
                                    >
                                        {img && (
                                            <Image
                                                unoptimized
                                                src={img}
                                                alt={displayName}
                                                width={96}
                                                height={134}
                                                className="w-24 h-auto rounded shadow-card cursor-pointer hover:scale-105 transition-transform"
                                                onClick={() => setZoomCard(item)}
                                            />
                                        )}

                                        <div className="flex flex-col">
                                            <p className="text-ink font-title text-lg">
                                                {displayName} — Need {item.needed}
                                                {!Number.isNaN(unitPrice) && (
                                                    <span className="text-sm text-ink/70">
                                                        {" "}
                                                        · ${unitPrice.toFixed(2)} ea (${(unitPrice * item.needed).toFixed(2)} total)
                                                    </span>
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
                                                <div className="mt-2 flex items-center gap-2">
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
                                                        className="w-32 accent-brand"
                                                    />
                                                    <datalist id={tickListId}>
                                                        {modeVersions.map((_, vi) => (
                                                            <option key={vi} value={vi} />
                                                        ))}
                                                    </datalist>
                                                    <span className="text-xs text-ink/70">
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
                    <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-4">
                        <h2 className="text-2xl font-title flex items-center">
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
                                        <p className="text-ink font-title text-lg">
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
                                    onPointerUp={copyShoppingList}
                                    className="px-4 py-2 bg-parchment rounded shadow-inner-parchment font-title hover:bg-parchment-dark"
                                >
                                    Copy to Clipboard
                                </button>

                                <div className="bg-parchment rounded shadow-inner-parchment p-4">
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
                        <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-4">
                            <h2 className="text-2xl font-title flex items-center">
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
                                                <div className="flex items-center gap-4">
                                                    <span className="text-2xl font-title select-none">
                                                        {isOpen ? "▼" : "▶"}
                                                    </span>

                                                    {set.set_icon_svg_uri && (
                                                        <Image
                                                            src={set.set_icon_svg_uri}
                                                            alt={code ?? "Set icon"}
                                                            width={40}
                                                            height={40}
                                                            className="w-10 h-10 opacity-90"
                                                        />
                                                    )}

                                                    <div>
                                                        <p className="text-ink font-title text-xl">
                                                            {set.set_name}
                                                        </p>
                                                        <p className="text-ink text-sm">
                                                            {set.uniqueCards} unique cards needed —{" "}
                                                            {set.totalNeeded} total copies
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
                        <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-4">
                            <h2 className="text-2xl font-title flex items-center">
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

            </main>
        </div>
    );
}