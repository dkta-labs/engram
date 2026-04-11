import { paymentMiddleware } from "x402-express";
import { config } from "../config.js";

export function createPaymentMiddleware() {
  return paymentMiddleware(
    config.paymentAddress as `0x${string}`,
    {
      "POST /v1/memory": {
        price: "$0.001",
        network: "base-sepolia",
        config: { description: "Store encrypted memory on IPFS" },
      },
      "GET /v1/memory/:hash": {
        price: "$0.0001",
        network: "base-sepolia",
        config: { description: "Retrieve encrypted memory" },
      },
      "POST /v1/memory/search": {
        price: "$0.005",
        network: "base-sepolia",
        config: { description: "Semantic memory search" },
      },
      "GET /v1/agent/:agentId/index": {
        price: "$0.0001",
        network: "base-sepolia",
        config: { description: "Read memory index" },
      },
      "PUT /v1/agent/:agentId/index": {
        price: "$0.0005",
        network: "base-sepolia",
        config: { description: "Update memory index" },
      },
    },
    { url: "https://x402.org/facilitator" }
  );
}
