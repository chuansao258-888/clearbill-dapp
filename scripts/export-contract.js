const fs = require("node:fs");
const path = require("node:path");
const esbuild = require("esbuild");

/** Exports both contract interfaces and the browser bundle from locked dependencies. */
async function main() {
  const artifact = require("../artifacts/contracts/ClearBill.sol/ClearBill.json");
  const target = path.join(__dirname, "../.local/ClearBill.abi.json");
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(artifact.abi, null, 2)}\n`);
  const abiDir = path.join(__dirname, "../abi");
  fs.mkdirSync(abiDir, { recursive: true });
  for (const name of ["ClearBill", "SharedBill"]) {
    const compiled = require(`../artifacts/contracts/${name}.sol/${name}.json`);
    fs.writeFileSync(path.join(abiDir, `${name}.abi.json`), `${JSON.stringify(compiled.abi, null, 2)}\n`);
  }
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
