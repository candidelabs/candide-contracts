<!-- PROJECT LOGO -->

<div align="center">
  <h1 align="center">Candide Wallet Contracts</h1>
</div>

<div align="center">
<img src="https://pbs.twimg.com/profile_banners/1528783691299930114/1653898682/1500x500" height =200/>
</div>

# About

Candide Wallet is a smart contract wallet for Ethereum Mainnet and EVM compatible rollups.<br/>
This repo includes the smart contracts used by Candide Wallet.

# Features
- <a href="https://eips.ethereum.org/EIPS/eip-4337">EIP-4337: Account Abstraction via Entry Point Contract</a> 
- Social Recovery
- Pay gas with ERC-20 using a Paymaster

# How to use this repo

### Install brownie
```
pipx install eth-brownie
```

### Add required libraries to brownie
```
pipx inject eth-brownie web3 brownie-token-tester ecdsa sha3
```

### Install Ganache
```
npm install ganache
```

### Add required .env variables
```
cp -a .env.example .env
```

### Add Goerli fork to brownie networks
```
brownie networks add development goerli-fork-dev cmd=ganache-cli host=http://127.0.0.1 chain_id=5 fork=https://goerli.infura.io/v3/$INFURA_API accounts=10 mnemonic=brownie port=8545
```

### Add Goerli fork configs
```
brownie networks modify goerli-fork-dev explorer=https://api-goerli.etherscan.io/api?apikey=$ETHERSCAN_TOKEN
```
### Add libraries
```
brownie pm install safe-global/safe-contracts@1.3.0-libs.0

brownie pm install OpenZeppelin/openzeppelin-contracts@3.0.0
```
### Compile contracts
```
brownie compile
```

## Call trace for an Entrypoint call
<img src="https://github.com/candidelabs/CandideWalletContracts/blob/main/docs/call_trace.png"/>

## Contracts and bundler diagram
<img src="https://github.com/candidelabs/CandideWalletContracts/blob/main/docs/diagram.png"/>

## Run all tests
```
brownie test --network goerli-fork-dev
```
test_bundler.py will only pass if the <a href='https://github.com/candidelabs/Candide-bundler-and-paymaster-RPC'>bundler RPC</a> is running 

## TODO
- [*] BLS signatures and aggregation
- [*] Atomic execution for multiple transactions
- [ ] Supporting EIP-712 signatures


<!-- LICENSE -->
## License

GNU General Public License v3.0

<!-- ACKNOWLEDGMENTS -->
## Acknowledgments
* <a href='https://github.com/eth-infinitism/account-abstraction'>eth-infinitism/account-abstraction</a>
* <a href='https://github.com/safe-global/safe-contracts'>Gnosis Safe Contracts</a>
* <a href='https://eips.ethereum.org/EIPS/eip-4337'>EIP-4337: Account Abstraction via Entry Point Contract specification </a>

