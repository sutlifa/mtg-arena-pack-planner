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
        <header className="border-b border-line bg-parchment">
            <div className="max-w-5xl mx-auto px-6 py-3 flex flex-col sm:flex-row items-center justify-between gap-3">
                <h1 className="font-title text-lg text-ink">MTG Card Acquiring Tool</h1>

                <nav className="flex gap-1 bg-parchment-dark rounded-md p-1">
                    {TABS.map((tab) => {
                        const active = pathname === tab.href;
                        return (
                            <Link
                                key={tab.href}
                                href={tab.href}
                                className={
                                    "px-4 py-1.5 rounded text-sm font-medium transition-colors " +
                                    (active
                                        ? "bg-parchment text-ink shadow-card"
                                        : "text-ink/60 hover:text-ink")
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
