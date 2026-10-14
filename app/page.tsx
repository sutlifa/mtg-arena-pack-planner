import Link from "next/link";
import PageHeader from "./components/PageHeader";
import StartHereSignIn from "./components/StartHereSignIn";
import { isAuthConfigured } from "@/lib/authConfig";

export const metadata = {
    title: "MTG Planning App",
    description:
        "Free tools for planning a Magic deck: keep your decklists and your collection, check what each deck is missing and what it costs to build, what rotates out of Standard, and how to sideboard against the field.",
};

/**
 * Landing page.
 *
 * The Pack Planner used to live here, which meant every visitor landed in one
 * specific tool with no sign that the others existed. This page exists to
 * describe what each one is for; the planner moved to /planner, and later
 * became Deck Check at /deck-check.
 *
 * The cards are in the nav's order and say what each tool is *for*, because
 * the three that touch decks and cards were once muddled: Decks holds your
 * decklists, Collection holds your cards, and Deck Check is the only one that
 * compares the two.
 *
 * Still statically prerendered. isAuthConfigured() is a plain env read, and
 * the one per-visitor part — whether you're signed in — is decided in the
 * browser by StartHereSignIn, so nothing here reads cookies or headers.
 */

interface Tool {
    href: string;
    name: string;
    art: string;
    tagline: string;
    body: string;
    points: string[];
    /**
     * What signing in adds to this tool. Listed only when auth is configured,
     * so a deployment without Google credentials — where no save button
     * exists — doesn't advertise one.
     */
    saves?: string;
}

const TOOLS: Tool[] = [
    {
        href: "/decks",
        name: "Decks",
        art: "/art/banner-rotation.svg",
        tagline: "Where do I keep my lists?",
        body: "Your decklists, kept and edited in one place. Build one card by card with name suggestions, or paste one from Arena, MTGGoldfish or anywhere else and it turns into an editable list — maindeck and sideboard side by side, with a picture of each card. When it's ready, one click checks it in Deck Check or loads it into the Sideboard Planner to start a guide.",
        points: [
            "Build card by card, or paste a list or an MTGGoldfish link and edit it line by line",
            "Change counts, move cards between maindeck and sideboard, and fix misspelt names",
            "Check it in Deck Check, which runs straight away against your collection",
            "Start a sideboard guide from it, with the format already set",
        ],
        saves: "Save decks to your profile, open any of them right on the page, and rename or duplicate them — from any device",
    },
    {
        href: "/collection",
        name: "Collection",
        art: "/art/banner-planner.svg",
        tagline: "What do I already own?",
        body: "Your cards, with a picture of every one. Add them one at a time or paste an export; every printing of a card counts together, so an Arena export's scattered lines become one tidy entry per card. This is the collection Deck Check checks your decks against.",
        points: [
            "Add cards by name with suggestions, or paste a list or an Arena export",
            "A picture of every card, with quick +/− counts",
            "Filter, sort and page through a collection of any size",
            "Copies across printings combined into one line",
        ],
        saves: "Saves to your profile as Arena or Paper; open any saved collection right on the page",
    },
    {
        href: "/deck-check",
        name: "Deck Check",
        art: "/art/banner-planner.svg",
        tagline: "What am I missing, and what will it cost me?",
        body: "Puts your decks and your collection side by side. Paste decks or send them from the Decks page, check them against your Collection page collection or one you paste, and see exactly which cards each deck is missing. Arena Mode adds up the wildcards you'd spend by rarity and groups what's missing by set, so you can see which packs cover the most ground; Paper Mode prices the shortfall and formats it for TCGPlayer's mass entry.",
        points: [
            "What each deck is missing, card by card, with pictures and a copyable list",
            "Check several decks at once",
            "Wildcard costs and pack recommendations for Arena",
            "Priced, paste-ready shopping list for paper",
            "Pick the exact printing and art for each card",
        ],
        saves: "Add your saved decks and collections, save pasted ones to Decks or Collection, and save whole comparisons — opening one re-runs it",
    },
    {
        href: "/sideboard",
        name: "Sideboard Planner",
        art: "/art/banner-planner.svg",
        tagline: "What comes in, and what goes out?",
        body: "Build a matchup-by-matchup sideboard guide against the decks you'll actually face. Paste your deck or an MTGGoldfish link, pull the current metagame for your format, tick the archetypes you care about, and write what comes out of your maindeck and in from your sideboard, with each opponent's list beside its matchup. Then print the whole guide on one page for your deck box.",
        points: [
            "Standard, Pioneer, Modern, Legacy and Pauper",
            "Up to the top 50 archetypes from the live metagame, over the last 7 to 365 days",
            "Card suggestions drawn from your own deck, with real quantity limits",
            "Separate plans for the play and the draw where they differ",
            "Each opponent's decklist beside its matchup, with card pictures",
            "Prints to one page in three columns, with the text sized to fill it",
        ],
        saves: "Save guides to your profile, open any of them right on the page, rename them in place, and duplicate them",
    },
    {
        href: "/rotation",
        name: "Standard Rotation",
        art: "/art/banner-rotation.svg",
        tagline: "What am I about to lose?",
        body: "Paste a Standard list, or an MTGGoldfish link, to see which cards leave the format at the next rotation and which survive. A card only counts as rotating if every Standard-legal printing it has is in a set that's leaving — if it's also printed in a set that's sticking around, including one that hasn't released yet, it stays.",
        points: [
            "Checks every printing, not just the one you own",
            "Accounts for sets that haven't released yet",
            "Flags cards that were never Standard-legal",
        ],
    },
];

export default function HomePage() {
    const authEnabled = isAuthConfigured();

    return (
        <div className="px-3 sm:px-6 pt-8">
            <main className="max-w-5xl mx-auto py-10 px-3 sm:px-6 space-y-10 text-ink">
                <PageHeader
                    title="MTG Planning App"
                    subtitle="Tools for planning a Magic deck — keep your lists, see what they cost you to build and what you already own, what rotates out from under them, and how to sideboard against the field."
                    art="/art/banner-planner.svg"
                />

                <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-3">
                    <h2 className="text-2xl font-title flex items-center">Start here</h2>
                    {authEnabled ? (
                        <>
                            <p className="leading-relaxed">
                                Everything works without an account — no sign-up wall, nothing behind a
                                paywall. Signing in with Google only adds a profile that saves your
                                decks, collections, Deck Check comparisons and sideboard guides, so they
                                follow you to another device.
                            </p>
                            <StartHereSignIn />
                        </>
                    ) : (
                        // No Google credentials on this deployment: no sign-in and
                        // nowhere to save to, so the copy promises neither.
                        <p className="leading-relaxed">
                            Everything works without an account — nothing to sign up for, nothing
                            behind a paywall. Your collection is remembered in this browser between
                            visits; the deck and sideboard plan you&apos;re working on are kept while
                            you&apos;re on their page.
                        </p>
                    )}
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
                                {(authEnabled && tool.saves
                                    ? [...tool.points, tool.saves]
                                    : tool.points
                                ).map((p) => (
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
                        , rebuilt daily. Imported decklists, opponents&apos; lists and metagame data come from{" "}
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
