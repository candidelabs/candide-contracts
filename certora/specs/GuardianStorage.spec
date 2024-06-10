/*
 * Spec for linked list reachability for Guardians.
 * This file is derived from OwnerReach.spec for a Safe account.
 * https://github.com/safe-global/safe-smart-account/blob/main/certora/specs/OwnerReach.spec
 *
 * This file uses a reach predicate:
 *    ghost ghostReach(address, address, address) returns bool
 * to represent the transitive of the next
 * relation given by the "guardians" field relation for a specific wallet.
 *
 * The idea comes from the paper
 *
 * [1] Itzhaky, S., Banerjee, A., Immerman, N., Nanevski, A., Sagiv, M. (2013).
 *     Effectively-Propositional Reasoning about Reachability in Linked Data Structures.
 *     In: CAV 2013. Springer, https://doi.org/10.1007/978-3-642-39799-8_53
 */

using SafeHarness as safeContract;

methods {
    // Safe Functions
    function safeContract.isModuleEnabled(address) external returns (bool) envfree;

    // GuardianManager Functions
    function threshold(address) external returns (uint256) envfree;
    function isGuardian(address, address) external returns (bool) envfree;
}

// A ghost function to check the reachability for each wallet address for given two addresses.
persistent ghost ghostReach(address, address, address) returns bool {
    init_state axiom forall address X. forall address Y. forall address wallet. ghostReach(wallet, X, Y) == (X == Y || to_mathint(Y) == 0);
}

// A ghost variable to store the list of guardians for each wallet.
persistent ghost mapping(address => mapping(address => address)) ghostGuardians {
    init_state axiom forall address wallet. forall address X. to_mathint(ghostGuardians[wallet][X]) == 0;
}

// A ghost function to store the number of successors for each guardian for a given wallet address. This is used to verify the count of guardians for a given wallet address.
persistent ghost ghostSuccCount(address, address) returns mathint {
    init_state axiom forall address wallet. forall address X. ghostSuccCount(wallet, X) == 0;
}

// A ghost variable to store the number of guardians for each wallet.
persistent ghost mapping(address => uint256) ghostGuardianCount {
    init_state axiom forall address X. to_mathint(ghostGuardianCount[X]) == 0;
}

persistent ghost address SENTINEL {
    axiom to_mathint(SENTINEL) == 1;
}

persistent ghost address NULL {
    axiom to_mathint(NULL) == 0;
}

// Verifies that if the threshold is Zero, then there should be no guardian.
invariant guardianCountZeroIffThresholdZero(address wallet)
    threshold(wallet) == 0 <=> ghostGuardianCount[wallet] == 0
    {
        preserved {
            requireInvariant reachNull();
            requireInvariant reachInvariant();
            requireInvariant inListReachable();
            requireInvariant reachableInList();
        }
    }

// Verifies that threshold is less than or equal to the number of guardians for a given wallet.
invariant thresholdSet(address wallet)
    (threshold(wallet) <= ghostGuardianCount[wallet])
    {
        preserved {
            requireInvariant reachNull();
            requireInvariant reachInvariant();
            requireInvariant inListReachable();
            requireInvariant reachableInList();
        }
    }

// Every element with 0 in the guardians field can only reach the null pointer and itself.
invariant nextNull()
    (forall address wallet. ghostGuardians[wallet][NULL] == 0) &&
    (forall address wallet. forall address X. forall address Y. ghostGuardians[wallet][X] == 0 && ghostReach(wallet, X, Y) => X == Y || Y == 0)
    {
        preserved {
            requireInvariant reachInvariant();
            requireInvariant inListReachable();
            requireInvariant reachableInList();
            requireInvariant reachNull();
        }
    }

// Every element reaches the 0 pointer (because we replace in reach the end sentinel with null).
invariant reachNull()
    (forall address wallet. forall address X. ghostReach(wallet, X, NULL))
    {
        preserved {
            requireInvariant reachInvariant();
            requireInvariant inListReachable();
            requireInvariant reachableInList();
        }
    }

// Every element reachable from another element is either the null pointer or part of the list.
invariant reachableInList()
    (forall address wallet. forall address X. forall address Y. ghostReach(wallet, X, Y) => X == Y || Y == 0 || ghostGuardians[wallet][Y] != 0)
    {
        preserved {
            requireInvariant reachInvariant();
            requireInvariant reachNull();
            requireInvariant inListReachable();
            requireInvariant reachNext();
            requireInvariant nextNull();
            requireInvariant countZeroIffListEmpty();
        }
    }

