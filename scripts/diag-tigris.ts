/**
 * Diagnostic: which Tigris operations does the .env.txt keypair allow, and does
 * addressing style matter? Run:
 *   node --env-file=.env.local --import tsx scripts/diag-tigris.ts
 */
import {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  ListBucketsCommand,
} from "@aws-sdk/client-s3";

const BUCKET = process.env.TIGRIS_BUCKET ?? "replication";
const endpoint = process.env.AWS_ENDPOINT_URL_S3 ?? "https://t3.storage.dev";
const region = process.env.AWS_REGION ?? "auto";

function client(forcePathStyle: boolean) {
  return new S3Client({ endpoint, region, forcePathStyle });
}

async function tryOp(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    console.log(`OK    ${label}`);
  } catch (e: unknown) {
    const err = e as { Code?: string; name?: string; $metadata?: { httpStatusCode?: number } };
    console.log(`FAIL  ${label}  ->  ${err.$metadata?.httpStatusCode ?? "?"} ${err.Code ?? err.name}`);
  }
}

async function main() {
  console.log(`endpoint=${endpoint} region=${region}`);
  console.log(`access_key_id prefix: ${process.env.AWS_ACCESS_KEY_ID?.slice(0, 8)}…  id_len=${process.env.AWS_ACCESS_KEY_ID?.length}  secret_len=${process.env.AWS_SECRET_ACCESS_KEY?.length}`);

  const c = client(false);

  // Account-level: are these creds valid at all?
  await tryOp(`LIST-BUCKETS (account-level)`, () => c.send(new ListBucketsCommand({})));

  // Per-bucket: scoping test across the two known buckets.
  for (const b of [BUCKET, "happy"]) {
    await tryOp(`[${b}] LIST`, () =>
      c.send(new ListObjectsV2Command({ Bucket: b, Prefix: "", MaxKeys: 1 })),
    );
    await tryOp(`[${b}] PUT _diag.txt`, () =>
      c.send(new PutObjectCommand({ Bucket: b, Key: "_diag.txt", Body: "diag" })),
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
