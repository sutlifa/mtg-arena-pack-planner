import Image from "next/image";
import { notFound } from "next/navigation";
import { signIn } from "@/auth";
import { isAuthConfigured } from "@/lib/authConfig";

export const metadata = {
    title: "Sign in — MTG Planning App",
    description: "Sign in with Google to save your sideboard guides, collections and comparisons.",
};

export default async function SignInPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
    // Nothing to sign in with on a deployment without Google credentials.
    if (!isAuthConfigured()) notFound();

    const { callbackUrl } = await searchParams;

    // A single leading slash is not enough: "//evil.com" also starts with "/"
    // and browsers read it as a protocol-relative URL, so that check alone
    // would send someone off-site straight after signing in. Require a second
    // character that is not a slash or backslash.
    const isSafeInternalPath =
        typeof callbackUrl === "string" &&
        callbackUrl.startsWith("/") &&
        !callbackUrl.startsWith("//") &&
        !callbackUrl.startsWith("/\\");
    const redirectTo = isSafeInternalPath ? (callbackUrl as string) : "/";

    return (
        <div className="px-3 sm:px-6 pt-8">
            <main className="max-w-md mx-auto py-16 px-3 sm:px-6 text-ink">
                <div className="bg-parchment-dark shadow-card rounded-lg p-8 space-y-6 text-center">
                    <Image
                        src="/art/mark.svg"
                        alt=""
                        aria-hidden="true"
                        width={64}
                        height={64}
                        className="mx-auto"
                    />

                    <div className="space-y-2">
                        <h1 className="font-title text-3xl">Sign in</h1>
                        <p className="text-sm text-ink/75 leading-relaxed">
                            Save your sideboard guides, collections and comparisons so you can pick
                            them up on another device. Every tool on this site works without an
                            account — signing in only adds somewhere to keep your work.
                        </p>
                    </div>

                    <form
                        action={async () => {
                            "use server";
                            await signIn("google", { redirectTo });
                        }}
                    >
                        <button
                            type="submit"
                            className="w-full px-6 py-3 rounded shadow-card font-title text-lg bg-brand text-midnight-light hover:bg-brand-dark transition-colors"
                        >
                            Continue with Google
                        </button>
                    </form>

                    <p className="text-xs text-ink/55 leading-relaxed">
                        We store your Google account&apos;s name, email and avatar, and whatever you
                        choose to save. See the{" "}
                        <a
                            href="/privacy"
                            className="text-brand underline underline-offset-2 hover:text-brand-dark"
                        >
                            privacy policy
                        </a>
                        .
                    </p>
                </div>
            </main>
        </div>
    );
}
