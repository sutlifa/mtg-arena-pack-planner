// lib/goldfishFetch.ts

/**
 * Shared, hardened fetch for MTGGoldfish.
 *
 * Extracted from /api/import-deck so every route that talks to MTGGoldfish
 * inherits the same protections rather than growing its own weaker copy:
 *
 *  - Only ever https, and only ever mtggoldfish.com. A request to any other
 *    host is never issued at all.
 *  - Redirects are followed by hand so the allowlist is re-checked at every
 *    hop. `fetch` follows them automatically by default, which would let a
 *    3xx from the upstream — not from anything the user controls — point the
 *    server at an internal address and, for calls whose body we return to the
 *    caller, hand that content back.
 *  - Every request is bounded by a timeout, and every body by a size cap.
 */

const GOLDFISH_UA = "MTG Arena Pack Planner (deck import)";

const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 3;

export function isGoldfishHost(url: URL): boolean {
    const host = url.hostname.toLowerCase();
    return host === "mtggoldfish.com" || host === "www.mtggoldfish.com";
}

function isAllowedTarget(url: URL): boolean {
    return url.protocol === "https:" && isGoldfishHost(url);
}

/**
 * Extra request options, for the metagame route's one POST. Only what that
 * needs: a method, a form body, and headers (cookie, CSRF token) layered on
 * top of the fixed User-Agent.
 */
export interface GoldfishInit {
    method?: "GET" | "POST";
    headers?: Record<string, string>;
    body?: string;
}

export async function goldfishFetch(
    startUrl: string,
    init: GoldfishInit = {}
): Promise<Response | null> {
    let current = startUrl;
    let method = init.method ?? "GET";
    let body = init.body;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        let parsed: URL;
        try {
            parsed = new URL(current);
        } catch {
            return null;
        }

        if (!isAllowedTarget(parsed)) return null;

        const res = await fetch(parsed.toString(), {
            method,
            headers: { ...init.headers, "User-Agent": GOLDFISH_UA },
            body,
            redirect: "manual",
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });

        if (res.status >= 300 && res.status < 400) {
            const location = res.headers.get("location");
            if (!location) return null;
            current = new URL(location, parsed).toString();
            // A redirect answers a POST with a page to GET, as browsers do;
            // re-sending the form body to wherever it points would be wrong.
            method = "GET";
            body = undefined;
            continue;
        }

        return res;
    }

    return null; // too many redirects
}

/**
 * Reads a response body, refusing anything implausibly large.
 *
 * Streamed and counted in bytes as it arrives, so the cap holds even when
 * there's no Content-Length (chunked responses): reading the whole body with
 * res.text() and measuring afterwards would already have buffered all of it.
 */
export async function readCappedText(res: Response, maxBytes: number): Promise<string | null> {
    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > maxBytes) return null;

    if (!res.body) return "";

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;

    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) {
            await reader.cancel().catch(() => {});
            return null;
        }
        chunks.push(value);
    }

    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return new TextDecoder().decode(bytes);
}
