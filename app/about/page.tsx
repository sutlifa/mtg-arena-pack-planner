import PageHeader from "../components/PageHeader";
import { isAuthConfigured } from "@/lib/authConfig";

export const metadata = {
    title: "About — MTG Planning App",
    description:
        "What the MTG Planning App does, where its card data comes from, and the limits of what it can tell you.",
};

/**
 * The Accounts section follows isAuthConfigured(), as the homepage and the
 * privacy page do: without Google credentials /signin and /profile 404, so
 * describing sign-in there would send people to pages that don't exist.
 * It's a plain env read rather than auth(), so this page stays statically
 * prerendered.
 */
export default function AboutPage() {
    const accounts = isAuthConfigured();

    return (
        <div className="px-3 sm:px-6 pt-8">
            <main className="max-w-5xl mx-auto py-10 px-3 sm:px-6 space-y-10 text-ink">
                <PageHeader
                    title="About"
                    subtitle="Four free tools for planning a Magic deck — what it costs to build, what you already own, what rotates out from under it, and how to sideboard against the field."
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
                            The Pack Planner closes that gap. You paste in one or more decklists and the
                            collection you already own, and it subtracts one from the other. What comes
                            back is only the part you still need to acquire, priced and counted.
                        </p>
                        <p>
                            Three more tools grew out of the same idea — answering a concrete question
                            about a real deck rather than showing you a card database.
                        </p>
                    </div>
                </section>

                <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-4">
                    <h2 className="text-2xl font-title flex items-center">The four tools</h2>
                    <div className="space-y-4 leading-relaxed">
                        <div>
                            <h3 className="font-title text-xl mb-1">Pack Planner</h3>
                            <p>
                                Compares one or more decks — pasted, or pulled from an MTGGoldfish link —
                                against your collection. In Arena Mode it reports the wildcards you&apos;d
                                spend by rarity and groups what&apos;s missing by set, so you can see which
                                packs cover the most ground. In Paper Mode it prices the shortfall and
                                formats it for TCGPlayer&apos;s mass entry. Either way you get a paste-ready
                                list with a card count to check your cart against, and you can pick the
                                exact printing and art for each card.
                            </p>
                        </div>
                        <div>
                            <h3 className="font-title text-xl mb-1">Collection</h3>
                            <p>
                                Builds the collection the Pack Planner compares against, with a picture of
                                every card. Add cards by name, with suggestions as you type, or paste a
                                list or an Arena export; then adjust counts, filter and sort. Copies of a
                                card across different printings always merge into one line — here, in
                                the Pack Planner, and in anything you save or load — so an Arena
                                export&apos;s dozen lines for one card become one. It&apos;s the same collection,
                                in the same Arena or Paper mode, that the Pack Planner uses.
                            </p>
                        </div>
                        <div>
                            <h3 className="font-title text-xl mb-1">Standard Rotation</h3>
                            <p>
                                Shows which cards in a Standard list, or an MTGGoldfish link, survive the
                                next rotation. A card only counts as rotating if <em>every</em>{" "}
                                Standard-legal printing it has is in a set that&apos;s leaving — if it&apos;s
                                also printed in a set that&apos;s sticking around, including one that
                                hasn&apos;t released yet, it stays.
                            </p>
                        </div>
                        <div>
                            <h3 className="font-title text-xl mb-1">Sideboard Planner</h3>
                            <p>
                                Builds a matchup-by-matchup sideboard guide against the decks you&apos;ll
                                actually face, in Standard, Pioneer, Modern, Legacy or Pauper. Pull up
                                to the top 50 archetypes from the current metagame, over whichever
                                window you choose from the last week to the last year, tick the ones
                                you care about, and record what comes out of your maindeck and in from
                                your sideboard — with separate plans for the play and the draw where
                                they differ. Suggestions come from your own deck and stop at the copies
                                you run, and a plan that would leave you under 60 cards is flagged
                                before you print it.
                            </p>
                            <p className="mt-2">
                                Beside each matchup is the opponent&apos;s decklist, with card pictures,
                                matched automatically to the closest archetype on MTGGoldfish; pick a
                                different one or paste your own link if the guess is wrong. Export PDF
                                prints the whole guide on one page for your deck box, with the text
                                sized to fill it.
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
                            when you paste one. The Sideboard Planner&apos;s metagame list — which
                            archetypes are being played, and how much — and the opponent lists shown
                            beside each matchup come from MTGGoldfish too. The metagame list is fetched
                            when you pull it, and also in the background whenever your guide has
                            matchups, so each one can be matched to an archetype; an opponent&apos;s list
                            loads as its matchup scrolls near on a wide screen, or when you open
                            &quot;Show their list&quot; on a narrower one.
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
                                <strong>An opponent&apos;s list is one example, and sometimes a guess.</strong>{" "}
                                It&apos;s the featured decklist for the archetype MTGGoldfish shows, matched to
                                your matchup by name — marked &quot;best guess&quot; when it was picked
                                automatically. Real opponents vary, and a loosely named matchup can land
                                on the wrong archetype; the picker is there to fix it.
                            </li>
                            <li>
                                <strong>Nothing here is deck advice.</strong> It tells you what a list
                                costs, not whether the list is any good.
                            </li>
                        </ul>
                    </div>
                </section>

                <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-4">
                    <h2 className="text-2xl font-title flex items-center">Accounts</h2>
                    <div className="space-y-3 leading-relaxed">
                        {accounts ? (
                            <>
                                <p>
                                    Every tool works without an account, and always will. Signing in with
                                    Google adds one thing: somewhere to save your work — collections,
                                    comparisons and sideboard guides — so it follows you to another device.
                                </p>
                                <p>
                                    Nothing is saved automatically. You can delete any saved item, or your
                                    whole account, from your profile page at any time. The{" "}
                                    <a
                                        href="/privacy"
                                        className="text-brand underline underline-offset-2 hover:text-brand-dark"
                                    >
                                        privacy policy
                                    </a>{" "}
                                    describes exactly what is stored.
                                </p>
                            </>
                        ) : (
                            <p>
                                Every tool works without an account, and there is nothing to sign up for.
                                Your collection and sideboard plan are remembered in this browser between
                                visits, and nothing you enter is saved anywhere else. The{" "}
                                <a
                                    href="/privacy"
                                    className="text-brand underline underline-offset-2 hover:text-brand-dark"
                                >
                                    privacy policy
                                </a>{" "}
                                describes exactly what is sent and stored.
                            </p>
                        )}
                    </div>
                </section>

                <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-4">
                    <h2 className="text-2xl font-title flex items-center">Project and affiliation</h2>
                    <div className="space-y-3 leading-relaxed">
                        <p>
                            This is an independent hobby project, free to use, with no paywall. The
                            source is public on{" "}
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
