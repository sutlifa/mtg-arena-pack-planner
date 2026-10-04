// lib/printFit.ts

/**
 * Sizes the printed sideboard sheet so it fills exactly one page, and lays its
 * matchups out in three columns.
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
 * The columns are placed here too, explicitly, rather than left to CSS
 * multi-column layout. Multicol looked right in desktop Chrome and fell apart
 * on phones: a user printing the same guide from a phone got one long column
 * of rows running over several pages. Phone print engines (WebKit's above all)
 * are unreliable at balancing columns and honouring `break-inside: avoid`
 * inside a printed page, and there is no way to detect that from script. Three
 * ordinary grid columns, each holding the matchups this module assigned to it,
 * print the same everywhere, because there is nothing left for the print
 * engine to decide.
 *
 * Browser-only where it touches the DOM: it measures real layout, so it needs a
 * document. It also only means anything if the sheet is laid out exactly as it
 * will print, which is why the sheet's styles in globals.css are NOT inside
 * @media print. The column arithmetic (balanceColumns, flowPages) is pure.
 */

/** US Letter. The sheet is laid out at exactly this size (see .sb-sheet). */
export const LETTER_HEIGHT_IN = 11;
const CSS_PX_PER_IN = 96;

/** .sb-sheet's width, 8.5in. A measured sheet of any other width is suspect. */
const SHEET_WIDTH_PX = 8.5 * CSS_PX_PER_IN;

/**
 * How much of the page a phone's sheet is fitted to: half an inch short of
 * the paper.
 *
 * A desktop's Export prints an isolated document whose `@page { margin: 0 }`
 * is honoured, so it fits the full 11in. Phones make no such promise. iOS
 * prints through the system print sheet, which lays the page out inside the
 * printer's printable area — its own margins, whatever @page says — and
 * scales content that is wider than that area down to fit. Shrink-to-width
 * with even margins actually leaves MORE than 11in of CSS per sheet (the
 * paper is taller than it is wide), which is why the fitted height was never
 * the real problem on the iPhone. But a printer whose top and bottom margins
 * are larger than its side margins, or a print path that adds margins without
 * scaling, eats into the bottom of the page, and the only symptom is the last
 * matchup in a column landing on a second sheet.
 *
 * Half an inch covers the ordinary 0.25in-a-side printable area outright at
 * a cost of about 4.5% of text size, on phones only. Desktop output, which
 * is verifiably margin-free, keeps the full page.
 *
 * It is a preference, not a limit. A guide that cannot fit 10.5in even at
 * the minimum size, but can fit 11in, is fitted to 11in (fitSheet), so the
 * headroom never costs anyone a second sheet of paper. A 30-matchup guide
 * with full notes is exactly that case.
 */
export const PHONE_PAGE_HEIGHT_IN = 10.5;

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

/** Columns per printed page. globals.css (.sb-cols) draws exactly this many. */
export const SHEET_COLUMNS = 3;

/**
 * Where each matchup prints: page → column → indexes into the matchup list.
 * Reading order is top to bottom, column by column, page by page, so
 * flattening it always gives 0, 1, 2 … n-1.
 */
export type SheetPages = number[][][];

export interface SheetFit {
    /** Base text size applied to the sheet, in CSS px. */
    px: number;
    /** False when even the smallest readable size runs past one page. */
    fits: boolean;
    /** The column layout measured at `px`. One page whenever `fits`. */
    pages: SheetPages;
    /** What the fit saw, for the ?printdebug=1 panel. */
    probe?: FitProbe;
}

/**
 * The raw measurements behind a fit. Nothing in the app decides anything from
 * this; it exists so a print that goes wrong on a real phone can be diagnosed
 * from a screenshot of /sideboard?printdebug=1 rather than guessed at.
 */
