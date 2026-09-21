"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signOut } from "next-auth/react";

/** Delete one saved guide. */
export function DeleteGuideButton({ id, name }: { id: number; name: string }) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);

    const remove = async () => {
        if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;

        setBusy(true);
        try {
            const res = await fetch(`/api/guides/${id}`, { method: "DELETE" });
            if (res.ok) {
                // Re-fetch the server component rather than filtering a local
                // copy, so the list always reflects what the database actually
                // holds.
                router.refresh();
            } else {
                alert("Could not delete that guide.");
                setBusy(false);
            }
        } catch {
            alert("Could not delete that guide.");
            setBusy(false);
        }
    };

    return (
        <button
            type="button"
            onClick={busy ? undefined : remove}
            disabled={busy}
            className="shrink-0 px-3 py-2 rounded text-sm text-ink/60 hover:text-red-700 hover:bg-red-700/10 transition-colors disabled:opacity-50"
        >
            {busy ? "Deleting..." : "Delete"}
        </button>
    );
}

/**
 * Delete one saved collection or comparison.
 *
 * `kind` is the API segment, constrained to the two literals rather than an
 * open string so a caller cannot aim this at an arbitrary endpoint.
 */
export function DeleteSavedButton({
    kind,
    id,
    name,
}: {
    kind: "collections" | "analyses";
    id: number;
    name: string;
}) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);

    const remove = async () => {
        if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;

        setBusy(true);
        try {
            const res = await fetch(`/api/${kind}/${id}`, { method: "DELETE" });
            if (res.ok) router.refresh();
            else {
                alert("Could not delete that.");
                setBusy(false);
            }
        } catch {
            alert("Could not delete that.");
            setBusy(false);
        }
    };

    return (
        <button
            type="button"
            onClick={busy ? undefined : remove}
            disabled={busy}
            className="px-3 py-2 rounded text-sm text-ink/60 hover:text-red-700 hover:bg-red-700/10 transition-colors disabled:opacity-50"
        >
            {busy ? "Deleting..." : "Delete"}
        </button>
    );
}

/**
 * Duplicate one saved guide, collection or comparison.
 *
 * The copy is made entirely server-side (POST to .../copy with no body): the
 * saved plan or collection text never travels to the browser and back, so a
 * duplicate cannot be truncated by a size limit or overwritten by whatever
 * another tab happens to be holding. The new name is chosen by the server
 * too, which is the only place that can see every name the account already
 * uses.
 *
 * `kind` is the API segment, constrained to the three literals rather than an
 * open string so a caller cannot aim this at an arbitrary endpoint.
 */
export function DuplicateSavedButton({
    kind,
    id,
}: {
    kind: "guides" | "collections" | "analyses";
    id: number;
}) {
    const router = useRouter();
    const [busy, setBusy] = useState(false);

    const duplicate = async () => {
        setBusy(true);
        try {
            const res = await fetch(`/api/${kind}/${id}/copy`, { method: "POST" });
            if (res.ok) {
                // Re-fetch the server component rather than splicing a row
                // into a local copy, so the list shows the name the database
                // actually settled on.
                router.refresh();
                setBusy(false);
            } else {
                const data = await res.json().catch(() => ({}));
                alert(data.error ?? "Could not duplicate that.");
                setBusy(false);
            }
        } catch {
            alert("Could not duplicate that.");
            setBusy(false);
        }
    };

    return (
        <button
            type="button"
            onClick={busy ? undefined : duplicate}
            disabled={busy}
            className="px-3 py-2 rounded text-sm text-ink/60 hover:text-brand-dark hover:bg-brand/10 transition-colors disabled:opacity-50"
        >
            {busy ? "Copying..." : "Duplicate"}
        </button>
    );
}

/** Delete the account and everything attached to it. */
export function DeleteAccountButton() {
    const [busy, setBusy] = useState(false);

    const remove = async () => {
        if (
            !confirm(
                "Delete your account and everything saved to it?\n\n" +
                "This removes your saved guides and your account details permanently. It cannot be undone."
            )
        ) {
            return;
        }

        setBusy(true);
        try {
            const res = await fetch("/api/account", { method: "DELETE" });
            if (res.ok) {
                // The row is gone; the session cookie is not, so sign out
                // explicitly rather than leaving a token pointing at nothing.
                await signOut({ callbackUrl: "/" });
            } else {
                alert("Could not delete your account.");
                setBusy(false);
            }
        } catch {
            alert("Could not delete your account.");
            setBusy(false);
        }
    };

    return (
        <button
            type="button"
            onClick={busy ? undefined : remove}
            disabled={busy}
            className="px-4 py-2 rounded border border-red-700/40 text-sm text-red-700 hover:bg-red-700/10 transition-colors disabled:opacity-50"
        >
            {busy ? "Deleting..." : "Delete my account and saved data"}
        </button>
    );
}
