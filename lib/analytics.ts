/** Pure aggregations for the dashboard, computed client-side from the snapshot. */
import type { SnapshotEffect } from "./snapshot";
import type { Outcome } from "./schema";

export type Counts = Record<Outcome, number>;
const empty = (): Counts => ({ success: 0, failure: 0, mixed: 0, inconclusive: 0, other: 0 });

/** Replication rate = successes / judged effects (uncoded excluded from the denominator). */
function rate(c: Counts, total: number): number {
  const judged = total - c.other;
  return judged > 0 ? c.success / judged : 0;
}

export interface GroupStat {
  key: string;
  total: number;
  counts: Counts;
  repRate: number;
}

export function groupBy(
  effects: SnapshotEffect[],
  keyFn: (e: SnapshotEffect) => string | null | undefined,
): GroupStat[] {
  const map = new Map<string, GroupStat>();
  for (const e of effects) {
    const k = keyFn(e);
    if (!k) continue;
    let g = map.get(k);
    if (!g) {
      g = { key: k, total: 0, counts: empty(), repRate: 0 };
      map.set(k, g);
    }
    g.total++;
    g.counts[e.outcome]++;
  }
  const arr = [...map.values()];
  for (const g of arr) g.repRate = rate(g.counts, g.total);
  return arr.sort((a, b) => b.total - a.total);
}

export interface Overview {
  total: number;
  journals: number;
  disciplines: number;
  origPapers: number;
  outcome: Counts;
  repRate: number;
}

export function overview(effects: SnapshotEffect[]): Overview {
  const outcome = empty();
  const journals = new Set<string>();
  const disciplines = new Set<string>();
  const papers = new Set<string>();
  for (const e of effects) {
    outcome[e.outcome]++;
    if (e.journal_original) journals.add(e.journal_original);
    if (e.discipline) disciplines.add(e.discipline);
    if (e.doi_original) papers.add(e.doi_original);
  }
  return {
    total: effects.length,
    journals: journals.size,
    disciplines: disciplines.size,
    origPapers: papers.size,
    outcome,
    repRate: rate(outcome, effects.length),
  };
}

export interface YearBin {
  year: number;
  total: number;
  counts: Counts;
}

export function byYear(effects: SnapshotEffect[], minYear = 1995, maxYear = 2025): YearBin[] {
  const map = new Map<number, YearBin>();
  for (const e of effects) {
    const y = e.year_original;
    if (!y || y < minYear || y > maxYear) continue;
    let b = map.get(y);
    if (!b) {
      b = { year: y, total: 0, counts: empty() };
      map.set(y, b);
    }
    b.total++;
    b.counts[e.outcome]++;
  }
  return [...map.values()].sort((a, b) => a.year - b.year);
}

export interface ShrinkPoint {
  o: number;
  r: number;
  outcome: Outcome;
}
export interface Shrink {
  points: ShrinkPoint[];
  medianO: number;
  medianR: number;
  shrankPct: number;
}

function isPearsonR(t: string | null): boolean {
  if (!t) return false;
  const x = t.trim().toLowerCase();
  if (x.includes("²") || x.includes("sq") || x.startsWith("r2")) return false; // exclude r-squared
  return x === "r" || x.startsWith("r ") || x.startsWith("r(");
}

function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** Effect-size shrinkage among Pearson-r vs Pearson-r pairs (apples to apples). */
export function shrink(effects: SnapshotEffect[]): Shrink {
  const points: ShrinkPoint[] = [];
  for (const e of effects) {
    if (e.es_original == null || e.es_replication == null) continue;
    if (!isPearsonR(e.es_type_original) || !isPearsonR(e.es_type_replication)) continue;
    if (Math.abs(e.es_original) > 1 || Math.abs(e.es_replication) > 1) continue;
    points.push({ o: e.es_original, r: e.es_replication, outcome: e.outcome });
  }
  const shrank = points.filter((p) => Math.abs(p.r) < Math.abs(p.o)).length;
  return {
    points,
    medianO: median(points.map((p) => Math.abs(p.o))),
    medianR: median(points.map((p) => Math.abs(p.r))),
    shrankPct: points.length ? shrank / points.length : 0,
  };
}
