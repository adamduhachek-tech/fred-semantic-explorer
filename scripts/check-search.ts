/**
 * Phase 1 acceptance: cosine-kNN over the local vectors confirms the embedding
 * space is meaningful (related claims rank high, unrelated low). Also the same
 * math the client will run.
 *   node --env-file=.env.local --import tsx scripts/check-search.ts "your query"
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { embedOne } from "../lib/embeddings";

interface Snap {
  count: number;
  dims: number;
  effects: { description: string; title_original: string | null; outcome: string }[];
}

function cosine(a: Float32Array | number[], b: Float32Array, off: number, d: number): number {
  let dot = 0, na = 0, nb = 0;
  for (let k = 0; k < d; k++) {
    const x = a[k], y = b[off + k];
    dot += x * y; na += x * x; nb += y * y;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

async function main() {
  const query = process.argv.slice(2).join(" ") || "ego depletion: self-control is a limited resource that gets used up";
  const dir = join(process.cwd(), "data");
  const snap = JSON.parse(await readFile(join(dir, "effects.meta.json"), "utf8")) as Snap;
  const buf = await readFile(join(dir, "effects.vectors.bin"));
  const vectors = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
  const { count: N, dims: D } = snap;

  const q = await embedOne(query);
  const scored = Array.from({ length: N }, (_, i) => ({ i, s: cosine(q, vectors, i * D, D) }));
  scored.sort((a, b) => b.s - a.s);

  console.log(`query: "${query}"\n`);
  console.log(`top 8 (cosine):`);
  for (const { i, s } of scored.slice(0, 8)) {
    const e = snap.effects[i];
    console.log(`  ${s.toFixed(3)} [${e.outcome.padEnd(12)}] ${(e.description || e.title_original || "").slice(0, 88)}`);
  }
  const tail = scored[scored.length - 1];
  console.log(`\nleast similar: ${tail.s.toFixed(3)} — ${(snap.effects[tail.i].description || "").slice(0, 70)}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
