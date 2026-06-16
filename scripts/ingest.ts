/**
 * scripts/ingest.ts — Phase 1 data layer.
 *
 * Deterministic, run locally/CI (never at request time):
 *   1. Resolve source (FRED_SOURCE=osf|local) and fetch FReD.xlsx + flora.csv
 *      (+ the official codebook) into ./data/.
 *   2. Upload the RAW files to raw/ in Tigris, unchanged.
 *   3. Print the real schema (sheet names, headers, row counts, a sample row).
 *   4..6 (schema map -> clean records -> embeddings -> vectors) are added in
 *      subsequent steps; the embedding step is gated on OPENAI_API_KEY.
 *
 * Run: node --env-file=.env.local --import tsx scripts/ingest.ts [--inspect-only]
 */
import { mkdir, writeFile, stat, readFile } from "node:fs/promises";
import { join } from "node:path";
import ExcelJS from "exceljs";
import Papa from "papaparse";
import { putObject, putFile } from "../lib/tigris";
import { buildEffect, mapOutcome, OUTCOMES, type Effect, type RawRow } from "../lib/schema";

const DATA_DIR = join(process.cwd(), "data");

// Canonical released files at OSF /0 Data/ (project osf.io/9r62x).
const OSF_FILES = {
  "FReD.xlsx": "https://osf.io/download/2tbvd/",
  "flora.csv": "https://osf.io/download/t4j8f/",
  "fred_codebook.xlsx": "https://osf.io/download/g7r9z/",
} as const;

async function exists(p: string): Promise<number> {
  try {
    return (await stat(p)).size;
  } catch {
    return 0;
  }
}

