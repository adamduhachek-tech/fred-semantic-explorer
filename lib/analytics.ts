/** Pure aggregations for the dashboard, computed client-side from the snapshot. */
import type { SnapshotEffect } from "./snapshot";
import type { Outcome } from "./schema";
import { canonicalJournal } from "./journals";

export type Counts = Record<Outcome, number>;
const empty = (): Counts => ({ success: 0, failure: 0, mixed: 0, inconclusive: 0, other: 0 });

/** Replication rate = successes / judged units (uncoded excluded from the denominator). */
function rate(c: Counts, total: number): number {
  const judged = total - c.other;
  return judged > 0 ? c.success / judged : 0;
}

/** Composite/topic discipline labels → an existing canonical discipline (audit). */
const DISCIPLINE_ALIASES: Record<string, string> = {
  "marketing/org behavior": "Marketing",
  "social/cognitive psychology": "Social Psychology",
  "gender stereotypes": "Social Psychology",
};

/** Title-case + casing-merge + alias-map for the noisy discipline field. */
export function canonicalDiscipline(d: string | null | undefined): string | null {
  if (!d) return null;
  const key = d.trim().toLowerCase().replace(/\s+/g, " ");
  if (DISCIPLINE_ALIASES[key]) return DISCIPLINE_ALIASES[key];
  return key.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/**
 * Reduce one study's per-effect outcomes to a single study outcome: the modal
 * coded outcome; ties resolve to "mixed"; all-uncoded → "other". This is what
 * makes per-journal rates honest — a paper split into 76 effect rows counts as
 * one study, not 76 data points.
 */
function studyOutcome(outcomes: Outcome[]): Outcome {
  const c = empty();
  for (const o of outcomes) c[o]++;
  const coded: Outcome[] = ["success", "failure", "mixed", "inconclusive"];
  let best: Outcome = "other";
  let bestN = 0;
  let tie = false;
  for (const o of coded) {
    if (c[o] > bestN) {
      best = o;
      bestN = c[o];
      tie = false;
    } else if (c[o] === bestN && bestN > 0) {
      tie = true;
    }
  }
  if (bestN === 0) return "other";
  return tie ? "mixed" : best;
}

export interface GroupStat {
  key: string;
  studies: number; // distinct original papers (doi_original)
  effects: number; // effect rows
  counts: Counts; // study-level outcome distribution
  repRate: number; // study-level replication rate
}

/**
 * Group effects by `keyFn`, then aggregate to the STUDY (distinct doi_original)
 * level within each group. Effects sharing a key but no doi each count as their
 * own study (doi_original is ~100% populated in FReD, so this is rare).
 */
export function groupByStudy(
  effects: SnapshotEffect[],
  keyFn: (e: SnapshotEffect) => string | null | undefined,
): GroupStat[] {
  const groups = new Map<string, { studies: Map<string, Outcome[]>; effects: number }>();
  for (const e of effects) {
    const k = keyFn(e);
    if (!k) continue;
    let g = groups.get(k);
    if (!g) {
      g = { studies: new Map(), effects: 0 };
      groups.set(k, g);
    }
    g.effects++;
    const studyId = e.doi_original ?? `effect:${e.id}`;
    const arr = g.studies.get(studyId);
    if (arr) arr.push(e.outcome);
    else g.studies.set(studyId, [e.outcome]);
  }
  const out: GroupStat[] = [];
  for (const [key, g] of groups) {
    const counts = empty();
    for (const outcomes of g.studies.values()) counts[studyOutcome(outcomes)]++;
    out.push({ key, studies: g.studies.size, effects: g.effects, counts, repRate: rate(counts, g.studies.size) });
  }
  return out.sort((a, b) => b.studies - a.studies || b.effects - a.effects);
}

export interface Overview {
  total: number; // effect rows
  studies: number; // distinct original papers
  journals: number; // distinct real journals (post-cleaning)
  disciplines: number;
  outcome: Counts; // effect-level outcome distribution
  repRate: number; // effect-level replication rate
  nonJournalEffects: number; // effects whose source is not a journal (excluded from by-journal)
}

export function overview(effects: SnapshotEffect[]): Overview {
  const outcome = empty();
  const journals = new Set<string>();
  const disciplines = new Set<string>();
  const papers = new Set<string>();
  let nonJournalEffects = 0;
  for (const e of effects) {
    outcome[e.outcome]++;
    const j = canonicalJournal(e.journal_original);
    if (j) journals.add(j);
    else if (e.journal_original) nonJournalEffects++;
    const d = canonicalDiscipline(e.discipline);
    if (d) disciplines.add(d);
    if (e.doi_original) papers.add(e.doi_original);
  }
  return {
    total: effects.length,
    studies: papers.size,
    journals: journals.size,
    disciplines: disciplines.size,
    outcome,
    repRate: rate(outcome, effects.length),
    nonJournalEffects,
  };
}

export interface YearBin {
  year: number;
  total: number;
  counts: Counts;
}

export function byYear(effects: SnapshotEffect[], minYear = 1930, maxYear = 2026): YearBin[] {
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
