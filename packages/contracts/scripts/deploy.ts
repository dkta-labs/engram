import { ethers } from "hardhat";

async function main() {
  const factory = await ethers.getContractFactory("AgentRegistry");
  const registry = await factory.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log(`AgentRegistry deployed to: ${address}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