async function download(name: string, url: string): Promise<string> {
  const dest = join(DATA_DIR, name);
  const have = await exists(dest);
  if (have > 0) {
    console.log(`  cached  ${name} (${have.toLocaleString()} B)`);
    return dest;
  }
  const res = await fetch(url, { headers: { "User-Agent": "fred-semantic-explorer/0.1" } });
  if (!res.ok) throw new Error(`download ${name}: ${res.status} ${res.statusText}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(dest, buf);
  console.log(`  fetched ${name} (${buf.length.toLocaleString()} B) <- ${url}`);
  return dest;
}

async function uploadRaw(name: string, localPath: string): Promise<void> {
  const sz = await exists(localPath);
  await putFile(`raw/${name}`, localPath);
  console.log(`  uploaded raw/${name} -> Tigris (${sz.toLocaleString()} B)`);
}

function cellToString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text).join("");
    if (o.text != null) return String(o.text);
    if (o.result != null) return String(o.result);
  }
  return String(v);
}

async function inspectXlsx(name: string, path: string, dumpAllRows = false): Promise<void> {
  console.log(`\n=== ${name} ===`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  console.log(`sheets: ${wb.worksheets.map((w) => `${w.name}(${w.actualRowCount}x${w.actualColumnCount})`).join(", ")}`);
  const ws = wb.worksheets[0];
  const header = (ws.getRow(1).values as unknown[]).slice(1).map(cellToString);
  console.log(`columns (${header.length}):`);
  header.forEach((h, i) => console.log(`  [${i}] ${h}`));
  if (dumpAllRows) {
    console.log(`-- all rows (small codebook) --`);
    ws.eachRow((row, n) => {
      const vals = (row.values as unknown[]).slice(1).map(cellToString);
      console.log(`  r${n}: ${vals.join(" | ")}`);
    });
  } else {
    const sample = (ws.getRow(2).values as unknown[]).slice(1).map(cellToString);
    console.log(`first data row:`);
    header.forEach((h, i) => console.log(`  ${h} = ${sample[i] ?? ""}`));
  }
}

async function inspectCsv(name: string, path: string): Promise<void> {
  console.log(`\n=== ${name} ===`);
  const text = await readFile(path, "utf8");
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  const fields = parsed.meta.fields ?? [];
  console.log(`rows: ${parsed.data.length}  columns: ${fields.length}`);
  console.log(`columns:`);
  fields.forEach((f, i) => console.log(`  [${i}] ${f}`));
  const first = parsed.data[0] ?? {};
  console.log(`first data row:`);
  for (const f of fields) console.log(`  ${f} = ${String(first[f] ?? "").slice(0, 120)}`);
}

/** Read every FReD data row into an object keyed by the real column names. */
async function readFredRows(path: string): Promise<RawRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path);
  const ws = wb.worksheets[0];
  const header = (ws.getRow(1).values as unknown[]).slice(1).map(cellToString);
  const rows: RawRow[] = [];
  for (let r = 2; r <= ws.rowCount; r++) {
    const vals = (ws.getRow(r).values as unknown[]).slice(1);
    const obj: RawRow = {};
    let any = false;
    header.forEach((h, i) => {
      const c = cellToString(vals[i]);
      obj[h] = c;
      if (c) any = true;
    });
    if (any) rows.push(obj);
  }
  return rows;
}

function pct(n: number, total: number): string {
  return `${n} (${((100 * n) / total).toFixed(1)}%)`;
}

function validateAndReport(effects: Effect[]): void {
  const total = effects.length;
  console.log(`\n[5] validation — ${total} effects built`);

  // Outcome distribution + surface anything that fell to "other".
  const rawCounts = new Map<string, number>();
  for (const e of effects) {
    const k = e.outcome_raw ?? "(blank)";
    rawCounts.set(k, (rawCounts.get(k) ?? 0) + 1);
  }
  console.log(`  outcome_raw -> controlled vocab:`);
  for (const [raw, c] of [...rawCounts.entries()].sort((a, b) => b[1] - a[1])) {
    const mapped = raw === "(blank)" ? "other" : mapOutcome(raw);
    const flag = mapped === "other" && raw !== "(blank)" ? "  <-- UNMAPPED" : "";
    console.log(`    ${String(c).padStart(5)}  ${mapped.padEnd(12)} <= "${raw}"${flag}`);
  }
  const byOutcome = Object.fromEntries(
    OUTCOMES.map((o) => [o, effects.filter((e) => e.outcome === o).length]),
  );
  console.log(`  controlled totals: ${JSON.stringify(byOutcome)}`);

  // Field coverage.
  const has = (f: (e: Effect) => boolean) => effects.filter(f).length;
  console.log(`  coverage:`);
  console.log(`    description present : ${pct(has((e) => e.description.length > 0), total)}`);
  console.log(`    keywords >=1        : ${pct(has((e) => e.keywords.length > 0), total)}`);
  console.log(`    doi_original        : ${pct(has((e) => !!e.doi_original), total)}`);
  console.log(`    doi_replication     : ${pct(has((e) => !!e.doi_replication), total)}`);
  console.log(`    es_original numeric : ${pct(has((e) => e.es_original != null), total)}`);
  console.log(`    es_orig test-stat   : ${pct(has((e) => e.es_original == null && !!e.es_original_raw), total)}`);
  console.log(`    es_replication num  : ${pct(has((e) => e.es_replication != null), total)}`);
  console.log(`    n_original          : ${pct(has((e) => e.n_original != null), total)}`);
  console.log(`    p_original          : ${pct(has((e) => e.p_original != null), total)}`);
  console.log(`    author_overlap_pct  : ${pct(has((e) => e.author_overlap_pct != null), total)}`);

  // Integrity: ids unique?
  const ids = new Set(effects.map((e) => e.id));
  console.log(`  unique ids: ${ids.size}/${total}${ids.size !== total ? "  <-- DUPLICATES" : ""}`);
}

async function main() {
  const inspectOnly = process.argv.includes("--inspect-only");
  await mkdir(DATA_DIR, { recursive: true });

  console.log(`[1] download (source=${process.env.FRED_SOURCE ?? "osf"})`);
  const paths: Record<string, string> = {};
  for (const [name, url] of Object.entries(OSF_FILES)) {
    paths[name] = await download(name, url);
  }

  if (inspectOnly) {
    console.log(`[*] inspect-only: dumping schema`);
    await inspectXlsx("FReD.xlsx", paths["FReD.xlsx"]);
    await inspectXlsx("fred_codebook.xlsx", paths["fred_codebook.xlsx"], true);
    await inspectCsv("flora.csv", paths["flora.csv"]);
    return;
  }

  console.log(`[2] upload raw files to Tigris`);
  await uploadRaw("FReD.xlsx", paths["FReD.xlsx"]);
  await uploadRaw("flora.csv", paths["flora.csv"]);

  console.log(`[3] read FReD effect rows`);
  const rows = await readFredRows(paths["FReD.xlsx"]);
  console.log(`  ${rows.length} data rows`);

  console.log(`[4] build clean records via lib/schema.ts`);
  const effects = rows.map(buildEffect);

  validateAndReport(effects);

  console.log(`\n[6] write derived records`);
  const localOut = join(DATA_DIR, "effects.json");
  await writeFile(localOut, JSON.stringify(effects));
  console.log(`  wrote ${localOut} (${effects.length} records)`);
  await putObject("derived/effects.json", JSON.stringify(effects));
  console.log(`  uploaded derived/effects.json -> Tigris`);

  if (!process.env.OPENAI_API_KEY) {
    console.log(`\n[7] embeddings SKIPPED — OPENAI_API_KEY not set.`);
    console.log(`    Re-run with the key in .env.local to embed + UMAP + write vectors.`);
    return;
  }
  console.log(`\n[7] OPENAI_API_KEY present — embedding step will run (added next).`);
}

main().catch((e) => {
  console.error("INGEST ERROR:", e);
  process.exit(1);
});
