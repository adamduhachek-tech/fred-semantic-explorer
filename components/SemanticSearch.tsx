"use client";

import { useCallback, useEffect, useState } from "react";
import { loadSnapshot, type SnapshotData, type SnapshotEffect } from "@/lib/snapshot";
import { topK, type Hit } from "@/lib/search";

const OUTCOME: Record<string, { label: string; cls: string }> = {
  success: { label: "replicated", cls: "bg-emerald-50 text-emerald-700 ring-emerald-600/20" },
  failure: { label: "failed to replicate", cls: "bg-rose-50 text-rose-700 ring-rose-600/20" },
  mixed: { label: "mixed", cls: "bg-amber-50 text-amber-800 ring-amber-600/20" },
  inconclusive: { label: "inconclusive", cls: "bg-slate-100 text-slate-600 ring-slate-500/20" },
  other: { label: "uncoded", cls: "bg-zinc-100 text-zinc-500 ring-zinc-400/20" },
};

const EXAMPLES = [
  "power posing increases testosterone and feelings of power",
  "ego depletion: self-control is a limited resource that gets used up",
  "smiling makes cartoons seem funnier (facial feedback)",
  "growth mindset interventions improve academic achievement",
];

const K = 20;
const LOW_CONFIDENCE = 0.35;

function esPart(raw: string | null, type: string | null): string {
  if (!raw) return "—";
  return type ? `${type} = ${raw}` : raw;
}

function Badge({ outcome }: { outcome: string }) {
  const o = OUTCOME[outcome] ?? OUTCOME.other;
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${o.cls}`}>
      {o.label}
    </span>
  );
}

function doiUrl(doi: string): string {
  return doi.startsWith("http") ? doi : `https://doi.org/${doi}`;
}

function ResultCard({ e, score }: { e: SnapshotEffect; score: number }) {
  const hasEs = e.es_original_raw || e.es_replication_raw;
  return (
    <li className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <Badge outcome={e.outcome} />
        <span className="shrink-0 font-mono text-xs text-zinc-400" title="cosine similarity">
          {score.toFixed(3)}
        </span>
      </div>

      <p className="text-[0.95rem] leading-snug text-zinc-800">
        {e.description || e.title_original || "(no description)"}
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-zinc-500">
        {hasEs && (
          <span className="font-mono text-zinc-600">
            {esPart(e.es_original_raw, e.es_type_original)}
            <span className="mx-1.5 text-zinc-400">→</span>
            {esPart(e.es_replication_raw, e.es_type_replication)}
          </span>
        )}
        {(e.n_original != null || e.n_replication != null) && (
          <span>
            N {e.n_original ?? "?"} → {e.n_replication ?? "?"}
          </span>
        )}
        {e.author_overlap_pct != null && (
          <span title="share of replication authors who were also original authors">
            author overlap {Math.round(e.author_overlap_pct)}%
          </span>
        )}
        {e.discipline && <span className="text-zinc-400">{e.discipline}</span>}
      </div>

      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {e.doi_original && (
          <a className="text-blue-700 hover:underline" href={doiUrl(e.doi_original)} target="_blank" rel="noreferrer">
            original ↗
          </a>
        )}
        {e.doi_replication ? (
          <a className="text-blue-700 hover:underline" href={doiUrl(e.doi_replication)} target="_blank" rel="noreferrer">
            replication ↗
          </a>
        ) : e.url_replication ? (
          <a className="text-blue-700 hover:underline" href={e.url_replication} target="_blank" rel="noreferrer">
            replication ↗
          </a>
        ) : null}
      </div>
    </li>
  );
}

export default function SemanticSearch() {
  const [snap, setSnap] = useState<SnapshotData | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [searchedFor, setSearchedFor] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);

  useEffect(() => {
    loadSnapshot()
      .then(setSnap)
      .catch((e) => setLoadErr(String(e?.message ?? e)));
  }, []);

  const runSearch = useCallback(
    async (q: string) => {
      const text = q.trim();
      if (!text || !snap) return;
      setSearching(true);
      setSearchErr(null);
      setSearchedFor(text);
      try {
        const res = await fetch("/api/embed", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? res.statusText);
        }
        const { embedding } = (await res.json()) as { embedding: number[] };
        setHits(topK(embedding, snap, K));
      } catch (e) {
        setSearchErr(String((e as Error)?.message ?? e));
        setHits(null);
      } finally {
        setSearching(false);
      }
    },
    [snap],
  );

  const ready = Boolean(snap);
  const topScore = hits && hits.length ? hits[0].score : 0;
  const lowConfidence = hits != null && topScore < LOW_CONFIDENCE;

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          runSearch(query);
        }}
      >
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              runSearch(query);
            }
          }}
          rows={3}
          placeholder="Paste a claim, an abstract, or a citation — find the nearest replication findings by meaning."
          className="w-full resize-y rounded-lg border border-zinc-300 bg-white p-3 text-sm text-zinc-800 shadow-sm outline-none focus:border-zinc-500 focus:ring-2 focus:ring-zinc-200"
        />
        <div className="mt-2 flex items-center justify-between gap-3">
          <p className="text-xs text-zinc-400">
            {ready ? `${snap!.count.toLocaleString()} effects loaded · ⌘/Ctrl+Enter` : loadErr ? "" : "loading corpus…"}
          </p>
          <button
            type="submit"
            disabled={!ready || searching || !query.trim()}
            className="rounded-md bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {searching ? "Searching…" : "Search"}
          </button>
        </div>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => {
              setQuery(ex);
              runSearch(ex);
            }}
            disabled={!ready}
            className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs text-zinc-600 hover:bg-zinc-100 disabled:opacity-40"
          >
            {ex.length > 48 ? ex.slice(0, 46) + "…" : ex}
          </button>
        ))}
      </div>

      {loadErr && (
        <p className="mt-6 rounded-md bg-rose-50 p-3 text-sm text-rose-700">Could not load data: {loadErr}</p>
      )}
      {searchErr && (
        <p className="mt-6 rounded-md bg-rose-50 p-3 text-sm text-rose-700">Search failed: {searchErr}</p>
      )}

      {hits && !searchErr && (
        <section className="mt-6">
          {lowConfidence ? (
            <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center">
              <p className="text-sm font-medium text-zinc-700">No close match in the database.</p>
              <p className="mt-1 text-xs text-zinc-500">
                The nearest entry scored only {topScore.toFixed(3)} (cosine). Rather than rank noise, we
                surface nothing — try rephrasing the claim or using the wording of a specific finding.
              </p>
            </div>
          ) : (
            <>
              <p className="mb-3 text-xs text-zinc-500">
                Nearest {hits.length} findings to <span className="italic">“{searchedFor}”</span> — by meaning,
                not keywords.
              </p>
              <ul className="space-y-3">
                {hits.map((h) => (
                  <ResultCard key={h.index} e={snap!.effects[h.index]} score={h.score} />
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}
