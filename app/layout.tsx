import "./globals.css";
import AliasLoader from "./AliasLoader";

export const metadata = {
  title: "MTG Arena Pack Planner",
  description: "Analyze decks, Arena collection, and pack recommendations.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700;900&display=swap"
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