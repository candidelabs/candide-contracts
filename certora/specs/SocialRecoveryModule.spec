using SafeHarness as safeContract;

methods {
    // Safe Functions
    function safeContract.isModuleEnabled(address) external returns (bool) envfree;
}

// A setup function that requires Safe contract to enabled the Social Recovery
// Module.
function requireSocialRecoveryModuleEnabled() {
    require(safeContract.isModuleEnabled(currentContract));
}

// This is a dummy rule to verify the Safe Contract Setup with the Social Recovery
// Module is working as intended.
rule recoveryModuleCanBeDisabled {
    env e;
    address prevModule;

    requireSocialRecoveryModuleEnabled();

    safeContract.disableModule@withrevert(e, prevModule, currentContract);
    bool isReverted = lastReverted;

    assert !isReverted => !safeContract.isModuleEnabled(currentContract);
}
