import { getServerWallet, getProvider, getContract } from "./registry.js";

export interface RegisterResult {
  agentId: bigint;
  txHash: string;
}

type WriteJob =
  | { type: "register"; ownerAddress: string; resolve: (r: RegisterResult) => void; reject: (e: Error) => void }
  | { type: "updateIndex"; agentId: number; hash: string; resolve: (txHash: string) => void; reject: (e: Error) => void };

const queue: WriteJob[] = [];
let processing = false;

const MAX_RETRIES = 3;
const MAX_QUEUE_SIZE = 500;

export function startWriteQueue(): void {
  console.log("Write queue initialized");
}

export function enqueueRegister(ownerAddress: string): Promise<RegisterResult> {
  if (queue.length >= MAX_QUEUE_SIZE) {
    return Promise.reject(new Error("Write queue full — try again later"));
  }
  return new Promise<RegisterResult>((resolve, reject) => {
    queue.push({ type: "register", ownerAddress, resolve, reject });
    drain();
  });
}

export function enqueueUpdateIndex(agentId: number, hash: string): Promise<string> {
  if (queue.length >= MAX_QUEUE_SIZE) {
    return Promise.reject(new Error("Write queue full — try again later"));
  }
  return new Promise<string>((resolve, reject) => {
    queue.push({ type: "updateIndex", agentId, hash, resolve, reject });
    drain();
  });
}

function drain(): void {
  if (processing) return;
  const job = queue.shift();
  if (!job) return;
  processing = true;
  processJob(job).finally(() => {
    processing = false;
    drain();
  });
}

async function processJob(job: WriteJob): Promise<void> {
  const contract = getContract();
  const provider = getProvider();
  const serverWallet = getServerWallet();

  let nonceOverride: number | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const txOpts = nonceOverride !== undefined ? { nonce: nonceOverride } : {};

      if (job.type === "register") {
        const tx = await contract.register(job.ownerAddress, txOpts);
        const receipt = await tx.wait();

        const event = receipt.logs.find((log: { topics: string[]; data: string }) => {
          try {
            return contract.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === "AgentRegistered";
          } catch {
            return false;
          }
        });

        if (!event) throw new Error("AgentRegistered event not found");

        const parsed = contract.interface.parseLog({ topics: [...event.topics], data: event.data });
        const agentId = parsed!.args[0] as bigint;

        job.resolve({ agentId, txHash: receipt.hash });
      } else {
        const tx = await contract.updateIndex(job.agentId, job.hash, txOpts);
        const receipt = await tx.wait();
        job.resolve(receipt.hash as string);
      }
      return;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const isNonceError = message.includes("NONCE_EXPIRED") || message.includes("nonce too low") || message.includes("replacement fee too low");

      if (isNonceError && attempt < MAX_RETRIES) {
        console.warn(`Write queue: nonce error on attempt ${attempt}, resetting nonce and retrying...`);
        nonceOverride = await provider.getTransactionCount(serverWallet.address, "pending");
        console.log(`Write queue: reset nonce to ${nonceOverride}`);
        continue;
      }

      job.reject(err instanceof Error ? err : new Error(String(err)));
      return;
    }
  }
}
