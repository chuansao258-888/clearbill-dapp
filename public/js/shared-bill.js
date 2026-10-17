import { api, errorText } from "./api.js";
import { boot, localTime, review } from "./ui.js";
import { eth } from "./amounts.js";
import { sendOperation } from "./transactions.js";

const id = window.location.pathname.split("/").pop();
const status = document.querySelector("#page-status");
const details = document.querySelector("#bill-details");
const shares = document.querySelector("#payer-shares");
const actions = document.querySelector("#bill-actions");
const note = document.querySelector("#action-note");
const history = document.querySelector("#bill-history");
const more = document.querySelector("#history-more");
let config, bill, account, historySnapshot, beforeBlock;

/** Adds a labelled summary field using safe text nodes. */
function row(label, value, className = "") {
  const wrapper = document.createElement("div"); wrapper.className = "row";
  const name = document.createElement("span"); name.textContent = label;
  const content = document.createElement("strong"); content.textContent = value; content.className = className;
  wrapper.append(name, content); return wrapper;
}

/** Displays the bill total and every payer's independent schedule. */
function renderBill() {
  document.querySelector("#bill-title").textContent = bill.label;
  details.replaceChildren(row("Shared bill ID", bill.id), row("Status", bill.isOverdue ? `${bill.status} · Overdue` : bill.status),
    row("Total", eth(bill.totalAmountWei)), row("Paid", eth(bill.paidAmountWei)),
    row("Refunded", eth(bill.refundedAmountWei)), row("Remaining", eth(bill.outstandingWei)),
    row("Payee", bill.payee, "address"));
  shares.replaceChildren(...bill.payers.map((payer, index) => {
    const panel = document.createElement("div"); panel.className = "panel";
    const heading = document.createElement("strong"); heading.textContent = `Payer ${index + 1}`;
    panel.append(heading, row("Wallet", payer.address, "address"), row("Share", eth(payer.shareWei)),
      row("Paid", eth(payer.paidWei)), row("Remaining", eth(payer.outstandingWei)),
      ...payer.installments.map(part => row(`Installment ${part.index + 1}`, `${eth(part.amountWei)} · ${part.paid ? "Paid" : `Due ${localTime(part.dueAt)}`}`)));
    return panel;
  }));
}

/** Shows only the connected payer's next installment or payee actions. */
function renderActions() {
  actions.replaceChildren();
  if (!account) { note.textContent = "Connect an authorized wallet to act on this bill."; return; }
  const payer = bill.payers.find(item => item.address.toLowerCase() === account.toLowerCase());
  const payee = account.toLowerCase() === bill.payee.toLowerCase();
  if (payer?.nextInstallment) {
    const part = payer.nextInstallment;
    const button = document.createElement("button"); button.className = "primary"; button.textContent = `Pay my installment ${part.index + 1}`;
    button.addEventListener("click", () => act("payInstallment", [id, part.index], BigInt(part.amountWei), [
      `From: ${payer.address}`, `Payee: ${bill.payee}`, `Principal: ${eth(part.amountWei)}`, `Due: ${localTime(part.dueAt)}`, "MetaMask will show a separate gas fee."
    ])); actions.append(button);
  }
  if (payee && bill.status === "Open") {
    const button = document.createElement("button"); button.textContent = "Cancel unpaid bill";
    button.addEventListener("click", () => act("cancelBill", [id], 0n, ["No payer has paid. This bill will close; its terms and history remain public."])); actions.append(button);
  }
  if (payee && (bill.status === "PartiallyPaid" || bill.status === "Paid")) {
    const button = document.createElement("button"); button.textContent = `Refund all ${eth(bill.paidAmountWei)}`;
    const lines = [`You fund ${eth(bill.paidAmountWei)} plus gas.`, ...bill.payers.filter(payer => BigInt(payer.paidWei) > 0n).map(payer => `${payer.address} receives ${eth(payer.paidWei)}`), "If any recipient rejects ETH, the entire refund fails. Any unpaid remainder closes."];
    button.addEventListener("click", () => act("refundBill", [id, bill.paidAmountWei], BigInt(bill.paidAmountWei), lines)); actions.append(button);
  }
  note.textContent = actions.children.length ? "Check every address and amount before approving in MetaMask." : "There is no action available for this wallet and bill state.";
}

/** Rechecks the bill before presenting and sending a financial action. */
async function act(method, args, value, lines) {
  try {
    const fresh = (await api(`/shared-bills/${id}`)).bill;
    if (fresh.status !== bill.status || fresh.paidAmountWei !== bill.paidAmountWei || fresh.refundedAmountWei !== bill.refundedAmountWei) {
      bill = fresh; renderBill(); renderActions(); throw new Error("The bill changed. Review the updated terms before trying again.");
    }
    if (!await review(method === "refundBill" ? "Review group refund" : "Review shared bill action", lines, method === "refundBill" ? "Fund refund" : "Confirm")) return;
    [...actions.querySelectorAll("button")].forEach(button => { button.disabled = true; });
    const result = await sendOperation(config, method, args, value, text => { status.textContent = text; }, { billId: id }, "shared");
    if (result.state === "confirmed") await loadBill();
  } catch (error) { status.textContent = errorText(error); }
  finally { if (bill) renderActions(); }
}

/** Reloads confirmed contract state and restarts the event timeline. */
async function loadBill() {
  try {
    bill = (await api(`/shared-bills/${id}`)).bill;
    renderBill(); renderActions();
    historySnapshot = null; beforeBlock = null; history.replaceChildren(); await loadHistory();
  } catch (error) { status.textContent = errorText(error); }
}

/** Reads one bounded block window of confirmed bill events. */
async function loadHistory() {
  try {
    const query = new URLSearchParams();
    if (historySnapshot) {
      query.set("blockNumber", historySnapshot.blockNumber); query.set("blockHash", historySnapshot.blockHash);
      if (beforeBlock !== null) query.set("beforeBlock", beforeBlock);
    }
    const page = await api(`/shared-bills/${id}/history?${query}`);
    for (const item of page.items) {
      const card = document.createElement("div"); card.className = "panel";
      const title = document.createElement("strong"); title.textContent = `${item.type} · ${item.amountWei === null ? "No transfer" : eth(item.amountWei)}`;
      const meta = document.createElement("p"); meta.textContent = `${localTime(item.timestamp)} · block ${item.blockNumber}`;
      const actor = document.createElement("p"); actor.className = "address"; actor.textContent = item.payer || item.payee;
      const hash = document.createElement("code"); hash.className = "address"; hash.textContent = item.transactionHash;
      card.append(title, meta, actor, hash); history.append(card);
    }
    historySnapshot = page.snapshot; beforeBlock = page.nextBeforeBlock; more.hidden = page.complete;
    if (!history.children.length && page.complete) history.textContent = "No confirmed activity for this bill.";
  } catch (error) { status.textContent = errorText(error); }
}

more.addEventListener("click", loadHistory);
document.addEventListener("DOMContentLoaded", async () => {
  config = await boot(next => { account = next; if (bill) renderActions(); });
  if (config?.shared) await loadBill(); else status.textContent = "Shared bills are not deployed on this network yet.";
});
