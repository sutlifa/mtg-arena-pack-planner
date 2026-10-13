import DeckCheck from "../components/DeckCheck";
import { isAuthConfigured } from "@/lib/authConfig";

export const metadata = {
    title: "Deck Check — MTG Planning App",
    description:
        "Check your decks against the cards you own: what each deck is missing, the wildcards and packs it would take on Arena, or a priced shopping list for paper.",
};

/**
 * Server wrapper so Deck Check can be told whether sign-in is configured.
 *
 * Deck Check itself is a client component and cannot read the environment.
 * This mirrors how /sideboard is structured, and keeps the page statically
 * prerendered: reading process.env at render time is not a dynamic API.
 *
 * This was /planner (the Pack Planner). next.config.js redirects the old
 * address here with its query string, so profile links, bookmarks and
 * ?deck= / ?collection= / ?analysis= links made before the rename still land.
 */
export default function DeckCheckPage() {
    return <DeckCheck authEnabled={isAuthConfigured()} />;
}
