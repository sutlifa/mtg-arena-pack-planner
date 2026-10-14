"use client";

import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";

/**
 * The small card picture that floats beside a name while the mouse is on it.
 *
 * Used by the Decks page's list editor (pointing at a row's name) and by the
 * add box's suggestions (CardNameAdd, opted in from the Decks page only).
 * It is the "glance" half of a split the editor used to blur together:
 * hovering a row once replaced the big picture beside the list, so the card
 * you had clicked never stayed put. Now a click pins the big picture and
 * hovering only ever shows this one, which never touches the pin.
 *
 * Three things here are deliberate and easy to "simplify" away:
 *
 *  - The position is worked out once, in the pointer handler, from the
 *    anchor's rectangle, and kept in state as plain numbers. Measuring during
 *    render would mean reading the DOM (or a ref) in render, which the React
 *    Compiler's rules forbid and which would be stale anyway.
 *
 *  - Hiding waits a moment (HIDE_GRACE_MS). Between two rows' names there's
 *    padding that belongs to neither, so moving straight down the list left
 *    one name before reaching the next and the picture blinked off and on.
 *    The next show() cancels the pending hide, so it just moves. 120ms was
 *    too short for an unhurried sweep across that gap; 250ms covers it and
 *    is still quick to clear once the mouse has really left.
 *
 *  - It is portalled to <body>, `position: fixed`, and `pointer-events:
 *    none`. Fixed so it can sit outside the list's columns without widening
 *    the page; portalled so no ancestor's transform or overflow can clip or
 *    re-anchor it; and inert to the pointer so it can never become the thing
 *    under the cursor — that would fire pointerleave on the name and the
 *    picture would flicker in a loop.
 */

/** Roughly two-thirds of the big picture: big enough to read, small enough to glance at. */
export const HOVER_W = 168;
/** Scryfall's "normal" image is 488×680; the same ratio as the big picture's 244×340. */
export const HOVER_H = Math.round((HOVER_W * 340) / 244);

const GAP = 12;
const MARGIN = 8;
const HIDE_GRACE_MS = 250;

/** Where the picture's top-left corner goes, in viewport pixels. */
export interface HoverSpot {
    name: string;
    left: number;
    top: number;
}

/** The parts of a DOMRect placement needs, so an anchor can be built from two elements' rects. */
export interface AnchorRect {
    left: number;
    right: number;
    top: number;
    bottom: number;
}

/** What else the picture must stay off, and whether it may go above or below. */
export interface PlaceOptions {
    /**
     * Things the picture must not cover, besides the anchor itself: the big
     * pinned picture beside the deck list, and an add box with its Add
     * button. Without this the sideboard column's pictures landed on the
     * pinned card at every width up to about 1280px — the one thing this
     * split exists to keep in view. Null and zero-size rects are ignored, so
     * a panel hidden at a phone's width (or still empty) costs nothing.
     */
    avoid?: ReadonlyArray<AnchorRect | null | undefined>;
    /** Beside only, never above or below — for an anchor whose neighbours above and below matter too (the suggestion list). */
    sideOnly?: boolean;
}

/**
 * Beside the anchor, never on it: to the right if it fits, else to the left,
 * vertically centred on the anchor and pulled back inside the window near
 * its top and bottom. Where that spot would cover something in `avoid`, the
 * picture slides down (or up) just clear of it, as long as it still sits
 * level with some part of the anchor — slide it further and it's no longer
 * "beside" anything. So a sideboard row whose right-hand spot is the pinned
 * picture gets the left-hand spot, over the maindeck column, instead.
 *
 * When neither side works (a narrow window with a mouse, a name that fills
 * the row) it goes below the anchor, or above it — unless `sideOnly`. Null
 * when nothing fits: no picture beats one that covers what you're looking at.
 */
