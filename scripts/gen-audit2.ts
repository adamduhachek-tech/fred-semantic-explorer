/** Emit the POST-FIX datasets (as the dashboard computes them) for a verification audit. */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { groupByStudy, canonicalDiscipline, overview, byYear, shrink } from "../lib/analytics";
import { canonicalJournal } from "../lib/journals";

async function main() {
  const dir = join(process.cwd(), "data", "_audit2");
  await mkdir(dir, { recursive: true });
  const snap = JSON.parse(await readFile(join(process.cwd(), "public/data/app-snapshot.json"), "utf8"));
  const e = snap.effects;

  const J = groupByStudy(e, (x) => canonicalJournal(x.journal_original));
  await writeFile(join(dir, "journals_final.json"), JSON.stringify(J, null, 1));

  // What canonicalJournal excluded (raw name -> null), with evidence.
  const ex: Record<string, { name: string; effects: number; examples: { doi: string; title: string }[] }> = {};
  for (const r of e) {
    const j = r.journal_original;
    if (j && canonicalJournal(j) == null) {
      if (!ex[j]) ex[j] = { name: j, effects: 0, examples: [] };
      ex[j].effects++;
      if (ex[j].examples.length < 2) ex[j].examples.push({ doi: r.doi_original, title: (r.title_original || r.description || "").slice(0, 80) });
    }
  }
  await writeFile(join(dir, "excluded.json"), JSON.stringify(Object.values(ex), null, 1));

  const D = groupByStudy(e, (x) => canonicalDiscipline(x.discipline));
  await writeFile(join(dir, "disciplines_final.json"), JSON.stringify(D, null, 1));

  // Raw distinct discipline values + counts (to spot garbage/composites/nulls).
  const dc: Record<string, number> = {};
  for (const r of e) {
    const d = r.discipline == null ? "<null>" : r.discipline;
    dc[d] = (dc[d] || 0) + 1;
  }
  await writeFile(join(dir, "disciplines_raw.json"), JSON.stringify(Object.entries(dc).sort((a, b) => b[1] - a[1]), null, 1));

  const ov = overview(e);
  const yrs = byYear(e);
  const sh = shrink(e);
  const summary = {
    total: ov.total, studies: ov.studies, journals: ov.journals, disciplines: ov.disciplines,
    nonJournalEffects: ov.nonJournalEffects, effectRepRate: ov.repRate,
    journalsFinalCount: J.length, excludedJournalNames: Object.keys(ex).length,
    disciplinesFinalCount: D.length, disciplinesRawDistinct: Object.keys(dc).length,
    yearMin: yrs[0]?.year, yearMax: yrs[yrs.length - 1]?.year, yearBins: yrs.length,
    shrinkPairs: sh.points.length, medianO: sh.medianO, medianR: sh.medianR, shrankPct: sh.shrankPct,
  };
  await writeFile(join(dir, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log("wrote data/_audit2/{journals_final,excluded,disciplines_final,disciplines_raw,summary}.json");
}
main().catch((e) => { console.error(e); process.exit(1); });
