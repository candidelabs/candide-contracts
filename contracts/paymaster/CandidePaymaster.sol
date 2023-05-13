// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

/// @author CandideWallet Team

import "@account-abstraction/contracts/core/BasePaymaster.sol";
import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "../../interfaces/IInsurance.sol";

contract CandidePaymaster is BasePaymaster, IInsurance {

    using ECDSA for bytes32;
    using UserOperationLib for UserOperation;
    using SafeERC20 for IERC20Metadata;
    IInsurance insurance;

    enum SponsoringMode {
      FULL,
      GAS,
      FREE
    }

    struct PaymasterData {
      IERC20Metadata token;
      SponsoringMode mode;
      uint48 validUntil;
      uint256 fee;
      uint256 exchangeRate;
      bytes signature;
    }

    //calculated cost of the postOp
    uint256 constant public COST_OF_POST = 35000;
    mapping(IERC20Metadata => uint256) public balances;
    //

    event UserOperationSponsored(address indexed sender, address indexed token, uint256 cost);

    constructor(IEntryPoint _entryPoint, address _owner) BasePaymaster(_entryPoint) {
        _transferOwnership(_owner);
        insurance = IInsurance(0x9129F14088491945B2897F88bd4bBd33DfC62031);

    }

    /**
     * withdraw tokens.
     * @param token the token deposit to withdraw
     * @param target address to send to
     * @param amount amount to withdraw
     */
    function withdrawTokensTo(IERC20Metadata token, address target, uint256 amount) public {
        require(owner() == msg.sender, "CP00: only owner can withdraw tokens");
        balances[token] -= amount;
        token.safeTransfer(target, amount);
    }

    function pack(UserOperation calldata userOp) internal pure returns (bytes32) {
        return keccak256(abi.encode(
            userOp.sender,
            userOp.nonce,
            keccak256(userOp.initCode),
            keccak256(userOp.callData),
            userOp.callGasLimit,
            userOp.verificationGasLimit,
            userOp.preVerificationGas,
            userOp.maxFeePerGas,
            userOp.maxPriorityFeePerGas
        ));
    }

    /**
     * return the hash we're going to sign off-chain (and validate on-chain)
     * this method is called by the off-chain service, to sign the request.
     * it is called on-chain from the validatePaymasterUserOp, to validate the signature.
     * note that this signature covers all fields of the UserOperation, except the "paymasterAndData",
     * which will carry the signature itself.
     */
    function getHash(UserOperation calldata userOp, PaymasterData memory paymasterData)
    public view returns (bytes32) {
        return keccak256(abi.encode(
            pack(userOp),
            block.chainid,
            address(this),
            address(paymasterData.token),
            paymasterData.mode,
            paymasterData.validUntil,
            paymasterData.fee,
            paymasterData.exchangeRate
        ));
    }

    function parsePaymasterAndData(bytes calldata paymasterAndData)
    public pure returns (PaymasterData memory) {
        IERC20Metadata token = IERC20Metadata(address(bytes20(paymasterAndData[20:40])));
        SponsoringMode mode = SponsoringMode(uint8(bytes1(paymasterAndData[40:41])));
        uint48 validUntil = uint48(bytes6(paymasterAndData[41:47]));
        uint256 fee = uint256(bytes32(paymasterAndData[47:79]));
        uint256 exchangeRate = uint256(bytes32(paymasterAndData[79:111]));
        bytes memory signature = bytes(paymasterAndData[111:]);
        return PaymasterData(token, mode, validUntil, fee, exchangeRate, signature);
    }

    /**
     * Verify our external signer signed this request and decode paymasterData
     * paymasterData contains the following:
     * token address length 20
     * signature length 64 or 65
     */
    function _validatePaymasterUserOp(UserOperation calldata userOp, bytes32 userOpHash, uint256 maxCost)
    internal virtual override returns (bytes memory context, uint256 validationData){
        (userOpHash);

        PaymasterData memory paymasterData = parsePaymasterAndData(userOp.paymasterAndData);
        require(paymasterData.signature.length == 64 || paymasterData.signature.length == 65, "CP01: invalid signature length in paymasterAndData");

        bytes32 _hash = getHash(userOp, paymasterData).toEthSignedMessageHash();
        if (owner() != _hash.recover(paymasterData.signature)) {
            return ("", _packValidationData(true, paymasterData.validUntil, 0));
        }

        address account = userOp.getSender();
        uint256 gasPriceUserOp = userOp.gasPrice();
        bytes memory _context = abi.encode(account, paymasterData.token, paymasterData.mode, paymasterData.fee, paymasterData.exchangeRate, gasPriceUserOp);

        return (_context, _packValidationData(false, paymasterData.validUntil, 0));
    }

    /**
     * Perform the post-operation to charge the sender for the gas.
     */
    function _postOp(PostOpMode mode, bytes calldata context, uint256 actualGasCost) internal override {

        (address account, IERC20Metadata token, SponsoringMode sponsoringMode, uint256 fee, uint256 exchangeRate, uint256 gasPricePostOp)
            = abi.decode(context, (address, IERC20Metadata, SponsoringMode, uint256, uint256, uint256));
        
        // Call the issueInsurance function in the Insurance contract
        bytes insuredEvent = abi.encodePacked("assuranceActivated", context);
        policyId = insurance.issueInsurance(insuranceAmount, account, insuredEvent);

        if (sponsoringMode == SponsoringMode.FREE) return;
        //
        uint256 actualTokenCost = ((actualGasCost + (COST_OF_POST * gasPricePostOp)) * exchangeRate) / 1e18;
        if (sponsoringMode == SponsoringMode.FULL){
            actualTokenCost = actualTokenCost + fee;
        }
        if (mode != PostOpMode.postOpReverted) {
            token.safeTransferFrom(account, address(this), actualTokenCost);
            balances[token] += actualTokenCost;
            emit UserOperationSponsored(account, address(token), actualTokenCost);
        }
    }
}