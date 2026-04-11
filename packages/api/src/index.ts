import express from "express";
import cors from "cors";
import morgan from "morgan";
import { config } from "./config.js";
import { createPaymentMiddleware } from "./middleware/payment.js";
import { initIpfs, stopIpfs } from "./services/ipfs.js";
import { initVector, stopVector } from "./services/vector.js";
import { initRegistry } from "./services/registry.js";
import agentRoutes from "./routes/agent.js";
import memoryRoutes from "./routes/memory.js";
import statsRoutes from "./routes/stats.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(morgan("combined")); // structured access logs to stdout → docker logs

// Health check — free, no auth
app.get("/v1/health", (_req, res) => {
  res.json({
    status: "ok",
    version: "0.1.0",
    network: config.network,
    contractAddress: config.contractAddress,
  });
});

// x402 payment middleware (applied before routes)
app.use(createPaymentMiddleware());

// Routes
app.use("/v1/agent", agentRoutes);
app.use("/v1/memory", memoryRoutes);
app.use("/v1/stats", statsRoutes);

async function start(): Promise<void> {
  console.log("Initializing services...");

  initRegistry();
  await Promise.all([initIpfs(), initVector()]);

  app.listen(config.port, () => {
    console.log(`Engram API listening on port ${config.port}`);
    console.log(`Network: ${config.network}`);
    console.log(`Contract: ${config.contractAddress}`);
  });
}

async function shutdown(): Promise<void> {
  console.log("Shutting down...");
  await Promise.all([stopIpfs(), stopVector()]);
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

start().catch((err) => {
  console.error("Failed to start:", err);
  process.exit(1);
});
