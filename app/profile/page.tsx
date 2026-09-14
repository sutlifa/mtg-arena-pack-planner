import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listGuides } from "@/lib/guides";
import { hasDatabase } from "@/lib/db";
import PageHeader from "../components/PageHeader";

export const metadata = {
    title: "Your Profile — MTG Card Acquiring Tool",
    description: "Sideboard guides, collections and comparisons you've saved.",
};

function formatDate(value: string | Date): string {
    return new Date(value).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

export default async function ProfilePage() {
    const session = await auth();

    if (!session?.user) {
        redirect("/signin?callbackUrl=%2Fprofile");
    }

    const guides = hasDatabase && session.user.id ? await listGuides(session.user.id) : [];

    return (
        <div className="px-6 pt-8">
            <main className="max-w-5xl mx-auto py-10 px-6 space-y-10 text-ink">
                <PageHeader
                    title="Your Profile"
                    subtitle={`Signed in as ${session.user.email ?? session.user.name ?? "you"}.`}
                    art="/art/banner-planner.svg"
                />

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
                                    <Link
                                        href={`/sideboard?guide=${g.id}`}
                                        className="shrink-0 px-4 py-2 rounded font-title bg-brand text-midnight-light hover:bg-brand-dark transition-colors"
                                    >
                                        Open
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                </section>

                <section className="bg-parchment-dark shadow-card rounded-lg p-6 space-y-3">
                    <h2 className="text-2xl font-title flex items-center">Collections &amp; Comparisons</h2>
                    <p className="text-ink/75 leading-relaxed">
                        The tables for these exist, but the Pack Planner doesn&apos;t save into them
                        yet — that&apos;s the next piece of work. Your collection is still kept in this
                        browser in the meantime.
                    </p>
                </section>
            </main>
        </div>
    );
}
