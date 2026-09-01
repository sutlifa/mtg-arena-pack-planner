import PageHeader from "../components/PageHeader";

export const metadata = {
    title: "Privacy — MTG Card Acquiring Tool",
    description:
        "What this site stores, what it sends, and which third parties are involved. No accounts, no tracking cookies.",
};

/**
 * Written against what the code actually does rather than from a template.
 * If the data flow changes — new third-party script, anything persisted
 * server-side, a cookie — this page needs updating in the same change.
 */
export default function PrivacyPage() {
    return (
        <div className="px-6 pt-8">
            <main className="max-w-5xl mx-auto py-10 px-6 space-y-10 text-ink">
                <PageHeader
                    title="Privacy"
                    subtitle="No accounts, no tracking cookies, and your collection never leaves your own browser storage."
                    art="/art/banner-rotation.svg"
                />

                <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-4">
                    <h2 className="text-2xl font-title flex items-center">The short version</h2>
                    <ul className="list-disc list-outside pl-5 space-y-2 leading-relaxed">
                        <li>There are no accounts, logins, or profiles. You are never asked who you are.</li>
                        <li>Your saved collection is stored in your own browser and is never uploaded for storage.</li>
                        <li>No advertising, no ad networks, no cross-site tracking, and no tracking cookies.</li>
                        <li>Decklists you submit are processed to produce a result and are not written to any database or log.</li>
                    </ul>
                </section>

                <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-4">
                    <h2 className="text-2xl font-title flex items-center">What&apos;s stored on your device</h2>
                    <div className="space-y-3 leading-relaxed">
                        <p>
                            When you paste a collection into the Pack Planner, it&apos;s saved in your
                            browser&apos;s <code className="px-1 rounded bg-parchment">localStorage</code> under
                            a single key, <code className="px-1 rounded bg-parchment">mtgpp:collection</code>,
                            so you don&apos;t have to paste it again next visit.
                        </p>
                        <p>
                            That data stays on your device. It is not uploaded for storage, not tied to any
                            identifier, and not readable by this site on any other device. Clearing it is
                            immediate: use the <strong>Clear</strong> button next to the collection box, or
                            clear site data in your browser. Clearing your browser storage also erases it,
                            with no copy retained anywhere else.
                        </p>
                        <p>
                            The site sets no cookies of its own.
                        </p>
                    </div>
                </section>

                <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-4">
                    <h2 className="text-2xl font-title flex items-center">What gets sent to the server</h2>
                    <div className="space-y-3 leading-relaxed">
                        <p>
                            To compare a deck against your collection, the text you&apos;ve entered has to reach
                            the server that does the matching. When you press Analyze or Check Rotation,
                            your decklists — and, in the Pack Planner, your collection text — are sent to
                            this site&apos;s own API so the comparison can be computed.
                        </p>
                        <p>
                            That text is used to build the response and then discarded. It is not saved to
                            a database, not written to a file, and not recorded in an application log. It
                            is not sold, shared, or used to build a profile.
                        </p>
                        <p>
                            If you paste an MTGGoldfish deck link, the server fetches that page on your
                            behalf so your browser doesn&apos;t have to. Only <code className="px-1 rounded bg-parchment">mtggoldfish.com</code>{" "}
                            URLs are accepted, so this can&apos;t be used to make the server fetch arbitrary
                            addresses.
                        </p>
                    </div>
                </section>

                <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-4">
                    <h2 className="text-2xl font-title flex items-center">Third parties</h2>
                    <div className="space-y-3 leading-relaxed">
                        <p>
                            Loading any page necessarily reveals your IP address and browser details to the
                            services that serve it. The full list for this site:
                        </p>
                        <ul className="list-disc list-outside pl-5 space-y-2">
                            <li>
                                <strong>Vercel</strong> — hosting. Serves the site and keeps standard
                                request logs.
                            </li>
                            <li>
                                <strong>Vercel Web Analytics</strong> — aggregate page-view counts. It is
                                cookieless and does not track visitors across sites or build individual
                                profiles.
                            </li>
                            <li>
                                <strong>Scryfall</strong> — card images and set symbols load directly from
                                Scryfall&apos;s CDN, so your browser requests them from Scryfall.
                            </li>
                            <li>
                                <strong>Google Fonts</strong> — the heading typeface is loaded from
                                Google&apos;s font CDN.
                            </li>
                            <li>
                                <strong>MTGGoldfish</strong> — contacted only when you paste a deck link,
                                and contacted by the server rather than your browser.
                            </li>
                            <li>
                                <strong>PayPal</strong> — only if you choose to follow the donation link.
                                Nothing is sent to PayPal unless you click it.
                            </li>
                        </ul>
                        <p>
                            Each of these operates under its own privacy policy, which governs what it does
                            with the requests it receives.
                        </p>
                    </div>
                </section>

                <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-4">
                    <h2 className="text-2xl font-title flex items-center">Children and changes</h2>
                    <div className="space-y-3 leading-relaxed">
                        <p>
                            This site is not directed at children and deliberately collects no personal
                            information from anyone, regardless of age.
                        </p>
                        <p>
                            If the data flow ever changes — a new third-party script, anything retained
                            server-side — this page gets updated in the same change that introduces it. The
                            site is open source, so the actual behaviour can be checked against these
                            claims at any time on{" "}
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
                    </div>
                </section>
            </main>
        </div>
    );
}
