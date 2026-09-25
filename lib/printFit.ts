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
 * The measured layout if it still describes `count` matchups, else the
 * fallback. A layout from before a matchup was added or removed would drop a
 * matchup from the printout or point past the end of the list, so it is
 * checked, not trusted.
 */
export function pagesFor(fit: SheetFit | null, count: number): SheetPages {
    if (fit) {
        const flat = fit.pages.flat(2);
        if (flat.length === count && flat.every((v, i) => v === i)) return fit.pages;
    }
    return fallbackPages(count);
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
 * measured as fitting. Height against text size is *nearly* monotonic, not
 * quite — balancing three columns around matchups that must not split can make
 * a slightly larger size pack a little tighter — so the answer is never
 * interpolated or rounded after the fact. It is always a size that was seen to
 * fit.
 */
export function fitSheet(sheet: HTMLElement): SheetFit {
    const doc = sheet.ownerDocument;
    const view = doc.defaultView;
    const limit = PAGE_HEIGHT_IN * CSS_PX_PER_IN - SAFETY_PX;

    const head = sheet.querySelector<HTMLElement>(".sb-sheet-head");
    const items = Array.from(sheet.querySelectorAll<HTMLElement>(".sb-item"));

    // The measuring layout: one page, every matchup stacked in the first
    // column. All three columns are the same width, so a matchup's height here
    // is its height in whichever column it ends up in.
    const probe = buildPage(doc, head);
    sheet.replaceChildren(probe.page);
    for (const item of items) probe.cols[0].appendChild(item);

    const pad = view ? view.getComputedStyle(probe.page) : null;
    const padTop = pad ? parseFloat(pad.paddingTop) || 0 : 0;
    const padBottom = pad ? parseFloat(pad.paddingBottom) || 0 : 0;

    const measure = (px: number) => {
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
        return { heights, firstCap, restCap, columns, fits: tallest <= firstCap };
    };

    const finish = (px: number, m: ReturnType<typeof measure>): SheetFit => {
        const pages = m.fits ? [m.columns] : flowPages(m.heights, m.firstCap, m.restCap);
        sheet.replaceChildren();
        pages.forEach((cols, p) => {
            const { page, cols: colEls } = buildPage(doc, p === 0 ? head : null);
            if (p < pages.length - 1) page.classList.add("sb-page-full");
            cols.forEach((col, c) => {
                for (const i of col) colEls[c].appendChild(items[i]);
            });
            sheet.appendChild(page);
        });
        return { px, fits: m.fits, pages };
    };

    const atMax = measure(MAX_SHEET_PX);
    if (atMax.fits) return finish(MAX_SHEET_PX, atMax);

    const atMin = measure(MIN_SHEET_PX);
    if (!atMin.fits) {
        // Left at the minimum: it will print across two pages, but readably,
        // and filling column by column so page one is actually used.
        return finish(MIN_SHEET_PX, atMin);
    }

    let lo = MIN_SHEET_PX; // known to fit
    let hi = MAX_SHEET_PX; // known not to
    for (let i = 0; i < 16 && hi - lo > 0.02; i++) {
        const mid = (lo + hi) / 2;
        if (measure(mid).fits) lo = mid;
        else hi = mid;
    }

    return finish(lo, measure(lo));
}

/**
 * fitSheet on a throwaway copy of `sheet`, for when the sheet itself cannot be
 * touched (React renders it) or measured (it sits inside the display:none
 * .sb-print on screen, which has no size). The copy goes into an invisible
 * off-screen host in the same document, so it is styled by the same
 * stylesheets, and is removed again before this returns.
 */
export function fitDetached(sheet: HTMLElement): SheetFit {
    const doc = sheet.ownerDocument;
    const host = doc.createElement("div");
    host.setAttribute("aria-hidden", "true");
    host.style.cssText =
        "position:absolute;left:-10000px;top:0;visibility:hidden;pointer-events:none;";
    const clone = sheet.cloneNode(true) as HTMLElement;
    host.appendChild(clone);
    doc.body.appendChild(host);
    try {
        return fitSheet(clone);
    } finally {
        host.remove();
    }
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
