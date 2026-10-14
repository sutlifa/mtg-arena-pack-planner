"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ModalFrame from "./ModalFrame";
import { useOptionalSession } from "./useOptionalSession";

/**
 * "You have unsaved changes — leave anyway?" for the Decks page, the
 * Sideboard Planner and the Collection page.
 *
 * The App Router has no way to block a <Link> navigation (there is no
 * routeChangeStart to cancel, as the Pages Router had), so this intercepts
 * the clicks itself: one capture-phase listener on `window`, which runs
 * before React's own listeners (attached to the document the app hydrates
 * into). A click it takes over is stopped there, so the Link's handler never
 * sees it, and the page's own dialog asks the question instead. Anything it
 * doesn't recognise as "leaving this page for another page on this site" is
 * left completely alone:
 *
 * - modified clicks (Ctrl/Cmd/Shift/Alt, middle button), target=_blank and
 *   downloads — they open somewhere else and this page stays as it is;
 * - other origins — a full page load, which `beforeunload` covers;
 * - the same path (a hash, or a query on this page) — not leaving;
 * - sign-in (/signin, /api/auth) — signing in is how a signed-out user gets
 *   to save, and the page's work is kept in this browser across it, so
 *   asking "leave without saving?" there would be asking the wrong question.
 *
 * Reload and tab close get the browser's own `beforeunload` prompt. Its text
 * can't be customised (browsers ignore it), so it's the generic "changes may
 * not be saved".
 *
 * Back and Forward are NOT intercepted. The usual trick — push a sentinel
 * history entry while there are unsaved changes, and treat its popstate as
 * "trying to leave" — fights the App Router: Next patches pushState to copy
 * its own tree into every entry and replays each popstate as a navigation,
 * the sentinel stays in history after an ordinary link-click away (so Back
 * from the next page lands on a duplicate of this one and needs pressing
 * twice), and the ?deck= / ?guide= loaders already rewrite this entry with
 * replaceState. That is flaky in exactly the way a guard must not be. What
 * covers Back instead: nothing is wiped when the page is left that way — the
 * draft stays in this browser — and the next visit's chooser offers to pick
 * up where you left off (see EntryChooser's `resume`).
 *
 * Besides links, a page can route its own switches through `request` —
 * opening another saved item, starting a new one, sending the deck to another
 * tool — so every "this replaces your work" question is the same dialog.
 */

/** What the user was trying to do when the dialog opened. */
export type GuardRequest =
    | { kind: "link"; href: string }
    | {
          kind: "action";
          run: () => void;
          /** The dialog's heading, e.g. `Open "Mono-Red"?` */
          title: string;
          /** What going ahead does to the work on the page. */
          consequence: string;
          /** The go-ahead button, signed in ("Save first" is the other). */
          proceedLabel?: string;
      };

/** Sign-in pages: leaving for these keeps the draft, so isn't guarded. */
const isAuthPath = (path: string) => path === "/signin" || path.startsWith("/api/auth");

export function useLeaveGuard({
    dirty,
    guardNavigation = dirty,
    onLeavePage,
}: {
    /** The page holds unsaved work: switching to something else asks first. */
    dirty: boolean;
    /**
     * Whether leaving the page asks too. The Collection page turns it off
     * when nobody can save: its collection stays in this browser either way,
     * so a prompt with nothing to offer would only nag.
     */
    guardNavigation?: boolean;
    /**
     * Runs whenever the page is left through an in-app link — straight away
     * when nothing is unsaved, or after the dialog's Leave / Save and leave.
     * The Decks page and the Sideboard Planner clear their drafts here, so
     * the next visit starts at the chooser rather than in yesterday's work.
     */
    onLeavePage?: () => void;
}) {
    const router = useRouter();
    const [pending, setPending] = useState<GuardRequest | null>(null);

    // The listeners are installed once and read the latest values through
    // refs, so typing (which flips `dirty` back and forth) doesn't tear them
    // down and re-add them on every keystroke.
    const dirtyRef = useRef(dirty);
    const guardNavRef = useRef(guardNavigation);
    const onLeaveRef = useRef(onLeavePage);
    useEffect(() => {
        dirtyRef.current = dirty;
        guardNavRef.current = guardNavigation;
        onLeaveRef.current = onLeavePage;
    });

    /**
     * Set just before a click on a sign-in link lets the browser go. Some of
     * those links are plain <a> tags — a full page load — and the
     * `beforeunload` prompt would otherwise fire for them, on top of a
     * journey that deliberately keeps the work. Stamped rather than a flag,
     * so a sign-in click that never turned into a navigation can't switch
     * the prompt off for good.
     */
    const authLeaveAt = useRef(0);

    useEffect(() => {
        const onClick = (e: MouseEvent) => {
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            const target = e.target instanceof Element ? e.target : null;
            const a = target?.closest("a[href]");
            if (!(a instanceof HTMLAnchorElement)) return;
            if ((a.target && a.target !== "_self") || a.hasAttribute("download")) return;

            const url = new URL(a.href, window.location.href);
            if (url.origin !== window.location.origin) return;
            if (url.pathname === window.location.pathname) return;
            if (isAuthPath(url.pathname)) {
                authLeaveAt.current = Date.now();
                return;
            }

            if (!dirtyRef.current || !guardNavRef.current) {
                // Nothing to lose (or nothing to offer): let the Link do its
                // job, after the page has tidied up.
                onLeaveRef.current?.();
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            setPending({ kind: "link", href: url.pathname + url.search + url.hash });
        };

        const onBeforeUnload = (e: BeforeUnloadEvent) => {
            if (!dirtyRef.current || !guardNavRef.current) return;
            if (Date.now() - authLeaveAt.current < 2000) return;
            e.preventDefault();
            // Still required by some browsers to show the prompt at all; the
            // text itself is ignored everywhere.
            e.returnValue = "";
        };

        window.addEventListener("click", onClick, true);
        window.addEventListener("beforeunload", onBeforeUnload);
        return () => {
            window.removeEventListener("click", onClick, true);
            window.removeEventListener("beforeunload", onBeforeUnload);
        };
    }, []);

    /** Do `req.run` now if nothing would be lost; otherwise ask first. */
    const request = (req: Omit<Extract<GuardRequest, { kind: "action" }>, "kind">) => {
        if (!dirtyRef.current) {
            req.run();
            return;
        }
        setPending({ kind: "action", ...req });
    };

    /** Go ahead with whatever was asked — after a save, or without one. */
    const proceed = () => {
        const p = pending;
        setPending(null);
        if (!p) return;
        if (p.kind === "action") {
            p.run();
            return;
        }
        onLeaveRef.current?.();
        router.push(p.href);
    };

    const stay = () => setPending(null);

    return { pending, request, proceed, stay };
}

/**
 * The dialog itself. Rendered by the page while `pending` is set, because
 * only the page knows how to save its own work: `renderSave` is that page's
 * existing save control (SaveToProfileButton, SaveWorkButton, DeckSaves'
 * button), told to call `done` once — and only once — a save succeeds. Its
 * errors and its name form are its own, so a save that fails shows why and
 * the dialog stays open.
 *
 * Signed out, or on a deployment without sign-in, there is no Save: it says
 * what leaving does and offers Leave or Stay, plus a sign-in link where
 * sign-in exists. Escape, the backdrop and Stay all mean "stay".
 *
 * The backdrop, the portal to <body>, the focus trap and focus return are
 * ModalFrame's, shared with the pages' older dialogs. The portal matters
 * here in particular: rendered in place, a sibling margin left the site
 * header clickable above the backdrop, so a second nav click moved focus
 * out of the dialog and quietly changed where "Leave" would go.
 */
export function LeaveDialog({
    pending,
    onStay,
    onProceed,
    authEnabled,
    noun,
    itemName,
    isSaved,
    clearsOnLeave,
    renderSave,
    note,
}: {
    pending: GuardRequest;
    onStay: () => void;
    onProceed: () => void;
    authEnabled: boolean;
    /** "deck", "sideboard guide", "collection". */
    noun: string;
    /** The open item's name, or a name typed for an unsaved one. */
    itemName: string | null;
    /** Whether a saved item is open — "unsaved changes to X" vs "X isn't saved". */
    isSaved: boolean;
    /** Leaving wipes the page (Decks, Sideboard) rather than keeping it locally (Collection). */
    clearsOnLeave: boolean;
    renderSave: (done: () => void, label: string) => React.ReactNode;
    /** Anything page-specific worth saying, such as why Save is unavailable. */
    note?: React.ReactNode;
}) {
    const { signedIn } = useOptionalSession();

    const canSave = authEnabled && signedIn;

    const quoted = itemName ? `“${itemName}”` : null;
    const situation = isSaved
        ? `You have unsaved changes to ${quoted ?? `this ${noun}`}.`
        : `${quoted ?? `This ${noun}`} isn't saved yet.`;
    const keep = isSaved ? "them" : "it";

    const leaving = pending.kind === "link";
    // Without sign-in on this deployment there is no "save first" to
    // suggest; the note below says so once instead of contradicting this.
    // Signed out with sign-in available, saving is one sign-in away, so the
    // advice stands beside the sign-in link.
    const consequence = leaving
        ? clearsOnLeave
            ? authEnabled
                ? `Leaving clears this page — save first to keep ${keep}.`
                : "Leaving clears this page."
            : !authEnabled
                ? "It stays in this browser."
                : isSaved
                    ? "It stays in this browser, but your profile still has the last saved version — save first to update it."
                    : "It stays in this browser, but it isn't in your profile — save first to keep a copy there."
        : pending.consequence;
    const title = leaving ? "Leave this page?" : pending.title;
    const saveLabel = leaving ? "Save and leave" : "Save first";
    const proceedLabel = leaving
        ? "Leave without saving"
        : (pending.proceedLabel ?? "Continue without saving");

    const here = typeof window === "undefined" ? "/" : window.location.pathname;

    return (
        <ModalFrame
            onCancel={onStay}
            labelledBy="leave-guard-title"
            describedBy="leave-guard-body"
            overlayClassName="sb-noprint"
            // overflow-wrap:anywhere: it quotes the item's name, which is
            // user text and can be one long unbroken token at 375px.
            boxClassName="bg-parchment rounded-lg shadow-card p-6 max-w-md w-full space-y-4 text-ink max-h-[90vh] overflow-y-auto [overflow-wrap:anywhere]"
        >
            <h3 id="leave-guard-title" className="font-title text-2xl">
                {title}
            </h3>
            <div id="leave-guard-body" className="space-y-2 leading-relaxed">
                <p>{situation}</p>
                <p>{consequence}</p>
            </div>

            {note}

            {!canSave && (
                <p className="text-sm text-amber-800 bg-amber-700/10 border border-amber-700/30 rounded px-3 py-2">
                    {authEnabled ? (
                        <>
                            Saving needs you to be signed in.{" "}
                            <Link
                                href={`/signin?callbackUrl=${encodeURIComponent(here)}`}
                                className="text-brand underline underline-offset-2 hover:text-brand-dark"
                            >
                                Sign in
                            </Link>{" "}
                            — what&apos;s here is kept in this browser while you do.
                        </>
                    ) : (
                        "There's nowhere to save on this site, so this can't be kept once it's gone."
                    )}
                </p>
            )}

            <div className="flex flex-wrap gap-2 justify-end pt-1">
                <button
                    type="button"
                    data-autofocus
                    onClick={onStay}
                    className="px-4 py-2 rounded text-sm text-ink/70 hover:bg-parchment-dark"
                >
                    Stay
                </button>
                <button
                    type="button"
                    onClick={onProceed}
                    className="px-4 py-2 rounded font-title text-sm border border-red-700/40 text-red-700 hover:bg-red-700/10"
                >
                    {proceedLabel}
                </button>
                {canSave && renderSave(onProceed, saveLabel)}
            </div>
        </ModalFrame>
    );
}
