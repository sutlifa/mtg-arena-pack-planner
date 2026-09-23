// lib/printFit.ts

/**
 * Sizes the printed sideboard sheet so it fills exactly one page.
 *
 * The sheet used to print at one fixed size. A short guide came out as a strip
 * of tiny text across the top of an otherwise blank page, and a long one
 * spilled onto a second page — the user's real 11-matchup guide used about 60%
 * of the page, and 30 matchups ran to two. The right size depends on how many
 * matchups there are AND how much is written in each, so it has to be measured,
 * not guessed from a count.
 *
 * So the whole sheet scales from one number, the --sb-size custom property
 * (every text size and text spacing in globals.css is an `em` of it), and this
 * searches for the largest value at which the sheet still fits on the page.
 * Page geometry — the sheet's 8.5in width, its padding, the gap between
 * columns — deliberately does NOT scale: only the text grows and shrinks, so
 * the layout keeps its shape at every size.
 *
 * Browser-only: it measures real layout, so it needs a document. It also only
 * means anything if the sheet is laid out exactly as it will print, which is
 * why the sheet's styles in globals.css are NOT inside @media print.
 */

/** US Letter. The sheet is laid out at exactly this size (see .sb-sheet). */
const PAGE_HEIGHT_IN = 11;
const CSS_PX_PER_IN = 96;

/**
 * A few px under the page. Landing exactly on the page height lets
 * sub-pixel rounding in the print engine push a blank second page out.
 */
const SAFETY_PX = 6;

/**
 * Smallest base size before giving up on one page: 7px is 5.25pt. Below that,
 * printed card names stop being readable at arm's length, and a two-page
 * guide you can read beats a one-page guide you can't.
 */
export const MIN_SHEET_PX = 7;

/**
 * Largest base size: 16px is 12pt. A three-matchup guide should use the page,
 * but it does not need poster-sized text to do it.
 */
export const MAX_SHEET_PX = 16;

export interface SheetFit {
    /** Base text size applied to the sheet, in CSS px. */
    px: number;
    /** False when even the smallest readable size runs past one page. */
    fits: boolean;
}

/** CSS px to printer's points, for telling the user what they'll get. */
export const pxToPt = (px: number) => Math.round(px * 0.75 * 10) / 10;

/**
 * Finds the largest base size at which `sheet` fits on one page, leaves that
 * size applied to it, and reports it.
 *
 * A binary search, but one that only ever settles on a size it has actually
 * measured as fitting. Height against text size is *nearly* monotonic, not
 * quite — balancing three columns around matchups that must not split can make
 * a slightly larger size pack a little tighter — so the answer is never
 * interpolated or rounded after the fact. It is always a size that was seen to
 * fit.
 */
export function fitSheet(sheet: HTMLElement): SheetFit {
    const limit = PAGE_HEIGHT_IN * CSS_PX_PER_IN - SAFETY_PX;

    // Measured with balanced columns, which is how a one-page sheet prints.
    // .sb-overflow only goes back on if it genuinely will not fit.
    sheet.classList.remove("sb-overflow");

    const heightAt = (px: number) => {
        sheet.style.setProperty("--sb-size", `${px}px`);
        return sheet.getBoundingClientRect().height;
    };

    if (heightAt(MAX_SHEET_PX) <= limit) {
        return { px: MAX_SHEET_PX, fits: true };
    }

    if (heightAt(MIN_SHEET_PX) > limit) {
        // Left at the minimum: it will print across two pages, but readably,
        // and flowing column by column so page one is actually used.
        sheet.classList.add("sb-overflow");
        return { px: MIN_SHEET_PX, fits: false };
    }

    let lo = MIN_SHEET_PX; // known to fit
    let hi = MAX_SHEET_PX; // known not to
    for (let i = 0; i < 16 && hi - lo > 0.02; i++) {
        const mid = (lo + hi) / 2;
        if (heightAt(mid) <= limit) lo = mid;
        else hi = mid;
    }

    heightAt(lo);
    return { px: lo, fits: true };
}
