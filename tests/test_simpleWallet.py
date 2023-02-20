#!/usr/bin/python3

from brownie import accounts, reverts

from web3.auto import w3
from eth_account.messages import defunct_hash_message


def test_owner(simpleWallet, owner):
    """
    Check the owner
    """
    assert owner.address == simpleWallet.owner()


def test_owner_can_transfer(simpleWallet, owner):
    """
    Check if the owner can transfer
    """
    accounts[0].transfer(simpleWallet.address, "2 ether")
    simpleWallet.transfer(accounts[1], "1 ether", {"from": owner})


def test_others_can_not_transfer(simpleWallet):
    """
    Check if others can't transfer
    """
    accounts[0].transfer(simpleWallet.address, "2 ether")
    with reverts():
        simpleWallet.transfer(accounts[1], "1 ether", {"from": accounts[0]})


def test_owner_can_call_transfer_eth_through_entrypoint(
    simpleWallet, entryPoint, owner, accounts
):
    """
    Check send transaction through Entrypoint
    """

    accounts[0].transfer(simpleWallet, "1 ether")
    beforeBalance = accounts[1].balance()
    callData = simpleWallet.execute.encode_input(accounts[1], 5, "")
    op = [
        simpleWallet.address,
        0,
        bytes(0),
        callData,
        215000,
        645000,
        21000,
        17530000000,
        17530000000,
        bytes(0),
        bytes(0),
    ]
    userOpHash = entryPoint.getUserOpHash(op)
    ownerSigner = w3.eth.account.from_key(owner.private_key)
    message_hash = defunct_hash_message(userOpHash)
    sig = ownerSigner.signHash(message_hash)
    op[10] = sig.signature
    entryPoint.handleOps([op], owner, {"from": owner})
    assert beforeBalance + 5 == accounts[1].balance()
