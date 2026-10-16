# ClearBill Progress Record

Status at 16 October 2026 (Asia/Singapore). Branch: `feat/clearbill`.

## Implemented and checked locally

| Area | Actual status and evidence |
| --- | --- |
| Design | English PRD, contract design, architecture, API, data, mobile UI, security, test and delivery documents exist |
| Contract | `ClearBill.sol` compiles with Solidity 0.8.28; 11 local contract tests pass |
| Backend | Express reads a verified local deployment; 3 API tests pass; direct local create/pay receipt and event reads succeeded |
| Mobile web | Five pages render; 3 precision/label tests and 7 browser tests pass at phone widths |
| Core transactions | Local browser simulation executed one-payment create/pay and two-installment deposit/full refund on the Hardhat chain |
| History and dashboard | Browser tests loaded confirmed event history and complete chain-derived overview figures on the local chain |
| Screenshots | Two actual local browser screenshots are indexed in `docs/evidence/INDEX.md`; the wallet is simulated |

`npm test` produced 11 contract, 3 API and 3 frontend passing cases. `npm run test:browser` produced 7 passing cases while the local chain, deployment and server were running. A sampled local one-payment creation used 284,086 gas, its payment 71,756 gas and a local full refund 70,388 gas; receipt hashes are recorded in the evidence index. `npm audit --omit=dev` reported zero production dependency advisories at this checkpoint. These figures are local and time-specific.

## Not yet verified

| Area | Required next evidence |
| --- | --- |
| Real MetaMask | Desktop connection, rejection, account switching and signed transaction screenshots |
| Mobile MetaMask | Actual phone in MetaMask's browser, transaction approval and usable layout |
| Sepolia | Funded test account, verified deployment receipt/code, successful payment/refund hashes and screenshots |
| Render | HTTPS service health, public configuration and post-restart history reads |

No Sepolia address, live transaction, hosting URL or real-wallet result is claimed. The student is preparing the assignment report separately outside Git.

## Implementation adjustments

Hardhat's default test path yielded zero discovered tests; `hardhat.config.js` now points to `tests/contracts/`. Hostile receiver contracts compile under `contracts/test/` because Hardhat compiles contracts from its source tree. Browser assertions check the bill's status field directly after an earlier assertion could match a similarly named amount row. The matching Playwright Chromium build was installed before UI verification.

The mobile-first requirement supersedes an earlier desktop-priority suggestion. Late payment remains allowed. The initial release has one business contract, no database and no custodial escrow.

## Remaining operational prerequisites

The submission deadline, a funded Sepolia test wallet, access to an actual phone with MetaMask and a Render account have not been confirmed. These affect live verification and publication, not the completed local implementation. Never request or place a private key in the repository or backend.
