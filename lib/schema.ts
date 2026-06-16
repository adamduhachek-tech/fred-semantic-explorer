/**
 * lib/schema.ts — the SINGLE mapping from the real FReD column names to the
 * canonical fields the app uses. Per the build spec: schema is read from the
 * live file, never assumed; every later step reads through this map; if a
 * conceptual field is absent we surface it (null), never fabricate.
 *
 * Source: FORRT Replication Database (FReD), osf.io/9r62x, /0 Data/FReD.xlsx
 * (effect-level: one row per original->replication finding). Column names and
 * semantics verified against /0 Data/fred_codebook.xlsx.
 */

export const SOURCE_LABEL =
  "FORRT Replication Database (FReD) — osf.io/9r62x, /0 Data/FReD.xlsx";

/** Real FReD column names, grouped. Change here if the source schema changes. */
export const FRED_COLUMNS = {
  entry_id: "entry_id",
  effect_id: "effect_id",
  fred_id: "fred_id",
  description: "description",
  discipline: "discipline",
  tags: "tags",
  claim_text_o: "claim_text_o",
  reported_success: "reported_success",
  reported_success_quote: "reported_success_quote",
  es_value_o: "es_value_o",
  es_type_o: "es_type_o",
  es_value_r: "es_value_r",
  es_type_r: "es_type_r",
  n_o: "n_o",
  n_r: "n_r",
  pval_value_o: "pval_value_o",
  pval_value_r: "pval_value_r",
  doi_o: "doi_o",
  doi_r: "doi_r",
  url_r: "url_r",
  ref_o: "ref_o",
  ref_r: "ref_r",
  title_o: "title_o",
  title_r: "title_r",
  year_o: "year_o",
  year_r: "year_r",
  author_overlap: "author_overlap",
  author_overlap_pct: "author_overlap_pct",
} as const;

/** Controlled outcome vocabulary. Mixed is NEVER collapsed into failure. */
export type Outcome = "success" | "failure" | "mixed" | "inconclusive" | "other";

export const OUTCOMES: Outcome[] = ["success", "failure", "mixed", "inconclusive", "other"];

/**
 * Map the source's narrative `reported_success` values to the controlled vocab.
 * The verbatim source value is always preserved on the record (`outcome_raw`),
 * so this mapping only governs coloring/filtering, never loses information.
 * Unmapped values fall to "other" and are surfaced by the ingest validator.
 */
export const OUTCOME_MAP: Record<string, Outcome> = {
  success: "success",
  successful: "success",
  failure: "failure",
  failed: "failure",
  mixed: "mixed",
  "statistically successful but flawed": "mixed",
  uninformative: "inconclusive",
  inconclusive: "inconclusive",
  "descriptive only": "inconclusive",
};

export function mapOutcome(raw: string | null): Outcome {
  if (!raw) return "other";
  return OUTCOME_MAP[raw.trim().toLowerCase()] ?? "other";
}

/** Canonical effect-level record consumed by the app. */
export interface Effect {
  id: string; // entry_id-effect_id (unique per row)
  fred_id: string | null;
  description: string;
  discipline: string | null;
  keywords: string[];

  outcome: Outcome;
  outcome_raw: string | null;
  outcome_quote: string | null;

  // Effect sizes: preserved verbatim (may be signed or a test-statistic string)
  // plus a parsed numeric when the value is a plain number.
  es_original: number | null;
  es_original_raw: string | null;
  es_type_original: string | null;
  es_replication: number | null;
  es_replication_raw: string | null;
  es_type_replication: string | null;

  n_original: number | null;
  n_replication: number | null;
  p_original: number | null;
  p_replication: number | null;

  // Identifiers / references — DOIs preserved verbatim.
  doi_original: string | null;
  doi_replication: string | null;
  url_replication: string | null;
  ref_original: string | null;
  ref_replication: string | null;
  title_original: string | null;
  title_replication: string | null;
  year_original: number | null;
  year_replication: number | null;

  // Independence of the replication team.
  author_overlap: boolean | null;
  author_overlap_pct: number | null;
}

/* ----------------------------- coercion helpers ---------------------------- */

const NA = new Set(["", "na", "n/a", "nan", "null", "none", "-"]);

export function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return NA.has(s.toLowerCase()) ? null : s;
}

/** Parse a plain number; returns null for NA or non-numeric (e.g. "F(1,30)=4.2"). */
export function num(v: unknown): number | null {
  const s = str(v);
  if (s == null) return null;
  // accept a leading signed decimal only; reject test-statistic strings
  if (!/^[+-]?\d*\.?\d+(?:[eE][+-]?\d+)?$/.test(s.replace(/,/g, ""))) return null;
  const n = Number(s.replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

export function int(v: unknown): number | null {
  const n = num(v);
  return n == null ? null : Math.round(n);
}

export function bool(v: unknown): boolean | null {
  const s = str(v);
  if (s == null) return null;
  const l = s.toLowerCase();
  if (["true", "1", "yes", "y"].includes(l)) return true;
  if (["false", "0", "no", "n"].includes(l)) return false;
  return null;
}

export function splitTags(v: unknown): string[] {
  const s = str(v);
  if (s == null) return [];
  return s
    .split(/[;,]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/** A raw FReD row keyed by the real column names. */
export type RawRow = Record<string, unknown>;

/** Build a canonical Effect from a raw FReD row. */
export function buildEffect(row: RawRow): Effect {
  const C = FRED_COLUMNS;
  const entry = str(row[C.entry_id]) ?? "";
  const effect = str(row[C.effect_id]) ?? "";
  const outcomeRaw = str(row[C.reported_success]);
  return {
    id: `${entry}-${effect}`,
    fred_id: str(row[C.fred_id]),
    description: str(row[C.description]) ?? "",
    discipline: str(row[C.discipline]),
    keywords: splitTags(row[C.tags]),

    outcome: mapOutcome(outcomeRaw),
    outcome_raw: outcomeRaw,
    outcome_quote: str(row[C.reported_success_quote]),

    es_original: num(row[C.es_value_o]),
    es_original_raw: str(row[C.es_value_o]),
    es_type_original: str(row[C.es_type_o]),
    es_replication: num(row[C.es_value_r]),
    es_replication_raw: str(row[C.es_value_r]),
    es_type_replication: str(row[C.es_type_r]),

    n_original: int(row[C.n_o]),
    n_replication: int(row[C.n_r]),
    p_original: num(row[C.pval_value_o]),
    p_replication: num(row[C.pval_value_r]),

    doi_original: str(row[C.doi_o]),
    doi_replication: str(row[C.doi_r]),
    url_replication: str(row[C.url_r]),
    ref_original: str(row[C.ref_o]),
    ref_replication: str(row[C.ref_r]),
    title_original: str(row[C.title_o]),
    title_replication: str(row[C.title_r]),
    year_original: int(row[C.year_o]),
    year_replication: int(row[C.year_r]),

    author_overlap: bool(row[C.author_overlap]),
    author_overlap_pct: num(row[C.author_overlap_pct]),
  };
}

/** Text fed to the embedding model: description + title + keywords. */
export function embeddingText(e: Effect): string {
  return [e.description, e.title_original, e.keywords.join(", ")]
    .filter((s): s is string => Boolean(s && s.length))
    .join(" — ");
}
