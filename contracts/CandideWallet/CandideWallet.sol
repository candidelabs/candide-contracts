// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@safe-global/safe-contracts/contracts/GnosisSafeL2.sol";
import "../../interfaces/UserOperation.sol";

/// @author CandideWallet Team
/// @dev CandideWallet is a modified GnosisSafe wallet with added support for 
/// EIP4337 entrypoint and social recovery

contract CandideWallet is GnosisSafe {
    using ECDSA for bytes32;
    using UserOperationLib for UserOperation;

    address public entryPoint;

    uint256 public friendsThreshold;
    address[] public friends;

    // isFriend mapping maps friend's address to friend status.
    mapping (address => bool) public isFriend;
    // isExecuted mapping maps data hash to execution status.
    mapping (bytes32 => bool) public isExecuted;
    // isConfirmed mapping maps data hash to friend's address to confirmation status.
    mapping (bytes32 => mapping (address => bool)) public isConfirmed;

    modifier onlyFriend() {
        require(isFriend[msg.sender], "Method can only be called by a friend");
        _;
    }

    modifier onlyOwner() {
        require(this.isOwner(msg.sender), "Method can only be called by owner");
        _;
    }

    constructor(address _entryPoint)GnosisSafe(){
        entryPoint = _entryPoint;
    }

    /// @dev will be called by entrypoint to validate transaction
    /// @param userOp the userOp to validate
    /// @param requestId hash of the user's request data.
    /// @param missingWalletFunds missing funds on the wallet's deposit in the entrypoint.
    function validateUserOp(UserOperation calldata userOp, bytes32 requestId, uint256 missingWalletFunds) external{
        
        address _msgSender = address(bytes20(msg.data[msg.data.length - 20 :]));
        require(_msgSender == entryPoint, "wallet: not from entrypoint");
        
        GnosisSafe pThis = GnosisSafe(payable(address(this)));
        bytes32 hash = requestId.toEthSignedMessageHash();
        address recovered = hash.recover(userOp.signature);

        //will not check for owner and threshold if initcode as wallet proxy was not initialized yet
        //will only happend during the wallet creation operation
        if (userOp.initCode.length == 0) {
            require(pThis.isOwner(recovered), "wallet: wrong signature");
            require(threshold == 1, "wallet: only threshold 1");
            require(nonce++ == userOp.nonce, "wallet: invalid nonce");
        }

        if (missingWalletFunds > 0) {
            //TODO: MAY pay more than the minimum, to deposit for future transactions
            (bool success,) = payable(_msgSender).call{value : missingWalletFunds}("");
            (success);
            //ignore failure (its EntryPoint's job to verify, not wallet.)
        }
    }

    /// @dev Setup function sets initial storage of contract.
    /// @param _friends List of friends' addresses.
    /// @param _friendsThreshold Required number of friends to confirm replacement.
    function setupSocialRecovery(address[] memory _friends, uint256 _friendsThreshold)
        public
        onlyOwner
    {
        require(_friendsThreshold <= _friends.length, "Threshold cannot exceed friends count");
        require(_friendsThreshold >= 1, "At least 1 friends required");
        
        //clear previous friends
        for (uint256 i = 0; i < friends.length; i++) {
            friends[i] = address(0);
        }

        // Set allowed friends.
        for (uint256 i = 0; i < _friends.length; i++) {
            address friend = _friends[i];
            require(friend != address(0), "Invalid friend address provided");
            require(!isFriend[friend], "Duplicate friend address provided");
            isFriend[friend] = true;
        }
        friends = _friends;
        friendsThreshold = _friendsThreshold;
    }

    /// @param prevOwner Owner that pointed to the owner to be replaced in the linked list
    /// @param oldOwner Owner address to be replaced.
    /// @param newOwner New owner address.
    /// @param signatures dataHash signed transactions by friends
    /// @dev Returns if transaction can be executed.
    function recoverAccess(address prevOwner, address oldOwner, address newOwner, bytes[] calldata signatures)
        public
        onlyFriend
    {
        bytes memory data = abi.encodeWithSignature("swapOwner(address,address,address)", prevOwner, oldOwner, newOwner);
        bytes32 dataHash = getDataHash(data);
        require(!isExecuted[dataHash], "Recovery already executed");
        require(signatures.length <= friends.length && signatures.length >= threshold, 
            "Wrong number of signatures");
        for (uint256 i = 0; i < friends.length; i++) {
            address recoveredFriend = dataHash.recover(signatures[i]);
            require(isFriend[recoveredFriend] && !isConfirmed[dataHash][recoveredFriend],
             "Invalide Signature");
            isConfirmed[dataHash][recoveredFriend] = true;
        }
        isExecuted[dataHash] = true;
        // require(manager.execTransactionFromModule(address(manager), 0, data, Enum.Operation.Call), "Could not execute recovery");
        this.swapOwner(prevOwner, oldOwner, newOwner);
    }

    /// @dev Returns hash of data encoding owner replacement.
    /// @param data Data payload.
    /// @return Data hash.
    function getDataHash(bytes memory data)
        public
        pure
        returns (bytes32)
    {
        return keccak256(data);
    }
}