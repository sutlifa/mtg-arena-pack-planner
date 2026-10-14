"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

/** Everything focusable inside a dialog, in tab order. */
const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The shell every in-page dialog sits in: the dimmed backdrop, the card, and
 * the keyboard behaviour a modal owes its users. Extracted from LeaveDialog
 * so the older dialogs — the Sideboard Planner's Start Over and "Load this
 * deck?", the Collection page's Start Over — behave the same instead of each
 * carrying a copy (they had none of it: focus stayed on the page behind,
 * Tab walked out of them and Escape did nothing).
 *
 * - Focus moves to the element marked `data-autofocus` — always the safe
 *   choice (Stay, Keep it) — and goes back to whatever had it, normally the
 *   button that opened the dialog, when the dialog closes. If the trigger
 *   is gone by then (the page was left), that does nothing.
 * - Tab and Shift+Tab wrap inside the card.
 * - Escape and a click on the backdrop both mean `onCancel`. A field inside
 *   that handles Escape itself (the save buttons' name boxes cancel naming)
 *   stops propagation, so its Escape never reaches this.
 *
 * Portalled to <body>. Rendered in place, the backdrop was a child of the
 * page's `space-y-*` stack, whose sibling margin pushed the fixed box
 * 32-40px down and left the site header clickable above it. Only mounted
 * after a click, so `document` always exists.
 */
export default function ModalFrame({
    onCancel,
    labelledBy,
    describedBy,
    overlayClassName = "",
    boxClassName,
    children,
}: {
    onCancel: () => void;
    labelledBy: string;
    describedBy?: string;
    /** Extra classes for the backdrop, e.g. "sb-noprint" on the planner. */
    overlayClassName?: string;
    /** The card's look; the dialog role and focus trap are applied to it. */
    boxClassName: string;
    children: React.ReactNode;
}) {
    const boxRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        boxRef.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
        return () => previous?.focus();
    }, []);

    const onKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Escape") {
            e.stopPropagation();
            onCancel();
            return;
        }
        if (e.key !== "Tab" || !boxRef.current) return;
        const items = [...boxRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !boxRef.current.contains(active))) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && (active === last || !boxRef.current.contains(active))) {
            e.preventDefault();
            first.focus();
        }
    };

    return createPortal(
        <div
            className={
                "fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" +
                (overlayClassName ? ` ${overlayClassName}` : "")
            }
            onClick={(e) => {
                if (e.target === e.currentTarget) onCancel();
            }}
            onKeyDown={onKeyDown}
        >
            <div
                ref={boxRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={labelledBy}
                aria-describedby={describedBy}
                className={boxClassName}
            >
                {children}
            </div>
        </div>,
        document.body
    );
}
