"use client";

import { useEffect } from "react";

export default function AliasLoader() {
    useEffect(() => {
        fetch("/data/card-aliases.json")
            .then((r) => r.json())
            .then((data) => {
                // Store alias map globally
                (window as any).__CARD_ALIASES__ = data;

                // Global resolver function
                (window as any).resolveName = (name: string) => {
                    if (!name) return "";
                    const key = name.toLowerCase().trim();
                    return (window as any).__CARD_ALIASES__[key] ?? key;
                };
            })
            .catch((err) => {
                console.error("Failed to load alias map:", err);
            });
    }, []);

    return null;
}