export interface FitProbe {
    /** "detached": an off-screen clone in the page. "sheet": fitted in place (the desktop's print iframe). */
    source: "detached" | "sheet";
    /** The page height fitted to, in CSS px (safety margin already taken off). */
    limitPx: number;
    /** Room for columns on page one (under the title) and on later pages. */
    firstCapPx: number;
    restCapPx: number;
    /** Each matchup's measured height at the committed size, in order. */
    itemHeights: number[];
    /** Each column's height as dealt, page by page, measured after dealing. */
    columnHeights: number[][];
    /** The measured sheet's rendered width and its computed font-family. */
    sheetWidthPx: number;
    fontFamily: string;
    /**
     * Rendered text width over the width the font should have at `px`, and
     * the first matchup's computed font-size over `px`. Both are 1 when the
     * browser draws the text at the size it was given; well above 1 means
     * text autosizing is enlarging it.
     */
    textScale: number;
    computedScale: number;
    /** Sizes tried by the search. */
    tried: number;
    /**
     * Null when all is well. Otherwise why the measurement could not be
     * trusted (the sheet fell back to the minimum size on one page), or a
     * warning that text is drawn at a different size from the one set.
     */
    problem: string | null;
}

/** CSS px to printer's points, for telling the user what they'll get. */
export const pxToPt = (px: number) => Math.round(px * 0.75 * 10) / 10;

/* ------------------------------------------------------------------ */
/* Column arithmetic — pure                                            */
/* ------------------------------------------------------------------ */

/**
 * Splits items, in order, into at most `k` consecutive columns so the tallest
 * column is as short as possible — what `column-fill: balance` does, but with
 * an answer that does not depend on which browser is printing.
 *
 * Consecutive, never reordered: the guide reads top to bottom, column by
 * column, in the order the matchups were ranked, and a shorter sheet is not
 * worth making someone hunt for a matchup at the table. With that constraint
 * the optimum is a small dynamic programme (items × k² at most; a guide is a
 * few dozen matchups), so it is solved exactly rather than approximated.
 *
 * Two passes. The first finds the shortest possible tallest column — that
 * alone decides whether the sheet fits. Many splits can share that tallest
 * column, though: with one long matchup at the top, "it alone, then all the
 * rest, then nothing" ties with a split that uses all three columns, and the
 * first leaves a third of the page blank. So the second pass keeps that
 * height as a ceiling and, under it, picks the most even split (least sum of
 * squared column heights).
 *
 * `start` offsets the indexes returned, for balancing a slice of a longer list.
 */
export function balanceColumns(
    heights: number[],
    k: number = SHEET_COLUMNS,
    start = 0
): { columns: number[][]; tallest: number } {
    const n = heights.length;
    const prefix = [0];
    for (const h of heights) prefix.push(prefix[prefix.length - 1] + h);
    const span = (a: number, b: number) => prefix[b] - prefix[a];
    const table = () => Array.from({ length: k + 1 }, () => new Array<number>(n + 1).fill(Infinity));

    // Pass 1. tallest[j][i]: the shortest possible tallest column when the
    // first i items go into j columns.
    const tallest = table();
    tallest[0][0] = 0;
    for (let j = 1; j <= k; j++) {
        for (let i = 0; i <= n; i++) {
            for (let a = 0; a <= i; a++) {
                tallest[j][i] = Math.min(tallest[j][i], Math.max(tallest[j - 1][a], span(a, i)));
            }
        }
    }
    const ceiling = tallest[k][n];
    // Heights are fractional px from layout; don't let float noise in the sums
    // rule out the very split pass 1 found.
    const cap = ceiling + 1e-6;

    // Pass 2. spread[j][i]: least sum of squared column heights for the first
    // i items in j columns, none over the ceiling. cut[j][i]: where the last
    // of those columns starts.
    const spread = table();
    const cut = Array.from({ length: k + 1 }, () => new Array<number>(n + 1).fill(0));
    spread[0][0] = 0;
    for (let j = 1; j <= k; j++) {
        for (let i = 0; i <= n; i++) {
            for (let a = 0; a <= i; a++) {
                const h = span(a, i);
                if (h > cap || spread[j - 1][a] === Infinity) continue;
                const cost = spread[j - 1][a] + h * h;
                // `<=` takes the latest start that ties, which keeps the earlier
                // columns the fuller ones — the way a balanced multicol fills,
                // so a sheet with room to spare leaves the space on the right.
                if (cost <= spread[j][i]) {
                    spread[j][i] = cost;
                    cut[j][i] = a;
                }
            }
        }
    }

    const columns: number[][] = [];
    let end = n;
    for (let j = k; j >= 1; j--) {
        const a = cut[j][end];
        const col: number[] = [];
        for (let i = a; i < end; i++) col.push(start + i);
        columns.unshift(col);
        end = a;
    }
    return { columns, tallest: ceiling };
}

