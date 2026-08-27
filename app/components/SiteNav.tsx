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
        <header className="border-b-4 border-[#5a4632] bg-parchment-dark shadow-card">
            <div className="max-w-5xl mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <h1 className="font-title text-2xl text-ink">MTG Card Acquiring Tool</h1>

                <nav className="flex gap-2">
                    {TABS.map((tab) => {
                        const active = pathname === tab.href;
                        return (
                            <Link
                                key={tab.href}
                                href={tab.href}
                                className={
                                    "px-6 py-2 rounded font-title text-lg border-2 transition-colors " +
                                    (active
                                        ? "bg-parchment text-ink border-[#8b3a12] shadow-card"
                                        : "bg-parchment text-ink border-[#5a4632] hover:bg-[#ddc48f]")
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
