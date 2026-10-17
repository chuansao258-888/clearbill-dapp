# ClearBill Deployment and Acceptance

Status: local chain exercised; Sepolia contract, CLI-signed business transactions and a local-site Chrome MetaMask create/pay flow confirmed on 16 October 2026. The Render web service became live on 17 October 2026. Wallet transactions from the hosted origin and mobile MetaMask remain pending.

## Local chain

Follow the exact commands in the repository README. `npm run deploy:local` sends a creation transaction from a disposable unlocked Hardhat account and writes `.local/deployment.json`. The server checks chain ID, creation receipt and runtime bytecode before serving the API. Local browser tests create additional transactions and reset no chain state, so bill IDs increase across runs.

For a fresh reproducible run, stop the old chain, start a new one, deploy again and restart the server. Delete only local browser state for this site's test origin if pending records refer to the old chain; the app will not reinterpret those records as valid new-chain transactions.

## Sepolia preparation

1. Prepare dedicated MetaMask test accounts and obtain Sepolia test ETH from a legitimate faucet. Never use real ETH or a mainnet key for the coursework demonstration.
2. Build the repository with `npm ci` and `npm run build`. Record the exact commit, compiler and optimizer settings.
3. Run `npm run serve:deployer` and open `http://127.0.0.1:3001` in a desktop browser with MetaMask. This separate tool binds to loopback only and serves the exact local compilation artifact. Check that it displays Sepolia and the intended wallet, then review MetaMask's contract-creation request and gas fee. The constructor takes no arguments. No private key enters the project or server.
4. After user approval, the tool waits for the mined creation receipt, compares deployed runtime code byte-for-byte with the local build and offers a public `sepolia.json` download. A submitted hash alone is not a verified deployment. If the page loses connection after submission, check that hash before any retry.
5. Put the downloaded file at `deployment/sepolia.json`. It contains only `chainId`, `contractAddress`, `deploymentBlock` and `deploymentTransactionHash`. There is intentionally no checked-in example address. Run `npm run verify:deployment` with a Sepolia RPC URL and that manifest.
6. Test the wallet connection and signing flow with real MetaMask, including one actual phone in the MetaMask browser. Capture genuine screenshots and receipt hashes in the evidence index. The same business methods have already been exercised on Sepolia using authorized test keys through a one-time CLI script; this does not establish MetaMask compatibility.

The actual Sepolia creation transaction is `0x1642635ab30c2509edd6a04666069572f2468f22647156a5d0442e67a69ba91a`, mined in block `11925719` at `0xFFe1EB9b734fC5bA97DB7C6ad51E5898D05483Aa`. An independent `npm run verify:deployment` call confirmed the receipt, chain ID and exact deployed runtime bytecode. The deployment was sent from a test key stored outside this repository; neither the key nor its RPC credentials are in this project. The one-time signing script remains ignored under `.local/`. Actual gas used was `10,778,764`; receipt gas price was `18` wei, giving a testnet fee of `0.000000000194017752` ETH. This is not a prediction of future fees. A blockchain deployment cannot be undone by a code rollback.

Three bills were then exercised with authorized test accounts. Bill 1 was created, paid with 0.0001 test ETH and fully refunded; bill 2 received two payments of 0.00005 test ETH; bill 3 was cancelled before payment. All eight business receipts succeeded. The local backend configured for Sepolia independently returned the expected Refunded, Paid and Cancelled states, full event histories and confirmed transaction records. Public hashes are in [the evidence index](evidence/INDEX.md). These actions were signed by the CLI test script, not MetaMask.

A separate Chrome MetaMask test connected first as the payee and then switched to the payer. The payee created bill 4 from the mobile web interface for 0.0001 test ETH, and the payer paid it through the same interface. Both wallet prompts were reviewed and approved by the student. The page showed a pending state after submission and then a mined confirmation; the backend independently verified matching creation and payment events. Bill 4 is Paid and its public hashes are in the evidence index. This was a desktop Chrome extension test, not an actual phone test.

## Render web service

The public service is [clearbill-dapp.onrender.com](https://clearbill-dapp.onrender.com/). Render builds `main` with `npm ci --include=dev && npm run build && npm prune --omit=dev` and starts it with `npm run start`. Build-only tools are removed before runtime. The service uses the Free instance in Ohio and checks `/api/v1/health`. Its environment sets `RPC_URL=https://ethereum-sepolia-rpc.publicnode.com`, `CHAIN_ID=11155111`, `DEPLOYMENT_FILE=deployment/sepolia.json` and `HISTORY_BLOCK_SPAN=10000`. The endpoint contains no private credential. Render supplies `PORT`; the service listens on that port.

The initial deployment built commit `e8f5692` and reached Render's Live state. The public `/api/v1/health` returned HTTP 200 and `ready`; `/api/v1/config` returned Sepolia and the verified contract address; bill 4 returned Paid; its history returned the creation and payment events in one complete page. Chrome displayed the hosted bill page and its timeline without a connected wallet. A wallet transaction from this HTTPS origin has not yet been tested. The free service can spin down when idle, and the site depends on the public RPC provider for chain reads.

## Evidence and recovery

Record chain, contract, wallet type, date, screenshot, transaction hash and result for each live test in `docs/evidence/INDEX.md`. The student can cite this evidence in the separately managed report. After a server restart, confirmed bills and history must still be reconstructable from the original contract.

The contract has no pause, upgrade or administrator. Taking the website offline does not disable direct contract calls. Replacing the contract creates a separate ledger and requires an explicit migration decision; do not silently point the UI at another address.
