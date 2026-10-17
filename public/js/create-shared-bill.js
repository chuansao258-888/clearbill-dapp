import { boot, review, localTime } from "./ui.js";
import { parseAmount, eth, labelBytes } from "./amounts.js";
import { sendOperation } from "./transactions.js";
import { currentWallet } from "./wallet.js";
import { errorText, api } from "./api.js";

const form = document.querySelector("#shared-form");
const status = document.querySelector("#page-status");
const errorNode = document.querySelector("#form-error");
const discardButton = document.querySelector("#discard-draft");
let config;

/** Parses a local form time into a future Unix-second deadline. */
function deadline(value, field) {
  const millis = new Date(value).getTime();
  if (!value || !Number.isFinite(millis)) throw new Error(`Enter a valid ${field}.`);
  const seconds = Math.floor(millis / 1000);
  if (seconds <= Math.floor(Date.now() / 1000) + 30) throw new Error(`${field} must be in the future.`);
  return seconds;
}

/** Validates immutable shares, distinct wallets and the common schedule. */
function terms(account) {
  const { getAddress, ZeroAddress } = window.ClearBillEthers;
  const label = form.label.value.trim();
  if (!label || labelBytes(label) > 80) throw new Error("Enter a public label of 1–80 UTF-8 bytes.");
  const payerCount = Number(form.payerCount.value);
  const installmentCount = Number(form.installmentCount.value);
  const payers = [], amounts = [];
  for (let index = 1; index <= payerCount; index++) {
    let payer;
    try { payer = getAddress(form[`payer${index}`].value.trim()); }
    catch { throw new Error(`Enter a valid payer ${index} wallet address.`); }
    if (payer === ZeroAddress || payer.toLowerCase() === account.toLowerCase() || payer.toLowerCase() === config.shared.contractAddress.toLowerCase()) throw new Error(`Payer ${index} must differ from the payee and contract.`);
    payers.push(payer);
    amounts.push([parseAmount(form[`amount${index}1`].value.trim()), installmentCount === 2 ? parseAmount(form[`amount${index}2`].value.trim()) : 0n]);
  }
  if (new Set(payers.map(payer => payer.toLowerCase())).size !== payerCount) throw new Error("Each payer must use a different wallet address.");
  const dueOne = deadline(form.dueOne.value, "first due date");
  const dueTwo = installmentCount === 2 ? deadline(form.dueTwo.value, "balance due date") : 0;
  if (installmentCount === 2 && dueTwo <= dueOne) throw new Error("Balance due date must follow the first due date.");
  while (payers.length < 3) { payers.push(ZeroAddress); amounts.push([0n, 0n]); }
  return { label, payerCount, installmentCount, payers, amounts, due: [dueOne, dueTwo] };
}

/** Shows fields only for active payers and installments. */
function updateFields() {
  const third = form.payerCount.value === "3";
  const second = form.installmentCount.value === "2";
  document.querySelector("#third-payer").hidden = !third;
  document.querySelector("#second-deadline").hidden = !second;
  form.payer3.required = third; form.amount31.required = third; form.dueTwo.required = second;
  document.querySelectorAll("[data-second]").forEach((field, index) => {
    field.hidden = !second || (index === 2 && !third);
    field.querySelector("input").required = second && (index < 2 || third);
  });
}

/** Resolves a saved creation reference before any potential retry. */
async function recover(account, reference, intended) {
  const { BrowserProvider, Contract } = window.ClearBillEthers;
  const provider = new BrowserProvider(window.ethereum);
  const contract = new Contract(config.shared.contractAddress, config.shared.abi, provider);
  const id = await contract.getBillIdByReference(account, reference);
  if (id === 0n) return null;
  const existing = (await api(`/shared-bills/${id}`)).bill;
  if (existing.label !== intended.label || existing.payerCount !== intended.payerCount || existing.installmentCount !== intended.installmentCount
    || existing.payers.some((payer, index) => payer.address.toLowerCase() !== intended.payers[index].toLowerCase()
      || payer.installments.some((part, stage) => part.amountWei !== intended.amounts[index][stage].toString() || part.dueAt !== intended.due[stage]))) {
    throw new Error("The saved reference belongs to different terms. Discard the draft only after checking Activity.");
  }
  return id.toString();
}

