import PageHeader from "../components/PageHeader";
import { isAuthConfigured } from "@/lib/authConfig";

export const metadata = {
    title: "Privacy — MTG Planning App",
    description:
        "What this site stores, what it sends, and which third parties are involved. No tracking, no ads, and an optional account you can delete yourself.",
};

/**
 * Written against what the code actually does rather than from a template.
 * If the data flow changes — new third-party script, anything else persisted
 * server-side, a new cookie — this page needs updating in the same change.
 *
 * The account sections render only where sign-in is actually configured, so a
 * deployment without Google credentials doesn't describe features it does not
 * have.
 */
export default function PrivacyPage() {
    const accounts = isAuthConfigured();

    return (
        <div className="px-3 sm:px-6 pt-8">
            <main className="max-w-5xl mx-auto py-10 px-3 sm:px-6 space-y-10 text-ink">
                <PageHeader
                    title="Privacy"
                    subtitle="No ads, no tracking, no data sold. An account is optional, and you can delete it yourself."
                    art="/art/banner-rotation.svg"
                />

                <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-4">
                    <h2 className="text-2xl font-title flex items-center">The short version</h2>
                    <ul className="list-disc list-outside pl-5 space-y-2 leading-relaxed">
                        <li>
                            Every tool works without an account. Signing in is optional and only adds
                            somewhere to save your work.
                        </li>
                        <li>
                            Without an account, nothing you type is stored anywhere but your own browser.
                        </li>
                        <li>No advertising, no ad networks, no cross-site tracking, and no data is sold.</li>
                        <li>
                            Decklists you submit are used to produce a result and then discarded — they are
                            never written to a database or a log.
                        </li>
                        {accounts && (
                            <li>
                                If you do sign in, you can delete your account and everything saved with it
                                from your profile page, immediately and without asking anyone.
                            </li>
                        )}
                    </ul>
                </section>

                <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-4">
                    <h2 className="text-2xl font-title flex items-center">What&apos;s stored on your device</h2>
                    <div className="space-y-3 leading-relaxed">
                        <p>
                            Two things are saved in your browser&apos;s{" "}
                            <code className="px-1 rounded bg-parchment">localStorage</code> so you don&apos;t
                            have to re-enter them next visit: the collection you paste into the Pack Planner
                            (under <code className="px-1 rounded bg-parchment">mtgpp:collection</code>), and
                            the decklist, format and matchup plans you build in the Sideboard Planner (under{" "}
                            <code className="px-1 rounded bg-parchment">mtgpp:sideboard</code>).
                        </p>
                        <p>
                            That data stays on your device. It is not tied to any identifier, and this site
                            cannot read it on any other device. Clearing it is immediate: use the{" "}
                            <strong>Clear</strong> button next to the collection box, or{" "}
                            <strong>Clear All</strong> in the Sideboard Planner, or clear site data in your
                            browser.
                        </p>
                    </div>
                </section>

                {accounts && (
                    <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-4">
                        <h2 className="text-2xl font-title flex items-center">If you sign in</h2>
                        <div className="space-y-3 leading-relaxed">
                            <p>
                                Signing in is entirely optional. It exists so your work can follow you to
                                another device, and nothing about the tools changes if you never use it.
                            </p>
                            <p>
                                Sign-in is handled by Google. This site never sees your Google password — Google
                                confirms who you are and returns a small amount of profile information.
                            </p>

                            <p className="font-semibold pt-1">What is stored about you</p>
                            <ul className="list-disc list-outside pl-5 space-y-2">
                                <li>
                                    <strong>Your Google account identifier, email address, display name and
                                    avatar URL.</strong> The identifier is what links your saved work to you;
                                    the rest is so the site can show who is signed in.
                                </li>
                                <li>
                                    <strong>Whatever you explicitly save.</strong> That means sideboard guides
                                    (the decklist, format and matchup plans), collections (the text you pasted,
                                    kept verbatim), and comparisons (the decklists, collection and mode you
                                    ran). Nothing is saved automatically — pressing a Save button is the only
                                    way anything reaches the server for storage.
                                </li>
                                <li>
                                    <strong>Results are never stored.</strong> A saved comparison keeps only
                                    what you entered, not the prices or wildcard counts it produced. Those
                                    change over time, so opening one re-runs it against current data rather
                                    than showing you a stale answer.
                                </li>
                            </ul>

                            <p className="font-semibold pt-1">Cookies</p>
                            <p>
                                Signing in sets one cookie: a session cookie holding a signed token that says
                                you are logged in. It is not used for advertising or tracking, and it is the
                                only cookie this site sets. Signing out clears it. If you never sign in, the
                                site sets no cookies at all.
                            </p>

                            <p className="font-semibold pt-1">Deleting it</p>
                            <p>
                                Your profile page has a <strong>Delete my account and saved data</strong>{" "}
                                button. It removes everything you have saved and your stored account details
                                straight away — no request, no waiting, no email to write. You can also delete
                                any individual guide, collection or comparison. Signing out on its own does
                                not delete anything.
                            </p>
                        </div>
                    </section>
                )}

                <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-4">
                    <h2 className="text-2xl font-title flex items-center">What gets sent to the server</h2>
                    <div className="space-y-3 leading-relaxed">
                        <p>
                            To compare a deck against your collection, the text you&apos;ve entered has to reach
                            the server that does the matching. When you press Analyze or Check Rotation, your
                            decklists — and, in the Pack Planner, your collection text — are sent to this
                            site&apos;s own API so the comparison can be computed.
                        </p>
                        <p>
                            That text is used to build the response and then discarded. It is not saved to a
                            database, not written to a file, and not recorded in an application log. It is not
                            sold, shared, or used to build a profile.
                        </p>
                        <p>
                            If you paste an MTGGoldfish deck link, the server fetches that page on your behalf
                            so your browser doesn&apos;t have to. Only{" "}
                            <code className="px-1 rounded bg-parchment">mtggoldfish.com</code> URLs are
                            accepted, so this can&apos;t be used to make the server fetch arbitrary addresses.
                        </p>
                        <p>
                            The Sideboard Planner does its work in your browser: splitting your decklist and
                            building your matchup plans never involves the server.
                            {accounts
                                ? " It reaches the server only when you import a deck link, load the current metagame, or press Save to Profile."
                                : " It reaches the server only when you import a deck link or load the current metagame."}
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
                                <strong>Vercel</strong> — hosting. Serves the site and keeps standard request
                                logs.
                            </li>
                            <li>
                                <strong>Vercel Web Analytics</strong> — aggregate page-view counts. Cookieless;
                                it does not track visitors across sites or build individual profiles.
                            </li>
                            <li>
                                <strong>Scryfall</strong> — card images and set symbols load directly from
                                Scryfall&apos;s CDN, so your browser requests them from Scryfall.
                            </li>
                            <li>
                                <strong>Google Fonts</strong> — the heading typeface is loaded from Google&apos;s
                                font CDN.
                            </li>
                            <li>
                                <strong>MTGGoldfish</strong> — contacted when you paste a deck link, and when the
                                Sideboard Planner loads the current metagame for a format. Both requests are made
                                by the server rather than your browser, and neither sends anything about you.
                            </li>
                            {accounts && (
                                <>
                                    <li>
                                        <strong>Google (sign-in)</strong> — only if you choose to sign in. Google
                                        handles the login and tells this site your account identifier, email, name
                                        and avatar.
                                    </li>
                                    <li>
                                        <strong>Neon</strong> — the hosted Postgres database where saved accounts
                                        and guides live. Only used if you sign in and save something.
                                    </li>
                                </>
                            )}
                            <li>
                                <strong>PayPal</strong> — only if you choose to follow the donation link. Nothing
                                is sent to PayPal unless you click it.
                            </li>
                        </ul>
                        <p>
                            Each of these operates under its own privacy policy, which governs what it does with
                            the requests it receives.
                        </p>
                    </div>
                </section>

                <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-4">
                    <h2 className="text-2xl font-title flex items-center">Children and changes</h2>
                    <div className="space-y-3 leading-relaxed">
                        <p>
                            This site is not directed at children and collects no personal information from
                            anyone beyond what is described above.
                        </p>
                        <p>
                            If the data flow changes again, this page gets updated in the same change that
                            introduces it. The site is open source, so the actual behaviour can be checked
                            against these claims at any time on{" "}
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
