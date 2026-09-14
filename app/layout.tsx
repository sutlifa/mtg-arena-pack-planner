import "./globals.css";
import AliasLoader from "./AliasLoader";
import SiteNav from "./components/SiteNav";
import Providers from "./components/Providers";
import { isAuthConfigured } from "@/lib/authConfig";
import ScrollToTop from "./components/ScrollToTop";
import Footer from "./components/Footer";
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
    const authEnabled = isAuthConfigured();

    return (
        <html lang="en">
            <body className="min-h-screen bg-fantasy-parchment flex flex-col">
                <Providers>
                {/* Global heading font import */}
                <link
                    href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@500;600;700&display=swap"
                    rel="stylesheet"
                />

                {/* Load Arena → Printed name alias map on the client */}
                <AliasLoader />

                <SiteNav authEnabled={authEnabled} />

                <div className="flex-1">
                    {children}
                </div>

                <Footer />

                <ScrollToTop />
                </Providers>

                {/* Vercel Analytics */}
                <Analytics />
            </body>
        </html>
    );
}
