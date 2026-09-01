import PageHeader from "../components/PageHeader";

export const metadata = {
    title: "About — MTG Card Acquiring Tool",
    description:
        "What the MTG Card Acquiring Tool does, where its card data comes from, and the limits of what it can tell you.",
};

export default function AboutPage() {
    return (
        <div className="px-6 pt-8">
            <main className="max-w-5xl mx-auto py-10 px-6 space-y-10 text-ink">
                <PageHeader
                    title="About"
                    subtitle="A free tool for working out what a decklist will actually cost you — in wildcards on Arena, or in dollars on paper."
                    art="/art/banner-planner.svg"
                />

                <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-4">
                    <h2 className="text-2xl font-title flex items-center">What this is</h2>
                    <div className="space-y-3 leading-relaxed">
                        <p>
                            Deckbuilding sites will happily tell you what a deck contains. They are much
                            less good at telling you what it costs <em>you</em> — the person who already
                            owns two of the four copies and has a stack of wildcards sitting unspent.
                        </p>
                        <p>
                            This tool closes that gap. You paste in one or more decklists and the
                            collection you already own, and it subtracts one from the other. What comes
                            back is only the part you still need to acquire, priced and counted.
                        </p>
                    </div>
                </section>

                <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-4">
                    <h2 className="text-2xl font-title flex items-center">The two tools</h2>
                    <div className="space-y-4 leading-relaxed">
                        <div>
                            <h3 className="font-title text-xl mb-1">Pack Planner</h3>
                            <p>
                                Compares decks against your collection. In Arena Mode it reports the
                                wildcards you&apos;d spend by rarity and groups what&apos;s missing by set, so you
                                can see which packs cover the most ground. In Paper Mode it prices the
                                shortfall and formats it for TCGPlayer&apos;s mass entry. Either way you get a
                                paste-ready list with a card count to check your cart against.
                            </p>
                        </div>
                        <div>
                            <h3 className="font-title text-xl mb-1">Standard Rotation</h3>
                            <p>
                                Shows which cards in a Standard list survive the next rotation. A card only
                                counts as rotating if <em>every</em> Standard-legal printing it has is in a
                                set that&apos;s leaving — if it&apos;s also printed in a set that&apos;s sticking around,
                                including one that hasn&apos;t released yet, it stays.
                            </p>
                        </div>
                    </div>
                </section>

                <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-4">
                    <h2 className="text-2xl font-title flex items-center">Where the data comes from</h2>
                    <div className="space-y-3 leading-relaxed">
                        <p>
                            Card names, printings, rarities, set membership, images and prices all come
                            from{" "}
                            <a
                                href="https://scryfall.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-brand underline underline-offset-2 hover:text-brand-dark"
                            >
                                Scryfall
                            </a>
                            &apos;s public bulk data. A scheduled job rebuilds the local dataset once a day, so
                            new sets and price movements are picked up without anything to do by hand.
                        </p>
                        <p>
                            Decklist links are imported from{" "}
                            <a
                                href="https://www.mtggoldfish.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-brand underline underline-offset-2 hover:text-brand-dark"
                            >
                                MTGGoldfish
                            </a>{" "}
                            when you paste one.
                        </p>
                    </div>
                </section>

                <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-4">
                    <h2 className="text-2xl font-title flex items-center">What it can and can&apos;t tell you</h2>
                    <div className="space-y-3 leading-relaxed">
                        <p>
                            Worth being straight about the limits, because they affect how much weight to
                            put on the numbers:
                        </p>
                        <ul className="list-disc list-outside pl-5 space-y-2">
                            <li>
                                <strong>Prices are estimates.</strong> They&apos;re Scryfall&apos;s recorded market
                                price for a specific printing, refreshed daily — not a live quote. What
                                you actually pay depends on condition, seller and the day.
                            </li>
                            <li>
                                <strong>Arena availability follows Scryfall.</strong> If a card has no
                                Arena-legal printing it&apos;s flagged and excluded from wildcard and pack
                                totals, since no amount of wildcards will conjure it.
                            </li>
                            <li>
                                <strong>The rotation set list is maintained by hand.</strong> Which sets
                                leave Standard isn&apos;t something card data exposes, so it&apos;s kept as an
                                explicit list and updated as Wizards announces changes.
                            </li>
                            <li>
                                <strong>Nothing here is deck advice.</strong> It tells you what a list
                                costs, not whether the list is any good.
                            </li>
                        </ul>
                    </div>
                </section>

                <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-4">
                    <h2 className="text-2xl font-title flex items-center">Project and affiliation</h2>
                    <div className="space-y-3 leading-relaxed">
                        <p>
                            This is an independent hobby project, free to use, with no account to create
                            and no paywall. The source is public on{" "}
                            <a
                                href="https://github.com/sutlifa/mtg-arena-pack-planner"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-brand underline underline-offset-2 hover:text-brand-dark"
                            >
                                GitHub
                            </a>
                            .
                        </p>
                        <p>
                            It is not affiliated with, endorsed by, or sponsored by Wizards of the Coast.
                            Magic: The Gathering and all associated card names and imagery are property of
                            Wizards of the Coast LLC. Card images are served by Scryfall; the artwork on
                            this site is original and unrelated to any Wizards property.
                        </p>
                    </div>
                </section>
            </main>
        </div>
    );
}
