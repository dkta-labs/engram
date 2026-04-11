import { createHash } from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { config } from "../config.js";

// Two-level directory sharding: /data/blobs/{hash[0:2]}/{hash[2:4]}/{hash}
function blobPath(hash: string): string {
  return join(config.blobDir, hash.slice(0, 2), hash.slice(2, 4), hash);
}

export async function writeBlob(data: Buffer): Promise<string> {
  const hash = createHash("sha256").update(data).digest("hex");
  const filePath = blobPath(hash);
  await mkdir(join(config.blobDir, hash.slice(0, 2), hash.slice(2, 4)), { recursive: true });
  await writeFile(filePath, data);
  return hash;
}

export async function readBlob(hash: string): Promise<Buffer> {
  if (!/^[0-9a-f]{64}$/.test(hash)) {
    throw new Error("Invalid hash format");
  }
  const filePath = blobPath(hash);
  const data = await readFile(filePath);
  // Integrity check
  const actual = createHash("sha256").update(data).digest("hex");
  if (actual !== hash) {
    throw new Error("Blob integrity check failed");
  }
  return data;
}
