#!/usr/bin/python3

from brownie import Contract, reverts, CandideWalletProxy
from web3.auto import w3
from eth_account import Account, messages
from hexbytes import HexBytes
import eth_abi
from testUtils import (
    ExecuteExecTransaction,
    ExecuteEntryPointHandleOps,
    ExecuteSocialRecoveryOperation,
)


def test_VERSION(candideWalletProxy):
    """
    Check version - older versions are not suppoted
    """
    assert candideWalletProxy.VERSION() == "1.3.0"


def test_owner(candideWalletProxy, owner):
    """
    Check owner
    """
    assert candideWalletProxy.getOwners()[0] == owner


def test_transaction_from_proxy_directly(
    candideWalletProxy,
    owner,
    notOwner,
    bundler,
    tokenErc20,
    receiver,
    accounts,
):
    """
    Create a  transaction and call the proxy directly and check eth transfer
    """
    accounts[0].transfer(candideWalletProxy, "1 ether")  # Add ether to wallet
    beforeBalance = receiver.balance()
    nonce = 1

    # should revert if not the owner
    with reverts():
        ExecuteExecTransaction(
            receiver.address,
            5,  # value to send
            "0x",
            0,
            0,
            0,
            0,
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            notOwner,
            notOwner,
            candideWalletProxy,
        )

    # should excute successfuly if from owner
    ExecuteExecTransaction(
        receiver.address,
        5,  # value to send
        "0x",
        0,
        0,
        0,
        0,
        "0x0000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000",
        owner,
        owner,
        candideWalletProxy,
    )

    # should revert if wrong nonce
    with reverts():
        ExecuteExecTransaction(
            receiver.address,
            5,  # value to send
            "0x",
            0,
            0,
            0,
            0,
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            notOwner,
            notOwner,
            candideWalletProxy,
        )

    nonce = nonce + 1
    assert beforeBalance + 5 == receiver.balance()

    # should revert if value higher than balance
    with reverts():
        ExecuteExecTransaction(
            receiver.address,
            candideWalletProxy.balance() + 1,
            "0x",
            0,
            0,
            0,
            0,
            "0x0000000000000000000000000000000000000000",
            "0x0000000000000000000000000000000000000000",
            notOwner,
            notOwner,
            candideWalletProxy,
        )

    # mint erc20 for safe wallet to pay for the transaction gas with erc20
    amount = 100_000 * 10**18
    tokenErc20._mint_for_testing(candideWalletProxy.address, amount)

    beforeBundlerErc20Balance = tokenErc20.balanceOf(bundler)
    beforeBalance = receiver.balance()

    # pay with transaction with erc20 by using a bundler/relayer
    ExecuteExecTransaction(
        receiver.address,
        5,  # value to send
        "0x",
        0,
        215000,
        215000,
        100000,
        tokenErc20.address,
        bundler.address,
        owner,
        bundler,  # bundler/relayer that will sponsor the gas cost for erc20
        candideWalletProxy,
    )

    # check if bundler was payed for relaying the transaction
    assert beforeBundlerErc20Balance < tokenErc20.balanceOf(bundler)
    assert beforeBalance + 5 == receiver.balance()


def test_transaction_through_entrypoint(
    candideWalletProxy, owner, bundler, receiver, entryPoint, accounts
):
    """
    Create a  transaction through the EntryPoint
    """
    accounts[0].transfer(candideWalletProxy, "1 ether")  # Add ether to wallet
    beforeBalance = receiver.balance()

    callData = candideWalletProxy.execTransactionFromEntrypoint.encode_input(
        receiver.address,
        5,
        "0x",
        0,
        "0x0000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000",
        0,
    )

    entryPoint.depositTo(
        candideWalletProxy.address, {"from": accounts[3], "value": "1 ether"}
    )

    op = [
        candideWalletProxy.address,
        1,
        bytes(0),
        callData,
        215000,
        645000,
        21000,
        1000000,
        1000000,
        bytes(0),
        "0x",
    ]
    ExecuteEntryPointHandleOps(op, entryPoint, owner, bundler)
    assert beforeBalance + 5 == receiver.balance()

    beforeBalance = receiver.balance()


