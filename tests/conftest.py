#!/user/bin/python3

import pytest
from brownie import (
    Contract,
    CandideWallet,
    CandideWalletProxy,
    BLSAccount,
    BLSOpen,
    TestBLS,
    BLSAccountMultisig,
)
from brownie_tokens import ERC20
import json
import random
from py_ecc.optimized_bn128.optimized_curve import curve_order
from testBLSUtils import get_public_key, xyz_to_affine_G2

entryPoint_addr = "0x0576a174D229E3cFA37253523E645A78A0C91B57"  # Goerli
# entryPoint_addr = 0x79b0F2a81D2b5d507E56d42D452239e94b18Ddc8 #optimism Goerli
SingletonFactory_add = "0xce0042B868300000d44A59004Da54A005ffdcf9f"
# should be the same as the bundler's RPC
bundler_pk = "e0cb334cac07d3555270bff73b3d7656a1256c2cebe856b85104ec84725c98c4"  # noqa: E501


@pytest.fixture(scope="function", autouse=True)
def isolate(fn_isolation):
    pass


@pytest.fixture(scope="module")
def owner(accounts):
    """
    The owner account
    """
    accounts.add()
    return accounts[-1]


@pytest.fixture(scope="module")
def erc1271Owner(accounts):
    """
    The ERC1271 Mock wallet owner account
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
    return accounts.add(bundler_pk)


@pytest.fixture(scope="module")
def receiver(accounts):
    """
    The receiver account
    """
    return accounts[5]


@pytest.fixture(scope="module")
def entryPoint(Contract):
    """
    Fetch EntryPoint Contract from the specified address
    """
    f = open("tests/abi/EntryPoint.json")
    data = json.load(f)
    return Contract.from_abi("EntryPoint", entryPoint_addr, data["abi"])


@pytest.fixture(scope="module")
def singletonFactory(Contract):
    """
    Fetch EntryPoint Contract from the specified address
    """
    return Contract.from_explorer(SingletonFactory_add)


@pytest.fixture(scope="module")
def simpleWallet(SimpleAccount, entryPoint, owner):
    """
    Deploy SimpleWallet contract
    """
    sw = SimpleAccount.deploy(entryPoint.address, {"from": owner})
    sw.initialize(owner.address, {"from": owner})
    return sw


@pytest.fixture(scope="module")
def socialRecoveryModule(SocialRecoveryModule, GuardianStorage, accounts):
    """
    Deploy EIP4337Manager contract
    """
    guardianStorage = GuardianStorage.deploy({"from": accounts[0]})
    return SocialRecoveryModule.deploy(
        guardianStorage, 1000, {"from": accounts[0]}
    )


@pytest.fixture(scope="module")
def erc1271Wallet(ERC1271WalletMock, erc1271Owner, accounts):
    return ERC1271WalletMock.deploy(
        erc1271Owner.address, {"from": accounts[0]}
    )


@pytest.fixture(scope="module")
def candideWalletSingleton(owner):
    """
    Fetch GnosisSafe Singleton Contract from the specified address
    """
    return CandideWallet.deploy({"from": owner})


@pytest.fixture(scope="module")
def compatibilityFallbackHandler(CompatibilityFallbackHandler, owner):
    """
    Deploy CandidePaymaster contract
    """
    return CompatibilityFallbackHandler.deploy({"from": owner})


@pytest.fixture(scope="module")
def candideWalletProxy(
    candideWalletSingleton, compatibilityFallbackHandler, entryPoint, owner
):
    """
    Deploy a proxy contract for GnosisSafe
    """
    sp = CandideWalletProxy.deploy(
        candideWalletSingleton.address, {"from": owner}
    )
    # returning a proxy instance with the target abi
    # to facilitate diligate call
    candideWallet = Contract.from_abi(
        "CandideWallet", sp.address, candideWalletSingleton.abi
    )

    candideWallet.setupWithEntrypoint(
        [owner.address],
        1,
        "0x0000000000000000000000000000000000000000",
        0,
        compatibilityFallbackHandler.address,
        "0x0000000000000000000000000000000000000000",
        0,
        "0x0000000000000000000000000000000000000000",
        entryPoint.address,
        {"from": owner},
    )

    return candideWallet


@pytest.fixture(scope="module")
def candidePaymaster(CandidePaymaster, entryPoint, bundler):
    """
    Deploy CandidePaymaster contract
    """
    return CandidePaymaster.deploy(
        entryPoint.address, bundler, {"from": bundler}
    )


@pytest.fixture(scope="module")
def depositPaymaster(
    DepositPaymaster, entryPoint, TokenPriceOracle, tokenErc20, owner
):
    """
    Deploy DepositPaymaster contract
    """
    paymaster = DepositPaymaster.deploy(entryPoint.address, {"from": owner})
    uo = TokenPriceOracle.deploy({"from": owner})  # deploy a price oracle
    paymaster.addToken(
        tokenErc20.address, uo.address
    )  # add support for the uni token in the paymaster
    return paymaster


@pytest.fixture(scope="module")
def tokenErc20(bundler):
    """
    Test Token
    """
    tokenErc20 = ERC20("Test", "tst", 18)
    amount = 100_000 * 10**18
    tokenErc20._mint_for_testing(bundler, amount)
    return tokenErc20


@pytest.fixture(scope="module")
def bLSSignatureAggregator(BLSSignatureAggregator, owner):
    """
    Deploy BLSSignatureAggregator
    """
    BLSOpen.deploy({"from": owner})
    return BLSSignatureAggregator.deploy({"from": owner})


@pytest.fixture(scope="module")
def bLSMultisigSignatureAggregator(BLSMultisigSignatureAggregator, owner):
    """
    Deploy BLSSignatureAggregatorMultisig
    """
    BLSOpen.deploy({"from": owner})
    return BLSMultisigSignatureAggregator.deploy({"from": owner})


@pytest.fixture(scope="module")
def bLSAccount(BLSAccountFactory, bLSSignatureAggregator, entryPoint, owner):
    """
    Generate two bls wallets
    """
    random.seed(owner.address)

    # geranrate private key sk1
    sk1 = random.randrange(curve_order)
    pk1 = get_public_key(sk1)

    # generate private key sk2
    sk2 = random.randrange(curve_order)
    pk2 = get_public_key(sk2)

    deployer = BLSAccountFactory.deploy(
        entryPoint.address, bLSSignatureAggregator.address, {"from": owner}
    )

    pubkey1_affine = xyz_to_affine_G2(pk1)
    pubkey2_affine = xyz_to_affine_G2(pk2)

    wallet1Add = deployer.createAccount(
        0, pubkey1_affine, {"from": owner}
    ).new_contracts[0]
    wallet2Add = deployer.createAccount(
        1, pubkey2_affine, {"from": owner}
    ).new_contracts[0]

    wallet1 = Contract.from_abi("BLSWallet", wallet1Add, BLSAccount.abi)
    wallet2 = Contract.from_abi("BLSWallet", wallet2Add, BLSAccount.abi)

    return [[wallet1, wallet2], [sk1, sk2]]


@pytest.fixture(scope="module")
def bLSAccountMultisig(
    BLSAccountMultisigFactory,
    bLSMultisigSignatureAggregator,
    entryPoint,
    owner,
):
    """
    Generate two bls multisig wallets
    """
    random.seed(owner.address)

    # geranrate private key sk1
    sk1w1 = random.randrange(curve_order)
    pk1w1 = get_public_key(sk1w1)

    # generate private key sk2
    sk2w1 = random.randrange(curve_order)
    pk2w1 = get_public_key(sk2w1)

    # geranrate private key sk1
    sk1w2 = random.randrange(curve_order)
    pk1w2 = get_public_key(sk1w2)

    # generate private key sk2
    sk2w2 = random.randrange(curve_order)
    pk2w2 = get_public_key(sk2w2)

    deployer = BLSAccountMultisigFactory.deploy(
        entryPoint.address,
        bLSMultisigSignatureAggregator.address,
        {"from": owner},
    )

    pubkey11_affine = xyz_to_affine_G2(pk1w1)
    pubkey21_affine = xyz_to_affine_G2(pk2w1)
    pubkey12_affine = xyz_to_affine_G2(pk1w2)
    pubkey22_affine = xyz_to_affine_G2(pk2w2)

    wallet1Add = deployer.createAccount(
        0, [pubkey11_affine, pubkey21_affine], 1, {"from": owner}
    ).new_contracts[0]
    wallet2Add = deployer.createAccount(
        1, [pubkey12_affine, pubkey22_affine], 1, {"from": owner}
    ).new_contracts[0]

    wallet1 = Contract.from_abi(
        "BLSWalletMultisig", wallet1Add, BLSAccountMultisig.abi
    )
    wallet2 = Contract.from_abi(
        "BLSWalletMultisig", wallet2Add, BLSAccountMultisig.abi
    )

    return [[wallet1, wallet2], [[sk1w1, sk2w1], [sk1w2, sk2w2]]]


@pytest.fixture(scope="module")
def testBLS(accounts):
    """
    Deploy TestBLS
    """
    return TestBLS.deploy({"from": accounts[0]})
