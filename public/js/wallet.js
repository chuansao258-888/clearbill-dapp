const { BrowserProvider, Contract } = window.ClearBillEthers;
let configCache = null;

/** Stores the verified public deployment for transaction calls. */
export function setWalletConfig(config) { configCache = config; }

/** Returns the injected MetaMask provider when available. */
export function injectedWallet() { return window.ethereum?.isMetaMask ? window.ethereum : null; }

/** Reads an already exposed wallet without opening a permission prompt. */
export async function currentWallet() {
  const injected = injectedWallet();
  if (!injected) return null;
  const accounts = await injected.request({ method: "eth_accounts" });
  if (!accounts.length) return null;
  return accounts[0];
}

/** Requests account access from MetaMask after a direct user action. */
export async function connectWallet() {
  const injected = injectedWallet();
  if (!injected) throw new Error("Open this page in MetaMask to connect your wallet.");
  const accounts = await injected.request({ method: "eth_requestAccounts" });
  if (!accounts.length) throw new Error("No wallet account was selected.");
  return accounts[0];
}

/** Verifies the selected chain immediately before a financial action. */
export async function requireSigner(kind = "individual") {
  if (!configCache) throw new Error("The contract is not configured.");
  const injected = injectedWallet();
  if (!injected) throw new Error("Open this page in MetaMask to sign a transaction.");
  const network = await injected.request({ method: "eth_chainId" });
  if (BigInt(network) !== BigInt(configCache.chainId)) throw new Error(`Switch MetaMask to ${configCache.chainName}.`);
  const provider = new BrowserProvider(injected);
  const signer = await provider.getSigner();
  const target = kind === "shared" ? configCache.shared : configCache;
  if (!target) throw new Error("Shared bills are not deployed on this network yet.");
  return { signer, contract: new Contract(target.contractAddress, target.abi, signer) };
}

/** Updates the shared account control and refreshes data after wallet changes. */
export function mountWalletControl(onChange = () => {}) {
  const button = document.querySelector("#wallet-button");
  const note = document.querySelector("#wallet-note");
  if (!button) return;
  const refresh = async () => {
    try {
      const account = await currentWallet();
      button.textContent = account ? `${account.slice(0, 6)}…${account.slice(-4)}` : "Connect wallet";
      const onBillDetail = /^\/(bills|shared-bills)\/\d+$/.test(window.location.pathname);
      if (note) note.textContent = account ? "Wallet connected" : onBillDetail ? "Connect to manage this bill." : "Connect to view your bills";
      onChange(account);
    } catch (error) { if (note) note.textContent = error.message; }
  };
  button.addEventListener("click", async () => {
    try { await connectWallet(); await refresh(); }
    catch (error) { if (note) note.textContent = error.message; }
  });
  injectedWallet()?.on("accountsChanged", refresh);
  injectedWallet()?.on("chainChanged", () => { onChange(null); window.location.reload(); });
  refresh();
}
