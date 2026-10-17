import { api, errorText } from "./api.js";
import { boot, localTime } from "./ui.js";
import { eth } from "./amounts.js";
import { remembered } from "./transactions.js";

const status = document.querySelector("#page-status");
const progress = document.querySelector("#scan-progress");
const list = document.querySelector("#activity-list");
const more = document.querySelector("#load-older");
const exportButton = document.querySelector("#export-csv");
let account = null, config = null, cursor = null, items = [], complete = false, filters = "";

/** Shows locally remembered hashes and lets the user recheck uncertain outcomes. */
function renderLocal() {
  const container = document.querySelector("#local-transactions");
  container.replaceChildren();
  if (!account || !config) return;
  for (const record of [...remembered(config, account, "shared"), ...remembered(config, account)]) {
    const kind = config.shared && record.contractAddress === config.shared.contractAddress ? "shared" : "individual";
    const card = document.createElement("div"); card.className = "panel";
    const label = document.createElement("p"); label.textContent = `${kind} · ${record.method} · ${record.hash}`; label.className = "address";
    const state = document.createElement("p"); state.textContent = "Submitted from this browser. Verify its current status.";
    const button = document.createElement("button"); button.textContent = "Check status";
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const result = await api(`${kind === "shared" ? "/shared-transactions" : "/transactions"}/${record.hash}`);
        state.textContent = `${result.state} · ${result.confirmations} confirmation(s)`;
      } catch (error) { state.textContent = errorText(error); }
      finally { button.disabled = false; }
    });
    card.append(label, state, button); container.append(card);
  }
}

/** Converts a local date to the inclusive boundary used by the history API. */
function dateBoundary(value, end) {
  if (!value) return null;
  const millis = new Date(`${value}T00:00:00`).getTime();
  if (!Number.isFinite(millis)) throw new Error("Enter a valid date.");
  return Math.floor(millis / 1000) + (end ? 86399 : 0);
}

/** Builds validated filter parameters for a fresh account scan. */
function readFilters() {
  const params = new URLSearchParams();
  const type = document.querySelector("#type").value;
  params.set("type", type);
  const billId = document.querySelector("#bill-id").value.trim();
  if (billId) {
    if (!/^[1-9]\d*$/.test(billId)) throw new Error("Bill ID must be a positive integer.");
    params.set("billId", billId);
  }
  const from = dateBoundary(document.querySelector("#from-date").value, false);
  const to = dateBoundary(document.querySelector("#to-date").value, true);
  if (from !== null) params.set("fromTime", String(from));
  if (to !== null) params.set("toTime", String(to));
  if (from !== null && to !== null && from > to) throw new Error("Start date must be before end date.");
  return params.toString();
}

/** Renders a confirmed chain event without treating bill creation as payment. */
function renderItem(item) {
  const card = document.createElement("div"); card.className = "panel";
  const title = document.createElement("strong"); title.textContent = `Bill #${item.billId} · ${item.type}`;
  const amount = document.createElement("p"); amount.textContent = item.amountWei === null ? "No transfer" : item.type === "created" ? `Requested ${eth(item.amountWei)}` : eth(item.amountWei);
  const time = document.createElement("small"); time.textContent = `${localTime(item.timestamp)} · block ${item.blockNumber}`;
  const hash = document.createElement("p"); hash.className = "address"; hash.textContent = item.transactionHash;
  card.append(title, amount, time, hash);
  return card;
}

/** Loads exactly one history block window and reports remaining coverage. */
async function loadWindow() {
  if (!account || complete) return;
  more.disabled = true;
  try {
    const suffix = cursor ? `${filters}&cursor=${encodeURIComponent(cursor)}` : filters;
    const page = await api(`/accounts/${account}/history?${suffix}`);
    items.push(...page.items);
    list.append(...page.items.map(renderItem));
    cursor = page.nextCursor;
    complete = page.complete;
    progress.textContent = complete ? `${items.length} confirmed events. Full filtered history loaded at block ${page.snapshot.blockNumber}.` : `${items.length} events found. Older blocks remain to scan.`;
    more.hidden = complete;
    exportButton.hidden = !complete;
    if (complete && !items.length) list.textContent = "No confirmed activity matches these filters.";
    status.textContent = "";
  } catch (error) { status.textContent = errorText(error); }
  finally { more.disabled = false; }
}

/** Clears scan results when account, filter or network context changes. */
function reset() {
  cursor = null; items = []; complete = false; list.replaceChildren(); more.hidden = true; exportButton.hidden = true;
  progress.textContent = account ? "Apply filters to load confirmed history." : "Connect a wallet to load activity.";
}

/** Quotes a CSV field and protects spreadsheet viewers from formula execution. */
function csv(value) {
  const text = String(value ?? "");
  const safe = /^[=+@\-\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** Exports only a completed filtered scan with exact wei values. */
function exportCsv() {
  if (!complete) return;
  const headers = ["chainId", "contractAddress", "billId", "type", "installmentIndex", "amountWei", "amountEth", "timestampUtc", "transactionHash", "blockNumber"];
  const rows = items.map(item => [config.chainId, config.contractAddress, item.billId, item.type, item.installmentIndex ?? "", item.amountWei ?? "", item.amountWei === null ? "" : window.ClearBillEthers.formatEther(BigInt(item.amountWei)), new Date(item.timestamp * 1000).toISOString(), item.transactionHash, item.blockNumber]);
  const content = [headers, ...rows].map(row => row.map(csv).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = `clearbill-${config.chainId}-activity.csv`; anchor.click();
  URL.revokeObjectURL(url);
}

document.querySelector("#apply-filters").addEventListener("click", () => {
  try { filters = readFilters(); reset(); loadWindow(); }
  catch (error) { status.textContent = errorText(error); }
});
more.addEventListener("click", loadWindow);
exportButton.addEventListener("click", exportCsv);
document.addEventListener("DOMContentLoaded", async () => {
  config = await boot(next => { account = next; reset(); renderLocal(); if (account) { filters = readFilters(); loadWindow(); } });
  renderLocal();
});
