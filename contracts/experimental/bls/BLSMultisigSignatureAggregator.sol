//SPDX-License-Identifier: Unlicense
pragma solidity >=0.8.4 <0.9.0;
pragma abicoder v2;

import "./../../interfaces/IAggregatorMultisig.sol";
import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {BLSOpen} from  "@account-abstraction/contracts/samples/bls/lib/BLSOpen.sol";
import "./../../interfaces/IBLSAccountMultisig.sol";
import "@account-abstraction/contracts/samples/bls/BLSHelper.sol";
import "./BLSHelperG2.sol";

/**
 * A BLS-based signature aggregator, to validate aggregated signature of multiple UserOps if BLSAccountMultisig
 */
contract BLSMultisigSignatureAggregator is IAggregatorMultisig {
    using UserOperationLib for UserOperation;

    bytes32 public constant BLS_DOMAIN = keccak256("eip4337.bls.domain");

    function getUserOpPublicKey(UserOperation memory userOp) public view returns (uint256[4] memory publicKey) {
        bytes memory initCode = userOp.initCode;
        if (initCode.length > 0) {
            publicKey = getTrailingPublicKey(initCode);
        } else {
            return IBLSAccountMultisig(userOp.sender).getBlsPublicKey(getTrailingBitmask(userOp.signature));
        }
    }

    /**
     * return the trailing 4 words of input data
     */
    function getTrailingPublicKey(bytes memory data) public pure returns (uint256[4] memory publicKey) {
        uint len = data.length;
        require(len > 32 * 4, "data to short for sig");

        /* solhint-disable-next-line no-inline-assembly */
        assembly {
        // actual buffer starts at data+32, so last 128 bytes start at data+32+len-128 = data+len-96
            let ofs := sub(add(data, len), 96)
            mstore(publicKey, mload(ofs))
            mstore(add(publicKey, 32), mload(add(ofs, 32)))
            mstore(add(publicKey, 64), mload(add(ofs, 64)))
            mstore(add(publicKey, 96), mload(add(ofs, 96)))
        }
    }

    function getTrailingBitmask(bytes memory data) public pure returns (bytes memory bitmask) {
        bytes memory t = new bytes(1);
        t[0] = data[64];
        bitmask = t; 
    }

    function validateSignatures(UserOperation[] calldata userOps, bytes calldata signature)
    external view override {
        require(signature.length== 64, "BLS: invalid signature");
        (uint256[2] memory blsSignature) = abi.decode(signature, (uint256[2]));

        uint userOpsLen = userOps.length;
        uint256[4][] memory blsPublicKeys = new uint256[4][](userOpsLen);
        uint256[2][] memory messages = new uint256[2][](userOpsLen);
        for (uint256 i = 0; i < userOpsLen; i++) {

            UserOperation memory userOp = userOps[i];
            IBLSAccountMultisig blsAccount = IBLSAccountMultisig(userOp.sender);
            
            blsPublicKeys[i] = blsAccount.getBlsPublicKey(getTrailingBitmask(userOp.signature));

            messages[i] = _userOpToMessage(userOp, keccak256(abi.encode(blsPublicKeys[i])));
        }
        require(BLSOpen.verifyMultiple(blsSignature, blsPublicKeys, messages), "BLS: validateSignatures failed");
    }

    /**
     * get a hash of userOp
     * NOTE: this hash is not the same as UserOperation.hash()
     *  (slightly less efficient, since it uses memory userOp)
     */
    function internalUserOpHash(UserOperation memory userOp) internal pure returns (bytes32) {
        return keccak256(abi.encode(
                userOp.sender,
                userOp.nonce,
                keccak256(userOp.initCode),
                keccak256(userOp.callData),
                userOp.callGasLimit,
                userOp.verificationGasLimit,
                userOp.preVerificationGas,
                userOp.maxFeePerGas,
                userOp.maxPriorityFeePerGas,
                keccak256(userOp.paymasterAndData)
            ));
    }

    /**
     * return the BLS "message" for the given UserOp.
     * the account checks the signature over this value  using its public-key
     */
    function userOpToMessage(UserOperation memory userOp) public view returns (uint256[2] memory) {
        bytes32 hashPublicKey = _getUserOpPubkeyHash(userOp);
        return _userOpToMessage(userOp, hashPublicKey);
    }

    function _userOpToMessage(UserOperation memory userOp, bytes32 publicKeyHash) internal view returns (uint256[2] memory) {
        bytes32 userOpHash = _getUserOpHash(userOp, publicKeyHash);
        return BLSOpen.hashToPoint(BLS_DOMAIN, abi.encodePacked(userOpHash));
    }

    //return the public-key hash of a userOp.
    function _getUserOpPubkeyHash(UserOperation memory userOp) internal view returns (bytes32 hashPublicKey) {
        return keccak256(abi.encode(getUserOpPublicKey(userOp)));
    }

    function getUserOpHash(UserOperation memory userOp) public view returns (bytes32) {
        bytes32 hashPublicKey = _getUserOpPubkeyHash(userOp);
        return _getUserOpHash(userOp, hashPublicKey);
    }

    function _getUserOpHash(UserOperation memory userOp, bytes32 hashPublicKey) internal view returns (bytes32) {
        return keccak256(abi.encode(internalUserOpHash(userOp), hashPublicKey, address(this), block.chainid));
    }

    /**
     * validate signature of a single userOp
     * This method is called after EntryPoint.simulateUserOperation() returns an aggregator.
     * First it validates the signature over the userOp. then it return data to be used when creating the handleOps:
     * @param userOp the userOperation received from the user.
     * @return sigForUserOp the value to put into the signature field of the userOp when calling handleOps.
     *    (usually empty, unless account and aggregator support some kind of "multisig"
     */
    function validateUserOpSignature(UserOperation calldata userOp)
    external view returns (bytes memory sigForUserOp) {
        uint256[2] memory signature = abi.decode(userOp.signature[:64], (uint256[2]));
        uint256[4] memory pubkey = getUserOpPublicKey(userOp);
        uint256[2] memory message = userOpToMessage(userOp);

        require(BLSOpen.verifySingle(signature, pubkey, message), "BLS: wrong sig");
        return "";
    }

    //copied from BLS.sol
    uint256 public  constant N = 21888242871839275222246405745257275088696311157297823662689037894645226208583;

    /**
     * aggregate multiple signatures into a single value.
     * This method is called off-chain to calculate the signature to pass with handleOps()
     * bundler MAY use optimized custom code perform this aggregation
     * @param userOps array of UserOperations to collect the signatures from.
     * @return aggregatesSignature the aggregated signature
     */
    function aggregateSignatures(UserOperation[] calldata userOps) external pure returns (bytes memory aggregatesSignature) {
        BLSHelper.XY[] memory points = new BLSHelper.XY[](userOps.length);
        for (uint i = 0; i < points.length; i++) {
            (uint x, uint y) = abi.decode(userOps[i].signature[:64], (uint, uint));
            points[i] = BLSHelper.XY(x, y);
        }
        BLSHelper.XY memory sum = BLSHelper.sum(points, N);
        return abi.encode(sum.x, sum.y);
    }

    /**
     * allow staking for this aggregator
     * there is no limit on stake  or delay, but it is not a problem, since it is a permissionless
     * signature aggregator, which doesn't support unstaking.
     */
    function addStake(IEntryPoint entryPoint, uint32 delay) external payable {
        entryPoint.addStake{value : msg.value}(delay);
    }

    /**
     * aggregate multiple publickeys into a single value.
     * @param pubKeys array of public keys to aggregate
     * @param signersBitmask the signers bitmask
     * @param threshold minimum number of signers
     * @return aggregatesPks the aggregated public keys
     */
    function aggregatePublicKeys(uint256[4][] memory pubKeys, bytes calldata signersBitmask,
        uint256 threshold) override external pure returns(uint256[4] memory aggregatesPks){
        
        if(pubKeys.length ==1){
            return pubKeys[0];
        }

        require(signersBitmask.length == 1, "Wrong signers bitmask lenght");

        uint256[4][] memory signers = new uint256[4][](pubKeys.length);
        bytes1 sb = signersBitmask[0];
        uint256 counter = 0;
        uint256 counter2 = 0;
        uint8 b = uint8(sb);
        while(b > 0 && counter < pubKeys.length){
            if(b%2==1){
                signers[counter2] = pubKeys[counter];
                ++counter2;
            }
            ++counter;
            b /= 2;
        }

        require(counter2 >= threshold, "Number of signatures is less than threshold");

        uint256[4][] memory signersOnly = new uint256[4][](counter2);
        for(uint i=0; i< counter2; i++){
            signersOnly[i] = signers[i];           
        }

        BLSHelperG2.Point[] memory points = new BLSHelperG2.Point[](signersOnly.length);
        for (uint i = 0; i < points.length; i++) {
            points[i] = BLSHelperG2.Point(
                BLSHelperG2.G2PointElement(signersOnly[i][0],signersOnly[i][1]),
                BLSHelperG2.G2PointElement(signersOnly[i][2],signersOnly[i][3])); 
        }

        BLSHelperG2.Point memory sum =  BLSHelperG2.sum(points, N);
        aggregatesPks[0] = sum.x.e1;
        aggregatesPks[1] = sum.x.e2;
        aggregatesPks[2] = sum.y.e1;
        aggregatesPks[3] = sum.y.e2;
    }
}