<div align="center">
  <h1 align="center">Candide Contracts</h1>
</div>

![atelier-meta-web](https://github.com/candidelabs/.github/assets/7014833/5090c8d1-31ad-4daf-9efd-adae4c350c35)

## About

Smart contracts from Candide Labs for Safe accounts and ERC-4337 account abstraction on EVM networks.
The repository includes a social recovery module, a Safe-based wallet and proxy factory, an ERC-20 paymaster,
and experimental BLS accounts and signature aggregators.

## Contracts

| Component                     | Source                                                                                   | Purpose                                                                                    |
| ----------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Social Recovery Module v0.2.0 | [SocialRecoveryModule.sol](./contracts/modules/social_recovery/SocialRecoveryModule.sol) | Guardian approvals and delayed replacement of a Safe's owners and signing threshold.       |
| Guardian storage              | [GuardianStorage.sol](./contracts/modules/social_recovery/storage/GuardianStorage.sol)   | Per-wallet guardian lists and recovery thresholds; inherited by the recovery module.       |
| Candide Wallet                | [CandideWallet.sol](./contracts/candideWallet/CandideWallet.sol)                         | Extends Safe with EntryPoint validation and execution of user operations.                  |
| Wallet proxies                | [proxies/](./contracts/candideWallet/proxies/)                                           | Wallet proxy and factory, including deterministic deployment methods.                      |
| Candide Paymaster             | [CandidePaymaster.sol](./contracts/paymaster/CandidePaymaster.sol)                       | Owner-authorized sponsorship with ERC-20 gas payment, gas plus a fee, or free sponsorship. |
| Experimental BLS contracts    | [experimental/bls/](./contracts/experimental/bls/)                                       | BLS accounts, signature aggregators, and public-key aggregation helpers.                   |

[contracts/test/](./contracts/test/) contains mocks, test helpers, and sample contracts.
The dependency declarations use account-abstraction v0.6.0, Safe contracts `^1.4.1-build.0`, and OpenZeppelin contracts `^4.9.1`.

## Account recovery

The Social Recovery Module supports both single-owner and multisig Safe accounts. Guardians authorize a replacement
owner set and Safe signing threshold when owners lose access to their keys. Guardians can be externally owned accounts
or contracts that validate EIP-1271 signatures. They do not approve the Safe's normal transactions.

### Setup and guardian management

Enable the deployed recovery module on the Safe, then call its guardian-management methods through Safe transactions.
These methods use `msg.sender` as the wallet address and require the module to be enabled on that wallet.
The Safe's normal authorization rules govern those transactions.

- `addGuardianWithThreshold(guardian, threshold)` adds a guardian and sets the recovery threshold.
- `revokeGuardianWithThreshold(prevGuardian, guardian, threshold)` removes a guardian and sets the recovery threshold.
  Guardians form a linked list: obtain their order with `getGuardians(wallet)` and use `address(0x1)` as the predecessor of the first guardian.
- `changeThreshold(threshold)` changes the number of guardian approvals required.

A guardian cannot be the zero address, `address(0x1)`, the wallet itself, an existing guardian, or a current Safe owner when added.
The recovery threshold must be between one and the number of guardians while guardians remain; it can be zero when none remain.
The guardian threshold is separate from the Safe's owner signing threshold.

Every successful guardian configuration call cancels any scheduled recovery and advances the wallet's recovery nonce,
invalidating pending confirmations and signatures. This also applies when `changeThreshold` sets the existing value.
Guardian-management methods and `cancelRecovery()` require canonical ABI calldata lengths to reject calls forwarded by a Safe fallback handler.

### Recovery flow

1. **Choose the new owners and threshold.** The owner list must be nonempty and contain unique addresses. New owners cannot
   be the zero address, `address(0x1)`, the wallet itself, or current guardians. The new Safe threshold must be between one
   and the number of new owners.
2. **Collect guardian approvals for `nonce(wallet)`.** A guardian can call
   `confirmRecovery(wallet, newOwners, newThreshold, nonce, execute)` directly. Anyone can relay signed approvals with
   `multiConfirmRecovery(wallet, newOwners, newThreshold, nonce, signatures, execute)`.
   Both methods require the supplied nonce to match the wallet's current recovery nonce.
3. **Schedule recovery.** Once enough guardians have approved, anyone can call
   `executeRecovery(wallet, newOwners, newThreshold)`. Either confirmation method can also schedule recovery by setting
   `execute` to `true`, provided the resulting approval count meets the guardian threshold.
   Scheduling advances the nonce and stores the request's nonce, approval count, proposed owners, threshold, and `executableAt` timestamp.
4. **Wait for the recovery period.** The immutable `recoveryPeriod` is set in seconds when the module is deployed.
   The Safe can call `cancelRecovery()` any time before finalization. A replacement recovery requires approvals at the new
   current nonce, strictly more approvals than the scheduled request, and starts a fresh recovery period.
5. **Finalize.** Once `executableAt` is reached, anyone can call `finalizeRecovery(wallet)` to replace the Safe's owners and
   signing threshold through module transactions. The module must remain enabled for those transactions to succeed.

`cancelRecovery()` also works when no request is scheduled: it advances the nonce to invalidate pending approvals.
Repeating a guardian confirmation for the same recovery hash does not increase its approval count or emit another `RecoveryConfirmed` event.

### Signatures and request queries

Off-chain approvals use the following EIP-712 type:

```text
ExecuteRecovery(address wallet,address[] newOwners,uint256 newThreshold,uint256 nonce)
```

The domain contains the name `Social Recovery Module`, version `0.2.0`, chain ID, and deployed module address.
Use `getRecoveryHash(...)` to obtain the digest or [test/utils/eip712_helper.ts](./test/utils/eip712_helper.ts) as a typed-data example.

For `multiConfirmRecovery`, pass a nonempty array of `{ signer, signature }` entries sorted by ascending signer address,
with no duplicate signers. It accepts ECDSA and EIP-1271 signatures. An empty signature counts as a direct confirmation
when the signer is the caller and is a guardian. For another signer, an empty signature must pass EIP-1271 validation,
as with a Safe guardian that has pre-approved the hash.

| Query                                                                            | Returns                                                                         |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `getGuardians(wallet)`, `guardiansCount(wallet)`, `isGuardian(wallet, guardian)` | Current guardian configuration.                                                 |
| `threshold(wallet)`                                                              | Required guardian approval count.                                               |
| `nonce(wallet)`                                                                  | Current recovery nonce, separate from the Safe transaction nonce.               |
| `getRecoveryRequest(wallet)`                                                     | Scheduled request, including its nonce, approval count, and `executableAt`.     |
| `getRecoveryApprovals(wallet, newOwners, newThreshold)`                          | Approvals from current guardians at the current recovery nonce.                 |
| `hasGuardianApproved(wallet, guardian, newOwners, newThreshold)`                 | Whether a current guardian approved the proposal at the current recovery nonce. |

After scheduling advances the nonce, use `getRecoveryRequest` to inspect the scheduled request's approval count.

### Safe compatibility

Tests and formal verification use Safe 1.4.1 contracts and harnesses. For Safe 1.5 or later, the recovery design assumes
that any module guard is not malicious: finalization performs several module transactions while the Safe temporarily
has an owner threshold of one. See the [verification model boundaries](./certora/README.md#model-boundaries) for coverage limits.

## Development

Use Node.js 20 (the version configured in CI) and Yarn Classic (1.x). Hardhat compiles with Solidity 0.8.20 and the
optimizer enabled for 1,000,000 runs. `SocialRecoveryModule.sol` additionally uses `viaIR`.

### Install and configure

```sh
yarn install --frozen-lockfile
```

For RPC, signing, explorer, or gas-report settings, copy the environment template:

```sh
cp .env.sample .env
```

| Variable            | Use                                                       |
| ------------------- | --------------------------------------------------------- |
| `NODE_URL`          | Adds a `custom` Hardhat network pointing to this RPC URL. |
| `MNEMONIC`          | Supplies accounts for configured external networks.       |
| `INFURA_KEY`        | Used by the Infura URLs in `hardhat.config.ts`.           |
| `ETHERSCAN_API_KEY` | Explorer verification.                                    |
| `REPORT_GAS`        | Enables the gas reporter when set to `true`.              |

Local tests use Hardhat's in-process network and accounts; they do not require funded external accounts or RPC credentials.
Network definitions are in [hardhat.config.ts](./hardhat.config.ts).

### Build and test

```sh
yarn build
yarn test
```

`yarn build` compiles Solidity and TypeScript and runs the TypeChain postbuild step. `yarn test` runs the Hardhat tests,
compiling contracts as needed. The main suites are [GuardianStorage.spec.ts](./test/GuardianStorage.spec.ts) and
[SocialRecoveryModule.spec.ts](./test/SocialRecoveryModule.spec.ts).

Additional commands:

```sh
yarn coverage
yarn lint
yarn fmt
yarn hardhat codesize --contractname SocialRecoveryModule
```

`yarn lint` includes automatic TypeScript fixes; `yarn fmt` rewrites test TypeScript and Solidity formatting.

The `generate:deployments` Hardhat task generates `docs/deployments.md` from [deployments.ts](./deployments.ts).
That registry is currently empty.

## Formal verification

The Certora suites cover guardian storage, recovery behavior, confirmation signatures, and recovery validation.
Install the pinned CLI and provide Java and Solidity 0.8.20 as described in [certora/README.md](./certora/README.md).

```sh
pip install -r certora/requirements.txt

certoraRun certora/conf/SocialRecoveryModule.conf --compilation_steps_only
certoraRun certora/conf/GuardianStorage.conf --compilation_steps_only
certoraRun certora/conf/RecoveryConfirmationSignatureValidity.conf --compilation_steps_only
certoraRun certora/conf/RecoveryValidation.conf --compilation_steps_only
```

These commands compile and type-check locally. To run proofs, set `CERTORAKEY` and replace `--compilation_steps_only`
with `--wait_for_results all`; this submits the verification inputs to Certora's service. Use `--solc` for a custom compiler path.

See [verification results](./certora/VERIFICATION.md) for the recorded commit, suite results, and input digests,
and [model boundaries](./certora/README.md#model-boundaries) for the assumptions and bounds of those proofs.
The current Certora CI workflow runs the first three suites; `RecoveryValidation` is available through the command above.

## Audits

- [Ackee Blockchain](./audit/audit-report-ackee.pdf)
- [Nethermind Security](./audit/audit-report-nethermind.pdf)
- [Certora](./audit/audit-report-certora.pdf)

See [audit/audit.md](./audit/audit.md) for the scope, audited commits, findings, and reviewed fixes associated with each report.

## License

The root [LICENSE](./LICENSE) contains GNU GPL v3. Individual Solidity files declare their licenses in SPDX headers,
including GPL-3.0 and LGPL-3.0-only; `package.json` declares LGPL-3.0.

## Acknowledgments

- [eth-infinitism/account-abstraction](https://github.com/eth-infinitism/account-abstraction)
- [Safe Contracts](https://github.com/safe-global/safe-contracts)
- [ERC-4337 specification](https://eips.ethereum.org/EIPS/eip-4337)
