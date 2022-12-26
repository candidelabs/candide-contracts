<!-- PROJECT LOGO -->

<div align="center">
  <h1 align="center">Candide Wallet Contracts</h1>
</div>

<div align="center">
<img src="https://user-images.githubusercontent.com/7014833/203773780-04a0c8c0-93a6-43a4-bb75-570cb951dfa0.png" height =200>
</div>

# About

Candide Wallet is a smart contract wallet for Ethereum Mainnet and EVM compatible rollups.<br/>
This repo includes the smart contracts used by Candide Wallet.

# Features
- <a href="https://eips.ethereum.org/EIPS/eip-4337">EIP-4337: Account Abstraction via Entry Point Contract</a> 
- Social Recovery
- Pay gas with ERC-20 using a Paymaster

# How to use this repo

### Install Ganache
```
npm install -g ganache-cli
```

### Install Poetry
```
curl -sSL https://install.python-poetry.org | python3 -
```

### Install dependencies
```
poetry install
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
## Run all tests
```
brownie test --network goerli-fork-dev
```

<!-- LICENSE -->
## License

GNU General Public License v3.0

<!-- ACKNOWLEDGMENTS -->
## Acknowledgments
* <a href='https://github.com/eth-infinitism/account-abstraction'>eth-infinitism/account-abstraction</a>
* <a href='https://github.com/safe-global/safe-contracts'>Gnosis Safe Contracts</a>
* <a href='https://eips.ethereum.org/EIPS/eip-4337'>EIP-4337: Account Abstraction via Entry Point Contract specification </a>
