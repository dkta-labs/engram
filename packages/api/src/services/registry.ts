import { ethers } from "ethers";
import { config, AGENT_REGISTRY_ABI } from "../config.js";

let provider: ethers.JsonRpcProvider;
let serverWallet: ethers.Wallet;
let contract: ethers.Contract;

export function initRegistry(): void {
  const rpcUrl = config.network === "base-sepolia"
    ? config.baseSepoliaRpc
    : "https://mainnet.base.org";

  provider = new ethers.JsonRpcProvider(rpcUrl);
  serverWallet = new ethers.Wallet(config.serverPrivateKey, provider);
  contract = new ethers.Contract(config.contractAddress, AGENT_REGISTRY_ABI, serverWallet);
  console.log("Registry initialized on", config.network);
}

export async function registerAgent(ownerAddress: string, txOptions: object = {}): Promise<{ agentId: bigint; txHash: string }> {
  const tx = await contract.register(ownerAddress, txOptions);
  const receipt = await tx.wait();

  const event = receipt.logs.find(
    (log: ethers.Log) => {
      try {
        return contract.interface.parseLog({ topics: [...log.topics], data: log.data })?.name === "AgentRegistered";
      } catch {
        return false;
      }
    }
  );

  if (!event) throw new Error("AgentRegistered event not found");

  const parsed = contract.interface.parseLog({ topics: [...event.topics], data: event.data });
  const agentId = parsed!.args[0] as bigint;

  return { agentId, txHash: receipt.hash };
}

export async function getAgentId(address: string): Promise<bigint> {
  return contract.getAgentId(address);
}

export async function getAgentOwner(agentId: number): Promise<string> {
  return contract.agentOwners(agentId);
}

export async function getIndex(agentId: number): Promise<string> {
  return contract.getIndex(agentId);
}

export async function updateIndex(agentId: number, cid: string, txOptions: object = {}): Promise<string> {
  const tx = await contract.updateIndex(agentId, cid, txOptions);
  const receipt = await tx.wait();
  return receipt.hash as string;
}

export function getServerWallet(): ethers.Wallet {
  return serverWallet;
}

export function getProvider(): ethers.JsonRpcProvider {
  return provider;
}

export function getContract(): ethers.Contract {
  return contract;
}
