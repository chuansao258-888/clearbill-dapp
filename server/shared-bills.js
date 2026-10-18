const { Contract, Interface, getAddress } = require("ethers");
const { ApiError } = require("./chain");

/** Creates public reads and receipt checks for the shared bill ledger. */
function createSharedChain(config, provider) {
  const settings = config.shared;
  const contract = new Contract(settings.contractAddress, settings.abi, provider);
  const iface = new Interface(settings.abi);
  const eventNames = ["SharedBillCreated", "SharedInstallmentPaid", "SharedBillCancelled", "SharedPayerRefunded"];
  const types = { SharedBillCreated: "created", SharedInstallmentPaid: "payment", SharedBillCancelled: "cancelled", SharedPayerRefunded: "refund" };
  const statuses = ["Open", "PartiallyPaid", "Paid", "Cancelled", "Refunded"];

  /** Verifies network, creation receipt and exact runtime bytecode. */
  async function verifyDeployment() {
    const [chainId, receipt, code] = await Promise.all([
      provider.send("eth_chainId", []), provider.getTransactionReceipt(settings.deploymentTransactionHash),
      provider.getCode(settings.contractAddress)
    ]);
    if (BigInt(chainId) !== BigInt(config.chainId)) throw new ApiError(503, "SHARED_SETUP_REQUIRED", "The shared bill chain does not match its manifest.");
    if (!receipt) throw new ApiError(503, "RPC_RECEIPT_UNAVAILABLE", "The RPC provider did not return the shared deployment receipt. Check the provider before changing the manifest.");
    if (receipt.status !== 1
      || receipt.blockNumber !== settings.deploymentBlock
      || receipt.contractAddress?.toLowerCase() !== settings.contractAddress.toLowerCase()
      || code.toLowerCase() !== settings.deployedBytecode.toLowerCase()) {
      throw new ApiError(503, "SHARED_SETUP_REQUIRED", "The shared bill deployment does not match its manifest.");
    }
  }

  /** Reads all payer shares and derives actionable progress at one block. */
  async function readBill(id, snapshot) {
    let raw;
    try { raw = await contract.getBill(id, { blockTag: snapshot.blockNumber }); }
    catch (error) {
      if (error.data) {
        try { if (iface.parseError(error.data)?.name === "BillNotFound") throw new ApiError(404, "SHARED_BILL_NOT_FOUND", "Shared bill not found."); }
        catch (parsed) { if (parsed instanceof ApiError) throw parsed; }
      }
      throw error;
    }
    const status = statuses[Number(raw.status)];
    const active = status === "Open" || status === "PartiallyPaid";
    const count = Number(raw.payerCount);
    const stages = Number(raw.installmentCount);
    const payers = Array.from({ length: count }, (_, index) => {
      const paidStages = Number(raw.paidInstallments[index]);
      const installments = Array.from({ length: stages }, (_, stage) => ({
        index: stage, amountWei: raw.amounts[index][stage].toString(), dueAt: Number(raw.dueAt[stage]), paid: stage < paidStages
      }));
      const paidWei = installments.slice(0, paidStages).reduce((sum, item) => sum + BigInt(item.amountWei), 0n);
      const shareWei = installments.reduce((sum, item) => sum + BigInt(item.amountWei), 0n);
      const next = active && paidStages < stages ? installments[paidStages] : null;
      return { address: getAddress(raw.payers[index]), installments, paidInstallments: paidStages,
        paidWei: paidWei.toString(), shareWei: shareWei.toString(),
        outstandingWei: active ? (shareWei - paidWei).toString() : "0",
        nextInstallment: next, isOverdue: Boolean(next && snapshot.timestamp > next.dueAt) };
    });
    return {
      id: id.toString(), kind: "shared", payee: getAddress(raw.payee), label: raw.label,
      createdAt: Number(raw.createdAt), payerCount: count, installmentCount: stages,
      dueAt: Array.from({ length: stages }, (_, stage) => Number(raw.dueAt[stage])), payers,
      status, totalAmountWei: raw.totalAmount.toString(), paidAmountWei: raw.paidAmount.toString(),
      refundedAmountWei: raw.refundedAmount.toString(),
      outstandingWei: active ? (raw.totalAmount - raw.paidAmount).toString() : "0",
      isOverdue: payers.some(payer => payer.isOverdue)
    };
  }

  /** Lists an account's newest issued or payable shared bills at one snapshot. */
  async function readAccountBills(account, role, offset, limit, snapshot) {
    const asPayee = role === "payee";
    const total = await contract.getAccountBillCount(account, asPayee, { blockTag: snapshot.blockNumber });
    if (offset > total) throw new ApiError(400, "INVALID_ARGUMENT", "Offset exceeds the shared bill count.", "offset");
    const count = BigInt(limit) > total - offset ? total - offset : BigInt(limit);
    const start = total - offset - count;
    const result = await contract.getAccountBillIds(account, asPayee, start, limit, { blockTag: snapshot.blockNumber });
    const items = await Promise.all([...result.ids].reverse().map(id => readBill(id, snapshot)));
    const next = offset + BigInt(items.length);
    return { items, total: total.toString(), nextOffset: next < total ? next.toString() : null, snapshot };
  }

  /** Projects one confirmed event with canonical block metadata. */
  async function projectEvent(log) {
    const parsed = iface.parseLog(log);
    const block = await provider.getBlock(log.blockNumber);
    if (!block || block.hash !== log.blockHash) throw new ApiError(409, "SNAPSHOT_CHANGED", "A shared bill history block changed.");
    return {
      eventId: `${config.chainId}:${settings.contractAddress}:${log.transactionHash}:${log.index}`,
      billId: parsed.args.billId.toString(), type: types[parsed.name],
      payee: getAddress(parsed.args.payee), payer: parsed.args.payer ? getAddress(parsed.args.payer) : null,
      amountWei: parsed.name === "SharedBillCreated" ? parsed.args.totalAmount.toString()
        : parsed.name === "SharedBillCancelled" ? null : parsed.args.amount.toString(),
      installmentIndex: parsed.name === "SharedInstallmentPaid" ? Number(parsed.args.installmentIndex) : null,
      transactionHash: log.transactionHash, blockNumber: log.blockNumber, blockHash: log.blockHash,
      transactionIndex: log.transactionIndex, logIndex: log.index, timestamp: block.timestamp
    };
  }

  /** Scans one bounded history window for a single shared bill. */
  async function readHistory(id, upperBlock) {
    const lower = Math.max(settings.deploymentBlock, upperBlock - config.historyBlockSpan + 1);
    const logs = [];
    for (const name of eventNames) {
      const topics = iface.encodeFilterTopics(name, [id]);
      logs.push(...await provider.getLogs({ address: settings.contractAddress, fromBlock: lower, toBlock: upperBlock, topics }));
    }
    const items = await Promise.all(logs.map(projectEvent));
    items.sort((a, b) => b.blockNumber - a.blockNumber || b.transactionIndex - a.transactionIndex || b.logIndex - a.logIndex);
    return { items, nextUpperBlock: lower <= settings.deploymentBlock ? null : lower - 1 };
  }

  /** Verifies a submitted shared-bill action against its canonical receipt. */
  async function readTransaction(hash) {
    const [tx, receipt] = await Promise.all([provider.getTransaction(hash), provider.getTransactionReceipt(hash)]);
    if (!tx && !receipt) return { hash, state: "unknown", operation: null, billId: null, confirmations: 0 };
    if (!tx || tx.to?.toLowerCase() !== settings.contractAddress.toLowerCase()) throw new ApiError(409, "TRANSACTION_SCOPE_MISMATCH", "This transaction does not call the shared bill contract.");
    let decoded;
    try { decoded = iface.parseTransaction({ data: tx.data, value: tx.value }); }
    catch { throw new ApiError(409, "TRANSACTION_SCOPE_MISMATCH", "Unsupported shared bill transaction."); }
    const expected = { createSharedBill: "SharedBillCreated", payInstallment: "SharedInstallmentPaid", cancelBill: "SharedBillCancelled", refundBill: "SharedPayerRefunded" }[decoded?.name];
    if (!expected) throw new ApiError(409, "TRANSACTION_SCOPE_MISMATCH", "Unsupported shared bill transaction.");
    const base = { hash, operation: decoded.name, from: getAddress(tx.from),
      billId: decoded.name === "createSharedBill" ? null : decoded.args[0].toString(),
      blockNumber: receipt?.blockNumber ?? null, confirmations: 0, gasUsed: receipt?.gasUsed.toString() ?? null,
      feeWei: receipt?.fee?.toString() ?? null, events: [] };
    if (!receipt) return { ...base, state: "pending" };
    if (receipt.status !== 1) return { ...base, state: "reverted" };
    const matches = receipt.logs.filter(log => log.address.toLowerCase() === settings.contractAddress.toLowerCase()).map(log => {
      try { return { log, event: iface.parseLog(log) }; } catch { return null; }
    }).filter(item => item?.event?.name === expected && (decoded.name === "createSharedBill" || item.event.args.billId === decoded.args[0]));
    if (!matches.length || (decoded.name !== "refundBill" && matches.length !== 1)) throw new ApiError(409, "TRANSACTION_SCOPE_MISMATCH", "The receipt has no matching shared bill event.");
    const actor = tx.from.toLowerCase();
    const billId = matches[0].event.args.billId;
    const state = await contract.getBill(billId, { blockTag: receipt.blockNumber });
    if (matches.some(({ event }) => event.args.payee.toLowerCase() !== state.payee.toLowerCase())
      || (decoded.name !== "payInstallment" && state.payee.toLowerCase() !== actor)) {
      throw new ApiError(409, "TRANSACTION_SCOPE_MISMATCH", "The receipt payee does not match the bill.");
    }
    if (decoded.name === "createSharedBill") {
      const expectedTotal = decoded.args.amounts.reduce((sum, row) => sum + row[0] + row[1], 0n);
      if (matches[0].event.args.clientReference !== decoded.args.clientReference
        || matches[0].event.args.totalAmount !== expectedTotal
        || matches[0].event.args.payerCount !== decoded.args.payerCount
        || matches[0].event.args.installmentCount !== decoded.args.installmentCount || tx.value !== 0n) {
        throw new ApiError(409, "TRANSACTION_SCOPE_MISMATCH", "The creation receipt does not match the terms.");
      }
    }
    if (decoded.name === "payInstallment" && (matches[0].event.args.payer.toLowerCase() !== actor
      || matches[0].event.args.installmentIndex !== decoded.args.expectedInstallment
      || matches[0].event.args.amount !== tx.value)) {
      throw new ApiError(409, "TRANSACTION_SCOPE_MISMATCH", "The payment receipt does not match the transfer.");
    }
    if (decoded.name === "cancelBill" && tx.value !== 0n) throw new ApiError(409, "TRANSACTION_SCOPE_MISMATCH", "The cancellation receipt has an unexpected value.");
    if (decoded.name === "refundBill") {
      const expected = new Map();
      for (let index = 0; index < Number(state.payerCount); index++) {
        let amount = 0n;
        for (let stage = 0; stage < Number(state.paidInstallments[index]); stage++) amount += state.amounts[index][stage];
        if (amount > 0n) expected.set(state.payers[index].toLowerCase(), amount);
      }
      if (tx.value !== decoded.args.expectedPaidAmount || matches.length !== expected.size
        || new Set(matches.map(({ event }) => event.args.payer.toLowerCase())).size !== matches.length
        || matches.some(({ event }) => expected.get(event.args.payer.toLowerCase()) !== event.args.amount)
        || matches.reduce((sum, item) => sum + item.event.args.amount, 0n) !== tx.value) {
        throw new ApiError(409, "TRANSACTION_SCOPE_MISMATCH", "The refund receipt does not match the payers.");
      }
    }
    const canonical = await provider.getBlock(receipt.blockNumber);
    if (!canonical || canonical.hash !== receipt.blockHash) throw new ApiError(409, "SNAPSHOT_CHANGED", "The transaction block changed.");
    base.billId = matches[0].event.args.billId.toString();
    base.events = await Promise.all(matches.map(item => projectEvent(item.log)));
    return { ...base, state: "confirmed", confirmations: (await provider.getBlockNumber()) - receipt.blockNumber + 1 };
  }

  return { verifyDeployment, readBill, readAccountBills, readHistory, readTransaction };
}

module.exports = { createSharedChain };