def test_transfer_from_entrypoint_with_init(
    candideWalletProxy,
    candideWalletSingleton,
    singletonFactory,
    owner,
    bundler,
    receiver,
    notOwner,
    entryPoint,
    accounts,
    friends,
):
    """
    Call entrypoint with initdata to create a candideWalletProxy then send eth
    """
    beforeBalance = receiver.balance()

    # initCode for deploying a new candideWalletProxy
    # contract by the entrypoint
    walletProxyBytecode = CandideWalletProxy.bytecode
    walletProxyArgsEncoded = eth_abi.encode(
        ["address"], [candideWalletSingleton.address]
    ).hex()

    # calculate proxy address
    ff = bytes.fromhex("ff")
    proxyInit = walletProxyBytecode + walletProxyArgsEncoded
    proxyInitHash = w3.solidityKeccak(["bytes"], ["0x" + proxyInit])
    c2Nonce = 0
    proxyAdd = w3.solidityKeccak(
        ["bytes1", "address", "uint256", "bytes"],
        [ff, singletonFactory.address, c2Nonce, proxyInitHash],
    )[-20:].hex()

    # send eth to the candideWalletProxy Contract address
    # before deploying the candideWalletProxy contract
    accounts[0].transfer(proxyAdd, "1.05 ether")

    initCode = (
        singletonFactory.address[2:]
        + singletonFactory.deploy.encode_input(
            walletProxyBytecode + walletProxyArgsEncoded, 0
        )[2:]
    )
    # create callData to be executed by the candideWalletProxy contract

    callData = candideWalletProxy.setupWithEntrypoint.encode_input(
        [owner.address],
        1,
        "0x0000000000000000000000000000000000000000",
        bytes(0),
        "0x0000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000",
        0,
        "0x0000000000000000000000000000000000000000",
        entryPoint.address,
    )

    # create entrypoint operation
    op = [
        proxyAdd,
        0,
        initCode,
        callData,
        2150000,
        6450000,
        21000,
        1000000,
        1000000,
        bytes(0),
        bytes(0),
    ]

    ExecuteEntryPointHandleOps(op, entryPoint, owner, bundler)

    candideWalletInit = Contract.from_abi(
        "CandideWallet", proxyAdd, candideWalletSingleton.abi
    )

    callData = candideWalletInit.execTransactionFromEntrypoint.encode_input(
        receiver.address,
        5,
        "0x",
        0,
        "0x0000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000",
        0,
    )

    op = [
        proxyAdd,
        candideWalletInit.nonce(),
        bytes(0),
        callData,
        215000,
        645000,
        21000,
        1000000,
        1000000,
        bytes(0),
        "0x",
    ]
    ExecuteEntryPointHandleOps(op, entryPoint, owner, bundler)
    assert beforeBalance + 5 == receiver.balance()


def test_transfer_from_entrypoint_with_deposit_paymaster(
    candideWalletProxy,
    tokenErc20,
    owner,
    bundler,
    entryPoint,
    depositPaymaster,
    receiver,
    accounts,
):
    """
    Test sponsor transaction fees with erc20 with a deposit paymaster
    """
    accounts[0].transfer(candideWalletProxy, "1 ether")
    beforeBalance = receiver.balance()

    accounts[0].transfer(owner, "3 ether")
    depositPaymaster.addStake(100, {"from": owner, "value": "1 ether"})
    depositPaymaster.deposit({"from": owner, "value": "1 ether"})

    tokenErc20.approve(depositPaymaster.address, "1 ether", {"from": bundler})
    tokenErc20.transfer(
        candideWalletProxy.address, "1 ether", {"from": bundler}
    )
    depositPaymaster.addDepositFor(
        tokenErc20.address,
        candideWalletProxy.address,
        "1 ether",
        {"from": bundler},
    )
    paymasterAndData = depositPaymaster.address[2:] + tokenErc20.address[2:]

    callData = candideWalletProxy.execTransactionFromEntrypoint.encode_input(
        receiver.address,
        5,
        "0x",
        0,
        "0x0000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000",
        0,
    )

    op = [
        candideWalletProxy.address,
        1,
        bytes(0),
        callData,
        215000,
        645000,
        21000,
        1000000,
        1000000,
        paymasterAndData,
        "0x",
    ]
    ExecuteEntryPointHandleOps(op, entryPoint, owner, bundler)
    assert beforeBalance + 5 == receiver.balance()


def test_transfer_from_entrypoint_with_candidePaymaster(
    candideWalletProxy,
    tokenErc20,
    owner,
    bundler,
    entryPoint,
    candidePaymaster,
    receiver,
    accounts,
):
    """
    Test sponsor transaction fees with erc20 with a verification paymaster
    """
    accounts[0].transfer(candideWalletProxy, "1 ether")
    beforeBalance = receiver.balance()

    accounts[0].transfer(bundler, "3 ether")
    candidePaymaster.addStake(100, {"from": bundler, "value": "1 ether"})
    candidePaymaster.deposit({"from": bundler, "value": "1 ether"})

    tokenErc20.transfer(
        candideWalletProxy.address, "1 ether", {"from": bundler}
    )

    maxTokenCost = 5
    maxTokenCostHex = str("{0:0{1}x}".format(maxTokenCost, 40))

    costOfPost = 10**18
    costOfPostHex = str("{0:0{1}x}".format(costOfPost, 40))

    token = tokenErc20.address[2:]

    paymasterBeforeBalance = tokenErc20.balanceOf(candidePaymaster.address)

    callData = candideWalletProxy.execTransactionFromEntrypoint.encode_input(
        receiver.address,
        5,
        "0x",
        0,
        candidePaymaster.address,
        tokenErc20.address,
        10**8,
    )

    op = [
        candideWalletProxy.address,
        1,
        bytes(0),
        callData,
        2150000,
        645000,
        21000,
        1000000,
        1000000,
        "0x",
        "0x",
    ]

    datahash = candidePaymaster.getHash(
        op, maxTokenCost, costOfPost, tokenErc20.address
    )
    bundlerSigner = w3.eth.account.from_key(bundler.private_key)
    sig = bundlerSigner.signHash(datahash)
    paymasterAndData = (
        candidePaymaster.address[2:]
        + maxTokenCostHex
        + costOfPostHex
        + token
        + sig.signature.hex()[2:]
    )
    op[9] = paymasterAndData
    ExecuteEntryPointHandleOps(op, entryPoint, owner, bundler)

    assert beforeBalance + 5 == receiver.balance()  # verifing eth is sent
    assert (
        tokenErc20.balanceOf(candidePaymaster.address) > paymasterBeforeBalance
    )  # verify paymaster is payed
