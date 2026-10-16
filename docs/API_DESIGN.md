# ClearBill API Design

Status: planned interface. Base path: `/api/v1`. All application endpoints are read-only GET requests. Blockchain writes use the contract methods documented in [Smart contract design](SMART_CONTRACT_DESIGN.md).

## Conventions

Responses use `application/json`. No cookies, login sessions or server-held signing keys are required. Address query parameters select public data and never establish authorization. Express serves the UI from the same origin; no permissive cross-origin access is needed.

Amounts and uint256 identifiers are decimal strings. Reject signs, decimal points, exponent notation and out-of-range values for integer query fields. Validate address checksum when mixed-case input is supplied; accept valid uniformly cased hex addresses. Reject zero account addresses. Hashes are `0x` followed by 64 hex digits.

Errors have this shape:

```json
{
  "error": {
    "code": "INVALID_ARGUMENT",
    "message": "The limit must be between 1 and 50.",
    "field": "limit"
  }
}
```

`field` is null when no input field is responsible. Never expose stack traces, raw RPC responses or credential-bearing URLs.

| HTTP status | Error codes | Meaning |
| --- | --- | --- |
| 400 | INVALID_ARGUMENT, INVALID_CURSOR | Invalid syntax, range or query combination |
| 404 | BILL_NOT_FOUND | Well-formed but unknown bill ID |
| 409 | SNAPSHOT_CHANGED, TRANSACTION_SCOPE_MISMATCH | Reorganization or unrelated transaction |
| 503 | SETUP_REQUIRED, CHAIN_UNAVAILABLE, RPC_LIMIT | Configuration, provider availability or query capacity failure |
| 504 | CHAIN_TIMEOUT | RPC request exceeded the configured timeout |
| 500 | INTERNAL_ERROR | Unexpected server failure; sanitized diagnostic |

## Snapshot schema

```text
Snapshot {
  blockNumber: integer,
  blockHash: hex32,
  timestamp: Unix seconds
}
```

`GET /snapshot` obtains the latest canonical block for a new list/dashboard read. Paginated contract reads require `blockNumber` and `blockHash` together; omit both to start a standalone read. The server validates the pair against the current canonical chain before and after the read batch and reads all values at that block tag. A snapshot before deployment or after the current tip is invalid. All state responses include `snapshot`. A new snapshot starts a new aggregation; never combine pages from different snapshots.

## Endpoints

| Method and path | Inputs | Response |
| --- | --- | --- |
| `GET /health` | None | Process and chain readiness, 200 or 503 |
| `GET /config` | None | Public network, deployment and ABI configuration |
| `GET /snapshot` | None | `{snapshot}` |
| `GET /bills/:billId` | Optional snapshot pair | `{bill,snapshot}` |
| `GET /accounts/:address/bills` | `role=payee|payer`, `offset`, `limit`, optional snapshot pair | `{items,nextOffset,total,snapshot}` |
| `GET /accounts/:address/history` | Optional `billId`, `type`, `fromTime`, `toTime`, `cursor` | `{items,nextCursor,complete,snapshot}` |
| `GET /bills/:billId/history` | Optional `type`, `fromTime`, `toTime`, `cursor` | Same history envelope |
| `GET /transactions/:hash` | None | Verified transaction tracking record |

`role` is required. Offset defaults to string `"0"`; limit defaults to 20 and must be 1–50. `nextOffset` is null at the end, otherwise a decimal string. Items are returned in descending creation order: the backend translates the requested descending offset into the contract's ascending slice, then reverses it. It reads the total and all records at the same snapshot. Offset equal to total returns empty items; greater offset returns 400.

## Configuration and health

`/config` returns `chainId`, `chainName`, `currencySymbol`, `contractAddress`, `deploymentBlock`, `explorerBaseUrl` and `abi`. Values come from validated configuration and build artifacts, never hard-coded sample deployment values. The ABI exposes no secret. RPC URLs are not included. Missing or mismatched deployment returns 503.

`/health` returns `{status:"ready",chainReady:true}` or `{status:"degraded",chainReady:false}`. It contains no secrets or detailed provider diagnostics. A running process with broken deployment configuration is not reported as ready.

## Bill schema

```text
BillResponse {
  id: decimal string,
  payee: address,
  payer: address,
  label: string,
  installmentCount: 1 | 2,
  installments: [{index: 0 | 1, amountWei: decimal string,
                  dueAt: integer, paid: boolean}],
  paidInstallments: 0 | 1 | 2,
  status: "Open" | "PartiallyPaid" | "Paid" | "Cancelled" | "Refunded",
  createdAt: integer,
  totalAmountWei: decimal string,
  paidAmountWei: decimal string,
  refundedAmountWei: decimal string,
  netReceivedWei: decimal string,
  outstandingWei: decimal string,
  isOverdue: boolean,
  nextInstallment: {index: integer, amountWei: decimal string, dueAt: integer} | null
}
```

