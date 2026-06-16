/**
 * Client-side loader for the precomputed bundle in public/data/. Fetched once
 * and cached; cosine kNN then runs entirely in the browser over the in-memory
 * vectors (no vector DB, no server search).
 */
import type { Effect } from "./schema";

export interface SnapshotEffect extends Effect {
  x: number;
  y: number;
}

export interface SnapshotData {
  dims: number;
  model: string;
  count: number;
  effects: SnapshotEffect[];
  vectors: Float32Array; // row-major [count x dims]
}

let cache: Promise<SnapshotData> | null = null;

export function loadSnapshot(): Promise<SnapshotData> {
  if (!cache) {
    cache = (async () => {
      const [metaRes, binRes] = await Promise.all([
        fetch("/data/app-snapshot.json"),
        fetch("/data/effects.vectors.bin"),
      ]);
      if (!metaRes.ok || !binRes.ok) {
        throw new Error("Failed to load the data bundle (run scripts/snapshot.ts).");
      }
      const meta = (await metaRes.json()) as Omit<SnapshotData, "vectors">;
      const buf = await binRes.arrayBuffer();
      const vectors = new Float32Array(buf);
      if (vectors.length !== meta.count * meta.dims) {
        throw new Error("Vector bundle size does not match metadata.");
      }
      return { ...meta, vectors };
    })();
  }
  return cache;
}
