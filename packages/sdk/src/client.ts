import { ethers } from "ethers";
import { wrapFetchWithPayment, createSigner } from "x402-fetch";
import {
  getRegistrationMessage,
  getAuthMessage,
  getKeyDerivationMessage,
  deriveKey,
  encryptJson,
  decryptJson,
  serializeEncrypted,
  deserializeEncrypted,
} from "./crypto.js";
import type {
  EngramClientConfig,
  StoreRequest,
  StoreResponse,
  RetrieveResponse,
  RegisterResponse,
  AgentInfo,
  IndexResponse,
  UpdateIndexResponse,
  HealthResponse,
} from "./types.js";

export class EngramAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngramAuthError";
  }
}

export class EngramPaymentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngramPaymentError";
  }
}

export class EngramIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EngramIntegrityError";
  }
}

export class EngramClient {
  private ethersWallet: ethers.Wallet;
  private apiUrl: string;
  private network: string;
  private agentId: number | null = null;
  private deriveSig: string | null = null;
  private encryptionKey: Buffer | null = null;
  private paidFetchPromise: Promise<typeof globalThis.fetch>;
  private indexLock: Promise<void> = Promise.resolve();

  constructor(config: EngramClientConfig) {
    this.ethersWallet = new ethers.Wallet(config.privateKey);
    this.apiUrl = config.apiUrl.replace(/\/$/, "");
    this.network = config.network ?? "base-sepolia";

    // Ensure private key is 0x-prefixed for viem
    const hexKey = config.privateKey.startsWith("0x")
      ? (config.privateKey as `0x${string}`)
      : (`0x${config.privateKey}` as `0x${string}`);

    this.paidFetchPromise = createSigner(this.network, hexKey).then(
      (signer) => wrapFetchWithPayment(globalThis.fetch, signer),
    );
  }

  get address(): string {
    return this.ethersWallet.address;
  }

  private async getDeriveSig(): Promise<string> {
    if (!this.deriveSig) {
      const message = getKeyDerivationMessage(this.ethersWallet.address);
      this.deriveSig = await this.ethersWallet.signMessage(ethers.getBytes(message));
    }
    return this.deriveSig;
  }

  private async getEncryptionKey(): Promise<Buffer> {
    if (!this.encryptionKey) {
      const sig = await this.getDeriveSig();
      this.encryptionKey = await deriveKey(this.ethersWallet.address, sig);
    }
    return this.encryptionKey;
  }

  private async makeAuthHeader(): Promise<string> {
    if (!this.agentId) throw new EngramAuthError("Not registered. Call register() or setAgentId() first.");
    const timestamp = Date.now();
    const message = getAuthMessage(this.agentId, timestamp);
    const sig = await this.ethersWallet.signMessage(ethers.getBytes(message));
    return JSON.stringify({ sig, agentId: this.agentId, timestamp });
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    auth: boolean = false,
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (auth) {
      headers["X-Agent-Sig"] = await this.makeAuthHeader();
      headers["X-Derive-Sig"] = await this.getDeriveSig();
    }

    let res: Response;
    const paidFetch = await this.paidFetchPromise;
    try {
      res = await paidFetch(`${this.apiUrl}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      throw new EngramPaymentError(`Payment failed: ${err}`);
    }

    if (res.status === 401 || res.status === 403) {
      const errBody = await res.text();
      throw new EngramAuthError(`Auth failed (${res.status}): ${errBody}`);
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

  /** Register agent on-chain (free, one-time) */
  async register(): Promise<RegisterResponse> {
    const message = getRegistrationMessage(this.ethersWallet.address);
    const signature = await this.ethersWallet.signMessage(ethers.getBytes(message));

    const result = await this.request<RegisterResponse>("POST", "/v1/agent/register", {
      address: this.ethersWallet.address,
      signature,
    });

    this.agentId = result.agentId;
    return result;
  }

  /** Look up an agent by ID */
  async getAgent(agentId: number): Promise<AgentInfo> {
    return this.request<AgentInfo>("GET", `/v1/agent/${agentId}`);
  }

  /** Set the agent ID without calling register() (for already-registered agents) */
  setAgentId(agentId: number): void {
    this.agentId = agentId;
  }

  /** Store a memory blob (x402 paid: $0.001) — encrypts client-side, returns the content hash */
  async store(req: StoreRequest): Promise<string> {
    if (!this.agentId) throw new EngramAuthError("Not registered. Call register() or setAgentId() first.");

    const key = await this.getEncryptionKey();
    const payload = { type: req.type, data: req.data, metadata: req.metadata || null };
    const encrypted = encryptJson(payload, key);
    const serialized = serializeEncrypted(encrypted);

    const headers: Record<string, string> = {
      "Content-Type": "application/octet-stream",
      "X-Agent-Sig": await this.makeAuthHeader(),
      "X-Derive-Sig": await this.getDeriveSig(),
    };

    let res: Response;
    const paidFetch = await this.paidFetchPromise;
    try {
      res = await paidFetch(`${this.apiUrl}/v1/memory`, {
        method: "POST",
        headers,
        body: serialized,
      });
    } catch (err) {
      throw new EngramPaymentError(`Payment failed: ${err}`);
    }

    if (res.status === 401 || res.status === 403) {
      const errBody = await res.text();
      throw new EngramAuthError(`Auth failed (${res.status}): ${errBody}`);
    }

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Engram API error ${res.status}: ${errBody}`);
    }

    const result = await res.json() as StoreResponse;
    return result.hash;
  }

