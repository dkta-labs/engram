import { createCipheriv, createDecipheriv, randomBytes, hkdf } from "node:crypto";
import { ethers } from "ethers";

const HKDF_SALT = Buffer.from("engram-aes256gcm-v1");
const HKDF_INFO = Buffer.from("engram-encryption-key");
const KEY_LENGTH = 32; // AES-256
const IV_LENGTH = 12; // GCM standard
const TAG_LENGTH = 16; // GCM auth tag

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

export async function deriveKey(agentAddress: string, signature: string): Promise<Buffer> {
  const sigBytes = Buffer.from(ethers.getBytes(signature));

  return new Promise((resolve, reject) => {
    hkdf("sha256", sigBytes, HKDF_SALT, HKDF_INFO, KEY_LENGTH, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(Buffer.from(derivedKey));
    });
  });
}

export interface EncryptedPayload {
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
}

export function encrypt(plaintext: Buffer, key: Buffer): EncryptedPayload {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);

  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  return { ciphertext, iv, tag };
}

export function decrypt(ciphertext: Buffer, iv: Buffer, tag: Buffer, key: Buffer): Buffer {
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function encryptJson(data: unknown, key: Buffer): EncryptedPayload {
  const plaintext = Buffer.from(JSON.stringify(data), "utf-8");
  return encrypt(plaintext, key);
}

export function decryptJson(encrypted: EncryptedPayload, key: Buffer): unknown {
  const plaintext = decrypt(encrypted.ciphertext, encrypted.iv, encrypted.tag, key);
  return JSON.parse(plaintext.toString("utf-8"));
}

export function serializeEncrypted(encrypted: EncryptedPayload): Buffer {
  // Format: [iv (12)] [tag (16)] [ciphertext (...)]
  return Buffer.concat([encrypted.iv, encrypted.tag, encrypted.ciphertext]);
}

export function deserializeEncrypted(data: Buffer): EncryptedPayload {
  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH + TAG_LENGTH);
  return { ciphertext, iv, tag };
}
