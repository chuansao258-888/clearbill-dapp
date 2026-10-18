const { BrowserProvider, Contract } = window.ClearBillEthers;
let configCache = null;

/** Stores the verified public deployment for transaction calls. */
export function setWalletConfig(config) { configCache = config; }

/** Returns the injected MetaMask provider when available. */
export function injectedWallet() { return window.ethereum?.isMetaMask ? window.ethereum : null; }

/** Detects phone and tablet browsers that may need to open the wallet app. */
export function isMobileBrowser() {
  const { userAgent = "", platform = "", maxTouchPoints = 0 } = window.navigator;
  return /Android|iPhone|iPad|iPod/i.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
}

/** Builds the official MetaMask app link for the current public HTTPS page. */
export function mobileWalletLink() {
  const page = new URL(window.location.href);
  if (page.protocol !== "https:") throw new Error("Open the public HTTPS website to use MetaMask on your phone.");
  return `https://link.metamask.io/dapp/${page.host}${page.pathname}${page.search}${page.hash}`;
}

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
  if (!injected) {
    if (!isMobileBrowser()) throw new Error("Install the MetaMask browser extension, then reload this page.");
    window.location.assign(mobileWalletLink());
    return null;
  }
  const accounts = await injected.request({ method: "eth_requestAccounts" });
  if (!accounts.length) throw new Error("No wallet account was selected.");
  return accounts[0];
}

/** Rejects the wrong wallet network before contract reads or signing. */
export async function requireWalletNetwork() {
  if (!configCache) throw new Error("The contract is not configured.");
  const injected = injectedWallet();
  if (!injected) throw new Error("Open this page in MetaMask to sign a transaction.");
  const network = await injected.request({ method: "eth_chainId" });
  if (BigInt(network) !== BigInt(configCache.chainId)) throw new Error(`Switch MetaMask to ${configCache.chainName} using the wallet button at the top, then try again.`);
  return injected;
}

/** Requests a network change without creating or resending a transaction. */
export async function switchWalletNetwork() {
  if (!configCache) throw new Error("The contract is not configured.");
  const injected = injectedWallet();
  if (!injected) throw new Error("Open this page in MetaMask to switch networks.");
  try {
    await injected.request({ method: "wallet_switchEthereumChain", params: [{ chainId: `0x${BigInt(configCache.chainId).toString(16)}` }] });
  } catch (error) {
    if (Number(error.code) === 4902) throw new Error(`Enable ${configCache.chainName} in MetaMask's network settings, then try again.`);
    throw error;
  }
}

/** Checks the network and obtains the account used for a financial action. */
export async function requireSigner(kind = "individual", progress = () => {}) {
  progress("Checking the MetaMask network…");
  const injected = await requireWalletNetwork();
  progress("Checking the connected MetaMask account…");
  const provider = new BrowserProvider(injected);
  const signer = await provider.getSigner();
  const target = kind === "shared" ? configCache.shared : configCache;
  if (!target) throw new Error("Shared bills are not deployed on this network yet.");
  return { signer, contract: new Contract(target.contractAddress, target.abi, signer) };
}

/** Provides an app link and a copy fallback when a mobile browser has no wallet. */
function mobileWalletHelp(note) {
  if (!note || !isMobileBrowser() || injectedWallet()) return null;
  const help = document.createElement("div");
  help.id = "wallet-help";
  help.className = "panel";
  const instructions = document.createElement("p");
  instructions.textContent = "Open this page in MetaMask, then tap Connect wallet there. If your browser blocks the app link, copy the page link and paste it into MetaMask's browser.";
  const actions = document.createElement("div");
  actions.className = "actions";
  const open = document.createElement("a");
  open.className = "button primary";
  open.textContent = "Open MetaMask";
  try { open.href = mobileWalletLink(); }
  catch (error) { instructions.textContent = error.message; open.hidden = true; }
  const copy = document.createElement("button");
  copy.type = "button";
  copy.textContent = "Copy page link";
  const status = document.createElement("p");
  status.className = "muted";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  copy.addEventListener("click", async () => {
    try {
      await window.navigator.clipboard.writeText(window.location.href);
      status.textContent = "Page link copied. Paste it into MetaMask's browser.";
    } catch {
      status.textContent = `Copy this address manually: ${window.location.href}`;
    }
  });
  actions.append(open, copy);
  help.append(instructions, actions, status);
  note.after(help);
  return help;
}

/** Updates the shared account control and refreshes data after wallet changes. */
export function mountWalletControl(onChange = () => {}) {
  const button = document.querySelector("#wallet-button");
  const note = document.querySelector("#wallet-note");
  if (!button) return;
  const help = mobileWalletHelp(note);
  let wrongNetwork = false;
  let revision = 0;
  /** Uses approved or event accounts directly and ignores older asynchronous reads. */
  const refresh = async (knownAccount = undefined) => {
    const currentRevision = ++revision;
    try {
      const account = knownAccount === undefined ? await currentWallet() : knownAccount;
      if (currentRevision !== revision) return;
      wrongNetwork = false;
      button.textContent = account ? `${account.slice(0, 6)}…${account.slice(-4)}` : "Connect wallet";
      const onBillDetail = /^\/(bills|shared-bills)\/\d+$/.test(window.location.pathname);
      if (help) help.hidden = Boolean(injectedWallet());
      if (note) note.textContent = account ? "Wallet connected" : help && !help.hidden ? "Connect wallet opens this page in MetaMask." : onBillDetail ? "Connect to manage this bill." : "Connect to view your bills";
      if (note && account) note.textContent = "Wallet connected. Checking network…";
      onChange(account);
      if (!account) return;
      const chainId = BigInt(await injectedWallet().request({ method: "eth_chainId" }));
      if (currentRevision !== revision) return;
      wrongNetwork = configCache && chainId !== BigInt(configCache.chainId);
      if (wrongNetwork) button.textContent = `Switch to ${configCache.chainName}`;
      if (note) note.textContent = wrongNetwork ? `Wallet connected to ${chainId === 1n ? "Ethereum Mainnet" : `chain ${chainId}`}. Switch to ${configCache.chainName} before creating or paying a bill.` : "Wallet connected";
    } catch (error) { if (currentRevision === revision && note) note.textContent = error.message; }
  };
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      if (wrongNetwork) { await switchWalletNetwork(); await refresh(); return; }
      const account = await connectWallet();
      if (account) await refresh(account);
      else if (note) note.textContent = "Opening MetaMask. If it does not open, use the options below.";
    }
    catch (error) { if (note) note.textContent = error.message; }
    finally { button.disabled = false; }
  });
  injectedWallet()?.on("accountsChanged", accounts => refresh(accounts[0] ?? null));
  injectedWallet()?.on("chainChanged", () => { onChange(null); window.location.reload(); });
  refresh();
}
