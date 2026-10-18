const { test, expect } = require("@playwright/test");
const path = require("node:path");
const origin = "https://clearbill-dapp.onrender.com";
const account = "0x280D860553cb04D14cefC35B8726FB360DF633Ff";
const shortAccount = "0x280D…33Ff";

/** Loads the real bills page with controlled account timing and read-only fixtures. */
async function connectionPage(page, mode = "normal") {
  await page.route(`${origin}/**`, async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/api/v1/")) {
      let json = { items: [], nextOffset: null, total: "0" };
      if (url.pathname.endsWith("/config")) json = { chainId: 11155111, chainName: "Sepolia", abi: [] };
      if (url.pathname.endsWith("/snapshot")) json = { snapshot: { blockNumber: 1, blockHash: `0x${"1".repeat(64)}` } };
      return route.fulfill({ json });
    }
    const file = url.pathname === "/bills" ? "bills.html" : url.pathname.slice(1);
    return route.fulfill({ path: path.join(__dirname, "../../public", file) });
  });
  await page.addInitScript(({ address, mode }) => {
    window.walletListeners = {};
    window.walletReads = 0;
    window.ethereum = {
      isMetaMask: true,
      on: (name, listener) => { window.walletListeners[name] = listener; },
      request: async ({ method }) => {
        if (method === "eth_accounts") {
          window.walletReads++;
          if (mode === "late-initial" && window.walletReads === 1) return new Promise(resolve => { window.releaseInitial = () => resolve([]); });
          return window.connected && mode !== "stale-accounts" ? [address] : [];
        }
        if (method === "eth_requestAccounts") {
          if (mode === "rejected") throw Object.assign(new Error("Connection rejected"), { code: 4001 });
          window.connected = true;
          return [address];
        }
        if (method === "eth_chainId") {
          if (mode === "network-error") throw new Error("Wallet network unavailable");
          if (mode === "slow-network") return new Promise(resolve => { window.releaseNetwork = () => resolve("0xaa36a7"); });
          return "0xaa36a7";
        }
        throw new Error(`Unexpected wallet request: ${method}`);
      }
    };
  }, { address: account, mode });
  await page.goto(`${origin}/bills`);
  await expect.poll(() => page.evaluate(() => window.walletReads)).toBeGreaterThan(0);
}

test("first connection updates the header without an accountsChanged event", async ({ page }) => {
  await connectionPage(page);
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  await expect(page.locator("#wallet-button")).toHaveText(shortAccount);
  await expect(page.locator("#wallet-note")).toHaveText("Wallet connected");
});

test("the approved account updates the header while eth_accounts still returns empty", async ({ page }) => {
  await connectionPage(page, "stale-accounts");
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  await expect(page.locator("#wallet-button")).toHaveText(shortAccount);
  await expect(page.locator("#wallet-note")).toHaveText("Wallet connected");
});

test("an older disconnected read cannot overwrite a completed connection", async ({ page }) => {
  await connectionPage(page, "late-initial");
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  await expect(page.locator("#wallet-button")).toHaveText(shortAccount);
  await page.evaluate(() => window.releaseInitial());
  await expect(page.locator("#wallet-button")).toHaveText(shortAccount);
  await expect(page.locator("#wallet-note")).toHaveText("Wallet connected");
});

test("the approved address is visible before the network request completes", async ({ page }) => {
  await connectionPage(page, "slow-network");
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  await expect(page.locator("#wallet-button")).toHaveText(shortAccount);
  await page.evaluate(() => window.releaseNetwork());
  await expect(page.locator("#wallet-note")).toHaveText("Wallet connected");
});

test("account changes and disconnect use the event accounts without another read", async ({ page }) => {
  await connectionPage(page, "stale-accounts");
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  const next = "0x7ac1c7fb0C77332b2d74688fcA86B9c9A3d5b028";
  await page.evaluate(address => window.walletListeners.accountsChanged([address]), next);
  await expect(page.locator("#wallet-button")).toHaveText("0x7ac1…b028");
  await page.evaluate(() => window.walletListeners.accountsChanged([]));
  await expect(page.locator("#wallet-button")).toHaveText("Connect wallet");
  await expect(page.locator("#wallet-note")).toHaveText("Connect to view your bills");
});

test("a rejected connection does not display an approved account", async ({ page }) => {
  await connectionPage(page, "rejected");
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  await expect(page.locator("#wallet-button")).toHaveText("Connect wallet");
  await expect(page.locator("#wallet-button")).toBeEnabled();
  await expect(page.locator("#wallet-note")).toHaveText("Connection rejected");
});

test("a failed network read keeps the approved address and displays the error", async ({ page }) => {
  await connectionPage(page, "network-error");
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  await expect(page.locator("#wallet-button")).toHaveText(shortAccount);
  await expect(page.locator("#wallet-note")).toHaveText("Wallet network unavailable");
  await expect(page.locator("#wallet-button")).toBeEnabled();
});
