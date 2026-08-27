"use client";

import { useState } from "react";
import Image from "next/image";
import HelpTip from "./HelpTip";
import { isGoldfishDeckUrl } from "@/lib/goldfishUrl";

interface RotationSet {
    set: string;
    set_name: string;
    set_icon_svg_uri: string | null;
    rotating: boolean;
}

interface RotationCard {
    card: string;
    qty: number;
    sets?: RotationSet[];
    image?: string | null;
    lastPrintedSet?: string | null;
    lastPrintedSetIcon?: string | null;
}

interface RotationMeta {
    rotationDate: string;
    rotatingOutSets: { set: string; set_name: string; set_icon_svg_uri: string | null }[];
}

interface RotationResult {
    rotating: RotationCard[];
    safe: RotationCard[];
    notStandard: RotationCard[];
    meta: RotationMeta;
}

function formatRotationDate(iso: string): string {
    const d = new Date(`${iso}T00:00:00Z`);
    return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" });
}

function SetBadge({ set }: { set: RotationSet }) {
    return (
        <span
            className={
                "inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs " +
                (set.rotating
                    ? "bg-red-700/10 text-red-700 line-through decoration-red-700/60"
                    : "bg-green-700/10 text-green-800")
            }
            title={set.rotating ? `${set.set_name} — rotating out` : `${set.set_name} — staying legal`}
        >
            {set.set_icon_svg_uri && (
                <Image src={set.set_icon_svg_uri} alt={set.set_name} width={14} height={14} className="opacity-90" />
            )}
            {set.set_name}
        </span>
    );
}

function RotationCardRow({ item, accent }: { item: RotationCard; accent: "rotating" | "safe" }) {
    return (
        <div className="flex items-center gap-4 p-3 bg-parchment rounded shadow-inner-parchment">
            {item.image && (
                <Image
                    unoptimized
                    src={item.image}
                    alt={item.card}
                    width={64}
                    height={89}
                    className="w-16 h-auto rounded shadow-card shrink-0"
                />
            )}

            <div className="flex flex-col gap-1.5 min-w-0">
                <p className="text-ink font-title text-lg">
                    {item.card} <span className="text-ink/70 text-base font-normal">×{item.qty}</span>
                </p>

                <div className="flex flex-wrap gap-1.5">
                    {(item.sets ?? []).map((s, si) => (
                        <SetBadge key={si} set={s} />
                    ))}
                </div>

                {accent === "safe" && (
                    <p className="text-xs text-green-800/80">
                        Stays legal via {(item.sets ?? []).filter((s) => !s.rotating).map((s) => s.set_name).join(", ")}
                    </p>
                )}
            </div>
        </div>
    );
}

function NotStandardCardRow({ item }: { item: RotationCard }) {
    return (
        <div className="flex items-center gap-4 p-3 bg-parchment rounded shadow-inner-parchment">
            {item.image && (
                <Image
                    unoptimized
                    src={item.image}
                    alt={item.card}
                    width={64}
                    height={89}
                    className="w-16 h-auto rounded shadow-card shrink-0"
                />
            )}

            <div className="flex flex-col gap-1.5 min-w-0">
                <p className="text-ink font-title text-lg">
                    {item.card} <span className="text-ink/70 text-base font-normal">×{item.qty}</span>
                </p>

                {item.lastPrintedSet && (
                    <span className="inline-flex items-center gap-1 text-xs text-ink/60 w-fit">
                        {item.lastPrintedSetIcon && (
                            <Image src={item.lastPrintedSetIcon} alt={item.lastPrintedSet} width={14} height={14} className="opacity-70" />
                        )}
                        Most recent printing: {item.lastPrintedSet}
                    </span>
                )}
            </div>
        </div>
    );
}

