import "./globals.css";
import AliasLoader from "./AliasLoader";
import SiteNav from "./components/SiteNav";
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

                {/* FLOATING TIP JAR - DESKTOP ONLY */}
                <div className="hidden md:block fixed top-6 left-6 z-50 pointer-events-auto">
                    <aside className="tipjar-container">
                        <h2 className="tipjar-header">Support the Creator</h2>

                        <a
                            href="https://www.paypal.com/donate/?business=VLDPL87EZ58L6&no_recurring=0&currency_code=USD"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="tipjar-button"
                        >
                            <div className="tipjar-icon"></div>
                            <span>Tip Jar</span>
                        </a>
                    </aside>
                </div>

                <SiteNav />

                {children}

                {/* Vercel Analytics */}
                <Analytics />
            </body>
        </html>
    );
}
