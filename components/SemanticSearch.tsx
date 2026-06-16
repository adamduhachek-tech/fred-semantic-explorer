"use client";

import { useCallback, useEffect, useState } from "react";
import { loadSnapshot, type SnapshotData, type SnapshotEffect } from "@/lib/snapshot";
import { topK, type Hit } from "@/lib/search";
import { OUTCOME_META } from "@/lib/outcome";

const EXAMPLES = [
  "power posing increases testosterone and feelings of power",
  "ego depletion: self-control is a limited resource that gets used up",
  "smiling makes cartoons seem funnier (facial feedback)",
  "growth mindset interventions improve academic achievement",
];

const K = 20;
const LOW_CONFIDENCE = 0.35;

function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" className="opacity-20" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function Badge({ outcome }: { outcome: string }) {
  const o = OUTCOME_META[outcome as keyof typeof OUTCOME_META] ?? OUTCOME_META.other;
  return (
    <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${o.badge}`}>
      {o.label}
    </span>
  );
}

function esPart(raw: string | null, type: string | null): string {
  if (!raw) return "—";
  return type ? `${type} ${raw}` : raw;
}

function doiUrl(doi: string): string {
  return doi.startsWith("http") ? doi : `https://doi.org/${doi}`;
}

function ResultCard({ e, score, i }: { e: SnapshotEffect; score: number; i: number }) {
  const hasEs = Boolean(e.es_original_raw || e.es_replication_raw);
  const shrank =
    e.es_original != null && e.es_replication != null && Math.abs(e.es_replication) < Math.abs(e.es_original);
  return (
    <li
      className="group animate-in rounded-xl border border-zinc-200/80 bg-white p-4 shadow-sm transition duration-200 hover:border-zinc-300 hover:shadow-md"
      style={{ animationDelay: `${Math.min(i, 12) * 30}ms` }}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <Badge outcome={e.outcome} />
        <span className="flex items-center gap-1.5 text-[0.7rem] text-zinc-400" title="cosine similarity">
          <span className="h-1.5 w-12 overflow-hidden rounded-full bg-zinc-100">
            <span className="block h-full rounded-full bg-indigo-400" style={{ width: `${Math.round(score * 100)}%` }} />
          </span>
          <span className="font-mono tabular-nums text-zinc-500">{score.toFixed(2)}</span>
        </span>
      </div>

      <p className="text-[0.95rem] leading-snug text-zinc-800">
        {e.description || e.title_original || "(no description)"}
      </p>

      <div className="mt-2.5 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-zinc-500">
        {hasEs && (
          <span className="font-mono text-zinc-600" title="original → replication effect size">
            {esPart(e.es_original_raw, e.es_type_original)}
            <span className="mx-1.5 text-zinc-300">→</span>
            <span className={shrank ? "text-amber-700" : "text-zinc-600"}>
              {esPart(e.es_replication_raw, e.es_type_replication)}
            </span>
          </span>
        )}
        {(e.n_original != null || e.n_replication != null) && (
          <span>
            N {e.n_original ?? "?"} → {e.n_replication ?? "?"}
          </span>
        )}
        {e.author_overlap_pct != null && (
          <span title="share of replication authors who were also original authors">
            {Math.round(e.author_overlap_pct)}% author overlap
          </span>
        )}
        {e.discipline && <span className="text-zinc-400">{e.discipline}</span>}
      </div>

      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {e.doi_original && (
          <a className="font-medium text-indigo-600 hover:underline" href={doiUrl(e.doi_original)} target="_blank" rel="noreferrer">
            original ↗
          </a>
        )}
        {e.doi_replication ? (
          <a className="font-medium text-indigo-600 hover:underline" href={doiUrl(e.doi_replication)} target="_blank" rel="noreferrer">
            replication ↗
          </a>
        ) : e.url_replication ? (
          <a className="font-medium text-indigo-600 hover:underline" href={e.url_replication} target="_blank" rel="noreferrer">
            replication ↗
          </a>
        ) : null}
      </div>
    </li>
  );
}

