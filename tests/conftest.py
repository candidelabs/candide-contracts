#!/user/bin/python3

import pytest
from brownie import Contract, EIP4337Manager, SafeProxy4337, VerifyingPaymaster, DepositPaymaster, SocialRecoveryModule
from brownie_tokens import ERC20

entryPoint_addr = "0x602aB3881Ff3Fa8dA60a8F44Cf633e91bA1FdB69" #Goerli
gnosis_safe_singleton_addr = "0x3E5c63644E683549055b9Be8653de26E0B4CD36E" #Goerli - V1.3.0

@pytest.fixture(scope="function", autouse=True)
def isolate(fn_isolation):
    # perform a chain rewind after completing each test, to ensure proper isolation
    # https://eth-brownie.readthedocs.io/en/v1.10.3/tests-pytest-intro.html#isolation-fixtures
    pass

@pytest.fixture(scope="module")
def owner(accounts):
    """
    The owner account
    """
    accounts.add()
    return accounts[-1]

@pytest.fixture(scope="module")
def notOwner(accounts):
    """
    Not the owner account
    """
    accounts.add()
    return accounts[-1]

@pytest.fixture(scope="module")
def bundler(accounts):
    """
    The bundler account
    """
    accounts.add()
    return accounts[-1]

@pytest.fixture(scope="module")
def receiver(accounts):
    """
    The receiver account
    """
    return accounts[5]

@pytest.fixture(scope="module")
def friends(accounts):
    """
    Friends for social recovery
    """
    friends = []
    accounts.add()
    friends.append(accounts[-1])
    accounts.add()
    friends.append(accounts[-1])
    return friends

@pytest.fixture(scope="module")
def entryPoint(Contract):
    """
    Fetch EntryPoint Contract from the specified address
    """
    return Contract.from_explorer(entryPoint_addr)

@pytest.fixture(scope="module")
def moduleManager(EIP4337Manager, entryPoint, owner):
    """
    Deploy EIP4337Manager contract
    """
    return EIP4337Manager.deploy(entryPoint.address, {'from': owner})

@pytest.fixture(scope="module")
def socialRecoveryModule(SocialRecoveryModule, owner):
    """
    Deploy EIP4337Manager contract
    """
    return SocialRecoveryModule.deploy({'from': owner})

@pytest.fixture(scope="module")
def gnosisSafeSingleton():
    """
    Fetch GnosisSafe Singleton Contract from the specified address
    """
    return Contract.from_explorer(gnosis_safe_singleton_addr)

@pytest.fixture(scope="module")
def safeProxy(SafeProxy4337, moduleManager, owner, gnosisSafeSingleton, friends):
    """
    Deploy a proxy contract for GnosisSafe
    """ 
    sp = SafeProxy4337.deploy(gnosisSafeSingleton.address, moduleManager.address, 
            owner.address, {'from': owner})
    #returning a proxy instance with the target abi to facilitate diligate call
    return Contract.from_abi("GnosisSafe", sp.address, gnosisSafeSingleton.abi)

@pytest.fixture(scope="module")
def simpleWallet(SimpleWallet, entryPoint, owner):
    """
    Deploy SimpleWallet contract
    """ 
    return SimpleWallet.deploy(entryPoint.address, owner.address, {"from":owner})

@pytest.fixture(scope="module")
def verifyingPaymaster(VerifyingPaymaster, entryPoint, bundler):
    """
    Deploy VerifyingPaymaster contract
    """ 
    return VerifyingPaymaster.deploy(entryPoint.address, bundler, {'from': bundler})

@pytest.fixture(scope="module")
def depositPaymaster(DepositPaymaster, entryPoint, TokenPriceOracle, tokenErc20, owner):
    """
    Deploy DepositPaymaster contract
    """ 
    paymaster =  DepositPaymaster.deploy(entryPoint.address, {'from': owner})
    uo = TokenPriceOracle.deploy({'from':owner}) #deploy a price oracle
    paymaster.addToken(tokenErc20.address, uo.address) # add support for the uni token in the paymaster
    return paymaster

@pytest.fixture(scope="module")
def tokenErc20(bundler):
    """
    Test Token
    """ 
    tokenErc20 = ERC20("Test", "tst", 18)
    amount = 100_000 * 10 ** 18
    tokenErc20._mint_for_testing(bundler, amount)
    return tokenErc20