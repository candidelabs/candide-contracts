using SafeHarness as safeContract;
using GuardianStorageHarness as guardianStorageContract;

definition SENTINEL() returns address = 1;

methods {
    // Social Recovery Module Functions
    function isGuardian(address, address) external returns (bool) envfree;
    function guardiansCount(address) external returns (uint256) envfree;
    function threshold(address) external returns (uint256) envfree;
    function nonce(address) external returns (uint256) envfree;
    function getRecoveryHash(address, address[], uint256, uint256) external returns (bytes32) envfree;
    function getRecoveryApprovals(address, address[], uint256) external returns (uint256) envfree;

    // Guardian Storage Functions
    function guardianStorageContract.countGuardians(address) external returns (uint256) envfree;
    function guardianStorageContract.getGuardians(address) external returns (address[]) envfree;

    // Safe Functions
    function safeContract.isModuleEnabled(address module) external returns (bool) envfree;
    function safeContract.isOwner(address owner) external returns (bool) envfree;

    // Wildcard Functions (Because of use of ISafe interface in Social Recovery Module)
    function _.isModuleEnabled(address module) external => summarizeSafeIsModuleEnabled(calledContract, module) expect bool ALL; // `calledContract` is a special variable.
    function _.isOwner(address owner) external => summarizeSafeIsOwner(calledContract, owner) expect bool ALL;
}

// A summary function that asserts that all `ISafe.isModuleEnabled` calls are done
// to the `safeContract`, returning the same result as `safeContract.isModuleEnabled(...)`.
function summarizeSafeIsModuleEnabled(address callee, address module) returns bool {
    assert callee == safeContract;
    return safeContract.isModuleEnabled(module);
}

// A summary function that asserts that all `ISafe.isOwner` calls are done
// to the `safeContract`, returning the same result as `safeContract.isOwner(...)`.
function summarizeSafeIsOwner(address callee, address owner) returns bool {
    assert callee == safeContract;
    return safeContract.isOwner(owner);
}

// A setup function that requires Safe contract to enable the Social Recovery Module.
function requireSocialRecoveryModuleEnabled() {
    require(safeContract.isModuleEnabled(currentContract));
}

// Setup function that `require`s the integrity of the guardians linked list
// in the `GuardianStorage` contract. This is needed as `invariant`s can only
// be proven for `currentContract` and not `guardianStorageContract`, however,
// the integrity of this list is required for rules and invariants of the
// recovery module. For proof of this integrity, see `GuardianStorage.spec`.
function requireGuardiansLinkedListIntegrity(address guardian) {
    uint256 index;
    require index < guardianStorageContract.entries[safeContract].count;
    require currentContract.isGuardian(safeContract, guardian) =>
        guardianStorageContract.getGuardians(safeContract)[index] == guardian;
    require !currentContract.isGuardian(safeContract, guardian) =>
        (forall address prevGuardian. guardianStorageContract.entries[safeContract].guardians[prevGuardian] != guardian);
    require guardianStorageContract.entries[safeContract].count == guardianStorageContract.countGuardians(safeContract);
}

// This integrity rule verifies that if the addGuardianWithThreshold(...) executes, then ensure that:
// - the Social Recovery Module is enabled
// - the caller to the Module has to be the Safe Contract
// - the new guardian is added to the guardian list,
// - and no other account (guardian or not) is affected.
rule addGuardianWorksAsExpected(env e, address guardian, uint256 threshold, address otherAccount) {
    requireGuardiansLinkedListIntegrity(guardian);

    // If threshold is same as before, then no change is made to the threshold during guardian addition.
    // Thus, it is required to add this check to ensure no initial state have threshold > count.
    require threshold == guardianStorageContract.entries[safeContract].threshold =>
        guardianStorageContract.entries[safeContract].threshold <= guardianStorageContract.entries[safeContract].count;

    uint256 currentGuardiansCount = guardianStorageContract.entries[safeContract].count;
    bool otherAccountIsGuardian = currentContract.isGuardian(safeContract, otherAccount);

    currentContract.addGuardianWithThreshold(e, safeContract, guardian, threshold);

    assert safeContract.isModuleEnabled(currentContract);
    assert e.msg.sender == safeContract;
    assert currentContract.isGuardian(safeContract, guardian);
    assert guardian != otherAccount => otherAccountIsGuardian == currentContract.isGuardian(safeContract, otherAccount);
    assert currentGuardiansCount + 1 == to_mathint(guardianStorageContract.entries[safeContract].count);
    assert threshold > 0 && threshold <= guardianStorageContract.entries[safeContract].count;
}

