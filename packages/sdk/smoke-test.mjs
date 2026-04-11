/**
 * Engram full end-to-end smoke test — using x402 client library
 */
import { ethers } from "ethers";
import { createWalletClient, http, publicActions } from "viem";
import { baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { createPaymentHeader, selectPaymentRequirements } from "x402/client";

const API = "http://localhost:3000";
const AGENT_KEY = "0xc20bc5af31b67f40b217c5c0bb0699ca2d20caef667cb0d2ec9cd73961c80adb";

// ethers wallet for Engram signing protocol
const agentWallet = new ethers.Wallet(AGENT_KEY);

// viem wallet client for x402 EIP-712 payment signing
const account = privateKeyToAccount(AGENT_KEY);
const viemClient = createWalletClient({
  account,
  chain: baseSepolia,
  transport: http("https://sepolia.base.org"),
}).extend(publicActions);

console.log(`\nAgent wallet: ${agentWallet.address}`);

function hashMsg(msg) {
  return ethers.keccak256(ethers.toUtf8Bytes(msg));
}
async function signHash(wallet, hash) {
  return wallet.signMessage(ethers.getBytes(hash));
}
async function getRegSig(wallet) {
  return signHash(wallet, hashMsg("engram:register:v1:" + wallet.address.toLowerCase()));
}
async function getDeriveSig(wallet) {
  return signHash(wallet, hashMsg("engram:derive-key:v1:" + wallet.address.toLowerCase()));
}
async function getAuthHeader(wallet, agentId) {
  const timestamp = Date.now();
  const sig = await signHash(wallet, hashMsg("engram:auth:v1:" + agentId + ":" + timestamp));
  return JSON.stringify({ sig, agentId, timestamp });
}

async function apiCall(method, path, body, authHeader, extraHeaders = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(authHeader ? { "X-Agent-Sig": authHeader } : {}),
    ...extraHeaders,
  };
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  return { status: res.status, ok: res.ok, data: json };
}

// Make a call, auto-pay if 402, return result
async function callWithPayment(method, path, body, agentId, extraHeaders = {}) {
  const auth = await getAuthHeader(agentWallet, agentId);
  const r1 = await apiCall(method, path, body, auth, extraHeaders);
  if (r1.status !== 402) return r1;

  // Build x402 payment using the official client library
  const paymentReqs = r1.data.accepts;
  const selected = selectPaymentRequirements(paymentReqs);
  const paymentHeader = await createPaymentHeader(viemClient, 1, selected);

  const auth2 = await getAuthHeader(agentWallet, agentId);
  return apiCall(method, path, body, auth2, {
    ...extraHeaders,
    "X-PAYMENT": paymentHeader,
  });
}

async function run() {
  // 1. Health
  console.log("\n=== 1. Health ===");
  const health = await fetch(`${API}/v1/health`).then(r => r.json());
  console.log(JSON.stringify(health, null, 2));
  if (health.status !== "ok") throw new Error("Health check failed");

  // 2. Register
  console.log("\n=== 2. Register agent ===");
  const regSig = await getRegSig(agentWallet);
  const reg = await apiCall("POST", "/v1/agent/register", {
    address: agentWallet.address,
    signature: regSig,
  });
  console.log(`Status: ${reg.status}`, JSON.stringify(reg.data, null, 2));
  let agentId;
  if (reg.ok) {
    agentId = reg.data.agentId;
  } else if (reg.data?.details?.includes("Already registered")) {
    // Already registered — look up agentId by address
    console.log("Already registered — looking up agentId...");
    const lookup = await apiCall("GET", `/v1/agent/address/${agentWallet.address}`);
    if (lookup.ok) {
      agentId = lookup.data.agentId;
    } else {
      // Try agentId 2 (from previous run)
      agentId = 2;
      console.log("Using known agentId from previous run:", agentId);
    }
  } else {
    throw new Error(`Register failed: ${JSON.stringify(reg.data)}`);
  }
  console.log(`Agent ID: ${agentId}`);

  const deriveSig = await getDeriveSig(agentWallet);

  // 3. Store kv memory
  console.log("\n=== 3. Store kv memory ===");
  const storeBody = {
    type: "kv",
    data: { preference: "dark mode", language: "TypeScript" },
    metadata: { source: "smoke-test" },
  };
  const store = await callWithPayment("POST", "/v1/memory", storeBody, agentId, { "X-Derive-Sig": deriveSig });
  console.log(`Status: ${store.status}`, JSON.stringify(store.data, null, 2));
  if (!store.ok) throw new Error(`Store failed: ${JSON.stringify(store.data)}`);
  const { cid } = store.data;
  console.log(`✅ Stored CID: ${cid}`);

  // 4. Retrieve + verify
  console.log("\n=== 4. Retrieve memory ===");
  const retrieve = await callWithPayment("GET", `/v1/memory/${cid}`, null, agentId, { "X-Derive-Sig": deriveSig });
  console.log(`Status: ${retrieve.status}`, JSON.stringify(retrieve.data, null, 2));
  if (!retrieve.ok) throw new Error("Retrieve failed");

  const match = JSON.stringify(retrieve.data.data) === JSON.stringify(storeBody.data);
  console.log(match ? "✅ Data integrity verified" : "⚠️  Data mismatch");

  // 5. Store text + embedding
  console.log("\n=== 5. Store text + 1536-dim embedding ===");
  const embedding = Array.from({ length: 1536 }, () => Math.random() * 2 - 1);
  const textBody = {
    type: "text",
    data: "User prefers TypeScript and dark mode.",
    embedding,
    embeddingModel: "text-embedding-ada-002",
    metadata: { source: "smoke-test" },
  };
  const storeText = await callWithPayment("POST", "/v1/memory", textBody, agentId, { "X-Derive-Sig": deriveSig });
  console.log(`Status: ${storeText.status}`, JSON.stringify(storeText.data, null, 2));
  if (!storeText.ok) throw new Error("Text store failed");
  console.log(`✅ Text CID: ${storeText.data.cid}`);

  // 6. Semantic search
  console.log("\n=== 6. Semantic search ===");
  const queryEmbedding = Array.from({ length: 1536 }, () => Math.random() * 2 - 1);
  const search = await callWithPayment("POST", "/v1/memory/search", {
    queryEmbedding,
    topK: 3,
  }, agentId);
  console.log(`Status: ${search.status}`, JSON.stringify(search.data, null, 2));
  if (!search.ok) throw new Error("Search failed");

  if (Array.isArray(search.data?.results)) {
    console.log(`✅ Semantic search returned ${search.data.results.length} result(s)`);
  }

  console.log("\n✅ Full end-to-end test complete");
}

run().catch(err => {
  console.error("\n❌ Test failed:", err.message);
  process.exit(1);
});
