# ClearBill

ClearBill is a mobile-first financial DApp for settling payment requests in Ethereum Sepolia test ETH. A payee can issue a one-to-one bill or split one bill between two or three named payer wallets. Each payer approves their own fixed installment in MetaMask. The smart contract checks the sender, installment order and exact amount, records the result on-chain, and forwards each successful payment to the payee immediately.

The application is intended for small shared expenses and freelance payment requests. A bill is a public request, not proof that the payer accepted a debt or that goods or services were delivered. ClearBill uses test ETH only.

## Live application

- **Web app:** [https://clearbill-dapp.onrender.com/](https://clearbill-dapp.onrender.com/)
- **Network:** Ethereum Sepolia (chain ID `11155111`)
- **One-to-one contract:** [`0xFFe1EB9b734fC5bA97DB7C6ad51E5898D05483Aa`](https://eth-sepolia.blockscout.com/address/0xFFe1EB9b734fC5bA97DB7C6ad51E5898D05483Aa)
- **Shared-bill contract:** [`0x67c95470dd748E2Fb042f1b07df247610C6A75BC`](https://eth-sepolia.blockscout.com/address/0x67c95470dd748E2Fb042f1b07df247610C6A75BC)

The contracts have separate ledgers and bill IDs. A link under `/bills/:id` always refers to the one-to-one contract; `/shared-bills/:id` refers to the shared contract. Public deployment manifests are in [`deployment/`](deployment/).

## What ClearBill does

| Capability | One-to-one bill | Shared bill |
| --- | --- | --- |
| Payers | One specified wallet | Two or three distinct specified wallets |
| Schedule | One payment or deposit and balance | One or two fixed installments per payer |
| Creation | Payee signs once | Payee signs once |
| Payment | Payer signs each installment | Each payer signs their own installments |
| Settlement | Each payment reaches the payee immediately | Each payment reaches the payee immediately |
| Cancellation | Payee can cancel before any payment | Payee can cancel before any payment |
| Refund | Payee funds a full refund of paid principal | Payee funds one atomic refund to every payer who has paid |

Terms are immutable after creation. Due dates identify overdue installments but do not trigger automatic transfers or prevent late payment. A refund closes any unpaid remainder. Previous gas fees are not returned. Bill labels, addresses, schedules, amounts and transaction history are public on Sepolia.

### Contract interface

| Method | Purpose |
| --- | --- |
| `createBill(...)` / `createSharedBill(...)` | Validate and store fixed terms; index the bill for the payee and payer wallets. |
| `payInstallment(billId, expectedInstallment)` | Accept only the authorized payer's exact next amount, update progress and forward ETH. |
| `cancelBill(billId)` | Let the payee close a bill only while no payment has been made. |
| `refundBill(billId, expectedPaidAmount)` | Let the payee fund an exact refund of all principal received so far. |
| `getBill`, `getPaymentQuote`, `getAccountBillCount`, `getAccountBillIds`, `getBillIdByReference` | Read terms, progress and account indexes; recover a creation by its reference. |

Both contracts emit creation, payment, cancellation and refund events. Their statuses are `Open`, `PartiallyPaid`, `Paid`, `Cancelled` and `Refunded`. The shared contract tracks progress separately for each payer and emits one refund event per refunded payer. Source files are [`contracts/ClearBill.sol`](contracts/ClearBill.sol) and [`contracts/SharedBill.sol`](contracts/SharedBill.sol); matching JSON interfaces are [`abi/ClearBill.abi.json`](abi/ClearBill.abi.json) and [`abi/SharedBill.abi.json`](abi/SharedBill.abi.json). See the [one-to-one contract design](docs/SMART_CONTRACT_DESIGN.md) and [shared-bill design](docs/SHARED_BILL_DESIGN.md) for validation rules and limitations.

## Architecture

ClearBill uses Solidity 0.8.28, HTML, CSS, JavaScript, MetaMask, ethers.js and a Node.js/Express backend. Hardhat compiles and tests the contracts. Render hosts the static pages and read-only API together. No database, server wallet, scheduler or background payment service is used; the blockchain is the source of truth.

```text
Browser pages -- public reads --> Express API -- read-only RPC --> Sepolia contracts
Browser pages -- wallet request --> MetaMask -- signed transaction --> Sepolia contracts
```

MetaMask holds the user's keys and signs writes. The backend validates HTTP inputs, checks deployment receipts and runtime code, reads contract state and events, and verifies transaction receipts. It never receives a seed phrase or private key. A submitted transaction hash is shown as pending until a successful receipt and matching contract event are found. Refreshing a page reconstructs confirmed state from the chain.

The mobile pages are Overview, Bills, one-to-one creation and detail, shared creation and detail, and Activity. The Bills page switches between contract ledgers and payer/payee views. Each shared bill has its own receipt timeline. Overview totals and the account-wide Activity/CSV view currently cover one-to-one bills only; they should not be read as totals for both ledgers.

### Connect on a phone

On iPhone or Android, tap **Connect wallet** or **Open MetaMask** to open the current HTTPS page in MetaMask's browser. Tap **Connect wallet** again inside MetaMask and select the intended Sepolia account. Each installment still requires a separate approval.

The page checks the wallet's actual chain. If it differs from Sepolia, the account button becomes **Switch to Sepolia**. Approve that network change before creating or paying a bill. Payment confirmation brings the transaction status into view. A pending wallet request stays visible and does not trigger automatic resubmission.

If the browser blocks the app link, tap **Copy page link**, open MetaMask's browser and paste the address. If clipboard access is blocked, the page displays the address for manual copying. Desktop MetaMask and the MetaMask in-app browser use the injected wallet directly. App handoff depends on the browser and operating system; automatic opening in every browser is not guaranteed. The implementation follows the [official MetaMask dapp-link format](https://docs.metamask.io/metamask-connect/evm/guides/metamask-exclusive/use-deeplinks/).

The API is under `/api/v1`. It exposes health and public configuration, block snapshots, bill and account lists, bill history, and verified transaction status. Shared-bill routes use `/shared-bills`, `/accounts/:address/shared-bills` and `/shared-transactions`. There are no payment or signing POST endpoints. See the [API design](docs/API_DESIGN.md) for schemas, pagination and errors.

## Run locally

Node.js 24 and npm 11 were used for the recorded checks. Install dependencies and compile both contracts:

```powershell
npm ci
npm run build
Copy-Item .env.example .env
```

Start a disposable Hardhat chain in one terminal:

```powershell
npm run chain
```

In another terminal, deploy both contracts and start the web server:

```powershell
npm run deploy:local
npm start
```

Open [http://127.0.0.1:3000/](http://127.0.0.1:3000/). The default `.env.example` selects the local chain (`31337`) and both manifests written under ignored `.local/`. For a manual wallet test, add a MetaMask network with RPC `http://127.0.0.1:8545`, chain ID `31337` and currency `ETH`, then use only disposable local-chain accounts. Restarting Hardhat clears its ledger; deploy again before restarting the server. Never use the printed Hardhat keys with real assets.

For Sepolia, set `RPC_URL` to a Sepolia RPC endpoint, `CHAIN_ID=11155111` and `DEPLOYMENT_FILE=deployment/sepolia.json`. The server selects `deployment/shared-sepolia.json` by default on Sepolia; `SHARED_DEPLOYMENT_FILE` can override it. Do not place RPC credentials, wallet keys or seed phrases in Git. The backend checks the chain ID, creation receipts and exact deployed runtime bytecode before it starts. The [deployment guide](docs/DEPLOYMENT.md) records the live deployments and hosting configuration.

## Test and inspect

```powershell
npm test
npm run verify:deployment
```

`npm test` runs contract, API and frontend checks. The latest runs passed 19 contract tests, 9 API tests and 9 frontend tests, including mobile handoff and wallet errors. The API suite also checks process liveness, unavailable deployment receipts and genuine manifest mismatches. With the local chain, both deployments and server running, install Playwright's Chromium once and run the mobile-width browser suite:

```powershell
npx playwright install chromium
npm run test:browser
```

The latest full browser run passed 20 tests: 9 local bill-flow checks, 6 mobile-wallet checks and 5 network/pending-request checks. The bill-flow wallet is simulated; it does not prove real MetaMask compatibility. The [evidence index](docs/evidence/INDEX.md) distinguishes local screenshots, Sepolia transactions and hosted read-only screenshots. It also links the public deployment and payment receipts.

Six additional browser checks passed for the mobile handoff controls, copy fallback and injected-wallet connection. These use Chromium with iPhone/Android user agents and mock API responses; they do not verify an installed phone app or every browser engine. Run them independently without a local blockchain using `npx playwright test wallet-mobile.spec.js`.

The five checks in `wallet-network.spec.js` cover network switching, creation preflight, visible payment errors and unresolved wallet requests. A payment request is never automatically resent. The backend also avoids reusing an older cached block immediately after confirmation.

Seven checks in `wallet-connect.spec.js` cover the first connection header, delayed or stale account/network reads, account changes, disconnect and rejection. The header uses the approved account immediately and ignores older responses. The latest focused run passed all 18 wallet browser checks and 9 frontend checks using controlled providers, without sending transactions.

Both contracts have verified Sepolia deployment receipts and matching runtime code. A real one-to-one bill was created and paid through the local web interface with Chrome MetaMask. A two-payer shared bill was created and paid in four installments on Sepolia using authorized test wallets through a CLI script. The hosted shared-bill API and read-only mobile page were checked against that chain state. Shared-bill signing through real MetaMask and use inside a phone wallet have not been verified.

## Security and limits

- Contract authorization depends on the sending wallet address. Connecting a wallet does not verify a person's identity or establish a legal debt.
- The contracts check exact wei amounts, installment order and bill status. State changes precede external transfers, and write methods use a reentrancy guard. This project has not received an independent security audit.
- Successful payments are forwarded immediately; the contracts do not hold a reserve for refunds. The payee must supply the entire paid principal plus gas to refund a bill. A recipient that rejects ETH can cause a payment or atomic refund to revert.
- On-chain labels and wallet addresses are public. Use neutral labels and test accounts; do not enter personal or confidential invoice details.
- The site depends on its configured RPC provider for reads. A recent confirmation can still be affected by a chain reorganization, and a contract deployment cannot be undone by changing the website.

Further details are in the [architecture](docs/ARCHITECTURE.md), [security design](docs/SECURITY.md), [data design](docs/DATA_DESIGN.md) and [test plan](docs/TEST_PLAN.md).

Render uses `/healthz` to check that the HTTP process responds. `/api/v1/health` separately checks blockchain readiness and returns an error when deployment verification fails. An HTTP liveness response does not prove that chain operations are available. The [deployment guide](docs/DEPLOYMENT.md) records the RPC recovery and remaining public-provider limits.

## Repository and submission

```text
abi/          Generated JSON interfaces for the two business contracts
contracts/    Solidity business contracts and test receivers
deployment/   Public Sepolia deployment manifests
public/       Mobile HTML, CSS and JavaScript pages
server/       Express API, chain reads and receipt verification
scripts/      Build, local deployment and deployment checks
tests/        Contract, API, frontend and browser checks
docs/         Design notes and selected evidence screenshots
```

This repository includes the source, ABIs, public deployment information, README and selected screenshots. The required 5-8 page PDF report is written and submitted separately; it is intentionally excluded from Git. A database is not needed for this implementation, and no video recording is required.
