"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import AuthButton from "./AuthButton";

const TABS = [
    { href: "/", label: "Home" },
    { href: "/planner", label: "Pack Planner" },
    { href: "/collection", label: "Collection" },
    { href: "/rotation", label: "Standard Rotation" },
    { href: "/sideboard", label: "Sideboard Planner" },
];

/**
 * Site header.
 *
 * The full row is brand + four tabs + the signed-in account control, which
 * measures around 940px. That does not fit a 1024px laptop once the account
 * control is present: measured signed in, the brand broke onto two lines and
 * the tabs onto two rows, taking the header from 62px to 102px tall.
 *
 * So the inline row only appears at `lg` and up; below that it collapses into
 * a menu button. The breakpoint is deliberately `lg` rather than `sm` — the
 * tabs alone fit a tablet, but not alongside an avatar and a name, and a
 * header that reflows the moment someone signs in is worse than one that is
 * consistently compact.
 */
export default function SiteNav({ authEnabled }: { authEnabled: boolean }) {
    const pathname = usePathname();
    const headerRef = useRef<HTMLElement>(null);

    // The menu is "open at a particular path" rather than just open. Deriving
    // it this way closes the panel on navigation for free — including via the
    // back button — instead of needing an effect to synchronise it shut.
    const [openAt, setOpenAt] = useState<string | null>(null);
    const open = openAt === pathname;
    const setOpen = (next: boolean) => setOpenAt(next ? pathname : null);

    useEffect(() => {
        if (!open) return;

        const onPointerDown = (e: PointerEvent) => {
            if (headerRef.current && !headerRef.current.contains(e.target as Node)) {
                setOpenAt(null);
            }
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpenAt(null);
        };

        document.addEventListener("pointerdown", onPointerDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("pointerdown", onPointerDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [open]);

    return (
        <header ref={headerRef} className="bg-midnight border-b-2 border-brass">
            <div className="max-w-5xl mx-auto px-6 py-3 flex items-center justify-between gap-4">
                {/* Site branding, not the page heading — each page supplies its
                    own <h1> via PageHeader, so this stays a plain link and the
                    document keeps exactly one h1. */}
                <Link href="/" className="flex items-center gap-3 group shrink-0">
                    <Image
                        src="/art/mark.svg"
                        alt=""
                        aria-hidden="true"
                        width={32}
                        height={32}
                        className="shrink-0"
                    />
                    {/* whitespace-nowrap: never break the product name in half. */}
                    <span className="font-title text-xl text-midnight-light tracking-wide whitespace-nowrap group-hover:text-brass-light transition-colors">
                        MTG Planning App
                    </span>
                </Link>

                {/* ---------- inline row, large screens ---------- */}
                <div className="hidden lg:flex items-center gap-4">
                    <nav className="flex gap-1" aria-label="Primary">
                        {TABS.map((tab) => {
                            const active = pathname === tab.href;
                            return (
                                <Link
                                    key={tab.href}
                                    href={tab.href}
                                    aria-current={active ? "page" : undefined}
                                    className={
                                        "px-3 py-2 rounded text-sm font-semibold tracking-wide whitespace-nowrap transition-colors " +
                                        (active
                                            ? "bg-brass text-brass-ink"
                                            : "text-midnight-light hover:bg-white/10")
                                    }
                                >
                                    {tab.label}
                                </Link>
                            );
                        })}
                    </nav>

                    {authEnabled && <AuthButton />}
                </div>

                {/* ---------- menu button, smaller screens ---------- */}
                <button
                    type="button"
                    onClick={() => setOpen(!open)}
                    aria-expanded={open}
                    aria-controls="site-menu"
                    aria-label={open ? "Close menu" : "Open menu"}
                    className="lg:hidden shrink-0 w-10 h-10 flex items-center justify-center rounded text-midnight-light hover:bg-white/10 transition-colors"
                >
                    <svg
                        width="22"
                        height="22"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        aria-hidden="true"
                    >
                        {open ? (
                            <>
                                <path d="M6 6l12 12" />
                                <path d="M18 6L6 18" />
                            </>
                        ) : (
                            <>
                                <path d="M4 7h16" />
                                <path d="M4 12h16" />
                                <path d="M4 17h16" />
                            </>
                        )}
                    </svg>
                </button>
            </div>

            {/* ---------- dropdown panel ---------- */}
            {open && (
                <div id="site-menu" className="lg:hidden border-t border-brass/30">
                    <nav
                        className="max-w-5xl mx-auto px-6 py-3 flex flex-col gap-1"
                        aria-label="Primary"
                    >
                        {TABS.map((tab) => {
                            const active = pathname === tab.href;
                            return (
                                <Link
                                    key={tab.href}
                                    href={tab.href}
                                    aria-current={active ? "page" : undefined}
                                    className={
                                        "px-3 py-2.5 rounded text-base font-semibold tracking-wide transition-colors " +
                                        (active
                                            ? "bg-brass text-brass-ink"
                                            : "text-midnight-light hover:bg-white/10")
                                    }
                                >
                                    {tab.label}
                                </Link>
                            );
                        })}

                        {authEnabled && (
                            <div className="mt-2 pt-3 border-t border-brass/25">
                                <AuthButton />
                            </div>
                        )}
                    </nav>
                </div>
            )}
        </header>
    );
}
