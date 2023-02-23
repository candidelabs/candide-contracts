// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

/// @author CandideWallet Team

import "@account-abstraction/contracts/core/BasePaymaster.sol";
import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * A paymaster that uses external service to decide whether to pay for the UserOp.
 * The paymaster trusts an external signer to sign the transaction.
 * The calling user must pass the UserOp to that external signer first, which performs
 * whatever off-chain verification before signing the UserOp.
 * Note that this signature is NOT a replacement for wallet signature:
 * - the paymaster signs to agree to PAY for GAS.
 * - the wallet signs to prove identity and wallet ownership.
 */
contract CandidePaymaster is BasePaymaster {

    using ECDSA for bytes32;
    using UserOperationLib for UserOperation;
    using SafeERC20 for IERC20;

    address public immutable verifyingSigner;
    mapping(IERC20 => uint256) public balances;

    constructor(IEntryPoint _entryPoint, address _verifyingSigner) BasePaymaster(_entryPoint) {
        verifyingSigner = _verifyingSigner;
        _transferOwnership(verifyingSigner);
    }

    /**
     * withdraw tokens.
     * @param token the token deposit to withdraw
     * @param target address to send to
     * @param amount amount to withdraw
     */
    function withdrawTokensTo(IERC20 token, address target, uint256 amount) public {
        require(verifyingSigner == msg.sender, "must be verifyingSigner");
        balances[token] -= amount;
        token.safeTransfer(target, amount);
    }

    /**
     * return the hash we're going to sign off-chain (and validate on-chain)
     * this method is called by the off-chain service, to sign the request.
     * it is called on-chain from the validatePaymasterUserOp, to validate the signature.
     * note that this signature covers all fields of the UserOperation, except the "paymasterData",
     * which will carry the signature itself.
     */
    function getHash(UserOperation calldata userOp, uint160 maxTokenCost,
        uint160 costOfPost, address token)
    public pure returns (bytes32) {
        //can't use userOp.hash(), since it contains also the paymasterData itself.
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
                //userOp.paymasterAndData,
                maxTokenCost,
                costOfPost,
                token
            ));
    }

    event paymaster(uint160 maxTokenCost, uint160 costOfPost, IERC20 token, bytes sig);
    /**
     *verify our external signer signed this request and decode paymasterData
     *paymasterData contains the following:
     *maxTokenCost length 20
     *costOfPost length 20
     *token address length 20
     *signature length 64 or 65
     *total paymasterData length equal 124 or 125
     */

    function _validatePaymasterUserOp(UserOperation calldata userOp, bytes32 userOpHash, uint256 maxCost)
    internal virtual override returns (bytes memory context, uint256 validationData){

        uint256 paymasterDataLength = userOp.paymasterAndData.length - 20;

        require(paymasterDataLength == 124 || paymasterDataLength == 125, 
            "CandidePaymaster: invalid paymasterData length");

        uint160 maxTokenCost = uint160(bytes20(userOp.paymasterAndData[20:40]));
        uint160 costOfPost = uint160(bytes20(userOp.paymasterAndData[40:60]));
        IERC20 token = IERC20(address(bytes20(userOp.paymasterAndData[60:80])));
        address account = userOp.getSender();

        bytes32 hash = getHash(userOp, maxTokenCost, costOfPost, address(token));
        emit paymaster(maxTokenCost, costOfPost, token, bytes(userOp.paymasterAndData[80:]));
        require(verifyingSigner == hash.recover(userOp.paymasterAndData[80:]), 
            "CandidePaymaster: wrong signature");

        //no need for other on-chain validation: entire UserOp should have been checked
        // by the external service prior to signing it.
        return (abi.encode(account, token, maxTokenCost, maxCost, costOfPost), 0);
    }

    event tokenCost(uint256 cost);
    /**
     * perform the post-operation to charge the sender for the gas.
      */
    function _postOp(PostOpMode mode, bytes calldata context, uint256 actualGasCost) internal override {
        (mode);

        (address account, IERC20 token, uint160 maxTokenCost, uint256 maxCost, uint160 costOfPost) 
            = abi.decode(context, (address, IERC20, uint160, uint256, uint160));
        //use same conversion rate as used for validation.
        //if costOfPost is zero the transaction is sponsored
        if(costOfPost > 0){
            uint256 actualTokenCost = (actualGasCost + costOfPost) * maxTokenCost / maxCost;
            emit tokenCost(actualTokenCost);
            token.safeTransferFrom(account, address(this), actualTokenCost);
            balances[token] += actualTokenCost;
        }
    }
}