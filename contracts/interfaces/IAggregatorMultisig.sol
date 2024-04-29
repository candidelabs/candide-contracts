// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

/// @author eth-infinitism/account-abstraction - https://github.com/eth-infinitism/account-abstraction
/// @author modified by CandideWallet Team

import "@account-abstraction/contracts/interfaces/UserOperation.sol";

/**
 * Aggregated Signatures validator for multisig BLS.
 */
interface IAggregatorMultisig {

    /**
     * validate aggregated signature.
     * revert if the aggregated signature does not match the given list of operations.
     */
    function validateSignatures(UserOperation[] calldata userOps, bytes calldata signature) external view;

    /**
     * validate signature of a single userOp
     * This method is called by EntryPoint.simulateUserOperation() if the account has an aggregator.
     * First it validates the signature over the userOp. then it return data to be used when creating the handleOps:
     * @param userOp the userOperation received from the user.
     * @return sigForUserOp the value to put into the signature field of the userOp when calling handleOps.
     *    (usually empty, unless account and aggregator support some kind of "multisig"
     */
    function validateUserOpSignature(UserOperation calldata userOp)
    external view returns (bytes memory sigForUserOp);

    /**
     * aggregate multiple signatures into a single value.
     * This method is called off-chain to calculate the signature to pass with handleOps()
     * bundler MAY use optimized custom code perform this aggregation
     * @param userOps array of UserOperations to collect the signatures from.
     * @return aggregatesSignature the aggregated signature
     */
    function aggregateSignatures(UserOperation[] calldata userOps) external view returns (bytes memory aggregatesSignature);

     /**
     * aggregate multiple publickeys into a single value.
     * @param pubKeys array of public keys to aggregate
     * @param signersBitmask the signers bitmask from
     * @param threshold minimum number of signers
     * @return aggregatesPks the aggregated public keys
     */
    function aggregatePublicKeys(uint256[4][] memory pubKeys, bytes calldata signersBitmask, uint256 threshold) 
        external pure returns(uint256[4] memory aggregatesPks);
}