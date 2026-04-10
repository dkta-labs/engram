import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";

const config: HardhatUserConfig = {
  solidity: "0.8.24",
  networks: {
    "base-sepolia": {
      url: process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org",
      accounts: process.env.SERVER_PRIVATE_KEY
        ? [process.env.SERVER_PRIVATE_KEY]
        : [],
    },
    base: {
      url: process.env.BASE_RPC || "https://mainnet.base.org",
      accounts: process.env.SERVER_PRIVATE_KEY
        ? [process.env.SERVER_PRIVATE_KEY]
        : [],
    },
  },
};

export default config;