export default function RotationChecker() {
    const [decklist, setDecklist] = useState("");
    const [result, setResult] = useState<RotationResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);

    const checkRotation = async () => {
        setLoading(true);
        try {
            // A pasted MTGGoldfish deck (or archetype) link resolves to its
            // real decklist text before checking rotation, same as the Pack
            // Planner.
            let currentDecklist = decklist;
            const trimmed = decklist.trim();

            if (isGoldfishDeckUrl(trimmed)) {
                setImportError(null);
                try {
                    const importRes = await fetch("/api/import-deck", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ url: trimmed }),
                    });
                    const importData = await importRes.json();

                    if (importRes.ok && importData.decklist) {
                        currentDecklist = importData.decklist;
                        setDecklist(importData.decklist);
                    } else {
                        setImportError("Couldn't import that MTGGoldfish link — check the URL and try again.");
                        setLoading(false);
                        return;
                    }
                } catch {
                    setImportError("Couldn't import that MTGGoldfish link — check the URL and try again.");
                    setLoading(false);
                    return;
                }
            } else {
                setImportError(null);
            }

            const res = await fetch("/api/rotation", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ decklist: currentDecklist }),
            });

            if (!res.ok) {
                console.error("Rotation API error:", await res.text());
                setLoading(false);
                return;
            }

            setResult(await res.json());
        } catch (err) {
            console.error("Rotation request failed:", err);
        }
        setLoading(false);
    };

    return (
        <div className="space-y-10">
            <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-4">
                <h2 className="text-2xl font-title flex items-center">
                    Standard Rotation Checker
                    <HelpTip text="Paste a Standard decklist — or a link to an MTGGoldfish deck or archetype page and we'll pull the list for you — to see which cards rotate out of the format and which stay legal. A card only rotates out if EVERY Standard-legal printing it has is in a set that's leaving. If it also has a printing in a set that's sticking around — including one that hasn't released yet — it's safe." />
                </h2>

                {result?.meta && (
                    <div className="bg-parchment rounded shadow-inner-parchment p-4 text-ink space-y-2">
                        <p className="font-title text-lg">
                            Next rotation: {formatRotationDate(result.meta.rotationDate)}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm text-ink/70">Leaving Standard:</span>
                            {result.meta.rotatingOutSets.map((s, i) => (
                                <span key={i} className="inline-flex items-center gap-1 text-sm">
                                    {s.set_icon_svg_uri && (
                                        <Image src={s.set_icon_svg_uri} alt={s.set_name} width={14} height={14} className="opacity-90" />
                                    )}
                                    {s.set_name}
                                    {i < result.meta.rotatingOutSets.length - 1 ? "," : ""}
                                </span>
                            ))}
                        </div>
                    </div>
                )}

                <textarea
                    className="w-full h-48 p-4 bg-parchment shadow-inner-parchment rounded resize-none text-ink"
                    placeholder="Paste your Standard decklist here, or paste an MTGGoldfish deck link..."
                    value={decklist}
                    onChange={(e) => setDecklist(e.target.value)}
                />

                {importError && (
                    <p className="text-red-700 text-sm">{importError}</p>
                )}

                <div className="flex justify-center">
                    <button
                        type="button"
                        onPointerUp={!loading ? () => checkRotation() : undefined}
                        disabled={loading}
                        className={
                            "px-6 py-3 rounded shadow-card font-title text-xl " +
                            (loading
                                ? "bg-gray-400 cursor-not-allowed"
                                : "bg-brand text-midnight-light hover:bg-brand-dark")
                        }
                    >
                        {loading ? "Checking..." : "Check Rotation"}
                    </button>
                </div>

                {loading && (
                    <div className="flex justify-center">
                        <div className="animate-spin rounded-full h-8 w-8 border-4 border-ink border-t-transparent"></div>
                    </div>
                )}
            </section>

            {result && (
                <>
                    <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-3">
                        <h2 className="text-2xl font-title text-red-700 flex items-center">
                            Rotating Out ({result.rotating.length})
                            <HelpTip text="These cards' only Standard-legal printings are in sets leaving the format — after rotation, they won't be legal in Standard anymore." />
                        </h2>

                        {result.rotating.length === 0 ? (
                            <p className="text-ink">Nothing in this list is rotating out.</p>
                        ) : (
                            <div className="space-y-2">
                                {result.rotating.map((c, i) => (
                                    <RotationCardRow key={i} item={c} accent="rotating" />
                                ))}
                            </div>
                        )}
                    </section>

                    <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-3">
                        <h2 className="text-2xl font-title text-green-700 flex items-center">
                            Safe After Rotation ({result.safe.length})
                            <HelpTip text="These cards have a Standard-legal printing in a set that isn't rotating out (including sets not yet released), so they'll stay legal after rotation." />
                        </h2>

                        {result.safe.length === 0 ? (
                            <p className="text-ink">No cards in this list are safe after rotation.</p>
                        ) : (
                            <div className="space-y-2">
                                {result.safe.map((c, i) => (
                                    <RotationCardRow key={i} item={c} accent="safe" />
                                ))}
                            </div>
                        )}
                    </section>

                    {result.notStandard.length > 0 && (
                        <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-3">
                            <h2 className="text-2xl font-title text-ink/80 flex items-center">
                                Not Currently Standard-Legal ({result.notStandard.length})
                                <HelpTip text="These weren't found in any current Standard-legal printing — either they're not a Standard card at all, or the name didn't match. Check for typos." />
                            </h2>
                            <div className="space-y-2">
                                {result.notStandard.map((c, i) => (
                                    <NotStandardCardRow key={i} item={c} />
                                ))}
                            </div>
                        </section>
                    )}
                </>
            )}
        </div>
    );
}
