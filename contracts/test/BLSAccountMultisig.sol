// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

import "./SimpleAccount.sol";
import "../../interfaces/IBLSAccountMultisig.sol";
import "../../interfaces/IAggregatorMultisig.sol";
/**
 * Minimal BLS-based multisig account that uses an aggregated signature.
 * The account must maintain its own BLS public-key, and expose its trusted signature aggregator.
 * Note that unlike the "standard" SimpleAccount, this account can't be called directly
 * (normal SimpleAccount uses its "signer" address as both the ecrecover signer, and as a legitimate
 * Ethereum sender address. Obviously, a BLS public is not a valid Ethereum sender address.)
 */
contract BLSAccountMultisig is SimpleAccount, IBLSAccountMultisig {
    address public immutable aggregator;
    uint256 public threshold;
    uint256[4][] private publicKeys;
    
    // The constructor is used only for the "implementation" and only sets immutable values.
    // Mutable values slots for proxy accounts are set by the 'initialize' function.
    constructor(IEntryPoint anEntryPoint, address anAggregator) 
        SimpleAccount(anEntryPoint)  {
        aggregator = anAggregator;
    }

    function initialize(uint256[4][] memory aPublicKeys, uint256 aThreshold) 
        public virtual initializer {
        super._initialize(address(0));
        publicKeys = aPublicKeys;
        threshold = aThreshold;
    }

    function _validateSignature(UserOperation calldata userOp, bytes32 userOpHash, address userOpAggregator)
    internal override view returns (uint256 deadline) {

        (userOp, userOpHash);
        require(userOpAggregator == aggregator, "BLSAccount: wrong aggregator");
        return 0;
    }

    event PublicKeyChanged(uint256[4][] oldPublicKey, uint256[4][] newPublicKey);

    function setBlsPublicKey(uint256[4][] memory newPublicKeys) external onlyOwner {
        emit PublicKeyChanged(publicKeys, newPublicKeys);
        publicKeys = newPublicKeys;
    }

    function getAggregator() external view returns (address) {
        return aggregator;
    }

    function getBlsPublicKeys() external view returns (uint256[4][] memory) {
        return publicKeys; 
    }

    function getBlsPublicKey(bytes calldata signersBitmask) external override view returns (uint256[4] memory) {
        return IAggregatorMultisig(aggregator).aggregatePublicKeys(publicKeys, signersBitmask, threshold);
    }
}