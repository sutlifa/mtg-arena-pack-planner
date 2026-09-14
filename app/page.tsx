import Link from "next/link";
import PageHeader from "./components/PageHeader";

export const metadata = {
    title: "MTG Planning App",
    description:
        "Three tools for planning a Magic deck: what it costs you to build, what rotates out of Standard, and how to sideboard against the field.",
};

/**
 * Landing page.
 *
 * The Pack Planner used to live here, which meant every visitor landed in one
 * specific tool with no sign that the other two existed. This page exists to
 * describe what each one is for; the planner moved to /planner.
 */

const TOOLS = [
    {
        href: "/planner",
        name: "Pack Planner",
        art: "/art/banner-planner.svg",
        tagline: "What will this deck actually cost me?",
        body: "Paste your decklists and the collection you already own, and it subtracts one from the other. Arena Mode reports the wildcards you'd spend by rarity and groups what's missing by set, so you can see which packs cover the most ground. Paper Mode prices the shortfall and formats it for TCGPlayer's mass entry.",
        points: [
            "Compare several decks at once",
            "Wildcard costs and pack recommendations for Arena",
            "Priced, paste-ready shopping list for paper",
            "Pick the exact printing and art for each card",
        ],
    },
    {
        href: "/rotation",
        name: "Standard Rotation",
        art: "/art/banner-rotation.svg",
        tagline: "What am I about to lose?",
        body: "Paste a Standard list to see which cards leave the format at the next rotation and which survive. A card only counts as rotating if every Standard-legal printing it has is in a set that's leaving — if it's also printed in a set that's sticking around, including one that hasn't released yet, it stays.",
        points: [
            "Checks every printing, not just the one you own",
            "Accounts for sets that haven't released yet",
            "Flags cards that were never Standard-legal",
        ],
    },
    {
        href: "/sideboard",
        name: "Sideboard Planner",
        art: "/art/banner-planner.svg",
        tagline: "What comes in, and what goes out?",
        body: "Build a matchup-by-matchup sideboard guide against the decks you'll actually face. Pull the current metagame for your format, tick the archetypes you care about, and write what comes out of your maindeck and in from your sideboard — then print the whole guide on one page for your deck box.",
        points: [
            "Top 50 archetypes pulled from the live metagame",
            "Card suggestions drawn from your own deck, with real quantity limits",
            "Separate plans for the play and the draw where they differ",
            "Prints to a single page in three columns",
        ],
    },
];

export default function HomePage() {
    return (
        <div className="px-3 sm:px-6 pt-8">
            <main className="max-w-5xl mx-auto py-10 px-3 sm:px-6 space-y-10 text-ink">
                <PageHeader
                    title="MTG Planning App"
                    subtitle="Three tools for planning a Magic deck — what it costs you to build, what rotates out from under it, and how to sideboard against the field."
                    art="/art/banner-planner.svg"
                />

                <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-3">
                    <h2 className="text-2xl font-title flex items-center">Start here</h2>
                    <p className="leading-relaxed">
                        Everything works without an account — nothing to sign up for, nothing behind a
                        paywall. Signing in only adds somewhere to save your work so it follows you to
                        another device.
                    </p>
                </section>

                {TOOLS.map((tool) => (
                    <section
                        key={tool.href}
                        className="bg-parchment-dark shadow-card rounded-lg overflow-hidden"
                    >
                        <div className="relative">
                            <div
                                aria-hidden="true"
                                className="absolute inset-0 bg-cover bg-center"
                                style={{ backgroundImage: `url('${tool.art}')` }}
                            />
                            <div aria-hidden="true" className="absolute inset-0 bg-[#111a15]/75" />
                            <div className="relative px-6 py-6">
                                <h2 className="font-title text-2xl sm:text-3xl text-midnight-light tracking-wide drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]">
                                    {tool.name}
                                </h2>
                                <p className="mt-1 text-sm text-midnight-light/90 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
                                    {tool.tagline}
                                </p>
                            </div>
                        </div>

                        <div className="p-6 space-y-4">
                            <p className="leading-relaxed">{tool.body}</p>

                            <ul className="list-disc list-outside pl-5 space-y-1 text-sm text-ink/85">
                                {tool.points.map((p) => (
                                    <li key={p}>{p}</li>
                                ))}
                            </ul>

                            <Link
                                href={tool.href}
                                className="inline-block px-5 py-2.5 rounded shadow-card font-title bg-brand text-midnight-light hover:bg-brand-dark transition-colors"
                            >
                                Open {tool.name}
                            </Link>
                        </div>
                    </section>
                ))}

                <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-3">
                    <h2 className="text-2xl font-title flex items-center">Where the data comes from</h2>
                    <p className="leading-relaxed">
                        Card names, printings, rarities, images and prices come from{" "}
                        <a
                            href="https://scryfall.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand underline underline-offset-2 hover:text-brand-dark"
                        >
                            Scryfall
                        </a>
                        , rebuilt daily. Decklists and metagame data come from{" "}
                        <a
                            href="https://www.mtggoldfish.com"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand underline underline-offset-2 hover:text-brand-dark"
                        >
                            MTGGoldfish
                        </a>
                        . Prices are daily estimates rather than live quotes — see{" "}
                        <Link
                            href="/about"
                            className="text-brand underline underline-offset-2 hover:text-brand-dark"
                        >
                            About
                        </Link>{" "}
                        for the full limits.
                    </p>
                </section>
            </main>
        </div>
    );
}
