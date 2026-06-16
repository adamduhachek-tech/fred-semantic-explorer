"use client";

import { useEffect, useMemo, useState } from "react";
import { loadSnapshot, type SnapshotData } from "@/lib/snapshot";
import { byYear, groupBy, overview, shrink, type Counts, type GroupStat, type YearBin } from "@/lib/analytics";
import { OUTCOME_META, OUTCOME_ORDER } from "@/lib/outcome";
import type { Outcome } from "@/lib/schema";

const pct = (n: number, d: number) => (d ? (100 * n) / d : 0);
const fmt = (n: number) => n.toLocaleString();

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500">
      {OUTCOME_ORDER.map((o) => (
        <span key={o} className="inline-flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: OUTCOME_META[o].hex }} />
          {OUTCOME_META[o].label}
        </span>
      ))}
    </div>
  );
}

function StackBar({ counts, total }: { counts: Counts; total: number }) {
  return (
    <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-zinc-100">
      {OUTCOME_ORDER.map((o) => {
        const w = pct(counts[o], total);
        if (w <= 0) return null;
        return (
          <div
            key={o}
            className="h-full"
            style={{ width: `${w}%`, background: OUTCOME_META[o].hex }}
            title={`${OUTCOME_META[o].label}: ${counts[o]} (${w.toFixed(0)}%)`}
          />
        );
      })}
    </div>
  );
}

function StatCard({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
      <div className="text-2xl font-semibold tabular-nums tracking-tight text-zinc-900">{value}</div>
      <div className="mt-0.5 text-xs font-medium text-zinc-500">{label}</div>
      {sub && <div className="mt-0.5 text-[0.7rem] text-zinc-400">{sub}</div>}
    </div>
  );
}

function GroupRow({ g }: { g: GroupStat }) {
  return (
    <div className="py-2">
      <div className="flex items-baseline justify-between gap-3">
        <span className="truncate text-sm text-zinc-700" title={g.key}>
          {g.key}
        </span>
        <span className="flex shrink-0 items-baseline gap-3 text-xs tabular-nums">
          <span className="text-zinc-400" title="number of replication effects">
            {fmt(g.total)}
          </span>
          <span className="w-9 text-right font-semibold text-zinc-700" title="replication rate (successes ÷ coded)">
            {(g.repRate * 100).toFixed(0)}%
          </span>
        </span>
      </div>
      <div className="mt-1.5">
        <StackBar counts={g.counts} total={g.total} />
      </div>
    </div>
  );
}

function GroupSection({
  title,
  subtitle,
  groups,
}: {
  title: string;
  subtitle: string;
  groups: GroupStat[];
}) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold tracking-tight text-zinc-900">{title}</h2>
        <span className="hidden text-[0.7rem] uppercase tracking-wide text-zinc-400 sm:block">
          n · replicated
        </span>
      </div>
      <p className="mb-3 text-xs text-zinc-500">{subtitle}</p>
      <div className="divide-y divide-zinc-100">
        {groups.map((g) => (
          <GroupRow key={g.key} g={g} />
        ))}
      </div>
    </section>
  );
}

