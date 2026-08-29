import RotationChecker from "../components/RotationChecker";
import PageHeader from "../components/PageHeader";

export const metadata = {
    title: "Standard Rotation Checker — MTG Card Acquiring Tool",
    description:
        "Paste a Standard decklist to see which cards rotate out at the next rotation and which stay legal.",
};

export default function RotationPage() {
    return (
        <div className="px-6 pt-8">
            <main className="max-w-5xl mx-auto py-10 px-6 space-y-10 text-ink">
                <PageHeader
                    title="Standard Rotation"
                    subtitle="Paste a Standard decklist to see which cards leave the format at the next rotation — and which survive on a reprint in a set that's sticking around."
                    art="/art/banner-rotation.svg"
                />
                <RotationChecker />
            </main>
        </div>
    );
}
