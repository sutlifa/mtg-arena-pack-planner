"use client";

import React, { useState, useEffect } from "react";

export default function Page() {
  const [decks, setDecks] = useState([
    { name: "Deck 1", text: "" },
    { name: "Deck 2", text: "" },
  ]);

  const [collectionText, setCollectionText] = useState("");
  const [disableArena, setDisableArena] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [setRankings, setSetRankings] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setResults([]);
    setSetRankings([]);
    setError("");
  }, [disableArena]);

  async function analyze() {
    setBusy(true);
    setError("");
    setResults([]);
    setSetRankings([]);

    const cleanedDecks = decks
      .map((d) => ({ ...d, text: d.text.trim() }))
      .filter((d) => d.text.length > 0);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decks: cleanedDecks,
          collectionText,
          disableArena,
        }),
      });

      const data = await res.json();

      if (data.error) {
        setError(data.error);
      } else {
        setResults(data.results || []);
        setSetRankings(data.setRankings || []);
      }
    } catch (err: any) {
      setError(String(err));
    }

    setBusy(false);
  }

  return (
    <main className="p-8 max-w-5xl mx-auto space-y-10">
      <h1 className="text-4xl font-bold">MTG Arena Pack Planner</h1>

      <section>
        <h2 className="text-2xl font-semibold mb-3">Decks</h2>

        {decks.map((deck, index) => (
          <div key={index} className="mb-6">
            <label className="font-semibold">{deck.name}</label>
            <textarea
              className="w-full border p-2 rounded mt-2"
              rows={6}
              value={deck.text}
              onChange={(e) =>
                setDecks(
                  decks.map((d, i) =>
                    i === index ? { ...d, text: e.target.value } : d
                  )
                )
              }
            />
          </div>
        ))}

        <button
          className="px-4 py-2 bg-gray-200 rounded shadow"
          onClick={() =>
            setDecks([
              ...decks,
              { name: `Deck ${decks.length + 1}`, text: "" },
            ])
          }
        >
          Add Another Deck
        </button>
      </section>

      {!disableArena && (
        <section>
          <h2 className="text-2xl font-semibold mb-3">
            Arena Collection (optional)
          </h2>
          <textarea
            className="w-full border p-2 rounded"
            rows={8}
            value={collectionText}
            onChange={(e) => setCollectionText(e.target.value)}
          />
        </section>
      )}

      <section>
        <label className="flex items-center gap-2 text-lg">
          <input
            type="checkbox"
            className="w-5 h-5"
            checked={disableArena}
            onChange={(e) => setDisableArena(e.target.checked)}
          />
          Turn off Arena comparison
        </label>
      </section>

      <section>
        <button
          className="px-6 py-3 bg-blue-600 text-white rounded shadow"
          disabled={busy}
          onClick={analyze}
        >
          {busy ? "Analyzing..." : "Analyze"}
        </button>
      </section>

      {error && (
        <div className="p-4 bg-red-100 border border-red-300 text-red-700 rounded">
          {error}
        </div>
      )}

      {disableArena && results.length > 0 && (
        <section className="mt-12">
          <h2 className="text-3xl font-bold mb-4">Shopping List</h2>
          {results.map((r: any) => (
            <div
              key={r.card}
              className="p-4 border rounded shadow bg-white mb-3"
            >
              <div className="text-xl font-semibold">{r.card}</div>
              <p>
                <strong>Needed:</strong> {r.needed}
              </p>
            </div>
          ))}
        </section>
      )}

      {!disableArena && setRankings.length > 0 && (
        <section className="mt-12">
          <h2 className="text-3xl font-bold mb-6">
            📦 Best Sets to Buy Packs From
          </h2>

          {setRankings.map((set: any, i: number) => (
            <div
              key={set.setCode}
              className="p-4 mb-6 border rounded shadow bg-white"
            >
              <h3 className="text-xl font-bold mb-1">
                {i + 1}. {set.setName} ({set.setCode})
              </h3>
              <p className="text-sm text-gray-600 mb-2">
                Release: {set.release}
              </p>

              <p>
                <strong>Total Needed Copies:</strong> {set.totalCopies}
              </p>
              <p>
                <strong>Unique Cards Covered:</strong> {set.uniqueCards}
              </p>

              <details className="border-t pt-2 mt-2">
                <summary className="cursor-pointer text-blue-600">
                  View Covered Cards
                </summary>
                <ul className="list-disc ml-6 mt-2">
                  {set.cards.map((c: string) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </details>
            </div>
          ))}
        </section>
      )}

      {!disableArena && results.length > 0 && (
        <section className="mt-12">
          <h2 className="text-3xl font-bold mb-6">Card-by-Card Breakdown</h2>

          {results.map((r: any) => (
            <div
              key={r.card}
              className="p-4 border rounded shadow bg-white mb-4"
            >
              <div className="text-xl font-semibold mb-1">{r.card}</div>

              <p>
                <strong>Needed:</strong> {r.needed}
              </p>

              {!r.lookup && (
                <p className="text-red-600">
                  Arena data missing — re-run analysis
                </p>
              )}

              {r.lookup && !r.lookup.ok && (
                <p className="text-red-600">Not on Arena</p>
              )}

              {r.lookup && r.lookup.ok && (
                <>
                  <p>
                    <strong>Latest Arena Print:</strong>{" "}
                    {r.lookup.latestArenaPrint?.set_name ?? "Not on Arena"}
                  </p>

                  <p>
                    <strong>Recommended Pack:</strong>{" "}
                    {r.lookup.recommendedPackPrint?.set_name ??
                      "Craft Only / No Pack Source"}
                  </p>
                </>
              )}
            </div>
          ))}
        </section>
      )}
    </main>
  );
}