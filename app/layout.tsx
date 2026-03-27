export const metadata = {
  title: "MTG Card Acquiring Tool",
  description: "Deck comparison and pack recommendation tool",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}