/**
 * Embeddings via OpenRouter's OpenAI-compatible /embeddings endpoint.
 *
 * The spec calls for AI SDK v6 `embed`/`embedMany` against OpenAI. In this
 * environment the only available key is an OpenRouter key (no OpenAI key), and
 * the installed `ai`/@ai-sdk packages are v7/v4 canaries. OpenRouter serves the
 * exact spec model (`openai/text-embedding-3-small`) and honors the `dimensions`
 * parameter, so we call its REST endpoint directly — version-proof and reused by
 * both the build-time ingest and the runtime /api/embed route. The API key is
 * read server-side only (never shipped to the client).
 */
const BASE = process.env.EMBED_BASE_URL ?? "https://openrouter.ai/api/v1";
const MODEL = process.env.EMBED_MODEL ?? "openai/text-embedding-3-small";

/** Embedding dimensionality (reduced to keep the client vector payload small). */
export const EMBED_DIMS = Number(process.env.EMBED_DIMS ?? 512);

function apiKey(): string {
  // Keep only printable ASCII (0x21-0x7E). An API key is entirely in this range,
  // so this is a no-op for a clean key but strips a stray BOM (U+FEFF), spaces,
  // or control chars that can sneak into an env var (dashboard paste / a
  // BOM-writing shell) and would otherwise break the "Bearer <key>" header.
  const k = (process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_API_KEY ?? "").replace(
    /[^\x21-\x7e]/g,
    "",
  );
  if (!k) throw new Error("No embeddings API key (set OPENROUTER_API_KEY)");
  return k;
}

interface EmbeddingResponse {
  data: { index: number; embedding: number[] }[];
}

/** Embed a batch of strings; returns vectors aligned to input order. */
export async function embedBatch(inputs: string[]): Promise<number[][]> {
  if (inputs.length === 0) return [];
  const res = await fetch(`${BASE}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, input: inputs, dimensions: EMBED_DIMS }),
  });
  if (!res.ok) {
    throw new Error(`embeddings ${res.status}: ${(await res.text()).slice(0, 300)}`);
  }
  const json = (await res.json()) as EmbeddingResponse;
  return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

/** Embed a single string (used by the runtime query route). */
export async function embedOne(input: string): Promise<number[]> {
  const [v] = await embedBatch([input]);
  return v;
}