export function placeBeside(
    anchor: AnchorRect,
    viewW: number,
    viewH: number,
    { avoid = [], sideOnly = false }: PlaceOptions = {}
): { left: number; top: number } | null {
    const maxLeft = viewW - MARGIN - HOVER_W;
    const maxTop = viewH - MARGIN - HOVER_H;
    const others = avoid.filter((r): r is AnchorRect => !!r && r.right > r.left && r.bottom > r.top);
    const blocks = [anchor, ...others];
    const covers = (left: number, top: number, b: AnchorRect) =>
        left < b.right && left + HOVER_W > b.left && top < b.bottom && top + HOVER_H > b.top;
    const fits = (left: number, top: number) =>
        left >= MARGIN && left <= maxLeft && top >= MARGIN && top <= maxTop && !blocks.some((b) => covers(left, top, b));

    const centreTop = Math.max(MARGIN, Math.min((anchor.top + anchor.bottom) / 2 - HOVER_H / 2, maxTop));
    const level = (top: number) => top <= anchor.bottom && top + HOVER_H >= anchor.top;
    for (const left of [anchor.right + GAP, anchor.left - GAP - HOVER_W]) {
        // Centred first; then just below or just above each thing in the
        // way, nearest to centred first.
        const tops = [
            centreTop,
            ...others.flatMap((b) => [b.bottom + GAP, b.top - GAP - HOVER_H]),
        ]
            .filter(level)
            .sort((a, b) => Math.abs(a - centreTop) - Math.abs(b - centreTop));
        const top = tops.find((t) => fits(left, t));
        if (top !== undefined) return { left, top };
    }
    if (sideOnly) return null;

    const left = Math.max(MARGIN, Math.min(anchor.left, maxLeft));
    for (const top of [anchor.bottom + GAP, anchor.top - GAP - HOVER_H]) {
        if (fits(left, top)) return { left, top };
    }
    return null;
}

/**
 * A real mouse on a device that can hover. Touch and pen taps fire pointer
 * enter too (and phones emulate mouseenter on a tap), which would flash a
 * picture under the finger on every tap-to-pin; on those the pinned picture
 * and the phone's corner card are the whole story.
 */
export function isHoverPointer(e: ReactPointerEvent): boolean {
    return e.pointerType === "mouse" && window.matchMedia("(hover: hover)").matches;
}

/**
 * The picture's state: which name and where. `show` and `hide` are for event
 * handlers only (they measure the window). The caller looks the image up by
 * `spot.name` at render time, so a picture still loading when the mouse
 * arrived simply appears once it lands, without another hover.
 */
export function useHoverSpot() {
    const [spot, setSpot] = useState<HoverSpot | null>(null);
    const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const cancelHide = () => {
        if (hideTimer.current !== null) {
            clearTimeout(hideTimer.current);
            hideTimer.current = null;
        }
    };

    const show = (name: string, anchor: AnchorRect, options?: PlaceOptions) => {
        cancelHide();
        // clientWidth, not innerWidth: innerWidth counts a desktop's
        // vertical scrollbar, and a picture flush against it was clipped.
        const at = placeBeside(anchor, document.documentElement.clientWidth, window.innerHeight, options);
        setSpot(at ? { name, ...at } : null);
    };

    /** `now` for a deliberate close (typing, Escape, adding); the grace is for the pointer leaving. */
    const hide = (now = false) => {
        cancelHide();
        if (now) {
            setSpot(null);
            return;
        }
        hideTimer.current = setTimeout(() => {
            hideTimer.current = null;
            setSpot(null);
        }, HIDE_GRACE_MS);
    };

    // The spot is in viewport pixels, measured when the mouse arrived. A
    // scroll (the page, or the suggestion list's own) or a resize moves the
    // name out from under it, so the picture goes rather than float beside
    // the wrong row. Capture, because scroll doesn't bubble from inner boxes.
    const visible = spot !== null;
    useEffect(() => {
        if (!visible) return;
        const off = () => setSpot(null);
        window.addEventListener("scroll", off, { passive: true, capture: true });
        window.addEventListener("resize", off);
        return () => {
            window.removeEventListener("scroll", off, { capture: true });
            window.removeEventListener("resize", off);
        };
    }, [visible]);

    // A hide still pending when the owner unmounts would set state on nothing.
    useEffect(
        () => () => {
            if (hideTimer.current !== null) clearTimeout(hideTimer.current);
        },
        []
    );

    return { spot, show, hide };
}

/**
 * Renders nothing until there's both a spot and a picture for it. `alt` is
 * empty and the whole thing aria-hidden: it repeats the name the pointer is
 * already on, and a screen reader announcing a card every time the mouse
 * drifts across the list would be noise.
 */
export function HoverPreview({ spot, src }: { spot: HoverSpot | null; src: string | null | undefined }) {
    if (!spot || !src) return null;
    return createPortal(
        <div
            aria-hidden="true"
            className="fixed z-50 pointer-events-none rounded-[4.5%] shadow-card"
            style={{ left: spot.left, top: spot.top, width: HOVER_W }}
        >
            <Image
                unoptimized
                src={src}
                alt=""
                width={HOVER_W}
                height={HOVER_H}
                className="w-full h-auto rounded-[4.5%]"
            />
        </div>,
        document.body
    );
}
