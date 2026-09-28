# Social recovery verification

Run from the repository root with the dependencies installed, Solidity 0.8.20
available as `solc-0.8.20`, Java installed, and the CLI version pinned in
`certora/requirements.txt`. Java 21 is suitable for local CVL type checking.

```sh
pip install -r certora/requirements.txt
certoraRun certora/conf/SocialRecoveryModule.conf --compilation_steps_only
certoraRun certora/conf/GuardianStorage.conf --compilation_steps_only
certoraRun certora/conf/RecoveryConfirmationSignatureValidity.conf --compilation_steps_only
certoraRun certora/conf/RecoveryValidation.conf --compilation_steps_only
```

Local compilation/type checking does not prove the assertions. For verification,
set `CERTORAKEY` in the environment and replace `--compilation_steps_only` with
`--wait_for_results all`. This uploads the relevant contracts, imported sources,
harnesses, specs and configuration to Certora's service. Do not put the key in
configuration files or commit it.

Latest completed run: [verification results](VERIFICATION.md).

## Suites

| Configuration | Coverage |
| --- | --- |
| `GuardianStorage` | Existing linked-list reachability, guardian count, threshold, and isolation properties |
| `SocialRecoveryModule` | Recovery and guardian-management properties, updated for explicit confirmation nonces, `executableAt`, request nonces, and cancellation on guardian changes |
| `RecoveryConfirmationSignatureValidity` | Signature validation/ordering, duplicate rejection, approval writes and isolation; the harness mirrors the new handling of empty contract signatures |
| `RecoveryValidation` | Invalid nonce and owner rejection at all relevant entry points, nonce advancement and request clearing on cancellation/configuration changes, wallet isolation, stronger replacement approvals, current-guardian approval reporting, recovery-hash binding, clean approval epochs after every nonce advance, and repeated-confirmation idempotence |

## Audit findings

Regression rules for the fixes to the [Certora audit](../audit/audit-report-certora.pdf) findings:

| Finding | Rules (`RecoveryValidation` unless noted) |
| --- | --- |
| M-01: unfinalizable requests | `confirmationRequiresValidOwners`, `batchRequiresValidOwners`, `executionRequiresValidOwners` |
| L-01: empty contract signatures | `RecoveryConfirmationSignatureValidity` suite (signature validity abstracted) |
| L-03, I-02: configuration/cancellation epochs | `configChangesAndCancellationResetRecovery`, `resetClearsAllActiveRequestFields`, `resetDoesNotAffectOtherWallet`, `cancelAlwaysAdvancesNonceOrOverflows` |
| L-04: approvals across rounds | `noConfirmationForFutureNonce`, `nonceAdvanceStartsCleanEpoch` |
| I-03: stale approval reporting | `approvalRequiresCurrentGuardian` |
| I-05: repeated confirmations | `repeatedConfirmationIsNoop` |
| I-09: stale direct confirmations | `staleConfirmationNonceReverts`, `staleBatchNonceReverts` |
| Signature replay | `recoveryHashBindsRequest` (wallet, owners, threshold and nonce) |

Not covered formally: chain ID and module address binding of the recovery hash,
the Safe's owners and threshold after finalization, event contents, and Safe 1.5
module guards. The Hardhat suites check post-finalization owners and events at runtime.

## Model boundaries

- The existing suites use bounded loop exploration with `optimistic_loop`;
  the recovery/signature suites and the new validation suite use `loop_iter: 3`.
  Proof results are subject to those loop bounds, including nested owner checks.
- `optimistic_hashing` uses the default 224-byte `hashing_length_bound`, which
  bounds `keccak256(abi.encodePacked(newOwners))` to 7 owners. With
  `loop_iter: 3`, the effective bound for owner lists (including
  `recoveryHashBindsRequest`) is smaller; longer lists are outside the proofs.
- The signature suite retains the existing constant internal recovery-hash
  abstraction and a deterministic signature-validity ghost. It checks the
  module's use of signature validation, not ECDSA or EIP-1271 cryptography itself.
- The validation suite treats signature validity and Safe's `isModuleEnabled`
  and `isOwner` answers as nondeterministic. Owner validation, nonce checks,
  cancellation, and storage writes execute the production implementation.
- General recovery rules use the repository's Safe 1.4.1 harness. They do not
  establish Safe 1.5 module-guard compatibility or arbitrary callback safety.
- Guardian liveness rules exclude nonce overflow because guardian configuration
  changes now increment the nonce. Separate revert rules include that cause;
  `cancelAlwaysAdvancesNonceOrOverflows` checks cancellation at the boundary.
- Typed CVL calls use canonical ABI arguments. The existing Hardhat fallback and
  noncanonical-calldata tests remain necessary; these specs do not establish
  safety of every possible raw fallback payload.
- `rule_sanity: basic` remains enabled. Check the cloud report for violations,
  timeouts, and vacuous rules before treating a run as passing.
