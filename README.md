<div align="center">
  <h1 align="center">Candide Contracts</h1>
</div>

![atelier-meta-web](https://github.com/candidelabs/.github/assets/7014833/5090c8d1-31ad-4daf-9efd-adae4c350c35)

# About

Candide Wallet is a smart contract wallet for Ethereum Mainnet and EVM compatible rollups.<br/>
This repo includes the smart contracts used by Candide Labs.

# Features
- <a href="https://eips.ethereum.org/EIPS/eip-4337">EIP-4337: Account Abstraction via Entry Point Contract</a>
- Account Recovery
- Pay gas with ERC-20 using a Paymaster

# Account Recovery

*In this section, we highlight and explain the [SocialRecoveryModule.sol](./contracts/modules/social_recovery/SocialRecoveryModule.sol) contract.*

The Account Recovery module is designed to work for both a single-owner account and an n-m multi-sig account. In the case of the single-owner account, the signer key is typically stored on the user's device. More specifically, owners can add recovery methods (also known as Guardians) to change the ownership of the account, in case their signer key is lost or compromised.

Recovery methods are typical Ethereum accounts. They can be:
- Family & Friends' contacts
- Hardware wallets
- Institutions
- Custodial services that offer cloud-based wallets

Normal operations of the Account do not require the approval of added Guardians in the module.

Owners of the account decide the threshold for the number of guardians needed for recovery, as well as the number of guardians. A typical single-owner account can have 3 guardians with a threshold of 2. This increases the likelihood that a single guardian can overtake the account.

Owners are encouraged to ask their guardians to provide fresh addresses. This makes them private and eliminates the possibility of malicious guardians cooperating against an owner. By design, a guardian does not need to necessarily store value in their account to maintain their duties, even during a recovery process.

Account Recovery interfaces can be built with or without a backend service:

- An interface without a backend service can simply let each guardian submit their signatures separately. Once the threshold is meant, anyone can call execute recovery to start the recovery period.

- An interface that leverages a backend service can aggregate guardians' signatures so that only the last guardian executes the transaction and pay gas fees. This is similar to how Safe's interface works when multiple owners for a multi-sig sign transactions before submitting them.

## High-Level specs of methods

We assume that the signer key belongs to its real owner. The probability of the signer key being in control of someone else should be close to zero. Under this model, we can build a simple yet highly secure non-custodial wallet. To enable that model to evolve if needed, upgrading the wallet to a new implementation requires the approval of only the owner of the account.


| Method                        | Owner  | Guardians| Anyone | Comment                                                                                         |
| ----------------------------  | ------ | ------   | ------ | ----------------------------------------------------------------------------------------------- |
|`addGuardianWithThreshold`     | X      |          |        | Owner can add a guardian with a new threshold                                                   |
| `revokeGuardianWithThreshold` | X      |          |        | Owner can remove a guardian from its list of guardians                                          |
| `confirmRecovery`             |        | X        |        | Lets a single guardian approve the execution of the recovery request                            |
| `multiConfirmRecovery`        |        | X        |        | Lets multiple guardians approve the execution of the recovery request                           |
| `cancelRecovery`              | X      |          |        | Lets an owner cancel an ongoing recovery request                                                |
| `finalizeRecovery`            |        |          |   X    | Finalizes an ongoing recovery request if the recovery period is over. The method is public and callable by anyone |

## Audit

- [For version 0.0.1 by Ackee Blockchain](./audit/ackee-blockchain-candide-social-recovery-report.pdf)

# Development


### Install dependencies
```
yarn install
```

### Add required .env variables
```
cp .env.example .env
```

## Run tests
```
yarn build
yarn test
```

<!-- LICENSE -->
## License
GNU General Public License v3.0

<!-- ACKNOWLEDGMENTS -->
## Acknowledgments
* <a href='https://github.com/eth-infinitism/account-abstraction'>eth-infinitism/account-abstraction</a>
* <a href='https://github.com/safe-global/safe-contracts'>Gnosis Safe Contracts</a>
* <a href='https://eips.ethereum.org/EIPS/eip-4337'>EIP-4337: Account Abstraction via Entry Point Contract specification </a>