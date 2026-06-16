/** Verify the residual audit fixes landed in the snapshot. */
import { readFile } from "node:fs/promises";
import { join } from "node:path";

async function main() {
  const snap = JSON.parse(await readFile(join(process.cwd(), "public/data/app-snapshot.json"), "utf8"));
  const e = snap.effects as Record<string, unknown>[];
  const fields = ["journal_original", "title_original", "title_replication", "ref_original", "ref_replication", "description", "keywords"];
  const tagRe = /<\/?[a-zA-Z][^>]*>|<\d[^>]*>/;

  let tags = 0;
  const tagEx: string[] = [];
  let amp = 0;
  for (const r of e) {
    let hasTag = false, hasAmp = false;
    for (const f of fields) {
      const raw = r[f];
      const v = Array.isArray(raw) ? raw.join(" ") : raw;
      if (typeof v === "string") {
        if (tagRe.test(v)) { hasTag = true; if (tagEx.length < 3) tagEx.push(`${f}: ${v.slice(0, 60)}`); }
        if (v.includes("&amp;")) hasAmp = true;
      }
    }
    if (hasTag) tags++;
    if (hasAmp) amp++;
  }
  console.log("rows with residual HTML tags:", tags, tagEx);
  console.log("rows with residual '&amp;':", amp);

  const bigEs = e.filter((r) => r.es_original != null && Math.abs(r.es_original as number) > 1e5).length +
    e.filter((r) => r.es_replication != null && Math.abs(r.es_replication as number) > 1e5).length;
  console.log("numeric es values > 1e5 remaining:", bigEs, "| 1-1509 es_original:", e.find((r) => r.id === "1-1509")?.es_original);

  const imp = e.filter((r) => r.year_original != null && r.year_replication != null && (r.year_replication as number) < (r.year_original as number)).length;
  console.log("impossible (year_replication < year_original):", imp);

  const discs = new Set(e.map((r) => r.discipline));
  console.log("composites still in raw discipline:", ["marketing/org behavior", "Social/cognitive psychology", "Gender Stereotypes"].map((d) => `${d}=${discs.has(d)}`));
}
main().catch((e) => { console.error(e); process.exit(1); });
