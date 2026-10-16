import { api, errorText } from "./api.js";
import { boot, localTime, review } from "./ui.js";
import { eth } from "./amounts.js";
import { sendOperation } from "./transactions.js";

const status = document.querySelector("#page-status");
const details = document.querySelector("#bill-details");
const actions = document.querySelector("#bill-actions");
const note = document.querySelector("#action-note");
const history = document.querySelector("#bill-history");
const more = document.querySelector("#history-more");
const id = window.location.pathname.split("/").pop();
let config, bill, account, cursor = null;

/** Adds one read-only field to the bill summary. */
function row(label, value, className = "") {
  const wrapper = document.createElement("div");
  wrapper.className = "row";
  const name = document.createElement("span"); name.textContent = label;
  const content = document.createElement("strong"); content.textContent = value; content.className = className;
  wrapper.append(name, content);
  return wrapper;
}

/** Displays public terms, paid principal and the active schedule. */
function renderBill() {
  document.querySelector("#bill-title").textContent = bill.label;
  details.replaceChildren(
    row("Bill ID", bill.id), row("Status", bill.isOverdue ? `${bill.status} · Overdue` : bill.status),
    row("Total", eth(bill.totalAmountWei)), row("Paid", eth(bill.paidAmountWei)),
    row("Refunded", eth(bill.refundedAmountWei)), row("Remaining", eth(bill.outstandingWei)),
    row("Payee", bill.payee, "address"), row("Payer", bill.payer, "address"),
    ...bill.installments.map(part => row(`Installment ${part.index + 1}`, `${eth(part.amountWei)} · ${part.paid ? "Paid" : `Due ${localTime(part.dueAt)}`}`))
  );
}

/** Chooses exactly the financial actions allowed by the current account state. */
function renderActions() {
  actions.replaceChildren();
  if (!account) { note.textContent = "Connect the authorized MetaMask account to act on this bill."; return; }
  const isPayer = account.toLowerCase() === bill.payer.toLowerCase();
  const isPayee = account.toLowerCase() === bill.payee.toLowerCase();
  if (isPayer && bill.nextInstallment) {
    const button = document.createElement("button"); button.className = "primary"; button.textContent = `Pay installment ${bill.nextInstallment.index + 1}`;
    button.addEventListener("click", () => act("payInstallment", "Pay next installment", [id, bill.nextInstallment.index], BigInt(bill.nextInstallment.amountWei), [`Payee: ${bill.payee}`, `Principal: ${eth(bill.nextInstallment.amountWei)}`, "MetaMask will show a separate network fee."]));
    actions.append(button);
  }
  if (isPayee && bill.status === "Open") {
    const button = document.createElement("button"); button.textContent = "Cancel unpaid bill";
    button.addEventListener("click", () => act("cancelBill", "Cancel bill", [id], 0n, ["This unpaid bill will close. Its terms and history remain public."]));
    actions.append(button);
  }
  if (isPayee && (bill.status === "PartiallyPaid" || bill.status === "Paid")) {
    const button = document.createElement("button"); button.textContent = `Refund ${eth(bill.paidAmountWei)}`;
    button.addEventListener("click", () => act("refundBill", "Review full refund", [id, bill.paidAmountWei], BigInt(bill.paidAmountWei), [`Original payer: ${bill.payer}`, `Refund principal: ${eth(bill.paidAmountWei)}`, "You fund this refund plus gas. Any unpaid balance will close."]));
    actions.append(button);
  }
  note.textContent = actions.children.length ? "Check every address and amount before approving in MetaMask." : "There is no action available for this account and bill state.";
}

/** Re-reads state, reviews exact terms and submits the requested contract method. */
async function act(method, title, args, value, lines) {
  try {
    const fresh = (await api(`/bills/${id}`)).bill;
    if (fresh.status !== bill.status || fresh.paidAmountWei !== bill.paidAmountWei) { bill = fresh; renderBill(); renderActions(); throw new Error("The bill changed. Review the updated terms before trying again."); }
    if (!await review(title, lines, method === "refundBill" ? "Fund refund" : "Confirm")) return;
    const result = await sendOperation(config, method, args, value, text => { status.textContent = text; }, { billId: id });
    if (result.state === "confirmed") await loadBill();
  } catch (error) { status.textContent = errorText(error); }
}

/** Loads the current bill and resets its receipt timeline. */
async function loadBill() {
  try {
    bill = (await api(`/bills/${id}`)).bill;
    renderBill(); renderActions();
    cursor = null; history.replaceChildren(); await loadHistory();
  } catch (error) { status.textContent = errorText(error); }
}

/** Adds one bounded block window of confirmed bill activity. */
async function loadHistory() {
  try {
    const path = `/bills/${id}/history${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`;
    const page = await api(path);
    for (const item of page.items) {
      const card = document.createElement("div"); card.className = "panel";
      const title = document.createElement("strong"); title.textContent = `${item.type} · ${item.amountWei === null ? "No transfer" : eth(item.amountWei)}`;
      const meta = document.createElement("p"); meta.textContent = `${localTime(item.timestamp)} · block ${item.blockNumber}`;
      const hash = document.createElement("code"); hash.className = "address"; hash.textContent = item.transactionHash;
      card.append(title, meta, hash); history.append(card);
    }
    cursor = page.nextCursor;
    more.hidden = !cursor;
    if (!history.children.length && !cursor) history.textContent = "No confirmed activity for this bill.";
  } catch (error) { status.textContent = errorText(error); }
}

more.addEventListener("click", loadHistory);
document.addEventListener("DOMContentLoaded", async () => {
  config = await boot(next => { account = next; if (bill) renderActions(); });
  if (config) await loadBill();
});
