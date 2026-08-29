/**
 * Illustrated banner that opens each page.
 *
 * The artwork is decorative only — it sits in a `aria-hidden` layer with an
 * empty alt equivalent, so screen readers get the heading text and nothing
 * else. A solid scrim sits between the art and the text rather than relying
 * on the illustration staying dark in every spot, which keeps the title's
 * contrast ratio fixed and predictable no matter what the art does behind it.
 */
export default function PageHeader({
    title,
    subtitle,
    art,
}: {
    title: string;
    subtitle: string;
    art: string;
}) {
    return (
        <section className="relative overflow-hidden rounded-lg border border-brass/40 shadow-card">
            <div
                aria-hidden="true"
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url('${art}')` }}
            />
            <div aria-hidden="true" className="absolute inset-0 bg-[#111a15]/70" />

            <div className="relative px-6 py-12 sm:py-16 text-center">
                <h1 className="font-title text-3xl sm:text-5xl text-midnight-light tracking-wide drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]">
                    {title}
                </h1>
                <p className="mt-3 text-sm sm:text-base text-midnight-light max-w-2xl mx-auto drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
                    {subtitle}
                </p>
            </div>
        </section>
    );
}
