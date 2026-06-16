import Link from "next/link";
import SemanticSearch from "@/components/SemanticSearch";

export default function Home() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-12 sm:py-16">
      <header className="mb-8">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-indigo-600">
            FORRT · Replication Database
          </span>
          <Link
            href="/dashboard"
            className="rounded-full border border-zinc-200 bg-white/70 px-3 py-1 text-xs font-medium text-zinc-600 transition hover:border-indigo-200 hover:text-indigo-700"
          >
            Sub-analyses →
          </Link>
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">
          FReD Semantic Explorer
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-600 sm:text-[0.95rem]">
          Search the{" "}
          <a
            className="font-medium text-indigo-600 hover:underline"
            href="https://forrt.org/replication-hub/"
            target="_blank"
            rel="noreferrer"
          >
            FORRT Replication Database
          </a>{" "}
          by <span className="italic">meaning</span>. Paste a claim, abstract, or citation and get the nearest
          replication findings — not by keyword or DOI match, but by what they are about. Similarity is a few
          thousand dot products computed in your browser; only your query is sent to a server.
        </p>
      </header>

      <SemanticSearch />

      <footer className="mt-16 border-t border-zinc-200 pt-5 text-xs leading-relaxed text-zinc-400">
        <p className="text-zinc-500">
          <strong className="font-semibold text-zinc-600">
            This points to evidence, it does not adjudicate truth.
          </strong>{" "}
          A label of “failed to replicate” reflects one replication attempt’s coding in FReD, not a verdict on the
          finding. Follow the links and read the sources. Effect sizes are shown verbatim and may be signed or be
          test statistics; “outcome” is the replication authors’ own narrative coding.
        </p>
        <p className="mt-2">
          Data: FORRT Replication Database (FReD),{" "}
          <a className="hover:underline" href="https://osf.io/9r62x" target="_blank" rel="noreferrer">
            osf.io/9r62x
          </a>{" "}
          (CC BY 4.0), retrieved June 2026 · embeddings: text-embedding-3-small (512-d) · a teaching companion to
          FReD, not a replacement for it.
        </p>
      </footer>
    </main>
  );
}
