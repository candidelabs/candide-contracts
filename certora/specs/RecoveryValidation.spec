// v0.2.0 authorization epochs and owner validation. These rules execute the
// production entry points; neither owner validation nor nonce handling is summarized.
methods {
    function nonce(address) external returns (uint256) envfree;
    function isGuardian(address, address) external returns (bool) envfree;
    function getRecoveryHash(address, address[], uint256, uint256) external returns (bytes32) envfree;
    function hasGuardianApproved(address, address, address[], uint256) external returns (bool) envfree;
    // Cryptographic validity is independent of the state-machine properties here.
    function SignatureChecker.isValidSignatureNow(address, bytes32, bytes memory) internal returns (bool) => NONDET;
    function _.isModuleEnabled(address) external => NONDET;
    function _.isOwner(address) external => NONDET;
}

definition resetsRecovery(method f) returns bool =
    f.selector == sig:cancelRecovery().selector ||
    f.selector == sig:addGuardianWithThreshold(address,uint256).selector ||
    f.selector == sig:revokeGuardianWithThreshold(address,address,uint256).selector ||
    f.selector == sig:changeThreshold(uint256).selector;

// Includes cancellation without an active request and setting the same threshold.
rule configChangesAndCancellationResetRecovery(method f, env e, calldataarg args)
filtered { f -> resetsRecovery(f) }
{
    uint256 beforeNonce = nonce(e.msg.sender);
    f(e, args);
    assert to_mathint(nonce(e.msg.sender)) == beforeNonce + 1;
    assert currentContract.recoveryRequests[e.msg.sender].executableAt == 0;
}

rule resetClearsAllActiveRequestFields(method f, env e, calldataarg args, uint256 i)
filtered { f -> resetsRecovery(f) }
{
    require currentContract.recoveryRequests[e.msg.sender].executableAt > 0;
    require i < currentContract.recoveryRequests[e.msg.sender].newOwners.length;
    f(e, args);
    assert currentContract.recoveryRequests[e.msg.sender].guardiansApprovalCount == 0;
    assert currentContract.recoveryRequests[e.msg.sender].newThreshold == 0;
    assert currentContract.recoveryRequests[e.msg.sender].nonce == 0;
    assert currentContract.recoveryRequests[e.msg.sender].newOwners.length == 0;
    assert currentContract.recoveryRequests[e.msg.sender].newOwners[i] == 0;
}

rule resetDoesNotAffectOtherWallet(method f, env e, calldataarg args, address wallet, uint256 i)
filtered { f -> resetsRecovery(f) }
{
    require wallet != e.msg.sender;
    uint256 n = nonce(wallet);
    uint256 requestNonce = currentContract.recoveryRequests[wallet].nonce;
    uint256 approvals = currentContract.recoveryRequests[wallet].guardiansApprovalCount;
    uint256 ownerThreshold = currentContract.recoveryRequests[wallet].newThreshold;
    uint64 executableAt = currentContract.recoveryRequests[wallet].executableAt;
    uint256 length = currentContract.recoveryRequests[wallet].newOwners.length;
    address owner = currentContract.recoveryRequests[wallet].newOwners[i];
    f(e, args);
    assert nonce(wallet) == n;
    assert currentContract.recoveryRequests[wallet].nonce == requestNonce;
    assert currentContract.recoveryRequests[wallet].guardiansApprovalCount == approvals;
    assert currentContract.recoveryRequests[wallet].newThreshold == ownerThreshold;
    assert currentContract.recoveryRequests[wallet].executableAt == executableAt;
    assert currentContract.recoveryRequests[wallet].newOwners.length == length;
    assert currentContract.recoveryRequests[wallet].newOwners[i] == owner;
}

rule cancelAlwaysAdvancesNonceOrOverflows(env e) {
    require e.msg.value == 0;
    uint256 beforeNonce = nonce(e.msg.sender);
    cancelRecovery@withrevert(e);
    bool reverted = lastReverted;
    assert reverted <=> beforeNonce == max_uint256;
    assert !reverted => to_mathint(nonce(e.msg.sender)) == beforeNonce + 1;
}

rule staleConfirmationNonceReverts(env e, address wallet, address[] owners, uint256 ownerThreshold, uint256 suppliedNonce, bool execute) {
    require suppliedNonce != nonce(wallet);
    confirmRecovery@withrevert(e, wallet, owners, ownerThreshold, suppliedNonce, execute);
    assert lastReverted;
}

rule staleBatchNonceReverts(env e, address wallet, address[] owners, uint256 ownerThreshold, uint256 suppliedNonce, SocialRecoveryModule.SignatureData[] signatures, bool execute) {
    require suppliedNonce != nonce(wallet);
    multiConfirmRecovery@withrevert(e, wallet, owners, ownerThreshold, suppliedNonce, signatures, execute);
    assert lastReverted;
}

// Observe the pre-state guardian membership, since scheduling does not change it.
function assertValidOwners(address wallet, address[] owners, uint256 ownerThreshold) {
    assert owners.length > 0 && ownerThreshold > 0 && ownerThreshold <= owners.length;
    assert forall uint256 i. i < owners.length =>
        owners[i] != 0 && owners[i] != 1 && owners[i] != wallet && currentContract.entries[wallet].guardians[owners[i]] == 0;
    assert forall uint256 i. forall uint256 j.
        i < j && j < owners.length => owners[i] != owners[j];
}