// This integrity rule verifies that the guardian can always be added considering ideal conditions.
rule guardianCanAlwaysBeAdded(env e, address guardian, uint256 threshold) {
    requireSocialRecoveryModuleEnabled();
    requireGuardiansLinkedListIntegrity(guardian);

    // No value should be sent with the transaction.
    require e.msg.value == 0;

    uint256 currentGuardiansCount = guardianStorageContract.entries[safeContract].count;    
    // The guardian count should be less than the maximum value to prevent overflow.
    require currentGuardiansCount < max_uint256; // To prevent overflow (Realistically can't reach).

    // The guardian should not be values such as zero, sentinel, or the Safe contract itself.
    require guardian != 0;
    require guardian != SENTINEL();
    require guardian != safeContract;

    // The guardian should not be an owner of the Safe contract at the time of addition.
    require !safeContract.isOwner(guardian);
    // The guardian should not be already added as a guardian.
    require !currentContract.isGuardian(safeContract, guardian);

    // The threshold must be greater than 0 and less than or equal to the total number of guardians after adding the new guardian.
    require threshold > 0 && to_mathint(threshold) <= guardianStorageContract.entries[safeContract].count + 1;

    // Safe contract should be the sender of the transaction.
    require e.msg.sender == safeContract;
    currentContract.addGuardianWithThreshold@withrevert(e, safeContract, guardian, threshold);
    bool isReverted = lastReverted;

    assert !isReverted &&
        currentContract.isGuardian(safeContract, guardian) &&
        currentGuardiansCount + 1 == to_mathint(guardianStorageContract.entries[safeContract].count);
}

// This integrity rule verifies the possibilites in which the addition of a new guardian can revert.
rule addGuardianRevertPossibilities(env e, address guardian, uint256 threshold) {
    bool isGuardian = currentContract.isGuardian(safeContract, guardian);

    currentContract.addGuardianWithThreshold@withrevert(e, safeContract, guardian, threshold);
    bool isReverted = lastReverted;

    assert isReverted =>
        isGuardian ||
        e.msg.sender != safeContract ||
        e.msg.value != 0 ||
        guardian == 0 ||
        guardian == SENTINEL() ||
        guardian == safeContract ||
        safeContract.isOwner(guardian) ||
        threshold == 0 ||
        to_mathint(threshold) > guardianStorageContract.entries[safeContract].count + 1 ||
        guardianStorageContract.entries[safeContract].count == max_uint256 ||
        !safeContract.isModuleEnabled(currentContract);
}

// This integrity rule verifies that if the revokeGuardianWithThreshold(...) executes, then ensure that:
// - the Social Recovery Module is enabled
// - the caller to the Module has to be the Safe Contract
// - the guardian is revoked from the guardian list
// - the linked list integrity remains,
// - and no other account (guardian or not) is affected.
rule revokeGuardiansWorksAsExpected(env e, address guardian, address prevGuardian, uint256 threshold, address otherAccount) {
    requireGuardiansLinkedListIntegrity(guardian);

    address nextGuardian = guardianStorageContract.entries[safeContract].guardians[guardian];
    bool otherAccountIsGuardian = currentContract.isGuardian(safeContract, otherAccount);

    uint256 currentGuardiansCount = guardianStorageContract.entries[safeContract].count;

    currentContract.revokeGuardianWithThreshold(e, safeContract, prevGuardian, guardian, threshold);

    assert safeContract.isModuleEnabled(currentContract);
    assert e.msg.sender == safeContract;
    assert !currentContract.isGuardian(safeContract, guardian);
    assert guardianStorageContract.entries[safeContract].guardians[prevGuardian] == nextGuardian;
    assert guardian != otherAccount => otherAccountIsGuardian == currentContract.isGuardian(safeContract, otherAccount);
    assert currentGuardiansCount - 1 == to_mathint(guardianStorageContract.entries[safeContract].count);
    assert threshold <= guardianStorageContract.entries[safeContract].count;
}

