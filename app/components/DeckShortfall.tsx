"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { resolveNames } from "./resolveNames";
import { mergeCollection } from "@/lib/collectionText";
import { isGoldfishDeckUrl } from "@/lib/goldfishUrl";
import {
    needsFromVerdicts,
    ownedCounts,
    parseDeckForShortfall,
    shortfall,
    uncheckedNeeds,
    type DeckNeed,
} from "@/lib/deckShortfall";

/** /api/card-images' per-request limit. A deck's missing cards fit in one. */
const MAX_IMAGE_NAMES = 150;

/**
 * One deck's missing cards, as part of Deck Check's results.
 *
 * This is the view the Collection page's "Compare with a deck" panel used to
 * give — pictures of what's missing, need/own/short per card, a copyable
 * list — moved into Deck Check so there is one place that compares decks
 * with a collection. The arithmetic is lib/deckShortfall; this component only
 * asks the server to check the deck's names, fetches the pictures, and lays
 * it out.
 *
 * It is handed the deck and the collection as they were when Analyze ran,
 * not the live boxes, so it always agrees with the breakdown below it. Typing
 * in a slot afterwards changes nothing here until the next Analyze — the
 * same rule every other result on the page follows.
 *
 * Every name in the deck goes through /api/card-resolve first, the same check
 * every card in a collection went through on the way in. Without it a deck
 * typed with "Lim-Dul's Vault" would show that card as missing while
 * "Lim-Dûl's Vault" sits in the collection.
 */
