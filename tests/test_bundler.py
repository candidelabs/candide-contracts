#!/usr/bin/python3

import json
from web3.auto import w3
from eth_account.messages import defunct_hash_message
from eth_account import Account
from hexbytes import HexBytes
import requests
import eth_abi
import random
import os

def get_test_safeTransactions(N, safeProxy, tokenErc20, candidePaymaster,
    entryPoint, bundler, owner, receiver):
    """
    Generate Operations to used for the test
    """
    ops = []

    #to use the paymaster, every bundle should start with and approve operation that
    # cover the cost for the hall bundle 
    tokenErc20.transfer(safeProxy.address, "2 ether", {'from':bundler})
   

    dummyApproveAmount = 1
    approveCallData = tokenErc20.approve.encode_input(candidePaymaster.address, dummyApproveAmount)
    callData = safeProxy.execTransactionFromModule.encode_input(
            tokenErc20.address,
            0,
            approveCallData,
            0)
    op = [
        safeProxy.address,
        0,
        bytes(0),
        callData,
        2150000,
        645000,
        21000,
        1000000,
        1000000,
        candidePaymaster.address,
        bytes(0),
        bytes(0)
        ]

    ops.append(op)  #add op to the bundle

    for i in range(N):       
        #send 5 wei to receiver 
        callData = safeProxy.execTransactionFromModule.encode_input(
            receiver.address,
            5,
            "0x",
            0)

        op = [
            safeProxy.address,
            i+1,
            bytes(0),
            callData,
            2150000,
            645000,
            21000,
            1000000,
            1000000,
            candidePaymaster.address,
            bytes(0),
            bytes(0)
        ]
        ops.append(op)
        
    paymasterDataList = callPaymaster(ops[1:])
    index = 0
    for op in ops[1:]:
        op[10] = paymasterDataList[index]
        index = index + 1

        requestId = entryPoint.getRequestId(op)
        
        ownerSigner = w3.eth.account.from_key(owner.private_key)
        message_hash = defunct_hash_message(requestId)
        sig = ownerSigner.signHash(message_hash)
        op[11] = sig.signature.hex()

        op.append("") #set the random salt to "" if there is no initCode

    approveAmount = call_getApproveAmount(ops)

    approveCallData = tokenErc20.approve.encode_input(candidePaymaster.address, approveAmount)
    callData = safeProxy.execTransactionFromModule.encode_input(
            tokenErc20.address,
            0,
            approveCallData,
            0)

    op = ops[0]
    op[3] = callData

    paymasterData = callPaymaster([op])

    op[10] = paymasterData[0]

    requestId = entryPoint.getRequestId(op)
    
    ownerSigner = w3.eth.account.from_key(owner.private_key)
    message_hash = defunct_hash_message(requestId)
    sig = ownerSigner.signHash(message_hash)
    op[11] = sig.signature.hex()

    op.append("")    #set the random salt to "" if there is no initCode

    ops[0] = op

    return ops

#This test should be run while the bundler JSON RPC server is running
def test_transfer_from_entrypoint_with_candidePaymaster(
    safeProxy, tokenErc20,
    owner, bundler, entryPoint, candidePaymaster, receiver, accounts):
    """
    Test sponsor transaction fees with erc20 with a paymaster
    """
    N = 10 #number of operations to generate in the bundle
    safeTransactions = get_test_safeTransactions(N,safeProxy, tokenErc20, candidePaymaster,
    entryPoint, bundler, owner, receiver)
    
    accounts[0].transfer(safeProxy, "1 ether") #add ether to the wallet
    accounts[0].transfer(bundler, "3 ether")   #add ether to the bundler
    
    beforeBalance = receiver.balance()

    #addStake for the EntryPoint
    candidePaymaster.addStake(100, {'from':bundler, 'value': "1 ether"})
    candidePaymaster.deposit({'from':bundler, 'value': "1 ether"})


    tokenErc20.approve(candidePaymaster.address, "1 ether", {'from':bundler})
    tokenErc20.transfer(safeProxy.address, "1 ether", {'from':bundler})
    candidePaymasterBalance = tokenErc20.balanceOf(candidePaymaster.address)
    bundlerBalance = bundler.balance()
    callBundler(safeTransactions)

    assert beforeBalance + 5 * N == receiver.balance() #verifing eth is sent
    assert tokenErc20.balanceOf(candidePaymaster.address) > candidePaymasterBalance #verify paymaster is payed
    assert bundler.balance() > bundlerBalance   #verify bundler is payed

