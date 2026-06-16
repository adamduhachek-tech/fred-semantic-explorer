/**
 * Phase 0 acceptance: prove a Tigris read/write round-trip through lib/tigris.ts.
 * Run:  node --env-file=.env.local --import tsx scripts/healthcheck-tigris.ts
 */
import { putObject, getObject, listObjects, removeObject, BUCKET } from "../lib/tigris";

async function main() {
  const key = "raw/_app_healthcheck.txt";
  const payload = `fred-explorer app healthcheck ${new Date().toISOString()}`;

  console.log(`bucket: ${BUCKET}`);

  await putObject(key, payload);
  console.log(`wrote:  ${key}`);

  const back = (await getObject(key)).toString("utf8");
  const match = back === payload;
  console.log(`read-back match: ${match ? "YES" : "NO"}`);

  const listed = await listObjects("raw/");
  console.log(`listed under raw/: ${JSON.stringify(listed)}`);

  await removeObject(key);
  console.log(`cleaned up: ${key}`);

  if (!match) {
    console.error("HEALTHCHECK FAILED: round-trip content mismatch");
    process.exit(1);
  }
  console.log("HEALTHCHECK OK");
}

main().catch((err) => {
  console.error("HEALTHCHECK ERROR:", err);
  process.exit(1);
});
