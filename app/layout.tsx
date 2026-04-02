import "./globals.css";
import AliasLoader from "./AliasLoader";

export const metadata = {
    title: "MTG Card Acquiring Tool",
    description: "Analyze decks against your collection, and get pack recommendations for arena or a shopping list for TCGPlayer.",
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

            <body
                style={{
                    backgroundImage: "url('/parchment.jpg')",
                    backgroundSize: "cover",
                    backgroundRepeat: "repeat",
                    backgroundAttachment: "fixed",
                }}
                className="min-h-screen"
            >
                {/* Load Arena → Printed name alias map on the client */}
                <AliasLoader />

                {children}
            </body>
        </html>
    );
}
