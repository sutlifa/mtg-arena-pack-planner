import "./globals.css";
import AliasLoader from "./AliasLoader";
import { Analytics } from "@vercel/analytics/next";

export const metadata = {
    title: "MTG Card Acquiring Tool",
    description:
        "Analyze decks against your collection, and get pack recommendations for arena or a shopping list for TCGPlayer.",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body className="min-h-screen bg-fantasy-parchment">
                {/* Global font import */}
                <link
                    href="https://fonts.googleapis.com/css2?family=MedievalSharp&display=swap"
                    rel="stylesheet"
                />

                {/* Load Arena → Printed name alias map on the client */}
                <AliasLoader />

                {children}

                {/* Vercel Analytics */}
                <Analytics />
            </body>
        </html>
    );
}
