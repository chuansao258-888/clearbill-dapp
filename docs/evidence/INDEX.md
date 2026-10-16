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

The following live evidence is outstanding: a retained Sepolia deployment screenshot, real MetaMask wallet connection screenshot, a successful confirmed Sepolia payment screenshot, a real mobile MetaMask layout screenshot, and Sepolia transaction/history screenshots. Record actual hashes and outcomes here only after they exist.
