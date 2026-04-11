import dotenv from "dotenv";
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || "3000", 10),
  serverPrivateKey: process.env.SERVER_PRIVATE_KEY || "",
  paymentAddress: process.env.PAYMENT_ADDRESS || "",
  network: process.env.NETWORK || "base-sepolia",
  contractAddress: process.env.CONTRACT_ADDRESS || "",
  pinataJwt: process.env.PINATA_JWT || "",
  pinataGateway: process.env.PINATA_GATEWAY || "gateway.pinata.cloud",

  baseSepoliaRpc: process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org",
  blobDir: process.env.BLOB_DIR || "/data/blobs",
} as const;

export const AGENT_REGISTRY_ABI = [
  "function register(address owner) external returns (uint256)",
  "function updateIndex(uint256 agentId, string calldata cid) external",
  "function getAgentId(address owner) external view returns (uint256)",
  "function getIndex(uint256 agentId) external view returns (string memory)",
  "function agentIds(address) external view returns (uint256)",
  "function agentOwners(uint256) external view returns (address)",
  "function memoryIndex(uint256) external view returns (string)",
  "event AgentRegistered(uint256 indexed agentId, address indexed owner)",
  "event IndexUpdated(uint256 indexed agentId, string cid)",
] as const;
