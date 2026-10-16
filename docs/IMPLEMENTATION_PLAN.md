# ClearBill Implementation Plan

Status: planned work. The only current deliverable is the design documentation. Branch: `feat/clearbill`.

## Delivery approach

Build small complete flows and verify each before adding the next. The user-approved scope is the seven-module mobile-first product in the PRD. Do not introduce a database, escrow, administrative role, extra payment method or background worker during implementation.

Use English comments and commit messages. Every function and method needs a concise purpose comment. Keep the contract's public documentation aligned with the API and test cases. After each verifiable phase, inspect the changes and commit only that phase. Do not publish or push without a separate instruction.

## Planned directory and file inventory

`[existing]` means present at the documentation checkpoint. Everything marked `[planned]` will be created only during its owning phase. Generated paths are not source deliverables and are ignored. No placeholder source files are needed now.

```text
Individual Work/
├── .gitignore                              [existing] ignore rules
├── README.md                               [existing] entry point and truthful status
├── package.json                            [planned P1] dependencies and npm scripts
├── package-lock.json                       [planned P1] exact dependency versions
├── .env.example                            [planned P1] names and safe example settings
├── hardhat.config.js                       [planned P1] compiler and local test network
├── playwright.config.js                    [planned P1] browser test server and viewports
├── render.yaml                             [planned P5] one Node web service
├── contracts/
│   └── ClearBill.sol                       [planned P1–P3] one business contract
├── scripts/
│   ├── export-contract.js                  [planned P1] export ABI from compilation
│   ├── deploy-local.js                     [planned P1] disposable-chain deployment
│   └── verify-deployment.js                [planned P5] verify real receipt and code
├── deployment/
│   └── sepolia.json                        [planned P5] verified public manifest
├── server/
│   ├── app.js                              [planned P1] Express app factory and middleware
│   ├── index.js                            [planned P1] startup and listen boundary
│   ├── config.js                           [planned P1] environment/manifest validation
│   ├── routes.js                           [planned P1–P4] public API routes
│   └── chain.js                            [planned P1–P4] reads, snapshots, events, receipts
├── public/
│   ├── index.html                          [planned P1/P4] wallet setup then dashboard
│   ├── bills.html                          [planned P1–P4] issued and payable lists
│   ├── create-bill.html                    [planned P1/P2] immutable bill form and review
│   ├── bill.html                           [planned P1–P3] schedule, actions and receipts
│   ├── activity.html                       [planned P4] filters, history and export
│   ├── css/
│   │   └── styles.css                      [planned P1–P5] mobile-first shared styles
│   ├── js/
│   │   ├── api.js                          [planned P1] HTTP requests and typed error codes
│   │   ├── wallet.js                       [planned P1] provider and account/chain lifecycle
│   │   ├── transactions.js                 [planned P1–P3] review, submit and recovery
│   │   ├── amounts.js                      [planned P1] exact ETH/wei conversion and format
│   │   ├── overview.js                     [planned P4] complete snapshot aggregates
│   │   ├── bills.js                        [planned P1/P4] lists, paging and filters
│   │   ├── create-bill.js                  [planned P1/P2] validation and creation flow
│   │   ├── bill.js                         [planned P1–P3] detail and role-aware actions
│   │   └── activity.js                     [planned P4] event scans and safe CSV export
│   └── vendor/
│       └── ethers.min.js                   [generated] pinned browser dependency bundle
├── tests/
│   ├── contracts/
│   │   ├── clearbill.test.js               [planned P1–P3] state and permission tests
│   │   └── fixtures/
│   │       └── TestReceivers.sol           [planned P2/P3] rejecting/reentrant receivers
│   ├── api/
│   │   ├── bills.test.js                   [planned P1/P2] config, reads and pagination
│   │   ├── transactions.test.js            [planned P1–P3] receipt verification
│   │   └── history.test.js                 [planned P4] windows, filters and snapshots
│   ├── frontend/
│   │   ├── amounts.test.js                 [planned P1] precision and invalid amounts
│   │   └── activity.test.js                [planned P4] totals, filtering and export
│   └── browser/
│       └── flows.spec.js                   [planned P1–P5] responsive end-to-end flows
├── docs/
│   ├── SC6113 Individual Assignment.docx    [existing, ignored] authoritative coursework
│   ├── PRD.md                              [existing] product baseline
│   ├── SMART_CONTRACT_DESIGN.md             [existing] contract methods and rules
│   ├── ARCHITECTURE.md                      [existing] components and trust boundaries
│   ├── API_DESIGN.md                        [existing] HTTP contract
│   ├── DATA_DESIGN.md                       [existing] storage and database decision
│   ├── MOBILE_UI_DESIGN.md                  [existing] mobile page specification
│   ├── SECURITY.md                         [existing] safeguards and limits
│   ├── TEST_PLAN.md                        [existing] tests and evidence requirements
│   ├── IMPLEMENTATION_PLAN.md              [existing] phases and inventory
│   ├── REPORT_OUTLINE.md                   [existing] required report sections
│   ├── PROGRESS.md                         [existing] actual status
│   ├── DEPLOYMENT.md                       [planned P5] tested local/Sepolia/Render steps
│   └── evidence/
│       ├── INDEX.md                        [planned P5] actual run and screenshot ledger
│       └── descriptive-screenshot.png      [planned P5] selected actual evidence
├── report/
│   ├── report.md                           [planned P6] report source with real results
│   └── ClearBill-Report.pdf                [planned P6] verified 5–8 page report
├── artifacts/                              [generated, ignored] compiler output
├── test-results/                           [generated, ignored] raw run artifacts
├── node_modules/                           [generated, ignored] installed dependencies
└── .local/                                 [generated, ignored] local manifest and ABI
```