Only active installments are included. A refunded deposit remains `paid:true` in its installment history; the bill's refund fields and status explain the returned money. The unpaid tail is not relabelled as paid.

Illustrative request, not evidence of an existing bill:

```http
GET /api/v1/bills/1
Accept: application/json
```

Illustrative projection of a two-installment deposit, with address and snapshot fields omitted for readability:

```json
{
  "id": "1",
  "status": "PartiallyPaid",
  "totalAmountWei": "20000000000000000",
  "paidAmountWei": "5000000000000000",
  "refundedAmountWei": "0",
  "netReceivedWei": "5000000000000000",
  "outstandingWei": "15000000000000000"
}
```

The dashboard uses complete paginated bill reads rather than a second API with different arithmetic. Gross received/refunded/net and requested amounts are computed using BigInt in the browser according to the data design. The backend remains responsible for retrieving authoritative values and timestamps.

## History contract

`type` accepts `all` (default), `created`, `payment`, `cancelled` or `refund`. `fromTime` and `toTime` are optional inclusive Unix-second bounds; if both are supplied, start must not exceed end. A bill filter on account history must also match that account as payer or payee; no match is a legitimate empty result.

Each request scans at most `HISTORY_BLOCK_SPAN` blocks, default 1000, backwards from the current cursor upper bound. The lower bound is the deployment block. It fetches all matching logs in that window; no silent record truncation is allowed. A provider result limit returns `RPC_LIMIT`, not a false complete response. The operator can reduce the configured span and retry the scan.

`nextCursor` is base64url-encoded JSON containing a version, snapshot number/hash/timestamp, next upper block, original scope (account or bill), filters, chain ID and contract address. Validate every field, bound the decoded size to 2 KB, verify the snapshot and scope, and reject mismatched filters. This is a public query cursor, not an authorization token; it needs no signature or server session. The client sends unchanged filters with each cursor request.

An empty page with a non-null cursor means older blocks remain. `complete=true` only when the lower bound or requested start-time bound is exhausted; it does not merely mean the current page was empty. Changing filters restarts the scan. Account queries merge indexed payee/payer results and deduplicate log identities. Sorting is descending block, transaction index, log index.

```text
HistoryItem {
  eventId: string,
  billId: decimal string,
  type: "created" | "payment" | "cancelled" | "refund",
  payee: address,
  payer: address,
  amountWei: decimal string | null,
  installmentIndex: integer | null,
  transactionHash: hex32,
  transactionIndex: integer,
  logIndex: integer,
  blockNumber: integer,
  blockHash: hex32,
  timestamp: integer
}
```

Creation uses total requested amount; payment/refund use transferred principal; cancellation has null amount. Creation is never counted as received money. History is confirmed chain activity, not a list of locally rejected wallet prompts.

CSV is generated in the browser from the fully retrieved filtered history. Disable complete-export action until `complete=true`; offer no misleading full-history export from a partial scan. Include chain ID, contract, bill ID, type, installment, wei, ETH, UTC time, transaction hash and block. Record snapshot block and filters in the export filename or accompanying UI. Quote fields correctly and neutralize formula-like user text if labels are added.

## Transaction status

```text
TransactionResponse {
  hash: hex32,
  state: "pending" | "confirmed" | "reverted" | "unknown",
  operation: "create" | "pay" | "cancel" | "refund" | null,
  from: address | null,
  billId: decimal string | null,
  blockNumber: integer | null,
  confirmations: integer,
  gasUsed: decimal string | null,
  feeWei: decimal string | null,
  events: HistoryItem[]
}
```

The backend checks the configured chain, transaction destination, supported call selector, receipt status and event address. A successful receipt must contain the matching business event for the decoded operation and bill. Decode transaction inputs to verify index/reference/value against that event; do not accept an unrelated log as a receipt. An unrelated destination or unsupported call yields 409. A successful receipt without the required matching event yields a verification error, not confirmed payment.

With no receipt but a known correctly scoped transaction, return pending. With neither transaction nor receipt, return unknown (200), not reverted or 404. Provider failure is 503/504. For a reverted receipt, events are empty and operation may be decoded from input. Fee equals gas used times effective gas price when supplied; otherwise null, never invented.

Confirmation means a successful matching receipt included in a canonical block, with at least one confirmation. Display the count; do not claim immediate finality. Re-query on refresh. A replaced hash cannot reliably be discovered by this endpoint alone: the active wallet wait flow may identify a replacement. The browser tracks and verifies the replacement hash separately, or shows the original as unknown if recovery is inconclusive.

## Write integration

There are no `POST /pay`, `POST /refund`, login or private-key endpoints. Before any write, refresh account, chain and current bill, review exact value, estimate gas and request MetaMask approval. Contract method errors are mapped to the names in the contract specification. Input assistance is not a substitute for contract enforcement.

Reference: [ethers provider and receipt APIs](https://docs.ethers.org/v6/api/providers/). Exact SDK behavior and error mappings must be verified against the pinned implementation version.
