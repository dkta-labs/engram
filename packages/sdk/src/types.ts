export interface EngramClientConfig {
  /** Base URL for the Engram API */
  apiUrl: string;
  /** Agent wallet private key (hex, 0x-prefixed) — used for auth signatures and x402 payments */
  privateKey: string;
  /** Network for x402 payments (default: "base-sepolia") */
  network?: "base-sepolia" | "base";
}

export interface StoreRequest {
  type: "blob" | "kv" | "text";
  data: unknown;
  metadata?: Record<string, unknown>;
}

export interface StoreResponse {
  hash: string;
  type: string;
}

export interface RetrieveResponse {
  hash: string;
  data: unknown;
  metadata: Record<string, unknown> | null;
  type: string;
}

export interface RegisterResponse {
  agentId: number;
  address: string;
  txHash: string;
}

export interface AgentInfo {
  agentId: number;
  owner: string;
  indexHash: string | null;
}

export interface IndexResponse {
  agentId: number;
  hash: string | null;
  index: unknown;
}

export interface UpdateIndexResponse {
  hash: string;
  txHash: string;
}

export interface HealthResponse {
  status: string;
  version: string;
  network: string;
  contractAddress: string;
}