The vendor bundle is produced during setup/build from the locked package, with its license notice preserved. The backend reads the ABI from the generated build artifact; `/config` supplies it to the browser. A clean checkout must regenerate those files with documented commands. Test tooling must explicitly compile the receiver fixtures under `tests/contracts/fixtures`; production deployment includes only ClearBill. The Sepolia manifest is committed only after successful verification and contains no secrets. Selected report and screenshot deliverables are retained even though temporary build outputs are ignored.

## Phase plan

| Phase | Complete outcome | Allowed surfaces | Deferred work | Verification and checkpoint |
| --- | --- | --- | --- | --- |
| P0 | Product and technical specification | README and design documents | All implementation | Link/schema/state consistency review; `docs: define ClearBill product and technical design` |
| P1 | Connect wallet, create and pay one-payment bill on local chain | Tooling, core contract/read API, mobile creation/detail/list skeleton, transaction tracker | Two installments P2, refund P3, analytics P4 | CT-01/02/04/05/06/07/09/19, API-01/02/03/07/08, UI-01/02/03/05/07; `feat: complete single-payment bill flow` |
| P2 | Two-installment payments, overdue display and cancellation | Contract schedule/cancel logic, quote/read mapping, forms/detail actions | Refund P3, full activity/dashboard P4 | CT-03/08/10/11/12/16/17/18 payment-cancel portion, matching browser flows; `feat: add installments and unpaid bill cancellation` |
| P3 | Exact full refunds and closure | Refund method, error/event decoding, detail review and receipt UI | Aggregate reporting P4 | CT-13–18 refund portions, transfer/guard regression tests; `feat: add full bill refunds` |
| P4 | Complete mobile dashboard, lists, history filters and CSV | Bounded chain reads, snapshot APIs, overview/activity screens | Live release/evidence P5 | API-04/05/06/09/10/11, UI-08/09, AC-10/11/12; `feat: add bill reporting and transaction history` |
| P5 | Verified Sepolia deployment, Render service and mobile acceptance | Deployment scripts/manifest, hosting, setup instructions, evidence and focused fixes | Final report P6 | Full regression suite and manual live scenarios; `test: verify Sepolia and mobile wallet workflows` |
| P6 | Reproducible submission and report | README, report, selected screenshots and packaging | Excluded features remain excluded | Clean setup, link/file audit, PDF page/layout inspection; `docs: complete assignment report and submission guide` |

Each phase depends on the previous verified checkpoint. The single contract interface described in the design is the target; intermediate local builds may implement only their phase's functions. No partial contract is deployed to Sepolia as the final release. Cross-cutting permissions, input validation and transaction feedback ship with each action, not at the end.

No phase permits unrelated refactoring, new frameworks, custody, private signing APIs or speculative concurrency mechanisms. Remove temporary sample balances, debug output and duplicate rules before a phase commit. Keep progress and tests aligned with what actually exists.

## Tooling and planned commands

Use Node.js, Express, ethers, Hardhat, OpenZeppelin Contracts and Playwright. Pin mutually compatible stable releases and compiler settings in P1 after checking their official documentation; do not assume an unverified version combination works. Hardhat is for development and testing, not the production web server. Test fixtures are additional test contracts, not additional production business contracts.

The following npm script names are a specification, not commands available today:

| Planned command | Required outcome |
| --- | --- |
| `npm ci` | Install exact locked dependencies |
| `npm run build` | Compile contract, export ABI and generate browser vendor bundle |
| `npm run chain` | Start disposable local development chain |
| `npm run deploy:local` | Deploy local contract and write ignored local manifest |
| `npm start` | Start configured Express service |
| `npm run test:contract` | Run isolated contract tests |
| `npm run test:api` | Run API integration/error tests |
| `npm run test:frontend` | Run exact amount, aggregation and export tests |
| `npm run test:browser` | Run browser integration/responsive checks |
| `npm test` | Run contract, API and frontend suites |
| `npm run verify:deployment` | Check supplied manifest against real chain receipt/code |

Document exact invocation and prerequisites when the scripts exist. Do not claim a command passed merely because it appears here.

## Configuration specification

| Name | Required/default | Consumer and reason | Secret |
| --- | --- | --- | --- |
| `PORT` | Default 3000; hosting may supply | Express listener | No |
| `RPC_URL` | Required | Backend read-only chain provider | Treat full URL as secret |
| `CHAIN_ID` | Default 11155111; local 31337 | Startup and wallet network validation | No |
| `DEPLOYMENT_FILE` | Required path | Select verified public manifest; local path under `.local` | No |
| `RPC_TIMEOUT_MS` | Default 10000; positive integer | Bound read failures; timeout tests | No |
| `HISTORY_BLOCK_SPAN` | Default 1000; 1–1000 | Bound each log query; empty-window/limit tests | No |

No `PRIVATE_KEY`, database URL, JWT secret or administrator address is part of the server configuration. The local tooling may use the development chain's disposable unlocked accounts. Validate network/manifest consistency at startup. Keep secrets in `.env` locally and Render environment settings remotely. Public explorer mapping is fixed for supported networks, not user-provided input.

## Remaining operational prerequisites

The submission deadline, real phone availability, test-wallet funding and hosting/GitHub account access have not been recorded. These do not block documentation or local implementation; they must be confirmed before scheduling live acceptance. No paid purchase, remote push or deployment is represented as completed.

## Definition of done

All PRD acceptance criteria have evidence; tests distinguish local and live environments; actual wallet/deployment screenshots exist; secrets and course materials are excluded; README reproduces setup; public addresses and receipts are verified; the PDF has 5–8 readable pages and all required sections. No unimplemented feature is described as working.
