# ClearBill Progress Record

Status at 17 October 2026 (Asia/Singapore). Shared-bill work was fast-forwarded into `main` and pushed. The hosted service now serves the shared-bill API and mobile pages.

## Implemented and checked locally

| Area | Actual status and evidence |
| --- | --- |
| Design | English PRD, contract design, architecture, API, data, mobile UI, security, test and delivery documents exist |
| Contract | `ClearBill.sol` and `SharedBill.sol` compile with Solidity 0.8.28; 19 local contract tests pass |
| Backend | Express reads verified original and shared deployments; 6 API tests pass; shared Sepolia bill, history and payment receipt reads succeeded through a locally run server |
| Mobile web | Shared creation and detail pages supplement the original pages; 3 precision/label tests and 9 browser tests pass at phone widths |
| Core transactions | Local browser simulation executed one-payment create/pay and two-installment deposit/full refund on the Hardhat chain |
| History and dashboard | Browser tests loaded confirmed event history and complete chain-derived overview figures on the local chain |
| Screenshots | Original and shared local-chain screenshots plus genuine Sepolia-backed mobile-width page screenshots are indexed in `docs/evidence/INDEX.md`; the Chrome wallet prompts were observed but not retained as image files |
| Shared Sepolia flow | Contract receipt and runtime code verified at `0x67c95470dd748E2Fb042f1b07df247610C6A75BC`; two payers completed two installments each on bill 1; contract and local API returned Paid and five events |
| Shared Render hosting | Public `/health` returned ready; `/config` returned the shared address; shared bill 1 returned Paid, five complete events and a confirmed final payment receipt; the 390 CSS px page rendered without a wallet |
| Sepolia deployment | Real creation receipt and exact runtime bytecode verified at `0xFFe1EB9b734fC5bA97DB7C6ad51E5898D05483Aa`; public manifest added |
| Sepolia business flow | Three real bills and eight business transactions confirmed: single payment and refund, two installments, unpaid cancellation; hashes indexed in `docs/evidence/INDEX.md` |
| Sepolia backend | Separate local server passed `/health` and `/config`; 11 live API assertions checked three final bill states, their histories and all eight confirmed transaction records |
| Chrome MetaMask | Real extension connected as payee, switched to payer, signed bill 4 creation and 0.0001 ETH payment; both confirmed on Sepolia and appeared in the page timeline |
| Render hosting | Free web service became Live at `https://clearbill-dapp.onrender.com/`; public health, config, bill 4 and complete two-event history returned HTTP 200; Chrome displayed the hosted bill timeline without a connected wallet; the build pruned development packages before runtime and reported zero remaining dependency advisories |

`npm test` produced 19 contract, 6 API and 3 frontend passing cases. The local Playwright run produced 9 passing cases while the local chain, both deployments and server were running. A sampled original local one-payment creation used 284,086 gas, its payment 71,756 gas and a local full refund 70,388 gas; receipt hashes are recorded in the evidence index. `npm audit --omit=dev` reported zero production dependency advisories at the earlier checkpoint. These figures are local and time-specific.

## Not yet verified

| Area | Required next evidence |
| --- | --- |
| Real MetaMask | Rejection handling and retained extension approval screenshots |
| Mobile MetaMask | Actual phone in MetaMask's browser, transaction approval and usable layout |
| Sepolia UI evidence | Retained Chrome MetaMask popup screenshots; bill 4 page screenshot is a separate read-only mobile-width browser capture |
| Hosted wallet | MetaMask connection and transaction from the Render HTTPS origin |
| Render restart | History reads after an idle spin-down or service restart |
| Shared real wallet | Create or pay a small shared bill through the Chrome MetaMask extension and retain the result |

Both Sepolia deployments, CLI-signed paths, the original local-site Chrome MetaMask create/pay flow and the updated Render read-only checks are verified. No shared MetaMask transaction or phone-wallet result is claimed. The student is preparing the assignment report separately outside Git.

## Implementation adjustments

Hardhat's default test path yielded zero discovered tests; `hardhat.config.js` now points to `tests/contracts/`. Hostile receiver contracts compile under `contracts/test/` because Hardhat compiles contracts from its source tree. Browser assertions check the bill's status field directly after an earlier assertion could match a similarly named amount row. The matching Playwright Chromium build was installed before UI verification.

The mobile-first requirement supersedes an earlier desktop-priority suggestion. Late payment remains allowed. The initial release has one business contract, no database and no custodial escrow.

## Remaining operational prerequisites

Authorized funded Sepolia test accounts and a phone with MetaMask are available. Actual phone browser verification remains outstanding. The Render service uses a public credential-free RPC endpoint; availability and historical log-query limits depend on that provider. Never place a private key in the repository or backend.
