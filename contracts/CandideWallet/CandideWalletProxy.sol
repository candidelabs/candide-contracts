// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.7;

import "@safe-global/safe-contracts/contracts/proxies/GnosisSafeProxy.sol";

/// @author CandideWallet Team

/// @title CandideWalletProxy - Generic proxy contract allows to execute all transactions applying the code of a master contract.
/// @dev can be deployed and initialized using one entrypoint operation
contract CandideWalletProxy is GnosisSafeProxy{

    /// @dev Constructor function sets address of singleton contract.
    /// @param _singleton Singleton address.
    constructor(address _singleton)GnosisSafeProxy(_singleton) {
    }
}