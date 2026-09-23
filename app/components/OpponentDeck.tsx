"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { splitDeckSections, totalCards, type DeckCard } from "@/lib/deckSections";
import { isGoldfishDeckUrl } from "@/lib/goldfishUrl";

interface LoadedDeck {
    maindeck: DeckCard[];
    sideboard: DeckCard[];
    images: Record<string, string | null>;
}

/**
 * One fetch per list per page visit. Clicking back and forth between
 * matchups is the whole point of the panel, and refetching MTGGoldfish on
 * every click would be slow for the user and rude to them. The promise is
 * cached, not the result, so two panels asking at once share one request.
 * A failure is dropped from the cache so the next look tries again.
 */
const cache = new Map<string, Promise<LoadedDeck>>();

async function fetchDeck(url: string): Promise<LoadedDeck> {
    const res = await fetch("/api/import-deck", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || typeof data.decklist !== "string") {
        throw new Error(data.error ?? "Couldn't load that list from MTGGoldfish.");
    }

    const { maindeck, sideboard } = splitDeckSections(data.decklist);
    const names = [...new Set([...maindeck, ...sideboard].map((c) => c.name))].slice(0, 150);

    // Pictures are a nicety: if they fail, the list still shows.
    let images: Record<string, string | null> = {};
    try {
        const imgRes = await fetch("/api/card-images", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ names }),
        });
        if (imgRes.ok) images = (await imgRes.json()).images ?? {};
    } catch {
        /* list without pictures */
    }

    return { maindeck, sideboard, images };
}

function loadDeck(url: string): Promise<LoadedDeck> {
    let pending = cache.get(url);
    if (!pending) {
        pending = fetchDeck(url);
        cache.set(url, pending);
        pending.catch(() => cache.delete(url));
    }
    return pending;
}

/**
 * The deck you're boarding against, beside the plan you're writing for it:
 * MTGGoldfish's featured list for the archetype, with a large card preview
 * that follows whichever name you point at — the way MTGGoldfish's own deck
 * pages work.
 *
 * For a matchup that didn't come from the metagame pull (typed in by hand),
 * or to swap in a different list, any MTGGoldfish deck or archetype link can
 * be pasted in; `onSetUrl` stores it on the matchup.
 */
