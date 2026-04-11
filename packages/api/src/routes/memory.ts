import { Router, Request, Response } from "express";
import { agentAuth } from "../middleware/auth.js";
import {
  deriveKey,
  encryptJson,
  decryptJson,
  serializeEncrypted,
  deserializeEncrypted,
} from "../services/crypto.js";
import * as ipfs from "../services/ipfs.js";

const router = Router();

// POST /v1/memory — x402 gated, auth required
router.post("/", agentAuth, async (req: Request, res: Response) => {
  try {
    const agentAddress = req.agentAddress!;
    const { type, data, metadata } = req.body as {
      type: "blob" | "kv" | "text";
      data: unknown;
      metadata?: Record<string, unknown>;
    };

    if (!type || !data) {
      res.status(400).json({ error: "type and data are required" });
      return;
    }

    const keyDeriveSig = req.headers["x-derive-sig"] as string | undefined;
    if (!keyDeriveSig) {
      res.status(400).json({ error: "X-Derive-Sig header required for encryption" });
      return;
    }

    // Encrypt the data
    const key = await deriveKey(agentAddress, keyDeriveSig);
    const payload = { type, data, metadata: metadata || null };
    const encrypted = encryptJson(payload, key);
    const serialized = serializeEncrypted(encrypted);

    // Write to IPFS
    const cid = await ipfs.writeBytes(serialized);

    res.json({ cid, type });
  } catch (err) {
    res.status(500).json({ error: "Failed to store memory", details: String(err) });
  }
});

// GET /v1/memory/:cid — x402 gated, auth required
router.get("/:cid", agentAuth, async (req: Request, res: Response) => {
  try {
    const { cid } = req.params;
    const agentAddress = req.agentAddress!;

    const keyDeriveSig = req.headers["x-derive-sig"] as string | undefined;
    if (!keyDeriveSig) {
      res.status(400).json({ error: "X-Derive-Sig header required for decryption" });
      return;
    }

    const key = await deriveKey(agentAddress, keyDeriveSig);
    const encryptedBytes = await ipfs.readBytes(cid);
    const encrypted = deserializeEncrypted(Buffer.from(encryptedBytes));
    const decrypted = decryptJson(encrypted, key) as {
      type: string;
      data: unknown;
      metadata: Record<string, unknown> | null;
    };

    res.json({
      cid,
      data: decrypted.data,
      metadata: decrypted.metadata,
      type: decrypted.type,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to retrieve memory", details: String(err) });
  }
});

export default router;
