# ClearBill

ClearBill is a mobile web DApp for freelancers to issue a one-payment or deposit-and-balance bill. The specified client pays in Sepolia test ETH. The contract records each payment, permits cancellation before any payment and permits a voluntary full refund funded by the freelancer. A public history links those actions to the bill.

## Current status

The Solidity contract, Express read API and five mobile pages run locally. Automated checks cover the core create, pay, cancel and refund rules on Hardhat. The contract is deployed and bytecode-verified on Sepolia. A Chrome MetaMask test created and paid a bill through the web interface. Phone-wallet testing and public hosting remain open.

## Requirements

- Node.js 24 and npm 11 were used for the current local checks.
- A browser with MetaMask is required for manual transactions. MetaMask's in-app browser is the planned phone environment; ordinary phone browsers without an injected wallet can read public pages.
- Test ETH only. Hardhat's printed local development keys are public and must never hold real assets.

## Local setup

```powershell
npm ci
npm run build
Copy-Item .env.example .env
npm run chain
```

Leave the chain terminal running. In a second terminal:

```powershell
npm run deploy:local
npm start
```

Open `http://127.0.0.1:3000`. For MetaMask manual testing, add a local network with RPC `http://127.0.0.1:8545`, chain ID `31337` and currency `ETH`. Use only disposable local-chain accounts. The local manifest is written to ignored `.local/deployment.json` and is invalid after the chain resets. Restarting the chain requires a new deployment and a fresh browser context.

The server needs only a read-only RPC URL and public deployment metadata. It must never receive wallet private keys or seed phrases. Copy `.env.example` as a local file and supply real values only there or in hosting environment settings.

## Verification

```powershell
npm test
npm run test:browser
```

`npm test` runs isolated contract, API and amount tests. The browser suite requires the local chain, deployed contract and server from the setup above. It creates its own local bills, and its injected wallet is a simulation; its success does not establish real MetaMask compatibility. The selected screenshots in `docs/evidence/` are labelled accordingly.

`npm run verify:deployment` checks a manifest against its chain receipt and code. It requires `RPC_URL` and `DEPLOYMENT_FILE`. The verified Sepolia manifest is in `deployment/sepolia.json`; set `CHAIN_ID=11155111` and a Sepolia `RPC_URL` for the server. Actual deployment and remaining acceptance steps are in [Deployment](docs/DEPLOYMENT.md).

The optional `npm run serve:deployer` tool can deploy a future instance using MetaMask without exposing a key to the server. A second deployment would create a separate ledger and must not silently replace the verified manifest.

## Product behavior

- The bill creator is the payee. The payer, amounts, public label and deadlines are immutable.
- One or two exact installments are supported. The payer may pay late; the next unpaid due date drives the overdue badge.
- A bill with no payments can be cancelled by its creator. A partially or fully paid bill can be refunded in full by the creator, using new ETH from that wallet. Refund closes any remaining installment.
- Blockchain receipts, contract state and events are authoritative. A submitted hash alone is not shown as a successful payment.
- Bill labels, addresses and amounts are public. A payment request does not prove a legal debt or completed work.

## Documentation and submission

Start with [Product requirements](docs/PRD.md), [Smart contract design](docs/SMART_CONTRACT_DESIGN.md), [API design](docs/API_DESIGN.md), [Data design](docs/DATA_DESIGN.md), [Mobile interface design](docs/MOBILE_UI_DESIGN.md) and [Implementation plan](docs/IMPLEMENTATION_PLAN.md). [Progress](docs/PROGRESS.md) records actual verification. The course brief is local and excluded from Git.

This repository contains the source, contract, backend, mobile pages, setup instructions and selected test screenshots. The required 5–8 page PDF report is managed separately and excluded from Git. The application does not use a database, and the assignment does not require a video.
