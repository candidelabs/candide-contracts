// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.12;


/// @title SelfAuthorized - authorizes current contract to perform actions
/// @author Richard Meissner - <richard@gnosis.pm>
/// @author modified by CandideWallet Team

contract SelfAuthorized {
    modifier authorized() {
        require(msg.sender == address(this), "Method can only be called from this contract");
        _;
    }
}
