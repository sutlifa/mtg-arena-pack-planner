import PackPlanner from "../components/PackPlanner";
import { isAuthConfigured } from "@/lib/authConfig";

export const metadata = {
    title: "Pack Planner — MTG Planning App",
    description:
        "Compare decklists against the cards you already own: wildcard costs and pack recommendations for Arena, or a priced shopping list for paper.",
};

/**
 * Server wrapper so the planner can be told whether sign-in is configured.
 *
 * The planner itself is a client component and cannot read the environment.
 * This mirrors how /sideboard is structured, and keeps the page statically
 * prerendered: reading process.env at render time is not a dynamic API.
 */
export default function PlannerPage() {
    return <PackPlanner authEnabled={isAuthConfigured()} />;
}
