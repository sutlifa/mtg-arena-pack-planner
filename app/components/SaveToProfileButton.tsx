"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";

/**
 * The Save to Profile control, split out of SideboardPlanner so that
 * `useSession` is only ever called where a SessionProvider exists.
 *
 * On a deployment without Google credentials the provider isn't mounted at
 * all (see Providers), and calling useSession without one throws during
 * prerendering — which broke the build the first time this lived inside the
 * planner. Keeping the hook in a component that is itself conditionally
 * rendered is what makes "auth is optional" actually hold.
 */
export default function SaveToProfileButton({
    plan,
    format,
    formatLabel,
}: {
    plan: unknown;
    format: string;
    formatLabel: string;
}) {
    const { data: session } = useSession();
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<string | null>(null);

    if (!session?.user) {
        return (
            <a
                href="/signin?callbackUrl=%2Fsideboard"
                className="px-6 py-3 rounded shadow-card font-title text-xl bg-parchment text-ink hover:bg-parchment/70"
            >
                Sign in to Save
            </a>
        );
    }

    const save = async () => {
        const name = window.prompt("Save this guide as:", `${formatLabel} sideboard guide`);
        if (name === null) return; // cancelled
        if (!name.trim()) {
            setMessage("Give the guide a name.");
            return;
        }

        setSaving(true);
        setMessage(null);
        try {
            const res = await fetch("/api/guides", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                // The whole plan goes up as-is: it is the same object already
                // kept in localStorage, so a saved guide and a local one are
                // the same shape and load into the editor identically.
                body: JSON.stringify({ name: name.trim(), format, plan }),
            });
            const data = await res.json().catch(() => ({}));

            if (res.status === 401) setMessage("Sign in first to save to your profile.");
            else if (!res.ok) setMessage(data.error ?? "Could not save that guide.");
            else setMessage(`Saved as "${data.name}".`);
        } catch {
            setMessage("Could not save that guide.");
        }
        setSaving(false);
    };

    return (
        <>
            <button
                type="button"
                onClick={saving ? undefined : save}
                disabled={saving}
                className={
                    "px-6 py-3 rounded shadow-card font-title text-xl " +
                    (saving
                        ? "bg-gray-400 cursor-not-allowed text-midnight-light"
                        : "bg-brand text-midnight-light hover:bg-brand-dark")
                }
            >
                {saving ? "Saving..." : "Save to Profile"}
            </button>

            {message && (
                <p className="w-full text-sm text-center text-ink/80" role="status">
                    {message}
                </p>
            )}
        </>
    );
}
