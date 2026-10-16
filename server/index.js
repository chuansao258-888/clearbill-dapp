const { loadConfig } = require("./config");
const { createChain } = require("./chain");
const { createApp } = require("./app");

/** Starts one read-only API and static web server after configuration checks. */
async function main() {
  const config = loadConfig();
  const chain = createChain(config);
  await chain.verifyDeployment();
  createApp(chain, config).listen(config.port, () => console.log(`ClearBill listening on port ${config.port}`));
}

main().catch(error => { console.error(`Startup failed: ${error.message}`); process.exitCode = 1; });
