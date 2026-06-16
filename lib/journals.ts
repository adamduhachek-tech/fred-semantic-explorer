/**
 * Journal-field cleaning, from the audit (two independent classifiers agreed,
 * zero disagreements). The FReD `journal_original` field is CrossRef's
 * "journal OR publisher", so it contains non-journals (theses, books,
 * conference proceedings) and casing variants. `&amp;`-style entities are
 * already handled upstream by schema.str(); only true exclusions and
 * casing/"&"-vs-"and" aliases remain here.
 */

/** Sources that are NOT scholarly journals (excluded from by-journal analysis). */
const EXCLUDED = new Set(
  [
    "Eastern Illinois University", // theses (thekeep.eiu.edu)
    "Indiana State University", // ETDs (scholars.indianastate.edu)
    "Cognition and Categorization", // edited book (Rosch & Lloyd)
    "Proceedings of the 2017 ACM Conference on International Computing Education Research",
    "Proceedings of the 41st Annual Meeting of the Cognitive Science Society",
    "Proceedings of Sinn und Bedeutung",
    "Proceedings of the 2019 CHI Conference on Human Factors in Computing Systems",
    "Proceedings of the 2018 CHI Conference on Human Factors in Computing Systems",
  ].map((s) => s.toLowerCase()),
);

/** Variants of the same journal → canonical display name (matched case-insensitively). */
const ALIASES: Record<string, string> = {
  "plos one": "PLOS ONE",
  "cognition & emotion": "Cognition and Emotion",
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Canonical journal name, or null if the value is not a journal.
 * Returns the cleaned display name (alias-merged) for real journals.
 */
export function canonicalJournal(name: string | null | undefined): string | null {
  if (!name) return null;
  const key = norm(name);
  if (EXCLUDED.has(key)) return null;
  return ALIASES[key] ?? name;
}
