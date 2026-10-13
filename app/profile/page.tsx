import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { listGuides } from "@/lib/guides";
import { listCollections, listAnalyses } from "@/lib/saved";
import { listDecks } from "@/lib/decks";
import { deckFormatLabel } from "@/lib/deckText";
import { hasDatabase } from "@/lib/db";
import { isAuthConfigured } from "@/lib/authConfig";
import PageHeader from "../components/PageHeader";
import {
    DeleteGuideButton,
    DeleteAccountButton,
    DeleteSavedButton,
    DuplicateSavedButton,
} from "../components/ProfileActions";

export const metadata = {
    title: "Your Profile — MTG Planning App",
    description: "Decks, sideboard guides, collections and comparisons you've saved.",
};

function formatDate(value: string | Date): string {
    return new Date(value).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

export default async function ProfilePage() {
    if (!isAuthConfigured()) notFound();

    const session = await auth();

    if (!session?.user) {
        redirect("/signin?callbackUrl=%2Fprofile");
    }

    const uid = session.user.id;
    const ready = hasDatabase && uid;

    // One round trip rather than four sequential ones.
    const [decks, guides, collections, analyses] = ready
        ? await Promise.all([listDecks(uid), listGuides(uid), listCollections(uid), listAnalyses(uid)])
        : [[], [], [], []];

    return (
        <div className="px-3 sm:px-6 pt-8">
            <main className="max-w-5xl mx-auto py-10 px-3 sm:px-6 space-y-10 text-ink">
                <PageHeader
                    title="Your Profile"
                    subtitle={`Signed in as ${session.user.email ?? session.user.name ?? "you"}.`}
                    art="/art/banner-planner.svg"
                />

                <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-4">
                    <h2 className="text-2xl font-title flex items-center">Saved Decks</h2>

                    {decks.length === 0 ? (
                        <p className="text-ink/75 leading-relaxed">
                            Nothing saved yet. Paste a list on the{" "}
                            <Link
                                href="/decks"
                                className="text-brand underline underline-offset-2 hover:text-brand-dark"
                            >
                                Decks
                            </Link>{" "}
                            page and press <strong>Save deck</strong>.
                        </p>
                    ) : (
                        <>
                            <ul className="space-y-2">
                                {decks.map((d) => (
                                    <li
                                        key={d.id}
                                        className="flex flex-wrap items-center justify-between gap-3 bg-parchment rounded shadow-inner-parchment p-4"
                                    >
                                        <div className="min-w-0">
                                            <p className="font-title text-lg truncate">{d.name}</p>
                                            <p className="text-sm text-ink/60">
                                                {d.format ? `${deckFormatLabel(d.format)} · ` : ""}
                                                {d.main} main{d.side ? ` + ${d.side} sideboard` : ""} ·
                                                updated {formatDate(d.updated_at)}
                                            </p>
                                        </div>
                                        {/* Five actions: wraps onto further lines on a
                                            phone rather than widening the row, like
                                            the lists below. */}
                                        <div className="flex flex-wrap items-center gap-1">
                                            <Link
                                                href={`/decks?deck=${d.id}`}
                                                className="px-4 py-2 rounded font-title bg-brand text-midnight-light hover:bg-brand-dark transition-colors"
                                            >
                                                Open
                                            </Link>
                                            <Link
                                                href={`/deck-check?deck=${d.id}`}
                                                className="px-3 py-2 rounded text-sm font-title bg-parchment-dark text-ink hover:bg-brass/20 transition-colors"
                                            >
                                                Check in Deck Check
                                            </Link>
                                            <Link
                                                href={`/sideboard?deck=${d.id}`}
                                                className="px-3 py-2 rounded text-sm font-title bg-parchment-dark text-ink hover:bg-brass/20 transition-colors"
                                            >
                                                Sideboard guide
                                            </Link>
                                            <DuplicateSavedButton kind="decks" id={d.id} />
                                            <DeleteSavedButton kind="decks" id={d.id} name={d.name} />
                                        </div>
                                    </li>
                                ))}
                            </ul>
                            <p className="text-xs text-ink/55 leading-relaxed">
                                Open edits the deck on the Decks page. Check in Deck Check shows what
                                you&apos;re missing and what it costs, against your collection, straight
                                away; Sideboard guide loads it into the Sideboard Planner, asking first
                                if a guide is already there.
                            </p>
                        </>
                    )}
                </section>

                <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-4">
                    <h2 className="text-2xl font-title flex items-center">Saved Sideboard Guides</h2>

                    {!hasDatabase ? (
                        <p className="text-amber-700 text-sm">
                            Saving isn&apos;t configured on this deployment yet.
                        </p>
                    ) : guides.length === 0 ? (
                        <p className="text-ink/75 leading-relaxed">
                            Nothing saved yet. Build a guide in the{" "}
                            <Link
                                href="/sideboard"
                                className="text-brand underline underline-offset-2 hover:text-brand-dark"
                            >
                                Sideboard Planner
                            </Link>{" "}
                            and press <strong>Save to Profile</strong>.
                        </p>
                    ) : (
                        <ul className="space-y-2">
                            {guides.map((g) => (
                                <li
                                    key={g.id}
                                    className="flex flex-wrap items-center justify-between gap-3 bg-parchment rounded shadow-inner-parchment p-4"
                                >
                                    <div className="min-w-0">
                                        <p className="font-title text-lg truncate">{g.name}</p>
                                        <p className="text-sm text-ink/60">
                                            {g.format ? `${g.format} · ` : ""}
                                            {g.matchups} matchup{g.matchups === 1 ? "" : "s"} · updated{" "}
                                            {formatDate(g.updated_at)}
                                        </p>
                                    </div>
                                    {/* No shrink-0, and flex-wrap: the actions shrink
                                        to the row and wrap onto a second line on a
                                        phone instead of pushing the row wider than
                                        the screen. The same on all three lists, so
                                        they line up with each other. */}
                                    <div className="flex flex-wrap items-center gap-1">
                                        <Link
                                            href={`/sideboard?guide=${g.id}`}
                                            className="px-4 py-2 rounded font-title bg-brand text-midnight-light hover:bg-brand-dark transition-colors"
                                        >
                                            Open
                                        </Link>
                                        <DuplicateSavedButton kind="guides" id={g.id} />
                                        <DeleteGuideButton id={g.id} name={g.name} />
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-4">
                    <h2 className="text-2xl font-title flex items-center">Saved Collections</h2>

                    {collections.length === 0 ? (
                        <p className="text-ink/75 leading-relaxed">
                            Nothing saved yet. Build one on the{" "}
                            <Link
                                href="/collection"
                                className="text-brand underline underline-offset-2 hover:text-brand-dark"
                            >
                                Collection
                            </Link>{" "}
                            page and press <strong>Save Collection</strong>, or paste one into{" "}
                            <Link
                                href="/deck-check"
                                className="text-brand underline underline-offset-2 hover:text-brand-dark"
                            >
                                Deck Check
                            </Link>{" "}
                            and press <strong>Save to Collection</strong>.
                        </p>
                    ) : (
                        <div className="space-y-5">
                            {([
                                { title: "Arena", items: collections.filter((c) => c.arena_mode) },
                                { title: "Paper", items: collections.filter((c) => !c.arena_mode) },
                            ] as const).map((group) => (
                                <div key={group.title}>
                                    <p className="text-xs font-semibold uppercase tracking-wider text-ink/60 mb-2">
                                        {group.title} ({group.items.length})
                                    </p>
                                    {group.items.length === 0 ? (
                                        <p className="text-sm text-ink/50">
                                            No {group.title.toLowerCase()} collections saved.
                                        </p>
                                    ) : (
                                        <ul className="space-y-2">
                                            {group.items.map((c) => (
                                                <li
                                                    key={c.id}
                                                    className="flex flex-wrap items-center justify-between gap-3 bg-parchment rounded shadow-inner-parchment p-4"
                                                >
                                                    <div className="min-w-0">
                                                        <p className="font-title text-lg truncate">{c.name}</p>
                                                        <p className="text-sm text-ink/60">
                                                            {c.cards} line{c.cards === 1 ? "" : "s"} · updated{" "}
                                                            {formatDate(c.updated_at)}
                                                        </p>
                                                    </div>
                                                    {/* Four actions come to ~396px, wider than a
                                                        375px phone's row — see the guides list. */}
                                                    <div className="flex flex-wrap items-center gap-1">
                                                        <Link
                                                            href={`/collection?collection=${c.id}`}
                                                            className="px-4 py-2 rounded font-title bg-brand text-midnight-light hover:bg-brand-dark transition-colors"
                                                        >
                                                            Edit
                                                        </Link>
                                                        <Link
                                                            href={`/deck-check?collection=${c.id}`}
                                                            className="px-4 py-2 rounded font-title bg-parchment-dark text-ink hover:bg-brass/20 transition-colors"
                                                        >
                                                            Use in Deck Check
                                                        </Link>
                                                        <DuplicateSavedButton
                                                            kind="collections"
                                                            id={c.id}
                                                        />
                                                        <DeleteSavedButton
                                                            kind="collections"
                                                            id={c.id}
                                                            name={c.name}
                                                        />
                                                    </div>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            ))}
                            <p className="text-xs text-ink/55 leading-relaxed">
                                Arena and paper collections are kept separately, so the same name can exist
                                in both. Edit opens it on the Collection page with a picture of every card;
                                Use in Deck Check checks your decks against it there, in its mode, without
                                changing the collection on your Collection page.
                            </p>
                        </div>
                    )}
                </section>

                <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-4">
                    <h2 className="text-2xl font-title flex items-center">Saved Comparisons</h2>

                    {analyses.length === 0 ? (
                        <p className="text-ink/75 leading-relaxed">
                            Nothing saved yet. Check some decks in{" "}
                            <Link
                                href="/deck-check"
                                className="text-brand underline underline-offset-2 hover:text-brand-dark"
                            >
                                Deck Check
                            </Link>{" "}
                            and press <strong>Save Comparison</strong>.
                        </p>
                    ) : (
                        <>
                            <ul className="space-y-2">
                                {analyses.map((a) => (
                                    <li
                                        key={a.id}
                                        className="flex flex-wrap items-center justify-between gap-3 bg-parchment rounded shadow-inner-parchment p-4"
                                    >
                                        <div className="min-w-0">
                                            <p className="font-title text-lg truncate">{a.name}</p>
                                            <p className="text-sm text-ink/60">
                                                {a.arena_mode ? "Arena" : "Paper"} · {a.decks} deck
                                                {a.decks === 1 ? "" : "s"} · updated{" "}
                                                {formatDate(a.updated_at)}
                                            </p>
                                        </div>
                                        {/* Wraps like the guides list above. */}
                                        <div className="flex flex-wrap items-center gap-1">
                                            <Link
                                                href={`/deck-check?analysis=${a.id}`}
                                                className="px-4 py-2 rounded font-title bg-brand text-midnight-light hover:bg-brand-dark transition-colors"
                                            >
                                                Open in Deck Check
                                            </Link>
                                            <DuplicateSavedButton kind="analyses" id={a.id} />
                                            <DeleteSavedButton
                                                kind="analyses"
                                                id={a.id}
                                                name={a.name}
                                            />
                                        </div>
                                    </li>
                                ))}
                            </ul>
                            <p className="text-xs text-ink/55 leading-relaxed">
                                A comparison stores the decklists, collection and mode you checked in Deck
                                Check — not the result. Prices and Arena availability change, so opening one
                                re-runs it against today&apos;s data rather than showing a stale answer.
                            </p>
                        </>
                    )}
                </section>

                <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-3">
                    <h2 className="text-2xl font-title flex items-center">Your Data</h2>
                    <p className="text-ink/75 leading-relaxed">
                        Deleting your account removes your saved decks, guides, collections and comparisons,
                        and your account record: the account ID, name, email and avatar taken from your
                        Google account, and the date it was created. It happens immediately and cannot be
                        undone. Signing out alone does not delete anything.
                    </p>
                    <DeleteAccountButton />
                </section>
            </main>
        </div>
    );
}
