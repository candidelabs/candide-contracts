# Verification results

Contract commit: `460039d5e69c1f123aec36a88904317ac889027d` (Social Recovery
Module v0.2.0), verified September 2026.

## Certora Prover

All four suites passed with `--wait_for_results all` and the checked-in
configuration: no violations, timeouts, unknown results or sanity (vacuity)
failures.

| Suite | Rules and invariants |
| --- | ---: |
| `SocialRecoveryModule` | 24 |
| `GuardianStorage` | 20 |
| `RecoveryConfirmationSignatureValidity` | 4 |
| `RecoveryValidation` | 16 |

Environment: Certora CLI 7.6.3 (pinned in `requirements.txt`), Solidity 0.8.20,
Java 21. The configured loop bounds, hash/signature abstractions and Safe 1.4.1
scene limit these results as described in [README.md](README.md).

## Mutation check

With `require(_nonce == nonce(_wallet), "SM: invalid nonce");` removed from
`confirmRecovery`, `noConfirmationForFutureNonce` and
`nonceAdvanceStartsCleanEpoch` both produce counterexamples on `confirmRecovery`.
The rules therefore detect the regression they are meant to guard.

## Verified input digests

SHA-256 digests of the files verified in these runs:

```text
fa13aeb3bc7caa3adda2a756cb7eafb46c6a94dba91ce0d5931555b626a9bdf4  contracts/modules/social_recovery/SocialRecoveryModule.sol
be7186339dba419e27864922cec258cd470e57d1ad70753bd5c190153c50bd23  contracts/modules/social_recovery/storage/GuardianStorage.sol
08ca7726e26898dd4f39e1407ff3abb7ddd5995e937560751739d87b29525293  certora/conf/GuardianStorage.conf
31d26150c0a741da473236b360211dbe9e343e8d2c492e1157989fbe92940a21  certora/conf/RecoveryConfirmationSignatureValidity.conf
49b99cc7866ebf204de4448c10adb6f655da6bbe7549e427e81bbf6d1cc37e71  certora/conf/RecoveryValidation.conf
eebacf97896527b2a990283ddb567deb7807d36d5e61c2a5b99bef55af2c706f  certora/conf/SocialRecoveryModule.conf
7db23fdc580543df4977fe6a6eb0130e4bcc9f567dc56e92b843dcf71e01fbe7  certora/harnesses/SafeHarness.sol
51cd79b5a2d00518fff52092d10fabfb056c819a867f33746aa7efd53499a67a  certora/harnesses/SocialRecoveryModuleHarness.sol
c7327b33ad39558c8e0b06941e2d89cd4c11680fd2f4c18b1be5667b979e317a  certora/specs/GuardianStorage.spec
d3390633b74bf1d4d238688c42fbd7727631be496a7c28836e2c81e842f20dff  certora/specs/RecoveryConfirmationSignatureValidity.spec
0be592f32a524b301885cc2272fd9703cebc092e1cc31adb9174ed65e7863681  certora/specs/RecoveryValidation.spec
e6af187e74de22336074ce2f9b97a7178653a9d169b2968906f19b26a64aff69  certora/specs/SocialRecoveryModule.spec
```

Check with `sha256sum -c` from the repository root.
