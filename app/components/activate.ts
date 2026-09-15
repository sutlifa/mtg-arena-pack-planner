// app/components/activate.ts

import type { KeyboardEvent, PointerEvent } from "react";

/**
 * Props that make a control activate on pointer *and* on keyboard.
 *
 * Why this exists: the buttons in this app fire on `onPointerUp` rather than
 * `onClick`. That is deliberate — on touch devices a pointer-up handler fires
 * immediately, while `click` waits out the browser's tap/double-tap
 * disambiguation, which made the big "Analyze" and "Check Rotation" buttons
 * feel laggy on a phone.
 *
 * The cost is that a pointer-only button is invisible to anyone driving the
 * page from the keyboard: a native <button> activates on Enter/Space by
 * synthesising a *click*, and there is no click handler to receive it. The
 * control is focusable, looks focused, and then does nothing — which on
 * /rotation meant keyboard users could not use the tool at all.
 *
 * So every pointer-activated control gets both handlers, from here, as one
 * spread. Keeping the pair in a single helper is the point: two hand-written
 * handlers per button drift apart the moment someone adds a third button and
 * copies only the one they were looking at.
 *
 * `preventDefault()` on the key handler is load-bearing. Without it the
 * browser still synthesises its own click after Enter/Space, which would run
 * an ancestor's `onClick` a second time (the "?" help buttons sit inside
 * clickable rows), and Space would additionally scroll the page.
 */
export interface ActivateProps {
    onPointerUp: ((e: PointerEvent<HTMLElement>) => void) | undefined;
    onKeyDown: ((e: KeyboardEvent<HTMLElement>) => void) | undefined;
}

export interface ActivateOptions {
    /**
     * Mirrors the `disabled` attribute on the element. Disabled buttons do not
     * dispatch these events anyway in current browsers, but the call sites
     * that already guarded with `!loading ? handler : undefined` read the same
     * way through this option, and it keeps the guard next to the handler.
     */
    disabled?: boolean;
    /** For controls nested inside a clickable parent, e.g. HelpTip's "?". */
    stopPropagation?: boolean;
}

export function activate(handler: () => void, options: ActivateOptions = {}): ActivateProps {
    const { disabled = false, stopPropagation = false } = options;

    if (disabled) {
        return { onPointerUp: undefined, onKeyDown: undefined };
    }

    return {
        onPointerUp: (e) => {
            if (stopPropagation) e.stopPropagation();
            handler();
        },
        onKeyDown: (e) => {
            // Space is " " everywhere modern; "Spacebar" is the legacy IE/Edge
            // name and costs nothing to keep accepting.
            if (e.key !== "Enter" && e.key !== " " && e.key !== "Spacebar") return;

            e.preventDefault();
            if (stopPropagation) e.stopPropagation();
            handler();
        },
    };
}
