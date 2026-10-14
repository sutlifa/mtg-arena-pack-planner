"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import CardNameAdd, { type AddProblem } from "./CardNameAdd";
import { HoverPreview, isHoverPointer, useHoverSpot } from "./CardHoverPreview";
import { totalCards, type DeckCard, type DeckSections } from "@/lib/deckSections";
import {
    OTHER_SECTION,
    addCard,
    moveCard,
    removeCard,
    renameCards,
    setCardQty,
    type Section,
} from "@/lib/deckEdit";
import { MAX_LINE_QTY } from "@/lib/deckText";
import type { NameVerdict } from "@/lib/collectionText";

/**
 * The Decks page's list, as an editor: Maindeck and Sideboard side by side,
 * one row per card with its count, and the card's picture beside the list.
 *
 * This used to be a read-only preview under a textarea, and editing a deck
 * meant finding the line in the text. Now the preview is where you edit:
 * counts with − and +, a box to add a card to each half (with suggestions
 * from every card, not just the deck's), a control to move a card between
 * the halves, and remove. "Edit as text" on the page is still there for
 * anyone who'd rather type.
 *
 * It holds no deck of its own. `deck` is split from the page's text and
 * every edit goes back up through `onChange` as whole new sections, which
 * the page turns straight back into that text (lib/deckEdit explains why
 * the text stays the only copy). What it does keep is view state: the hover
 * picture, the phone's corner card, and each add box's latest complaint.
 * Which card is pinned is held by the page, like the pictures, so it
 * survives a trip to "Edit as text" (which unmounts this).
 *
 * Pictures come two ways, and keeping them apart is the point. Clicking (or
 * tapping, or Enter on) a name PINS it: the big picture beside the list shows
 * that card and stays on it until another name is clicked. Pointing at a name
 * with a mouse shows a SMALL picture beside the name (CardHoverPreview) and
 * leaves the pin alone. Hover used to drive the big picture directly, so it
 * jumped to whatever row the mouse crossed on its way anywhere and never
 * stayed on the card you'd chosen — the complaint this split answers.
 *
 * Names: everything added through the boxes is a real card under its
 * official name (CardNameAdd checks first). A pasted list is checked by the
 * page, which corrects spellings it's sure of; whatever is still unknown
 * arrives here in `verdicts` and is marked on its row with the closest real
 * names to swap in. Saving waits until those are fixed or removed — the
 * page says so — but nothing is ever renamed or deleted without a tap.
 */

/** A picture's size on the page; the image itself is Scryfall's "normal". */
const IMG_W = 244;
const IMG_H = 340;

const TITLES: Record<Section, string> = { maindeck: "Maindeck", sideboard: "Sideboard" };

const stepButton =
    "hidden sm:inline-flex items-center justify-center w-7 h-7 shrink-0 rounded bg-parchment-dark hover:bg-brass/25 font-title leading-none";

/**
 * One card's row. Its own component so the count box's half-typed text
 * belongs to exactly one row — the same reason as the Collection page's
 * CardTile, whose qtyDraft this copies: bound straight to card.qty, an
 * emptied box snapped back to the old number and the next digit landed
 * after it ("4" became "43").
 */
