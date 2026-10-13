import DeckBuilder from "../components/DeckBuilder";
import PageHeader from "../components/PageHeader";
import { isAuthConfigured } from "@/lib/authConfig";

export const metadata = {
    title: "Decks — MTG Planning App",
    description:
        "Keep your own decklists — paste, split into maindeck and sideboard, save and edit them — then check them in Deck Check or build a sideboard guide from them.",
};

/**
 * Server wrapper, like /collection and /sideboard: it reads whether sign-in
 * is configured (a plain env read, so the page stays statically prerendered)
 * and hands that to the client component.
 */
export default function DecksPage() {
    return (
        <div className="px-3 sm:px-6 pt-8">
            <main className="max-w-5xl mx-auto py-10 px-3 sm:px-6 space-y-10 text-ink">
                <PageHeader
                    title="Decks"
                    subtitle="Paste a decklist, keep it and edit it. When it's ready, check it in Deck Check — what you're missing and what it costs — or build a sideboard guide from it."
                    art="/art/banner-planner.svg"
                />
                <DeckBuilder authEnabled={isAuthConfigured()} />
            </main>
        </div>
    );
}
