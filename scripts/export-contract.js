const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");

/** Exports the compiled ABI and a browser bundle from locked dependencies. */
async function main() {
  const artifact = require("../artifacts/contracts/ClearBill.sol/ClearBill.json");
  const target = path.join(__dirname, "../.local/ClearBill.abi.json");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(artifact.abi, null, 2));
  await esbuild.build({
    entryPoints: [require.resolve("ethers")],
    bundle: true,
    minify: true,
    format: "iife",
    globalName: "ClearBillEthers",
    outfile: path.join(__dirname, "../public/vendor/ethers.min.js"),
    legalComments: "eof"
  });
}

main().catch(error => { console.error(error); process.exitCode = 1; });
