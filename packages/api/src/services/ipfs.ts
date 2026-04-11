import { createHelia } from "helia";
import { json } from "@helia/json";
import { unixfs } from "@helia/unixfs";

let heliaNode: Awaited<ReturnType<typeof createHelia>> | null = null;

export async function initIpfs(): Promise<void> {
  heliaNode = await createHelia();
  console.log("Helia IPFS node started (local datastore)");
}

export async function writeBytes(data: Uint8Array): Promise<string> {
  if (!heliaNode) throw new Error("IPFS not initialized");

  const fs = unixfs(heliaNode);
  const cid = await fs.addBytes(data);
  return cid.toString();
}

export async function readBytes(cidStr: string): Promise<Uint8Array> {
  if (!heliaNode) throw new Error("IPFS not initialized");

  const { CID } = await import("multiformats/cid");
  const cid = CID.parse(cidStr);
  const fs = unixfs(heliaNode);

  const chunks: Uint8Array[] = [];
  for await (const chunk of fs.cat(cid)) {
    chunks.push(chunk);
  }

  const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

export async function writeJson(data: unknown): Promise<string> {
  if (!heliaNode) throw new Error("IPFS not initialized");

  const j = json(heliaNode);
  const cid = await j.add(data);
  return cid.toString();
}

export async function stopIpfs(): Promise<void> {
  if (heliaNode) {
    await heliaNode.stop();
    heliaNode = null;
  }
}
