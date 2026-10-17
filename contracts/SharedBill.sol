// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/** Records exact installments from two or three payers to one payee. */
contract SharedBill is ReentrancyGuard {
    enum BillStatus { Open, PartiallyPaid, Paid, Cancelled, Refunded }

    struct Bill {
        address payable payee;
        string label;
        address[3] payers;
        uint256[2][3] amounts;
        uint64[2] dueAt;
        uint64 createdAt;
        uint8 payerCount;
        uint8 installmentCount;
        uint8[3] paidInstallments;
        BillStatus status;
        uint256 totalAmount;
        uint256 paidAmount;
        uint256 refundedAmount;
    }

    error BillNotFound(uint256 billId);
    error InvalidTerms();
    error InvalidReference();
    error DuplicateReference(uint256 existingBillId);
    error Unauthorized(address caller);
    error InvalidStatus(uint256 billId, BillStatus status);
    error UnexpectedInstallment(uint8 expected, uint8 actual);
    error IncorrectValue(uint256 required, uint256 supplied);
    error StalePaidAmount(uint256 expected, uint256 actual);
    error TransferFailed(address recipient);
    error InvalidPagination();
    error DirectTransferNotAllowed();
    error UnsupportedCall();

    event SharedBillCreated(uint256 indexed billId, address indexed payee, bytes32 clientReference, uint256 totalAmount, uint8 payerCount, uint8 installmentCount);
    event SharedInstallmentPaid(uint256 indexed billId, address indexed payee, address indexed payer, uint8 installmentIndex, uint256 amount, uint256 cumulativePaid);
    event SharedBillCancelled(uint256 indexed billId, address indexed payee);
    event SharedPayerRefunded(uint256 indexed billId, address indexed payee, address indexed payer, uint256 amount);

    uint256 public nextBillId;
    mapping(uint256 => Bill) private bills;
    mapping(address => uint256[]) private issuedBillIds;
    mapping(address => uint256[]) private payableBillIds;
    mapping(address => mapping(bytes32 => uint256)) private creationIds;

    /** Starts IDs at one without granting the deployer special access. */
    constructor() { nextBillId = 1; }

    /** Stores validated immutable payer shares and common installment deadlines. */
    function createSharedBill(
        address[3] calldata payers,
        string calldata label,
        uint8 payerCount,
        uint8 installmentCount,
        uint256[2][3] calldata amounts,
        uint64[2] calldata dueAt,
        bytes32 clientReference
    ) external nonReentrant returns (uint256 billId) {
        uint256 total = _validateTerms(payers, label, payerCount, installmentCount, amounts, dueAt);
        if (clientReference == bytes32(0)) revert InvalidReference();
        uint256 existing = creationIds[msg.sender][clientReference];
        if (existing != 0) revert DuplicateReference(existing);

        billId = nextBillId++;
        Bill storage bill = bills[billId];
        bill.payee = payable(msg.sender);
        bill.label = label;
        bill.payers = payers;
        bill.amounts = amounts;
        bill.dueAt = dueAt;
        bill.createdAt = uint64(block.timestamp);
        bill.payerCount = payerCount;
        bill.installmentCount = installmentCount;
        bill.totalAmount = total;
        issuedBillIds[msg.sender].push(billId);
        for (uint8 i; i < payerCount; ++i) payableBillIds[payers[i]].push(billId);
        creationIds[msg.sender][clientReference] = billId;
        emit SharedBillCreated(billId, msg.sender, clientReference, total, payerCount, installmentCount);
    }

    /** Forwards one payer's exact next installment to the fixed payee. */
    function payInstallment(uint256 billId, uint8 expectedInstallment) external payable nonReentrant {
        Bill storage bill = _requireBill(billId);
        uint8 payerIndex = _payerIndex(bill, msg.sender);
        if (bill.status != BillStatus.Open && bill.status != BillStatus.PartiallyPaid) revert InvalidStatus(billId, bill.status);
        uint8 actual = bill.paidInstallments[payerIndex];
        if (expectedInstallment != actual || actual >= bill.installmentCount) revert UnexpectedInstallment(expectedInstallment, actual);
        uint256 required = bill.amounts[payerIndex][actual];
        if (msg.value != required) revert IncorrectValue(required, msg.value);

        bill.paidInstallments[payerIndex] = actual + 1;
        bill.paidAmount += required;
        bill.status = bill.paidAmount == bill.totalAmount ? BillStatus.Paid : BillStatus.PartiallyPaid;
        _sendEther(bill.payee, required);
        emit SharedInstallmentPaid(billId, bill.payee, msg.sender, actual, required, bill.paidAmount);
    }

    /** Cancels a shared bill before any payer has sent principal. */
    function cancelBill(uint256 billId) external nonReentrant {
        Bill storage bill = _requireBill(billId);
        if (msg.sender != bill.payee) revert Unauthorized(msg.sender);
        if (bill.status != BillStatus.Open || bill.paidAmount != 0) revert InvalidStatus(billId, bill.status);
        bill.status = BillStatus.Cancelled;
        emit SharedBillCancelled(billId, msg.sender);
    }

    /** Returns every paid share with fresh payee ETH in one atomic action. */
    function refundBill(uint256 billId, uint256 expectedPaidAmount) external payable nonReentrant {
        Bill storage bill = _requireBill(billId);
        if (msg.sender != bill.payee) revert Unauthorized(msg.sender);
        if (bill.status != BillStatus.PartiallyPaid && bill.status != BillStatus.Paid) revert InvalidStatus(billId, bill.status);
        if (expectedPaidAmount != bill.paidAmount) revert StalePaidAmount(expectedPaidAmount, bill.paidAmount);
        if (msg.value != bill.paidAmount) revert IncorrectValue(bill.paidAmount, msg.value);

        bill.refundedAmount = bill.paidAmount;
        bill.status = BillStatus.Refunded;
        for (uint8 i; i < bill.payerCount; ++i) {
            uint256 amount;
            for (uint8 stage; stage < bill.paidInstallments[i]; ++stage) amount += bill.amounts[i][stage];
            if (amount == 0) continue;
            _sendEther(payable(bill.payers[i]), amount);
            emit SharedPayerRefunded(billId, msg.sender, bill.payers[i], amount);
        }
    }

    /** Returns a stored shared bill or rejects an unknown ID. */
    function getBill(uint256 billId) external view returns (Bill memory) { return _requireBill(billId); }

    /** Quotes a specified payer's next exact amount and overdue state. */
    function getPaymentQuote(uint256 billId, address payer) external view returns (bool payableNow, uint8 installmentIndex, uint256 amount, uint64 dueAt, bool overdue) {
        Bill storage bill = _requireBill(billId);
        uint8 payerIndex = _payerIndex(bill, payer);
        if (bill.status != BillStatus.Open && bill.status != BillStatus.PartiallyPaid) return (false, 0, 0, 0, false);
        installmentIndex = bill.paidInstallments[payerIndex];
        if (installmentIndex >= bill.installmentCount) return (false, 0, 0, 0, false);
        amount = bill.amounts[payerIndex][installmentIndex];
        dueAt = bill.dueAt[installmentIndex];
        overdue = block.timestamp > dueAt;
        return (true, installmentIndex, amount, dueAt, overdue);
    }

    /** Counts bills issued by or addressed to an account. */
    function getAccountBillCount(address account, bool asPayee) external view returns (uint256) {
        if (account == address(0)) revert Unauthorized(account);
        return asPayee ? issuedBillIds[account].length : payableBillIds[account].length;
    }

    /** Returns a bounded creation-ordered account index page. */
    function getAccountBillIds(address account, bool asPayee, uint256 offset, uint256 limit)
        external view returns (uint256[] memory ids, uint256 nextOffset, uint256 total)
    {
        if (account == address(0)) revert Unauthorized(account);
        uint256[] storage source = asPayee ? issuedBillIds[account] : payableBillIds[account];
        total = source.length;
        if (limit == 0 || limit > 50 || offset > total) revert InvalidPagination();
        uint256 length = limit > total - offset ? total - offset : limit;
        ids = new uint256[](length);
        for (uint256 i; i < length; ++i) ids[i] = source[offset + i];
        nextOffset = offset + length;
    }

    /** Recovers an ID created with a wallet-scoped submission reference. */
    function getBillIdByReference(address creator, bytes32 clientReference) external view returns (uint256) {
        if (creator == address(0)) revert Unauthorized(creator);
        if (clientReference == bytes32(0)) revert InvalidReference();
        return creationIds[creator][clientReference];
    }

    /** Rejects a direct ETH transfer that has no bill ID. */
    receive() external payable { revert DirectTransferNotAllowed(); }

    /** Rejects unknown calls and accidental value transfers. */
    fallback() external payable { revert UnsupportedCall(); }

    /** Resolves a stored bill without treating its default enum as existence. */
    function _requireBill(uint256 billId) private view returns (Bill storage bill) {
        bill = bills[billId];
        if (bill.payee == address(0)) revert BillNotFound(billId);
    }

    /** Finds a listed payer's fixed slot. */
    function _payerIndex(Bill storage bill, address payer) private view returns (uint8) {
        for (uint8 i; i < bill.payerCount; ++i) if (bill.payers[i] == payer) return i;
        revert Unauthorized(payer);
    }

    /** Checks addresses, schedule, active shares and the exact total. */
    function _validateTerms(address[3] calldata payers, string calldata label, uint8 payerCount, uint8 installmentCount,
        uint256[2][3] calldata amounts, uint64[2] calldata dueAt) private view returns (uint256 total)
    {
        if (payerCount < 2 || payerCount > 3 || installmentCount < 1 || installmentCount > 2
            || bytes(label).length == 0 || bytes(label).length > 80 || dueAt[0] <= block.timestamp) revert InvalidTerms();
        if (installmentCount == 1 && dueAt[1] != 0) revert InvalidTerms();
        if (installmentCount == 2 && dueAt[1] <= dueAt[0]) revert InvalidTerms();
        for (uint8 i; i < 3; ++i) {
            if (i >= payerCount) {
                if (payers[i] != address(0) || amounts[i][0] != 0 || amounts[i][1] != 0) revert InvalidTerms();
                continue;
            }
            if (payers[i] == address(0) || payers[i] == msg.sender || payers[i] == address(this) || amounts[i][0] == 0) revert InvalidTerms();
            if (installmentCount == 1 && amounts[i][1] != 0) revert InvalidTerms();
            if (installmentCount == 2 && amounts[i][1] == 0) revert InvalidTerms();
            for (uint8 j; j < i; ++j) if (payers[j] == payers[i]) revert InvalidTerms();
            total += amounts[i][0] + amounts[i][1];
        }
    }

    /** Sends principal after state changes and reverts on refusal. */
    function _sendEther(address payable recipient, uint256 amount) private {
        (bool sent,) = recipient.call{value: amount}("");
        if (!sent) revert TransferFailed(recipient);
    }
}
