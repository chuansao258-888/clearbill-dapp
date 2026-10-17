const fs = require("node:fs");
const { JsonRpcProvider, getAddress } = require("ethers");
require("dotenv").config();

/** Verifies one public manifest against its creation receipt and exact code. */
async function verify(file, artifactPath, provider) {
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  const network = await provider.getNetwork();
  if (network.chainId !== BigInt(manifest.chainId)) throw new Error("Chain ID mismatch");
  const address = getAddress(manifest.contractAddress);
  const receipt = await provider.getTransactionReceipt(manifest.deploymentTransactionHash);
  if (!receipt || receipt.status !== 1 || receipt.contractAddress?.toLowerCase() !== address.toLowerCase()) throw new Error("Deployment receipt mismatch");
  if (receipt.blockNumber !== manifest.deploymentBlock) throw new Error("Deployment block mismatch");
  const expected = require(artifactPath).deployedBytecode;
  if ((await provider.getCode(address)).toLowerCase() !== expected.toLowerCase()) throw new Error("Deployed runtime bytecode mismatch");
  return { chainId: manifest.chainId, contractAddress: address, deploymentBlock: receipt.blockNumber, deploymentTransactionHash: receipt.hash };
}

/** Checks the original bill ledger and optional shared bill ledger. */
async function main() {
  const provider = new JsonRpcProvider(process.env.RPC_URL);
  const bill = await verify(process.env.DEPLOYMENT_FILE, "../artifacts/contracts/ClearBill.sol/ClearBill.json", provider);
  console.log(JSON.stringify({ ledger: "individual", ...bill }));
  if (process.env.SHARED_DEPLOYMENT_FILE) {
    const shared = await verify(process.env.SHARED_DEPLOYMENT_FILE, "../artifacts/contracts/SharedBill.sol/SharedBill.json", provider);
    console.log(JSON.stringify({ ledger: "shared", ...shared }));
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
