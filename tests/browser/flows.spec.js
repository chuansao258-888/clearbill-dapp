const { test, expect } = require("@playwright/test");
const { JsonRpcProvider } = require("ethers");
const fs = require("node:fs");
const { Contract, parseEther, hexlify, randomBytes } = require("ethers");
let smokeBillId;

/** Creates a paid local-chain bill used by the public read-only page check. */
test.beforeAll(async () => {
  const provider = new JsonRpcProvider("http://127.0.0.1:8545");
  const manifest = JSON.parse(fs.readFileSync(".local/deployment.json", "utf8"));
  const abi = JSON.parse(fs.readFileSync(".local/ClearBill.abi.json", "utf8"));
  const payee = await provider.getSigner(0);
  const payer = await provider.getSigner(1);
  const contract = new Contract(manifest.contractAddress, abi, payee);
  const block = await provider.getBlock("latest");
  const tx = await contract.createBill(await payer.getAddress(), "Local verification", 1, [parseEther("0.01"), 0], [block.timestamp + 3600, 0], hexlify(randomBytes(32)));
  await tx.wait();
  smokeBillId = (await contract.nextBillId()) - 1n;
  await (await contract.connect(payer).payInstallment(smokeBillId, 0, { value: parseEther("0.01") })).wait();
});

/** Adds a simulated injected wallet backed by disposable local-chain accounts. */
async function installLocalWallet(page, accountIndex) {
  const provider = new JsonRpcProvider("http://127.0.0.1:8545");
  const accounts = await provider.send("eth_accounts", []);
  await page.exposeFunction("__walletRpc", async ({ method, params }) => {
    if (method === "eth_accounts" || method === "eth_requestAccounts") return [accounts[accountIndex]];
    return provider.send(method, params || []);
  });
  await page.addInitScript(() => {
    window.ethereum = {
      isMetaMask: true,
      request: request => window.__walletRpc(request),
      on: () => {},
      removeListener: () => {}
    };
  });
  return accounts[accountIndex];
}

test("public bill details render on a narrow phone viewport", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`/bills/${smokeBillId}`);
  await expect(page.locator("#bill-title")).toHaveText("Local verification");
  await expect(page.locator("#bill-details .row:nth-child(2) strong")).toHaveText("Paid");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});

test("creation shows clear validation without a wallet", async ({ page }) => {
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/bills/new");
  await page.getByRole("button", { name: "Review and create" }).click();
  await expect(page.locator("#form-error")).toContainText("Connect MetaMask");
  expect(errors).toEqual([]);
});

test("simulated wallet connection and invalid amount are visible on mobile", async ({ page }) => {
  const provider = new JsonRpcProvider("http://127.0.0.1:8545");
  const accounts = await provider.send("eth_accounts", []);
  await installLocalWallet(page, 0);
  await page.goto("/bills/new");
  await expect(page.locator("#wallet-note")).toHaveText("Wallet connected");
  await page.locator("#payer").fill(accounts[1]);
  await page.locator("#label").fill("Invalid amount check");
  await page.locator("#amount-one").fill("0");
  await page.locator("#due-one").fill(new Date(Date.now() + 86_400_000).toISOString().slice(0, 16));
  await page.getByRole("button", { name: "Review and create" }).click();
  await expect(page.locator("#form-error")).toContainText("greater than zero");
  await page.screenshot({ path: "docs/evidence/local-invalid-amount-mobile.png" });
});

test("simulated wallets create and pay a one-payment bill on the local chain", async ({ browser }) => {
  const payeePage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const payerPage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const payer = await installLocalWallet(payerPage, 1);
  await installLocalWallet(payeePage, 0);
  const errors = [];
  payeePage.on("pageerror", error => errors.push(error.message));
  payerPage.on("pageerror", error => errors.push(error.message));
  await payeePage.goto("/bills/new");
  await payeePage.locator("#payer").fill(payer);
  await payeePage.locator("#label").fill("Browser flow check");
  await payeePage.locator("#amount-one").fill("0.01");
  await payeePage.locator("#due-one").fill(new Date(Date.now() + 86_400_000).toISOString().slice(0, 16));
  await payeePage.getByRole("button", { name: "Review and create" }).click();
  await expect(payeePage.getByRole("dialog")).toBeVisible();
  await payeePage.getByRole("button", { name: "Create bill", exact: true }).click();
  await expect(payeePage).toHaveURL(/\/bills\/\d+$/);
  const billUrl = payeePage.url();
  await payerPage.goto(billUrl);
  await payerPage.getByRole("button", { name: "Pay installment 1" }).click();
  await payerPage.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(payerPage.locator("#bill-details .row:nth-child(2) strong")).toHaveText("Paid", { timeout: 15000 });
  expect(errors).toEqual([]);
  await payeePage.close();
  await payerPage.close();
});