// Reach encodes a linear order. This axiom corresponds to Table 2 in [1].
invariant reachInvariant()
    forall address wallet. forall address X. forall address Y. forall address Z. (
        ghostReach(wallet, X, X)
        && (ghostReach(wallet, X, Y) && ghostReach(wallet, Y, X) => X == Y)
        && (ghostReach(wallet, X, Y) && ghostReach(wallet, Y, Z) => ghostReach(wallet, X, Z))
        && (ghostReach(wallet, X, Y) && ghostReach(wallet, X, Z) => (ghostReach(wallet, Y, Z) || ghostReach(wallet, Z, Y)))
    )
    {
        preserved {
            requireInvariant reachNull();
            requireInvariant inListReachable();
            requireInvariant reachableInList();
            requireInvariant reachHeadNext();
        }
    }

// every element with non-zero guardian field is reachable from SENTINEL (head of the list)
invariant inListReachable()
    (forall address wallet. forall address key. ghostGuardians[wallet][key] != 0 => ghostReach(wallet, SENTINEL, key))
    {
        preserved {
            requireInvariant reachInvariant();
            requireInvariant reachNull();
            requireInvariant reachableInList();
            requireInvariant countZeroIffListEmpty();
            requireInvariant emptyListNotReachable();
        }
    }

// Checks that every element reachable from SENTINEL is part of the guardians list.
invariant reachHeadNext()
    forall address wallet. forall address X. (ghostReach(wallet, SENTINEL, X) && X != SENTINEL && X != NULL) =>
           (ghostGuardians[wallet][SENTINEL] != SENTINEL && ghostReach(wallet, ghostGuardians[wallet][SENTINEL], X))
    {   
        preserved {
            requireInvariant inListReachable();
            requireInvariant reachableInList();
            requireInvariant reachInvariant();
            requireInvariant reachNull();
            requireInvariant countZeroIffListEmpty();
            requireInvariant emptyListNotReachable();
            requireInvariant nextNull();
        }
    }

// Every element reaches its direct successor (except for the tail-SENTINEL).
invariant reachNext()
    forall address wallet. forall address X. reachSucc(wallet, X, ghostGuardians[wallet][X])
    {
        preserved {
            requireInvariant inListReachable();
            requireInvariant reachableInList();
            requireInvariant reachNull();
            requireInvariant reachInvariant();
        }
    }

// Express the next relation from the reach relation by stating that it is reachable and there is no other element
// in between.
// This is equivalent to P_next from Table 3.
definition isSucc(address wallet, address a, address b) returns bool = ghostReach(wallet, a, b) && a != b && (forall address Z. ghostReach(wallet, a, Z) && ghostReach(wallet, Z, b) => (a == Z || b == Z));
definition nextOrNull(address n) returns address = n == SENTINEL ? NULL : n;

// State that the guardians storage pointers correspond to the next relation, except for the SENTINEL tail marker.
definition reachSucc(address wallet, address key, address next) returns bool =
        (key != NULL && isSucc(wallet, key, nextOrNull(next))) ||
        (key == NULL && next == NULL && (forall address Z. ghostReach(wallet, key, Z) => Z == NULL));

// Update the reach relation when the next pointer of a is changed to b.
// This corresponds to the first two equations in Table 3 [1] (destructive update to break previous paths through a and
// then additionally allow the path to go through the new edge from a to b).
definition updateSucc(address wallet, address a, address b) returns bool =
   forall address W. forall address X. forall address Y. ghostReach@new(W, X, Y) ==
            (X == Y ||
            (ghostReach@old(W, X, Y) && !(W == wallet && ghostReach@old(W, X, a) && a != Y && ghostReach@old(W, a, Y))) ||
            (W == wallet && ghostReach@old(W, X, a) && ghostReach@old(W, b, Y)));

// A definition that returns the successor count for a given guardian and the wallet.
definition countExpected(address wallet, address key) returns mathint =
    ghostGuardians[wallet][key] == NULL ? 0 : ghostGuardians[wallet][key] == SENTINEL ? 1 : ghostSuccCount(wallet, ghostGuardians[wallet][key]) + 1;

// A definition that returns true if successor count for a guardian for a wallet is more than two if guardian is not NULL and not SENTINEL.
definition countSuccessor(address wallet, address key) returns bool = 
    (ghostGuardians[wallet][key] != NULL && ghostGuardians[wallet][key] != SENTINEL => ghostSuccCount(wallet,key) >= 2);