/** Reviews public terms and submits one idempotent shared bill creation. */
async function submit(event) {
  event.preventDefault(); errorNode.textContent = "";
  const button = form.querySelector("button[type=submit]");
  try {
    if (!config?.shared) throw new Error("Shared bills are not deployed on this network yet.");
    const account = await currentWallet();
    if (!account) throw new Error("Connect MetaMask before creating a shared bill.");
    const value = terms(account);
    const scope = `${config.chainId}:${config.shared.contractAddress}:${account.toLowerCase()}`;
    const signature = JSON.stringify({ scope, label: value.label, payers: value.payers, amounts: value.amounts.map(row => row.map(String)), due: value.due });
    const saved = JSON.parse(sessionStorage.getItem("clearbill-shared-draft") || "null");
    if (saved && saved.signature !== signature) throw new Error("A previous submission is unresolved. Restore its terms or discard the saved draft after checking Activity.");
    const reference = saved?.reference || window.ClearBillEthers.hexlify(crypto.getRandomValues(new Uint8Array(32)));
    const known = await recover(account, reference, value);
    if (known) { sessionStorage.removeItem("clearbill-shared-draft"); window.location.href = `/shared-bills/${known}`; return; }
    const total = value.amounts.flat().reduce((sum, amount) => sum + amount, 0n);
    const lines = [`Payee: ${account}`, `Public label: ${value.label}`, ...value.payers.slice(0, value.payerCount).map((payer, index) => `Payer ${index + 1}: ${payer} · ${value.amounts[index].slice(0, value.installmentCount).map(eth).join(" then ")}`), `Total: ${eth(total)}`, `First due: ${localTime(value.due[0])}`, ...(value.installmentCount === 2 ? [`Balance due: ${localTime(value.due[1])}`] : []), "Each payer must approve their own installment. Every successful payment reaches your wallet immediately."];
    if (!await review("Review shared bill", lines, "Create bill")) return;
    sessionStorage.setItem("clearbill-shared-draft", JSON.stringify({ signature, reference, fields: Object.fromEntries(new FormData(form)) }));
    discardButton.hidden = false; button.disabled = true;
    const args = [value.payers, value.label, value.payerCount, value.installmentCount, value.amounts, value.due, reference];
    const result = await sendOperation(config, "createSharedBill", args, 0n, text => { status.textContent = text; }, { reference }, "shared");
    if (result.state === "confirmed") { sessionStorage.removeItem("clearbill-shared-draft"); window.location.href = `/shared-bills/${result.billId}`; }
  } catch (error) { errorNode.textContent = errorText(error); }
  finally { button.disabled = false; }
}

form.payerCount.addEventListener("change", updateFields);
form.installmentCount.addEventListener("change", updateFields);
form.label.addEventListener("input", () => { document.querySelector("#label-count").textContent = `${labelBytes(form.label.value)} / 80 UTF-8 bytes. Public on-chain.`; });
form.addEventListener("submit", submit);
discardButton.addEventListener("click", async () => {
  if (!await review("Discard saved draft", ["An earlier transaction may still confirm. Check Activity before creating another bill."], "Discard draft")) return;
  sessionStorage.removeItem("clearbill-shared-draft"); discardButton.hidden = true;
});
document.addEventListener("DOMContentLoaded", async () => {
  config = await boot();
  try {
    const saved = JSON.parse(sessionStorage.getItem("clearbill-shared-draft") || "null");
    if (saved?.fields && saved?.reference) {
      for (const [name, value] of Object.entries(saved.fields)) {
        const field = form.elements.namedItem(name); if (field) field.value = value;
      }
      discardButton.hidden = false;
      status.textContent = "A prior submission was saved. Check its status before retrying.";
    }
  } catch { sessionStorage.removeItem("clearbill-shared-draft"); }
  updateFields();
  if (!config?.shared) { status.textContent = "Shared bills are not deployed on this network yet."; form.querySelector("button[type=submit]").disabled = true; }
});
