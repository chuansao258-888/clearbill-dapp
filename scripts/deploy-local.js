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
  const shared = await ethers.deployContract("SharedBill");
  await shared.waitForDeployment();
  const sharedTx = shared.deploymentTransaction();
  const sharedReceipt = await sharedTx.wait();
  const sharedManifest = {
    chainId: Number(network.chainId), contractAddress: await shared.getAddress(),
    deploymentBlock: sharedReceipt.blockNumber, deploymentTransactionHash: sharedTx.hash
  };
  fs.writeFileSync(path.join(__dirname, "../.local/shared-deployment.json"), JSON.stringify(sharedManifest, null, 2));
  console.log(`Deployed ${manifest.contractAddress} on chain ${manifest.chainId}`);
  console.log(`Deployed shared bills ${sharedManifest.contractAddress} on chain ${sharedManifest.chainId}`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });
