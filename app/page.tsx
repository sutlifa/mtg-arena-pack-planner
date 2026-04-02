"use client";

import { useState, useEffect } from "react";

export default function Page() {
    const [decks, setDecks] = useState<string[]>([""]);
    const [collection, setCollection] = useState("");

    const [breakdown, setBreakdown] = useState<any[]>([]);
    const [shoppingList, setShoppingList] = useState<any[]>([]);
    const [recommendations, setRecommendations] = useState<any[]>([]);

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

    const processAll = async () => {
        setBreakdown([]);
        setShoppingList([]);
        setRecommendations([]);
        setLoading(true);

        try {
            const res = await fetch("/api/analyze", {
      
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    decklist: decks,
                    collection,
                    arenaMode: !disableArena,
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
            setRecommendations(data.recommendations || []);
        } catch (err) {
            console.error("Request failed:", err);
        }

        setLoading(false);
    };

    const copyShoppingList = () => {
        const text = shoppingList
            .map((item) => `${item.needed} ${item.displayName ?? item.card}`)
            .join("\n");

        navigator.clipboard.writeText(text);
    };

    return (
        <main className="max-w-5xl mx-auto py-10 px-6 space-y-10 text-ink">

            {/* Banner */}
            <div className="relative overflow-visible">
                <div className="flex justify-center mb-10">
                    <div className="inferno-wrapper">
                        <div className="title-banner">
                            MTG Card Acquiring Tool
                        </div>
                    </div>
                </div>
            </div>


            {/* DECK INPUTS */}
            <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-6">
                <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-title">Deck Lists</h2>
                    <button
                        onClick={addDeck}
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
                                    onClick={() => removeDeck(index)}
                                    className="text-red-800 font-title hover:underline"
                                >
                                    Remove
                                </button>
                            )}
                        </div>

                        <textarea
                            className="w-full h-40 p-4 bg-parchment shadow-inner-parchment rounded resize-none text-ink"
                            placeholder="Paste deck list here..."
                            value={deck}
                            onChange={(e) => updateDeck(index, e.target.value)}
                        />
                    </div>
                ))}
            </section>

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
                <label className="flex items-center justify-center gap-3 font-title text-lg">
                    <input
                        type="checkbox"
                        checked={disableArena}
                        onChange={(e) => setDisableArena(e.target.checked)}
                        className="w-5 h-5"
                    />
                    Disable Arena Comparison (Paper Mode)
                </label>

                <button
                    onClick={processAll}
                    disabled={loading}
                    className={`px-6 py-3 rounded shadow-card font-title text-xl ${loading
                            ? "bg-gray-400 cursor-not-allowed"
                            : "bg-parchment-dark hover:bg-parchment"
                        }`}
                >
                    {loading ? "Analyzing..." : "Analyze Decks & Collection"}
                </button>

                {loading && (
                    <div className="flex justify-center mt-2">
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
                        const img =
                            item.lookup?.image_uris?.normal ||
                            item.lookup?.raw?.card_faces?.[0]?.image_uris?.normal ||
                            item.lookup?.raw?.card_faces?.[1]?.image_uris?.normal;
                        const setSymbol = item.lookup?.set_icon_svg_uri;

                        return (
                            <div
                                key={i}
                                className="flex items-center gap-4 p-4 bg-parchment rounded shadow-inner-parchment"
                            >
                                {/* SINGLE CARD IMAGE */}
                                <img
                                    src={img}
                                    alt={item.displayName}
                                    className="w-24 h-auto rounded shadow-card cursor-pointer hover:scale-105 transition-transform"
                                    onClick={() => setZoomCard(item)}
                                />

                                <div className="flex flex-col">
                                    <p className="text-ink font-title text-lg">
                                        {item.lookup?.arena_name ??
                                            item.lookup?.printed_name ??
                                            item.displayName ??
                                            item.card}{" "}
                                        — Need {item.needed}
                                    </p>

                                    {setSymbol && (
                                        <img
                                            src={setSymbol}
                                            alt={item.lookup.set}
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
                <h2 className="text-2xl font-title">Shopping List (Paper Mode Friendly)</h2>

                {shoppingList.length === 0 ? (
                    <p className="text-ink">No missing cards yet.</p>
                ) : (
                    <>
                        <button
                            onClick={copyShoppingList}
                            className="px-4 py-2 bg-parchment rounded shadow-inner-parchment font-title hover:bg-parchment-dark"
                        >
                            Copy to Clipboard
                        </button>

                        <div className="bg-parchment rounded shadow-inner-parchment p-4">
                            <pre className="whitespace-pre-wrap text-ink text-lg leading-relaxed">
                                {shoppingList
                                    .map((item) => `${item.needed} ${item.displayName ?? item.card}`)
                                    .join("\n")}
                            </pre>
                        </div>
                    </>
                )}
            </section>

            {/* SET RECOMMENDATIONS */}
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
                                            {set.cards.map((c: any, idx: number) => (
                                                <p
                                                    key={idx}
                                                    className={`text-sm ${rarityColor(c.rarity)}`}
                                                >
                                                    • {c.displayName} — Need {c.needed} ({c.rarity})
                                                </p>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })
                )}
            </section>

            {zoomCard && (
                <div
                    className="card-zoom-backdrop"
                    onClick={() => {
                        setZoomCard(null);
                        setFlip(false);
                    }}
                >
                    {(() => {
                        const front =
                            zoomCard.lookup?.image_uris?.normal ||
                            zoomCard.lookup?.raw?.card_faces?.[0]?.image_uris?.normal;

                        const back =
                            zoomCard.lookup?.raw?.card_faces?.[1]?.image_uris?.normal;

                        return (
                            <div className={`flip-wrapper ${flip ? "flipped" : ""}`}>
                                {/* Front face */}
                                <img
                                    src={front}
                                    alt={zoomCard.lookup?.name}
                                    className="card-face front"
                                />

                                {/* Back face (only if double-faced) */}
                                {back && (
                                    <img
                                        src={back}
                                        alt={zoomCard.lookup?.name}
                                        className="card-face back"
                                    />
                                )}

                                {/* 🔥 Only this element receives clicks to flip */}
                                <div
                                    className="flip-hitbox"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (back) setFlip(!flip);
                                    }}
                                />
                            </div>
                        );
                    })()}
                </div>
            )}
              
           
                   
          
        </main>
    );
}