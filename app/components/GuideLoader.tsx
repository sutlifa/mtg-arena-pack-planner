"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Loads a saved guide into the planner when the URL carries ?guide=<id>.
 *
 * This is the half of "save to profile" that was missing. The profile page's
 * Open button has always linked to /sideboard?guide=<id>, and the API to fetch
 * one has always existed, but nothing ever read the parameter — so opening a
 * saved guide silently fell through to whatever was in localStorage. On a
 * second machine, where localStorage is empty, that looked identical to the
 * saved work having been erased: the profile listed the right matchup count
 * (read from the database) while the editor showed nothing.
 *
 * Kept as its own component, wrapped in Suspense by the parent, because
 * useSearchParams opts a component out of prerendering and /sideboard is a
 * static page. Doing this inline would have made the whole route dynamic.
 */
export default function GuideLoader({
    onLoad,
}: {
    /**
     * The plan, plus which row it came from. The planner records the id and
     * name so a later Save can update THIS guide instead of making the user
     * retype its name to overwrite it — and so it can say which guide is
     * open. They are passed separately rather than read out of the plan JSON
     * because a plan saved from an already-open guide carries the id it had
     * when it was written, which is not necessarily the row just fetched.
     */
    onLoad: (plan: Record<string, unknown>, opened: { id: number; name: string }) => void;
}) {
    const searchParams = useSearchParams();
    const guideId = searchParams.get("guide");
    // The message is tied to the guide it describes rather than held loose.
    // Deriving visibility from that means navigating back to a bare
    // /sideboard hides it for free — no effect needed to clear it, and no
    // window where an error about X sits above a page that isn't X.
    const [status, setStatus] = useState<{ id: string; message: string } | null>(null);
    const message = status && status.id === guideId ? status.message : null;

    // The parent recreates onLoad every render; a ref keeps it out of the
    // dependency list so the fetch runs once per id rather than per keystroke.
    const onLoadRef = useRef(onLoad);
    useEffect(() => {
        onLoadRef.current = onLoad;
    }, [onLoad]);

    useEffect(() => {
        if (!guideId) return;

        let cancelled = false;

        (async () => {
            try {
                const res = await fetch(`/api/guides/${guideId}`);

                if (res.status === 401) {
                    if (!cancelled) setStatus({ id: guideId, message: "Sign in to open that saved guide." });
                    return;
                }
                if (res.status === 404) {
                    if (!cancelled) setStatus({ id: guideId, message: "That guide no longer exists." });
                    return;
                }
                if (!res.ok) {
                    if (!cancelled) setStatus({ id: guideId, message: "Could not open that guide." });
                    return;
                }

                const { guide } = await res.json();
                if (cancelled || !guide?.plan) return;

                onLoadRef.current(guide.plan as Record<string, unknown>, {
                    id: guide.id,
                    name: guide.name,
                });
                // No "Opened X" line on success: the Editing bar at the top of
                // the planner already names the guide, so it only repeated it.
                // This component speaks up only when the open fails.
            } catch {
                if (!cancelled) setStatus({ id: guideId, message: "Could not open that guide." });
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [guideId]);

    if (!message) return null;

    return (
        <p className="sb-noprint text-sm text-center text-ink/80" role="status">
            {message}
        </p>
    );
}
