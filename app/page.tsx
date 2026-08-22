"use client";

import { useState, useEffect } from "react";

// A deck box counts as "just a link" only if it's a single bare
// MTGGoldfish deck URL with nothing else pasted alongside it.
function isGoldfishDeckUrl(text: string): boolean {
    if (!text || text.includes("\n")) return false;

    let url: URL;
    try {
        url = new URL(text);
    } catch {
        return false;
    }

    const host = url.hostname.toLowerCase();
    return (
        (host === "mtggoldfish.com" || host === "www.mtggoldfish.com") &&
        /\/deck\//.test(url.pathname)
    );
}

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

    const processAll = async () => {
        setBreakdown([]);
        setShoppingList([]);
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
                    : item.lookup?.arenaPrinting ?? item.lookup?.paperPrinting;

                const displayName =
                    printing?.printed_name ??
                    printing?.name ??
                    item.card;

                return `${item.needed} ${displayName}`;
            })
            .join("\n");

        navigator.clipboard.writeText(text);
    };

    // Paper Mode only: sum estimated market price across the shopping list.
    const shoppingListTotal = () => {
        let total = 0;
        let missingPriceCount = 0;

        for (const item of shoppingList) {
            const price = parseFloat(item.lookup?.paperPrinting?.prices_usd);
            if (Number.isNaN(price)) {
                missingPriceCount += 1;
            } else {
                total += price * item.needed;
            }
        }

        return { total, missingPriceCount };
    };

    return (
        <div className="bg-fantasy-parchment min-h-screen">

            {/* FLOATING TIP JAR - DESKTOP ONLY */}
            <div className="hidden md:block fixed top-6 left-6 z-50 pointer-events-auto">
                <aside className="tipjar-container">
                    <h2 className="tipjar-header">Support the Creator</h2>

                    <a
                        href="https://www.paypal.com/donate/?business=VLDPL87EZ58L6&no_recurring=0&currency_code=USD"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="tipjar-button"
                    >
                        <div className="tipjar-icon"></div>
                        <span>Tip Jar</span>
                    </a>
                </aside>
            </div>

            {/* FULL-WIDTH BANNER */}
            <div className="relative overflow-visible py-10">
                <div className="flex justify-center mb-10">
                    <div className="inferno-wrapper">
                        <div className="title-banner">
                            MTG Card Acquiring Tool
                        </div>
                    </div>
                </div>
            </div>
             
            {/* SIDEBAR + MAIN CONTENT LAYOUT */}
            <div className="px-6">

                {/* MAIN CONTENT */}
                <main className="max-w-5xl mx-auto py-10 px-6 space-y-10 text-ink">

                    {/* DECK INPUTS */}
                    <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-6">
                        <div className="flex justify-between items-center">
                            <h2 className="text-2xl font-title">Deck Lists</h2>
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
                        <h2 className="text-2xl font-title">MTG Collection (Paper OR Arena)</h2>
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
                                    (disableArena ? "bg-[#8b5a3c]" : "bg-[#d4b48c]")
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
                        </div>

                        {/* Checkbox for merge card counts in paper only */}
                        {disableArena && (
                            <label className="flex items-center gap-2 font-title text-ink mt-2">
                                <input
                                    type="checkbox"
                                    checked={mergePaperCounts}
                                    onChange={(e) => setMergePaperCounts(e.target.checked)}
                                />
                                <span>Add card counts together</span>
                            </label>
                        )}

                        
                        <div className="hidden md:flex w-full flex-col items-center mt-10 mb-16 relative z-20">
                            <button
                                type="button"
                                onPointerUp={!loading ? processAll : undefined}
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
                                        : "bg-parchment-dark hover:bg-parchment")
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
                            onPointerUp={!loading ? processAll : undefined}
                            disabled={loading}
                            className={`px-6 py-3 rounded shadow-card font-title text-xl ${loading
                                ? "bg-gray-400 cursor-not-allowed"
                                : "bg-parchment-dark hover:bg-parchment"
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
                        <h2 className="text-2xl font-title">Card Breakdown</h2>

                        {breakdown.length === 0 ? (
                            <p className="text-ink">No breakdown yet. Process your decks.</p>
                        ) : (
                            breakdown.map((item, i) => {
                                // Dynamic printing selection
                                const printing = disableArena
                                    ? item.lookup?.paperPrinting
                                    : item.lookup?.arenaPrinting ?? item.lookup?.paperPrinting;

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

                                return (
                                    <div
                                        key={i}
                                        className="flex items-center gap-4 p-4 bg-parchment rounded shadow-inner-parchment"
                                    >
                                        <img
                                            src={img}
                                            alt={displayName}
                                            className="w-24 h-auto rounded shadow-card cursor-pointer hover:scale-105 transition-transform"
                                            onClick={() => setZoomCard(item)}
                                        />

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
                                                <img
                                                    src={setSymbol}
                                                    alt={printing?.set}
                                                    className="w-6 h-6 mt-1 opacity-90"
                                                />
                                            )}
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </section>


                    {/* SHOPPING LIST */}
                    <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-4">
                        <h2 className="text-2xl font-title">
                            {disableArena ? "TCGPlayer Shopping List" : "Arena Import"}
                        </h2>

                        {shoppingList.length === 0 ? (
                            <p className="text-ink">No missing cards yet.</p>
                        ) : (
                            <>
                                {disableArena && (() => {
                                    const { total, missingPriceCount } = shoppingListTotal();
                                    return (
                                        <p className="text-ink font-title text-lg">
                                            Estimated Total: ${total.toFixed(2)}
                                            {missingPriceCount > 0 && (
                                                <span className="text-sm text-ink/70">
                                                    {" "}
                                                    ({missingPriceCount} card{missingPriceCount === 1 ? "" : "s"} missing price data)
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
                                                    : item.lookup?.arenaPrinting ?? item.lookup?.paperPrinting;

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
                            <h2 className="text-2xl font-title">Set Recommendations</h2>

                            {recommendations.length === 0 ? (
                                <p className="text-ink">No recommendations yet.</p>
                            ) : (
                                recommendations.map((set, i) => {
                                    const code = set.set;
                                    const isOpen = openSets[code] ?? false;

                                    return (
                                        <div key={i} className="space-y-3">
                                            {i > 0 && (
                                                <div className="border-t border-[#5a4632] opacity-40 my-2" />
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
                                                        <img
                                                            src={set.set_icon_svg_uri}
                                                            alt={code}
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
                            <h2 className="text-2xl font-title">Wildcards Needed</h2>

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
                                    const printing = disableArena
                                        ? zoomCard.lookup?.paperPrinting
                                        : zoomCard.lookup?.arenaPrinting ?? zoomCard.lookup?.paperPrinting;

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

                                                    <img
                                                        src={front}
                                                        alt={displayName}
                                                        className="card-face front"
                                                    />
                                                    {back && (
                                                        <img
                                                            src={back}
                                                            alt={displayName}
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
                                                    <img
                                                        src={front}
                                                        alt={displayName}
                                                        className="card-face front"
                                                    />

                                                    {back && (
                                                        <img
                                                            src={back}
                                                            alt={displayName}
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

                                        </>
                                    );
                                })()}
                            </div>
                        </div>
                    )}


                                        
                </main>

            </div>
        </div>
    );

    
}