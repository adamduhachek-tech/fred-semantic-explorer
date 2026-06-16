/**
 * /api/embed — the ONLY route that touches the embeddings API key. Embeds a
 * single query string and returns its vector. The corpus is never embedded
 * here (it's precomputed); only the user's query is.
 */
import { NextResponse } from "next/server";
import { embedOne, EMBED_DIMS } from "@/lib/embeddings";

export const runtime = "nodejs";

// Trivial in-memory rate limit (per warm server instance).
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 60;
const hits: number[] = [];

export async function POST(req: Request) {
  const now = Date.now();
  while (hits.length && now - hits[0] > WINDOW_MS) hits.shift();
  if (hits.length >= MAX_PER_WINDOW) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }
  hits.push(now);

  let text: unknown;
  try {
    ({ text } = await req.json());
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (typeof text !== "string" || text.trim().length === 0) {
    return NextResponse.json({ error: "empty_query" }, { status: 400 });
  }

  const input = text.slice(0, 4000); // bound input length
  try {
    const embedding = await embedOne(input);
    return NextResponse.json({ embedding, dims: EMBED_DIMS });
  } catch (e) {
    console.error("embed error:", e);
    return NextResponse.json({ error: "embed_failed" }, { status: 502 });
  }
}
