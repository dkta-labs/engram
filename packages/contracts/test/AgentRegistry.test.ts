import { expect } from "chai";
import { ethers } from "hardhat";
import { AgentRegistry } from "../typechain-types";

describe("AgentRegistry", function () {
  let registry: AgentRegistry;

  beforeEach(async function () {
    const factory = await ethers.getContractFactory("AgentRegistry");
    registry = await factory.deploy();
    await registry.waitForDeployment();
  });

  describe("register", function () {
    it("should register an agent and return id 1", async function () {
      const [owner] = await ethers.getSigners();
      const tx = await registry.register(owner.address);
      await tx.wait();

      const agentId = await registry.getAgentId(owner.address);
      expect(agentId).to.equal(1n);

      const ownerAddr = await registry.agentOwners(1n);
      expect(ownerAddr).to.equal(owner.address);
    });

    it("should register on behalf of another address", async function () {
      const [deployer, agent] = await ethers.getSigners();

      await registry.connect(deployer).register(agent.address);

      expect(await registry.getAgentId(agent.address)).to.equal(1n);
      expect(await registry.agentOwners(1n)).to.equal(agent.address);
    });

    it("should increment ids for multiple agents", async function () {
      const [deployer, second, third] = await ethers.getSigners();

      await registry.connect(deployer).register(second.address);
      await registry.connect(deployer).register(third.address);

      expect(await registry.getAgentId(second.address)).to.equal(1n);
      expect(await registry.getAgentId(third.address)).to.equal(2n);
    });

    it("should reject double registration", async function () {
      const [owner] = await ethers.getSigners();
      await registry.register(owner.address);
      await expect(registry.register(owner.address)).to.be.revertedWith("Already registered");
    });

    it("should emit AgentRegistered event", async function () {
      const [owner] = await ethers.getSigners();
      await expect(registry.register(owner.address))
        .to.emit(registry, "AgentRegistered")
        .withArgs(1n, owner.address);
    });
  });

  describe("updateIndex", function () {
    it("should update the memory index CID", async function () {
      const [owner] = await ethers.getSigners();
      await registry.register(owner.address);
      await registry.updateIndex(1n, "QmTestCid123");

      const cid = await registry.getIndex(1n);
      expect(cid).to.equal("QmTestCid123");
    });

    it("should reject non-owner updates", async function () {
      const [owner, attacker] = await ethers.getSigners();
      await registry.register(owner.address);

      await expect(
        registry.connect(attacker).updateIndex(1n, "QmMalicious")
      ).to.be.revertedWith("Not owner");
    });

    it("should emit IndexUpdated event", async function () {
      const [owner] = await ethers.getSigners();
      await registry.register(owner.address);
      await expect(registry.updateIndex(1n, "QmNewCid"))
        .to.emit(registry, "IndexUpdated")
        .withArgs(1n, "QmNewCid");
    });
  });
});
