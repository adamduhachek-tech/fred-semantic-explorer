/**
 * scripts/snapshot.ts — pull the compact app bundle from Tigris into
 * public/data/ at build time, so the app never reads Tigris at request time.
 *   node --env-file=.env.local --import tsx scripts/snapshot.ts
 *
 * Produces:
 *   public/data/app-snapshot.json   row metadata incl. x/y (no raw vectors)
 *   public/data/effects.vectors.bin Float32 row-major [count x dims]
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getObject } from "../lib/tigris";

const OUT = join(process.cwd(), "public", "data");

async function main() {
  await mkdir(OUT, { recursive: true });

  const meta = await getObject("embeddings/effects.meta.json");
  await writeFile(join(OUT, "app-snapshot.json"), meta);
  console.log(`app-snapshot.json  ${meta.length.toLocaleString()} B`);

  const bin = await getObject("embeddings/effects.vectors.bin");
  await writeFile(join(OUT, "effects.vectors.bin"), bin);
  console.log(`effects.vectors.bin ${bin.length.toLocaleString()} B`);

  const snap = JSON.parse(meta.toString("utf8")) as { count: number; dims: number };
  const expect = snap.count * snap.dims * 4;
  console.log(`snapshot: ${snap.count} effects @ ${snap.dims} dims; vector bytes match ${bin.length === expect}`);
}

main().catch((e) => {
  console.error("SNAPSHOT ERROR:", e);
  process.exit(1);
});
