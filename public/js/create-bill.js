import { boot, review, localTime } from "./ui.js";
import { parseAmount, eth, labelBytes } from "./amounts.js";
import { sendOperation } from "./transactions.js";
import { currentWallet, requireWalletNetwork } from "./wallet.js";
import { errorText, api } from "./api.js";

const form = document.querySelector("#bill-form");
const status = document.querySelector("#page-status");
const errorNode = document.querySelector("#form-error");
let config;
const discardButton = document.querySelector("#discard-draft");

/** Parses a local form datetime into a valid Unix-second deadline. */
function deadline(value, label) {
  const millis = new Date(value).getTime();
  if (!value || !Number.isFinite(millis)) throw new Error(`Enter a valid ${label}.`);
  const seconds = Math.floor(millis / 1000);
  if (seconds <= Math.floor(Date.now() / 1000) + 30) throw new Error(`${label} must be in the future.`);
  return seconds;
}

/** Reads and checks all bill terms before opening wallet approval. */
function terms(account) {
  const { getAddress } = window.ClearBillEthers;
  let payer;
  try { payer = getAddress(form.payer.value.trim()); }
  catch { throw new Error("Enter a valid client wallet address."); }
  if (payer === window.ClearBillEthers.ZeroAddress || payer.toLowerCase() === account?.toLowerCase() || payer.toLowerCase() === config.contractAddress.toLowerCase()) throw new Error("Client address must differ from the payee and contract.");
  const label = form.label.value.trim();
  if (!label || labelBytes(label) > 80) throw new Error("Enter a public label of 1–80 UTF-8 bytes.");
  const count = Number(form.count.value);
  const first = parseAmount(form.amountOne.value.trim());
  const dueOne = deadline(form.dueOne.value, "first deadline");
  const second = count === 2 ? parseAmount(form.amountTwo.value.trim()) : 0n;
  const dueTwo = count === 2 ? deadline(form.dueTwo.value, "balance deadline") : 0;
  if (count === 2 && dueTwo <= dueOne) throw new Error("Balance deadline must be after the deposit deadline.");
  return { payer, label, count, amounts: [first, second], due: [dueOne, dueTwo] };
}

/** Updates two-payment fields and their native required validation. */
function updateSchedule() {
  const two = form.count.value === "2";
  document.querySelector("#second-fields").hidden = !two;
  form.amountTwo.required = two;
  form.dueTwo.required = two;
}

/** Shows the byte count used by on-chain label validation. */
function updateLabelCount() {
  document.querySelector("#label-count").textContent = `${labelBytes(form.label.value)} / 80 UTF-8 bytes. Public on-chain; do not enter personal details.`;
}

/** Recovers a possible prior submission before creating another bill. */
async function recoverReference(account, reference, intended) {
  const { BrowserProvider, Contract } = window.ClearBillEthers;
  const provider = new BrowserProvider(window.ethereum);
  const contract = new Contract(config.contractAddress, config.abi, provider);
  const id = await contract.getBillIdByReference(account, reference);
  if (id === 0n) return null;
  const existing = (await api(`/bills/${id}`)).bill;
  if (existing.payer.toLowerCase() !== intended.payer.toLowerCase() || existing.label !== intended.label || existing.installmentCount !== intended.count || existing.installments.some((part, index) => part.amountWei !== intended.amounts[index].toString() || part.dueAt !== intended.due[index])) {
    throw new Error("The saved submission reference belongs to different terms. Discard the saved draft before creating a new bill.");
  }
  return id.toString();
}

/** Validates, reviews and submits a bill with a stable creation reference. */
async function submit(event) {
  event.preventDefault();
  errorNode.textContent = "";
  if (!config) return;
  const button = form.querySelector("button[type=submit]");
  try {
    const account = await currentWallet();
    if (!account) throw new Error("Connect MetaMask before creating a bill.");
    const intended = terms(account);
    await requireWalletNetwork();
    const scope = `${config.chainId}:${config.contractAddress}:${account.toLowerCase()}`;
    const saved = JSON.parse(sessionStorage.getItem("clearbill-draft") || "null");
    const signature = JSON.stringify({ scope, payer: intended.payer, label: intended.label, count: intended.count, amounts: intended.amounts.map(String), due: intended.due });
    if (saved && saved.signature !== signature) throw new Error("A previous submission is unresolved. Restore its terms or discard the saved draft before changing them.");
    const reference = saved?.reference || window.ClearBillEthers.hexlify(crypto.getRandomValues(new Uint8Array(32)));
    const confirmedId = await recoverReference(account, reference, intended);
    if (confirmedId) { sessionStorage.removeItem("clearbill-draft"); window.location.href = `/bills/${confirmedId}`; return; }
    const lines = [`Payee: ${account}`, `Payer: ${intended.payer}`, `Public label: ${intended.label}`, `Total: ${eth(intended.amounts[0] + intended.amounts[1])}`, `First due: ${localTime(intended.due[0])}`, ...(intended.count === 2 ? [`Balance: ${eth(intended.amounts[1])} due ${localTime(intended.due[1])}`] : []), "Terms cannot be edited. This request does not prove a client accepted a debt."];
    if (!await review("Review public bill", lines, "Create bill")) return;
    sessionStorage.setItem("clearbill-draft", JSON.stringify({ signature, reference, fields: Object.fromEntries(new FormData(form)) }));
    discardButton.hidden = false;
    button.disabled = true;
    const result = await sendOperation(config, "createBill", [intended.payer, intended.label, intended.count, intended.amounts, intended.due, reference], 0n, text => { status.textContent = text; }, { reference });
    if (result.state === "confirmed") {
      sessionStorage.removeItem("clearbill-draft");
      window.location.href = `/bills/${result.billId}`;
    }
  } catch (error) { errorNode.textContent = errorText(error); }
  finally { button.disabled = false; }
}

form.count.addEventListener("change", updateSchedule);
form.label.addEventListener("input", updateLabelCount);
form.addEventListener("submit", submit);
discardButton.addEventListener("click", async () => {
  if (!await review("Discard saved bill draft", ["A submitted transaction may still confirm. Check Activity before creating a replacement."], "Discard draft")) return;
  sessionStorage.removeItem("clearbill-draft");
  discardButton.hidden = true;
  status.textContent = "Saved draft discarded. Existing blockchain transactions are unaffected.";
});
document.addEventListener("DOMContentLoaded", async () => {
  config = await boot();
  try {
    const saved = JSON.parse(sessionStorage.getItem("clearbill-draft") || "null");
    if (saved?.fields && saved?.reference) {
      for (const [name, value] of Object.entries(saved.fields)) {
        const field = form.elements.namedItem(name);
        if (field) field.value = value;
      }
      discardButton.hidden = false;
      status.textContent = "A previous bill submission was saved. Review it and check Activity before retrying.";
    }
  } catch { sessionStorage.removeItem("clearbill-draft"); }
  updateSchedule();
  updateLabelCount();
});
