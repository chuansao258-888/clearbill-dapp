const { Router } = require("express");
const { getAddress } = require("ethers");
const { ApiError } = require("./chain");

/** Parses a bounded nonnegative decimal integer without lossy coercion. */
function decimal(value, field, maximum = null) {
  if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value)) throw new ApiError(400, "INVALID_ARGUMENT", `Invalid ${field}.`, field);
  const parsed = BigInt(value);
  if (maximum !== null && parsed > BigInt(maximum)) throw new ApiError(400, "INVALID_ARGUMENT", `Invalid ${field}.`, field);
  return parsed;
}

/** Validates a nonzero wallet address for a public account query. */
function address(value, field = "address") {
  try {
    const result = getAddress(value);
    if (result === "0x0000000000000000000000000000000000000000") throw new Error("zero");
    return result;
  } catch { throw new ApiError(400, "INVALID_ARGUMENT", `Invalid ${field}.`, field); }
}

/** Returns an unambiguous chain snapshot from supplied URL parameters. */
async function resolveSnapshot(query, chain) {
  if (query.blockNumber === undefined && query.blockHash === undefined) return chain.getSnapshot();
  if (query.blockNumber === undefined || query.blockHash === undefined) throw new ApiError(400, "INVALID_ARGUMENT", "Block number and hash must be supplied together.");
  const blockNumber = Number(decimal(query.blockNumber, "blockNumber", Number.MAX_SAFE_INTEGER));
  if (!/^0x[\da-fA-F]{64}$/.test(query.blockHash)) throw new ApiError(400, "INVALID_ARGUMENT", "Invalid blockHash.", "blockHash");
  const block = await chain.provider.getBlock(blockNumber);
  if (!block || block.hash !== query.blockHash) throw new ApiError(409, "SNAPSHOT_CHANGED", "The selected blockchain snapshot changed.");
  return { blockNumber, blockHash: block.hash, timestamp: block.timestamp };
}

/** Encodes public scan state without granting authorization. */
function makeCursor(value) { return Buffer.from(JSON.stringify(value)).toString("base64url"); }

/** Decodes and validates a bounded history cursor. */
function parseCursor(encoded) {
  if (typeof encoded !== "string" || encoded.length > 2048 || !/^[\w-]+$/.test(encoded)) throw new ApiError(400, "INVALID_CURSOR", "Invalid history cursor.");
  try {
    const data = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    if (data.version !== 1 || !Number.isSafeInteger(data.upperBlock) || !Number.isSafeInteger(data.snapshot?.blockNumber) || !/^0x[\da-fA-F]{64}$/.test(data.snapshot?.blockHash)) throw new Error("shape");
    return data;
  } catch { throw new ApiError(400, "INVALID_CURSOR", "Invalid history cursor."); }
}

/** Parses optional inclusive Unix-second history bounds. */
function time(value, field) {
  if (value === undefined) return null;
  return Number(decimal(value, field, Number.MAX_SAFE_INTEGER));
}

