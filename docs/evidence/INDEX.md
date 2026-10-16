# ClearBill Evidence Index

The entries below are local development evidence from 16 October 2026 (Asia/Singapore). The browser suite used a simulated injected wallet connected to a disposable Hardhat chain (chain ID 31337). These images are not real MetaMask or Sepolia screenshots. Re-running the browser suite creates new local bills; the screenshot records the state observed during its run.

| Evidence | Test and environment | Actual observation | File |
| --- | --- | --- | --- |
| E-L01 | Browser test, 360 CSS px, simulated payee wallet, local chain | After a deposit and payee-funded full refund, bill status is Refunded; historical paid and refunded principal are each 0.01 ETH; outstanding amount is zero | `local-refund-mobile.png` |
| E-L02 | Browser test, 390 CSS px, simulated connected wallet, local chain | A zero ETH amount is rejected in the creation form before a wallet transaction | `local-invalid-amount-mobile.png` |

The local command run also compiled the Solidity contract and passed 11 contract tests, 3 API tests, 3 amount tests and 7 browser checks. The browser checks include a local create/pay flow, unpaid cancellation, deposit/refund flow, overview and history load. The current run is not a substitute for real wallet acceptance. Raw temporary test results are ignored by Git.

Sampled local Hardhat receipts: one-payment creation `0x109f26d26eb7fa157a059b4d1cdf00f0c6a7df5817de9b39d7c695aeac6c7bb9` used 284,086 gas; its payment `0x825ef45b96786e4138cbc6651ae580e75bca11ed77ee73af508ce31273f6866a` used 71,756 gas; a browser-test refund `0xb393ecbb524b9d92d0d4f96479bfb450f5daf167b8bf7ce6e4ed6e009f75a6b2` used 70,388 gas. These hashes are on a disposable local chain and may not be queryable after it stops. They are not Sepolia transactions or cost predictions.

