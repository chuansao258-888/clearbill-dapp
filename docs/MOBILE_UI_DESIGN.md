# ClearBill Mobile Interface Design

Status: five mobile pages implemented and checked with a simulated wallet at local phone viewports. Real MetaMask mobile remains unverified.

## Design direction

Design for a phone first. Use a single-column content area, readable bill cards and a persistent bottom navigation with Overview, Bills and Activity. Creation is a clearly labelled button on Overview and Bills. The account/network control sits in the header. Details and creation screens have a back action and preserve the parent filter when possible.

Use neutral backgrounds, dark text and one blue primary action color. State labels combine text and icons; color alone must not convey success or failure. Refund and cancellation use explicit wording rather than an ambiguous red icon.

Start with 16 px body text, 24–28 px page headings, 16 px side padding, an 8 px spacing rhythm and touch targets of at least 44 by 44 CSS pixels. Support 320 px without page overflow; verify primary flows at 360 and 390 px. At 768 px, allow wider forms and two-column summary cards. At 1024 px, allow a wider card grid while retaining the same workflows. Do not make hover essential.

## Screen inventory

| Route | Screen | Main content | Primary action |
| --- | --- | --- | --- |
| `/` | Overview | Wallet state, incoming/outgoing totals, overdue issued bills, recent activity | Create bill or connect wallet |
| `/bills` | Bills | Issued / To pay tabs, status and overdue filters, bill cards | Create bill / open bill |
| `/bills/new` | Create bill | Payer, public label, schedule, review | Review bill, then create |
| `/bills/:id` | Bill detail | Amounts, parties, schedule, actions, receipt timeline | Context-dependent pay, refund or cancel |
| `/activity` | Activity | Type/bill/date filters, confirmed records, scan progress and CSV export | Filter / load older / export |

The server maps these routes to static HTML pages. A direct detail link must work after browser refresh. No client-side routing framework is required.

## Overview layout

```text
┌──────────────────────────────────┐
│ ClearBill       Sepolia  Account │
│ Overview                         │
│ Net received                     │
│ 0.0000 ETH                       │
│ Received          Refunded       │
│ Unpaid requests                  │
│ [ Create bill ]                  │
│ Overdue bills                    │
│ Bill card                        │
│ Recent activity                  │
│ Activity card                    │
│                                  │
│ Overview       Bills    Activity │
└──────────────────────────────────┘
```

The numbers above are layout placeholders, not transaction evidence. Use skeletons during loading, not zero-valued financial cards. Show a scan progress indicator for paginated aggregates; do not label a partial subtotal as a final balance. Wallet ETH balance is separate from ClearBill net receipts.

## Bill cards and filters

Each card shows label, bill ID, status, counterpart address, paid/total amount and next deadline. Show a separate Overdue badge only for the next unpaid installment. Provide an explicit detail link with a clear accessible name. Keep amounts and status visible without expanding the card.

Issued / To pay determines which contract index is read. Status filters include All, Open, Partially paid, Paid, Cancelled and Refunded; Overdue is an additional active-bill filter. When results are partial, use “Showing loaded bills” and a Load more action. Empty complete results use “No bills match these filters”; incomplete empty results invite further loading.

## Creation form

Order fields: payer address, public purpose label, one-payment/two-installment selection, amount(s), deadline(s), total and privacy notice. Use full-width controls with persistent labels. Label amount fields explicitly in ETH and accept decimal strings with at most 18 fractional digits; reject exponent notation, signs, commas and zero. Use integer conversion rather than floating-point rounding.

Use mobile date/time controls with the user's timezone displayed. Convert to Unix seconds before submission; show the resulting local date and UTC time in the review step. First due time must still be future at execution, so handle a deadline that passes while the wallet is open with a specific correction message.

The public label counter measures UTF-8 bytes. Show “Public on-chain. Do not enter personal or confidential information.” Trim surrounding whitespace before review and submit the exact reviewed text.

The review step shows full payer/payee addresses, network, exact amount(s), total, deadlines and an explanation that terms cannot be edited. Wallet rejection preserves the draft. Successful creation clears it and opens the recovered bill. Retrying an uncertain creation preserves its client reference until its outcome is resolved.

## Detail layout and actions

```text
Header and back action
Bill label and ID
Status plus overdue badge
Total / Paid / Remaining
Payee and payer addresses with copy controls
Installment 1: amount, due time, paid or due
Installment 2: amount, due time, paid or due
Receipt timeline
Contextual action area above bottom navigation
```

| Account and bill state | Available action |
| --- | --- |
| Payer, Open or PartiallyPaid | Pay next installment |
| Payee, Open | Cancel bill |
| Payee, PartiallyPaid or Paid | Refund received amount |
| Other address | Read only; identify the required wallet |
| Cancelled or Refunded | No financial action |
| Wallet missing or wrong chain | Connect or switch network before action |

Before payment, show installment number, principal, payee and estimated gas separately. Before refund, show received amount, original payer, the fact that the payee funds the refund, and closure of any remaining installment. Cancellation review explains that a new bill is required if terms are wrong.

Use a bottom sheet or full-width review panel on mobile. It must trap focus when modal, support Escape/back dismissal before signing, and restore focus on close. The sticky action area respects safe-area insets and must not cover content or form errors when the software keyboard is open.

## Transaction feedback

Use a consistent progress panel: Review → Awaiting wallet → Submitted → Confirmed. Rejection, revert, replacement and unknown status are distinct side states. A submitted state includes a copyable hash and network-correct explorer link. Announce updates through a polite live region.

Poll known hashes every 4 seconds while the screen is visible, for up to 2 minutes. This is a UI wait limit, not a declaration that the transaction failed. After the limit show “Still awaiting confirmation” with Check status. Suspend polling on page hide and reconcile on return. Never automatically re-send a transaction. Keep pending local records scoped to account, chain and contract.

On account or chain change, clear outdated actions and loaded account data, dismiss unsubmitted review panels and request fresh reads. A submitted transaction remains associated with its original sender. Do not make its confirmation appear to belong to the newly selected account.

## Wallet support boundary

The first release targets a desktop browser with MetaMask and the MetaMask mobile in-app browser using an injected provider. A normal mobile browser without a provider may read public bill details and must show instructions to open the site in MetaMask for transactions. It must not show a broken Connect button or claim universal mobile wallet support.

No WalletConnect or separate mobile SDK is included. This keeps the mobile UI scope achievable while requiring actual MetaMask mobile-browser acceptance testing. Verify account exposure/change handling against the installed wallet and official [MetaMask account guidance](https://docs.metamask.io/metamask-connect/evm/guides/manage-user-accounts/).

## Accessibility and errors

Use semantic headings, buttons and labels; visible focus; sufficient text contrast; meaningful loading and error text; and no automatic animation required for comprehension. Address text wraps on detail/review pages and has a copy button; abbreviate only in compact cards. Every validation error appears beside its field and is summarized above the submit action.

The local browser suite checks 360–390 CSS-pixel layouts and retains an invalid-amount screenshot. Real MetaMask mobile acceptance, 200% text zoom, keyboard navigation, slow RPC responses and long-content checks remain outstanding.
