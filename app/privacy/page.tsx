import { Fragment } from "react";
import Link from "next/link";
import PageHeader from "../components/PageHeader";
import { isAuthConfigured } from "@/lib/authConfig";

export const metadata = {
    title: "Privacy — MTG Planning App",
    description:
        "What this site stores, what it sends, and which third parties are involved. No ads, no cross-site tracking, no data sold.",
};

/**
 * Bump this in the same change as any edit to what the page says. It is a
 * hand-maintained constant on purpose: a build timestamp would move on every
 * deploy and claim the policy changed when it didn't, which makes the date
 * meaningless to anyone checking whether something is new.
 */
const LAST_UPDATED = "September 24, 2026";

/**
 * A cookie name that wraps only where a reader would expect it to.
 *
 * inline-block keeps the name in one piece when it fits: if it doesn't fit in
 * what is left of the line, the whole box moves to the next one rather than
 * the browser splitting it at the first hyphen, which cuts "__Secure-" off and
 * makes one name look like two. max-w-full then caps the box at the column
 * width, so a name wider than the whole column wraps inside its box instead of
 * pushing the page sideways.
 *
 * Where it wraps is controlled by <wbr />: after the "__Secure-"/"__Host-"
 * prefix and after each dot, so it only ever breaks between the parts of the
 * name. That is why this is not break-all, which broke mid-word ("…session-
 * toke" / "n") at 375px, where the list column is about 259px. 0.85em lets
 * __Secure-authjs.session-token fit that column on one line;
 * __Secure-authjs.pkce.code_verifier still can't, and wraps after a dot.
 */
function CookieName({ name }: { name: string }) {
    const parts = name.match(/__(?:Secure|Host)-|[^.]*\.|[^.]+$/g) ?? [name];
    return (
        <code className="inline-block max-w-full text-[0.85em] px-1 rounded bg-parchment">
            {parts.map((part, i) => (
                <Fragment key={i}>
                    {i > 0 && <wbr />}
                    {part}
                </Fragment>
            ))}
        </code>
    );
}

/**
 * Written against what the code actually does rather than from a template.
 * If the data flow changes — new third-party script, anything else persisted
 * server-side, a new cookie — this page needs updating in the same change.
 *
 * The account sections render only where sign-in is actually configured, so a
 * deployment without Google credentials doesn't describe features it does not
 * have. That includes the subtitle. The metadata description can't follow
 * isAuthConfigured() — `metadata` is a static export — so it says only what is
 * true either way.
 *
 * Two claims here were once wrong in ways that are easy to reintroduce:
 *
 * - "No cookies unless you sign in." SessionProvider (Providers.tsx) calls
 *   /api/auth/session on every page load for every visitor, and Auth.js's
 *   init sets its CSRF and callback-url cookies on that call whether or not
 *   anyone is signed in. The cookie names below are @auth/core's defaults
 *   (lib/utils/cookie.js) with the __Secure-/__Host- prefixes it adds on
 *   HTTPS. With auth off, Providers skips SessionProvider entirely and
 *   nothing else in the app sets a cookie, so that branch really is none.
 *
 * - "No tracking." <Analytics /> in the root layout sends a per-page-view
 *   event. It is cookieless and not cross-site, but it is not nothing, so
 *   the page says what it sends instead of waving it away.
 */
export default function PrivacyPage() {
    const accounts = isAuthConfigured();

    return (
        <div className="px-3 sm:px-6 pt-8">
            <main className="max-w-5xl mx-auto py-10 px-3 sm:px-6 space-y-10 text-ink">
                <PageHeader
                    title="Privacy"
                    subtitle={
                        accounts
                            ? "No ads, no cross-site tracking, no data sold. An account is optional, and you can delete it yourself."
                            : "No ads, no cross-site tracking, no data sold, and no account to sign up for."
                    }
                    art="/art/banner-rotation.svg"
                />

                <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-4">
                    <h2 className="text-2xl font-title flex items-center">The short version</h2>
                    <p className="text-sm text-ink/60">Last updated: {LAST_UPDATED}</p>
                    <ul className="list-disc list-outside pl-5 space-y-2 leading-relaxed">
                        {accounts ? (
                            <li>
                                Every tool works without an account. Signing in is optional and only adds
                                somewhere to save your work.
                            </li>
                        ) : (
                            // No Google credentials on this deployment: /signin and
                            // /profile 404, so don't describe signing in at all.
                            <li>Every tool works without an account, and there is nothing to sign up for.</li>
                        )}
                        <li>
                            {accounts ? "Unless you sign in and save something, the" : "The"} app keeps
                            nothing you type anywhere but your own browser. The one caveat is card-name
                            suggestions on the Collection page, which pass through the host&apos;s standard
                            request logs, as explained below.
                        </li>
                        <li>
                            No advertising, no ad networks, no cross-site tracking, and no data is sold.
                            Page views are counted with Vercel&apos;s cookieless analytics.
                        </li>
                        {accounts ? (
                            <li>
                                The only cookies are the ones sign-in needs to work. Two of them are set
                                for every visitor, signed in or not; none of them tracks you.
                            </li>
                        ) : (
                            <li>This site sets no cookies.</li>
                        )}
                        <li>
                            Decklists you submit are used to produce a result and then discarded — they are
                            never written to a database or a log
                            {accounts ? ", unless you're signed in and press Save" : ""}.
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
                            A few things are saved in your browser&apos;s{" "}
                            <code className="px-1 rounded bg-parchment">localStorage</code> so you don&apos;t
                            have to re-enter them next visit: the collection shared by the Pack Planner and
                            the Collection page (under{" "}
                            <code className="px-1 rounded bg-parchment">mtgpp:collection</code>), whether
                            you&apos;re working in Arena or Paper mode (
                            <code className="px-1 rounded bg-parchment">mtgpp:collection-mode</code>),
                            {accounts ? (
                                <>
                                    {" "}which saved collection it was opened from, if any, so Save updates
                                    that one (
                                    <code className="px-1 rounded bg-parchment">mtgpp:collection-open</code>
                                    ),
                                </>
                            ) : null}{" "}
                            and the decklist, format and matchup plans you build in the Sideboard Planner
                            (under <code className="px-1 rounded bg-parchment">mtgpp:sideboard</code>).
                        </p>
                        <p>
                            That data stays on your device. It is not tied to any identifier, and this site
                            cannot read it on any other device. Clearing it is immediate: the{" "}
                            <strong>Clear</strong> button next to the Pack Planner&apos;s collection box, or{" "}
                            <strong>Start Over</strong> in the Pack Planner, Collection page or Sideboard
                            Planner, empties what you entered. Clearing site data in your browser removes
                            all of it, including which mode and format you last used.
                        </p>
                    </div>
                </section>

                <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-4">
                    <h2 className="text-2xl font-title flex items-center">Cookies</h2>
                    {accounts ? (
                        <div className="space-y-3 leading-relaxed">
                            <p>
                                Every cookie this site sets is there to make signing in work. None of them
                                identifies you to anyone else, follows you to other sites, or is used for
                                advertising or analytics, and all of them are marked so that scripts on the
                                page cannot read them.
                            </p>
                            <ul className="list-disc list-outside pl-5 space-y-2">
                                <li>
                                    <strong>For every visitor, signed in or not.</strong> When a page loads,
                                    it checks in the background whether you&apos;re signed in — that&apos;s how the menu
                                    knows whether to show &quot;Sign in&quot; or your name — and the first
                                    such check sets two cookies.{" "}
                                    <CookieName name="__Host-authjs.csrf-token" />{" "}
                                    is a random value that stops other websites from submitting sign-in or
                                    sign-out requests on your behalf.{" "}
                                    <CookieName name="__Secure-authjs.callback-url" />{" "}
                                    holds the page on this site to send you back to after signing in or out.
                                    Neither contains anything about you, and neither has an expiry date, so
                                    your browser normally discards both when it closes.
                                </li>
                                <li>
                                    <strong>While you sign in.</strong>{" "}
                                    <CookieName name="__Secure-authjs.pkce.code_verifier" />{" "}
                                    is a one-time secret that proves the answer coming back from Google
                                    belongs to the sign-in you started. It is deleted as soon as sign-in
                                    finishes, and expires after 15 minutes regardless.
                                </li>
                                <li>
                                    <strong>While you&apos;re signed in.</strong>{" "}
                                    <CookieName name="__Secure-authjs.session-token" />{" "}
                                    is an encrypted token saying who you are signed in as: your account
                                    identifier, name, email address and avatar address. It expires 30 days
                                    after your last visit, and signing out deletes it.
                                </li>
                            </ul>
                        </div>
                    ) : (
                        // Verified, not assumed: with auth off, Providers.tsx never
                        // mounts SessionProvider, so /api/auth is never called, and
                        // no route or component in the app sets a cookie of its own.
                        <p className="leading-relaxed">
                            This site sets no cookies. The page-view analytics described below is
                            cookieless too.
                        </p>
                    )}
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

                            {/* Mirrors lib/db/schema.sql column for column. /signin and
                                /profile's "Your Data" summarise the same list; change all
                                three together. */}
                            <p className="font-semibold pt-1">What is stored about you</p>
                            <ul className="list-disc list-outside pl-5 space-y-2">
                                <li>
                                    <strong>Your Google account identifier, email address, display name and
                                    avatar URL, and the date your account was created.</strong> These are
                                    recorded the first time you sign in, whether or not you ever save
                                    anything, and the email, name and avatar are refreshed from Google each
                                    time you sign in again. The identifier is what links your saved work to
                                    you; the rest is so the site can show who is signed in.
                                </li>
                                <li>
                                    <strong>Whatever you explicitly save.</strong> That means sideboard guides
                                    (the decklist, format and matchup plans), collections, and comparisons (the
                                    decklists, collection and mode you ran), each with the name you gave it and
                                    when it was created and last changed. A collection — saved on its own or
                                    as part of a comparison — is stored tidied rather than exactly as you pasted
                                    it: one line per card with its count, copies across printings added
                                    together, set codes, collector numbers and foil markers removed, and the
                                    lines sorted alphabetically. Nothing is saved automatically — something is
                                    stored only when you press Save, or rename or duplicate something you
                                    already saved.
                                </li>
                                <li>
                                    <strong>Results are never stored.</strong> A saved comparison keeps only
                                    what you entered, not the prices or wildcard counts it produced. Those
                                    change over time, so opening one re-runs it against current data rather
                                    than showing you a stale answer.
                                </li>
                            </ul>

                            <p className="font-semibold pt-1">Deleting it</p>
                            <p>
                                Your profile page has a <strong>Delete my account and saved data</strong>{" "}
                                button. It removes everything you have saved and your stored account details
                                from the site&apos;s database straight away — no request, no waiting, no email
                                to write. You can also delete any individual guide, collection or comparison.
                                Signing out on its own does not delete anything.
                            </p>
                            {/* No retention figures on purpose: they depend on the Neon
                                plan and Vercel's log settings, neither of which is in
                                this repo, and a wrong number is worse than none.

                                The test-copy sentence is worded no stronger than
                                .github/workflows/cleanup-neon-branch.yml: the Vercel-Neon
                                integration never deletes its preview branches, the workflow
                                deletes one only when its pull request closes, and anything
                                else waits for a manual workflow_dispatch sweep. Don't
                                promise automatic cleanup the workflow doesn't do. */}
                            <p>
                                Copies made by the hosting providers can outlast that for a limited time,
                                under their own retention rules. The database host keeps a short restore
                                history. Test copies of the database, made when a new version of the site
                                is being tried out, are deleted by a cleanup job once that work is merged
                                or closed, and any it misses are swept by hand. The web host&apos;s request
                                logs expire on their own schedule.
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
                            That text is used to build the response and then discarded. Running a comparison
                            or a rotation check does not save it to a database, write it to a file, or record
                            it in an application log
                            {accounts
                                ? " — it reaches the database only if you're signed in and separately press Save, as described above"
                                : ""}
                            . It is not sold, shared, or used to build a profile.
                        </p>
                        <p>
                            If you paste an MTGGoldfish deck link, the server fetches that page on your behalf
                            so your browser doesn&apos;t have to. Only{" "}
                            <code className="px-1 rounded bg-parchment">mtggoldfish.com</code> URLs are
                            accepted, so this can&apos;t be used to make the server fetch arbitrary addresses.
                        </p>
                        {/*
                          * card-search is the only request whose web address carries
                          * something the user typed (a GET with ?q=); everything else
                          * that carries user text is a POST body. That is why it is the
                          * single caveat in the short version.
                          */}
                        <p>
                            The Collection page asks the server for card-name suggestions as you type into
                            its add box, and for the pictures of the cards on the page you&apos;re looking
                            at. Those requests carry only what you typed or the card names, and the app
                            keeps none of it — though a suggestion request puts what you typed in its web
                            address, so it appears in Vercel&apos;s standard request logs like any other
                            address.
                        </p>
                        {/*
                          * Written against SideboardPlanner's `reference` effect and
                          * OpponentDeck's lazy loading, which fetch without a click. An
                          * earlier "only when you ask" was wrong on both counts; if either
                          * stops being automatic, loosen this, don't just leave it.
                          */}
                        <p>
                            The Sideboard Planner does its work in your browser: splitting your decklist and
                            building your matchup plans never involves the server. It does contact the
                            server — sending a link, a format, or card names, not your deck — when you
                            import a deck link or pull the current metagame, and on its own in two cases.
                            Whenever your guide has matchups, it fetches the format&apos;s metagame list in
                            the background, to match each matchup to an archetype. And each
                            opponent&apos;s list, with its card pictures, loads automatically as its
                            matchup scrolls near on a wide screen, or when you open &quot;Show their
                            list&quot; on a narrower one.
                        </p>
                        {accounts && (
                            <p>
                                While you&apos;re signed in, a few requests read or change your own saved
                                work: the Pack Planner fetches the list of your saved collections and
                                comparisons when it opens, so they&apos;re ready to load; opening a saved
                                guide, collection or comparison fetches it; and pressing Save, renaming a
                                guide, duplicating or deleting anything sends that change.
                            </p>
                        )}
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
                            {/* What @vercel/analytics records per view, per Vercel's docs.
                                The query strings on this site's pages are only saved-item
                                ids (?guide=, ?collection=, ?analysis=) and /signin's
                                ?callbackUrl= path — never anything typed. With auth off
                                none of those links exist (/profile and /signin 404), so
                                that branch says only what is true either way. */}
                            <li>
                                <strong>Vercel Web Analytics</strong> — records each page view: the page&apos;s
                                address (including anything after a &quot;?&quot;, which on this site
                                {accounts
                                    ? " is at most the number of a saved item you opened or the page to return to after signing in"
                                    : " never contains anything personal"}
                                ), the page you came from, and the time. From the request, Vercel
                                works out your country, browser, operating system and device type, and counts
                                unique visitors with a code derived from the request that changes every day,
                                rather than with a cookie. It does not track you across other sites, and it is
                                used only to see which pages get used.
                            </li>
                            <li>
                                <strong>Scryfall</strong> — card images and set symbols load directly from
                                Scryfall&apos;s CDN, so your browser requests them from Scryfall.
                            </li>
                            <li>
                                <strong>Google Fonts</strong> — the heading typeface is loaded from Google&apos;s
                                servers (<code className="px-1 rounded bg-parchment">fonts.googleapis.com</code>{" "}
                                and <code className="px-1 rounded bg-parchment">fonts.gstatic.com</code>) on
                                every page, so Google receives your IP address, browser details and the
                                address of this site, whether or not you have a Google account.
                            </li>
                            <li>
                                <strong>MTGGoldfish</strong> — contacted when a deck link you entered is
                                imported, and by the Sideboard Planner for the current metagame and for
                                opponents&apos; lists, including the automatic fetches described above.
                                These requests are made by the server rather than your browser, and none of
                                them sends anything about you.
                            </li>
                            {accounts && (
                                <>
                                    <li>
                                        <strong>Google (sign-in)</strong> — only if you choose to sign in. Google
                                        handles the login and tells this site your account identifier, email, name
                                        and avatar. While you&apos;re signed in, your avatar picture in the menu
                                        loads directly from Google&apos;s servers on every page, so Google sees
                                        those requests, including your IP address, browser details and the address
                                        of this site.
                                    </li>
                                    <li>
                                        <strong>Neon</strong> — the hosted Postgres database where accounts and
                                        saved guides, collections and comparisons live. Used from your first
                                        sign-in, when your account details are recorded, and for anything you
                                        save.
                                    </li>
                                </>
                            )}
                            <li>
                                <strong>GitHub</strong> — hosts the site&apos;s source code, and the Report an
                                Issue page files reports there. Nothing is sent to GitHub unless you follow a
                                link to it; anything you post in an issue is public.
                            </li>
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

                {/* No email address on purpose: the user chose /report (GitHub
                    Issues) as the only contact route, and the page must not
                    publish one. */}
                <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-4">
                    <h2 className="text-2xl font-title flex items-center">Questions or requests</h2>
                    <div className="space-y-3 leading-relaxed">
                        <p>
                            For a question about this page or how the site handles your data, use the{" "}
                            <Link
                                href="/report"
                                className="text-brand underline underline-offset-2 hover:text-brand-dark"
                            >
                                Report an Issue
                            </Link>{" "}
                            page, which opens an issue on GitHub. Issues are public, so please don&apos;t
                            include personal details such as your email address.
                        </p>
                        {accounts && (
                            <p>
                                You don&apos;t need to ask to have your data removed: the delete button on
                                your profile page does it, immediately.
                            </p>
                        )}
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
                            introduces it, along with the date at the top. The site is open source, so the
                            actual behaviour can be checked against these claims at any time on{" "}
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