/**
 * Lays out a guide that is too long for one page: fills each column in turn
 * down to the bottom of the page, then the next column, then the next page —
 * so page one is used top to bottom before anything spills over. The last page
 * is then re-balanced, because it is usually part-full and three even stubs
 * read better than one full column and two empty ones.
 *
 * `firstCap` is shorter than `restCap`: page one also carries the title.
 * A single matchup taller than a whole column still gets a column to itself;
 * it will run long, but it is never dropped.
 */
export function flowPages(
    heights: number[],
    firstCap: number,
    restCap: number,
    k: number = SHEET_COLUMNS
): SheetPages {
    const pages: SheetPages = [];
    let page: number[][] = [];
    let col: number[] = [];
    let used = 0;
    const cap = () => (pages.length === 0 ? firstCap : restCap);

    const nextColumn = () => {
        page.push(col);
        col = [];
        used = 0;
        if (page.length === k) {
            pages.push(page);
            page = [];
        }
    };

    heights.forEach((h, i) => {
        if (col.length > 0 && used + h > cap()) nextColumn();
        col.push(i);
        used += h;
    });
    if (col.length > 0 || page.length > 0) {
        page.push(col);
        while (page.length < k) page.push([]);
        pages.push(page);
    }
    if (pages.length === 0) return fallbackPages(0, k);

    const last = pages[pages.length - 1].flat();
    if (last.length > 0) {
        const lastCap = pages.length === 1 ? firstCap : restCap;
        const balanced = balanceColumns(
            last.map((i) => heights[i]),
            k,
            last[0]
        );
        // Balancing never makes the tallest column taller than greedy filling
        // did, but a lone oversized matchup is already over the cap either
        // way; only swap in the balanced version when it is no worse.
        const greedyTallest = Math.max(
            ...pages[pages.length - 1].map((c) => c.reduce((s, i) => s + heights[i], 0))
        );
        if (balanced.tallest <= Math.max(lastCap, greedyTallest)) {
            pages[pages.length - 1] = balanced.columns;
        }
    }
    return pages;
}

/**
 * A layout to render before anything has been measured (first paint, or the
 * moment after a matchup is added): one page, split evenly by count. It only
 * has to hold every matchup in order; the real layout replaces it a quarter
 * of a second later, and Export always measures afresh before printing.
 */
export function fallbackPages(count: number, k: number = SHEET_COLUMNS): SheetPages {
    const per = Math.ceil(count / k);
    const cols: number[][] = [];
    for (let c = 0; c < k; c++) {
        const col: number[] = [];
        for (let i = c * per; i < Math.min(count, (c + 1) * per); i++) col.push(i);
        cols.push(col);
    }
    return [cols];
}

/**
 * The size and the layout to render the sheet at, taken from ONE fit.
 *
 * A fit's pages are only used if they still describe `count` matchups: a
 * layout from before a matchup was added or removed would drop one from the
 * printout or point past the end of the list. When they don't, the size is
 * dropped along with them. Pairing a size from one measurement with pages
 * from another (or with the even-by-count fallback) is how a sheet ends up
 * with large text dealt into columns that were sized for small text, so the
 * two never come from different places: no usable fit means the minimum size
 * and one evenly split page, the combination least likely to overflow.
 */
export function sheetLayoutFor(fit: SheetFit | null, count: number): { px: number; pages: SheetPages } {
    if (fit) {
        const flat = fit.pages.flat(2);
        if (flat.length === count && flat.every((v, i) => v === i)) return { px: fit.px, pages: fit.pages };
    }
    return { px: MIN_SHEET_PX, pages: fallbackPages(count) };
}