// Update the ghostSuccCount for a wallet based on reachablility. If not reachable, old count is retained.
definition updateGhostSuccCount(address wallet, address key, mathint diff) returns bool = forall address W. forall address X.
    (ghostSuccCount@new(W, X) == (ghostSuccCount@old(W, X) + (W == wallet && ghostReach(W, X, key) ? diff : 0)));

// hook to update the ghostGuardians and the reach ghost state whenever the entries field
// in storage is written.
// This also checks that the reachSucc invariant is preserved.
hook Sstore currentContract.entries[KEY address wallet].guardians[KEY address key] address value {
    assert key != NULL;
    assert ghostReach(wallet, value, key) => value == SENTINEL, "list is cyclic";
    ghostGuardians[wallet][key] = value;
    havoc ghostReach assuming updateSucc(wallet, key, nextOrNull(value));
    mathint countDiff = countExpected(wallet, key) - ghostSuccCount(wallet, key);
    havoc ghostSuccCount assuming updateGhostSuccCount(wallet, key, countDiff);
}

// hook to update the ghostGuardianCount for given wallet address
hook Sstore currentContract.entries[KEY address wallet].count uint256 value {
    ghostGuardianCount[wallet] = value;
}

// Hook to match ghost state and storage state when reading guardians from storage.
// This also provides the reachSucc invariant.
hook Sload address value currentContract.entries[KEY address wallet].guardians[KEY address key] {
    require ghostGuardians[wallet][key] == value;
    require reachSucc(wallet, key, value);
    require ghostSuccCount(wallet, key) == countExpected(wallet, key);
}

// Hook to match ghost state and storage state when reading guardian count from storage.
hook Sload uint256 value currentContract.entries[KEY address wallet].count {
    // The prover found a counterexample if the guardians count is max uint256,
    // but this is not a realistic scenario.
    require ghostGuardianCount[wallet] < max_uint256;
    require ghostGuardianCount[wallet] == value;
}

// This invariant verifies that the successor count for each guardian for each wallet is one more than its next successor.
invariant countCorrect()
    forall address wallet. forall address X. (ghostSuccCount(wallet, X) == countExpected(wallet, X)) && countSuccessor(wallet, X)
    {
        preserved {
            requireInvariant reachInvariant();
            requireInvariant reachNull();
            requireInvariant inListReachable();
            requireInvariant reachNext();
            requireInvariant nextNull();
            requireInvariant reachableInList();
            requireInvariant reachHeadNext();
            requireInvariant countZeroIffListEmpty();
        }
    }

// Invariant that checks for any wallet either there are no guardians (and SENTINEL points to NULL) or successor count of SENTINEL equals ghostGuardianCount + 1.
invariant guardianCountCorrect()
   forall address wallet. (ghostGuardianCount[wallet] == 0 && ghostGuardians[wallet][SENTINEL] == NULL) || (ghostSuccCount(wallet, SENTINEL) == ghostGuardianCount[wallet] + 1)
    {
        preserved {
            requireInvariant reachInvariant();
            requireInvariant reachNull();
            requireInvariant inListReachable();
            requireInvariant reachNext();
            requireInvariant nextNull();
            requireInvariant reachableInList();
            requireInvariant reachHeadNext();
        }
    }

// The ghostGuardians[wallet][SENTINEL] should be NULL or SENTINEL if the guardian count is 0.
invariant countZeroIffListEmpty()
    forall address wallet. ghostGuardianCount[wallet] == 0 <=>
        (ghostGuardians[wallet][SENTINEL] == NULL || ghostGuardians[wallet][SENTINEL] == SENTINEL)
    {
        preserved {
            requireInvariant reachInvariant();
            requireInvariant reachNull();
            requireInvariant inListReachable();
            requireInvariant reachNext();
            requireInvariant nextNull();
            requireInvariant reachableInList();
            requireInvariant reachHeadNext();
            requireInvariant countCorrect();
            requireInvariant guardianCountCorrect();
        }
    }

// All the elements in ghostGuardians[wallet] should point to NULL if the list is empty.
invariant emptyListNotReachable()
    forall address wallet. (ghostGuardians[wallet][SENTINEL] == NULL || ghostGuardians[wallet][SENTINEL] == SENTINEL)
        => (forall address X. X != SENTINEL => ghostGuardians[wallet][X] == NULL)
    {
        preserved {
            requireInvariant reachInvariant();
            requireInvariant reachNull();
            requireInvariant inListReachable();
            requireInvariant reachNext();
            requireInvariant nextNull();
            requireInvariant reachableInList();
            requireInvariant reachHeadNext();
            requireInvariant countCorrect();
            requireInvariant guardianCountCorrect();
        }
    }

