import { api, snapshotQuery, errorText } from "./api.js";
import { boot, billCard } from "./ui.js";

const list = document.querySelector("#bill-list");
const status = document.querySelector("#page-status");
const progress = document.querySelector("#list-progress");
const more = document.querySelector("#load-more");
let account = null, role = "payee", snapshot = null, offset = "0", total = "0", loaded = [], generation = 0;

/** Applies the selected status to the bills already loaded from the chain. */
function render() {
  const filter = document.querySelector("#status-filter").value;
  const shown = loaded.filter(bill => filter === "All" || (filter === "Overdue" ? bill.isOverdue : bill.status === filter));
  list.replaceChildren(...shown.map(bill => billCard(bill, role === "payee" ? "payer" : "payee")));
  if (!shown.length) progress.textContent = offset === null ? "No bills match these filters." : "No loaded bills match. Load more to continue searching.";
  else progress.textContent = `${loaded.length} of ${total} ${role === "payee" ? "issued" : "payable"} bills loaded. ${offset === null ? "Complete." : "Filters cover loaded bills only."}`;
  more.hidden = offset === null || !account;
}

/** Loads the next newest account bill page at one fixed chain snapshot. */
async function loadPage() {
  if (!account || offset === null) return;
  const currentGeneration = generation;
  const currentAccount = account;
  const currentRole = role;
  more.disabled = true;
  try {
    if (!snapshot) snapshot = (await api("/snapshot")).snapshot;
    if (currentGeneration !== generation) return;
    const page = await api(`/accounts/${currentAccount}/bills?role=${currentRole}&offset=${offset}&limit=20&${snapshotQuery(snapshot)}`);
    if (currentGeneration !== generation) return;
    loaded.push(...page.items);
    offset = page.nextOffset;
    total = page.total;
    status.textContent = "";
    render();
  } catch (error) { if (currentGeneration === generation) status.textContent = errorText(error); }
  finally { more.disabled = false; }
}

/** Clears account-specific state before a new list query. */
function resetList() { generation++; snapshot = null; offset = "0"; total = "0"; loaded = []; list.replaceChildren(); more.hidden = true; }

more.addEventListener("click", loadPage);
document.querySelector("#status-filter").addEventListener("change", render);
document.querySelector("#role").addEventListener("change", event => { role = event.target.value; resetList(); loadPage(); });
document.addEventListener("DOMContentLoaded", async () => {
  await boot(next => { account = next; resetList(); if (account) loadPage(); else progress.textContent = "Connect a wallet to view your bills."; });
});
