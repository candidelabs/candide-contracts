using SafeHarness as safeContract;

methods {
    // Social Recovery Module Functions
    function nonce(address) external returns (uint256) envfree;
    function isGuardian(address, address) external returns (bool) envfree;
    function compareByteArrays(bytes, bytes) external returns (bool) envfree;

    // Social Recovery Module Summaries
    function getRecoveryHash(address, address[] calldata, uint256, uint256) internal returns (bytes32) => CONSTANT;
    // The prover analysis fails in functions with heavy use of assembly code,
    // so we're summarizing the `isValidSignatureNow` function with a ghost function to avoid this issue and timeouts
    function SignatureChecker.isValidSignatureNow(address signer, bytes32 dataHash, bytes memory signature) internal returns (bool) => isValidSignatureNowSummary(signer, dataHash, signature);

    // Wildcard Functions
    function _.execTransactionFromModule(address to, uint256 value, bytes data, Enum.Operation operation) external => DISPATCHER(false);
    function _.isModuleEnabled(address module) external => DISPATCHER(false);
    function _.isOwner(address owner) external => DISPATCHER(false);
    function _.getOwners() external => DISPATCHER(false);
    function _._ external => DISPATCH[] default NONDET;
}

// The prover analysis fails in functions with heavy use of assembly code,
// so we're summarizing the `isValidSignatureNow` function with a ghost function to avoid this issue and timeouts
ghost isValidSignatureNowSummary(address, bytes32, bytes) returns bool;

// There's no method to get a confirmation count per recovery hash, so we're using a ghost variable 
// with a hook to increment it when a recovery is confirmed.
persistent ghost mathint recoveryConfirmationCount {
    init_state axiom recoveryConfirmationCount == 0;
}

hook Sstore confirmedHashes[KEY bytes32 recoveryHash][KEY address guardian] bool value {
    recoveryConfirmationCount = recoveryConfirmationCount + 1;
}

// This rule the `multiConfirmRecovery` function can only be called with legitimate signatures.
// It assumes that the harnessed `checkSignatures` function is implemented correctly and reverts if the signatures are invalid.
rule multiConfirmRecoveryOnlyWithLegitimateSignatures(env e) {
    address _wallet;
    address[] _newOwners;
    uint256 _newThreshold;
    uint256 walletNonce = currentContract.nonce(_wallet);
    SocialRecoveryModule.SignatureData[] signatures;
    bool _execute;
    bytes32 recoveryHash = getRecoveryHash(
        e,
        _wallet,
        _newOwners,
        _newThreshold,
        walletNonce
    );

    checkSignatures@withrevert(e, _wallet, recoveryHash, signatures);
    bool signatureCheckSuccess = !lastReverted;

    multiConfirmRecovery(e, _wallet, _newOwners, _newThreshold, signatures, _execute);
    bool multiConfirmRecoverySuccess = !lastReverted;

    assert signatureCheckSuccess <=> multiConfirmRecoverySuccess, "Recovery confirmed with invalid signatures";
}

// This rule checks that the number of approvals counted by the contract is equal to the number of valid signatures.
rule approvalsCountShouldEqualTheAmountOfSignatures(env e) {
    mathint recoveryConfirmationCountBefore = recoveryConfirmationCount;
    address _wallet;
    address[] _newOwners;
    uint256 _newThreshold;
    uint256 walletNonce = currentContract.nonce(_wallet);
    SocialRecoveryModule.SignatureData[] signatures;
    bool _execute;
    bytes32 recoveryHash = getRecoveryHash(
        e,
        _wallet,
        _newOwners,
        _newThreshold,
        walletNonce
    );

    multiConfirmRecovery(e, _wallet, _newOwners, _newThreshold, signatures, _execute);

    assert to_mathint(signatures.length) == recoveryConfirmationCount - recoveryConfirmationCountBefore, "More approvals counted than valid signatures";
}

// This rule checks that only supplied signatures and signers are counted as approvals.
rule noShadowApprovals(env e) {
    address _wallet;
    address[] _newOwners;
    uint256 _newThreshold;
    uint256 walletNonce = currentContract.nonce(_wallet);
    SocialRecoveryModule.SignatureData[] signatures;
    bool _execute;
    bytes32 recoveryHash = getRecoveryHash(
        e,
        _wallet,
        _newOwners,
        _newThreshold,
        walletNonce
    );
    address otherAddress;
    // We need to correctly initialize pre-state to ensure that the `otherAddress` is not a signer and has not confirmed the recovery.
    require !currentContract.isGuardian(_wallet, otherAddress) && !currentContract.confirmedHashes[recoveryHash][otherAddress];

    multiConfirmRecovery(e, _wallet, _newOwners, _newThreshold, signatures, _execute);

    assert forall uint256 i. i < signatures.length => currentContract.confirmedHashes[recoveryHash][signatures[i].signer], "Approvals were not correctly set";
    assert !currentContract.confirmedHashes[recoveryHash][otherAddress], "Other address should not be able to confirm recovery";
}

// This rule verifies that specifying the same signer twice in the signatures array will cause the transaction to revert.
// We cannot really verify the actual signature duplication because we summarize the `isValidSignatureNow` function, which makes the run time out if not summarized.
rule duplicateSignersRevert(env e) {
    address _wallet;
    address[] _newOwners;
    uint256 _newThreshold;
    uint256 walletNonce = currentContract.nonce(_wallet);
    SocialRecoveryModule.SignatureData[] signatures;
    bool _execute;
    bytes32 recoveryHash = getRecoveryHash(
        e,
        _wallet,
        _newOwners,
        _newThreshold,
        walletNonce
    );
    uint256 i1; uint256 i2;
    require i1 != i2;
    require signatures[i1].signer == signatures[i2].signer;

    multiConfirmRecovery@withrevert(e, _wallet, _newOwners, _newThreshold, signatures, _execute);
    bool multiConfirmReverted = lastReverted;

    assert multiConfirmReverted, "Duplicate signers should revert";
}