def test_transfer_from_entrypoint_with_init(SafeProxy4337, safeProxy, gnosisSafeSingleton,
    EIP4337Manager, SocialRecoveryModule, owner, bundler, entryPoint, SingletonFactory,
    Contract, receiver, accounts):
    """
    Call entrypoint with initdata to create a safeproxy then send eth
    """
    beforeBalance = receiver.balance()

    moduleManagerBytecode = EIP4337Manager.bytecode
    moduleManagerArgsEncoded = eth_abi.encode_abi(
            ['address'], [entryPoint.address]).hex()
    moduleManagerInitCode = '0x' + moduleManagerBytecode + moduleManagerArgsEncoded

    random.seed(owner.address)
    salt = random.randrange(1,10**32) #create a random salt for contract factory
    #calculate EIP4337Manager address using getSenderAddress
    moduleManagerAddress = entryPoint.getSenderAddress(moduleManagerInitCode, salt)

    #initCode for deploying a new SafeProxy contract by the entrypoint
    walletProxyBytecode = SafeProxy4337.bytecode
    walletProxyArgsEncoded = eth_abi.encode_abi(
            ['address', 'address', 'address'],
            [gnosisSafeSingleton.address, moduleManagerAddress,
                owner.address]).hex()
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
            2150000,
            645000,
            21000,
            17530000000,
            17530000000,
            '0x0000000000000000000000000000000000000000',
            bytes(0),
            bytes(0)
            ]

    requestId = entryPoint.getRequestId(op)
       
    ownerSigner = w3.eth.account.from_key(owner.private_key)
    message_hash = defunct_hash_message(requestId)
    sig = ownerSigner.signHash(message_hash)
    op[11] = sig.signature.hex()

    #add the random salt, used to deploy the moduleManager by the bundler RPC
    op.append("0x{:064x}".format(salt)) 

    res = callBundler([op])
    
    assert beforeBalance + 1000000000000000000 == receiver.balance()

    socialRecoveryBytecode = SocialRecoveryModule.bytecode
    socialRecoveryInitCode = socialRecoveryBytecode #+ socialRecoveryArgsEncoded

    random.seed(owner.address)
    salt = random.randrange(1,10**32) #create a random salt for contract factory
    #calculate EIP4337Manager address using getSenderAddress
    socialRecoveryAddress = entryPoint.getSenderAddress(socialRecoveryInitCode, salt)
    

    #create callData to be executed by the SafeProxy contract
    callData = SingletonFactory.deploy.encode_input(
        '0x' + socialRecoveryInitCode,
        "0x{:064x}".format(salt)
        )
    
    #deposit eth for the proxy contract in the entrypoint (no paymaster) 
    entryPoint.depositTo(proxyAdd, 
            {'from':accounts[3], 'value': ".5 ether"})

    accounts[5].transfer(proxyAdd, "1 ether")

    deployedProxy =  Contract.from_abi("SafeProxy", proxyAdd, safeProxy.abi)


    safeCallData = deployedProxy.execTransactionFromModule.encode_input(
        SingletonFactory.address,
        0,
        callData,
        0)

    op = [
            proxyAdd,
            0,
            bytes(0),
            safeCallData,
            2150000,
            645000,
            21000,
            17530000000,
            17530000000,
            "0x0000000000000000000000000000000000000000",
            bytes(0),
            bytes(0)
            ]
    requestId = entryPoint.getRequestId(op)
    ownerSigner = w3.eth.account.from_key(owner.private_key)
    message_hash = defunct_hash_message(requestId)
    sig = ownerSigner.signHash(message_hash)
    op[11] = sig.signature
    op.append("")

    res = callBundler([op])

