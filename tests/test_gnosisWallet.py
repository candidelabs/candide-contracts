#!/usr/bin/python3

import pytest
from brownie import Contract, SafeProxy4337, reverts 
from web3.auto import w3
from eth_account.messages import defunct_hash_message
from eth_account import Account
from hexbytes import HexBytes
import eth_abi
from  testUtils import *

def test_VERSION(safeProxy):
    """
    Check version - older versions are not suppoted
    """
    assert safeProxy.VERSION() == "1.3.0"

def test_owner(safeProxy, owner):
    """
    Check owner
    """
    assert safeProxy.getOwners()[0] == owner


def test_transaction_from_proxy_directly(safeProxy, owner, 
    notOwner, bundler, tokenErc20, receiver, accounts):
    """
    Create a GnosisSafe transaction and call the proxy directly and check eth transfer
    """
    accounts[0].transfer(safeProxy, "1 ether") #Add ether to wallet
    beforeBalance = receiver.balance()
    nonce = 0

    #should revert if not the owner
    with reverts():
        ExecuteGnosisSafeExecTransaction(
            receiver.address,
            5,  #value to send
            "0x",
            0,
            0,
            0,
            0,  
            '0x0000000000000000000000000000000000000000',
            '0x0000000000000000000000000000000000000000',
            nonce,
            notOwner,
            notOwner,
            safeProxy)
   
    #should excute successfuly if from owner
    ExecuteGnosisSafeExecTransaction(
            receiver.address,
            5,  #value to send
            "0x",
            0,
            0,
            0,
            0,  
            '0x0000000000000000000000000000000000000000',
            '0x0000000000000000000000000000000000000000',
            nonce,
            owner,
            owner,
            safeProxy)

    #should revert if wrong nonce
    with reverts():
        ExecuteGnosisSafeExecTransaction(
            receiver.address,
            5,  #value to send
            "0x",
            0,
            0,
            0,
            0,  
            '0x0000000000000000000000000000000000000000',
            '0x0000000000000000000000000000000000000000',
            nonce,
            notOwner,
            notOwner,
            safeProxy)

    nonce = nonce + 1
    assert beforeBalance + 5 == receiver.balance()

    #should revert if value higher than balance
    with reverts():
        ExecuteGnosisSafeExecTransaction(
            receiver.address,
            safeProxy.balance() + 1,
            "0x",
            0,
            0,
            0,
            0,  
            '0x0000000000000000000000000000000000000000',
            '0x0000000000000000000000000000000000000000',
            nonce,
            notOwner,
            notOwner,
            safeProxy)

    #mint erc20 for safe wallet to pay for the transaction gas with erc20
    amount = 100_000 * 10 ** 18
    tokenErc20._mint_for_testing(safeProxy.address, amount)

    beforeBundlerErc20Balance = tokenErc20.balanceOf(bundler)
    beforeBalance = receiver.balance()

    #pay with transaction with erc20 by using a bundler/relayer
    ExecuteGnosisSafeExecTransaction(
        receiver.address,
        5,  #value to send
        "0x",
        0,
        215000,
        215000,
        100000,
        tokenErc20.address,
        bundler.address,
        nonce,
        owner,
        bundler,   # bundler/relayer that will sponsor the gas cost for erc20
        safeProxy)
    
    #check if bundler was payed for relaying the transaction
    assert beforeBundlerErc20Balance < tokenErc20.balanceOf(bundler)
    assert beforeBalance + 5 == receiver.balance()



