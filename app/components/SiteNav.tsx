"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
    { href: "/", label: "Pack Planner" },
    { href: "/rotation", label: "Standard Rotation" },
];

export default function SiteNav() {
    const pathname = usePathname();

    return (
        <header className="bg-midnight border-b-2 border-brass">
            <div className="max-w-5xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                <h1 className="font-title text-2xl text-midnight-light tracking-wide">
                    MTG Card Acquiring Tool
                </h1>

                <nav className="flex gap-1">
                    {TABS.map((tab) => {
                        const active = pathname === tab.href;
                        return (
                            <Link
                                key={tab.href}
                                href={tab.href}
                                className={
                                    "px-4 py-2 rounded text-sm font-semibold tracking-wide transition-colors " +
                                    (active
                                        ? "bg-brass text-ink"
                                        : "text-midnight-light/60 hover:text-midnight-light hover:bg-white/5")
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
