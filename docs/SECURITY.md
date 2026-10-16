# ClearBill Security and Privacy Design

Status: planned controls. No audit or penetration test has been performed.

## Assets and assumptions

Protect the integrity of bill terms, payment amounts, refund amounts, role checks and displayed settlement evidence. Wallet keys remain in MetaMask. The contract executes publicly, and all labels, addresses, schedules and values are observable.

The frontend and RPC provider are trusted to present accurate information but cannot grant contract permissions. Users must check the wallet's transaction details. TLS and safe rendering reduce website risks; neither proves a business counterparty's identity.

## Threat and control matrix

| Threat | Planned control | Verification | Residual limit |
| --- | --- | --- | --- |
| Unauthorized payment, cancel or refund | Per-bill `msg.sender` checks | Third-party caller tests | Wallet compromise remains outside application control |
| Repeated deposit interpreted as balance | Explicit expected installment index | Equal-value duplicate calls | A user may intentionally approve a different next installment |
| Stale refund after balance payment | Expected paid amount and exact `msg.value` | Both transaction orderings | User must approve a new refund if total changes |
| Recipient reentrancy | Checks-effects-interactions and shared guard on all mutators | Malicious payer/payee contracts | Not a substitute for review |
| Recipient refuses ETH | Revert whole operation | Rejecting receiver tests | The application cannot force receipt or change immutable parties |
| Duplicate creation after lost receipt | Creator-scoped submission reference | Retry and recovery tests | Different references can still create similar bills |
| Misleading payment success | Receipt status, destination, selector and event checks | Unrelated and reverted transactions | RPC read integrity remains a dependency |
| Injection through public label | Text rendering, length limits, no HTML insertion | HTML/script-like label tests | Public text can still be misleading |
| Spreadsheet formula injection | CSV quoting and formula neutralization for text | Formula-prefix export tests | Exported blockchain data remains public |
| Secret leakage | Server environment for RPC; no signing key configuration | Repository/output/log inspection | Operator must protect local environment |
| Inaccurate amounts | Integer wei/BigInt and decimal JSON strings | Precision and max-range tests | ETH market value is not stable |
| Reorganization or partial queries | Snapshot hashes, bounded scans, explicit completeness | Reorg and empty-window tests | Recent confirmation is not finality |
| API resource exhaustion | Bounded limits, block windows, RPC timeout, small cursor limit | Oversized input and slow provider tests | No enterprise denial-of-service guarantee |

## Authentication and authorization

Connecting a wallet exposes an account with the user's permission; it does not authenticate a real-world person or establish a web login session. A signed blockchain transaction demonstrates control of the sending account for that transaction. The contract enforces permissions independently of UI buttons and HTTP query parameters.

Public read endpoints are intentionally unauthenticated. There are no protected off-chain writes, so a nonce/signature login system adds no required capability. If future releases add private documents or mutable profiles, that decision must be revisited.

## Financial safety

The contract does not retain a refund reserve. A payee must have enough ETH for the refund principal and gas. Refunds do not refund prior gas. Payments go directly to the creator and cannot be reversed by an administrator. No service delivery, debtor consent, KYC, tax compliance or dispute protection is guaranteed.

Reject ordinary direct ETH deposits to the contract, but account for forced ETH without using it as a bill balance. No emergency sweep or privileged withdrawal is included. State the resulting trapped-funds limitation in the report.

## Website and operational controls

Serve over HTTPS on Render. Keep scripts local where practical and define a content security policy compatible with the tested wallet integration. Avoid dynamic script evaluation and unsafe HTML. Validate all path/query values before RPC calls. Do not accept arbitrary RPC URLs, contract addresses or transaction destinations from HTTP requests.

Use one configured network and deployment. Lock dependencies and record compiler settings. Deploy through a user-controlled MetaMask/Remix workflow; do not ask users to paste keys into a web form or store a deployment key on Render. Local automated tests use disposable accounts only.

## Privacy and ethics

The interface explains public storage before bill creation. Use fictional labels and dedicated test accounts in demonstrations. Do not upload client names, contact information, confidential agreements or wallet seed phrases. Screenshots must exclude wallet recovery screens and provider secrets.

Unsolicited bills are possible because any wallet can create a payment request. Use neutral labels such as “To pay” and “Unpaid requests”; never state that creation proves an accepted debt. A payer can ignore a request. Blocking/reporting and legal verification are outside this release.

All report security statements must distinguish implemented controls, tested behavior and unresolved limitations. A test suite is not a professional security audit.
