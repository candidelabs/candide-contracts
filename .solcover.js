module.exports = {
  skipFiles: [
    // No tests yet for coverage
    /*'candideWallet/CandideWallet.sol',
    'candideWallet/proxies/CandideProxyFactory.sol',
    'candideWallet/proxies/CandideWalletProxy.sol',
    'experimental/bls/BLSAccount.sol',
    'experimental/bls/BLSHelperG2.sol',
    'experimental/bls/BLSMultisigSignatureAggregator.sol',
    'experimental/bls/BLSSignatureAggregator.sol',
    'paymaster/CandidePaymaster.sol',
    'paymaster/TestPaymaster.sol',*/
    // Test Contracts
    'test/BLSAccountFactory.sol',
    'test/BLSAccountMultisig.sol',
    'test/BLSAccountMultisigFactory.sol',
    'test/DepositPaymaster.sol',
    'test/ERC1271WalletMock.sol',
    'test/MockContractWithCall.sol',
    'test/TestBLS.sol',
    'test/TestExecutor.sol',
    'test/TokenPriceOracle.sol',
  ]
};
