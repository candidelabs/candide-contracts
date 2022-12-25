// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

import "./SimpleAccount.sol";
import "../../interfaces/IBLSAccountMultisig.sol";
import "../../interfaces/IAggregatorMultisig.sol";
/**
 * Minimal BLS-based account that uses an aggregated signature.
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

    function getBlsPublicKey() external override view returns (uint256[4] memory) {
        return publicKeys[0]; 
    }

    function getBlsPublicKeys() external view returns (uint256[4][] memory) {
        return publicKeys; 
    }

    function getBlsPublicKey(bytes calldata signature) external override view returns (uint256[4] memory) {
        /*uint256[4][] memory signers = new uint256[4][](publicKeys.length);
        bytes1 signersBitmask = signature[64];
        uint256 counter = 0;
        uint256 counter2 = 0;
        uint8 b = uint8(signersBitmask);
        while(b > 0 && counter < publicKeys.length){
            if(b%2==1){
                signers[counter2] = publicKeys[counter];
                ++counter2;
            }
            ++counter;
            b /= 2;
        }

        uint256[4][] memory signersOnly = new uint256[4][](counter2);
        for(uint i=0; i< counter2; i++){
            signersOnly[i] = signers[i];           
        }

        return IAggregator(aggregator).aggregatePublicKeys(signersOnly);*/
        return IAggregatorMultisig(aggregator).aggregatePublicKeys(publicKeys, signature, threshold);
    }
}