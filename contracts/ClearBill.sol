// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/** @title ClearBill @notice Records direct ETH bill payments and voluntary refunds. */
contract ClearBill is ReentrancyGuard {
    enum BillStatus { Open, PartiallyPaid, Paid, Cancelled, Refunded }

    struct Bill {
        address payable payee;
        address payable payer;
        string label;
        uint256[2] amounts;
        uint64[2] dueAt;
        uint64 createdAt;
        uint8 installmentCount;
        uint8 paidInstallments;
        BillStatus status;
        uint256 paidAmount;
        uint256 refundedAmount;
    }

    error BillNotFound(uint256 billId);
    error InvalidAddress(address account);
    error InvalidLabelLength(uint256 length);
    error InvalidInstallmentCount(uint8 count);
    error InvalidAmount(uint8 index);
    error InvalidSchedule();
    error TotalAmountOverflow();
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

    event BillCreated(uint256 indexed billId, address indexed payee, address indexed payer, bytes32 clientReference, uint256 totalAmount, uint8 installmentCount);
    event InstallmentPaid(uint256 indexed billId, address indexed payee, address indexed payer, uint8 installmentIndex, uint256 amount, uint256 cumulativePaid);
    event BillCancelled(uint256 indexed billId, address indexed payee, address indexed payer);
    event BillRefunded(uint256 indexed billId, address indexed payee, address indexed payer, uint256 amount);

    uint256 public nextBillId;
    mapping(uint256 => Bill) private bills;
    mapping(address => uint256[]) private issuedBillIds;
    mapping(address => uint256[]) private payableBillIds;
    mapping(address => mapping(bytes32 => uint256)) private creationIds;

    /** Starts bill numbering at one without giving the deployer any special rights. */
    constructor() { nextBillId = 1; }

    /** Creates immutable terms for one or two payments from the specified payer. */
    function createBill(address payer, string calldata label, uint8 installmentCount, uint256[2] calldata amounts, uint64[2] calldata dueAt, bytes32 clientReference)
        external nonReentrant returns (uint256 billId)
    {
        _validateTerms(payer, label, installmentCount, amounts, dueAt);
        if (clientReference == bytes32(0)) revert InvalidReference();
        uint256 existingId = creationIds[msg.sender][clientReference];
        if (existingId != 0) revert DuplicateReference(existingId);

        billId = nextBillId++;
        Bill storage bill = bills[billId];
        bill.payee = payable(msg.sender);
        bill.payer = payable(payer);
        bill.label = label;
        bill.amounts = amounts;
        bill.dueAt = dueAt;
        bill.createdAt = uint64(block.timestamp);
        bill.installmentCount = installmentCount;
        bill.status = BillStatus.Open;
        issuedBillIds[msg.sender].push(billId);
        payableBillIds[payer].push(billId);
        creationIds[msg.sender][clientReference] = billId;
        emit BillCreated(billId, msg.sender, payer, clientReference, amounts[0] + amounts[1], installmentCount);
    }

    /** Pays only the expected next installment and forwards its exact value. */
    function payInstallment(uint256 billId, uint8 expectedInstallment) external payable nonReentrant {
        Bill storage bill = _requireBill(billId);
        if (msg.sender != bill.payer) revert Unauthorized(msg.sender);
        if (bill.status != BillStatus.Open && bill.status != BillStatus.PartiallyPaid) revert InvalidStatus(billId, bill.status);
        if (expectedInstallment != bill.paidInstallments) revert UnexpectedInstallment(expectedInstallment, bill.paidInstallments);
        uint256 required = bill.amounts[expectedInstallment];
        if (msg.value != required) revert IncorrectValue(required, msg.value);

        bill.paidAmount += required;
        bill.paidInstallments++;
        bill.status = bill.paidInstallments == bill.installmentCount ? BillStatus.Paid : BillStatus.PartiallyPaid;
        _sendEther(bill.payee, required);
        emit InstallmentPaid(billId, bill.payee, bill.payer, expectedInstallment, required, bill.paidAmount);
    }

    /** Cancels a bill that has never received a payment. */
    function cancelBill(uint256 billId) external nonReentrant {
        Bill storage bill = _requireBill(billId);
        if (msg.sender != bill.payee) revert Unauthorized(msg.sender);
        if (bill.status != BillStatus.Open || bill.paidAmount != 0) revert InvalidStatus(billId, bill.status);
        bill.status = BillStatus.Cancelled;
        emit BillCancelled(billId, bill.payee, bill.payer);
    }

    /** Returns all received principal, supplied by the payee, to the original payer. */
    function refundBill(uint256 billId, uint256 expectedPaidAmount) external payable nonReentrant {
        Bill storage bill = _requireBill(billId);
        if (msg.sender != bill.payee) revert Unauthorized(msg.sender);
        if (bill.status != BillStatus.PartiallyPaid && bill.status != BillStatus.Paid) revert InvalidStatus(billId, bill.status);
        if (bill.paidAmount == 0) revert InvalidStatus(billId, bill.status);
        if (expectedPaidAmount != bill.paidAmount) revert StalePaidAmount(expectedPaidAmount, bill.paidAmount);
        if (msg.value != bill.paidAmount) revert IncorrectValue(bill.paidAmount, msg.value);

        bill.refundedAmount = bill.paidAmount;
        bill.status = BillStatus.Refunded;
        _sendEther(bill.payer, msg.value);
        emit BillRefunded(billId, bill.payee, bill.payer, msg.value);
    }

    /** Returns the stored bill or rejects an unknown ID. */
    function getBill(uint256 billId) external view returns (Bill memory) { return _requireBill(billId); }

    /** Returns the next payment and its overdue flag at the current chain time. */
    function getPaymentQuote(uint256 billId) external view returns (bool payableNow, uint8 installmentIndex, uint256 amount, uint64 dueAt, bool overdue) {
        Bill storage bill = _requireBill(billId);
        if (bill.status != BillStatus.Open && bill.status != BillStatus.PartiallyPaid) return (false, 0, 0, 0, false);
        installmentIndex = bill.paidInstallments;
        amount = bill.amounts[installmentIndex];
        dueAt = bill.dueAt[installmentIndex];
        overdue = block.timestamp > dueAt;
        return (true, installmentIndex, amount, dueAt, overdue);
    }

    /** Counts bills created by or addressed to an account. */
    function getAccountBillCount(address account, bool asPayee) external view returns (uint256) {
        if (account == address(0)) revert InvalidAddress(account);
        return asPayee ? issuedBillIds[account].length : payableBillIds[account].length;
    }

    /** Returns a bounded creation-ordered slice of an account's bill IDs. */
    function getAccountBillIds(address account, bool asPayee, uint256 offset, uint256 limit)
        external view returns (uint256[] memory ids, uint256 nextOffset, uint256 total)
    {
        if (account == address(0)) revert InvalidAddress(account);
        uint256[] storage source = asPayee ? issuedBillIds[account] : payableBillIds[account];
        total = source.length;
        if (limit == 0 || limit > 50 || offset > total) revert InvalidPagination();
        uint256 length = limit > total - offset ? total - offset : limit;
        ids = new uint256[](length);
        for (uint256 i = 0; i < length; i++) ids[i] = source[offset + i];
        nextOffset = offset + length;
    }

    /** Recovers the ID created with an account-scoped submission reference. */
    function getBillIdByReference(address creator, bytes32 clientReference) external view returns (uint256) {
        if (creator == address(0)) revert InvalidAddress(creator);
        if (clientReference == bytes32(0)) revert InvalidReference();
        return creationIds[creator][clientReference];
    }

    /** Rejects plain ETH transfers, which cannot identify a bill. */
    receive() external payable { revert DirectTransferNotAllowed(); }

    /** Rejects unknown function selectors and accidental value transfers. */
    fallback() external payable { revert UnsupportedCall(); }

    /** Resolves a bill without treating the enum's default value as existence. */
    function _requireBill(uint256 billId) internal view returns (Bill storage bill) {
        bill = bills[billId];
        if (bill.payee == address(0)) revert BillNotFound(billId);
    }

    /** Checks payer, byte length, positive amounts and an increasing schedule. */
    function _validateTerms(address payer, string calldata label, uint8 count, uint256[2] calldata amounts, uint64[2] calldata dueAt) internal view {
        if (payer == address(0) || payer == msg.sender || payer == address(this)) revert InvalidAddress(payer);
        uint256 labelLength = bytes(label).length;
        if (labelLength == 0 || labelLength > 80) revert InvalidLabelLength(labelLength);
        if (count != 1 && count != 2) revert InvalidInstallmentCount(count);
        if (amounts[0] == 0) revert InvalidAmount(0);
        if (dueAt[0] <= block.timestamp) revert InvalidSchedule();
        if (count == 1 && (amounts[1] != 0 || dueAt[1] != 0)) revert InvalidSchedule();
        if (count == 2) {
            if (amounts[1] == 0) revert InvalidAmount(1);
            if (dueAt[1] <= dueAt[0]) revert InvalidSchedule();
        }
        if (amounts[1] > type(uint256).max - amounts[0]) revert TotalAmountOverflow();
    }

    /** Sends exact principal and reverts the complete transaction if rejected. */
    function _sendEther(address payable recipient, uint256 amount) internal {
        (bool success,) = recipient.call{value: amount}("");
        if (!success) revert TransferFailed(recipient);
    }
}