def test_transaction_through_entrypoint(safeProxy, owner, bundler, receiver,
        entryPoint, accounts):
    """
    Create a GnosisSafe transaction through the EntryPoint
    """
    accounts[0].transfer(safeProxy, "1 ether")#Add ether to wallet
    beforeBalance = receiver.balance()
    nonce = 0

    #using execTransactionFromModule
    callData = safeProxy.execTransactionFromModule.encode_input(
        receiver.address,
        5,
        "0x",
        0)
    
    entryPoint.depositTo(safeProxy.address, 
            {'from':accounts[3], 'value': "1 ether"})

    op = [
            safeProxy.address,
            0,
            bytes(0),
            callData,
            215000,
            645000,
            21000,
            17530000000,
            17530000000,
            '0x0000000000000000000000000000000000000000',
            '0x',
            '0x'
            ]
    gasused1 = ExecuteEntryPointHandleOps(op, entryPoint, owner, bundler)
    assert beforeBalance + 5 == receiver.balance()

    beforeBalance = receiver.balance()
    nonce = nonce + 1

    #using execTransaction   
    ExecuteEntryPointHandleOpsWithExecTransaction(
        receiver.address,
        5,  #value to send
        "0x",
        0,
        215000,
        215000,
        100000,
        "0x0000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000",
        nonce,
        owner,
        bundler,   # bundler/relayer that will sponsor the gas cost for erc20
        safeProxy,
        "0x0000000000000000000000000000000000000000",
        bytes(0),
        entryPoint)
    assert beforeBalance + 5 == receiver.balance()

def test_transfer_from_entrypoint_with_init(moduleManager, safeProxy, 
        gnosisSafeSingleton, owner, bundler, receiver, notOwner,
        entryPoint, accounts, SocialRecoveryModule, friends):
    """
    Call entrypoint with initdata to create a safeproxy then send eth
    """
    beforeBalance = receiver.balance()

    #initCode for deploying a new SafeProxy contract by the entrypoint
    walletProxyBytecode = SafeProxy4337.bytecode
    friendsAddresses = [friends[0].address, friends[1].address]
    walletProxyArgsEncoded = eth_abi.encode_abi(
            ['address', 'address', 'address', 'address[]', 'uint256'],
            [gnosisSafeSingleton.address, moduleManager.address,
                owner.address, friendsAddresses, 2]).hex()
    initCode = walletProxyBytecode + walletProxyArgsEncoded
    
    #send eth to the SafeProxy Contract address before deploying the SafeProxy contract
    proxyAdd = entryPoint.getSenderAddress(initCode, 0)
    accounts[0].transfer(proxyAdd, "1 ether")
    
    #create callData to be executed by the SafeProxy contract
    callData = safeProxy.execTransactionFromModule.encode_input(
        receiver.address,
        1000000000000000000,
        "0x",
        0)

    #deposit eth for the proxy contract in the entrypoint (no paymaster) 
    entryPoint.depositTo(proxyAdd, 
            {'from':accounts[3], 'value': ".05 ether"})

    #create entrypoint operation
    op = [
            proxyAdd,
            0,
            initCode,
            callData,
            215000,
            645000,
            21000,
            17530000000,
            17530000000,
            '0x0000000000000000000000000000000000000000',
            '0x',
            '0x'
            ]
    ExecuteEntryPointHandleOps(op, entryPoint, owner, bundler)
    
    assert beforeBalance + 1000000000000000000 == receiver.balance()
    
    """
    Test Social Recovry module - separate confirmations and recovery process
    """
    #check if social recovery module is deployed
    socialRecoveryModuleAddress = moduleManager.socialRecoveryModule()
    srm = Contract.from_abi("SocialRecoveryModule", socialRecoveryModuleAddress, SocialRecoveryModule.abi)
    #check friends
    assert srm.friends(0) == friends[0]
    assert srm.friends(1) == friends[1]

    #create recovery data to initiate a recovry to a new owner
    newOwner = accounts[5]
    prevOwner = '0x0000000000000000000000000000000000000001'
    recoveryData = safeProxy.swapOwner.encode_input(
        prevOwner,
        owner.address,
        newOwner.address)
    dataHash = srm.getDataHash(recoveryData, {'from': friends[0]})
    
    #will revert no friends confirmed 
    assert srm.isConfirmedByRequiredFriends(dataHash, {'from': friends[0]}) == False
    with reverts(): 
        srm.recoverAccess(prevOwner, owner.address,
            newOwner.address, {'from': friends[0]})

    srm.confirmTransaction(dataHash, {'from': friends[0]})
    
    #will revert number of confirmation is less than threshold = 2
    assert srm.isConfirmedByRequiredFriends(dataHash, {'from': friends[0]}) == False
    with reverts():
        srm.recoverAccess(prevOwner, owner.address,
            newOwner.address, {'from': friends[0]})

    srm.confirmTransaction(dataHash, {'from': friends[1]})

    #recovery process will succeed if number of confirmation is equal or bigger than threshold = 2
    assert srm.isConfirmedByRequiredFriends(dataHash, {'from': friends[0]}) == True
    srm.recoverAccess(prevOwner, owner.address,
        newOwner.address, {'from': friends[0]})
    
    #check old owner is not owner anymore
    assert safeProxy.isOwner(owner, {'from': notOwner}) == False

    #check new owner is the current owner
    assert safeProxy.isOwner(newOwner, {'from': notOwner}) == True

    #prevOwner = owner
    owner = newOwner

    """
    Test Social Recovry module - confirm and recovery in one transaction
    """
    newOwner = accounts[6]
    recoveryData = safeProxy.swapOwner.encode_input(
        prevOwner,
        owner.address,
        newOwner.address)
    dataHash = srm.getDataHash(recoveryData, {'from': friends[0]})

    #will revert no friends confirmed 
    with reverts(): 
        srm.recoverAccess(prevOwner, owner.address,
            newOwner.address, {'from': friends[0]})
    
    friend0Signer = w3.eth.account.from_key(friends[0].private_key)
    sigFriend0 = friend0Signer.signHash(dataHash)

    friend1Signer = w3.eth.account.from_key(friends[1].private_key)
    sigFriend1 = friend1Signer.signHash(dataHash)

    notOwnerSigner = w3.eth.account.from_key(notOwner.private_key)
    sigNotOwner = notOwnerSigner.signHash(dataHash)

    #will revert if wrong signatures
    with reverts():
        srm.confirmAndRecoverAccess(prevOwner, owner.address,
            newOwner.address, [sigNotOwner.signature.hex(), sigFriend1.signature.hex()], 
            {'from': friends[0]})
    
    srm.confirmAndRecoverAccess(prevOwner, owner.address,
        newOwner.address, [sigFriend0.signature.hex(), sigFriend1.signature.hex()], 
        {'from': friends[0]})

    #check old owner is not owner anymore
    assert safeProxy.isOwner(owner, {'from': notOwner}) == False

    #check new owner is the current owner
    assert safeProxy.isOwner(newOwner, {'from': notOwner}) == True

