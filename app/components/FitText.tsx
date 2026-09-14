"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

/**
 * Shrinks its text just enough to sit on one line.
 *
 * No CSS can do this on its own. `clamp()` and `cqi` scale with the viewport
 * or the container, not with how long this particular string is — "Bolt" and
 * "Kroxa, Titan of Death's Hunger" would get the same size and one of them
 * would still wrap. Fitting a specific string requires measuring it.
 *
 * So: render at the maximum size, measure, and scale down by the ratio of
 * available width to needed width.
 *
 * Two details that are easy to get wrong:
 *
 * - The size is written straight to style rather than held in state. Setting
 *   state here would re-render, which re-measures, which sets state again.
 * - Headings use Playfair, a web font that loads after first paint. Measuring
 *   before it arrives sizes the text against the fallback and leaves it wrong
 *   once the real font swaps in, so the fit is re-run on document.fonts.ready.
 *
 * `min` is a floor, not a suggestion: below it the text stops shrinking and
 * ellipsises instead, because an unreadable name that fits is worse than a
 * readable one that is clipped.
 */

// useLayoutEffect warns during SSR; useEffect is equivalent there because
// neither runs on the server.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export default function FitText({
    children,
    max = 18,
    min = 11,
    className = "",
    title,
}: {
    children: React.ReactNode;
    /** Starting (and largest) font size in px. */
    max?: number;
    /** Never shrink below this; clip instead. */
    min?: number;
    className?: string;
    title?: string;
}) {
    const boxRef = useRef<HTMLSpanElement>(null);
    const textRef = useRef<HTMLSpanElement>(null);

    useIsomorphicLayoutEffect(() => {
        const box = boxRef.current;
        const text = textRef.current;
        if (!box || !text) return;

        let frame = 0;

        const fit = () => {
            const available = box.clientWidth;
            if (!available) return;

            // Always measure from the top, so widening the window scales the
            // text back up instead of leaving it stuck small.
            text.style.fontSize = `${max}px`;
            const needed = text.scrollWidth;
            if (!needed) return;

            if (needed > available) {
                const scaled = Math.floor((max * available) / needed);
                text.style.fontSize = `${Math.max(min, scaled)}px`;
            }
        };

        // Coalesce bursts of resize callbacks into one measurement per frame.
        const schedule = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(fit);
        };

        fit();

        const observer = new ResizeObserver(schedule);
        observer.observe(box);

        // Re-fit once the heading font has actually loaded.
        let cancelled = false;
        if (typeof document !== "undefined" && document.fonts?.ready) {
            document.fonts.ready.then(() => {
                if (!cancelled) fit();
            });
        }

        return () => {
            cancelled = true;
            cancelAnimationFrame(frame);
            observer.disconnect();
        };
    }, [children, max, min]);

    return (
        <span ref={boxRef} className={"block min-w-0 overflow-hidden " + className} title={title}>
            <span
                ref={textRef}
                className="block whitespace-nowrap overflow-hidden text-ellipsis"
                style={{ fontSize: `${max}px` }}
            >
                {children}
            </span>
        </span>
    );
}
