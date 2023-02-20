// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.7.0 <0.9.0;

import "@safe-contracts/contracts/Safe.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import "@safe-contracts/contracts/handler/CompatibilityFallbackHandler.sol";

/// @title CandideWallet - Smart contract wallet based on Gnosis safe that supports Eip4337
/// @author CandideWallet Team
contract CandideWallet is Safe{
    using ECDSA for bytes32;

    //EIP4337 trusted entrypoint
    address public entryPoint;

    //return value in case of signature failure, with no time-range.
    // equivalent to packSigTimeRange(true,0,0);
    uint256 constant internal SIG_VALIDATION_FAILED = 1;

    /// @dev Setup function sets initial storage of contract.
    /// @param _owners List of Safe owners.
    /// @param _threshold Number of required confirmations for a Safe transaction.
    /// @param to Contract address for optional delegate call.
    /// @param data Data payload for optional delegate call.
    /// @param fallbackHandler Handler for fallback calls to this contract
    /// @param paymentToken Token that should be used for the payment (0 is ETH)
    /// @param payment Value that should be paid
    /// @param paymentReceiver Address that should receive the payment (or 0 if tx.origin)
    /// @param _entryPoint Address for the trusted EIP4337 entrypoint
    function setupWithEntrypoint(
        address[] calldata _owners,
        uint256 _threshold,
        address to,
        bytes calldata data,
        address fallbackHandler,
        address paymentToken,
        uint256 payment,
        address payable paymentReceiver,
        address _entryPoint
    ) external{
        entryPoint = _entryPoint;
        
        execute(address(this), 0, 
            abi.encodeCall(Safe.setup, (
                _owners, _threshold,
                to, data,
                fallbackHandler,paymentToken, 
                payment, paymentReceiver 
            )),
            Enum.Operation.DelegateCall, type(uint256).max
        );
        ++nonce;
    }

    /// @dev Called by the entrypoint to validate the user's signature and nonce
    /// @param userOp is the entrypoint user operation
    /// @param userOpHash is the entrypoint user operation hash
    /// @param missingAccountFunds the minimum value this method should send the entrypoint.
    /// this value MAY be zero, in case there is enough deposit, or the userOp has a paymaster.
    function validateUserOp(UserOperation calldata userOp, bytes32 userOpHash, 
        uint256 missingAccountFunds) external returns (uint256 sigTimeRange){       
        if(userOp.initCode.length == 0){
            require(msg.sender == entryPoint, "account: not from entrypoint");
            bytes32 messageHash = userOpHash.toEthSignedMessageHash();

            try this.checkNSignatures(messageHash, bytes(abi.encode(userOp)), 
                userOp.signature, threshold){
               require(nonce++ == userOp.nonce, "account: invalid nonce");
            } catch {
                sigTimeRange = SIG_VALIDATION_FAILED;              
            }
        }
        if (missingAccountFunds > 0) {
            (bool success,) = payable(msg.sender).call{value : missingAccountFunds, gas : type(uint256).max}("");
            (success);
            //ignore failure (its EntryPoint's job to verify, not account.)
        }
    }

    /// @dev Allows the entrypoint to execute a transaction without any further confirmations.
    /// @param to Destination address of module transaction.
    /// @param value Ether value of module transaction.
    /// @param data Data payload of module transaction.
    /// @param operation Operation type of module transaction.
    /// @param paymaster address.
    /// @param approveToken token to be approved for the paymaster.
    /// @param approveAmount token amount to be approved by the paymaster.
    function execTransactionFromEntrypoint(
        address to,
        uint256 value,
        bytes memory data,
        Enum.Operation operation,
        address paymaster,
        address approveToken,
        uint256 approveAmount
    ) public virtual{
        // Only Entrypoint is allowed.
        require(msg.sender == entryPoint, "Not from entrypoint");
        // Execute transaction without further confirmations.
        execute(to, value, data, operation, type(uint256).max);

        //instead of sending a separate transaction to approve tokens
        //for the paymaster for each transaction, it can be approved here
        if(paymaster != 0x0000000000000000000000000000000000000000){
            IERC20 token = IERC20(approveToken);
            token.approve(paymaster, approveAmount);
        }
    }

    /// @dev There should be only one verified entrypoint per chain
    /// @dev so this function should only be used if there is a problem with
    /// @dev the main entrypoint
    function replaceEntrypoint(address newEntrypoint) public authorized{
        entryPoint = newEntrypoint;
    }
}