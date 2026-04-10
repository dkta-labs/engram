import { createHelia } from "helia";
import { json } from "@helia/json";
import { unixfs } from "@helia/unixfs";
import { PinataSDK } from "pinata";
import { config } from "../config.js";
import type { CID } from "multiformats/cid";

let heliaNode: Awaited<ReturnType<typeof createHelia>> | null = null;
let pinata: PinataSDK | null = null;

export async function initIpfs(): Promise<void> {
  heliaNode = await createHelia();
  console.log("Helia IPFS node started");

  if (config.pinataJwt) {
    pinata = new PinataSDK({ pinataJwt: config.pinataJwt, pinataGateway: config.pinataGateway });
    console.log("Pinata SDK initialized");
  }
}

export async function writeBytes(data: Uint8Array): Promise<string> {
  if (!heliaNode) throw new Error("IPFS not initialized");

  const fs = unixfs(heliaNode);
  const cid = await fs.addBytes(data);
  const cidStr = cid.toString();

  if (pinata) {
    try {
      const blob = new Blob([data]);
      const file = new File([blob], `engram-${cidStr}`, { type: "application/octet-stream" });
      await pinata.upload.file(file);
    } catch (err) {
      console.error("Pinata pin failed (non-fatal):", err);
    }
  }

  return cidStr;
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
