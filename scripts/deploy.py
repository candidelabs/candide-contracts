from brownie import Contract, SafeProxy4337, EIP4337Manager, TokenPriceOracle, DepositPaymaster, VerifyingPaymaster, CandideWallet, CandideWalletProxy, accounts, network
from brownie_tokens import ERC20

#Goerli Deployed Contracts
# EIP4337Manager deployed at: 0x9C2E336a8A40A43200fE97256394ee04cc3331CE
# SafeProxy4337 deployed at: 0xC8933D562BaFF345e0C52CB98A7ADccd42c1752b
# DepositPaymaster deployed at: 0x488020A486bd64a675Aca7eb3825Ebc0Ee65E862
# TokenPriceOracle deployed at: 0x634009885B3f8e243Edc9DFa9de9F7e2fA0C2c87
# VerifyingPaymaster deployed at: 0x4CF2C86D03de15C4E2be639BF46958c56D5Cfd91
# candideWalletSingleton deployed at: 0x61C573C356617ECDcB5EFD2C984e3B154F519721
# CandideWalletProxy deployed at: 0xD0Da1A393d0d8fA8dB2E7BDE3CfF4d01318cae9c

entryPoint_addr = "0x602aB3881Ff3Fa8dA60a8F44Cf633e91bA1FdB69"
create2factory_address = "0xce0042b868300000d44a59004da54a005ffdcf9f"
gnosis_safe_singleton_addr = "0x3E5c63644E683549055b9Be8653de26E0B4CD36E"

def main():
    isPublish = False
    if network.show_active()=='goerli-fork-dev':
        owner = accounts.add()
        bundler = accounts.add()
        uni = ERC20("Uni", "uni", 18)
        amount = 100_000 * 10 ** 18
        uni._mint_for_testing(bundler, amount)
        entryPoint = Contract.from_explorer(entryPoint_addr)
        gnosisSafeSingleton = Contract.from_explorer(gnosis_safe_singleton_addr)
    
    elif network.show_active() == 'goerli':
        #brownie accounts new first
        #brownie accounts new second
        owner = accounts.load("first")
        bundler = accounts.load("second")
        isPublish = True

    friends = []
    friends.append(accounts[0].address)
    friends.append(accounts[1].address)

   
    manager = EIP4337Manager.deploy(entryPoint_addr, 
        {'from': owner}, publish_source=isPublish)
    
    safeProxy = SafeProxy4337.deploy(gnosis_safe_singleton_addr, manager.address, 
            owner.address, friends, 2, {'from': owner}, publish_source=isPublish)
    
    depositPaymaster =  DepositPaymaster.deploy(entryPoint_addr, 
        {'from': owner}, publish_source=isPublish)
    
    tokenOracle = TokenPriceOracle.deploy({'from':owner}, publish_source=isPublish)
    
    depositPaymaster.addToken(tokenOracle.address, tokenOracle.address, {'from':owner})

    VerifyingPaymaster.deploy(entryPoint_addr, bundler, 
        {'from': bundler}, publish_source=isPublish)

    candideWalletSingleton = CandideWallet.deploy(entryPoint_addr, 
        {'from': owner}, publish_source=isPublish)

    CandideWalletProxy.deploy(candideWalletSingleton.address, 
        {'from': owner}, publish_source=isPublish)