def callBundler(ops):
    """
    Calls the Bundle JSON RPC
    """
    opDict = {"request":[{
        "sender": op[0],
        "nonce":op[1],
        "initCode": op[2],
        "callData": op[3],
        "callGas": op[4],
        "verificationGas": op[5],
        "preVerificationGas": op[6],
        "maxFeePerGas": op[7],
        "maxPriorityFeePerGas": op[8],
        "paymaster": op[9],
        "paymasterData": op[10],
        "signature":op[11],
        "moduleManagerSalt":op[12]
        } for op in ops]}

    dictt = {
        "jsonrpc": "2.0", 
        "method": "eth_sendUserOperation", 
        "params": opDict, 
        "id": 1
    }

    x = requests.post(os.environ['BundlerRPC'] + "jsonrpc/bundler", data=json.dumps(dictt, cls=BytesEncoder))
    return x

def callPaymaster(ops):
    """
    Calls the Paymaster JSON RPC
    """
    opDict = {"request":[{
        "sender": op[0],
        "nonce":op[1],
        "initCode": op[2],
        "callData": op[3],
        "callGas": op[4],
        "verificationGas": op[5],
        "preVerificationGas": op[6],
        "maxFeePerGas": op[7],
        "maxPriorityFeePerGas": op[8],
        "paymaster": op[9],
        "paymasterData": bytes(0),
        "signature":bytes(0)
        } for op in ops],
        "token": "0x03F1B4380995Fbf41652F75a38c9F74aD8aD73F5"}

    dictt = {
        "jsonrpc": "2.0", 
        "method": "eth_paymaster", 
        "params": opDict, 
        "id": 1
    }

    result = requests.post(os.environ['BundlerRPC'] + 
        "jsonrpc/paymaster", data=json.dumps(dictt, cls=BytesEncoder))

    return json.loads(result.text)['result']

def call_getApproveAmount(ops):
    """
    Calls the Paymaster JSON RPC
    """
    opDict = {"request":[{
        "callGas": op[4],
        "verificationGas": op[5],
        "preVerificationGas": op[6],
        "maxFeePerGas": op[7],
        } for op in ops],
        "token": "0x03F1B4380995Fbf41652F75a38c9F74aD8aD73F5"}

    dictt = {
        "jsonrpc": "2.0", 
        "method": "eth_getApproveAmount", 
        "params": opDict, 
        "id": 1
    }

    result = requests.post(os.environ['BundlerRPC'] + 
        "jsonrpc/paymaster", data=json.dumps(dictt, cls=BytesEncoder))

    return int(json.loads(result.text)['result'])

def getRequestId(op):
    """
    Get an operation requestId
    Note: the wallet client can compute the request id internally (recommended)
    """
    opDict = {"request":{
        "sender": op[0],
        "nonce":op[1],
        "initCode": op[2],
        "callData": op[3],
        "callGas": op[4],
        "verificationGas": op[5],
        "preVerificationGas": op[6],
        "maxFeePerGas": op[7],
        "maxPriorityFeePerGas": op[8],
        "paymaster": op[9],
        "paymasterData": op[10],
        "signature":op[11],
        }}

    dictt = {
        "jsonrpc": "2.0", 
        "method": "eth_getRequestId", 
        "params": opDict, 
        "id": 1
    }

    result = requests.post(os.environ['BundlerRPC'] + 
        "jsonrpc/bundler", data=json.dumps(dictt, cls=BytesEncoder))

    return '0x' + json.loads(result.text)['result']


class BytesEncoder(json.JSONEncoder):
    def default(self, obj):
            if isinstance(obj, bytes):
                    return obj.hex()
            return json.JSONEncoder.default(self, obj)