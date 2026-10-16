# ClearBill Test and Evidence Plan

Status: local contract, API, amount and browser checks run; live Sepolia and real MetaMask cases remain pending. Actual local results are in `PROGRESS.md` and `evidence/INDEX.md`.

## Test levels

Contract tests run on an isolated local chain. Backend tests cover the real contract integration and controlled RPC failures. Browser tests cover page behavior with a clearly identified simulated wallet where automation requires it. Manual acceptance uses actual MetaMask on desktop and in the mobile app browser, with Sepolia transactions.

Mocked or local-chain checks must never be labelled as successful Sepolia or real-wallet tests. Record tool versions, network, commit, date and actual outcome for each evidence set.

## Contract cases

| Test ID | Scenario and expected result | Acceptance |
| --- | --- | --- |
| CT-01 | Deploy with no arguments; no deployer permissions; first ID is 1 | AC-15 |
| CT-02 | Create single bill; stored terms, indexes and event match | AC-02 |
| CT-03 | Create two installments; correct sum and schedule | AC-02 |
| CT-04 | Reject zero/self/contract payer, invalid count, empty/oversized label, zero amount, bad unused terms, overflow | AC-02 |
| CT-05 | Reject past/equal first due timestamp and non-increasing second deadline | AC-02 |
| CT-06 | Duplicate creator/reference rejected; different creators may use same reference | AC-02, AC-10 |
| CT-07 | Single payment transfers exact principal and marks Paid | AC-03 |
| CT-08 | Deposit then balance updates counters and sends each amount once | AC-03 |
| CT-09 | Reject wrong caller, skipped index, old index, overpayment and underpayment | AC-04 |
| CT-10 | Equal installment values do not let repeated index 0 pay index 1 | AC-04 |
| CT-11 | Early/late payments accepted; overdue at due−1/due/due+1 and next-deadline transition correct | AC-05 |
| CT-12 | Only creator cancels unpaid bill; paid or closed bills cannot cancel | AC-06 |
| CT-13 | Refund deposit only; payer receives gross paid; unpaid balance closes | AC-07 |
| CT-14 | Refund fully paid bill; historical paid amount preserved | AC-07 |
| CT-15 | Reject wrong refunder, stale total, wrong value, zero-received and repeated refund | AC-07 |
| CT-16 | Rejecting payee/payer causes full rollback of counters, status, logs and value | AC-08 |
| CT-17 | Reentrant recipient cannot enter pay/refund/create/cancel recursively | AC-08 |
| CT-18 | Both pay/cancel orders and both balance/refund orders satisfy defined outcome | AC-08 |
| CT-19 | Unknown ID errors; terminal quotes inactive; pagination boundaries and account isolation | AC-10 |
| CT-20 | Plain ETH and unknown selector rejected; forced ETH cannot affect bill accounting | AC-08 |

For balance assertions, account for gas when the inspected account is the transaction sender. Check complete bill state before and after reverts, not just the presence of an exception. Validate all INV-01 through INV-10 properties from the contract design across relevant cases.

## Backend and data cases

| Test ID | Scenario and expected result | Acceptance |
| --- | --- | --- |
| API-01 | Valid config/readiness; missing manifest, wrong chain and wrong code fail explicitly | AC-14 |
| API-02 | Invalid IDs, addresses, hashes, limits, cursor payloads and time ranges rejected before RPC | AC-14 |
| API-03 | Bill projections preserve wei precision and match contract data at snapshot | AC-10 |
| API-04 | Descending account pagination has no skipped or repeated IDs; end-of-list differs from provider failure | AC-11 |
| API-05 | History crosses empty block windows, merges party filters and deduplicates events | AC-11 |
| API-06 | Type/bill/time filters and inclusive date boundaries match expected events | AC-11 |
| API-07 | Receipt success requires matching destination, operation and event; unrelated tx rejected | AC-09 |
| API-08 | Pending, reverted, unknown, RPC timeout and rate/result limits stay distinct | AC-09, AC-14 |
| API-09 | Changed snapshot hash invalidates pagination; browser starts fresh aggregation | AC-12 |
| API-10 | Restart backend; bills and history remain reconstructable with no local database | AC-10 |
| API-11 | Multi-page totals match all payee/payer records; refund closes remaining request | AC-12 |

