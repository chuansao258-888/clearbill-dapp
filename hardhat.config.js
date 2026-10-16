require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** Configures the pinned compiler and disposable local network. */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" }
  },
  networks: {
    hardhat: { chainId: 31337 },
    localhost: { url: "http://127.0.0.1:8545", chainId: 31337 }
  },
  paths: { tests: "./tests/contracts" }
};
