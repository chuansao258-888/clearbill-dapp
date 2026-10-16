# ClearBill Deployment and Acceptance

Status: local chain deployed and exercised. Sepolia and Render remain pending. Do not reuse a local-chain address as a Sepolia deployment.

## Local chain

Follow the exact commands in the repository README. `npm run deploy:local` sends a creation transaction from a disposable unlocked Hardhat account and writes `.local/deployment.json`. The server checks chain ID, creation receipt and runtime bytecode before serving the API. Local browser tests create additional transactions and reset no chain state, so bill IDs increase across runs.

For a fresh reproducible run, stop the old chain, start a new one, deploy again and restart the server. Delete only local browser state for this site's test origin if pending records refer to the old chain; the app will not reinterpret those records as valid new-chain transactions.

## Sepolia preparation

1. Prepare dedicated MetaMask test accounts and obtain Sepolia test ETH from a legitimate faucet. Never use real ETH or a mainnet key for the coursework demonstration.
2. Build the repository with `npm ci` and `npm run build`. Record the exact commit, compiler and optimizer settings.
3. Run `npm run serve:deployer` and open `http://127.0.0.1:3001` in a desktop browser with MetaMask. This separate tool binds to loopback only and serves the exact local compilation artifact. Check that it displays Sepolia and the intended wallet, then review MetaMask's contract-creation request and gas fee. The constructor takes no arguments. No private key enters the project or server.
4. After user approval, the tool waits for the mined creation receipt, compares deployed runtime code byte-for-byte with the local build and offers a public `sepolia.json` download. A submitted hash alone is not a verified deployment. If the page loses connection after submission, check that hash before any retry.
5. Put the downloaded file at `deployment/sepolia.json`. It contains only `chainId`, `contractAddress`, `deploymentBlock` and `deploymentTransactionHash`. There is intentionally no checked-in example address. Run `npm run verify:deployment` with a Sepolia RPC URL and that manifest.
6. Test one-payment, two-installment, cancellation and full refund flows with real MetaMask, including one actual phone in the MetaMask browser. Capture genuine screenshots and receipt hashes in the evidence index.

The current repository has no verified Sepolia manifest. The Sepolia procedure is a checklist, not a completed deployment record. The test wallet and Sepolia funding are available; the wallet holder must approve the actual contract-creation transaction. A blockchain deployment cannot be undone by a code rollback.

## Render target

Create one Node web service from the repository after the Sepolia manifest is verified. Build command: `npm ci && npm run build`. Start command: `npm start`. Configure `RPC_URL` with a server-side Sepolia RPC endpoint, `CHAIN_ID=11155111`, `DEPLOYMENT_FILE=deployment/sepolia.json`, and a suitable `PORT` if the host does not supply one. Keep the complete RPC URL in Render environment settings rather than the Git repository.

The service serves the API and static mobile pages on the same origin. Check `/api/v1/health` for chain readiness, open `/api/v1/config` to confirm the intended chain and address, and repeat a real wallet transaction on the HTTPS site. A successful local run does not establish Render operation. The site remains usable only while its RPC provider can serve reads and event queries.

## Evidence and recovery

Record chain, contract, wallet type, date, screenshot, transaction hash and result for each live test in `docs/evidence/INDEX.md`. The student can cite this evidence in the separately managed report. After a server restart, confirmed bills and history must still be reconstructable from the original contract.

The contract has no pause, upgrade or administrator. Taking the website offline does not disable direct contract calls. Replacing the contract creates a separate ledger and requires an explicit migration decision; do not silently point the UI at another address.
