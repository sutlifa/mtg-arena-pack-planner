import PageHeader from "../components/PageHeader";

export const metadata = {
    title: "Report an Issue — MTG Card Acquiring Tool",
    description:
        "Found a wrong price, a card marked unavailable that isn't, or something broken? Here's how to report it.",
};

const REPO = "https://github.com/sutlifa/mtg-arena-pack-planner";

/** Builds a GitHub "new issue" URL with the title and body prefilled. */
function newIssueUrl(title: string, body: string) {
    return `${REPO}/issues/new?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
}

const BUG_BODY = `**What happened**


**What you expected instead**


**Steps to reproduce**
1.
2.

**Decklist used** (paste the exact list, if relevant)
\`\`\`

\`\`\`

**Mode:** Arena / Paper
**Browser and device:**
`;

const CARD_BODY = `**Card name**


**What's wrong** (wrong price, wrong set, marked unavailable on Arena but isn't, wrong rotation status, etc.)


**What it should say, and how you know**
(A Scryfall link for the printing is the most useful thing here.)


**Mode:** Arena / Paper
`;

const IDEA_BODY = `**What you'd like the tool to do**


**What problem that would solve for you**
`;

const OPTIONS = [
    {
        title: "Something is broken",
        blurb:
            "A page errors, a button does nothing, results look wrong or fail to load.",
        cta: "Report a bug",
        href: newIssueUrl("[Bug] ", BUG_BODY),
    },
    {
        title: "A card looks wrong",
        blurb:
            "Wrong price or set, a card marked unavailable on Arena that isn't, or an incorrect rotation verdict.",
        cta: "Report a card issue",
        href: newIssueUrl("[Card data] ", CARD_BODY),
    },
    {
        title: "An idea or request",
        blurb: "Something the tool doesn't do yet that would make it more useful.",
        cta: "Suggest a feature",
        href: newIssueUrl("[Idea] ", IDEA_BODY),
    },
];

export default function ReportPage() {
    return (
        <div className="px-6 pt-8">
            <main className="max-w-5xl mx-auto py-10 px-6 space-y-10 text-ink">
                <PageHeader
                    title="Report an Issue"
                    subtitle="Bug reports and corrections are genuinely welcome — especially card data that looks wrong, since that's the hardest kind to catch from the inside."
                    art="/art/banner-planner.svg"
                />

                <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-5">
                    <h2 className="text-2xl font-title flex items-center">Pick the closest match</h2>
                    <p className="leading-relaxed">
                        Each link opens a new GitHub issue with the useful questions already filled in —
                        you just replace the blanks. A free GitHub account is needed to post one.
                    </p>

                    <div className="space-y-3">
                        {OPTIONS.map((o) => (
                            <div
                                key={o.title}
                                className="bg-parchment rounded shadow-inner-parchment p-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between"
                            >
                                <div className="min-w-0">
                                    <p className="font-title text-lg">{o.title}</p>
                                    <p className="text-sm text-ink/75 leading-relaxed">{o.blurb}</p>
                                </div>
                                <a
                                    href={o.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="shrink-0 px-4 py-2 rounded font-title bg-brand text-midnight-light hover:bg-brand-dark transition-colors text-center"
                                >
                                    {o.cta}
                                </a>
                            </div>
                        ))}
                    </div>
                </section>

                <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-4">
                    <h2 className="text-2xl font-title flex items-center">What makes a report useful</h2>
                    <div className="space-y-3 leading-relaxed">
                        <p>
                            The single most helpful thing is <strong>the exact decklist text you pasted</strong>.
                            Most bugs here come from a specific card&apos;s printings rather than from the page
                            itself, and without the list there&apos;s usually no way to reproduce the problem.
                        </p>
                        <p>Also worth including, when they apply:</p>
                        <ul className="list-disc list-outside pl-5 space-y-2">
                            <li>Whether you were in <strong>Arena Mode</strong> or <strong>Paper Mode</strong> — they use different printings and follow different rules.</li>
                            <li>For a card that looks wrong, a <strong>Scryfall link to the printing</strong> you expected. That settles most disagreements immediately.</li>
                            <li>Your browser and whether you&apos;re on desktop or mobile, for anything layout-related.</li>
                        </ul>
                        <p className="text-sm text-ink/75">
                            Please don&apos;t include personal details in a report — issues are public, and
                            nothing about you is needed to fix a card price.
                        </p>
                    </div>
                </section>

                <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-4">
                    <h2 className="text-2xl font-title flex items-center">Known limits</h2>
                    <div className="space-y-3 leading-relaxed">
                        <p>
                            A few things are working as intended, so they&apos;re worth ruling out first:
                        </p>
                        <ul className="list-disc list-outside pl-5 space-y-2">
                            <li>
                                <strong>Prices are daily estimates</strong> from Scryfall&apos;s market data, not
                                live quotes. A figure differing from a specific TCGPlayer listing is expected.
                            </li>
                            <li>
                                <strong>Some cards genuinely don&apos;t exist on Arena.</strong> Those are flagged
                                and left out of wildcard totals on purpose.
                            </li>
                            <li>
                                <strong>Basic lands are excluded</strong> from wildcard counts and from the
                                rotation checker, since Arena grants them free and they never rotate.
                            </li>
                        </ul>
                        <p>
                            If you&apos;ve checked those and it still looks wrong, it probably is — please do
                            report it. You can also browse{" "}
                            <a
                                href={`${REPO}/issues`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-brand underline underline-offset-2 hover:text-brand-dark"
                            >
                                existing issues
                            </a>{" "}
                            to see if it&apos;s already known.
                        </p>
                    </div>
                </section>
            </main>
        </div>
    );
}
