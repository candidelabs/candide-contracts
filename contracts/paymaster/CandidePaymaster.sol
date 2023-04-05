// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

/// @author CandideWallet Team

import "@account-abstraction/contracts/core/BasePaymaster.sol";
import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract CandidePaymaster is BasePaymaster {

    using ECDSA for bytes32;
    using UserOperationLib for UserOperation;
    using SafeERC20 for IERC20Metadata;

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
      bytes signature;
    }

    //calculated cost of the postOp
    uint256 constant public COST_OF_POST = 35000;

    address public immutable verifyingSigner;
    mapping(IERC20Metadata => uint256) public balances;
    //
    AggregatorV3Interface private immutable ETH_USD_ORACLE;
    AggregatorV3Interface private constant NULL_ORACLE = AggregatorV3Interface(address(0));
    mapping(IERC20Metadata => AggregatorV3Interface) public oracles; // Oracles should be against USD, so if the token is UNI the oracle needs to be UNI/USD

    constructor(IEntryPoint _entryPoint, address _verifyingSigner, address _ethUsdOracle) BasePaymaster(_entryPoint) {
        ETH_USD_ORACLE = AggregatorV3Interface(_ethUsdOracle);
        verifyingSigner = _verifyingSigner;
        _transferOwnership(verifyingSigner);
    }


    /**
     * owner of the paymaster should add supported tokens
     */
    function addToken(IERC20Metadata token, AggregatorV3Interface tokenPriceOracle) external onlyOwner {
        require(oracles[token] == NULL_ORACLE, "CP04: Token already set");
        oracles[token] = tokenPriceOracle;
    }

    /**
     * withdraw tokens.
     * @param token the token deposit to withdraw
     * @param target address to send to
     * @param amount amount to withdraw
     */
    function withdrawTokensTo(IERC20Metadata token, address target, uint256 amount) public {
        require(verifyingSigner == msg.sender, "CP00: only verifyingSigner can withdraw tokens");
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
            paymasterData.fee
        ));
    }

    function parsePaymasterAndData(bytes calldata paymasterAndData)
    public pure returns (PaymasterData memory) {
        IERC20Metadata token = IERC20Metadata(address(bytes20(paymasterAndData[20:40])));
        SponsoringMode mode = SponsoringMode(uint8(bytes1(paymasterAndData[40:41])));
        uint48 validUntil = uint48(bytes6(paymasterAndData[41:47]));
        uint256 fee = uint256(bytes32(paymasterAndData[47:79]));
        bytes memory signature = bytes(paymasterAndData[79:]);
        return PaymasterData(token, mode, validUntil, fee, signature);
    }

    function getDerivedValue(
        IERC20Metadata _token,
        uint256 _ethBought
    ) public view returns (uint256) {
        uint8 _decimals = 18; // this can be hardcoded because we're always deriving a TOKEN / ETH price which is always 18 decimals
        int256 decimals = int256(10 ** uint256(_decimals));
        //
        AggregatorV3Interface tokenOracle = oracles[_token];
        require(tokenOracle != NULL_ORACLE, "CP00: unsupported token");
        //
        (, int256 tokenPrice, , , ) = tokenOracle.latestRoundData();
        uint8 tokenOracleDecimals = tokenOracle.decimals();
        tokenPrice = scalePrice(tokenPrice, tokenOracleDecimals, _decimals);
        //
        (, int256 ethPrice, , , ) = ETH_USD_ORACLE.latestRoundData();
        uint8 ethOracleDecimals = ETH_USD_ORACLE.decimals();
        ethPrice = scalePrice(ethPrice, ethOracleDecimals, _decimals);
        //
        int256 price = (tokenPrice * decimals) / ethPrice;
        uint8 tokenDecimals = _token.decimals();
        return (_ethBought * (10**tokenDecimals)) / uint256(price);
    }

    function scalePrice(
        int256 _price,
        uint8 _priceDecimals,
        uint8 _decimals
    ) internal pure returns (int256) {
        if (_priceDecimals < _decimals) {
            return _price * int256(10 ** uint256(_decimals - _priceDecimals));
        } else if (_priceDecimals > _decimals) {
            return _price / int256(10 ** uint256(_priceDecimals - _decimals));
        }
        return _price;
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

        bytes32 _hash = getHash(userOp, paymasterData);
        if (verifyingSigner != _hash.recover(paymasterData.signature)) {
            return ("", _packValidationData(true, paymasterData.validUntil, 0));
        }

        address account = userOp.getSender();
        uint256 maxTokenCost = getDerivedValue(paymasterData.token, maxCost);
        uint256 gasPriceUserOp = userOp.gasPrice();
        bytes memory _context = abi.encode(account, paymasterData.token, paymasterData.mode, paymasterData.fee, gasPriceUserOp, maxTokenCost, maxCost);

        return (_context, _packValidationData(false, paymasterData.validUntil, 0));
    }

    /**
     * Perform the post-operation to charge the sender for the gas.
     */
    function _postOp(PostOpMode mode, bytes calldata context, uint256 actualGasCost) internal override {
        (mode);

        (address account, IERC20Metadata token, SponsoringMode sponsoringMode, uint256 fee, uint256 gasPricePostOp, uint160 maxTokenCost, uint256 maxCost)
            = abi.decode(context, (address, IERC20Metadata, SponsoringMode, uint256, uint256, uint160, uint256));
        if (sponsoringMode == SponsoringMode.FREE) return;
        //
        uint256 actualTokenCost = (actualGasCost + COST_OF_POST * gasPricePostOp) * maxTokenCost / maxCost;
        if (sponsoringMode == SponsoringMode.FULL){
            actualTokenCost = actualTokenCost + fee;
        }
        token.safeTransferFrom(account, address(this), actualTokenCost);
        balances[token] += actualTokenCost;
    }
}