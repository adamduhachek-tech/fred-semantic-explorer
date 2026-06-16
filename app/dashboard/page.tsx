import Link from "next/link";
import Dashboard from "@/components/Dashboard";

export default function DashboardPage() {
  return (
    <main className="mx-auto max-w-5xl px-5 py-12 sm:py-16">
      <header className="mb-8">
        <div className="flex items-center justify-between gap-4">
          <span className="text-[0.7rem] font-semibold uppercase tracking-[0.12em] text-indigo-600">
            FORRT · Replication Database
          </span>
          <Link
            href="/"
            className="rounded-full border border-zinc-200 bg-white/70 px-3 py-1 text-xs font-medium text-zinc-600 transition hover:border-indigo-200 hover:text-indigo-700"
          >
            ← Semantic search
          </Link>
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
          Replication Sub-Analyses
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-zinc-600">
          The FORRT Replication Database cut by journal, discipline, time, and effect size. Outcome coding is the
          replication authors&rsquo; own narrative judgment — this describes the database, it does not adjudicate
          findings.
        </p>
      </header>

      <Dashboard />

      <footer className="mt-12 border-t border-zinc-200 pt-5 text-xs leading-relaxed text-zinc-400">
        Data: FORRT Replication Database (FReD),{" "}
        <a className="hover:underline" href="https://osf.io/9r62x" target="_blank" rel="noreferrer">
          osf.io/9r62x
        </a>{" "}
        (CC BY 4.0), retrieved June 2026. &ldquo;Replicated&rdquo; = the replication authors coded the attempt
        successful; uncoded effects are excluded from rates.
      </footer>
    </main>
  );
}
