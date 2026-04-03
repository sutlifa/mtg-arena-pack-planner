import "./globals.css";
import AliasLoader from "./AliasLoader";

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
            <head>
                {/* Global font import */}
                <link
                    href="https://fonts.googleapis.com/css2?family=MedievalSharp&display=swap"
                    rel="stylesheet"
                />
            </head>

            <body className="min-h-screen bg-fantasy-parchment">
                {/* SVG filter for procedural parchment texture */}
                <svg className="hidden">
                    <filter id="parchmentNoise">
                        <feTurbulence
                            type="fractalNoise"
                            baseFrequency="0.8"
                            numOctaves="4"
                            stitchTiles="noStitch"
                        />
                        <feColorMatrix type="saturate" values="0.3" />
                        <feBlend mode="multiply" in2="SourceGraphic" />
                    </filter>
                </svg>

                {/* Load Arena → Printed name alias map on the client */}
                <AliasLoader />

                {children}
            </body>
        </html>
    );
}
