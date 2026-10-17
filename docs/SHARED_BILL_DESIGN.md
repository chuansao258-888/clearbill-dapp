# Shared Bills: Product and Contract Design

Status: design approved; implementation and deployment are pending. ClearBill remains the product name and bill settlement remains its primary purpose.

## Problem and scope

One expense can be paid by several known people. The payee needs a clear fixed amount from each person, potentially as a deposit and later balance. Separate wallet transfers do not identify which payer and installment they settle. ClearBill already supports one payer with one or two exact installments. Shared bills extend the same workflow to two or three distinct payers. The deployed one-to-one contract remains in place for its existing records.

The payee creates immutable terms. Each listed payer reviews their own next installment and signs their own MetaMask transaction. The smart contract checks the address, order and exact wei amount, records the event, and forwards that payment to the payee immediately. Due dates mark overdue amounts but do not trigger automatic wallet payments or block a late payment.

## Fixed terms

- Two or three specified payers, each distinct from the payee and from other payers.
- One or two installments per payer. The bill uses the same first and optional second due dates for all payers, but every payer has their own fixed amount at each stage.
- Every active installment is positive. An unused payer slot or installment is zero.
- A short public label and a creator-scoped reference prevent accidental duplicate submission. No names, contact details or sensitive invoice attachments are stored.
- The total is the exact sum of all payer installments. Overpayment, partial payment and skipped stage fail on-chain.

## Contract methods

| Method | Caller and result |
| --- | --- |
| `createSharedBill(payers[3], label, payerCount, installmentCount, amounts[3][2], dueAt[2], clientReference)` | Payee wallet creates validated immutable terms, indexes the bill for itself and each payer, and emits a creation event. In Solidity, the amount parameter type is `uint256[2][3]`: three payer rows of two amounts. |
| `payInstallment(billId, expectedInstallment)` payable | Only a listed payer pays their own exact next installment. Updates that payer's progress, forwards ETH to the payee, and emits a payment event. |
| `cancelBill(billId)` | Payee only, before anyone has paid. Closes the unpaid bill. |
| `refundBill(billId, expectedPaidTotal)` payable | Payee only, after at least one payment. Funds the exact amount received to date. The contract marks the bill refunded and returns each payer's previously paid principal in one atomic transaction. It also closes any unpaid remainder. |
| `getBill`, `getPaymentQuote`, `getAccountBillCount`, `getAccountBillIds`, `getBillIdByReference` | Public reads for bill terms, each payer's next payment, bounded account lists and creation recovery. |

Events are `SharedBillCreated`, `SharedInstallmentPaid`, `SharedBillCancelled`, and `SharedPayerRefunded`. A refund emits one event for each payer who paid, allowing the backend to reconcile a multi-recipient refund receipt. Contract status is `Open`, `PartiallyPaid`, `Paid`, `Cancelled`, or `Refunded`. Per-payer progress is stored separately; a bill is `Paid` only after every payer has paid all scheduled installments.

## Invariants and limits

1. Each listed payer can advance only their own installment index, once per stage, by paying the exact assigned amount.
2. `paidTotal` equals the sum of successful installment events and never exceeds `total`.
3. Every successful payment forwards its principal to the payee in the same transaction. No intentional customer balance remains in the contract between calls.
4. Cancellation requires zero paid principal. A refund is funded with fresh ETH by the payee and can occur only once.
5. The total returned in a successful refund equals the bill's lifetime paid principal. A failed transfer to any payer reverts the entire refund; no subset is marked refunded.

The refund loop is bounded by three payers, state changes precede external transfers, and the write methods use a reentrancy guard. A payer contract that rejects ETH may prevent an atomic refund; this is disclosed as a limitation. Forced ETH sent to the contract is not credited to any bill. The payee cannot force a payer to approve payment, and creating a bill does not prove a legal debt or acceptance.

## Application integration

The original `ClearBill.sol` and Sepolia manifest remain authoritative for legacy one-to-one bills. A new `SharedBill.sol` contract receives a separate deployment address and ledger. The Node.js service verifies both manifests and offers read-only shared-bill detail, account list, event history and transaction receipt endpoints. MetaMask alone owns signing. No database is needed.

The mobile interface keeps one Bill area. The creation form offers one, two or three payers. One payer uses the existing bill flow; two or three use the shared-bill flow. Lists identify the bill type. Shared details show all payer shares and progress, while the connected wallet sees only actions it is authorized to take. Existing `/bills/:id` links continue to resolve to the original contract; shared records use `/shared-bills/:id` so IDs cannot be confused across contracts.

## Acceptance and planned files

Test valid one- and two-stage shared payments; wrong wallet, wrong amount, skipped and repeated stage; mixed payer progress; late payment; cancellation; partial and full refunds; stale total; rejecting recipients; reentrancy; deployment; API pagination and receipt scope; wallet connection and 360/390 px mobile browser flows. Capture actual local and Sepolia screenshots only after verification.

Planned additions: `contracts/SharedBill.sol`, focused contract fixtures/tests, `server/shared-bills.js`, `server/shared-bill-routes.js`, `public/shared-bill.html`, related page scripts and form/list updates, and a separate verified deployment manifest. The report is written separately by the student and stays outside Git.
