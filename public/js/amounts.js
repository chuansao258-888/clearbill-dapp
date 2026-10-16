const { parseEther, formatEther } = window.ClearBillEthers;

/** Converts a positive decimal ETH string to exact wei without floating point. */
export function parseAmount(value) {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d{1,18})?$/.test(value)) throw new Error("Enter a positive ETH amount with at most 18 decimals.");
  const wei = parseEther(value);
  if (wei <= 0n) throw new Error("Amount must be greater than zero.");
  return wei;
}

/** Shows wei as an exact, non-rounded ETH decimal. */
export function eth(wei) { return `${formatEther(BigInt(wei))} ETH`; }

/** Counts the on-chain UTF-8 bytes of a public label. */
export function labelBytes(label) { return new TextEncoder().encode(label).length; }