rule confirmationRequiresValidOwners(env e, address wallet, address[] owners, uint256 ownerThreshold, uint256 suppliedNonce, bool execute) {
    confirmRecovery(e, wallet, owners, ownerThreshold, suppliedNonce, execute);
    assertValidOwners(wallet, owners, ownerThreshold);
}

rule batchRequiresValidOwners(env e, address wallet, address[] owners, uint256 ownerThreshold, uint256 suppliedNonce, SocialRecoveryModule.SignatureData[] signatures, bool execute) {
    multiConfirmRecovery(e, wallet, owners, ownerThreshold, suppliedNonce, signatures, execute);
    assertValidOwners(wallet, owners, ownerThreshold);
}

rule executionRequiresValidOwners(env e, address wallet, address[] owners, uint256 ownerThreshold) {
    executeRecovery(e, wallet, owners, ownerThreshold);
    assertValidOwners(wallet, owners, ownerThreshold);
}

rule schedulingStoresNonceAndRequiresStrongerReplacement(env e, address wallet, address[] owners, uint256 ownerThreshold, uint256 i) {
    uint256 beforeNonce = nonce(wallet);
    uint64 beforeTime = currentContract.recoveryRequests[wallet].executableAt;
    uint256 beforeApprovals = currentContract.recoveryRequests[wallet].guardiansApprovalCount;
    require i < owners.length;
    executeRecovery(e, wallet, owners, ownerThreshold);
    assert currentContract.recoveryRequests[wallet].nonce == beforeNonce;
    assert to_mathint(nonce(wallet)) == beforeNonce + 1;
    assert currentContract.recoveryRequests[wallet].newThreshold == ownerThreshold;
    assert currentContract.recoveryRequests[wallet].newOwners.length == owners.length;
    assert currentContract.recoveryRequests[wallet].newOwners[i] == owners[i];
    assert beforeTime > 0 => currentContract.recoveryRequests[wallet].guardiansApprovalCount > beforeApprovals;
}

// The recovery hash executes the production encoding, so a confirmation cannot be replayed for a
// different wallet, owner list (contents or order), threshold or nonce. Chain ID and module address
// binding need independent environments/instances and remain covered by runtime tests.
rule recoveryHashBindsRequest(address wallet1, address[] owners1, uint256 threshold1, uint256 nonce1,
                              address wallet2, address[] owners2, uint256 threshold2, uint256 nonce2, uint256 i) {
    require i < owners1.length;
    bytes32 hash1 = getRecoveryHash(wallet1, owners1, threshold1, nonce1);
    bytes32 hash2 = getRecoveryHash(wallet2, owners2, threshold2, nonce2);
    assert hash1 == hash2 =>
        wallet1 == wallet2 && threshold1 == threshold2 && nonce1 == nonce2 &&
        owners1.length == owners2.length && owners1[i] == owners2[i];
}

// Confirmations are only ever recorded for the wallet's current nonce, never for a later round.
invariant noConfirmationForFutureNonce(address wallet, address[] owners, uint256 ownerThreshold, uint256 n, address guardian)
    n > nonce(wallet) => !currentContract.confirmedHashes[getRecoveryHash(wallet, owners, ownerThreshold, n)][guardian];

// L-04: whatever advances the nonce (cancellation, guardian configuration change or scheduling) starts
// an epoch without approvals, so old approvals cannot authorize the next round.
rule nonceAdvanceStartsCleanEpoch(method f, env e, calldataarg args, address wallet, address guardian, address[] owners, uint256 ownerThreshold, uint256 n) {
    uint256 beforeNonce = nonce(wallet);
    requireInvariant noConfirmationForFutureNonce(wallet, owners, ownerThreshold, n, guardian);
    f(e, args);
    uint256 afterNonce = nonce(wallet);
    require n == afterNonce;
    assert afterNonce != beforeNonce =>
        !currentContract.confirmedHashes[getRecoveryHash(wallet, owners, ownerThreshold, afterNonce)][guardian];
}

// I-05: confirming an already confirmed hash without executing leaves the recovery state unchanged.
rule repeatedConfirmationIsNoop(env e, address wallet, address[] owners, uint256 ownerThreshold, uint256 suppliedNonce,
                                bytes32 hash, address guardian, address otherWallet) {
    require currentContract.confirmedHashes[getRecoveryHash(wallet, owners, ownerThreshold, suppliedNonce)][e.msg.sender];
    bool confirmed = currentContract.confirmedHashes[hash][guardian];
    uint256 n = nonce(otherWallet);
    uint256 approvals = currentContract.recoveryRequests[otherWallet].guardiansApprovalCount;
    uint64 executableAt = currentContract.recoveryRequests[otherWallet].executableAt;
    confirmRecovery(e, wallet, owners, ownerThreshold, suppliedNonce, false);
    assert currentContract.confirmedHashes[hash][guardian] == confirmed;
    assert nonce(otherWallet) == n;
    assert currentContract.recoveryRequests[otherWallet].guardiansApprovalCount == approvals;
    assert currentContract.recoveryRequests[otherWallet].executableAt == executableAt;
}

rule approvalRequiresCurrentGuardian(address wallet, address guardian, address[] owners, uint256 ownerThreshold) {
    bytes32 hash = getRecoveryHash(wallet, owners, ownerThreshold, nonce(wallet));
    bool approved = hasGuardianApproved(wallet, guardian, owners, ownerThreshold);
    assert approved <=> isGuardian(wallet, guardian) && currentContract.confirmedHashes[hash][guardian];
}
