import { Request, Response, NextFunction } from "express";
import { getAuthMessage, verifySignature } from "../services/crypto.js";
import { getAgentOwner } from "../services/registry.js";

declare global {
  namespace Express {
    interface Request {
      agentId?: number;
      agentAddress?: string;
    }
  }
}

const MAX_TIMESTAMP_AGE_MS = 5 * 60 * 1000; // 5 minutes

export async function agentAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const sigHeader = req.headers["x-agent-sig"] as string | undefined;
    if (!sigHeader) {
      res.status(401).json({ error: "Missing X-Agent-Sig header" });
      return;
    }

    let parsed: { sig: string; agentId: number; timestamp: number };
    try {
      parsed = JSON.parse(sigHeader);
    } catch {
      res.status(400).json({ error: "Invalid X-Agent-Sig header: must be JSON" });
      return;
    }

    const { sig, agentId, timestamp } = parsed;

    if (!sig || !agentId || !timestamp) {
      res.status(400).json({ error: "X-Agent-Sig must contain sig, agentId, and timestamp" });
      return;
    }

    const age = Date.now() - timestamp;
    if (age > MAX_TIMESTAMP_AGE_MS || age < -MAX_TIMESTAMP_AGE_MS) {
      res.status(401).json({ error: "Timestamp expired or too far in future" });
      return;
    }

    const message = getAuthMessage(agentId, timestamp);
    const recoveredAddress = verifySignature(message, sig);

    const ownerAddress = await getAgentOwner(agentId);
    if (ownerAddress.toLowerCase() !== recoveredAddress.toLowerCase()) {
      res.status(403).json({ error: "Signature does not match agent owner" });
      return;
    }

    req.agentId = agentId;
    req.agentAddress = recoveredAddress;
    next();
  } catch (err) {
    res.status(401).json({ error: "Auth verification failed", details: String(err) });
  }
}