def test_transfer_from_entrypoint_with_deposit_paymaster(safeProxy, tokenErc20, 
        owner, bundler, entryPoint, depositPaymaster, receiver, accounts):
    """
    Test sponsor transaction fees with erc20 with a deposit paymaster
    """
    accounts[0].transfer(safeProxy, "1 ether")
    beforeBalance = receiver.balance()

    accounts[0].transfer(owner, "3 ether")
    depositPaymaster.addStake(100, {'from':owner, 'value': "1 ether"})
    depositPaymaster.deposit({'from':owner, 'value': "1 ether"})

    #assert "1 ether" == entryPoint.getDepositInfo(paymaster.address, {'from':owner})
    tokenErc20.approve(depositPaymaster.address, "1 ether", {'from':bundler})
    tokenErc20.transfer(safeProxy.address, "1 ether", {'from':bundler})
    bundlerBalance = tokenErc20.balanceOf(bundler)
    depositPaymaster.addDepositFor(tokenErc20.address, safeProxy.address, "1 ether",
            {'from': bundler})
    paymasterData = depositPaymaster.address[2:] + tokenErc20.address[2:]

    ExecuteEntryPointHandleOpsWithExecTransaction(
        receiver.address,
        5,  #value to send
        "0x",
        0,
        215000,
        215000,
        100000,
        tokenErc20.address,
        bundler.address,
        0,
        owner,
        bundler,
        safeProxy,
        depositPaymaster.address, 
        paymasterData,
        entryPoint)
   
    assert beforeBalance + 5 == receiver.balance() #verifing eth is sent