| Evidence | Environment | Actual observation | Public link |
| --- | --- | --- | --- |
| E-S01 | Ethereum Sepolia, direct CLI deployment from an external test-key file | Creation transaction `0x1642635ab30c2509edd6a04666069572f2468f22647156a5d0442e67a69ba91a` succeeded in block `11925719`; contract `0xFFe1EB9b734fC5bA97DB7C6ad51E5898D05483Aa` has runtime bytecode exactly matching the local artifact; independent manifest verifier passed | [Sepolia transaction](https://sepolia.etherscan.io/tx/0x1642635ab30c2509edd6a04666069572f2468f22647156a5d0442e67a69ba91a) |

E-S01 used 10,778,764 gas at 18 wei per gas, so the receipt fee was 0.000000000194017752 test ETH. The explorer was still indexing when first viewed; the independent JSON-RPC receipt and code checks supplied the verification. A retained deployment screenshot is still pending.

The following Sepolia business transactions were signed by a one-time CLI script using test accounts controlled and authorized by the student. Each submitted receipt had status 1. The private keys were read from outside this repository and were never committed. These transactions verify contract behavior on Sepolia, not the MetaMask user interface.

| Evidence | Bill and action | Transaction | Confirmed block |
| --- | --- | --- | --- |
| E-S02 | Bill 1 created, one payment of 0.0001 ETH | [Creation](https://sepolia.etherscan.io/tx/0xf4810216d7478f7060a4a8f2edd8aeb822d375cf15293bef640563aee926917b) | 11925748 |
| E-S03 | Bill 1 paid by its specified payer | [Payment](https://sepolia.etherscan.io/tx/0x322c393a3bf708c2f1f1dd10113452e3cf8c6723f68e909337c79088e6bf94c8) | 11925749 |
| E-S04 | Bill 1 fully refunded by its payee | [Refund](https://sepolia.etherscan.io/tx/0x5b7ae02a4cf9cac785b76f04ed52433cd846978905a40d4695a9fc8a52fd0726) | 11925750 |
| E-S05 | Bill 2 created, two installments of 0.00005 ETH | [Creation](https://sepolia.etherscan.io/tx/0x48b8a3a448f90fde270922fa149ddf6649fc9e6daacd8ee17998f15274800496) | 11925751 |
| E-S06 | Bill 2 first installment paid | [Deposit](https://sepolia.etherscan.io/tx/0xd8f4df8cf87155d77d8b87eb6da3c2d75e5be3fdc02aa47433132d0a0b1c6f09) | 11925754 |
| E-S07 | Bill 2 second installment paid | [Balance](https://sepolia.etherscan.io/tx/0x58303ca85845fe4496a90e158cae3b2bb86656356d83344beafb0fcaea9d2e5c) | 11925755 |
| E-S08 | Bill 3 created, unpaid | [Creation](https://sepolia.etherscan.io/tx/0x6d586fc32e7b786cf93a493ae493d6646a3d75f6efb10ab7e2f4712fb688b311) | 11925756 |
| E-S09 | Bill 3 cancelled by its payee | [Cancellation](https://sepolia.etherscan.io/tx/0x1e2e30267160e3129dabe30aad58fea8c5888713e339c447ab0c207a1d85985d) | 11925760 |

The Sepolia backend returned Refunded for bill 1 with paid and refunded principal each 0.0001 ETH, Paid for bill 2 with two paid installments, and Cancelled for bill 3 with zero paid principal. Its history endpoint returned 3, 3 and 2 matching events, respectively; all eight transaction endpoints returned confirmed with one matching contract event. Eleven live API assertions passed.

The local mobile web page was also opened at 390 CSS px against the live Sepolia backend. These screenshots show genuine Sepolia bill state and event history; the browser had no connected MetaMask wallet.

| Evidence | Sepolia-backed page | File |
| --- | --- | --- |
| E-S10 | Bill 1, Refunded, three events | `sepolia-refunded-mobile.png` |
| E-S11 | Bill 2, Paid, three events | `sepolia-paid-mobile.png` |
| E-S12 | Bill 3, Cancelled, two events | `sepolia-cancelled-mobile.png` |

The remaining screenshots are a retained explorer deployment view, a real MetaMask wallet connection and approval, and an actual phone MetaMask browser view. Render hosting checks also remain outstanding.

On 16 October 2026, the student approved two prompts in the Chrome MetaMask extension. The browser DApp connected first as `0x7ac1c7fb0C77332b2d74688fcA86B9c9A3d5b028`, then switched to `0x280D860553cb04D14cefC35B8726FB360DF633Ff`. It displayed pending and confirmed states for both actions. The backend checked each successful receipt and its matching contract event. The extension popups themselves were not retained as screenshot files.

| Evidence | Real Chrome MetaMask action | Public link | Result |
| --- | --- | --- | --- |
| E-S13 | Payee created bill 4 from the DApp | [Creation](https://sepolia.etherscan.io/tx/0x225d75b21178fc20310619ab7b8caeb2d4cb764773ad62f90e3ae3e5f4f20aa7) | Confirmed in block 11925805; gas used 1,057,398; fee 0.001586097020090562 test ETH |
| E-S14 | Payer paid bill 4's only installment of 0.0001 test ETH from the DApp | [Payment](https://sepolia.etherscan.io/tx/0xba61098143d5fb6b93846291c1dabd1567b6a2529ee6bfd557be2481d7ed609f) | Confirmed in block 11925823; gas used 172,731; fee 0.000259096502936427 test ETH |
| E-S15 | Bill 4 shows Paid and both events at 390 CSS px | — | `sepolia-bill4-paid-mobile.png`; captured separately without a connected wallet |

The fees above are observed Sepolia test ETH costs, not future fee estimates. The Chrome extension test verifies desktop wallet integration and account switching. Its Activity page rechecked the payment hash as confirmed with nine confirmations at the time of inspection and listed both bill 4 events in the payer's seven-event history. Actual phone MetaMask and retained extension-popup images remain unverified.
