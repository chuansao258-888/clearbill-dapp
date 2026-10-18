const { Contract, Interface, JsonRpcProvider, FetchRequest, getAddress } = require("ethers");

/** Represents a validated client request or chain read failure. */
class ApiError extends Error {
  /** Keeps a public code and HTTP status separate from internal diagnostics. */
  constructor(status, code, message, field = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

/** Creates a read-only chain service for the configured deployment. */
function createChain(config, provider = null) {
  if (!provider) {
    const request = new FetchRequest(config.rpcUrl);
    request.timeout = config.timeoutMs;
    request.setHeader("Content-Type", "application/json");
    request.setHeader("User-Agent", "ClearBill/1.0");
    // A read immediately after a receipt must not reuse a cached older block.
    provider = new JsonRpcProvider(request, config.chainId, { staticNetwork: true, cacheTimeout: -1, batchMaxCount: 1 });
  }
  const contract = new Contract(config.contractAddress, config.abi, provider);
  const iface = new Interface(config.abi);
  const eventNames = ["BillCreated", "InstallmentPaid", "BillCancelled", "BillRefunded"];
  const typeNames = { BillCreated: "created", InstallmentPaid: "payment", BillCancelled: "cancelled", BillRefunded: "refund" };

  /** Checks that the configured chain and code match the deployment manifest. */
  async function verifyDeployment() {
    const [networkId, receipt, code] = await Promise.all([
      provider.send("eth_chainId", []),
      provider.getTransactionReceipt(config.deploymentTransactionHash),
      provider.getCode(config.contractAddress)
    ]);
    if (BigInt(networkId) !== BigInt(config.chainId)) throw new ApiError(503, "SETUP_REQUIRED", "The configured chain does not match the deployment.");
    if (!receipt) throw new ApiError(503, "RPC_RECEIPT_UNAVAILABLE", "The RPC provider did not return the deployment receipt. Check the provider before changing the manifest.");
    if (receipt.status !== 1 || receipt.blockNumber !== config.deploymentBlock || receipt.contractAddress?.toLowerCase() !== config.contractAddress.toLowerCase()) {
      throw new ApiError(503, "SETUP_REQUIRED", "The deployment receipt does not match the manifest.");
    }
    if (code.toLowerCase() !== config.deployedBytecode.toLowerCase()) throw new ApiError(503, "SETUP_REQUIRED", "The deployed contract code does not match the build.");
  }

  /** Returns the latest canonical block identity used for consistent reads. */
  async function getSnapshot() {
    const block = await provider.getBlock("latest");
    if (!block) throw new ApiError(503, "CHAIN_UNAVAILABLE", "The latest block is unavailable.");
    return { blockNumber: block.number, blockHash: block.hash, timestamp: block.timestamp };
  }

  /** Confirms that a previously selected block is still canonical. */
  async function checkSnapshot(snapshot) {
    const block = await provider.getBlock(snapshot.blockNumber);
    if (!block || block.hash !== snapshot.blockHash || block.timestamp !== snapshot.timestamp) {
      throw new ApiError(409, "SNAPSHOT_CHANGED", "The selected blockchain snapshot changed. Refresh the page.");
    }
  }

  /** Reads a bill and computes presentation fields from one block snapshot. */
  async function readBill(id, snapshot) {
    let raw;
    try { raw = await contract.getBill(id, { blockTag: snapshot.blockNumber }); }
    catch (error) {
      if (error.data && iface.parseError(error.data)?.name === "BillNotFound") throw new ApiError(404, "BILL_NOT_FOUND", "Bill not found.");
      throw error;
    }
    const statusNames = ["Open", "PartiallyPaid", "Paid", "Cancelled", "Refunded"];
    const status = statusNames[Number(raw.status)];
    const active = status === "Open" || status === "PartiallyPaid";
    const count = Number(raw.installmentCount);
    const paid = Number(raw.paidInstallments);
    const total = raw.amounts[0] + raw.amounts[1];
    const next = active ? { index: paid, amountWei: raw.amounts[paid].toString(), dueAt: Number(raw.dueAt[paid]) } : null;
    return {
      id: id.toString(), payee: getAddress(raw.payee), payer: getAddress(raw.payer), label: raw.label,
      installmentCount: count,
      installments: Array.from({ length: count }, (_, index) => ({ index, amountWei: raw.amounts[index].toString(), dueAt: Number(raw.dueAt[index]), paid: index < paid })),
      paidInstallments: paid, status, createdAt: Number(raw.createdAt), totalAmountWei: total.toString(),
      paidAmountWei: raw.paidAmount.toString(), refundedAmountWei: raw.refundedAmount.toString(),
      netReceivedWei: (raw.paidAmount - raw.refundedAmount).toString(),
      outstandingWei: (active ? total - raw.paidAmount : 0n).toString(),
      isOverdue: Boolean(next && snapshot.timestamp > next.dueAt), nextInstallment: next
    };
  }

  /** Reads an account's newest bill IDs and their state at one block. */
  async function readAccountBills(address, role, offset, limit, snapshot) {
    const asPayee = role === "payee";
    const total = await contract.getAccountBillCount(address, asPayee, { blockTag: snapshot.blockNumber });
    if (offset > total) throw new ApiError(400, "INVALID_ARGUMENT", "Offset exceeds the bill count.", "offset");
    const count = BigInt(limit) > total - offset ? total - offset : BigInt(limit);
    const start = total - offset - count;
    const result = await contract.getAccountBillIds(address, asPayee, start, limit, { blockTag: snapshot.blockNumber });
    const ids = [...result.ids].reverse();
    const items = await Promise.all(ids.map(id => readBill(id, snapshot)));
    const nextOffset = offset + BigInt(items.length);
    return { items, nextOffset: nextOffset < total ? nextOffset.toString() : null, total: total.toString(), snapshot };
  }

  /** Converts a contract log to a public history item with block metadata. */
  async function projectEvent(log) {
    const parsed = iface.parseLog(log);
    const block = await provider.getBlock(log.blockNumber);
    if (!block || block.hash !== log.blockHash) throw new ApiError(409, "SNAPSHOT_CHANGED", "A history block changed during the read.");
    return {
      eventId: `${config.chainId}:${config.contractAddress}:${log.transactionHash}:${log.index}`,
      billId: parsed.args.billId.toString(), type: typeNames[parsed.name],
      payee: getAddress(parsed.args.payee), payer: getAddress(parsed.args.payer),
      amountWei: parsed.name === "BillCreated" ? parsed.args.totalAmount.toString() : parsed.name === "BillCancelled" ? null : parsed.args.amount.toString(),
      installmentIndex: parsed.name === "InstallmentPaid" ? Number(parsed.args.installmentIndex) : null,
      transactionHash: log.transactionHash, transactionIndex: log.transactionIndex, logIndex: log.index,
      blockNumber: log.blockNumber, blockHash: log.blockHash, timestamp: block.timestamp
    };
  }

  /** Reads one bounded history window and returns a cursor for older blocks. */
  async function readHistory(scope, filters, snapshot, upperBlock) {
    const fromBlock = Math.max(config.deploymentBlock, upperBlock - config.historyBlockSpan + 1);
    const names = filters.type === "all" ? eventNames : eventNames.filter(name => typeNames[name] === filters.type);
    const logs = [];
    for (const name of names) {
      const topics = scope.billId
        ? iface.encodeFilterTopics(name, [BigInt(scope.billId)])
        : null;
      if (topics) logs.push(...await provider.getLogs({ address: config.contractAddress, fromBlock, toBlock: upperBlock, topics }));
      else {
        const payeeTopics = iface.encodeFilterTopics(name, [null, scope.address]);
        const payerTopics = iface.encodeFilterTopics(name, [null, null, scope.address]);
        const [payeeLogs, payerLogs] = await Promise.all([
          provider.getLogs({ address: config.contractAddress, fromBlock, toBlock: upperBlock, topics: payeeTopics }),
          provider.getLogs({ address: config.contractAddress, fromBlock, toBlock: upperBlock, topics: payerTopics })
        ]);
        logs.push(...payeeLogs, ...payerLogs);
      }
    }
    const unique = [...new Map(logs.map(log => [`${log.transactionHash}:${log.index}`, log])).values()];
    const projected = await Promise.all(unique.map(projectEvent));
    const items = projected.filter(item => (!scope.address || item.payee.toLowerCase() === scope.address.toLowerCase() || item.payer.toLowerCase() === scope.address.toLowerCase())
      && (!scope.billId || item.billId === scope.billId)
      && (!filters.fromTime || item.timestamp >= filters.fromTime)
      && (!filters.toTime || item.timestamp <= filters.toTime));
    items.sort((a, b) => b.blockNumber - a.blockNumber || b.transactionIndex - a.transactionIndex || b.logIndex - a.logIndex);
    const lowerBlock = await provider.getBlock(fromBlock);
    const complete = fromBlock <= config.deploymentBlock || Boolean(filters.fromTime && lowerBlock && lowerBlock.timestamp < filters.fromTime);
    return { items, complete, nextUpperBlock: complete ? null : fromBlock - 1, snapshot };
  }

  /** Verifies a transaction's scope, receipt and matching business event. */
  async function readTransaction(hash) {
    const [tx, receipt] = await Promise.all([provider.getTransaction(hash), provider.getTransactionReceipt(hash)]);
    if (!tx && !receipt) return { hash, state: "unknown", operation: null, from: null, billId: null, blockNumber: null, confirmations: 0, gasUsed: null, feeWei: null, events: [] };
    if (!tx || tx.to?.toLowerCase() !== config.contractAddress.toLowerCase()) throw new ApiError(409, "TRANSACTION_SCOPE_MISMATCH", "This transaction does not call the configured contract.");
    let decoded;
    try { decoded = iface.parseTransaction({ data: tx.data, value: tx.value }); }
    catch { throw new ApiError(409, "TRANSACTION_SCOPE_MISMATCH", "This transaction does not call a supported method."); }
    const names = { createBill: "create", payInstallment: "pay", cancelBill: "cancel", refundBill: "refund" };
    const operation = names[decoded?.name];
    if (!operation) throw new ApiError(409, "TRANSACTION_SCOPE_MISMATCH", "This transaction does not call a supported method.");
    const base = { hash, operation, from: getAddress(tx.from), billId: decoded.name === "createBill" ? null : decoded.args[0].toString(), blockNumber: receipt?.blockNumber ?? null, confirmations: 0, gasUsed: receipt?.gasUsed.toString() ?? null, feeWei: receipt?.fee !== null && receipt?.fee !== undefined ? receipt.fee.toString() : null, events: [] };
    if (!receipt) return { ...base, state: "pending" };
    if (receipt.status !== 1) return { ...base, state: "reverted" };
    const found = receipt.logs.filter(log => log.address.toLowerCase() === config.contractAddress.toLowerCase()).map(log => {
      try { return { log, parsed: iface.parseLog(log) }; } catch { return null; }
    }).filter(Boolean);
    const eventName = { create: "BillCreated", pay: "InstallmentPaid", cancel: "BillCancelled", refund: "BillRefunded" }[operation];
    const matching = found.filter(({ parsed }) => parsed.name === eventName && (operation === "create" ? parsed.args.clientReference === decoded.args.clientReference : parsed.args.billId === decoded.args[0]));
    if (matching.length !== 1) throw new ApiError(409, "TRANSACTION_SCOPE_MISMATCH", "No matching ClearBill event was found in the successful receipt.");
    const parsed = matching[0].parsed;
    if (operation === "pay" && (parsed.args.installmentIndex !== decoded.args.expectedInstallment || parsed.args.amount !== tx.value)) throw new ApiError(409, "TRANSACTION_SCOPE_MISMATCH", "The payment receipt does not match the transaction.");
    if (operation === "refund" && (parsed.args.amount !== decoded.args.expectedPaidAmount || parsed.args.amount !== tx.value)) throw new ApiError(409, "TRANSACTION_SCOPE_MISMATCH", "The refund receipt does not match the transaction.");
    if (operation === "create" && (parsed.args.payee.toLowerCase() !== tx.from.toLowerCase() || parsed.args.payer.toLowerCase() !== decoded.args.payer.toLowerCase())) throw new ApiError(409, "TRANSACTION_SCOPE_MISMATCH", "The creation receipt does not match the transaction.");
    base.billId = parsed.args.billId.toString();
    base.events = [await projectEvent(matching[0].log)];
    const tip = await provider.getBlockNumber();
    const canonical = await provider.getBlock(receipt.blockNumber);
    if (!canonical || canonical.hash !== receipt.blockHash) throw new ApiError(409, "SNAPSHOT_CHANGED", "The transaction block changed.");
    return { ...base, state: "confirmed", confirmations: tip - receipt.blockNumber + 1 };
  }

  return { provider, contract, verifyDeployment, getSnapshot, checkSnapshot, readBill, readAccountBills, readHistory, readTransaction };
}

module.exports = { ApiError, createChain };
