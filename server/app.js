const express = require("express");
const path = require("node:path");
const { ApiError } = require("./chain");
const { createRoutes } = require("./routes");
const { createSharedRoutes } = require("./shared-bill-routes");

/** Creates the static mobile site and read-only API with sanitized errors. */
function createApp(chain, config, shared = null) {
  const app = express();
  const root = path.join(__dirname, "../public");
  app.disable("x-powered-by");
  // Process liveness is separate from the strict blockchain readiness endpoint.
  app.get("/healthz", (_request, response) => response.json({ status: "ok" }));
  app.use("/api/v1", createRoutes(chain, config, shared));
  if (shared) app.use("/api/v1", createSharedRoutes(shared, chain, config));
  app.use(express.static(root));
  app.get("/", (_request, response) => response.sendFile(path.join(root, "index.html")));
  app.get("/bills", (_request, response) => response.sendFile(path.join(root, "bills.html")));
  app.get("/bills/new", (_request, response) => response.sendFile(path.join(root, "create-bill.html")));
  app.get("/shared-bills/new", (_request, response) => response.sendFile(path.join(root, "create-shared-bill.html")));
  app.get("/bills/:id", (_request, response) => response.sendFile(path.join(root, "bill.html")));
  app.get("/shared-bills/:id", (_request, response) => response.sendFile(path.join(root, "shared-bill.html")));
  app.get("/activity", (_request, response) => response.sendFile(path.join(root, "activity.html")));
  app.use((error, _request, response, _next) => {
    if (error instanceof ApiError) return response.status(error.status).json({ error: { code: error.code, message: error.message, field: error.field } });
    const message = String(error?.message || "");
    const timeout = /timeout|timed out/i.test(message);
    const limit = /too many results|response size|query returned more than|block range|limit exceeded/i.test(message);
    const status = timeout ? 504 : 503;
    const code = timeout ? "CHAIN_TIMEOUT" : limit ? "RPC_LIMIT" : "CHAIN_UNAVAILABLE";
    console.error(`${code}: ${error?.code || error?.name || "Error"}`);
    response.status(status).json({ error: { code, message: timeout ? "Blockchain request timed out." : limit ? "The blockchain provider rejected this query range." : "Blockchain data is currently unavailable.", field: null } });
  });
  return app;
}

module.exports = { createApp };
