import { api } from "./api.js";
import { setWalletConfig, mountWalletControl } from "./wallet.js";
import { eth } from "./amounts.js";

/** Loads public contract settings and activates the shared wallet header. */
export async function boot(onAccount) {
  const status = document.querySelector("#page-status");
  try {
    const config = await api("/config");
    setWalletConfig(config);
    document.querySelectorAll(".network-name").forEach(node => { node.textContent = config.chainName; });
    mountWalletControl(onAccount);
    return config;
  } catch (error) {
    if (status) status.textContent = `Setup unavailable: ${error.message}`;
    document.querySelectorAll("button[data-chain-action]").forEach(button => { button.disabled = true; });
    return null;
  }
}

/** Formats a public address for a compact card without changing its value. */
export function shortAddress(value) { return `${value.slice(0, 6)}…${value.slice(-4)}`; }

/** Formats a UTC timestamp in the user's local timezone. */
export function localTime(seconds) { return new Date(seconds * 1000).toLocaleString(); }

/** Creates a bill card using text nodes so public labels cannot inject markup. */
export function billCard(bill, counterparty) {
  const link = document.createElement("a");
  link.href = `/bills/${bill.id}`;
  link.className = "bill-card";
  const top = document.createElement("div");
  top.className = "card-top";
  const title = document.createElement("strong");
  title.textContent = bill.label;
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = bill.isOverdue ? `${bill.status} · Overdue` : bill.status;
  top.append(title, badge);
  const amount = document.createElement("p");
  amount.textContent = `${eth(bill.paidAmountWei)} paid of ${eth(bill.totalAmountWei)}`;
  const foot = document.createElement("small");
  foot.textContent = `Bill #${bill.id} · ${shortAddress(bill[counterparty])}`;
  link.append(top, amount, foot);
  return link;
}

/** Creates a shared bill card without confusing its ID with legacy bills. */
export function sharedBillCard(bill, role) {
  const link = document.createElement("a"); link.href = `/shared-bills/${bill.id}`; link.className = "bill-card";
  const top = document.createElement("div"); top.className = "card-top";
  const title = document.createElement("strong"); title.textContent = bill.label;
  const badge = document.createElement("span"); badge.className = "badge"; badge.textContent = bill.isOverdue ? `${bill.status} · Overdue` : bill.status;
  top.append(title, badge);
  const amount = document.createElement("p"); amount.textContent = `${eth(bill.paidAmountWei)} paid of ${eth(bill.totalAmountWei)}`;
  const foot = document.createElement("small"); foot.textContent = role === "payee" ? `Shared #${bill.id} · ${bill.payerCount} payers` : `Shared #${bill.id} · ${shortAddress(bill.payee)}`;
  link.append(top, amount, foot); return link;
}

/** Opens an accessible review dialog and resolves only after explicit approval. */
export function review(title, lines, actionLabel = "Confirm") {
  return new Promise(resolve => {
    const dialog = document.createElement("dialog");
    dialog.className = "review-dialog";
    const heading = document.createElement("h2");
    heading.textContent = title;
    dialog.append(heading);
    for (const line of lines) {
      const paragraph = document.createElement("p");
      paragraph.textContent = line;
      dialog.append(paragraph);
    }
    const actions = document.createElement("div");
    actions.className = "review-actions";
    const cancel = document.createElement("button");
    cancel.textContent = "Go back";
    cancel.type = "button";
    const approve = document.createElement("button");
    approve.textContent = actionLabel;
    approve.className = "primary";
    approve.type = "button";
    actions.append(cancel, approve);
    dialog.append(actions);
    document.body.append(dialog);
    const finish = approved => { dialog.close(); dialog.remove(); resolve(approved); };
    cancel.addEventListener("click", () => finish(false));
    approve.addEventListener("click", () => finish(true));
    dialog.addEventListener("cancel", event => { event.preventDefault(); finish(false); });
    dialog.showModal();
  });
}
