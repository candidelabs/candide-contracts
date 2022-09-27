// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.7;

import "@safe-global/safe-contracts/contracts/handler/DefaultCallbackHandler.sol";
import "@safe-global/safe-contracts/contracts/GnosisSafe.sol";
import "../../interfaces/IWallet.sol";
import "./EIP4337Manager.sol";

/// @author eth-infinitism/account-abstraction - https://github.com/eth-infinitism/account-abstraction
/// @author modified by CandideWallet Team

contract EIP4337Fallback is DefaultCallbackHandler, IWallet {
    address immutable public eip4337manager;

    constructor(address _eip4337manager) {
        eip4337manager = _eip4337manager;
    }

    /**
     * handler is called from the Safe. delegate actual work to EIP4337Manager
     */
    function validateUserOp(UserOperation calldata, bytes32, uint256) external {
        //delegate entire msg.data (including the appended "msg.sender") to the EIP4337Manager
        // will work only for GnosisSafe contracts

        GnosisSafe safe = GnosisSafe(payable(msg.sender));
        (bool success, bytes memory ret) = safe.execTransactionFromModuleReturnData(eip4337manager, 0, msg.data, Enum.Operation.DelegateCall);
        if (!success) {
            assembly {
                revert(add(ret, 32), mload(ret))
            }
        }
    }

}
