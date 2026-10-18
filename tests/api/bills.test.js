const test = require("node:test");
const assert = require("node:assert/strict");
const { createApp } = require("../../server/app");

/** Runs an isolated Express request against a controlled chain service. */
async function request(path, service = {}) {
  const chain = {
    verifyDeployment: async () => {},
    getSnapshot: async () => ({ blockNumber: 10, blockHash: `0x${"a".repeat(64)}`, timestamp: 1000 }),
    checkSnapshot: async () => {},
    readAccountBills: async () => ({ items: [], nextOffset: null, total: "0", snapshot: { blockNumber: 10, blockHash: `0x${"a".repeat(64)}`, timestamp: 1000 } }),
    provider: { getBlock: async () => ({ hash: `0x${"a".repeat(64)}`, timestamp: 1000 }) },
    ...service
  };
  const server = createApp(chain, { chainId: 31337, contractAddress: "0x0000000000000000000000000000000000000001", deploymentBlock: 1, abi: [] }).listen(0);
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1${path}`);
    return { status: response.status, body: await response.json() };
  } finally { await new Promise(resolve => server.close(resolve)); }
}

test("account queries reject malformed addresses and pagination before RPC", async () => {
  assert.equal((await request("/accounts/invalid/bills?role=payee")).status, 400);
  assert.equal((await request("/accounts/0x0000000000000000000000000000000000000001/bills?role=other")).body.error.code, "INVALID_ARGUMENT");
  assert.equal((await request("/accounts/0x0000000000000000000000000000000000000001/bills?role=payee&limit=51")).status, 400);
  assert.equal((await request("/accounts/0x0000000000000000000000000000000000000001/bills?role=payee&offset=-1")).status, 400);
});

test("a legal empty account result remains distinct from RPC failure", async () => {
  const path = "/accounts/0x0000000000000000000000000000000000000001/bills?role=payee";
  const empty = await request(path);
  assert.equal(empty.status, 200);
  assert.deepEqual(empty.body.items, []);
  assert.equal(empty.body.nextOffset, null);
  const failed = await request(path, { readAccountBills: async () => { throw new Error("provider down"); } });
  assert.equal(failed.status, 503);
  assert.equal(failed.body.error.code, "CHAIN_UNAVAILABLE");
});

test("wrong deployment state is not reported as ready", async () => {
  const result = await request("/health", { verifyDeployment: async () => { throw new Error("wrong code"); } });
  assert.equal(result.status, 503);
  assert.equal(result.body.error.code, "CHAIN_UNAVAILABLE");
});

test("web liveness stays responsive while blockchain readiness fails", async () => {
  let calls = 0;
  const server = createApp({ verifyDeployment: async () => { calls++; throw new Error("RPC unavailable"); } }, {}).listen(0);
  try {
    const root = `http://127.0.0.1:${server.address().port}`;
    const alive = await fetch(`${root}/healthz`);
    assert.equal(alive.status, 200);
    assert.deepEqual(await alive.json(), { status: "ok" });
    assert.equal(calls, 0);
    const ready = await fetch(`${root}/api/v1/health`);
    assert.equal(ready.status, 503);
    assert.equal(calls, 1);
  } finally { await new Promise(resolve => server.close(resolve)); }
});
