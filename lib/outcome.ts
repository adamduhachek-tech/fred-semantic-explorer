/** Shared outcome vocabulary styling — keeps badges and charts consistent. */
import type { Outcome } from "./schema";

export const OUTCOME_META: Record<
  Outcome,
  { label: string; hex: string; bar: string; badge: string }
> = {
  success: {
    label: "replicated",
    hex: "#059669",
    bar: "bg-emerald-500",
    badge: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  },
  mixed: {
    label: "mixed",
    hex: "#d97706",
    bar: "bg-amber-500",
    badge: "bg-amber-50 text-amber-800 ring-amber-600/20",
  },
  failure: {
    label: "failed",
    hex: "#e11d48",
    bar: "bg-rose-500",
    badge: "bg-rose-50 text-rose-700 ring-rose-600/20",
  },
  inconclusive: {
    label: "inconclusive",
    hex: "#64748b",
    bar: "bg-slate-400",
    badge: "bg-slate-100 text-slate-600 ring-slate-500/20",
  },
  other: {
    label: "uncoded",
    hex: "#a1a1aa",
    bar: "bg-zinc-300",
    badge: "bg-zinc-100 text-zinc-500 ring-zinc-400/20",
  },
};

/** Display order: positive → negative → unjudged. */
export const OUTCOME_ORDER: Outcome[] = ["success", "mixed", "failure", "inconclusive", "other"];