function CardRow({
    card,
    section,
    shown,
    verdict,
    onPin,
    onHoverName,
    onQty,
    onMove,
    onRemove,
    onRename,
}: {
    card: DeckCard;
    section: Section;
    /** This card is the one in the big picture — pinned, or the default before anything is. */
    shown: boolean;
    verdict: NameVerdict | undefined;
    onPin: () => void;
    /** The name under a mouse (its button, to place the small picture by), or null when it leaves. */
    onHoverName: (name: HTMLElement | null) => void;
    onQty: (qty: number) => void;
    onMove: () => void;
    onRemove: () => void;
    onRename: (name: string) => void;
}) {
    const [qtyDraft, setQtyDraft] = useState<string | null>(null);
    const unknown = verdict?.name === null;
    const suggestions = verdict && verdict.name === null ? verdict.suggestions : [];
    const step = (qty: number) => {
        setQtyDraft(null);
        onQty(qty);
    };
    const toLabel = section === "maindeck" ? "SB" : "Main";

    return (
        <li
            className={
                "flex flex-wrap items-center gap-x-1 gap-y-1 px-1.5 py-1 rounded " +
                (unknown ? "ring-2 ring-red-700/50 " : "") +
                (shown ? "bg-brass/20 ring-1 ring-brass/60" : "hover:bg-brass/10")
            }
        >
            {/* − and + from sm up. On a phone the row is too narrow for both
                buttons and a readable name, and the count box does the same
                job there with the number keyboard. */}
            <button type="button" aria-label={`One fewer ${card.name}`} onClick={() => step(card.qty - 1)} className={stepButton}>
                −
            </button>
            <input
                type="number"
                min={0}
                max={MAX_LINE_QTY}
                value={qtyDraft ?? card.qty}
                aria-label={`Copies of ${card.name} in the ${TITLES[section].toLowerCase()}`}
                onChange={(e) => {
                    const n = parseInt(e.target.value, 10);
                    // An emptied box is mid-edit, not "remove": show it empty
                    // and keep the real count until a number lands.
                    if (Number.isNaN(n)) {
                        setQtyDraft(e.target.value);
                        return;
                    }
                    // 0 removes the row (lib/deckEdit's setCardQty), the
                    // same as the × button.
                    step(n);
                }}
                onBlur={() => setQtyDraft(null)}
                className="w-11 shrink-0 px-1 py-0.5 rounded bg-parchment-dark text-center text-sm tabular-nums shadow-inner-parchment"
            />
            <button type="button" aria-label={`One more ${card.name}`} onClick={() => step(card.qty + 1)} className={stepButton}>
                +
            </button>

            {/* The pin. A real button, so a tap, a click and Enter or Space
                on the keyboard all pin the same way, and aria-pressed tells a
                screen reader which name the big picture is showing. Focus
                alone no longer moves the picture: tabbing past a row on the
                way to its count box shouldn't throw away the card you
                pinned, any more than a mouse passing over it should. A tap
                also opens the phone's corner picture (`peek` in the editor). */}
            <button
                type="button"
                aria-pressed={shown}
                onClick={onPin}
                // The whole name cell is the hover target, and the small
                // picture is placed against the whole cell — beside its
                // right end (over this row's → SB and ×) or its left, never
                // inside it — so wherever the cursor is on the name, the
                // picture isn't under it. An earlier version hovered only
                // the text, which left ~22px of dead space between two
                // names and blinked the picture off on a slow sweep. -my-1
                // with py-1 reaches into the row's own padding for the
                // same reason.
                onPointerEnter={(e) => {
                    if (isHoverPointer(e)) onHoverName(e.currentTarget);
                }}
                onPointerLeave={() => onHoverName(null)}
                className={
                    // 5rem, not more: at lg's 1024px each column leaves a row
                    // about 290px, and a wider floor pushed → SB and × onto a
                    // second line on every row. A longer name wraps instead.
                    // The site-wide button:focus outline is kept for the
                    // keyboard only: after a mouse click it drew a second
                    // frame inside the pinned row's ring.
                    "flex-1 min-w-[5rem] -my-1 py-1 self-stretch text-left text-sm leading-snug [overflow-wrap:anywhere] " +
                    "[&:not(:focus-visible)]:outline-none " +
                    (unknown ? "text-red-700" : "")
                }
            >
                {card.name}
            </button>

            <span className="flex items-center gap-1 shrink-0 ml-auto">
                <button
                    type="button"
                    onClick={onMove}
                    aria-label={`Move ${card.name} to the ${TITLES[OTHER_SECTION[section]].toLowerCase()}`}
                    title={`Move to the ${TITLES[OTHER_SECTION[section]].toLowerCase()}`}
                    className="h-7 px-1.5 rounded text-xs text-ink/70 hover:bg-brass/25 whitespace-nowrap"
                >
                    → {toLabel}
                </button>
                <button
                    type="button"
                    aria-label={`Remove ${card.name}`}
                    onClick={onRemove}
                    className="w-7 h-7 rounded text-ink/50 hover:text-red-700 hover:bg-red-700/10 leading-none"
                >
                    ×
                </button>
            </span>

            {unknown && (
                <div className="basis-full text-xs pl-1">
                    <p className="text-red-700">Not a card we recognise.</p>
                    {suggestions.length > 0 && (
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className="text-ink/70">Did you mean:</span>
                            {suggestions.map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => onRename(s)}
                                    className="px-2 py-0.5 rounded bg-parchment-dark text-ink shadow-inner-parchment hover:bg-brass/25 [overflow-wrap:anywhere]"
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </li>
    );
}

export default function DeckListEditor({
    deck,
    onChange,
    images,
    verdicts,
    pinned,
    onPinnedChange,
}: {
    deck: DeckSections;
    onChange: (next: DeckSections) => void;
    /** Card pictures by name: undefined while loading, null when there isn't one. */
    images: Readonly<Record<string, string | null>>;
    /** What /api/card-resolve made of each name, where it's been asked. */
    verdicts: Readonly<Record<string, NameVerdict>>;
    /**
     * The clicked card, held by the page so it outlives this editor (see
     * the top of this file). Null until the first click, when the big
     * picture shows the deck's first card.
     */
    pinned: string | null;
    onPinnedChange: (name: string | null) => void;
}) {
    const setPinned = onPinnedChange;
    /**
     * The phone's picture. Beside the list there's no room under md, so a
     * tap on a name shows its picture in a small corner card instead, until
     * it's closed or another name is tapped. It always shows the pinned card
     * — a tap pins and opens in one go. Hover doesn't open it: on a phone
     * there is no hover, and on a desktop the picture is already beside the
     * list.
     */
    const [peek, setPeek] = useState(false);
    // One add box's complaint at a time: adding to the other half, or
    // typing in either, clears it — the newest outcome is the one shown.
    const [problem, setProblem] = useState<{ section: Section; problem: AddProblem } | null>(null);
    const hover = useHoverSpot();
    // The big picture's column, for the small picture to keep off. Only
    // ever read in pointer handlers, when it's on the screen to measure.
    const panelRef = useRef<HTMLDivElement>(null);

    const all = [...deck.maindeck, ...deck.sideboard];
    const firstWithImage = all.find((c) => images[c.name])?.name;
    // The pinned card only while it's still in the deck. Without this
    // check a removed card's picture stayed beside an empty list, and the
    // phone's corner card stayed open on a card that was gone; now the big
    // picture falls back to the first card with one, or to nothing. A move
    // keeps the name, so the pin simply follows it to the other half; a
    // rename moves `pinned` to the new name (onRename below). `pinned` itself
    // isn't cleared on removal — it's derived around instead, which needs no
    // effect and is exactly as good.
    const pinnedInDeck = pinned !== null && all.some((c) => c.name === pinned);
    // A pinned card stays pinned even while its picture is loading or when
    // it has none. Falling back to another card there (as the hover-driven
    // version did) meant a just-added card showed the deck's first card for
    // half a second and then jumped, and a card with no picture showed a
    // different card entirely with no sign the click had registered.
    const shown = pinnedInDeck ? pinned : (firstWithImage ?? null);
    const shownImage = shown ? images[shown] : null;
    const peekImage = peek && pinnedInDeck ? images[pinned] : null;
    // The same "still in the deck" rule for the small picture: a name can
    // leave the deck while the mouse is still on its row (a count typed down
    // to 0), and the picture should go with it.
    const hoverName = hover.spot?.name;
    const hoverImage = hoverName !== undefined && all.some((c) => c.name === hoverName) ? images[hoverName] : null;
    /** Whatever removed `name` also closes the phone's picture of it. */
    const dropping = (name: string) => {
        if (name === pinned) setPeek(false);
    };

    const section = (s: Section) => {
        const cards = deck[s];
        return (
            <div className="bg-parchment rounded shadow-inner-parchment p-3 space-y-3 min-w-0">
                <p className="font-title text-lg">
                    {TITLES[s]} <span className="text-ink/60 text-base tabular-nums">({totalCards(cards)})</span>
                </p>
                {cards.length === 0 ? (
                    <p className="text-sm text-ink/60">
                        {s === "sideboard"
                            ? "No sideboard yet. Add cards below, or move one here with → SB."
                            : "No maindeck cards yet. Add some below."}
                    </p>
                ) : (
                    <ul className="space-y-0.5">
                        {cards.map((c) => (
                            <CardRow
                                key={c.name}
                                card={c}
                                section={s}
                                shown={c.name === shown}
                                verdict={verdicts[c.name]}
                                onPin={() => {
                                    setPinned(c.name);
                                    setPeek(true);
                                }}
                                onHoverName={(el) => {
                                    if (el)
                                        hover.show(c.name, el.getBoundingClientRect(), {
                                            avoid: [panelRef.current?.getBoundingClientRect()],
                                        });
                                    else hover.hide();
                                }}
                                onQty={(qty) => {
                                    if (qty <= 0) dropping(c.name);
                                    onChange(setCardQty(deck, s, c.name, qty));
                                }}
                                onMove={() => onChange(moveCard(deck, s, c.name))}
                                onRemove={() => {
                                    dropping(c.name);
                                    onChange(removeCard(deck, s, c.name));
                                }}
                                onRename={(name) => {
                                    if (pinned === c.name) setPinned(name);
                                    onChange(renameCards(deck, new Map([[c.name, name]])));
                                }}
                            />
                        ))}
                    </ul>
                )}
                <CardNameAdd
                    compact
                    // The same short text for both halves: "Add to the
                    // sideboard..." was cut off at 375px. Which half it adds
                    // to is in the box's label and the heading above it.
                    placeholder="Add a card..."
                    nameLabel={`Card to add to the ${TITLES[s].toLowerCase()}`}
                    problem={problem?.section === s ? problem.problem : null}
                    onProblem={(p) => setProblem(p ? { section: s, problem: p } : null)}
                    // The deck's pictures, so a suggestion already in the
                    // deck shows without a lookup — and passing them is what
                    // turns the suggestion preview on (it's off on the
                    // Collection page, which shares this box).
                    previewImages={images}
                    previewAvoidRef={panelRef}
                    onAdd={(name, qty) => {
                        onChange(addCard(deck, s, name, qty));
                        // A card you just added is the one you want to see.
                        // This pins it but doesn't open the phone's corner
                        // card: that opens on a tap, and popping it up over
                        // the keyboard mid-typing would hide the box.
                        setPinned(name);
                    }}
                />
            </div>
        );
    };

    return (
        <div className="flex gap-4 items-start">
            {/* Side by side from lg. Between md and lg the picture column
                takes 192px, and two columns in what's left gave each card
                name under 50px beside its controls — so they stack there,
                as they do on a phone. */}
            <div className="flex-1 min-w-0 grid lg:grid-cols-2 gap-4">
                {section("maindeck")}
                {section("sideboard")}
            </div>
            {/* Beside the list on a wide screen only, stuck in view while it scrolls. */}
            <div ref={panelRef} className="hidden md:block w-[176px] shrink-0 sticky top-4">
                {shownImage && (
                    <Image
                        unoptimized
                        src={shownImage}
                        alt={shown ?? ""}
                        width={IMG_W}
                        height={IMG_H}
                        className="w-full h-auto rounded-[4.5%] shadow-card"
                    />
                )}
                {shown && shownImage === null && (
                    <p className="text-sm text-ink/60 [overflow-wrap:anywhere]">No picture for {shown}.</p>
                )}
            </div>
            {/* The phone's picture: fixed in the corner rather than in the
                flow, so it neither pushes the list around nor needs room
                beside it, and it can't widen the page. The bottom-LEFT
                corner, because ScrollToTop's button owns the bottom-right
                on every page and sat on top of this card's corner there
                (the Sideboard Planner's debug tab went left for the same
                reason). Its × is on the inner corner, away from the edge. */}
            {peekImage && (
                <div className="md:hidden fixed bottom-3 left-3 z-30 w-36 rounded-[5%] bg-parchment-dark shadow-card p-1.5">
                    <button
                        type="button"
                        onClick={() => setPeek(false)}
                        aria-label="Close picture"
                        className="absolute -top-2 -right-2 w-7 h-7 rounded-full bg-parchment text-ink shadow-card leading-none"
                    >
                        ×
                    </button>
                    <Image
                        unoptimized
                        src={peekImage}
                        alt={pinned ?? ""}
                        width={IMG_W}
                        height={IMG_H}
                        className="w-full h-auto rounded-[4.5%]"
                    />
                </div>
            )}
            <HoverPreview spot={hover.spot} src={hoverImage} />
        </div>
    );
}
