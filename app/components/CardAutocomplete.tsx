"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { DeckCard } from "@/lib/deckSections";

export interface CardRow {
    qty: number;
    name: string;
}

/**
 * One "N × Card Name" row inside an Out or In box.
 *
 * `options` is the deck section this row draws from — the maindeck for Out,
 * the sideboard for In — so the suggestions are always cards the user
 * actually has available, and the quantity can be clamped to the real count.
 */
export default function CardAutocomplete({
    row,
    options,
    placeholder,
    onChange,
    onRemove,
    onEnterCommit,
}: {
    row: CardRow;
    options: DeckCard[];
    placeholder: string;
    onChange: (next: CardRow) => void;
    onRemove: () => void;
    onEnterCommit?: () => void;
}) {
    const [open, setOpen] = useState(false);
    const [highlight, setHighlight] = useState(0);
    const wrapRef = useRef<HTMLDivElement>(null);
    const listId = useId();

    // The deck entry this row currently names, if any. Drives the quantity
    // ceiling and the "x in deck" hint.
    const matched = useMemo(
        () => options.find((o) => o.name.toLowerCase() === row.name.trim().toLowerCase()) ?? null,
        [options, row.name]
    );

    const maxQty = matched?.qty ?? 99;

    const suggestions = useMemo(() => {
        const q = row.name.trim().toLowerCase();
        if (!q) return options.slice(0, 12);

        // Prefix matches first — typing "sn" should surface "Snakeskin Veil"
        // above "Torpor Orb" even though neither is an exact hit.
        const starts: DeckCard[] = [];
        const contains: DeckCard[] = [];
        for (const o of options) {
            const n = o.name.toLowerCase();
            if (n === q) continue;
            if (n.startsWith(q)) starts.push(o);
            else if (n.includes(q)) contains.push(o);
        }
        return [...starts, ...contains].slice(0, 12);
    }, [options, row.name]);

    useEffect(() => {
        if (!open) return;
        const onDocPointerDown = (e: PointerEvent) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("pointerdown", onDocPointerDown);
        return () => document.removeEventListener("pointerdown", onDocPointerDown);
    }, [open]);

    const choose = (card: DeckCard) => {
        onChange({ name: card.name, qty: Math.min(Math.max(1, row.qty || 1), card.qty) });
        setOpen(false);
        setHighlight(0);
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (!open) { setOpen(true); return; }
            setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
        } else if (e.key === "Enter") {
            if (open && suggestions[highlight]) {
                e.preventDefault();
                choose(suggestions[highlight]);
            } else if (onEnterCommit) {
                e.preventDefault();
                onEnterCommit();
            }
        } else if (e.key === "Escape") {
            setOpen(false);
        }
    };

    const overMax = matched !== null && row.qty > matched.qty;

    return (
        <div ref={wrapRef} className="relative flex items-center gap-1.5 sm:gap-2">
            <input
                type="number"
                min={1}
                max={maxQty}
                value={row.qty}
                aria-label="Quantity"
                onChange={(e) => {
                    const raw = parseInt(e.target.value, 10);
                    const n = Number.isNaN(raw) ? 1 : raw;
                    onChange({ ...row, qty: Math.min(Math.max(1, n), maxQty) });
                }}
                className={
                    "w-12 sm:w-14 shrink-0 px-2 py-1 rounded bg-parchment text-ink text-sm shadow-inner-parchment " +
                    (overMax ? "ring-2 ring-red-600" : "")
                }
            />

            <div className="relative flex-1 min-w-0">
                <input
                    type="text"
                    role="combobox"
                    aria-expanded={open}
                    aria-controls={listId}
                    aria-autocomplete="list"
                    placeholder={placeholder}
                    value={row.name}
                    onChange={(e) => {
                        onChange({ ...row, name: e.target.value });
                        setOpen(true);
                        setHighlight(0);
                    }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={onKeyDown}
                    className="w-full px-2 py-1 rounded bg-parchment text-ink text-sm shadow-inner-parchment"
                />

                {open && suggestions.length > 0 && (
                    <ul
                        id={listId}
                        role="listbox"
                        className="absolute z-40 left-0 right-0 mt-1 max-h-52 overflow-y-auto rounded border border-line bg-parchment shadow-card"
                    >
                        {suggestions.map((s, i) => (
                            <li
                                key={s.name}
                                role="option"
                                aria-selected={i === highlight}
                                // Pointer-down rather than click: the input's
                                // blur would otherwise close the list before
                                // the click landed.
                                onMouseDown={(e) => { e.preventDefault(); choose(s); }}
                                onMouseEnter={() => setHighlight(i)}
                                className={
                                    "flex justify-between gap-2 px-2 py-1 text-sm cursor-pointer " +
                                    (i === highlight ? "bg-brass/30 text-ink" : "text-ink/90")
                                }
                            >
                                <span className="truncate">{s.name}</span>
                                <span className="shrink-0 text-ink/50">×{s.qty}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* No fixed width here. This hint used to reserve w-14 (56px) — as
                much as the quantity field — which on a 375px screen left the
                card name itself 39px, i.e. unreadable. It now takes only what
                it needs, and shrinks to a marker on small screens. */}
            {matched && (
                <span
                    className="shrink-0 text-xs text-ink/50 tabular-nums"
                    title={`You run ${matched.qty} of these`}
                >
                    /{matched.qty}
                </span>
            )}
            {!matched && row.name.trim() !== "" && (
                <span
                    className="shrink-0 text-xs text-amber-700"
                    title="Not in this part of your deck"
                >
                    <span className="sm:hidden" aria-hidden="true">!</span>
                    <span className="hidden sm:inline">not in list</span>
                    <span className="sr-only">Not in this part of your deck</span>
                </span>
            )}

            <button
                type="button"
                aria-label={`Remove ${row.name || "row"}`}
                onClick={onRemove}
                className="shrink-0 w-6 h-6 rounded text-ink/50 hover:text-red-700 hover:bg-red-700/10 leading-none"
            >
                ×
            </button>
        </div>
    );
}
