const test = require("node:test");
const assert = require("node:assert/strict");
const { createChain } = require("../../server/chain");
const { createSharedChain } = require("../../server/shared-bills");

/** Builds deployment verifiers with controlled RPC receipt responses. */
function verifiers(receipt) {
  const config = {
    chainId: 11155111, contractAddress: "0x0000000000000000000000000000000000000001",
    deploymentBlock: 1, deploymentTransactionHash: `0x${"a".repeat(64)}`, abi: [], deployedBytecode: "0x6000"
  };
  config.shared = { ...config, contractAddress: "0x0000000000000000000000000000000000000002" };
  const provider = { send: async () => "0xaa36a7", getTransactionReceipt: async () => receipt, getCode: async () => "0x6000" };
  return [createChain(config, provider), createSharedChain(config, provider)];
}

test("a missing deployment receipt is reported as unavailable RPC data for both ledgers", async () => {
  for (const chain of verifiers(null)) {
    await assert.rejects(chain.verifyDeployment(), error => error.status === 503 && error.code === "RPC_RECEIPT_UNAVAILABLE");
  }
});

test("an actual receipt mismatch still rejects both deployments", async () => {
  const receipt = { status: 1, blockNumber: 999, contractAddress: "0x0000000000000000000000000000000000000001" };
  for (const chain of verifiers(receipt)) {
    await assert.rejects(chain.verifyDeployment(), error => error.status === 503 && /SETUP_REQUIRED$/.test(error.code));
  }
});
