import { ethers } from "ethers";
import { getRegistrationMessage, getAuthMessage, getKeyDerivationMessage } from "./crypto.js";
import type {
  EngramClientConfig,
  PaymentRequirement,
  StoreRequest,
  StoreResponse,
  RetrieveResponse,
  SearchResponse,
  RegisterResponse,
  AgentInfo,
  IndexResponse,
  UpdateIndexResponse,
  HealthResponse,
} from "./types.js";

export class PaymentRequiredError extends Error {
  public readonly requirements: PaymentRequirement[];

  constructor(requirements: PaymentRequirement[]) {
    super("Payment required (x402)");
    this.name = "PaymentRequiredError";
    this.requirements = requirements;
  }
}

export class EngramClient {
  private wallet: ethers.Wallet;
  private apiUrl: string;
  private network: string;
  private agentId: number | null = null;
  private deriveSig: string | null = null;

  constructor(config: EngramClientConfig) {
    this.wallet = new ethers.Wallet(config.privateKey);
    this.apiUrl = config.apiUrl.replace(/\/$/, "");
    this.network = config.network;
  }

  get address(): string {
    return this.wallet.address;
  }

  private async getDeriveSig(): Promise<string> {
    if (!this.deriveSig) {
      const message = getKeyDerivationMessage(this.wallet.address);
      this.deriveSig = await this.wallet.signMessage(ethers.getBytes(message));
    }
    return this.deriveSig;
  }

  private async makeAuthHeader(): Promise<string> {
    if (!this.agentId) throw new Error("Not registered. Call register() first.");
    const timestamp = Date.now();
    const message = getAuthMessage(this.agentId, timestamp);
    const sig = await this.wallet.signMessage(ethers.getBytes(message));
    return JSON.stringify({ sig, agentId: this.agentId, timestamp });
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    auth: boolean = false
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (auth) {
      headers["X-Agent-Sig"] = await this.makeAuthHeader();
      headers["X-Derive-Sig"] = await this.getDeriveSig();
    }

    const res = await fetch(`${this.apiUrl}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (res.status === 402) {
      const body = await res.json() as { paymentRequirements?: PaymentRequirement[] };
      const requirements = body.paymentRequirements || [];
      throw new PaymentRequiredError(requirements);
    }

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Engram API error ${res.status}: ${errBody}`);
    }

    return res.json() as Promise<T>;
  }

  async health(): Promise<HealthResponse> {
    return this.request<HealthResponse>("GET", "/v1/health");
  }

  async register(): Promise<RegisterResponse> {
    const message = getRegistrationMessage(this.wallet.address);
    const signature = await this.wallet.signMessage(ethers.getBytes(message));

    const result = await this.request<RegisterResponse>("POST", "/v1/agent/register", {
      address: this.wallet.address,
      signature,
    });

    this.agentId = result.agentId;
    return result;
  }

  async getAgent(agentId: number): Promise<AgentInfo> {
    return this.request<AgentInfo>("GET", `/v1/agent/${agentId}`);
  }

  setAgentId(agentId: number): void {
    this.agentId = agentId;
  }

  async store(req: StoreRequest): Promise<StoreResponse> {
    if (!this.agentId) throw new Error("Not registered. Call register() or setAgentId() first.");
    return this.request<StoreResponse>("POST", "/v1/memory", {
      agentId: this.agentId,
      ...req,
    }, true);
  }

  async retrieve(cid: string): Promise<RetrieveResponse> {
    return this.request<RetrieveResponse>("GET", `/v1/memory/${cid}`, undefined, true);
  }

  async search(query: string, topK?: number): Promise<SearchResponse> {
    if (!this.agentId) throw new Error("Not registered. Call register() or setAgentId() first.");
    return this.request<SearchResponse>("POST", "/v1/memory/search", {
      agentId: this.agentId,
      query,
      topK,
    }, true);
  }

  async getIndex(): Promise<IndexResponse> {
    if (!this.agentId) throw new Error("Not registered. Call register() or setAgentId() first.");
    return this.request<IndexResponse>("GET", `/v1/agent/${this.agentId}/index`, undefined, true);
  }

  async updateIndex(indexDoc?: unknown): Promise<UpdateIndexResponse> {
    if (!this.agentId) throw new Error("Not registered. Call register() or setAgentId() first.");
    return this.request<UpdateIndexResponse>(
      "PUT",
      `/v1/agent/${this.agentId}/index`,
      { indexDoc: indexDoc || {} },
      true
    );
  }
}