/* ------------------------------------------------------------------ */
/* Measuring — needs a document                                        */
/* ------------------------------------------------------------------ */

/**
 * Builds one printed page's frame: `.sb-page > [.sb-sheet-head] > .sb-cols >
 * .sb-col × 3`. SideboardPlanner renders exactly this shape from a SheetFit;
 * the two have to agree, or a sheet fitted here would print differently from
 * the one React draws.
 */
function buildPage(doc: Document, head: HTMLElement | null) {
    const page = doc.createElement("div");
    page.className = "sb-page";
    if (head) page.appendChild(head);
    const grid = doc.createElement("div");
    grid.className = "sb-cols";
    const cols: HTMLElement[] = [];
    for (let c = 0; c < SHEET_COLUMNS; c++) {
        const col = doc.createElement("div");
        col.className = "sb-col";
        grid.appendChild(col);
        cols.push(col);
    }
    page.appendChild(grid);
    return { page, cols };
}

/**
 * How tall a column's content is: from the column's top to the bottom of its
 * last matchup, bottom margin included (the same span fitSheet sums). Not
 * the column's own box, which stretches to the tallest column in its row.
 */
function columnContentHeight(col: HTMLElement): number {
    const last = col.lastElementChild as HTMLElement | null;
    if (!last) return 0;
    const view = col.ownerDocument.defaultView;
    const margin = view ? parseFloat(view.getComputedStyle(last).marginBottom) || 0 : 0;
    return last.getBoundingClientRect().bottom + margin - col.getBoundingClientRect().top;
}

/**
 * A line of ordinary sheet text for checking that the browser draws the text
 * at the size it was given. Long enough that a few percent of scaling is
 * whole pixels.
 */
const SCALE_SAMPLE = "Sideboard out: 2 Duress, 1 Negate. In: 3 Cut Down, 2 Go for the Throat";

/**
 * How far rendered text may be from its set size before a measurement is not
 * trusted. Font hinting moves a line by well under 1%; text autosizing moves
 * it by tens of percent. 8% sits far from both.
 */
const SCALE_TOLERANCE = 0.08;

/**
 * Switches text autosizing off for the sheet, as an INLINE style. The same two
 * declarations are in globals.css (.sb-sheet), but that copy cannot be relied
 * on for the one that matters: the build drops `-webkit-text-size-adjust`.
 * Next's CSS pipeline (Turbopack's Lightning CSS pass, after autoprefixer)
 * merges a prefixed declaration into its unprefixed sibling and re-emits only
 * the prefixes its browser targets call for, and by its data Safari does not
 * need -webkit- here. The built stylesheet carries `-moz-text-size-adjust`
 * and `text-size-adjust`, and no -webkit- form. iOS Safari is the browser
 * that autosizes the sheet, and it has historically honoured only the
 * -webkit- form, so that is the declaration that has to arrive.
 *
 * An inline style never goes through the CSS pipeline, so it arrives as
 * written. Do not delete this as a duplicate of the stylesheet rule, and do
 * not move it into CSS: it exists because the CSS copy gets stripped.
 *
 * The object is shaped for React's `style` prop (SideboardPlanner spreads it
 * onto the rendered sheet, the one a phone prints); pinTextSize applies the
 * same thing to a sheet in the DOM.
 */
export const SHEET_TEXT_SIZE_STYLE = {
    WebkitTextSizeAdjust: "none",
    textSizeAdjust: "none",
} as const;

/**
 * SHEET_TEXT_SIZE_STYLE on a sheet already in the DOM. fitSheet calls it on
 * whatever it measures (fitDetached's clone, the desktop print iframe's copy)
 * so a sheet is measured with autosizing off even if it was copied from
 * markup that somehow lost the inline style; measuring with it on and
 * printing with it off is exactly the mismatch the sheet exists to avoid.
 * setProperty with a property this browser does not know is a silent no-op.
 */
