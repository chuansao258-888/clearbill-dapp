# ClearBill

ClearBill is a mobile-first financial DApp for freelancers who collect a single payment or a deposit followed by a balance payment. It connects an immutable bill to its payments, voluntary refund and transaction history on Ethereum Sepolia.

## Project status

The product and technical design are documented. Application code, contract compilation, deployment and runtime testing have not started. No contract address or live service is available yet.

## Design documents

| Document | Purpose |
| --- | --- |
| [Product requirements](docs/PRD.md) | Users, seven modules, rules and acceptance criteria |
| [Smart contract design](docs/SMART_CONTRACT_DESIGN.md) | Storage, every method, permissions, events, errors and invariants |
| [System architecture](docs/ARCHITECTURE.md) | Components, trust boundaries and transaction flows |
| [API design](docs/API_DESIGN.md) | Read-only HTTP API, payloads, pagination and error semantics |
| [Data and storage design](docs/DATA_DESIGN.md) | On-chain schema, browser storage and the database decision |
| [Mobile interface design](docs/MOBILE_UI_DESIGN.md) | Navigation, screens, forms and interaction states |
| [Security design](docs/SECURITY.md) | Threats, safeguards and residual risks |
| [Testing plan](docs/TEST_PLAN.md) | Contract, API, interface and live acceptance tests |
| [Implementation plan](docs/IMPLEMENTATION_PLAN.md) | Phases, file inventory, configuration and delivery gates |
| [Report outline](docs/REPORT_OUTLINE.md) | Eight-page allocation and evidence requirements |
| [Progress record](docs/PROGRESS.md) | Actual completion and verification status |

Read the PRD first, followed by the smart contract design. These documents describe the intended implementation, not completed functionality.

## Scope

One Solidity business contract, an Express backend and plain HTML, CSS and JavaScript. MetaMask signs transactions. The backend reads public blockchain data and does not hold signing keys. The initial release has no application database, escrow, arbitration, tokens, platform fees or real-money operation.

The authoritative coursework source is the local `docs/SC6113 Individual Assignment.docx`, which is excluded from version control. The submission requires source code, screenshots, a README and a 5–8 page PDF report; no video is required.

## Development conventions

Use concise English for code comments, commits and development documents. Place a purpose comment before every function or method, including internal contract helpers and test helpers. Use Solidity NatSpec for contract interfaces. Keep amounts as integer wei and decimal strings across JSON boundaries.

Work continues on `feat/clearbill`. Commit each verified phase with a focused English message. Keep credentials, dependencies and generated build files out of Git. Retain selected evidence screenshots and report sources. This repository has no runnable build or test commands yet; planned commands are listed explicitly in the implementation plan.