/** Attaches public read endpoints to the provided verified chain service. */
function createRoutes(chain, config) {
  const router = Router();
  router.get("/health", async (_request, response, next) => {
    try { await chain.verifyDeployment(); response.json({ status: "ready", chainReady: true }); }
    catch (error) { next(error); }
  });
  router.get("/config", async (_request, response, next) => {
    try {
      await chain.verifyDeployment();
      response.json({ chainId: config.chainId, chainName: config.chainId === 11155111 ? "Sepolia" : "Local Hardhat", currencySymbol: "ETH", contractAddress: config.contractAddress, deploymentBlock: config.deploymentBlock, explorerBaseUrl: config.explorerBaseUrl, abi: config.abi });
    } catch (error) { next(error); }
  });
  router.get("/snapshot", async (_request, response, next) => {
    try { response.json({ snapshot: await chain.getSnapshot() }); } catch (error) { next(error); }
  });
  router.get("/bills/:billId", async (request, response, next) => {
    try {
      const id = decimal(request.params.billId, "billId");
      const snapshot = await resolveSnapshot(request.query, chain);
      const bill = await chain.readBill(id, snapshot);
      await chain.checkSnapshot(snapshot);
      response.json({ bill, snapshot });
    } catch (error) { next(error); }
  });
  router.get("/accounts/:address/bills", async (request, response, next) => {
    try {
      const account = address(request.params.address);
      const role = request.query.role;
      if (role !== "payee" && role !== "payer") throw new ApiError(400, "INVALID_ARGUMENT", "Role must be payee or payer.", "role");
      const offset = decimal(request.query.offset ?? "0", "offset");
      const limit = Number(decimal(request.query.limit ?? "20", "limit", 50));
      if (limit < 1) throw new ApiError(400, "INVALID_ARGUMENT", "Limit must be between 1 and 50.", "limit");
      const snapshot = await resolveSnapshot(request.query, chain);
      const result = await chain.readAccountBills(account, role, offset, limit, snapshot);
      await chain.checkSnapshot(snapshot);
      response.json(result);
    } catch (error) { next(error); }
  });

  /** Scans one history window for an account or bill. */
  async function history(request, response, next, scope) {
    try {
      const type = request.query.type ?? "all";
      if (!["all", "created", "payment", "cancelled", "refund"].includes(type)) throw new ApiError(400, "INVALID_ARGUMENT", "Invalid history type.", "type");
      const fromTime = time(request.query.fromTime, "fromTime");
      const toTime = time(request.query.toTime, "toTime");
      if (fromTime !== null && toTime !== null && fromTime > toTime) throw new ApiError(400, "INVALID_ARGUMENT", "Start time exceeds end time.");
      const filters = { type, fromTime, toTime };
      const cursor = request.query.cursor ? parseCursor(request.query.cursor) : null;
      let snapshot, upperBlock;
      if (cursor) {
        if (JSON.stringify(cursor.scope) !== JSON.stringify(scope) || JSON.stringify(cursor.filters) !== JSON.stringify(filters) || cursor.chainId !== config.chainId || cursor.contractAddress !== config.contractAddress) throw new ApiError(400, "INVALID_CURSOR", "Cursor does not match this query.");
        snapshot = cursor.snapshot;
        upperBlock = cursor.upperBlock;
        if (upperBlock < config.deploymentBlock || upperBlock >= snapshot.blockNumber) throw new ApiError(400, "INVALID_CURSOR", "Cursor block is out of range.");
        await chain.checkSnapshot(snapshot);
      } else {
        snapshot = await chain.getSnapshot();
        upperBlock = snapshot.blockNumber;
      }
      if (scope.billId) {
        const bill = await chain.readBill(BigInt(scope.billId), snapshot);
        if (scope.address && bill.payee.toLowerCase() !== scope.address.toLowerCase() && bill.payer.toLowerCase() !== scope.address.toLowerCase()) {
          return response.json({ items: [], nextCursor: null, complete: true, snapshot });
        }
      }
      if (upperBlock < config.deploymentBlock) return response.json({ items: [], nextCursor: null, complete: true, snapshot });
      const result = await chain.readHistory(scope, filters, snapshot, upperBlock);
      await chain.checkSnapshot(snapshot);
      const nextCursor = result.nextUpperBlock === null ? null : makeCursor({ version: 1, chainId: config.chainId, contractAddress: config.contractAddress, scope, filters, snapshot, upperBlock: result.nextUpperBlock });
      response.json({ items: result.items, nextCursor, complete: result.complete, snapshot });
    } catch (error) { next(error); }
  }

  router.get("/accounts/:address/history", (request, response, next) => {
    try {
      const scope = { address: address(request.params.address) };
      if (request.query.billId !== undefined) scope.billId = decimal(request.query.billId, "billId").toString();
      history(request, response, next, scope);
    } catch (error) { next(error); }
  });
  router.get("/bills/:billId/history", (request, response, next) => {
    try { history(request, response, next, { billId: decimal(request.params.billId, "billId").toString() }); }
    catch (error) { next(error); }
  });
  router.get("/transactions/:hash", async (request, response, next) => {
    try {
      if (!/^0x[\da-fA-F]{64}$/.test(request.params.hash)) throw new ApiError(400, "INVALID_ARGUMENT", "Invalid transaction hash.", "hash");
      response.json(await chain.readTransaction(request.params.hash));
    } catch (error) { next(error); }
  });
  return router;
}

module.exports = { createRoutes, decimal, address };
