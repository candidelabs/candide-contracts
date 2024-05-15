using SafeHarness as safeContract;

methods {
    // Safe Functions
    function safeContract.isModuleEnabled(address) external returns (bool) envfree;
}

definition MAX_UINT256() returns uint256 = 0xffffffffffffffffffffffffffffffff;

persistent ghost reach(address, address) returns bool {
    init_state axiom forall address X. forall address Y. reach(X, Y) == (X == Y || to_mathint(Y) == 0);
}


persistent ghost ghostSuccCount(address) returns mathint {
    init_state axiom forall address X. ghostSuccCount(X) == 0;
}

persistent ghost uint256 ghostOwnerCount;

persistent ghost address SENTINEL {
    axiom to_mathint(SENTINEL) == 1;
}

persistent ghost address NULL {
    axiom to_mathint(NULL) == 0;
}
