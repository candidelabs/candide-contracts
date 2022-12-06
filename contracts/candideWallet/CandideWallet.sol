// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity >=0.7.0 <0.9.0;

import "@safe-global/safe-contracts/contracts/GnosisSafe.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "../../interfaces/IEntryPoint.sol";
import "./handler/CompatibilityFallbackHandler.sol";

contract CandideWallet is GnosisSafe{
    using ECDSA for bytes32;

    address public entryPoint;

    /// @dev Setup function sets initial storage of contract.
    /// @param _owners List of Safe owners.
    /// @param _threshold Number of required confirmations for a Safe transaction.
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
            abi.encodeCall(GnosisSafe.setup, (
                _owners, _threshold,
                to, data,
                fallbackHandler,paymentToken, 
                payment, paymentReceiver 
            )),
            Enum.Operation.DelegateCall, gasleft()
        );
        //_enableModule(_entryPoint);
        ++nonce;
    }

    function validateUserOp(UserOperation calldata userOp, bytes32 userOpHash, 
        address aggregator, uint256 missingAccountFunds) 
        external returns (uint256 deadline){       
        
        if(nonce != 0){ 
            require(msg.sender == entryPoint, "account: not from entrypoint");
            
            bytes32 hash = userOpHash.toEthSignedMessageHash();
            checkNSignatures(hash, bytes(abi.encode(userOp)), userOp.signature, threshold);
            if (userOp.initCode.length == 0) {
                require(nonce == userOp.nonce, "account: invalid nonce");
            }
            ++nonce;
        }
        if (missingAccountFunds > 0) {
            //TODO: MAY pay more than the minimum, to deposit for future transactions
            (bool success,) = payable(msg.sender).call{value : missingAccountFunds}("");
            (success);
            //ignore failure (its EntryPoint's job to verify, not account.)
        }
        return 0;
    }

    /// @dev Allows a Module to execute a Safe transaction without any further confirmations.
    /// @param to Destination address of module transaction.
    /// @param value Ether value of module transaction.
    /// @param data Data payload of module transaction.
    /// @param operation Operation type of module transaction.
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
        execute(to, value, data, operation, gasleft());

        if(paymaster != 0x0000000000000000000000000000000000000000){
            IERC20 token = IERC20(approveToken);
            token.approve(paymaster, approveAmount);
        }
    }
}