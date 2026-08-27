export default function Footer() {
    const year = new Date().getFullYear();

    return (
        <footer className="mt-16 bg-midnight border-t-2 border-brass">
            <div className="max-w-5xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-midnight-light/70">
                <p>
                    © {year} MTG Card Acquiring Tool. Not affiliated with or endorsed by Wizards of the Coast.
                </p>
                <a
                    href="https://www.paypal.com/donate/?business=VLDPL87EZ58L6&no_recurring=0&currency_code=USD"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-midnight-light underline underline-offset-2 hover:text-brass-light transition-colors"
                >
                    Support this project
                </a>
            </div>
        </footer>
    );
}