test("creator can cancel an unpaid bill and its history remains visible", async ({ page }) => {
  const provider = new JsonRpcProvider("http://127.0.0.1:8545");
  const accounts = await provider.send("eth_accounts", []);
  await installLocalWallet(page, 0);
  await page.goto("/bills/new");
  await page.locator("#payer").fill(accounts[1]);
  await page.locator("#label").fill("Cancellation check");
  await page.locator("#amount-one").fill("0.01");
  await page.locator("#due-one").fill(new Date(Date.now() + 86_400_000).toISOString().slice(0, 16));
  await page.getByRole("button", { name: "Review and create" }).click();
  await page.getByRole("button", { name: "Create bill", exact: true }).click();
  await expect(page).toHaveURL(/\/bills\/\d+$/);
  await page.getByRole("button", { name: "Cancel unpaid bill" }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.locator("#bill-details .row:nth-child(2) strong")).toHaveText("Cancelled", { timeout: 15000 });
  await expect(page.locator("#bill-history .panel")).toHaveCount(2);
});

test("simulated wallets pay a deposit and fund a full refund", async ({ browser }) => {
  const payeePage = await browser.newPage({ viewport: { width: 360, height: 780 } });
  const payerPage = await browser.newPage({ viewport: { width: 360, height: 780 } });
  const payer = await installLocalWallet(payerPage, 1);
  await installLocalWallet(payeePage, 0);
  await payeePage.goto("/bills/new");
  await payeePage.locator("#payer").fill(payer);
  await payeePage.locator("#label").fill("Deposit refund check");
  await payeePage.locator("#count").selectOption("2");
  await payeePage.locator("#amount-one").fill("0.01");
  await payeePage.locator("#amount-two").fill("0.02");
  await payeePage.locator("#due-one").fill(new Date(Date.now() + 86_400_000).toISOString().slice(0, 16));
  await payeePage.locator("#due-two").fill(new Date(Date.now() + 172_800_000).toISOString().slice(0, 16));
  await payeePage.getByRole("button", { name: "Review and create" }).click();
  await payeePage.getByRole("button", { name: "Create bill", exact: true }).click();
  await expect(payeePage).toHaveURL(/\/bills\/\d+$/);
  const url = payeePage.url();
  await payerPage.goto(url);
  await payerPage.getByRole("button", { name: "Pay installment 1" }).click();
  await payerPage.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(payerPage.locator("#bill-details .row:nth-child(2) strong")).toHaveText("PartiallyPaid", { timeout: 15000 });
  await payeePage.reload();
  await payeePage.getByRole("button", { name: /Refund 0.01 ETH/ }).click();
  await payeePage.getByRole("button", { name: "Fund refund" }).click();
  await expect(payeePage.locator("#bill-details .row:nth-child(2) strong")).toHaveText("Refunded", { timeout: 15000 });
  expect(await payeePage.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
  await payeePage.evaluate(() => window.scrollTo(0, 0));
  await payeePage.screenshot({ path: "docs/evidence/local-refund-mobile.png" });
  await payeePage.close();
  await payerPage.close();
});

test("mobile overview and activity show complete chain-derived results", async ({ page }) => {
  await installLocalWallet(page, 0);
  await page.goto("/");
  await expect(page.locator("#scan-progress")).toContainText("Complete at block", { timeout: 15000 });
  await expect(page.locator("#totals .stat")).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.goto("/activity");
  await expect(page.locator("#scan-progress")).toContainText("Full filtered history loaded", { timeout: 15000 });
  await expect(page.locator("#activity-list .panel").first()).toBeVisible();
  await expect(page.locator("#export-csv")).toBeVisible();
});
