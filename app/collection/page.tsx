import CollectionEditor from "../components/CollectionEditor";
import PageHeader from "../components/PageHeader";
import { isAuthConfigured } from "@/lib/authConfig";

export const metadata = {
    title: "Collection — MTG Planning App",
    description:
        "Build and edit the collection the Pack Planner compares your decks against, with a picture of every card.",
};

export default function CollectionPage() {
    return (
        <div className="px-3 sm:px-6 pt-8">
            <main className="max-w-6xl mx-auto py-10 px-3 sm:px-6 space-y-10 text-ink">
                <PageHeader
                    title="Collection"
                    subtitle="Every card you own, one tile each — add cards by name or paste an export, and the Pack Planner compares your decks against it."
                    art="/art/banner-planner.svg"
                />
                <CollectionEditor authEnabled={isAuthConfigured()} />
            </main>
        </div>
    );
}
