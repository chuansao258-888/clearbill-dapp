const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const origin = "https://clearbill-dapp.onrender.com";
const account = "0x280D860553cb04D14cefC35B8726FB360DF633Ff";

/** Serves the actual frontend with read-only API fixtures and no live transactions. */
async function serveWalletPage(page) {
  await page.route(`${origin}/**`, async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/api/v1/")) {
      let json = { items: [], nextOffset: null, total: "0" };
      if (url.pathname.endsWith("/config")) json = { chainId: 11155111, chainName: "Sepolia", abi: [] };
      if (url.pathname.endsWith("/snapshot")) json = { snapshot: { blockNumber: 1, blockHash: `0x${"1".repeat(64)}` } };
      return route.fulfill({ json });
    }
    const relative = url.pathname === "/bills" ? "bills.html" : url.pathname.slice(1);
    const file = path.join(__dirname, "../../public", relative);
    return route.fulfill({ path: file });
  });
}

for (const [name, userAgent] of [
  ["iPhone Chrome", "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/130.0.0 Mobile/15E148 Safari/604.1"],
  ["Android Chrome", "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36"],
  ["Android Firefox", "Mozilla/5.0 (Android 15; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0"]
]) {
  test(`${name} shows a copy fallback and opens the same page in MetaMask`, async ({ browser }) => {
    const context = await browser.newContext({ userAgent, viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await serveWalletPage(page);
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "clipboard", { value: { writeText: async value => { window.copiedPage = value; } } });
    });
    await page.route("https://link.metamask.io/**", route => route.fulfill({ body: "MetaMask app handoff" }));
    await page.goto(`${origin}/bills`);
    await expect(page.locator("#wallet-help")).toBeVisible();
    await expect(page.getByRole("link", { name: "Open MetaMask", exact: true })).toHaveAttribute("href", "https://link.metamask.io/dapp/clearbill-dapp.onrender.com/bills");
    if (name === "iPhone Chrome") await page.screenshot({ path: "docs/evidence/mobile-wallet-handoff.png" });
    await page.getByRole("button", { name: "Copy page link" }).click();
    await expect(page.locator("#wallet-help [role=status]")).toContainText("Page link copied");
    expect(await page.evaluate(() => window.copiedPage)).toBe(`${origin}/bills`);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
    await expect(page).toHaveURL("https://link.metamask.io/dapp/clearbill-dapp.onrender.com/bills");
    await context.close();
  });
}

test("blocked clipboard access leaves a readable manual-copy address", async ({ browser }) => {
  const context = await browser.newContext({ userAgent: "iPhone" });
  const page = await context.newPage();
  await serveWalletPage(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async () => { throw new Error("Blocked"); } } });
  });
  await page.goto(`${origin}/bills`);
  await page.getByRole("button", { name: "Copy page link" }).click();
  await expect(page.locator("#wallet-help [role=status]")).toContainText(`Copy this address manually: ${origin}/bills`);
  await context.close();
});

test("MetaMask's mobile browser requests accounts without another app redirect", async ({ browser }) => {
  const context = await browser.newContext({ userAgent: "iPhone" });
  const page = await context.newPage();
  await serveWalletPage(page);
  await page.addInitScript(address => {
    window.ethereum = {
      isMetaMask: true,
      on: () => {},
      request: async ({ method }) => {
        if (method === "eth_accounts") return window.connected ? [address] : [];
        if (method === "eth_chainId") return "0xaa36a7";
        if (method === "eth_requestAccounts") { window.connected = true; return [address]; }
        throw new Error(`Unexpected request: ${method}`);
      }
    };
  }, account);
  await page.goto(`${origin}/bills`);
  await expect(page.locator("#wallet-help")).toHaveCount(0);
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  await expect(page.locator("#wallet-note")).toHaveText("Wallet connected");
  await expect(page).toHaveURL(`${origin}/bills`);
  await context.close();
});

test("desktop without MetaMask gives extension instructions without a mobile redirect", async ({ page }) => {
  await serveWalletPage(page);
  await page.goto(`${origin}/bills`);
  await page.getByRole("button", { name: "Connect wallet", exact: true }).click();
  await expect(page.locator("#wallet-note")).toContainText("Install the MetaMask browser extension");
  await expect(page.locator("#wallet-help")).toHaveCount(0);
});
