import { ethers } from "ethers";

export function getKeyDerivationMessage(agentAddress: string): string {
  return ethers.keccak256(
    ethers.toUtf8Bytes("engram:derive-key:v1:" + agentAddress.toLowerCase())
  );
}

export function getRegistrationMessage(address: string): string {
  return ethers.keccak256(
    ethers.toUtf8Bytes("engram:register:v1:" + address.toLowerCase())
  );
}

export function getAuthMessage(agentId: number, timestamp: number): string {
  return ethers.keccak256(
    ethers.toUtf8Bytes("engram:auth:v1:" + agentId + ":" + timestamp)
  );
}
