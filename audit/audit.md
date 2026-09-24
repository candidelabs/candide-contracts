# Audit Results

## Audit 1

### Auditor

Ackee Blockchain (<https://ackeeblockchain.com/>).

### Notes

The final audit was performed on commit [113d3c059e039e332637e8f686d9cbd505f1e738](https://github.com/candidelabs/candide-contracts/tree/113d3c059e039e332637e8f686d9cbd505f1e738). The audit report references the snapshot of this repository that was hosted at [`5afe/CandideWalletContracts`](https://github.com/5afe/CandideWalletContracts) at the time, which has since moved to [`safe-fndn/candide-contracts`](https://github.com/safe-fndn/candide-contracts).

All discovered findings were addressed.

### Files

- [Final audit report](audit-report-ackee.pdf)

## Audit 2

### Auditor

Nethermind Security (<https://www.nethermind.io/>).

### Notes

The final audit was performed on commit [8076191f93e88eefaae3508efa8b12a091158c68](https://github.com/safe-fndn/safe-modules/tree/8076191f93e88eefaae3508efa8b12a091158c68). The audited files are listed under the `contracts/modules/social_recovery/` paths of this repository, which Safe vendors under `modules/recovery/contracts/` in the `safe-modules` repository.

No issues were discovered during this audit.

### Files

- [Final audit report](audit-report-nethermind.pdf)

## Audit 3

### Auditor

Certora (<https://www.certora.com/>).

### Notes

The final audit was performed on commit [8076191f93e88eefaae3508efa8b12a091158c68](https://github.com/safe-fndn/safe-modules/tree/8076191f93e88eefaae3508efa8b12a091158c68), with `SocialRecoveryModule.sol` and `GuardianStorage.sol` in scope.

The audit reported 15 findings: one medium severity, five low severity and nine informational. Eleven of them, including the medium severity finding, were fixed in [#28](https://github.com/candidelabs/candide-contracts/pull/28), released as version 0.2.0 of the Social Recovery Module. Certora reviewed the fixes at commit [d0959d28ae084a7d549bb2c12d04482653456c2c](https://github.com/candidelabs/candide-contracts/tree/d0959d28ae084a7d549bb2c12d04482653456c2c). The remaining one low (L-04) and three informational (I-06, I-07, I-08) findings are acknowledged.

### Files

- [Final audit report](audit-report-certora.pdf)
