/** Requests JSON from the read-only API and preserves its public error code. */
export async function api(path) {
  const response = await fetch(`/api/v1${path}`);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(body.error?.message || "The service is unavailable.");
    error.code = body.error?.code || "HTTP_ERROR";
    throw error;
  }
  return body;
}

/** Returns the block query shared by all pages of a consistent account read. */
export function snapshotQuery(snapshot) {
  return `blockNumber=${snapshot.blockNumber}&blockHash=${encodeURIComponent(snapshot.blockHash)}`;
}

/** Loads every account bill page before claiming an aggregate is complete. */
export async function allBills(address, role, snapshot, onPage = () => {}) {
  let offset = "0";
  const items = [];
  do {
    const page = await api(`/accounts/${address}/bills?role=${role}&offset=${offset}&limit=50&${snapshotQuery(snapshot)}`);
    items.push(...page.items);
    onPage(items.length, page.total);
    offset = page.nextOffset;
  } while (offset !== null);
  return items;
}

/** Formats a chain or API failure for a visible, non-sensitive message. */
export function errorText(error) {
  if (error?.code === 4001 || error?.code === "ACTION_REJECTED") return "The wallet request was rejected. No payment was submitted.";
  if ([error?.code, error?.error?.code, error?.info?.error?.code].some(code => Number(code) === -32002)) return "A MetaMask request is already pending. Open MetaMask and complete or reject that request before trying again.";
  return error?.shortMessage || error?.message || "The request could not be completed.";
}