export default function OpponentDeck({
    name,
    url,
    customUrl,
    onSetUrl,
    stickyPreview = false,
}: {
    name: string;
    /** The list to show: the pasted link if there is one, else the archetype's. */
    url: string | null;
    /** Whether `url` is a link the user pasted, so it can be cleared. */
    customUrl: boolean;
    onSetUrl: (url: string | null) => void;
    /**
     * Pin the preview to the top of its scrolling panel. In the side panel a
     * 75-card list is taller than the screen, and without this the picture
     * scrolls away just as you reach the sideboard you most want to see.
     * Off for the inline phone view, where a pinned card would cover most of
     * the screen while you scroll the list.
     */
    stickyPreview?: boolean;
}) {
    // Results are tied to the URL they answer, as GuideLoader does with its
    // guide id: switching matchups can never show the previous one's list,
    // and nothing has to be reset synchronously when `url` changes.
    const [result, setResult] = useState<
        | { url: string; deck: LoadedDeck; error: null }
        | { url: string; deck: null; error: string }
        | null
    >(null);
    const [preview, setPreview] = useState<string | null>(null);
    const [linkDraft, setLinkDraft] = useState("");
    const [linkError, setLinkError] = useState<string | null>(null);

    useEffect(() => {
        if (!url) return;
        let cancelled = false;
        loadDeck(url).then(
            (deck) => {
                if (!cancelled) setResult({ url, deck, error: null });
            },
            (err: Error) => {
                if (!cancelled) setResult({ url, deck: null, error: err.message });
            }
        );
        return () => {
            cancelled = true;
        };
    }, [url]);

    const current = result && result.url === url ? result : null;
    const deck = current?.deck ?? null;

    // The preview defaults to the first card with a picture, so the panel
    // never opens on an empty frame.
    const firstWithImage =
        deck && [...deck.maindeck, ...deck.sideboard].find((c) => deck.images[c.name])?.name;
    const shown = deck && preview && deck.images[preview] ? preview : firstWithImage ?? null;
    const shownImage = shown && deck ? deck.images[shown] : null;

    const applyLink = () => {
        const link = linkDraft.trim();
        if (!isGoldfishDeckUrl(link)) {
            setLinkError("That isn't an MTGGoldfish deck or archetype link.");
            return;
        }
        setLinkError(null);
        setLinkDraft("");
        onSetUrl(link);
    };

    const linkForm = (
        <div className="space-y-1.5">
            <div className="flex gap-2">
                <input
                    type="url"
                    value={linkDraft}
                    onChange={(e) => setLinkDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") {
                            e.preventDefault();
                            applyLink();
                        }
                    }}
                    placeholder="Paste an MTGGoldfish deck link"
                    aria-label="MTGGoldfish deck link for this matchup"
                    className="flex-1 min-w-0 px-2 py-1.5 rounded bg-parchment text-ink text-sm shadow-inner-parchment"
                />
                <button
                    type="button"
                    onClick={applyLink}
                    className="shrink-0 px-3 py-1.5 rounded text-sm font-title bg-brand text-midnight-light hover:bg-brand-dark"
                >
                    Show
                </button>
            </div>
            {linkError && <p className="text-xs text-red-700">{linkError}</p>}
        </div>
    );

    const list = (title: string, cards: DeckCard[]) =>
        cards.length > 0 && (
            <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-ink/60 mb-1">
                    {title} ({totalCards(cards)})
                </p>
                <ul className="text-sm leading-snug">
                    {cards.map((c) => (
                        <li key={c.name}>
                            {/* Buttons, so a tap on a phone and Tab on a keyboard
                                move the preview as well as a mouse does. */}
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
                                <span className="w-5 shrink-0 text-right text-ink/55 tabular-nums">{c.qty}</span>
                                <span className="min-w-0 break-words">{c.name}</span>
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
        );

    return (
        <div className="space-y-3">
            <div className="flex items-baseline justify-between gap-2">
                <p className="font-title text-lg leading-tight min-w-0 break-words">
                    <span className="block text-xs font-sans font-semibold uppercase tracking-wider text-ink/55">
                        Their list
                    </span>
                    {name}
                </p>
                {url && (
                    <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 text-xs text-brand underline underline-offset-2 hover:text-brand-dark"
                    >
                        MTGGoldfish ↗
                    </a>
                )}
            </div>

            {!url ? (
                <div className="space-y-2">
                    <p className="text-sm text-ink/70">
                        No MTGGoldfish list for this matchup yet. Paste one to see it here.
                    </p>
                    {linkForm}
                </div>
            ) : !current ? (
                <p className="text-sm text-ink/60" role="status">
                    Loading their list...
                </p>
            ) : current.error !== null ? (
                <div className="space-y-2">
                    <p className="text-sm text-red-700">{current.error}</p>
                    {linkForm}
                </div>
            ) : (
                deck && (
                    <>
                        {shownImage && (
                            <div
                                className={
                                    stickyPreview
                                        ? "sticky -top-4 z-10 -mx-4 px-4 py-2 bg-parchment"
                                        : ""
                                }
                            >
                            <Image
                                unoptimized
                                src={shownImage}
                                alt={shown ?? ""}
                                width={244}
                                height={340}
                                className="w-full max-w-[244px] mx-auto h-auto rounded-[4.5%] shadow-card"
                            />
                            </div>
                        )}
                        <div className="space-y-3">
                            {list("Maindeck", deck.maindeck)}
                            {list("Sideboard", deck.sideboard)}
                        </div>
                        <details className="text-sm">
                            <summary className="cursor-pointer text-xs text-ink/60 hover:text-ink">
                                {customUrl ? "Using your link — change it" : "Use a different list"}
                            </summary>
                            <div className="pt-2 space-y-2">
                                {linkForm}
                                {customUrl && (
                                    <button
                                        type="button"
                                        onClick={() => onSetUrl(null)}
                                        className="text-xs text-brand underline underline-offset-2 hover:text-brand-dark"
                                    >
                                        Go back to the metagame list
                                    </button>
                                )}
                            </div>
                        </details>
                    </>
                )
            )}
        </div>
    );
}
