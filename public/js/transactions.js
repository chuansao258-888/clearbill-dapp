import { api, errorText } from "./api.js";
import { requireSigner } from "./wallet.js";

const storageKey = "clearbill-submitted-v1";

/** Saves a scoped submitted hash for reconciliation after refresh. */
function remember(record) {
  try {
    const existing = JSON.parse(localStorage.getItem(storageKey) || "[]");
    localStorage.setItem(storageKey, JSON.stringify([record, ...existing].slice(0, 50)));
  } catch { /* The active transaction remains available in memory. */ }
}

/** Retrieves locally submitted hashes for the current chain, contract and account. */
export function remembered(config, account, kind = "individual") {
  try {
    const contractAddress = kind === "shared" ? config.shared?.contractAddress : config.contractAddress;
    return JSON.parse(localStorage.getItem(storageKey) || "[]").filter(item =>
      item.chainId === config.chainId && item.contractAddress === contractAddress && item.account?.toLowerCase() === account?.toLowerCase());
  } catch { return []; }
}

/** Waits for a verified API receipt without treating a hash as success. */
export async function checkTransaction(hash, progress, kind = "individual") {
  for (let attempt = 0; attempt < 30; attempt++) {
    const result = await api(`${kind === "shared" ? "/shared-transactions" : "/transactions"}/${hash}`);
    if (result.state === "confirmed" || result.state === "reverted") return result;
    progress(`Submitted ${hash.slice(0, 10)}… Awaiting confirmation (${result.state}).`);
    if (document.hidden) break;
    await new Promise(resolve => setTimeout(resolve, 4000));
  }
  return { state: "unknown", hash };
}

/** Reviews, signs, records and reconciles one contract write. */
export async function sendOperation(config, method, args, value, progress, details, kind = "individual") {
  document.querySelector("#page-status")?.scrollIntoView({ block: "center", behavior: "auto" });
  let submittedHash = null;
  let walletTimer = null;
  try {
    const { signer, contract } = await requireSigner(kind, progress);
    const account = await signer.getAddress();
    progress("Preparing the transaction. Check MetaMask for the approval request…");
    walletTimer = setTimeout(() => progress("MetaMask has not returned a transaction hash yet. Check its pending requests and network connection. Do not submit this action again while it is pending."), 15000);
    const tx = await contract[method](...args, { value });
    clearTimeout(walletTimer);
    submittedHash = tx.hash;
    remember({ chainId: config.chainId, contractAddress: kind === "shared" ? config.shared.contractAddress : config.contractAddress, account, hash: tx.hash, method, details, submittedAt: Date.now() });
    progress(`Submitted ${tx.hash}. Waiting for a verified receipt…`);
    const result = await checkTransaction(tx.hash, progress, kind);
    if (result.state === "confirmed") progress(`Confirmed in block ${result.blockNumber}.`);
    else if (result.state === "reverted") progress(`Transaction reverted. Hash: ${tx.hash}`);
    else progress(`Confirmation is not yet known. Save this hash: ${tx.hash}. Use Check status later; do not resubmit automatically.`);
    return result;
  } catch (error) {
    progress(submittedHash ? `Submitted ${submittedHash}. Status check failed: ${errorText(error)}. Do not resubmit automatically.` : errorText(error));
    throw error;
  } finally { clearTimeout(walletTimer); }
}
