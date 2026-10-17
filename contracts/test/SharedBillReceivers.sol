// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {SharedBill} from "../SharedBill.sol";

/** Creates a bill whose payee rejects an installment transfer. */
contract RejectingSharedPayee {
    /** Creates a two-payer bill owned by this contract. */
    function create(SharedBill target, address first, address second, uint64 due, bytes32 clientReference) external {
        target.createSharedBill([first, second, address(0)], "Rejecting payee", 2, 1,
            [[uint256(1), 0], [uint256(1), 0], [uint256(0), 0]], [due, 0], clientReference);
    }

    /** Rejects principal forwarded by a payer. */
    receive() external payable { revert("payee rejects ETH"); }
}

/** Pays a bill but rejects a later return of its own principal. */
contract RejectingSharedPayer {
    /** Pays one assigned installment as this contract address. */
    function pay(SharedBill target, uint256 billId, uint8 stage) external payable {
        target.payInstallment{value: msg.value}(billId, stage);
    }

    /** Rejects the refund transfer. */
    receive() external payable { revert("payer rejects ETH"); }
}

/** Attempts to refund from a payee callback during a payer transfer. */
contract ReenteringSharedPayee {
    SharedBill private target;
    uint256 private billId;
    bool public reentered;

    /** Creates a bill and remembers its identifier for the callback. */
    function create(SharedBill ledger, address first, address second, uint64 due, bytes32 clientReference) external {
        target = ledger;
        ledger.createSharedBill([first, second, address(0)], "Callback test", 2, 1,
            [[uint256(1), 0], [uint256(1), 0], [uint256(0), 0]], [due, 0], clientReference);
        billId = ledger.nextBillId() - 1;
    }

    /** Attempts a nested refund and records whether it unexpectedly succeeds. */
    receive() external payable {
        try target.refundBill{value: msg.value}(billId, msg.value) { reentered = true; }
        catch { reentered = false; }
    }
}
