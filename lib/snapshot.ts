/**
 * Client-side loader for the precomputed bundle in public/data/. Fetched once
 * and cached; cosine kNN then runs entirely in the browser over the in-memory
 * vectors (no vector DB, no server search).
 *
 * Resilient: retries a few times (the dev server may still be compiling on first
 * paint) and never caches a rejection, so a transient miss can be retried.
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

async function fetchBundle(): Promise<SnapshotData> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const [metaRes, binRes] = await Promise.all([
        fetch("/data/app-snapshot.json"),
        fetch("/data/effects.vectors.bin"),
      ]);
      if (!metaRes.ok || !binRes.ok) {
        throw new Error(`bundle not available (HTTP ${metaRes.status}/${binRes.status})`);
      }
      const meta = (await metaRes.json()) as Omit<SnapshotData, "vectors">;
      const buf = await binRes.arrayBuffer();
      const vectors = new Float32Array(buf);
      if (vectors.length !== meta.count * meta.dims) {
        throw new Error("vector bundle size does not match metadata");
      }
      return { ...meta, vectors };
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Failed to load the data bundle");
}

export function loadSnapshot(): Promise<SnapshotData> {
  if (!cache) {
    cache = fetchBundle().catch((e) => {
      cache = null; // allow a later retry instead of sticking on the error
      throw e;
    });
  }
  return cache;
}
