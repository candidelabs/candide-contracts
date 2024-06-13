// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.12 <0.9.0;
import {SocialRecoveryModule} from "../../contracts/modules/social_recovery/SocialRecoveryModule.sol";
import {IGuardianStorage} from "../../contracts/modules/social_recovery/storage/IGuardianStorage.sol";

contract SocialRecoveryModuleHarness is SocialRecoveryModule {
    constructor(uint256 _recoveryPeriod) SocialRecoveryModule(_recoveryPeriod) {}

    /**
     * @notice Counts the guardians by iterating through the linked list starting at the sentinel address,
     * instead of relying on the count storage variable.
     * @dev This would not count "shadow" guardians that are not part of the linked list, which would
     * never happen assuming integrity of the linked list.
     * @param _wallet The target wallet.
     * @return count of guardians.
     */
    function countGuardians(address _wallet) public view returns (uint256 count) {
        GuardianStorageEntry storage entry = entries[_wallet];
        address currentGuardian = entry.guardians[SENTINEL_GUARDIANS];

        // The sentinel guardian pointing to address 0 is the initial state for the
        // guardian storage entry for an account and is equivalent to an empty list
        // where the sentinel points to itself. We handle this special case here.
        if (currentGuardian == address(0)) {
            return 0;
        }

        while (currentGuardian != SENTINEL_GUARDIANS) {
            currentGuardian = entry.guardians[currentGuardian];
            require(currentGuardian != address(0), "Guardian is address(0)");
            count++;
        }
    }

    /**
     * @notice Retrieves the guardian approval count for this particular recovery request at particular nonce.
     * @param _wallet The target wallet.
     * @param _newOwners The new owners' addressess.
     * @param _newThreshold The new threshold for the safe.
     * @param _nonce The nonce of the recovery request.
     * @return approvalCount The wallet's current recovery request
     */
    function getRecoveryApprovalsWithNonce(
        address _wallet,
        address[] calldata _newOwners,
        uint256 _newThreshold,
        uint256 _nonce
    ) public view returns (uint256 approvalCount) {
        bytes32 recoveryHash = getRecoveryHash(_wallet, _newOwners, _newThreshold, _nonce);
        address[] memory guardians = getGuardians(_wallet);
        approvalCount = 0;
        for (uint256 i = 0; i < guardians.length; i++) {
            if (confirmedHashes[recoveryHash][guardians[i]]) {
                approvalCount++;
            }
        }
    }    
}
