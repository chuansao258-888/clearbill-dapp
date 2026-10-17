const { test, expect } = require("@playwright/test");
const path = require("node:path");
const origin = "https://clearbill-dapp.onrender.com";
const account = "0x7ac1c7fb0C77332b2d74688fcA86B9c9A3d5b028";

/** Serves the real creation page with a connected wallet on Ethereum mainnet. */
async function wrongNetworkPage(page, startPath = "/bills/new", chainId = "0x1", sendState = "reject") {
  await page.route(`${origin}/**`, async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/v1/config") return route.fulfill({ json: {
      chainId: 11155111, chainName: "Sepolia", contractAddress: "0xFFe1EB9b734fC5bA97DB7C6ad51E5898D05483Aa",
      abi: require("../../abi/ClearBill.abi.json")
    } });
    if (url.pathname === "/api/v1/bills/99") return route.fulfill({ json: { bill: {
      id: "99", label: "Mobile payment check", payee: "0x280D860553cb04D14cefC35B8726FB360DF633Ff", payer: account,
      status: "Open", isOverdue: false, totalAmountWei: "100000000000000", paidAmountWei: "0", refundedAmountWei: "0", outstandingWei: "100000000000000",
      installments: [{ index: 0, amountWei: "100000000000000", dueAt: 1893456000, paid: false }],
      nextInstallment: { index: 0, amountWei: "100000000000000", dueAt: 1893456000 }
    } } });
    if (url.pathname.endsWith("/history")) return route.fulfill({ json: { items: [], nextCursor: null } });
    const file = url.pathname === "/bills/new" ? "create-bill.html" : url.pathname === "/bills/99" ? "bill.html" : url.pathname.slice(1);
    return route.fulfill({ path: path.join(__dirname, "../../public", file) });
  });
  await page.addInitScript(({ address, chainId, sendState }) => {
    window.walletCalls = [];
    window.walletChain = chainId;
    window.ethereum = {
      isMetaMask: true, on: () => {},
      request: async ({ method, params }) => {
        window.walletCalls.push(method);
        if (method === "eth_accounts" || method === "eth_requestAccounts") return [address];
        if (method === "eth_chainId") return window.walletChain;
        if (method === "eth_call" || method === "eth_getCode") return "0x";
        if (method === "eth_blockNumber") return "0x1";
        if (method === "eth_estimateGas") return "0x186a0";
        if (method === "eth_sendTransaction") {
          if (sendState === "pending") return new Promise(() => {});
          throw Object.assign(new Error("Request already pending"), { code: -32002 });
        }
        if (method === "wallet_switchEthereumChain") { window.walletChain = params[0].chainId; return null; }
        throw new Error(`Unexpected wallet method: ${method}`);
      }
    };
  }, { address: account, chainId, sendState });
  await page.goto(`${origin}${startPath}`);
}

test("a connected wallet on mainnet exposes an explicit Sepolia switch control", async ({ page }) => {
  await wrongNetworkPage(page);
  await expect(page.locator("#wallet-note")).toContainText("Ethereum Mainnet");
  await page.getByRole("button", { name: "Switch to Sepolia", exact: true }).click();
  await expect(page.locator("#wallet-note")).toHaveText("Wallet connected");
  expect(await page.evaluate(() => window.walletChain)).toBe("0xaa36a7");
  expect(await page.evaluate(() => window.walletCalls.includes("eth_sendTransaction"))).toBe(false);
});

test("payment confirmation exposes a wrong-network error on screen without sending", async ({ page }) => {
  await wrongNetworkPage(page, "/bills/99");
  await page.getByRole("button", { name: "Pay installment 1" }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.locator("#page-status")).toContainText("Switch MetaMask to Sepolia");
  await expect(page.locator("#page-status")).toBeInViewport();
  expect(await page.evaluate(() => window.walletCalls.includes("eth_sendTransaction"))).toBe(false);
});

test("a wallet pending-request error is visible after payment confirmation", async ({ page }) => {
  await wrongNetworkPage(page, "/bills/99", "0xaa36a7");
  await page.getByRole("button", { name: "Pay installment 1" }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.locator("#page-status")).toContainText("A MetaMask request is already pending");
  await expect(page.locator("#page-status")).toBeInViewport();
  expect(await page.evaluate(() => window.walletCalls.filter(method => method === "eth_sendTransaction").length)).toBe(1);
});

test("a stalled wallet request keeps payment disabled and shows a no-resubmit message", async ({ page }) => {
  await page.clock.install();
  await wrongNetworkPage(page, "/bills/99", "0xaa36a7", "pending");
  await page.getByRole("button", { name: "Pay installment 1" }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.walletCalls.includes("eth_sendTransaction"))).toBe(true);
  await page.clock.fastForward(16000);
  await expect(page.locator("#page-status")).toContainText("MetaMask has not returned a transaction hash");
  await expect(page.getByRole("button", { name: "Pay installment 1" })).toBeDisabled();
  expect(await page.evaluate(() => window.walletCalls.filter(method => method === "eth_sendTransaction").length)).toBe(1);
});

test("creation checks the wallet network before attempting reference lookup", async ({ page }) => {
  await wrongNetworkPage(page);
  await page.locator("#payer").fill("0x280D860553cb04D14cefC35B8726FB360DF633Ff");
  await page.locator("#label").fill("Wrong network check");
  await page.locator("#amount-one").fill("0.0001");
  await page.locator("#due-one").fill(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
  await page.getByRole("button", { name: "Review and create" }).click();
  await expect(page.locator("#form-error")).toContainText("Switch MetaMask to Sepolia");
  expect(await page.evaluate(() => window.walletCalls.includes("eth_call"))).toBe(false);
  expect(await page.evaluate(() => window.walletCalls.includes("eth_sendTransaction"))).toBe(false);
  await expect(page.locator("#form-error")).toBeInViewport();
});
