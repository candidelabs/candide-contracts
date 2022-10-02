from brownie import Contract, SafeProxy4337, EIP4337Manager, TokenPriceOracle, DepositPaymaster, VerifyingPaymaster, accounts, network
from brownie_tokens import ERC20

#Goerli Deployed Contracts
entryPoint_addr = "0x602aB3881Ff3Fa8dA60a8F44Cf633e91bA1FdB69"
create2factory_address = "0xce0042b868300000d44a59004da54a005ffdcf9f"
gnosis_safe_singleton_addr = "0x3E5c63644E683549055b9Be8653de26E0B4CD36E"

def main():
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

    friends = []
    friends.append(accounts[0].address)
    friends.append(accounts[1].address)

   
    manager = EIP4337Manager.deploy(entryPoint_addr, {'from': owner})
    safeProxy = SafeProxy4337.deploy(gnosis_safe_singleton_addr, manager.address, 
            owner.address,{'from': owner})
    
    depositPaymaster =  DepositPaymaster.deploy(entryPoint_addr, {'from': owner})
    uniOracle = TokenPriceOracle.deploy({'from':owner})
    depositPaymaster.addToken(uni.address, uniOracle.address)

    VerifyingPaymaster.deploy(entryPoint_addr, bundler, {'from': bundler})