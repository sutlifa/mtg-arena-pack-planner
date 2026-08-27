"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

const VIEWPORT_PADDING = 8;

export default function HelpTip({ text }: { text: string }) {
    const [open, setOpen] = useState(false);
    const [bubbleLeft, setBubbleLeft] = useState(0);
    const wrapRef = useRef<HTMLSpanElement>(null);
    const bubbleRef = useRef<HTMLSpanElement>(null);

    // Center the bubble under the icon, then clamp it so it never spills
    // off the left/right edge of the viewport regardless of where the icon
    // sits on the page.
    useLayoutEffect(() => {
        if (!open || !wrapRef.current || !bubbleRef.current) return;

        const wrapRect = wrapRef.current.getBoundingClientRect();
        const bubbleWidth = bubbleRef.current.offsetWidth;

        let left = wrapRect.width / 2 - bubbleWidth / 2;
        const absLeft = wrapRect.left + left;
        const absRight = absLeft + bubbleWidth;

        if (absLeft < VIEWPORT_PADDING) {
            left += VIEWPORT_PADDING - absLeft;
        } else if (absRight > window.innerWidth - VIEWPORT_PADDING) {
            left -= absRight - (window.innerWidth - VIEWPORT_PADDING);
        }

        setBubbleLeft(left);
    }, [open]);

    useEffect(() => {
        if (!open) return;

        const handlePointerDown = (e: PointerEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };

        document.addEventListener("pointerdown", handlePointerDown);
        document.addEventListener("keydown", handleKey);
        return () => {
            document.removeEventListener("pointerdown", handlePointerDown);
            document.removeEventListener("keydown", handleKey);
        };
    }, [open]);

    return (
        <span ref={wrapRef} className="relative inline-flex align-middle ml-2">
            <button
                type="button"
                aria-label="Help"
                aria-expanded={open}
                onPointerUp={(e) => {
                    e.stopPropagation();
                    setOpen((v) => !v);
                }}
                className="w-5 h-5 shrink-0 flex items-center justify-center rounded-full bg-parchment text-ink text-xs font-title shadow-inner-parchment hover:bg-parchment-dark cursor-help select-none"
            >
                ?
            </button>

            {open && (
                <span
                    ref={bubbleRef}
                    role="tooltip"
                    style={{ left: bubbleLeft }}
                    className="absolute z-50 top-full mt-2 w-64 max-w-[80vw] p-3 rounded bg-parchment-dark text-ink text-sm font-[family-name:var(--font-body)] normal-case leading-snug text-left shadow-card border border-line"
                >
                    {text}
                </span>
            )}
        </span>
    );
}
