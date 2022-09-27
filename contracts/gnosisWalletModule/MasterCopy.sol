// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.12;
//import "./SelfAuthorized.sol";


/// @title MasterCopy - Base for master copy contracts (should always be first super contract)
///         This contract is tightly coupled to our proxy contract (see `proxies/Proxy.sol`)
/// @author Richard Meissner - <richard@gnosis.io>
/// @author modified by CandideWallet Team
contract MasterCopy  {

    event ChangedMasterCopy(address masterCopy);

     modifier allowed() {
        require(msg.sender == address(this), "Method can only be called from this contract");
        _;
    }

    // masterCopy always needs to be first declared variable, to ensure that it is at the same location as in the Proxy contract.
    // It should also always be ensured that the address is stored alone (uses a full word)
    address private masterCopy;

    /// @dev Allows to upgrade the contract. This can only be done via a Safe transaction.
    /// @param _masterCopy New contract address.
    function changeMasterCopy(address _masterCopy)
        public
        allowed
    {
        // Master copy address cannot be null.
        require(_masterCopy != address(0), "Invalid master copy address provided");
        masterCopy = _masterCopy;
        emit ChangedMasterCopy(_masterCopy);
    }
}
