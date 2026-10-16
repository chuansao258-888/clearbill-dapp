const fs = require("node:fs");
const { JsonRpcProvider, getAddress } = require("ethers");
require("dotenv").config();

/** Verifies a public deployment manifest against its network and creation receipt. */
async function main() {
  const manifest = JSON.parse(fs.readFileSync(process.env.DEPLOYMENT_FILE, "utf8"));
  const provider = new JsonRpcProvider(process.env.RPC_URL);
  const network = await provider.getNetwork();
  if (network.chainId !== BigInt(manifest.chainId)) throw new Error("Chain ID mismatch");
  const address = getAddress(manifest.contractAddress);
  const receipt = await provider.getTransactionReceipt(manifest.deploymentTransactionHash);
  if (!receipt || receipt.status !== 1 || receipt.contractAddress?.toLowerCase() !== address.toLowerCase()) throw new Error("Deployment receipt mismatch");
  if (receipt.blockNumber !== manifest.deploymentBlock) throw new Error("Deployment block mismatch");
  const expected = require("../artifacts/contracts/ClearBill.sol/ClearBill.json").deployedBytecode;
  if ((await provider.getCode(address)).toLowerCase() !== expected.toLowerCase()) throw new Error("Deployed runtime bytecode mismatch");
  console.log(JSON.stringify({ chainId: manifest.chainId, contractAddress: address, deploymentBlock: receipt.blockNumber, deploymentTransactionHash: receipt.hash }));
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
