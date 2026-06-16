/** Cosine kNN over the in-memory corpus vectors. Same math everywhere. */
import type { SnapshotData } from "./snapshot";

export interface Hit {
  index: number;
  score: number;
}

export function cosineAt(q: number[], vectors: Float32Array, row: number, dims: number): number {
  let dot = 0, nq = 0, nv = 0;
  const off = row * dims;
  for (let k = 0; k < dims; k++) {
    const a = q[k];
    const b = vectors[off + k];
    dot += a * b;
    nq += a * a;
    nv += b * b;
  }
  const denom = Math.sqrt(nq) * Math.sqrt(nv);
  return denom ? dot / denom : 0;
}

export function topK(query: number[], snap: SnapshotData, k: number): Hit[] {
  const { vectors, dims, count } = snap;
  const hits: Hit[] = new Array(count);
  for (let i = 0; i < count; i++) {
    hits[i] = { index: i, score: cosineAt(query, vectors, i, dims) };
  }
  hits.sort((a, b) => b.score - a.score);
  return hits.slice(0, k);
}