function SkeletonCard() {
  return (
    <li className="animate-pulse rounded-xl border border-zinc-200/70 bg-white p-4 shadow-sm">
      <div className="mb-2 flex items-center justify-between">
        <div className="h-4 w-28 rounded bg-zinc-100" />
        <div className="h-3 w-14 rounded bg-zinc-100" />
      </div>
      <div className="h-3.5 w-full rounded bg-zinc-100" />
      <div className="mt-1.5 h-3.5 w-2/3 rounded bg-zinc-100" />
      <div className="mt-3 h-3 w-1/2 rounded bg-zinc-100" />
    </li>
  );
}

export default function SemanticSearch() {
  const [snap, setSnap] = useState<SnapshotData | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loadTick, setLoadTick] = useState(0);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [searchedFor, setSearchedFor] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchErr, setSearchErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoadErr(null);
    loadSnapshot()
      .then((s) => alive && setSnap(s))
      .catch((e) => alive && setLoadErr(String(e?.message ?? e)));
    return () => {
      alive = false;
    };
  }, [loadTick]);

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
        <div className="relative">
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
            className="w-full resize-y rounded-2xl border border-zinc-200 bg-white/80 p-4 text-[0.95rem] text-zinc-800 shadow-sm outline-none backdrop-blur transition placeholder:text-zinc-400 focus:border-indigo-300 focus:shadow-md focus:ring-4 focus:ring-indigo-100/70"
          />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-xs text-zinc-400">
            {ready
              ? `${snap!.count.toLocaleString()} effects loaded · ⌘/Ctrl+Enter`
              : loadErr
                ? ""
                : "loading corpus…"}
          </p>
          <button
            type="submit"
            disabled={!ready || searching || !query.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-500 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-zinc-300"
          >
            {searching && <Spinner className="h-4 w-4" />}
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
            className="rounded-full border border-zinc-200 bg-white/70 px-3 py-1 text-xs text-zinc-600 transition hover:border-indigo-200 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-40"
          >
            {ex.length > 48 ? ex.slice(0, 46) + "…" : ex}
          </button>
        ))}
      </div>

      {loadErr && (
        <div className="mt-6 flex flex-wrap items-center gap-3 rounded-xl bg-rose-50 p-4 text-sm text-rose-700 ring-1 ring-rose-100">
          <span>Could not load the corpus: {loadErr}</span>
          <button
            onClick={() => setLoadTick((t) => t + 1)}
            className="rounded-lg bg-rose-600 px-3 py-1 text-xs font-medium text-white transition hover:bg-rose-500"
          >
            Retry
          </button>
        </div>
      )}
      {searchErr && (
        <p className="mt-6 rounded-xl bg-rose-50 p-4 text-sm text-rose-700 ring-1 ring-rose-100">Search failed: {searchErr}</p>
      )}

      {searching && (
        <ul className="mt-6 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </ul>
      )}

      {!searching && hits && !searchErr && (
        <section className="mt-6">
          {lowConfidence ? (
            <div className="animate-in rounded-xl border border-dashed border-zinc-300 bg-zinc-50/60 p-8 text-center">
              <p className="text-sm font-medium text-zinc-700">No close match in the database.</p>
              <p className="mx-auto mt-1 max-w-md text-xs text-zinc-500">
                The nearest entry scored only {topScore.toFixed(3)} (cosine). Rather than rank noise, we surface
                nothing — try rephrasing the claim or using the wording of a specific finding.
              </p>
            </div>
          ) : (
            <>
              <p className="mb-3 text-xs text-zinc-500">
                Nearest {hits.length} findings to <span className="italic text-zinc-600">“{searchedFor}”</span> — by
                meaning, not keywords.
              </p>
              <ul className="space-y-3">
                {hits.map((h, i) => (
                  <ResultCard key={h.index} e={snap!.effects[h.index]} score={h.score} i={i} />
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </div>
  );
}
