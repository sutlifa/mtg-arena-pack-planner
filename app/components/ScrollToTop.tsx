"use client";

import { useEffect, useState } from "react";

/** Far enough down that the button is useful rather than in the way. */
const SHOW_AFTER_PX = 600;

/**
 * Floating "back to top" control.
 *
 * Lives in the root layout so every page gets it — the Pack Planner and the
 * Sideboard Planner both run to several screens once results are in, and the
 * planner in particular can be twenty-five matchups long.
 *
 * Marked sb-noprint so it never lands on the printed sheet.
 */
export default function ScrollToTop() {
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const onScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX);

        onScroll(); // in case the page loads already scrolled (an anchor, a restored position)
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    const toTop = () => {
        // Respect a reduced-motion preference rather than always smooth-scrolling.
        const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
    };

    return (
        <button
            type="button"
            onClick={toTop}
            aria-label="Back to top"
            // Kept mounted and faded out rather than unmounted, so it animates
            // in and out instead of popping. Hidden from the tab order and from
            // assistive tech while it is invisible.
            aria-hidden={!visible}
            tabIndex={visible ? 0 : -1}
            className={
                "sb-noprint fixed z-40 bottom-5 right-5 w-11 h-11 rounded-full " +
                "bg-brand text-midnight-light shadow-card border border-brass/40 " +
                "flex items-center justify-center " +
                "hover:bg-brand-dark focus-visible:ring-2 focus-visible:ring-brass " +
                "transition-opacity duration-200 " +
                (visible ? "opacity-90 hover:opacity-100" : "opacity-0 pointer-events-none")
            }
        >
            {/* Simple chevron, drawn rather than pulled from an icon set. */}
            <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
            >
                <path d="M6 15l6-6 6 6" />
            </svg>
        </button>
    );
}