// This rule asserts that invariants related to reachability and count in the guardians list hold true after updating a guardian for a wallet.
// It also checks updating a guardian for a wallet does not impact another wallet.
rule storeHookPreservesInvariants(address wallet, address key, address value) {
    // These are checked in the hook.
    require key != NULL;
    require ghostReach(wallet, value, key) => value == SENTINEL; //, "list is cyclic";

    // Invariants that hold even in the middle
    requireInvariant reachNull();
    requireInvariant reachInvariant();

    address someKey;
    address someWallet;
    require reachSucc(someWallet, someKey, ghostGuardians[someWallet][someKey]);
    require ghostSuccCount(someWallet, someKey) == countExpected(someWallet, someKey);
    ghostGuardians[wallet][key] = value;
    havoc ghostReach assuming updateSucc(wallet, key, nextOrNull(value));
    mathint countDiff = countExpected(wallet, key) - ghostSuccCount(wallet, key);
    havoc ghostSuccCount assuming updateGhostSuccCount(wallet, key, countDiff);
    assert reachSucc(someWallet, someKey, ghostGuardians[someWallet][someKey]), "reachSucc violated after guardians update";
    assert ghostSuccCount(someWallet, someKey) == countExpected(someWallet, someKey);

    // assert also the invariants used above
    assert (forall address W. forall address X. ghostReach(W, X, NULL));
    assert (forall address W. forall address X. forall address Y. forall address Z.
        ghostReach(W, X, X)
        && (ghostReach(W, X, Y) && ghostReach(W, Y, X) => X == Y)
        && (ghostReach(W, X, Y) && ghostReach(W, Y, Z) => ghostReach(W, X, Z))
        && (ghostReach(W, X, Y) && ghostReach(W, X, Z) => (ghostReach(W, Y, Z) || ghostReach(W, Z, Y)))
    );
}

// isGuardian(...) function should never revert.
rule isGuardianDoesNotRevert {
    address addr;
    isGuardian@withrevert(safeContract, addr);
    assert !lastReverted, "isGuardian should not revert";
}

// SENTINEL should not be a guardian.
rule sentinelCantBeGuardian() {
   assert !isGuardian(safeContract, SENTINEL), "SENTINEL must not be guardian";
}

// If isGuardian returns true, the guardian should be in the ghostGuardians. 
rule isGuardianInList {
    address addr;
    env e;
    require safeContract.isModuleEnabled(e.msg.sender);
    require addr != SENTINEL;
    bool result = isGuardian(safeContract, addr);
    assert result == (ghostGuardians[safeContract][addr] != NULL), "isGuardian returns wrong result";
}

// Adding a guardian should updates storage only related to the specific wallet.
rule addGuardianChangesEntries {
    address other;
    address toAdd;
    uint256 threshold;
    env e;
    require safeContract.isModuleEnabled(e.msg.sender);

    requireInvariant reachNull();
    requireInvariant reachInvariant();
    requireInvariant inListReachable();
    requireInvariant reachableInList();
    requireInvariant countZeroIffListEmpty();
    require other != toAdd;
    bool isGuardianOtherBefore = isGuardian(safeContract, other);
    addGuardianWithThreshold(e, safeContract, toAdd, threshold);

    assert isGuardian(safeContract, toAdd), "addGuardian should add the given guardian";
    assert isGuardian(safeContract, other) == isGuardianOtherBefore, "addGuardian should not remove or add other guardians";
}

// Removing a guardian should updates storage only related to the specific wallet.
rule removeGuardianChangesGuardians {
    address other;
    address toRemove;
    address prevGuardian;
    uint256 threshold;
    env e;
    require safeContract.isModuleEnabled(e.msg.sender);

    requireInvariant reachNull();
    requireInvariant reachInvariant();
    requireInvariant inListReachable();
    requireInvariant reachableInList();
    require other != toRemove;
    bool isGuardianOtherBefore = isGuardian(safeContract, other);
    revokeGuardianWithThreshold(e, safeContract, prevGuardian, toRemove, threshold);

    assert !isGuardian(safeContract, toRemove), "revokeGuardian should remove the given guardian";
    assert isGuardian(safeContract, other) == isGuardianOtherBefore, "revokeGuardian should not remove or add other guardians";
}
