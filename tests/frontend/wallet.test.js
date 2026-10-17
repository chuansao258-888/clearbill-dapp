const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
let sequence = 0;

/** Loads a fresh wallet module with a controlled browser environment. */
async function walletModule(options = {}) {
  global.window = {
    ClearBillEthers: require("ethers"),
    navigator: { userAgent: options.userAgent || "iPhone", platform: options.platform || "", maxTouchPoints: options.maxTouchPoints || 0 },
    location: { href: options.href || "https://clearbill-dapp.onrender.com/shared-bills/1", assign: options.assign || (() => {}) },
    ethereum: options.provider
  };
  const source = fs.readFileSync(path.join(__dirname, "../../public/js/wallet.js"), "utf8");
  return import(`data:text/javascript,${encodeURIComponent(`${source}\n// test ${sequence++}`)}`);
}

test("iPhone, Android and desktop-mode iPad are detected without classifying desktops as mobile", async () => {
  for (const userAgent of ["Mozilla/5.0 (iPhone) CriOS/130", "Mozilla/5.0 (Linux; Android 15) Chrome/130", "iPad", "iPod"]) {
    const wallet = await walletModule({ userAgent });
    assert.equal(wallet.isMobileBrowser(), true);
  }
  assert.equal((await walletModule({ userAgent: "Macintosh", platform: "MacIntel", maxTouchPoints: 5 })).isMobileBrowser(), true);
  assert.equal((await walletModule({ userAgent: "Windows Chrome" })).isMobileBrowser(), false);
});

test("the app link retains the current bill path and URL parameters", async () => {
  const wallet = await walletModule({ href: "https://clearbill-dapp.onrender.com/bills/4?view=payer#receipt" });
  assert.equal(wallet.mobileWalletLink(), "https://link.metamask.io/dapp/clearbill-dapp.onrender.com/bills/4?view=payer#receipt");
});

test("a mobile browser without a provider opens MetaMask without claiming connection", async () => {
  let destination;
  const wallet = await walletModule({ assign: url => { destination = url; } });
  assert.equal(await wallet.currentWallet(), null);
  assert.equal(await wallet.connectWallet(), null);
  assert.equal(destination, "https://link.metamask.io/dapp/clearbill-dapp.onrender.com/shared-bills/1");
});

test("an injected mobile wallet requests account access without another app handoff", async () => {
  const requests = [];
  const wallet = await walletModule({
    provider: { isMetaMask: true, request: async request => { requests.push(request.method); return ["0x1234"]; } },
    assign: () => { throw new Error("Unexpected navigation"); }
  });
  assert.equal(await wallet.connectWallet(), "0x1234");
  assert.deepEqual(requests, ["eth_requestAccounts"]);
});

test("wallet rejection is preserved and an empty account response is rejected", async () => {
  let wallet = await walletModule({ provider: { isMetaMask: true, request: async () => { throw Object.assign(new Error("Rejected"), { code: 4001 }); } } });
  await assert.rejects(wallet.connectWallet(), { code: 4001 });
  wallet = await walletModule({ provider: { isMetaMask: true, request: async () => [] } });
  await assert.rejects(wallet.connectWallet(), /No wallet account/);
});

test("desktop without an extension and non-HTTPS mobile pages give actionable errors", async () => {
  let wallet = await walletModule({ userAgent: "Windows Chrome" });
  await assert.rejects(wallet.connectWallet(), /Install the MetaMask browser extension/);
  wallet = await walletModule({ href: "http://127.0.0.1:3000/bills/4" });
  await assert.rejects(wallet.connectWallet(), /public HTTPS website/);
});
