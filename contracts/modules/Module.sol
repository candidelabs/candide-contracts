//SPDX-License-Identifier: GPL
pragma solidity ^0.8.12;
import "./MasterCopy.sol";
import "@safe-global/safe-contracts/contracts/base/ModuleManager.sol";


/// @title Module - Base class for modules.
/// @author Stefan George - <stefan@gnosis.pm>
/// @author Richard Meissner - <richard@gnosis.pm>
/// @author modified by CandideWallet Team

contract Module is MasterCopy {

    ModuleManager public manager;

    modifier authorized() {
        require(msg.sender == address(manager), "Method can only be called from manager");
        _;
    }

    function setManager()
        internal
    {
        // manager can only be 0 at initalization of contract.
        // Check ensures that setup function can only be called once.
        require(address(manager) == address(0), "Manager has already been set");
        manager = ModuleManager(msg.sender);
    }
}