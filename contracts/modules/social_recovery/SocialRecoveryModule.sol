// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.12 <0.9.0;

import {IGuardianStorage} from "./storage/IGuardianStorage.sol";
import {SignatureChecker} from "@openzeppelin/contracts/utils/cryptography/SignatureChecker.sol";
import {ISafe, IOwnerManager, Enum} from "./../../interfaces/ISafe.sol";

/// @title Social Recovery Module
/// @author CANDIDE Labs
contract SocialRecoveryModule {
    string public constant NAME = "Social Recovery Module";
    string public constant VERSION = "0.0.1";

    // keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant DOMAIN_SEPARATOR_TYPEHASH = 0x8b73c3c69bb8fe3d512ecc4cf759cc79239f7b179b0ffacaa9a75d522b39400f;

    // keccak256("ExecuteRecovery(address wallet,address[] newOwners,uint256 newThreshold,uint256 nonce)");
    bytes32 private constant EXECUTE_RECOVERY_TYPEHASH = 0x124b64921a7c7e677c6cc3b132eaaa57130bc6fc05ab157f35fe5264a7c198d5;

    address internal constant SENTINEL_OWNERS = address(0x1);

    struct SignatureData {
        address signer;
        bytes signature;
    }

    struct RecoveryRequest {
        uint256 guardiansApprovalCount;
        uint256 newThreshold;
        uint64 executeAfter;
        address[] newOwners;
    }

    mapping(address => RecoveryRequest) internal recoveryRequests;
    mapping(bytes32 => mapping(address => bool)) internal confirmedHashes;
    mapping(address => uint256) internal walletsNonces;

    // The guardians storage
    IGuardianStorage internal immutable guardianStorage;
    // Recovery period
    uint256 internal immutable recoveryPeriod;

    event RecoveryExecuted(
        address indexed wallet,
        address[] indexed newOwners,
        uint256 newThreshold,
        uint256 nonce,
        uint64 executeAfter,
        uint256 guardiansApprovalCount
    );
    event RecoveryFinalized(address indexed wallet, address[] indexed newOwners, uint256 newThreshold, uint256 nonce);
    event RecoveryCanceled(address indexed wallet, uint256 nonce);

    /**
     * @notice Throws if the sender is not the module itself or the owner of the target wallet.
     */
    modifier authorized(address _wallet) {
        require(msg.sender == _wallet, "SM: unauthorized");
        _;
    }

    /**
     * @notice Throws if there is no ongoing recovery request.
     */
    modifier whenRecovery(address _wallet) {
        require(recoveryRequests[_wallet].executeAfter > 0, "SM: no ongoing recovery");
        _;
    }

    constructor(IGuardianStorage _guardianStorage, uint256 _recoveryPeriod) {
        guardianStorage = _guardianStorage;
        recoveryPeriod = _recoveryPeriod;
    }

    ////////////////

    /// @dev Returns the chain id used by this contract.
    function getChainId() public view returns (uint256) {
        uint256 id;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            id := chainid()
        }
        return id;
    }

    function domainSeparator() public view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    DOMAIN_SEPARATOR_TYPEHASH,
                    keccak256(abi.encodePacked(NAME)),
                    keccak256(abi.encodePacked(VERSION)),
                    getChainId(),
                    this
                )
            );
    }

    /// @dev Returns the bytes that are hashed to be signed by guardians.
    function encodeRecoveryData(
        address _wallet,
        address[] calldata _newOwners,
        uint256 _newThreshold,
        uint256 _nonce
    ) public view returns (bytes memory) {
        bytes32 recoveryHash = keccak256(
            abi.encode(EXECUTE_RECOVERY_TYPEHASH, _wallet, keccak256(abi.encodePacked(_newOwners)), _newThreshold, _nonce)
        );
        return abi.encodePacked(bytes1(0x19), bytes1(0x01), domainSeparator(), recoveryHash);
    }

    /// @dev Generates the recovery hash that should be signed by the guardian to authorize a recovery
    function getRecoveryHash(
        address _wallet,
        address[] calldata _newOwners,
        uint256 _newThreshold,
        uint256 _nonce
    ) public view returns (bytes32) {
        return keccak256(encodeRecoveryData(_wallet, _newOwners, _newThreshold, _nonce));
    }

    /// @dev checks if valid signature to the provided signer, and if this signer is indeed a guardian, revert otherwise
    function validateGuardianSignature(address _wallet, bytes32 _signHash, address _signer, bytes memory _signature) public view {
        require(isGuardian(_wallet, _signer), "SM: Signer not a guardian");
        require(SignatureChecker.isValidSignatureNow(_signer, _signHash, _signature), "SM: Invalid guardian signature");
    }

    /**
     * @notice Lets single guardian confirm the execution of the recovery request.
     * Can also trigger the start of the execution by passing true to '_execute' parameter.
     * Once triggered the recovery is pending for the recovery period before it can be finalised.
     * @param _wallet The target wallet.
     * @param _newOwners The new owners' addressess.
     * @param _newThreshold The new threshold for the safe.
     * @param _execute Whether to auto-start execution of recovery.
     */
    function confirmRecovery(address _wallet, address[] calldata _newOwners, uint256 _newThreshold, bool _execute) external {
        require(isGuardian(_wallet, msg.sender), "SM: sender not a guardian");
        require(_newOwners.length > 0, "SM: owners cannot be empty");
        require(_newThreshold > 0 && _newOwners.length >= _newThreshold, "SM: invalid new threshold");
        //
        uint256 _nonce = nonce(_wallet);
        bytes32 recoveryHash = getRecoveryHash(_wallet, _newOwners, _newThreshold, _nonce);
        confirmedHashes[recoveryHash][msg.sender] = true;
        //
        if (!_execute) return;
        uint256 guardiansThreshold = threshold(_wallet);
        uint256 _approvalCount = getRecoveryApprovals(_wallet, _newOwners, _newThreshold);
        require(_approvalCount >= guardiansThreshold, "SM: confirmed signatures less than threshold");
        _executeRecovery(_wallet, _newOwners, _newThreshold, _approvalCount);
    }

    /**
     * @notice Lets multiple guardians confirm the execution of the recovery request.
     * Can also trigger the start of the execution by passing true to '_execute' parameter.
     * Once triggered the recovery is pending for the recovery period before it can be finalised.
     * @param _wallet The target wallet.
     * @param _newOwners The new owners' addressess.
     * @param _newThreshold The new threshold for the safe.
     * @param _signatures The guardians signatures.
     * @param _execute Whether to auto-start execution of recovery.
     */
    function multiConfirmRecovery(
        address _wallet,
        address[] calldata _newOwners,
        uint256 _newThreshold,
        SignatureData[] memory _signatures,
        bool _execute
    ) external {
        require(_newOwners.length > 0, "SM: owners cannot be empty");
        require(_newThreshold > 0 && _newOwners.length >= _newThreshold, "SM: invalid new threshold");
        require(_signatures.length > 0, "SM: empty signatures");
        uint256 guardiansThreshold = threshold(_wallet);
        require(guardiansThreshold > 0, "SM: empty guardians");
        //
        uint256 _nonce = nonce(_wallet);
        bytes32 recoveryHash = getRecoveryHash(_wallet, _newOwners, _newThreshold, _nonce);
        address lastSigner = address(0);
        for (uint256 i = 0; i < _signatures.length; i++) {
            SignatureData memory value = _signatures[i];
            if (value.signature.length == 0) {
                require(isGuardian(_wallet, msg.sender), "SM: sender not a guardian");
                require(msg.sender == value.signer, "SM: null signature should have the signer as the sender");
            } else {
                validateGuardianSignature(_wallet, recoveryHash, value.signer, value.signature);
            }
            require(value.signer > lastSigner, "SM: duplicate signers/invalid ordering");
            confirmedHashes[recoveryHash][value.signer] = true;
            lastSigner = value.signer;
        }
        //
        if (!_execute) return;
        uint256 _approvalCount = getRecoveryApprovals(_wallet, _newOwners, _newThreshold);
        require(_approvalCount >= guardiansThreshold, "SM: confirmed signatures less than threshold");
        _executeRecovery(_wallet, _newOwners, _newThreshold, _approvalCount);
    }

    /**
     * @notice Lets the guardians start the execution of the recovery request.
     * Once triggered the recovery is pending for the recovery period before it can be finalised.
     * @param _wallet The target wallet.
     * @param _newOwners The new owners' addressess.
     * @param _newThreshold The new threshold for the safe.
     */
    function executeRecovery(address _wallet, address[] calldata _newOwners, uint256 _newThreshold) external {
        uint256 guardiansThreshold = threshold(_wallet);
        require(guardiansThreshold > 0, "SM: empty guardians");
        //
        uint256 _approvalCount = getRecoveryApprovals(_wallet, _newOwners, _newThreshold);
        require(_approvalCount >= guardiansThreshold, "SM: confirmed signatures less than threshold");
        _executeRecovery(_wallet, _newOwners, _newThreshold, _approvalCount);
    }

    function _executeRecovery(address _wallet, address[] calldata _newOwners, uint256 _newThreshold, uint256 _approvalCount) internal {
        uint256 _nonce = nonce(_wallet);
        // If an ongoing recovery exists, replace only if more guardians than the previous guardians have approved this replacement
        RecoveryRequest storage request = recoveryRequests[_wallet];
        if (request.executeAfter > 0) {
            require(_approvalCount > request.guardiansApprovalCount, "SM: not enough approvals for replacement");
            delete recoveryRequests[_wallet];
            emit RecoveryCanceled(_wallet, _nonce - 1);
        }
        // Start recovery execution
        uint64 executeAfter = uint64(block.timestamp + recoveryPeriod);
        recoveryRequests[_wallet] = RecoveryRequest(_approvalCount, _newThreshold, executeAfter, _newOwners);
        walletsNonces[_wallet]++;
        emit RecoveryExecuted(_wallet, _newOwners, _newThreshold, _nonce, executeAfter, _approvalCount);
    }

    /**
     * @notice Finalizes an ongoing recovery request if the recovery period is over.
     * The method is public and callable by anyone to enable orchestration.
     * @param _wallet The target wallet.
     */
    function finalizeRecovery(address _wallet) external whenRecovery(_wallet) {
        RecoveryRequest storage request = recoveryRequests[_wallet];
        require(uint64(block.timestamp) >= request.executeAfter, "SM: recovery period still pending");
        address[] memory newOwners = request.newOwners;
        uint256 newThreshold = request.newThreshold;
        delete recoveryRequests[_wallet];

        ISafe safe = ISafe(payable(_wallet));
        address[] memory owners = safe.getOwners();

        for (uint256 i = (owners.length - 1); i > 0; --i) {
            bool success = safe.execTransactionFromModule({
                to: _wallet,
                value: 0,
                data: abi.encodeCall(IOwnerManager.removeOwner, (owners[i - 1], owners[i], 1)),
                operation: Enum.Operation.Call
            });
            if (!success) {
                revert("SM: owner removal failed");
            }
        }

        for (uint256 i = 0; i < newOwners.length; i++) {
            require(!isGuardian(_wallet, newOwners[i]), "SM: new owner cannot be guardian");
            bool success;
            if (i == 0) {
                if (newOwners[i] == owners[i]) continue;
                success = safe.execTransactionFromModule({
                    to: _wallet,
                    value: 0,
                    data: abi.encodeCall(IOwnerManager.swapOwner, (SENTINEL_OWNERS, owners[i], newOwners[i])),
                    operation: Enum.Operation.Call
                });
                if (!success) {
                    revert("SM: owner replacement failed");
                }
                continue;
            }
            success = safe.execTransactionFromModule({
                to: _wallet,
                value: 0,
                data: abi.encodeCall(IOwnerManager.addOwnerWithThreshold, (newOwners[i], 1)),
                operation: Enum.Operation.Call
            });
            if (!success) {
                revert("SM: owner addition failed");
            }
        }

        if (newThreshold > 1) {
            bool success = safe.execTransactionFromModule({
                to: _wallet,
                value: 0,
                data: abi.encodeCall(IOwnerManager.changeThreshold, (newThreshold)),
                operation: Enum.Operation.Call
            });
            if (!success) {
                revert("SM: change threshold failed");
            }
        }

        emit RecoveryFinalized(_wallet, newOwners, newThreshold, walletsNonces[_wallet] - 1);
    }

    /**
     * @notice Lets the owner cancel an ongoing recovery request.
     * @param _wallet The target wallet.
     */
    function cancelRecovery(address _wallet) external authorized(_wallet) whenRecovery(_wallet) {
        delete recoveryRequests[_wallet];
        emit RecoveryCanceled(_wallet, walletsNonces[_wallet] - 1);
    }

    /**
     * @notice Lets the owner add a guardian for its wallet.
     * @param _wallet The target wallet.
     * @param _guardian The guardian to add.
     * @param _threshold The new threshold that will be set after addition.
     */
    function addGuardianWithThreshold(address _wallet, address _guardian, uint256 _threshold) external authorized(_wallet) {
        guardianStorage.addGuardianWithThreshold(_wallet, _guardian, _threshold);
    }

    /**
     * @notice Lets the owner revoke a guardian from its wallet.
     * @param _wallet The target wallet.
     * @param _prevGuardian The previous guardian linking to the guardian in the linked list.
     * @param _guardian The guardian to revoke.
     * @param _threshold The new threshold that will be set after execution of revocation.
     */
    function revokeGuardianWithThreshold(
        address _wallet,
        address _prevGuardian,
        address _guardian,
        uint256 _threshold
    ) external authorized(_wallet) {
        guardianStorage.revokeGuardianWithThreshold(_wallet, _prevGuardian, _guardian, _threshold);
    }

    /**
     * @notice Lets the owner change the guardian threshold required to initiate a recovery.
     * @param _wallet The target wallet.
     * @param _threshold The new threshold that will be set after execution of revocation.
     */
    function changeThreshold(address _wallet, uint256 _threshold) external authorized(_wallet) {
        guardianStorage.changeThreshold(_wallet, _threshold);
    }

    /**
     * @notice Retrieves the wallet's current ongoing recovery request.
     * @param _wallet The target wallet.
     * @return request The wallet's current recovery request
     */
    function getRecoveryRequest(address _wallet) public view returns (RecoveryRequest memory request) {
        return recoveryRequests[_wallet];
    }

    /**
     * @notice Retrieves the guardian approval count for this particular recovery request at current nonce.
     * @param _wallet The target wallet.
     * @param _newOwners The new owners' addressess.
     * @param _newThreshold The new threshold for the safe.
     * @return approvalCount The wallet's current recovery request
     */
    function getRecoveryApprovals(
        address _wallet,
        address[] calldata _newOwners,
        uint256 _newThreshold
    ) public view returns (uint256 approvalCount) {
        uint256 _nonce = nonce(_wallet);
        bytes32 recoveryHash = getRecoveryHash(_wallet, _newOwners, _newThreshold, _nonce);
        address[] memory guardians = getGuardians(_wallet);
        approvalCount = 0;
        for (uint256 i = 0; i < guardians.length; i++) {
            if (confirmedHashes[recoveryHash][guardians[i]]) {
                approvalCount++;
            }
        }
    }

    /**
     * @notice Retrieves specific guardian approval status a particular recovery request at current nonce.
     * @param _wallet The target wallet.
     * @param _guardian The guardian.
     * @param _newOwners The new owners' addressess.
     * @param _newThreshold The new threshold for the safe.
     * @return approvalCount The wallet's current recovery request
     */
    function hasGuardianApproved(
        address _wallet,
        address _guardian,
        address[] calldata _newOwners,
        uint256 _newThreshold
    ) public view returns (bool) {
        uint256 _nonce = nonce(_wallet);
        bytes32 recoveryHash = getRecoveryHash(_wallet, _newOwners, _newThreshold, _nonce);
        return confirmedHashes[recoveryHash][_guardian];
    }

    /**
     * @notice Checks if an address is a guardian for a wallet.
     * @param _wallet The target wallet.
     * @param _guardian The address to check.
     * @return _isGuardian `true` if the address is a guardian for the wallet otherwise `false`.
     */
    function isGuardian(address _wallet, address _guardian) public view returns (bool _isGuardian) {
        return guardianStorage.isGuardian(_wallet, _guardian);
    }

    /**
     * @notice Counts the number of active guardians for a wallet.
     * @param _wallet The target wallet.
     * @return _count The number of active guardians for a wallet.
     */
    function guardiansCount(address _wallet) public view returns (uint256 _count) {
        return guardianStorage.guardiansCount(_wallet);
    }

    /**
     * @dev Retrieves the wallet threshold count.
     * @param _wallet The target wallet.
     * @return _threshold Threshold count.
     */
    function threshold(address _wallet) public view returns (uint256 _threshold) {
        return guardianStorage.threshold(_wallet);
    }

    /**
     * @notice Get the active guardians for a wallet.
     * @param _wallet The target wallet.
     * @return _guardians the active guardians for a wallet.
     */
    function getGuardians(address _wallet) public view returns (address[] memory _guardians) {
        return guardianStorage.getGuardians(_wallet);
    }

    /**
     * @notice Get the module nonce for a wallet.
     * @param _wallet The target wallet.
     * @return _nonce the nonce for this wallet.
     */
    function nonce(address _wallet) public view returns (uint256 _nonce) {
        return walletsNonces[_wallet];
    }
}
