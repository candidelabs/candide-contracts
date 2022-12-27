// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

/// @author eth-infinitism/account-abstraction - https://github.com/eth-infinitism/account-abstraction
/// @author modified by CandideWallet Team

import "./UserOperation.sol";
import "./IAccount.sol";
import "./IAggregator.sol";

/**
 * Aggregated wallet, that support IAggregator.
 * - the validateUserOp will be called only after the aggregator validated this wallet (with all other wallets of this aggregator).
 * - the validateUserOp MUST valiate the aggregator parameter, and MAY ignore the userOp.signature field.
 */
interface IAggregatedWallet is IAccount {

    /**
     * return the address of the signature aggregator the wallet supports.
     */
    function getAggregator() external view returns (address);
}