function YearChart({ bins }: { bins: YearBin[] }) {
  const W = 720;
  const H = 200;
  const PAD = { l: 28, r: 8, t: 8, b: 22 };
  const max = Math.max(1, ...bins.map((b) => b.total));
  const bw = (W - PAD.l - PAD.r) / bins.length;
  const yScale = (v: number) => (H - PAD.b - PAD.t) * (v / max);

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="mb-1 text-sm font-semibold tracking-tight text-zinc-900">Replications over time</h2>
      <p className="mb-3 text-xs text-zinc-500">
        Effects by original publication year, stacked by replication outcome.
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="replications by year">
        {[0, 0.5, 1].map((f) => {
          const y = PAD.t + (H - PAD.b - PAD.t) * (1 - f);
          return (
            <g key={f}>
              <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="#f4f4f5" />
              <text x={4} y={y + 3} fontSize={9} fill="#a1a1aa">
                {Math.round(max * f)}
              </text>
            </g>
          );
        })}
        {bins.map((b, i) => {
          const x = PAD.l + i * bw;
          let yTop = H - PAD.b;
          return (
            <g key={b.year}>
              {OUTCOME_ORDER.map((o) => {
                const h = yScale(b.counts[o]);
                if (h <= 0) return null;
                yTop -= h;
                return (
                  <rect
                    key={o}
                    x={x + 1}
                    y={yTop}
                    width={Math.max(0, bw - 2)}
                    height={h}
                    fill={OUTCOME_META[o].hex}
                  >
                    <title>{`${b.year} · ${OUTCOME_META[o].label}: ${b.counts[o]}`}</title>
                  </rect>
                );
              })}
              {b.year % 5 === 0 && (
                <text x={x + bw / 2} y={H - 6} fontSize={9} fill="#a1a1aa" textAnchor="middle">
                  {b.year}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </section>
  );
}

function ShrinkPanel({ data }: { data: ReturnType<typeof shrink> }) {
  const S = 240;
  const PAD = 26;
  const sc = (v: number) => PAD + ((v + 1) / 2) * (S - 2 * PAD); // map [-1,1] -> [PAD, S-PAD]
  const scY = (v: number) => S - sc(v);
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="mb-1 text-sm font-semibold tracking-tight text-zinc-900">Effects shrink on replication</h2>
      <p className="mb-3 text-xs text-zinc-500">
        Original vs. replication effect size, among {fmt(data.points.length)} Pearson-<em>r</em> pairs. Points below
        the diagonal shrank.
      </p>
      <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <svg viewBox={`0 0 ${S} ${S}`} className="w-full max-w-[260px] shrink-0" role="img" aria-label="effect size scatter">
          <rect x={PAD} y={PAD} width={S - 2 * PAD} height={S - 2 * PAD} fill="none" stroke="#f4f4f5" />
          <line x1={sc(0)} y1={PAD} x2={sc(0)} y2={S - PAD} stroke="#e4e4e7" />
          <line x1={PAD} y1={scY(0)} x2={S - PAD} y2={scY(0)} stroke="#e4e4e7" />
          <line x1={sc(-1)} y1={scY(-1)} x2={sc(1)} y2={scY(1)} stroke="#a1a1aa" strokeDasharray="3 3" />
          {data.points.map((p, i) => (
            <circle key={i} cx={sc(p.o)} cy={scY(p.r)} r={2.2} fill={OUTCOME_META[p.outcome].hex} fillOpacity={0.55} />
          ))}
          <text x={S / 2} y={S - 6} fontSize={9} fill="#a1a1aa" textAnchor="middle">
            original r →
          </text>
          <text x={10} y={S / 2} fontSize={9} fill="#a1a1aa" textAnchor="middle" transform={`rotate(-90 10 ${S / 2})`}>
            replication r →
          </text>
        </svg>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-1">
          <div>
            <div className="text-xl font-semibold tabular-nums text-zinc-900">{data.medianO.toFixed(2)}</div>
            <div className="text-[0.7rem] text-zinc-500">median original |r|</div>
          </div>
          <div>
            <div className="text-xl font-semibold tabular-nums text-zinc-900">{data.medianR.toFixed(2)}</div>
            <div className="text-[0.7rem] text-zinc-500">median replication |r|</div>
          </div>
          <div>
            <div className="text-xl font-semibold tabular-nums text-zinc-900">{(data.shrankPct * 100).toFixed(0)}%</div>
            <div className="text-[0.7rem] text-zinc-500">shrank toward zero</div>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Dashboard() {
  const [snap, setSnap] = useState<SnapshotData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [jtab, setJtab] = useState<"volume" | "rate">("volume");

  useEffect(() => {
    loadSnapshot()
      .then(setSnap)
      .catch((e) => setErr(String(e?.message ?? e)));
  }, []);

  const a = useMemo(() => {
    if (!snap) return null;
    const e = snap.effects;
    const journalsAll = groupBy(e, (x) => x.journal_original);
    return {
      ov: overview(e),
      journals: journalsAll.slice(0, 15),
      journalsByRate: journalsAll
        .filter((g) => g.total >= 10)
        .sort((p, q) => q.repRate - p.repRate || q.total - p.total)
        .slice(0, 18),
      disciplines: groupBy(e, (x) => x.discipline).slice(0, 12),
      years: byYear(e),
      shr: shrink(e),
    };
  }, [snap]);

  if (err) return <p className="rounded-md bg-rose-50 p-4 text-sm text-rose-700">Could not load data: {err}</p>;
  if (!a) return <p className="py-20 text-center text-sm text-zinc-400">Loading {snap ? "" : "corpus"}…</p>;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard value={fmt(a.ov.total)} label="replication effects" sub={`${fmt(a.ov.origPapers)} original papers`} />
        <StatCard value={fmt(a.ov.journals)} label="journals" />
        <StatCard value={fmt(a.ov.disciplines)} label="disciplines" />
        <StatCard
          value={`${(a.ov.repRate * 100).toFixed(0)}%`}
          label="replicated"
          sub={`of ${fmt(a.ov.total - a.ov.outcome.other)} coded`}
        />
      </div>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold tracking-tight text-zinc-900">Overall outcome mix</h2>
          <Legend />
        </div>
        <StackBar counts={a.ov.outcome} total={a.ov.total} />
        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs tabular-nums text-zinc-500">
          {OUTCOME_ORDER.map((o) => (
            <span key={o}>
              {OUTCOME_META[o].label} {fmt(a.ov.outcome[o])} ({pct(a.ov.outcome[o], a.ov.total).toFixed(0)}%)
            </span>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold tracking-tight text-zinc-900">By journal</h2>
          <div className="flex rounded-lg bg-zinc-100 p-0.5 text-xs font-medium">
            {(
              [
                ["volume", "Most studied"],
                ["rate", "Replication rate"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                onClick={() => setJtab(id)}
                className={`rounded-md px-2.5 py-1 transition ${
                  jtab === id ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <p className="mb-3 text-xs text-zinc-500">
          {jtab === "volume"
            ? "Top 15 source journals by number of replication effects. Bars show the outcome mix; the right figure is the replication rate among coded effects."
            : "Journals with ≥ 10 effects, ranked by replication rate (successes ÷ coded effects). Higher = findings held up more often on replication."}
        </p>
        <div className="mb-1.5 hidden text-right text-[0.7rem] uppercase tracking-wide text-zinc-400 sm:block">
          n · replicated
        </div>
        <div className="divide-y divide-zinc-100">
          {(jtab === "volume" ? a.journals : a.journalsByRate).map((g) => (
            <GroupRow key={g.key} g={g} />
          ))}
        </div>
      </section>

      <GroupSection
        title="By discipline"
        subtitle="Top 12 disciplines by number of replication effects."
        groups={a.disciplines}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <YearChart bins={a.years} />
        <ShrinkPanel data={a.shr} />
      </div>
    </div>
  );
}
