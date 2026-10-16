const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.DEPLOY_TOOL_PORT || 3001);
const files = new Map([
  ["/", { path: path.join(root, "tools/deploy.html"), type: "text/html; charset=utf-8" }],
  ["/ethers.min.js", { path: path.join(root, "public/vendor/ethers.min.js"), type: "application/javascript; charset=utf-8" }],
  ["/artifact.json", { path: path.join(root, "artifacts/contracts/ClearBill.sol/ClearBill.json"), type: "application/json; charset=utf-8" }]
]);

/** Serves only the audited build and local deployment page on loopback. */
function handle(request, response) {
  const file = files.get(request.url);
  if (request.method !== "GET" || !file) { response.writeHead(404); response.end("Not found"); return; }
  try {
    const body = fs.readFileSync(file.path);
    response.writeHead(200, {
      "content-type": file.type,
      "content-length": body.length,
      "cache-control": "no-store",
      "content-security-policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; connect-src 'self' https:; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'"
    });
    response.end(body);
  } catch { response.writeHead(503); response.end("Run npm run build first."); }
}

http.createServer(handle).listen(port, "127.0.0.1", () => {
  console.log(`Local deployment tool: http://127.0.0.1:${port}`);
});
