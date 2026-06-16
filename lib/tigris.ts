/**
 * Tigris object-storage wrapper — used ONLY by build-time scripts
 * (scripts/ingest.ts, scripts/snapshot.ts), never at request time. Tigris is
 * the system of record for raw/ + derived/ + embeddings/; the app reads a
 * static snapshot from public/data/.
 *
 * Why the `tigris` CLI instead of @aws-sdk/client-s3:
 * The installed AWS SDK build produces an INVALID SigV4 signature for Tigris
 * bucket operations in this environment — account-level ListBuckets signs and
 * succeeds, but every PutObject variant (auto/us-east-1 region, virtual-hosted
 * /path-style, checksums on/off) returns 403 SignatureDoesNotMatch. The
 * authenticated Tigris CLI uploads/downloads reliably, so build-time object I/O
 * goes through it. The CLI authenticates from its own stored credentials
 * (`tigris configure`/login), independent of the AWS_* env vars.
 *
 * If the SDK signing issue is later resolved, these helpers can be swapped back
 * to @aws-sdk/client-s3 without changing callers.
 */
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { writeFile, readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const execAsync = promisify(exec);

/** The Tigris bucket that holds raw/, derived/, and embeddings/. */
export const BUCKET = process.env.TIGRIS_BUCKET ?? "replication";

function uri(key: string): string {
  return `t3://${BUCKET}/${key}`;
}

async function tigris(argline: string): Promise<string> {
  // Run the CLI with its OWN stored credentials. The AWS_* env vars (loaded
  // from .env.local) make the CLI sign with that keypair, which fails PutObject
  // for Tigris here; stripping them lets the CLI use ~/.tigris/config.json,
  // which signs writes correctly.
  const env = { ...process.env };
  for (const k of [
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
    "AWS_SESSION_TOKEN",
    "AWS_ENDPOINT_URL_S3",
    "AWS_ENDPOINT_URL_IAM",
    "AWS_REGION",
  ]) {
    delete env[k];
  }
  const { stdout } = await execAsync(`tigris ${argline}`, {
    windowsHide: true,
    maxBuffer: 256 * 1024 * 1024,
    env,
  });
  return stdout;
}

async function withTemp<T>(fn: (path: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "fred-"));
  const p = join(dir, "blob");
  try {
    return await fn(p);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Upload bytes/string under `key` (writes via a temp file -> `tigris cp`). */
export async function putObject(key: string, body: Uint8Array | Buffer | string): Promise<void> {
  await withTemp(async (p) => {
    await writeFile(p, body);
    await tigris(`cp "${p}" "${uri(key)}"`);
  });
}

/** Upload an existing local file under `key` (no temp copy). */
export async function putFile(key: string, localPath: string): Promise<void> {
  await tigris(`cp "${localPath}" "${uri(key)}"`);
}

/** Download `key` as a Buffer. */
export async function getObject(key: string): Promise<Buffer> {
  return withTemp(async (p) => {
    await tigris(`cp "${uri(key)}" "${p}"`);
    return readFile(p);
  });
}

/** Delete `key`. */
export async function removeObject(key: string): Promise<void> {
  await tigris(`rm "${uri(key)}" --yes`);
}

/** List object keys under `prefix` (parses the CLI table output). */
export async function listObjects(prefix = ""): Promise<string[]> {
  const out = await tigris(`ls "${uri(prefix)}"`);
  const keys: string[] = [];
  for (const line of out.split(/\r?\n/)) {
    if (!line.startsWith("│")) continue; // table data row: starts with │
    const m = line.match(/^│\s*([^│]+?)\s*│/);
    const name = m?.[1]?.trim();
    if (name && name !== "Key") keys.push(prefix + name);
  }
  return keys;
}
