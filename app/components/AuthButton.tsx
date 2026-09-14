"use client";

import Image from "next/image";
import Link from "next/link";
import { signOut, useSession } from "next-auth/react";

export default function AuthButton() {
    const { data: session, status } = useSession();

    // Render nothing rather than a placeholder while the session resolves —
    // a button that flips from "Sign in" to a name is more distracting than
    // one that simply appears.
    if (status === "loading") {
        return <span className="w-24 h-8 shrink-0" aria-hidden="true" />;
    }

    if (!session?.user) {
        return (
            <Link
                href="/signin"
                className="px-3 py-1.5 rounded text-sm font-semibold tracking-wide text-midnight-light hover:bg-white/10 transition-colors"
            >
                Sign in
            </Link>
        );
    }

    return (
        <div className="flex items-center gap-2">
            <Link
                href="/profile"
                className="flex items-center gap-2 px-2 py-1 rounded hover:bg-white/10 transition-colors"
                title={session.user.email ?? undefined}
            >
                {session.user.image && (
                    <Image
                        src={session.user.image}
                        alt=""
                        width={24}
                        height={24}
                        className="rounded-full shrink-0"
                        unoptimized
                    />
                )}
                <span className="text-sm text-midnight-light max-w-28 truncate">
                    {session.user.name ?? "Profile"}
                </span>
            </Link>

            <button
                type="button"
                onClick={() => signOut()}
                className="px-2 py-1 rounded text-xs text-midnight-light/70 hover:text-brass-light hover:bg-white/10 transition-colors"
            >
                Sign out
            </button>
        </div>
    );
}
