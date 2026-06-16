/**
 * Temporary discovery helper: walk the FReD/FLoRA OSF project tree and print
 * files (esp. .xlsx/.csv) with their download URLs, so ingest.ts can target the
 * real files. Skips the large registries subproject.
 *   node --import tsx scripts/osf-explore.ts
 */
const NODE = "9r62x";
const UA = "fred-semantic-explorer/0.1 (replication build)";
const ROOT = `https://api.osf.io/v2/nodes/${NODE}/files/osfstorage/?page[size]=100`;

async function get(url: string): Promise<any> {
  const r = await fetch(url, { headers: { "User-Agent": UA } });
  if (!r.ok) throw new Error(`${r.status} ${r.statusText} :: ${url}`);
  return r.json();
}

async function walk(url: string, depth = 0): Promise<void> {
  let next: string | null = url;
  while (next) {
    const j: any = await get(next);
    for (const it of j.data) {
      const a = it.attributes;
      const pad = "  ".repeat(depth);
      if (a.kind === "folder") {
        const name: string = a.name ?? "";
        console.log(`${pad}[dir]  ${name}`);
        if (depth === 0 && /^subproject/i.test(name)) {
          console.log(`${pad}  (skipped — large subproject)`);
          continue;
        }
        const href = it.relationships?.files?.links?.related?.href;
        if (href) await walk(`${href}?page[size]=100`, depth + 1);
      } else {
        console.log(`${pad}[file] ${a.name}  ${a.size}B`);
        console.log(`${pad}       path=${a.materialized_path}`);
        console.log(`${pad}       dl=${it.links?.download}`);
      }
    }
    next = j.links?.next ?? null;
  }
}

walk(ROOT).catch((e) => {
  console.error("OSF explore failed:", e);
  process.exit(1);
});
