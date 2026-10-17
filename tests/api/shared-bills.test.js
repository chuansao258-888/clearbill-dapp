const test = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../../server/app");

/** Sends one isolated HTTP request through both configured ledger routers. */
async function request(path, overrides = {}) {
  const snapshot = { blockNumber: 10, blockHash: `0x${"a".repeat(64)}`, timestamp: 1000 };
  const chain = {
    verifyDeployment: async () => {}, getSnapshot: async () => snapshot, checkSnapshot: async () => {},
    provider: { getBlock: async () => ({ hash: snapshot.blockHash, timestamp: snapshot.timestamp }) }
  };
  const shared = {
    verifyDeployment: async () => {}, readBill: async id => ({ id: id.toString() }),
    readAccountBills: async () => ({ items: [], nextOffset: null, total: "0", snapshot }),
    readHistory: async () => ({ items: [], nextUpperBlock: null }),
    readTransaction: async hash => ({ hash, state: "unknown" }), ...overrides
  };
  const config = {
    chainId: 31337, contractAddress: "0x0000000000000000000000000000000000000001", deploymentBlock: 1, abi: [],
    shared: { contractAddress: "0x0000000000000000000000000000000000000002", deploymentBlock: 2, abi: [] }
  };
  const server = createApp(chain, config, shared).listen(0);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`);
    return { status: response.status, body: await response.json() };
  } finally { await new Promise(resolve => server.close(resolve)); }
}

test("shared bill endpoints reject malformed IDs, roles, addresses and page sizes", async () => {
  assert.equal((await request("/shared-bills/-1")).status, 400);
  assert.equal((await request("/accounts/bad/shared-bills?role=payee")).status, 400);
  assert.equal((await request("/accounts/0x0000000000000000000000000000000000000001/shared-bills?role=other")).status, 400);
  assert.equal((await request("/accounts/0x0000000000000000000000000000000000000001/shared-bills?role=payer&limit=51")).status, 400);
  assert.equal((await request("/shared-transactions/bad")).status, 400);
});

test("shared history rejects an out-of-range scan and preserves an empty valid result", async () => {
  assert.equal((await request("/shared-bills/1/history?beforeBlock=1")).status, 400);
  const result = await request("/shared-bills/1/history");
  assert.equal(result.status, 200);
  assert.equal(result.body.complete, true);
  assert.deepEqual(result.body.items, []);
});

test("a shared deployment failure prevents the API from reporting readiness", async () => {
  const result = await request("/health", { verifyDeployment: async () => { throw new Error("wrong shared code"); } });
  assert.equal(result.status, 503);
  assert.equal(result.body.error.code, "CHAIN_UNAVAILABLE");
});