def test_transfer_from_entrypoint_with_verification_paymaster(safeProxy, tokenErc20, 
        owner, bundler, entryPoint, verifyingPaymaster, receiver, accounts):
    """
    Test sponsor transaction fees with erc20 with a verification paymaster
    """
    accounts[0].transfer(safeProxy, "1 ether")
    beforeBalance = receiver.balance()

    accounts[0].transfer(bundler, "3 ether")
    verifyingPaymaster.addStake(100, {'from':bundler, 'value': "1 ether"})
    verifyingPaymaster.deposit({'from':bundler, 'value': "1 ether"})

    tokenErc20.approve(verifyingPaymaster.address, "1 ether", {'from':bundler})
    tokenErc20.transfer(safeProxy.address, "1 ether", {'from':bundler})
    bundlerBalance = tokenErc20.balanceOf(bundler)

    tx_hash = safeProxy.getTransactionHash(
        receiver.address,
        5,  #value to send
        "0x",
        0,
        215000,
        215000,
        100000,
        tokenErc20.address,
        bundler.address,
        1)
        
    contract_transaction_hash = HexBytes(tx_hash)
    ownerSigner = Account.from_key(owner.private_key)
    signature = ownerSigner.signHash(contract_transaction_hash)

    callData = safeProxy.execTransaction.encode_input(
        receiver.address,
        5,  #value to send
        "0x",
        0,
        215000,
        215000,
        100000,
        tokenErc20.address,
        bundler.address,
        signature.signature.hex())

    op = [
            safeProxy.address,
            0,
            bytes(0),
            callData,
            2150000,
            645000,
            21000,
            17530000000,
            17530000000,
            verifyingPaymaster.address,
            '0x',
            '0x'
            ]
    datahash = verifyingPaymaster.getHash(op)
    bundlerSigner = w3.eth.account.from_key(bundler.private_key)
    sig = bundlerSigner.signHash(datahash)

    paymasterData =  sig.signature

    op = [
            safeProxy.address,
            0,
            bytes(0),
            callData,
            2150000,
            645000,
            21000,
            17530000000,
            17530000000,
            verifyingPaymaster.address,
            paymasterData.hex(),
            '0x'
            ]
    
    requestId = entryPoint.getRequestId(op)
    ownerSigner = w3.eth.account.from_key(owner.private_key)
    message_hash = defunct_hash_message(requestId)
    sig = ownerSigner.signHash(message_hash)
    op[11] = sig.signature
    gasused2 = entryPoint.handleOps([op], bundler, {'from': bundler})

   
    assert beforeBalance + 5 == receiver.balance() #verifing eth is sent
    assert tokenErc20.balanceOf(bundler) > bundlerBalance #verify bundler is payed

def test_validate_module_manager(moduleManager, safeProxy, entryPoint, owner, accounts):
    """
    Test validattion of Gnosis safe module manager
    """
    accounts[0].transfer(safeProxy, "1 ether")
    callData = moduleManager.validateEip4337.encode_input(safeProxy.address, 
        moduleManager.address)
    op = [
            safeProxy.address,
            0,
            bytes(0),
            callData,
            215000,
            645000,
            21000,
            17530000000,
            17530000000,
            '0x0000000000000000000000000000000000000000',
            '0x',
            '0x'
            ]
    requestId = entryPoint.getRequestId(op)
    ownerSigner = w3.eth.account.from_key(owner.private_key)
    message_hash = defunct_hash_message(requestId)
    sig = ownerSigner.signHash(message_hash)
    op[11] = sig.signature

    entryPoint.handleOps([op], owner, {'from': owner})