export function pinTextSize(el: HTMLElement): void {
    el.style.setProperty("-webkit-text-size-adjust", "none");
    el.style.setProperty("text-size-adjust", "none");
}

export interface FitOptions {
    /** Page height to fit to, in inches. Defaults to the full Letter page. */
    pageHeightIn?: number;
    /** Recorded in the probe; fitDetached passes "detached". */
    source?: FitProbe["source"];
}

/**
 * Finds the largest base size at which `sheet` fits on one page, rebuilds the
 * sheet's columns (and pages, if it cannot fit) to match, leaves that size
 * applied, and reports it.
 *
 * Works on any `.sb-sheet` whatever columns it currently has: it collects the
 * title and the matchups in document order and re-deals them, so it can run on
 * an off-screen clone and on the isolated print document alike. It must never
 * run on the sheet React renders — React owns those nodes.
 *
 * Every candidate size is measured for real: each matchup's height at that
 * size and at the column's width, then the columns balanced from those
 * heights. Text re-wraps differently at every size, so neither the heights nor
 * the balance can be scaled from a neighbouring size.
 *
 * A binary search, but one that only ever settles on a size it has actually
 * measured as fitting, and it commits the layout from THAT measurement. It
 * used to re-measure the winning size at the end and deal the pages from the
 * re-measurement; if the second look disagreed with the first, the sheet came
 * out as two pages at a size already seen to fit on one. Height against text
 * size is also only *nearly* monotonic (balancing three columns around
 * matchups that must not split can make a slightly larger size pack a little
 * tighter), so nothing is interpolated or rounded after the fact.
 *
 * Measurements are sanity-checked before they are believed (brokenWith,
 * below). A measurement that fails cannot say whether the guide fits, so
 * rather than paginate on bad numbers it falls back to the minimum size on a
 * single balanced page: the one layout that is right whenever the guide can
 * fit at all. Text drawn larger than the size set (autosizing) is checked
 * too, but only reported; see scaleWarning for why it is not a fallback.
 */
