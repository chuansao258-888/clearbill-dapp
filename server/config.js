const fs = require("node:fs");
const path = require("node:path");
const { getAddress } = require("ethers");
require("dotenv").config();

/** Reads and validates runtime settings without exposing credential-bearing URLs. */
function loadConfig() {
  const rpcUrl = process.env.RPC_URL;
  const deploymentFile = process.env.DEPLOYMENT_FILE;
  if (!rpcUrl || !deploymentFile) throw new Error("RPC_URL and DEPLOYMENT_FILE are required");
  const manifest = JSON.parse(fs.readFileSync(path.resolve(deploymentFile), "utf8"));
  const chainId = Number(process.env.CHAIN_ID || 11155111);
  const timeoutMs = Number(process.env.RPC_TIMEOUT_MS || 10000);
  const historyBlockSpan = Number(process.env.HISTORY_BLOCK_SPAN || 1000);
  if (!Number.isSafeInteger(chainId) || chainId < 1 || manifest.chainId !== chainId) throw new Error("Invalid chain ID or manifest chain");
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1) throw new Error("Invalid RPC timeout");
  if (!Number.isSafeInteger(historyBlockSpan) || historyBlockSpan < 1 || historyBlockSpan > 10000) throw new Error("Invalid history block span");
  if (!Number.isSafeInteger(manifest.deploymentBlock) || manifest.deploymentBlock < 0) throw new Error("Invalid deployment block");
  if (!/^0x[\da-fA-F]{64}$/.test(manifest.deploymentTransactionHash)) throw new Error("Invalid deployment transaction hash");
  const address = getAddress(manifest.contractAddress);
  const artifact = require("../artifacts/contracts/ClearBill.sol/ClearBill.json");
  return {
    rpcUrl, chainId, timeoutMs, historyBlockSpan,
    contractAddress: address,
    deploymentBlock: manifest.deploymentBlock,
    deploymentTransactionHash: manifest.deploymentTransactionHash,
    abi: artifact.abi,
    deployedBytecode: artifact.deployedBytecode,
    explorerBaseUrl: chainId === 11155111 ? "https://sepolia.etherscan.io" : null,
    port: Number(process.env.PORT || 3000)
  };
}

module.exports = { loadConfig };
