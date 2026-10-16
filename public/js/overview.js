import { api, allBills, errorText } from "./api.js";
import { boot, billCard } from "./ui.js";
import { eth } from "./amounts.js";

const status = document.querySelector("#page-status");
const progress = document.querySelector("#scan-progress");
const totals = document.querySelector("#totals");
const overdue = document.querySelector("#overdue");
let generation = 0;

/** Builds one dashboard metric after every relevant page has loaded. */
function stat(label, value) {
  const card = document.createElement("div");
  card.className = "panel stat";
  const caption = document.createElement("span");
  caption.textContent = label;
  const amount = document.createElement("strong");
  amount.textContent = eth(value);
  card.append(caption, amount);
  return card;
}

/** Aggregates issued bills from one canonical snapshot using exact integer sums. */
async function load(account) {
  const myGeneration = ++generation;
  totals.replaceChildren();
  overdue.replaceChildren();
  if (!account) { progress.textContent = "Connect a wallet to load totals."; return; }
  try {
    const snapshot = (await api("/snapshot")).snapshot;
    const issued = await allBills(account, "payee", snapshot, (count, total) => { if (myGeneration === generation) progress.textContent = `Scanning issued bills: ${count} of ${total}. Totals are loading.`; });
    if (myGeneration !== generation) return;
    const gross = issued.reduce((sum, bill) => sum + BigInt(bill.paidAmountWei), 0n);
    const refunds = issued.reduce((sum, bill) => sum + BigInt(bill.refundedAmountWei), 0n);
    const unpaid = issued.reduce((sum, bill) => sum + BigInt(bill.outstandingWei), 0n);
    totals.replaceChildren(stat("Gross received", gross), stat("Refunded", refunds), stat("Net received", gross - refunds), stat("Unpaid requests", unpaid));
    const late = issued.filter(bill => bill.isOverdue);
    overdue.replaceChildren(...late.slice(0, 5).map(bill => billCard(bill, "payer")));
    if (!late.length) { const empty = document.createElement("p"); empty.textContent = "No overdue requests."; overdue.append(empty); }
    progress.textContent = `Complete at block ${snapshot.blockNumber}. Unpaid requests are not verified debts.`;
    status.textContent = "";
  } catch (error) { if (myGeneration === generation) { status.textContent = errorText(error); progress.textContent = "Totals unavailable. Refresh to try again."; } }
}

document.addEventListener("DOMContentLoaded", async () => { await boot(load); });