## Browser cases

| Test ID | Scenario and expected result | Acceptance |
| --- | --- | --- |
| UI-01 | Missing wallet, denied connection, wrong chain, disconnect and account switch | AC-01 |
| UI-02 | Create one/two-payment bill with field errors and review screen | AC-02 |
| UI-03 | ETH precision, UTF-8 byte limit, timezone conversion and whitespace labels | AC-02 |
| UI-04 | Correct actions for payer/payee/other account across all lifecycle states | AC-03, AC-06, AC-07 |
| UI-05 | Wallet rejection preserves form; pending and unknown states preserve hash; no auto-resend | AC-09 |
| UI-06 | Replacement/cancellation known to wallet handled; inconclusive recovery remains unknown | AC-09 |
| UI-07 | Refresh during creation uses reference; storage failure and corrupt entries recover safely | AC-10 |
| UI-08 | Partial scans labelled; filters and export never imply complete history prematurely | AC-11, AC-12 |
| UI-09 | CSV exact values, escaping, timestamps and formula-like labels | AC-11 |
| UI-10 | 360/390 px, 320 px overflow check, 768/1024 px, long labels/addresses and keyboard | AC-13 |
| UI-11 | Focus, touch targets, 200% zoom, error announcements and mobile keyboard visibility | AC-13 |
| UI-12 | Public-label, unsigned-debt and voluntary-refund wording shown at relevant steps | AC-17 |

## Manual Sepolia acceptance

Use dedicated test wallets A (creator), B (payer) and C (unauthorized caller), each with test ETH as needed. Record actual public addresses in evidence only after the run. Do not publish secrets. Prepare separate bills so single payment, unpaid cancellation, deposit refund and full refund can each be demonstrated without resetting history.

1. Deploy the exact compiled contract through MetaMask/Remix. Save successful creation receipt, code verification, network and public manifest.
2. Connect wallet A on desktop; create a one-payment bill for B; B pays and both views show the confirmed receipt after refresh.
3. On an actual phone in MetaMask's browser, create or open a two-installment bill, pay deposit then balance, and capture the usable mobile layout and confirmation.
4. Cancel another unpaid bill; demonstrate that payment is unavailable and a direct invalid call is rejected in controlled testing.
5. Refund a deposit-only bill and a fully paid bill; verify recipient and amount, closure and history.
6. Demonstrate an invalid input, wallet rejection and wrong-network state without fabricating a blockchain failure.
7. Refresh, switch accounts and restart the backend; verify correct scoped records and complete dashboard totals.

If a real phone or Sepolia access is unavailable, mark the corresponding case Blocked, explain the condition and retain it as required acceptance work. Responsive browser emulation alone does not prove MetaMask mobile integration.

## Evidence records

Store selected screenshots in `docs/evidence/` with descriptive names such as `wallet-mobile-connected.png`, `deployment-sepolia.png`, `deposit-confirmed.png`, `refund-confirmed.png` and `invalid-amount.png`. These are planned filenames; do not create blank evidence files.

The evidence index records: evidence ID, test IDs, screenshot path, date/time and timezone, commit, environment, wallet type/device, expected result, actual result, pass/fail/blocked status and relevant real transaction hash. Include logs and gas measurements only when actually produced. Preserve representative failure evidence alongside successful flows.

## Performance and gas evaluation

Record gas used for creation (one/two installments), deposit, balance, single payment, cancel and refund. Distinguish principal from fees. Measure first detail load, paginated history load and time from submission to receipt on the tested network. Report sample count and conditions; a few demonstration runs do not establish production throughput or scalability.

## Release gate

All required contract and API cases pass; browser checks cover financial paths; real wallet/deployment requirements have evidence; defects affecting funds, permissions or status accuracy are resolved. README commands must reproduce the environment. Incomplete live checks stay visible and prevent claiming full completion.
