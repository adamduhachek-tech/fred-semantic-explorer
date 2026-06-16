/** Verify the dashboard analytics after the data-quality audit fixes. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { groupByStudy, overview, byYear, shrink, canonicalDiscipline } from "../lib/analytics";
import { canonicalJournal } from "../lib/journals";

async function main() {
  const snap = JSON.parse(await readFile(join(process.cwd(), "public/data/app-snapshot.json"), "utf8"));
  const e = snap.effects;

  const ov = overview(e);
  console.log("OVERVIEW:", JSON.stringify({ total: ov.total, studies: ov.studies, journals: ov.journals, disciplines: ov.disciplines, nonJournalEffects: ov.nonJournalEffects, repRate: +(ov.repRate).toFixed(3) }));

  const J = groupByStudy(e, (x) => canonicalJournal(x.journal_original));
  console.log("\nEastern Illinois present?", J.some((g) => /eastern illinois/i.test(g.key)));
  console.log("any '&amp;' left in journal keys?", J.some((g) => /&amp;/.test(g.key)));
  console.log("memory & cognition:", J.filter((g) => /memory & cognition/i.test(g.key)).map((g) => `"${g.key}" ${g.studies}p/${g.effects}e`));
  console.log("any conference 'Proceedings' kept?", J.filter((g) => /^proceedings/i.test(g.key)).map((g) => g.key));

  console.log("\nVOLUME top 8 (papers/effects/rate):");
  J.slice(0, 8).forEach((g) => console.log(`  ${g.key} — ${g.studies}p / ${g.effects}e / ${(g.repRate * 100).toFixed(0)}%`));

  const rate = J.filter((g) => g.studies >= 5).sort((a, b) => b.repRate - a.repRate || b.studies - a.studies).slice(0, 8);
  console.log("\nRATE tab top 8 (>=5 studies):");
  rate.forEach((g) => console.log(`  ${g.key} — ${g.studies}p / ${(g.repRate * 100).toFixed(0)}%`));
  console.log("min studies in rate tab:", Math.min(...J.filter((g) => g.studies >= 5).map((g) => g.studies)));
  console.log("J.Ops.Mgmt:", J.filter((g) => /operations management/i.test(g.key)).map((g) => `${g.studies}p/${g.effects}e (excluded from rate tab: ${g.studies < 5})`));

  const D = groupByStudy(e, (x) => canonicalDiscipline(x.discipline));
  console.log("\nDISCIPLINE top 6:", D.slice(0, 6).map((g) => `${g.key}(${g.studies}p,${(g.repRate * 100).toFixed(0)}%)`));
  console.log("cognitive-psych casing collisions remaining:", D.filter((g) => /^cognitive psychology$/i.test(g.key)).length, "(want 1)");

  const yrs = byYear(e);
  console.log("\nYEAR range:", yrs[0]?.year, "-", yrs[yrs.length - 1]?.year, "bins:", yrs.length, "(pre-1995 included)");

  const sh = shrink(e);
  console.log("SHRINK:", sh.points.length, "pairs, medianO", sh.medianO.toFixed(2), "medianR", sh.medianR.toFixed(2), "shrank", (sh.shrankPct * 100).toFixed(0) + "%");
}
main().catch((e) => { console.error(e); process.exit(1); });
