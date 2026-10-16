// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ClearBill} from "../ClearBill.sol";

/** Test-only wallet that rejects incoming ETH. */
contract RejectingReceiver {
    /** Creates a bill whose payee cannot receive a payment. */
    function createBill(ClearBill target, address payer, uint64 dueAt, bytes32 clientReference) external returns (uint256) {
        return target.createBill(payer, "Reject payment", 1, [uint256(1 ether), 0], [dueAt, 0], clientReference);
    }

    /** Pays a bill from this contract before rejecting any refund. */
    function payBill(ClearBill target, uint256 billId) external payable {
        target.payInstallment{value: msg.value}(billId, 0);
    }

    /** Refuses a direct payment or refund. */
    receive() external payable { revert("receiver rejected ETH"); }
}

/** Test-only wallet that attempts to pay the next installment during a callback. */
contract ReenteringPayee {
    ClearBill public target;
    uint256 public billId;
    bool public attempted;

    /** Stores the target business contract. */
    constructor(ClearBill target_) { target = target_; }

    /** Creates a bill and remembers its ID for a callback. */
    function createBill(address payer, uint64 firstDue, uint64 secondDue, bytes32 clientReference) external returns (uint256) {
        billId = target.createBill(payer, "Callback check", 2, [uint256(1 ether), uint256(1 ether)], [firstDue, secondDue], clientReference);
        return billId;
    }

    /** Attempts a guarded state change after receiving the deposit. */
    receive() external payable {
        attempted = true;
        try target.cancelBill(billId) { revert("unexpected reentry success"); }
        catch { }
    }
}
