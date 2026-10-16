const { defineConfig } = require("@playwright/test");

/** Uses the already started local ClearBill service for browser checks. */
module.exports = defineConfig({
  testDir: "./tests/browser",
  use: { baseURL: "http://127.0.0.1:3000", headless: true, viewport: { width: 390, height: 844 } },
  reporter: "list",
  timeout: 30000
});