  /** Retrieve a memory blob by hash (x402 paid: $0.0001) — fetches and decrypts client-side */
  async retrieve(hash: string): Promise<RetrieveResponse> {
    if (!this.agentId) throw new EngramAuthError("Call register() or setAgentId() before retrieving memories");

    const headers: Record<string, string> = {
      "X-Agent-Sig": await this.makeAuthHeader(),
      "X-Derive-Sig": await this.getDeriveSig(),
    };

    let res: Response;
    const paidFetch = await this.paidFetchPromise;
    try {
      res = await paidFetch(`${this.apiUrl}/v1/memory/${hash}`, {
        method: "GET",
        headers,
      });
    } catch (err) {
      throw new EngramPaymentError(`Payment failed: ${err}`);
    }

    if (res.status === 401 || res.status === 403) {
      const errBody = await res.text();
      throw new EngramAuthError(`Auth failed (${res.status}): ${errBody}`);
    }

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`Engram API error ${res.status}: ${errBody}`);
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    const encrypted = deserializeEncrypted(buffer);
    const key = await this.getEncryptionKey();

    let decrypted: { type: string; data: unknown; metadata: Record<string, unknown> | null };
    try {
      decrypted = decryptJson(encrypted, key) as typeof decrypted;
    } catch (err) {
      throw new EngramIntegrityError(`Decryption failed: ${err}`);
    }

    return { hash, data: decrypted.data, metadata: decrypted.metadata, type: decrypted.type };
  }

  /** Update the agent's memory index (x402 paid: $0.0005) */
  async setIndex(indexDoc: unknown): Promise<UpdateIndexResponse> {
    if (!this.agentId) throw new EngramAuthError("Not registered. Call register() or setAgentId() first.");
    return this.request<UpdateIndexResponse>(
      "PUT",
      `/v1/agent/${this.agentId}/index`,
      { indexDoc },
      true,
    );
  }

  /** Read the agent's memory index (x402 paid: $0.0001) — returns the index object or null */
  async getIndex(): Promise<unknown> {
    if (!this.agentId) throw new EngramAuthError("Not registered. Call register() or setAgentId() first.");
    const result = await this.request<IndexResponse>(
      "GET",
      `/v1/agent/${this.agentId}/index`,
      undefined,
      true,
    );
    return result.index;
  }

  /** Convenience: append a hash to the existing index's memories array (mutex-serialized) */
  async appendToIndex(hash: string): Promise<void> {
    this.indexLock = this.indexLock.then(async () => {
      const existing = await this.getIndex() as { memories?: string[]; [key: string]: unknown } | null;
      const memories = existing?.memories ?? [];
      const updated = {
        ...existing,
        memories: [...memories, hash],
        updated: Date.now(),
      };
      await this.setIndex(updated);
    });
    return this.indexLock;
  }
}
