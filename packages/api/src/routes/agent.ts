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
import * as ipfs from "../services/ipfs.js";

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

    const { agentId, txHash } = await registry.registerAgent(recoveredAddress);

    res.json({
      agentId: Number(agentId),
      address: recoveredAddress,
      txHash,
    });
  } catch (err) {
    res.status(500).json({ error: "Registration failed", details: String(err) });
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

    const indexCid = await registry.getIndex(agentId);

    res.json({ agentId, owner, indexCid: indexCid || null });
  } catch (err) {
    res.status(500).json({ error: "Failed to get agent", details: String(err) });
  }
});

// GET /v1/agent/:agentId/index — x402 gated, auth required
router.get("/:agentId/index", agentAuth, async (req: Request, res: Response) => {
  try {
    const agentId = req.agentId!;
    const agentAddress = req.agentAddress!;

    const indexCid = await registry.getIndex(agentId);
    if (!indexCid) {
      res.json({ agentId, index: null });
      return;
    }

    // Fetch and decrypt the index
    const encryptedBytes = await ipfs.readBytes(indexCid);
    const keyDeriveSig = req.headers["x-derive-sig"] as string | undefined;
    if (!keyDeriveSig) {
      res.status(400).json({ error: "X-Derive-Sig header required for decryption" });
      return;
    }

    const key = await deriveKey(agentAddress, keyDeriveSig);
    const encrypted = deserializeEncrypted(Buffer.from(encryptedBytes));
    const indexDoc = decryptJson(encrypted, key);

    res.json({ agentId, cid: indexCid, index: indexDoc });
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

    const cid = await ipfs.writeBytes(serialized);
    const txHash = await registry.updateIndex(agentId, cid);

    res.json({ cid, txHash });
  } catch (err) {
    res.status(500).json({ error: "Failed to update index", details: String(err) });
  }
});

export default router;
