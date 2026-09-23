import SideboardPlanner from "../components/SideboardPlanner";
import PageHeader from "../components/PageHeader";
import { isAuthConfigured } from "@/lib/authConfig";

export const metadata = {
    title: "Sideboard Planner — MTG Planning App",
    description:
        "Build a matchup-by-matchup sideboard guide from your decklist and the current metagame, then print it to one page.",
};

export default function SideboardPage() {
    return (
        <div className="px-3 sm:px-6 pt-8">
            {/* Wider on big screens, where the matchups share the row with
                the opponent's list. */}
            <main className="max-w-5xl xl:max-w-7xl mx-auto py-10 px-3 sm:px-6 space-y-10 text-ink">
                <div className="sb-noprint">
                    <PageHeader
                        title="Sideboard Planner"
                        subtitle="Plan what comes in and out against the decks you'll actually face — then print the whole guide on one page for your deck box."
                        art="/art/banner-rotation.svg"
                    />
                </div>
                <SideboardPlanner authEnabled={isAuthConfigured()} />
            </main>
        </div>
    );
}
