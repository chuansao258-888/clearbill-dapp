const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

/** Loads the browser amount module with the same ethers interface it receives in a page. */
async function amountModule() {
  global.window = { ClearBillEthers: require("ethers") };
  const source = fs.readFileSync(path.join(__dirname, "../../public/js/amounts.js"), "utf8");
  return import(`data:text/javascript,${encodeURIComponent(source)}`);
}

test("ETH values retain exact wei including eighteen decimal places", async () => {
  const { parseAmount, eth } = await amountModule();
  assert.equal(parseAmount("0.000000000000000001"), 1n);
  assert.equal(parseAmount("12.345678901234567890"), 12345678901234567890n);
  assert.equal(eth(12345678901234567890n), "12.34567890123456789 ETH");
});

test("ambiguous, negative, zero and excessive precision inputs are rejected", async () => {
  const { parseAmount } = await amountModule();
  for (const value of ["0", "-1", "+1", "1e3", "1,000", "01", "0.0000000000000000001", "", " 1"]) {
    assert.throws(() => parseAmount(value), { message: /positive ETH amount|greater than zero/ });
  }
});

test("UTF-8 label bytes reflect the contract's limit", async () => {
  const { labelBytes } = await amountModule();
  assert.equal(labelBytes("A"), 1);
  assert.equal(labelBytes("支付"), 6);
});