// This integrity rule verifies that the guardian can always be revoked considering ideal conditions.
rule guardianCanAlwaysBeRevoked(env e, address guardian, address prevGuardian, uint256 threshold) {
    requireSocialRecoveryModuleEnabled();
    requireGuardiansLinkedListIntegrity(guardian);

    // No value should be sent with the transaction.
    require e.msg.value == 0;
    // If new threshold is 0, then you must be removing the last guardian meaning the guardian count should be 1.
    require threshold == 0 => guardianStorageContract.entries[safeContract].count == 1;
    // The new threshold should be less than or equal to the guardian count after removing.
    require to_mathint(threshold) <= guardianStorageContract.entries[safeContract].count - 1;
    // The address should be a guardian.
    require currentContract.isGuardian(safeContract, guardian);

    address nextGuardian = guardianStorageContract.entries[safeContract].guardians[guardian];
    require guardianStorageContract.entries[safeContract].guardians[prevGuardian] == guardian;

    uint256 currentGuardiansCount = guardianStorageContract.entries[safeContract].count;    

    // Safe Contract should be the sender of the transaction.
    require e.msg.sender == safeContract;
    currentContract.revokeGuardianWithThreshold@withrevert(e, safeContract, prevGuardian, guardian, threshold);
    bool isReverted = lastReverted;

    assert !isReverted &&
        guardianStorageContract.entries[safeContract].guardians[prevGuardian] == nextGuardian &&
        !currentContract.isGuardian(safeContract, guardian) &&
        currentGuardiansCount - 1 == to_mathint(guardianStorageContract.entries[safeContract].count);
}

// This integrity rule verifies the possibilites in which the revocation of a new guardian can revert.
rule revokeGuardianRevertPossibilities(env e, address prevGuardian, address guardian, uint256 threshold) {
    requireGuardiansLinkedListIntegrity(guardian);

    bool isGuardian = currentContract.isGuardian(safeContract, guardian);

    currentContract.revokeGuardianWithThreshold@withrevert(e, safeContract, prevGuardian, guardian, threshold);
    bool isReverted = lastReverted;

    assert isReverted =>
        !isGuardian ||
        e.msg.sender != safeContract ||
        e.msg.value != 0 ||
        !safeContract.isModuleEnabled(currentContract) ||
        guardianStorageContract.entries[safeContract].guardians[prevGuardian] != guardian ||
        to_mathint(threshold) > guardianStorageContract.entries[safeContract].count - 1 ||
        (threshold == 0 && guardianStorageContract.entries[safeContract].count != 1);
}

// This rule verifies that the guardian can always initiate recovery considering some ideal conditions.
rule confirmRecoveryCanAlwaysBeInitiatedByGuardian(env e, address guardian, address[] newOwners, uint256 newThreshold, bool execute) {
    uint256 index;
    // Index must be valid.
    require index < newOwners.length;

    // The threshold should always be greater than 0 and less than the number of new owners.
    require newThreshold > 0;
    require newThreshold <= newOwners.length;

    // No ether should be sent as part of this function call, and the caller should be a guardian.
    require e.msg.value == 0;
    require e.msg.sender == guardian;
    require currentContract.isGuardian(safeContract, guardian);

    requireGuardiansLinkedListIntegrity(guardian);

    // Nonce and timestamp + recovery period should not overflow (Realistically can't reach).
    require e.block.timestamp + currentContract.recoveryPeriod <= max_uint64;
    uint256 nonce = currentContract.nonce(safeContract);
    require nonce < max_uint256;

    bytes32 recoveryHash = currentContract.getRecoveryHash(safeContract, newOwners, newThreshold, nonce);
    // This ensures that the recovery is not already initiated.
    require currentContract.recoveryRequests[safeContract].executeAfter == 0;

    // This ensures that the required threshold is reached.
    require currentContract.getRecoveryApprovals(safeContract, newOwners, newThreshold) == currentContract.threshold(safeContract);

    currentContract.confirmRecovery@withrevert(e, safeContract, newOwners, newThreshold, execute);
    bool isReverted = lastReverted;

    assert !isReverted &&
        currentContract.confirmedHashes[recoveryHash][e.msg.sender];
    assert execute =>
        to_mathint(currentContract.recoveryRequests[safeContract].executeAfter) == e.block.timestamp + currentContract.recoveryPeriod &&
        currentContract.recoveryRequests[safeContract].newThreshold == newThreshold &&
        currentContract.recoveryRequests[safeContract].newOwners.length == newOwners.length &&
        currentContract.recoveryRequests[safeContract].newOwners[index] == newOwners[index];
}
