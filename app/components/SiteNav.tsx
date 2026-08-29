"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const TABS = [
    { href: "/", label: "Pack Planner" },
    { href: "/rotation", label: "Standard Rotation" },
];

export default function SiteNav() {
    const pathname = usePathname();

    return (
        <header className="bg-midnight border-b-2 border-brass">
            <div className="max-w-5xl mx-auto px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
                {/* Site branding, not the page heading — each page supplies its
                    own <h1> via PageHeader, so this stays a plain link and the
                    document keeps exactly one h1. */}
                <Link href="/" className="flex items-center gap-3 group">
                    <Image
                        src="/art/mark.svg"
                        alt=""
                        aria-hidden="true"
                        width={32}
                        height={32}
                        className="shrink-0"
                    />
                    <span className="font-title text-xl text-midnight-light tracking-wide group-hover:text-brass-light transition-colors">
                        MTG Card Acquiring Tool
                    </span>
                </Link>

                <nav className="flex gap-1" aria-label="Primary">
                    {TABS.map((tab) => {
                        const active = pathname === tab.href;
                        return (
                            <Link
                                key={tab.href}
                                href={tab.href}
                                aria-current={active ? "page" : undefined}
                                className={
                                    "px-4 py-2 rounded text-sm font-semibold tracking-wide transition-colors " +
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
            </div>
        </header>
    );
}
