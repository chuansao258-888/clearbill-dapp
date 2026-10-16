const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("hardhat");

/** Deploys a disposable ClearBill instance to the local Hardhat network. */
async function main() {
  const contract = await ethers.deployContract("ClearBill");
  await contract.waitForDeployment();
  const tx = contract.deploymentTransaction();
  const receipt = await tx.wait();
  const network = await ethers.provider.getNetwork();
  const manifest = {
    chainId: Number(network.chainId),
    contractAddress: await contract.getAddress(),
    deploymentBlock: receipt.blockNumber,
    deploymentTransactionHash: tx.hash
  };
  const target = path.join(__dirname, "../.local/deployment.json");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(manifest, null, 2));
  console.log(`Deployed ${manifest.contractAddress} on chain ${manifest.chainId}`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