export function fitSheet(sheet: HTMLElement, opts: FitOptions = {}): SheetFit {
    const doc = sheet.ownerDocument;
    const view = doc.defaultView;
    const fullLimit = LETTER_HEIGHT_IN * CSS_PX_PER_IN - SAFETY_PX;
    // The page height aimed for; see the end of this function for when the
    // full page is used instead.
    let limit = Math.min(fullLimit, (opts.pageHeightIn ?? LETTER_HEIGHT_IN) * CSS_PX_PER_IN - SAFETY_PX);
    const source = opts.source ?? "sheet";
    pinTextSize(sheet);

    const head = sheet.querySelector<HTMLElement>(".sb-sheet-head");
    const items = Array.from(sheet.querySelectorAll<HTMLElement>(".sb-item"));

    // The measuring layout: one page, every matchup stacked in the first
    // column. All three columns are the same width, so a matchup's height here
    // is its height in whichever column it ends up in.
    const probe = buildPage(doc, head);
    // One line of sheet text, below the columns so it cannot change their
    // measurements, for checking the text is drawn at the size set.
    const sample = doc.createElement("div");
    const sampleText = doc.createElement("span");
    sampleText.style.whiteSpace = "nowrap";
    sampleText.textContent = SCALE_SAMPLE;
    sample.appendChild(sampleText);
    probe.page.appendChild(sample);
    sheet.replaceChildren(probe.page);
    for (const item of items) probe.cols[0].appendChild(item);

    const fontFamily = view ? view.getComputedStyle(sheet).fontFamily : "";
    const pad = view ? view.getComputedStyle(probe.page) : null;
    const padTop = pad ? parseFloat(pad.paddingTop) || 0 : 0;
    const padBottom = pad ? parseFloat(pad.paddingBottom) || 0 : 0;
    const sheetWidth = sheet.getBoundingClientRect().width;

    // How wide the sample is per px of font size, asked of the font itself
    // rather than of layout: a canvas draws text at exactly the size it is
    // given, with no autosizing. Null where there is no canvas to ask.
    let perPx: number | null = null;
    try {
        const ctx = doc.createElement("canvas").getContext("2d");
        if (ctx && fontFamily) {
            ctx.font = `100px ${fontFamily}`;
            const w = ctx.measureText(SCALE_SAMPLE).width / 100;
            if (Number.isFinite(w) && w > 0) perPx = w;
        }
    } catch {
        perPx = null;
    }

    let tried = 0;
    const measure = (px: number) => {
        tried++;
        sheet.style.setProperty("--sb-size", `${px}px`);
        const pageTop = probe.page.getBoundingClientRect().top;
        const colBox = probe.cols[0].getBoundingClientRect();
        // Distance from one matchup's top to the next one's includes the
        // spacing between them, which a height alone would miss. The last
        // runs to the column's bottom, which includes its own bottom margin:
        // a grid item contains its children's margins.
        const tops = items.map((el) => el.getBoundingClientRect().top);
        const heights = tops.map((t, i) => (i + 1 < tops.length ? tops[i + 1] : colBox.bottom) - t);
        const firstCap = limit - (colBox.top - pageTop) - padBottom;
        const restCap = limit - padTop - padBottom;
        const { columns, tallest } = balanceColumns(heights);
        const textScale = perPx ? sampleText.getBoundingClientRect().width / (perPx * px) : 1;
        const itemPx = items.length > 0 && view ? parseFloat(view.getComputedStyle(items[0]).fontSize) : px;
        return {
            px,
            limit,
            heights,
            firstCap,
            restCap,
            columns,
            textScale,
            computedScale: itemPx / px,
            fits: tallest <= firstCap,
        };
    };
    type Measured = ReturnType<typeof measure>;

    /**
     * Why a measurement can't be believed, or null if it can. Each check is a
     * way the numbers could be wrong on a real device:
     *  - non-finite or all-zero heights: measured before layout, or inside
     *    something with no size (display: none anywhere above the sheet);
     *  - a sheet that isn't 8.5in wide, or isn't in Arial: the stylesheet
     *    isn't applied yet, or something constrains the measuring host, so
     *    the text wraps differently from the printed sheet.
     */
    const brokenWith = (m: Measured): string | null => {
        if (items.length === 0) return null;
        if (!m.heights.every((h) => Number.isFinite(h) && h >= 0)) return "a matchup's height could not be measured";
        if (m.heights.every((h) => h < 1)) return "every matchup measured 0px tall (not laid out)";
        if (!(m.firstCap > 0)) return "the page area could not be measured";
        if (!(Math.abs(sheetWidth - SHEET_WIDTH_PX) <= 2)) {
            return `sheet measured ${Math.round(sheetWidth)}px wide, not ${SHEET_WIDTH_PX}px`;
        }
        if (!/arial|helvetica/i.test(fontFamily)) return `sheet font is "${fontFamily}", not Arial`;
        return null;
    };

    /**
     * Text drawn at a different size from the one set: text autosizing (iOS's,
     * or Android Chrome's font boosting) enlarging small text in a wide block.
     * With it, every height is inflated and even the smallest size looks too
     * big for one page, which is the likeliest cause of the iPhone printing a
     * one-page guide as two pages of large text. globals.css switches it off
     * for the sheet (text-size-adjust: none); this checks that it worked.
     *
     * Reported, deliberately NOT treated as a broken measurement. The iPhone's
     * printout was as inflated as its measurement, so inflated heights still
     * describe what will print, and paginating from them gives two clean pages.
     * Forcing one page from them instead gives a sheet whose columns overflow
     * onto page two, each continuing at the top of the next sheet, which reads
     * worse. The warning surfaces in the ?printdebug=1 panel.
     */
    const scaleWarning = (m: Measured): string | null => {
        if (items.length === 0) return null;
        if (Math.abs(m.textScale - 1) > SCALE_TOLERANCE) {
            return `text renders at ${m.textScale.toFixed(2)}x its set size (text autosizing?)`;
        }
        if (Math.abs(m.computedScale - 1) > SCALE_TOLERANCE) {
            return `text computes to ${m.computedScale.toFixed(2)}x its set size (text autosizing?)`;
        }
        return null;
    };

    const finish = (m: Measured, pages: SheetPages, fits: boolean, problem: string | null): SheetFit => {
        sheet.style.setProperty("--sb-size", `${m.px}px`);
        sheet.replaceChildren();
        const colEls: HTMLElement[][] = [];
        pages.forEach((cols, p) => {
            const built = buildPage(doc, p === 0 ? head : null);
            if (p < pages.length - 1) built.page.classList.add("sb-page-full");
            cols.forEach((col, c) => {
                for (const i of col) built.cols[c].appendChild(items[i]);
            });
            sheet.appendChild(built.page);
            colEls.push(built.cols);
        });
        return {
            px: m.px,
            fits,
            pages,
            probe: {
                source,
                limitPx: m.limit,
                firstCapPx: m.firstCap,
                restCapPx: m.restCap,
                itemHeights: m.heights,
                // Measured on the dealt sheet, not summed from itemHeights, so
                // the panel shows what the columns really came to.
                columnHeights: colEls.map((cols) => cols.map(columnContentHeight)),
                sheetWidthPx: sheetWidth,
                fontFamily,
                textScale: m.textScale,
                computedScale: m.computedScale,
                tried,
                problem,
            },
        };
    };

    /**
     * The layout for a measurement that can't be trusted: minimum size, one
     * page, columns balanced from whatever heights are usable: the measured
     * ones when they are finite, otherwise each matchup weighted by how much
     * text it has. `fits` is reported from the heights where they exist, so
     * the planner's "runs onto a second page" warning still has something to
     * go on, but the sheet itself is never paginated from numbers already
     * known to be wrong.
     */
    const fallback = (problem: string): SheetFit => {
        const m = measure(MIN_SHEET_PX);
        const usable = m.heights.every((h) => Number.isFinite(h) && h >= 0) && m.heights.some((h) => h >= 1);
        const weights = usable ? m.heights : items.map((el) => 40 + (el.textContent ?? "").length);
        const { columns, tallest } = balanceColumns(weights);
        return finish(m, [columns], usable ? tallest <= m.firstCap : true, problem);
    };

    const atMax = measure(MAX_SHEET_PX);
    const maxBroken = brokenWith(atMax);
    if (maxBroken) return fallback(maxBroken);
    if (atMax.fits) return finish(atMax, [atMax.columns], true, scaleWarning(atMax));

    let atMin = measure(MIN_SHEET_PX);
    const minBroken = brokenWith(atMin);
    if (minBroken) return fallback(minBroken);
    // Autosizing enlarges small text the most, so the smallest size is where
    // it shows; its warning goes with whatever layout is committed below.
    const warning = scaleWarning(atMin) ?? scaleWarning(atMax);
    if (!atMin.fits && limit < fullLimit) {
        // A shortened page (a phone's headroom, PHONE_PAGE_HEIGHT_IN) is a
        // preference, not a rule. A guide that only fits one page by using
        // the whole of it gets the whole of it: one full page risks the last
        // line of a column on a printer with unusually deep margins, while
        // two pages is certain to waste a sheet for the sake of a few lines.
        limit = fullLimit;
        atMin = measure(MIN_SHEET_PX);
    }
    if (!atMin.fits) {
        // Left at the minimum: it will print across two pages, but readably,
        // and filling column by column so page one is actually used.
        return finish(atMin, flowPages(atMin.heights, atMin.firstCap, atMin.restCap), false, warning);
    }

    let best = atMin; // measured to fit; its layout is the one committed
    let hi = MAX_SHEET_PX; // measured not to
    for (let i = 0; i < 16 && hi - best.px > 0.02; i++) {
        const m = measure((best.px + hi) / 2);
        if (m.fits && !brokenWith(m)) best = m;
        else hi = m.px;
    }

    return finish(best, [best.columns], true, warning);
}

