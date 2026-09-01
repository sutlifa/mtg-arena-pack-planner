import Image from "next/image";
import Link from "next/link";

const LINKS = [
    { href: "/about", label: "About" },
    { href: "/privacy", label: "Privacy" },
    { href: "/report", label: "Report an Issue" },
];

export default function Footer() {
    const year = new Date().getFullYear();

    return (
        <footer className="mt-16 bg-midnight border-t-2 border-brass">
            <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
                <div className="flex justify-center">
                    <Image
                        src="/art/sigils.svg"
                        alt=""
                        aria-hidden="true"
                        width={280}
                        height={48}
                        className="opacity-70"
                    />
                </div>

                <nav
                    aria-label="Footer"
                    className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm"
                >
                    {LINKS.map((l) => (
                        <Link
                            key={l.href}
                            href={l.href}
                            className="text-midnight-light hover:text-brass-light transition-colors"
                        >
                            {l.label}
                        </Link>
                    ))}
                    <a
                        href="https://github.com/sutlifa/mtg-arena-pack-planner"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-midnight-light hover:text-brass-light transition-colors"
                    >
                        Source
                    </a>
                    <a
                        href="https://www.paypal.com/donate/?business=VLDPL87EZ58L6&no_recurring=0&currency_code=USD"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-midnight-light hover:text-brass-light transition-colors"
                    >
                        Support this project
                    </a>
                </nav>

                <div className="border-t border-brass/25 pt-5 text-sm text-midnight-light/80 text-center space-y-1">
                    <p>© {year} MTG Card Acquiring Tool. All rights reserved.</p>
                    <p className="text-midnight-light/65">
                        Not affiliated with, endorsed by, or sponsored by Wizards of the Coast. Card data
                        and images courtesy of Scryfall.
                    </p>
                </div>
            </div>
        </footer>
    );
}
