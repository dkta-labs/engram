import { Router, Request, Response } from "express";
import { ethers } from "ethers";
import { agentAuth } from "../middleware/auth.js";
import {
  getRegistrationMessage,
  verifySignature,
  getKeyDerivationMessage,
  deriveKey,
  encryptJson,
  decryptJson,
  serializeEncrypted,
  deserializeEncrypted,
} from "../services/crypto.js";
import * as registry from "../services/registry.js";
import * as blobstore from "../services/blobstore.js";
import { enqueueRegister, enqueueUpdateIndex } from "../services/writeQueue.js";

const router = Router();

// POST /v1/agent/register — free, no auth
router.post("/register", async (req: Request, res: Response) => {
  try {
    const { address, signature } = req.body as { address: string; signature: string };

    if (!address || !signature) {
      res.status(400).json({ error: "address and signature are required" });
      return;
    }

    const message = getRegistrationMessage(address);
    const recoveredAddress = verifySignature(message, signature);

    if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
      res.status(403).json({ error: "Signature does not match address" });
      return;
    }

    const { agentId, txHash } = await enqueueRegister(recoveredAddress);

    res.json({
      agentId: Number(agentId),
      address: recoveredAddress,
      txHash,
    });
  } catch (err) {
    const msg = String(err);
    if (msg.includes("Write queue full")) {
      res.status(503).json({ error: msg });
      return;
    }
    res.status(500).json({ error: "Registration failed", details: msg });
  }
});

// GET /v1/agent/:agentId — free, no auth
router.get("/:agentId", async (req: Request, res: Response) => {
  try {
    const agentId = parseInt(req.params.agentId, 10);
    if (isNaN(agentId)) {
      res.status(400).json({ error: "Invalid agentId" });
      return;
    }

    const owner = await registry.getAgentOwner(agentId);
    if (owner === ethers.ZeroAddress) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }

    const indexHash = await registry.getIndex(agentId);

    res.json({ agentId, owner, indexHash: indexHash || null });
  } catch (err) {
    res.status(500).json({ error: "Failed to get agent", details: String(err) });
  }
});

// GET /v1/agent/:agentId/index — x402 gated, auth required
router.get("/:agentId/index", agentAuth, async (req: Request, res: Response) => {
  try {
    const agentId = req.agentId!;
    const agentAddress = req.agentAddress!;

    const indexHash = await registry.getIndex(agentId);
    if (!indexHash) {
      res.json({ agentId, index: null });
      return;
    }

    // Fetch and decrypt the index
    const encryptedBytes = await blobstore.readBlob(indexHash);
    const keyDeriveSig = req.headers["x-derive-sig"] as string | undefined;
    if (!keyDeriveSig) {
      res.status(400).json({ error: "X-Derive-Sig header required for decryption" });
      return;
    }

    const key = await deriveKey(agentAddress, keyDeriveSig);
    const encrypted = deserializeEncrypted(Buffer.from(encryptedBytes));
    const indexDoc = decryptJson(encrypted, key);

    res.json({ agentId, hash: indexHash, index: indexDoc });
  } catch (err) {
    res.status(500).json({ error: "Failed to get index", details: String(err) });
  }
});

// PUT /v1/agent/:agentId/index — x402 gated, auth required
router.put("/:agentId/index", agentAuth, async (req: Request, res: Response) => {
  try {
    const agentId = req.agentId!;
    const agentAddress = req.agentAddress!;
    const { indexDoc } = req.body as { indexDoc: unknown };

    if (!indexDoc) {
      res.status(400).json({ error: "indexDoc is required" });
      return;
    }

    const keyDeriveSig = req.headers["x-derive-sig"] as string | undefined;
    if (!keyDeriveSig) {
      res.status(400).json({ error: "X-Derive-Sig header required for encryption" });
      return;
    }

    const key = await deriveKey(agentAddress, keyDeriveSig);
    const encrypted = encryptJson(indexDoc, key);
    const serialized = serializeEncrypted(encrypted);

    const hash = await blobstore.writeBlob(serialized);
    const txHash = await enqueueUpdateIndex(agentId, hash);

    res.json({ hash, txHash });
  } catch (err) {
    const msg = String(err);
    if (msg.includes("Write queue full")) {
      res.status(503).json({ error: msg });
      return;
    }
    res.status(500).json({ error: "Failed to update index", details: msg });
  }
});

export default router;