/**
 * fitSheet on a throwaway copy of `sheet`, for when the sheet itself cannot be
 * touched (React renders it) or measured (it sits inside the display:none
 * .sb-print on screen, which has no size). The copy goes into an invisible
 * off-screen host in the same document, so it is styled by the same
 * stylesheets, and is removed again before this returns.
 *
 * The host is a direct child of <body>, which is also where SideboardPlanner
 * portals the real sheet, so the copy is measured in the context the printed
 * sheet is laid out in: same parent, same inherited styles, and a width that
 * nothing but the sheet's own 8.5in decides.
 */
export function fitDetached(sheet: HTMLElement, opts: Omit<FitOptions, "source"> = {}): SheetFit {
    const doc = sheet.ownerDocument;
    const host = doc.createElement("div");
    host.setAttribute("aria-hidden", "true");
    host.style.cssText =
        "position:absolute;left:-10000px;top:0;visibility:hidden;pointer-events:none;";
    const clone = sheet.cloneNode(true) as HTMLElement;
    host.appendChild(clone);
    doc.body.appendChild(host);
    try {
        return fitSheet(clone, { ...opts, source: "detached" });
    } finally {
        host.remove();
    }
}

/**
 * Measures the sheet React actually rendered (the one a phone prints) for the
 * ?printdebug=1 panel, so it can show whether the committed layout matches
 * the fit it came from. The sheet sits inside the display:none .sb-print on
 * screen, so `container` is shown off-screen and invisible for the length of
 * this call and put back exactly as it was. Nothing is moved.
 */
