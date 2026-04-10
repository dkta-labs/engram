export interface PaymentRequirement {
  scheme: string;
  network: string;
  maxAmountRequired: string;
  resource: string;
  description: string;
  payTo: string;
  facilitatorUrl: string;
}

export interface EngramClientConfig {
  privateKey: string;
  network: "base-sepolia" | "base";
  apiUrl: string;
}

export interface StoreRequest {
  type: "blob" | "kv" | "text";
  data: unknown;
  metadata?: Record<string, unknown>;
}

export interface StoreResponse {
  cid: string;
  type: string;
}

export interface RetrieveResponse {
  cid: string;
  data: unknown;
  metadata: Record<string, unknown> | null;
  type: string;
}

export interface SearchResult {
  cid: string;
  score: number;
  metadata: Record<string, unknown> | null;
}

export interface SearchResponse {
  results: SearchResult[];
}

export interface RegisterResponse {
  agentId: number;
  address: string;
  txHash: string;
}

export interface AgentInfo {
  agentId: number;
  owner: string;
  indexCid: string | null;
}

export interface IndexResponse {
  agentId: number;
  cid: string | null;
  index: unknown;
}

export interface UpdateIndexResponse {
  cid: string;
  txHash: string;
}

export interface HealthResponse {
  status: string;
  version: string;
  network: string;
  contractAddress: string;
}
