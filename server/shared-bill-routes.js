const { Router } = require("express");
const { ApiError } = require("./chain");
const { decimal, address, resolveSnapshot } = require("./routes");

/** Adds bounded read-only endpoints for the separately deployed shared ledger. */
function createSharedRoutes(shared, chain, config) {
  const router = Router();

  /** Returns one shared bill at a verified chain snapshot. */
  router.get("/shared-bills/:billId", async (request, response, next) => {
    try {
      const id = decimal(request.params.billId, "billId");
      const snapshot = await resolveSnapshot(request.query, chain);
      const bill = await shared.readBill(id, snapshot);
      await chain.checkSnapshot(snapshot);
      response.json({ bill, snapshot });
    } catch (error) { next(error); }
  });

  /** Lists shared bills for an account and explicit payee or payer role. */
  router.get("/accounts/:address/shared-bills", async (request, response, next) => {
    try {
      const account = address(request.params.address);
      const role = request.query.role;
      if (role !== "payee" && role !== "payer") throw new ApiError(400, "INVALID_ARGUMENT", "Role must be payee or payer.", "role");
      const offset = decimal(request.query.offset ?? "0", "offset");
      const limit = Number(decimal(request.query.limit ?? "20", "limit", 50));
      if (limit < 1) throw new ApiError(400, "INVALID_ARGUMENT", "Limit must be between 1 and 50.", "limit");
      const snapshot = await resolveSnapshot(request.query, chain);
      const result = await shared.readAccountBills(account, role, offset, limit, snapshot);
      await chain.checkSnapshot(snapshot);
      response.json(result);
    } catch (error) { next(error); }
  });

  /** Returns a bounded window of confirmed events for one shared bill. */
  router.get("/shared-bills/:billId/history", async (request, response, next) => {
    try {
      const id = decimal(request.params.billId, "billId");
      const snapshot = await resolveSnapshot(request.query, chain);
      await shared.readBill(id, snapshot);
      const upper = request.query.beforeBlock === undefined ? snapshot.blockNumber : Number(decimal(request.query.beforeBlock, "beforeBlock", snapshot.blockNumber));
      if (upper < config.shared.deploymentBlock || upper > snapshot.blockNumber) throw new ApiError(400, "INVALID_ARGUMENT", "Invalid beforeBlock.", "beforeBlock");
      const result = await shared.readHistory(id, upper);
      await chain.checkSnapshot(snapshot);
      response.json({ items: result.items, nextBeforeBlock: result.nextUpperBlock, complete: result.nextUpperBlock === null, snapshot });
    } catch (error) { next(error); }
  });

  /** Checks a shared-bill transaction receipt against its contract event. */
  router.get("/shared-transactions/:hash", async (request, response, next) => {
    try {
      if (!/^0x[\da-fA-F]{64}$/.test(request.params.hash)) throw new ApiError(400, "INVALID_ARGUMENT", "Invalid transaction hash.", "hash");
      response.json(await shared.readTransaction(request.params.hash));
    } catch (error) { next(error); }
  });

  return router;
}

module.exports = { createSharedRoutes };
