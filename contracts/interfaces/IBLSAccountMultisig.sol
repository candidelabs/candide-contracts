// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.12;

/// @author eth-infinitism/account-abstraction - https://github.com/eth-infinitism/account-abstraction
/// @author modified by CandideWallet Team

/**
 * a BLS multisig account should expose its own public key.
 */
interface IBLSAccountMultisig {
    function getBlsPublicKey(bytes calldata signersBitmask) external view returns (uint256[4] memory);
}