export default function DeckShortfall({
    title,
    savedId,
    text,
    collection,
    arena,
    defaultOpen,
}: {
    title: string;
    /** The saved deck this slot was loaded from, for the "Open in Decks" link. */
    savedId: number | null;
    text: string;
    collection: string;
    arena: boolean;
    /** The first deck is open; with several, the rest start folded so the page stays scannable. */
    defaultOpen: boolean;
}) {
    const parsed = useMemo(() => parseDeckForShortfall(text), [text]);
    const owned = useMemo(() => ownedCounts(mergeCollection(collection)), [collection]);
    const collectionCopies = useMemo(
        () => [...owned.values()].reduce((n, q) => n + q, 0),
        [owned]
    );

    // Tied to the text it answers, so a check still running for the previous
    // analysis can't be shown against this one.
    const [checked, setChecked] = useState<{ text: string; needs: DeckNeed[]; ok: boolean } | null>(null);

    useEffect(() => {
        if (!parsed.ok) return;
        let cancelled = false;
        resolveNames(
            parsed.cards.map((c) => c.name),
            false
        )
            .then((verdicts) => {
                if (!cancelled) setChecked({ text, needs: needsFromVerdicts(parsed.cards, verdicts), ok: true });
            })
            .catch(() => {
                if (!cancelled) setChecked({ text, needs: uncheckedNeeds(parsed.cards), ok: false });
            });
        return () => {
            cancelled = true;
        };
    }, [parsed, text]);

    const current = checked && checked.text === text ? checked : null;
    const result = current ? shortfall(current.needs, owned) : null;

    /* ---- pictures, for the missing cards only ---- */

    const [images, setImages] = useState<Record<string, string | null>>({});
    const requested = useRef(new Set<string>());
    const missingKey = (result?.missing ?? [])
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
                // Let the next analysis try again; the list still shows.
                for (const n of names) requested.current.delete(n);
            }
        })();
    }, [missingKey]);

    const [copied, setCopied] = useState(false);
    const [copyError, setCopyError] = useState(false);
    const copyMissing = async () => {
        if (!result) return;
        try {
            await navigator.clipboard.writeText(result.missingText);
            setCopied(true);
            setCopyError(false);
        } catch {
            setCopyError(true);
        }
    };

    /* ---- the one-line summary, shown even while folded ---- */

    let summary: ReactNode;
    if (!parsed.ok) {
        summary = <span className="text-amber-700">Nothing to compare</span>;
    } else if (!result) {
        summary = <span className="text-ink/60">Checking card names...</span>;
    } else if (result.totalMissing === 0) {
        summary = <span className="text-green-800">You own every card</span>;
    } else {
        summary = (
            <span className="text-red-800">
                Missing {result.totalMissing.toLocaleString()} card{result.totalMissing === 1 ? "" : "s"} (
                {result.missing.length} different)
            </span>
        );
    }

    return (
        <details open={defaultOpen} className="group bg-parchment rounded shadow-inner-parchment">
            <summary className="cursor-pointer list-none [&::-webkit-details-marker]:hidden px-3 py-3 sm:px-4 flex flex-wrap items-center gap-x-3 gap-y-1">
                <span aria-hidden="true" className="font-title text-ink/60 group-open:rotate-90 transition-transform">
                    ▶
                </span>
                {/* overflow-wrap:anywhere — a saved deck's name is the user's
                    own text and can be one long unbroken token. */}
                <span className="font-title text-lg min-w-0 [overflow-wrap:anywhere]">{title}</span>
                <span className="text-sm font-semibold">{summary}</span>
            </summary>

            <div className="px-3 pb-4 sm:px-4 space-y-4">
                {!parsed.ok ? (
                    <p className="text-sm text-amber-700 [overflow-wrap:anywhere]">
                        {isGoldfishDeckUrl(text.trim())
                            ? "This MTGGoldfish link didn't import, so there's no list to compare. Check the link and press Analyze again."
                            : parsed.error}
                    </p>
                ) : !result ? (
                    <p className="text-sm text-ink/60">Matching the deck&apos;s card names to your collection...</p>
                ) : (
                    <>
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <p className="text-sm text-ink/70">
                                {parsed.main} maindeck + {parsed.side} sideboard, counted together · against{" "}
                                {collectionCopies.toLocaleString()} card{collectionCopies === 1 ? "" : "s"} (
                                {arena ? "Arena" : "Paper"})
                            </p>
                            {savedId !== null && (
                                <Link
                                    href={`/decks?deck=${savedId}`}
                                    className="px-3 py-1.5 rounded font-title text-sm bg-parchment-dark text-ink shadow-card hover:bg-brass/20"
                                >
                                    Open in Decks
                                </Link>
                            )}
                        </div>

                        <ul className="text-sm text-ink/70 space-y-1">
                            {collectionCopies === 0 && (
                                <li className="text-amber-700">
                                    The collection was empty, so every card shows as missing.
                                </li>
                            )}
                            {result.basicCopies > 0 && (
                                <li>
                                    {result.basicCopies} basic land{result.basicCopies === 1 ? "" : "s"} not counted
                                    {arena
                                        ? " — Arena gives you those free."
                                        : " — they're not worth tracking in a collection."}
                                </li>
                            )}
                            {!current?.ok && (
                                <li className="text-amber-700">
                                    Couldn&apos;t check the deck&apos;s card names just now, so they&apos;re
                                    compared as typed. A different spelling of a card you own will show as
                                    missing.
                                </li>
                            )}
                            {result.notCards.length > 0 && (
                                <li className="text-amber-700 [overflow-wrap:anywhere]">
                                    {result.notCards.length === 1
                                        ? "One name isn't"
                                        : `${result.notCards.length} names aren't`}{" "}
                                    a card we recognise:{" "}
                                    {result.notCards
                                        .slice(0, 5)
                                        .map((l) => `“${l.name}”`)
                                        .join(", ")}
                                    {result.notCards.length > 5 ? `, and ${result.notCards.length - 5} more` : ""}.
                                    Check the spelling in the deck.
                                </li>
                            )}
                        </ul>

                        {result.missing.length > 0 && (
                            <>
                                <ul className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                                    {result.missing.map((l) => {
                                        const img = images[l.name];
                                        return (
                                            <li
                                                key={l.name}
                                                className="bg-parchment-dark rounded shadow-inner-parchment p-2 flex flex-col gap-2"
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
                                                    <div className="aspect-[244/340] rounded-[4.5%] bg-parchment flex items-center justify-center p-2 text-center text-xs text-ink/60">
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
                                            className="px-4 py-2 rounded font-title text-sm bg-parchment-dark text-ink shadow-card hover:bg-brass/20"
                                        >
                                            {copied ? "Copied" : "Copy to clipboard"}
                                        </button>
                                        <span className="text-xs text-ink/60">
                                            {arena
                                                ? "Pastes into Arena's deck import."
                                                : "Pastes into TCGPlayer's mass entry."}
                                        </span>
                                    </div>
                                    {copyError && (
                                        <p className="text-sm text-red-700" role="alert">
                                            Couldn&apos;t copy — select the list and copy it by hand.
                                        </p>
                                    )}
                                    <pre className="whitespace-pre-wrap break-words bg-parchment-dark rounded shadow-inner-parchment p-3 text-sm max-h-64 overflow-y-auto">
                                        {result.missingText}
                                    </pre>
                                </div>
                            </>
                        )}

                        <details>
                            <summary className="cursor-pointer text-sm text-brand hover:text-brand-dark underline underline-offset-2">
                                Every card in the deck ({result.lines.length})
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
                                        {result.lines.map((l) => (
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
                    </>
                )}
            </div>
        </details>
    );
}
