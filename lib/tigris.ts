/**
 * Tigris (S3-compatible) object-storage wrapper.
 *
 * Tigris is the system of record for raw + derived + vectors. The app does NOT
 * read Tigris at request time — a build step (scripts/snapshot.ts) pulls one
 * compact snapshot into public/data/. These helpers are used by the local/CI
 * ingest + snapshot scripts, never from the client.
 *
 * Credentials are read from the standard AWS env vars by the SDK's default
 * provider chain (AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY). See .env.local.
 */
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

const ENDPOINT = process.env.AWS_ENDPOINT_URL_S3 ?? "https://t3.storage.dev";
const REGION = process.env.AWS_REGION ?? "auto";

/** The Tigris bucket that holds raw/, derived/, and embeddings/. */
export const BUCKET = process.env.TIGRIS_BUCKET ?? "replication";

export const s3 = new S3Client({
  endpoint: ENDPOINT,
  region: REGION,
  // Tigris supports virtual-hosted-style addressing (bucket.t3.storage.dev).
  forcePathStyle: false,
});

/** Upload a single object. `body` may be bytes or a string. */
export async function putObject(
  key: string,
  body: Uint8Array | Buffer | string,
  contentType?: string,
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
}

/** Download a single object as a Buffer. */
export async function getObject(key: string): Promise<Buffer> {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const bytes = await res.Body!.transformToByteArray();
  return Buffer.from(bytes);
}

/** List object keys under a prefix (handles pagination). */
export async function listObjects(prefix = ""): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const res = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    for (const o of res.Contents ?? []) if (o.Key) keys.push(o.Key);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

/** Delete a single object. Used to clean up healthcheck artifacts. */
export async function removeObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
