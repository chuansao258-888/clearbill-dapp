# ClearBill

ClearBill is a mobile web DApp for issuing one-to-one or shared bills in Sepolia test ETH. A one-to-one bill has one payer and one or two installments. A shared bill assigns fixed one- or two-installment shares to two or three payers. Each payer approves their own payment; the contract records and immediately forwards it to the payee. Unpaid bills can be cancelled, and the payee can fund a full refund of payments already received.

## Current status

The one-to-one and shared Solidity contracts are deployed and independently bytecode-verified on Sepolia. The Express API and mobile web pages are live at [clearbill-dapp.onrender.com](https://clearbill-dapp.onrender.com/) on a free Render web service. Hosted shared-bill API and read-only mobile pages have been checked against real Sepolia state. A real Sepolia shared bill reached Paid after four CLI-signed installment transactions from two authorized test wallets. Automated checks cover contract, API and simulated-wallet browser flows. Earlier Chrome MetaMask tests created and paid a one-to-one bill through the local web interface; shared-bill use through real MetaMask and phone-wallet use remain unverified.

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

Open `http://127.0.0.1:3000`. For MetaMask manual testing, add a local network with RPC `http://127.0.0.1:8545`, chain ID `31337` and currency `ETH`. Use only disposable local-chain accounts. The local manifests are written to ignored `.local/deployment.json` and `.local/shared-deployment.json` and are invalid after the chain resets. Set `SHARED_DEPLOYMENT_FILE=.local/shared-deployment.json` in `.env` to enable the local shared ledger. Restarting the chain requires new deployments and a fresh browser context.

The server needs only a read-only RPC URL and public deployment metadata. It must never receive wallet private keys or seed phrases. Copy `.env.example` as a local file and supply real values only there or in hosting environment settings.

## Verification

```powershell
npm test
npm run test:browser
```

`npm test` runs isolated contract, API and amount tests. The browser suite requires the local chain, deployed contract and server from the setup above. It creates its own local bills, and its injected wallet is a simulation; its success does not establish real MetaMask compatibility. The selected screenshots in `docs/evidence/` are labelled accordingly.

`npm run verify:deployment` checks configured manifests against their chain receipts and code. It requires `RPC_URL` and `DEPLOYMENT_FILE`; `SHARED_DEPLOYMENT_FILE` is optional for local networks. The verified Sepolia manifests are in `deployment/sepolia.json` and `deployment/shared-sepolia.json`. Set `CHAIN_ID=11155111` and a Sepolia `RPC_URL` for the server. The shared manifest is selected by default on Sepolia. Actual deployment and remaining acceptance steps are in [Deployment](docs/DEPLOYMENT.md).

The optional `npm run serve:deployer` tool can deploy a future instance using MetaMask without exposing a key to the server. A second deployment would create a separate ledger and must not silently replace the verified manifest.

## Product behavior

- The bill creator is the payee. Payer addresses, amounts, public label and deadlines are immutable.
- One-to-one bills have one payer; shared bills have two or three distinct payers. Each payer has one or two exact installments. A payer may pay late; the next unpaid due date drives the overdue badge. Deadlines never cause automatic wallet payments.
- A bill with no payments can be cancelled by its creator. A partially or fully paid bill can be refunded in full by the creator, using new ETH from that wallet. Refund closes any remaining installment.
- Blockchain receipts, contract state and events are authoritative. A submitted hash alone is not shown as a successful payment. Shared-bill history appears on each shared detail page; the account Activity page currently covers the original one-to-one ledger.
- Bill labels, addresses and amounts are public. A payment request does not prove a legal debt or completed work.

## Documentation and submission

Start with [Product requirements](docs/PRD.md), [Smart contract design](docs/SMART_CONTRACT_DESIGN.md), [Shared-bill design](docs/SHARED_BILL_DESIGN.md), [API design](docs/API_DESIGN.md), [Data design](docs/DATA_DESIGN.md), [Mobile interface design](docs/MOBILE_UI_DESIGN.md) and [Implementation plan](docs/IMPLEMENTATION_PLAN.md). [Progress](docs/PROGRESS.md) records actual verification. The course brief is local and excluded from Git.

This repository contains the source, both `.sol` contracts, their generated JSON ABIs in `abi/`, the Node.js backend, mobile pages, setup instructions and selected test screenshots. The deployed Render link is above. The required 5–8 page PDF report is managed separately and excluded from Git. The application does not use a database, and the assignment does not require a video.