export function measureRendered(container: HTMLElement): {
    px: string;
    widthPx: number;
    pages: { columnHeights: number[]; bottomPx: number }[];
} {
    const before = container.getAttribute("style");
    container.style.cssText =
        "display:block;position:absolute;left:-10000px;top:0;visibility:hidden;pointer-events:none;";
    try {
        const sheet = container.querySelector<HTMLElement>(".sb-sheet");
        const top = sheet?.getBoundingClientRect().top ?? 0;
        const pages = Array.from(container.querySelectorAll<HTMLElement>(".sb-page")).map((page) => ({
            columnHeights: Array.from(page.querySelectorAll<HTMLElement>(".sb-col")).map(columnContentHeight),
            bottomPx: page.getBoundingClientRect().bottom - top,
        }));
        return {
            px: sheet?.style.getPropertyValue("--sb-size") ?? "",
            widthPx: sheet?.getBoundingClientRect().width ?? 0,
            pages,
        };
    } finally {
        if (before === null) container.removeAttribute("style");
        else container.setAttribute("style", before);
    }
}

/** The page height to fit to on this device: see PHONE_PAGE_HEIGHT_IN. */
export function printPageHeightIn(win: Window): number {
    return printsTopLevelOnly(win) ? PHONE_PAGE_HEIGHT_IN : LETTER_HEIGHT_IN;
}

/**
 * True where printing from a hidden iframe cannot be trusted, so Export has to
 * print the planner page itself.
 *
 * iOS and iPadOS Safari (and every iOS browser, all of which are WebKit)
 * ignore `iframe.contentWindow.print()` or print the top-level page in its
 * place, and phone browsers generally only honour print() inside the tap that
 * asked for it — an iframe's load event comes too late. There is no capability
 * to test for (print() exists and returns normally either way), so this goes
 * by the shape of the device: a touch-only primary pointer, or an Apple
 * touch device, which includes the iPad that reports itself as a Mac.
 *
 * Getting this wrong in either direction is survivable: the planner page's own
 * print styles show only the sheet, so the page path prints the same guide;
 * it just asks the browser to lay out more of the document to do it.
 */
export function printsTopLevelOnly(win: Window): boolean {
    const nav = win.navigator;
    const touchOnly =
        typeof win.matchMedia === "function" &&
        win.matchMedia("(hover: none) and (pointer: coarse)").matches;
    const appleTouch =
        /iPhone|iPad|iPod/.test(nav.userAgent) ||
        (/Macintosh/.test(nav.userAgent) && nav.maxTouchPoints > 1);
    return touchOnly || appleTouch;
}
