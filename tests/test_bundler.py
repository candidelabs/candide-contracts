#!/usr/bin/python3

import json
from web3.auto import w3
from eth_account.messages import defunct_hash_message
from eth_account import Account
from hexbytes import HexBytes
import requests

#This test should be run while the bundler JSON RPC server is running

def get_test_safeTransactions(N, safeProxy, tokenErc20, verifyingPaymaster,
    entryPoint, bundler, owner, receiver, accounts):
    ops = []
    nonce = safeProxy.nonce({'from': owner})
    for i in range(N):
        tr=[
            receiver.address,
            5,
            0,
            0,
            215000,
            215000,
            100000,
            tokenErc20.address,
            bundler.address,
            N+i
        ]
        
        tx_hash = safeProxy.getTransactionHash(
        tr[0],
        tr[1],
        tr[2],
        tr[3],
        tr[4],
        tr[5],
        tr[6],
        tr[7],
        tr[8],
        tr[9])

        contract_transaction_hash = HexBytes(tx_hash)
        ownerSigner = Account.from_key(owner.private_key)
        signature = ownerSigner.signHash(contract_transaction_hash)

        callData = safeProxy.execTransaction.encode_input(
        tr[0],
        tr[1],
        tr[2],
        tr[3],
        tr[4],
        tr[5],
        tr[6],
        tr[7],
        tr[8],
        signature.signature.hex())

        op = [
        safeProxy.address,
        i,
        bytes(0),
        callData,
        2150000,
        645000,
        21000,
        17530000000,
        17530000000,
        verifyingPaymaster.address,
        bytes(0),
        bytes(0)
        ]
        
        paymasterData = callPaymaster(op)

        op[10] = paymasterData

        requestId = entryPoint.getRequestId(op)
       
        ownerSigner = w3.eth.account.from_key(owner.private_key)
        message_hash = defunct_hash_message(requestId)
        sig = ownerSigner.signHash(message_hash)
        op[11] = sig.signature

        ops.append(op)

    return ops

def test_transfer_from_entrypoint_with_verification_paymaster(
    safeProxy, tokenErc20,
    owner, bundler, entryPoint, verifyingPaymaster, receiver, accounts):
    """
    Test sponsor transaction fees with erc20 with a verification paymaster
    """
    N = 10
    safeTransactions = get_test_safeTransactions(N,safeProxy, tokenErc20, verifyingPaymaster,
    entryPoint, bundler, owner, receiver, accounts)
    #assert False
    accounts[0].transfer(safeProxy, "1 ether")
    beforeBalance = receiver.balance()

    accounts[0].transfer(bundler, "3 ether")
    verifyingPaymaster.addStake(100, {'from':bundler, 'value': "1 ether"})
    verifyingPaymaster.deposit({'from':bundler, 'value': "1 ether"})

    tokenErc20.approve(verifyingPaymaster.address, "1 ether", {'from':bundler})
    tokenErc20.transfer(safeProxy.address, "1 ether", {'from':bundler})
    bundlerBalance = tokenErc20.balanceOf(bundler)

    res = callBundler(safeTransactions)

    assert beforeBalance + 5 * N == receiver.balance() #verifing eth is sent
    assert tokenErc20.balanceOf(bundler) > bundlerBalance #verify bundler is payed

def callBundler(ops):
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
        "signature":op[11]
        } for op in ops]}

    dictt = {
        "jsonrpc": "2.0", 
        "method": "eth_sendUserOperation", 
        "params": opDict, 
        "id": 1
    }

    x = requests.post("http://127.0.0.1:8000/jsonrpc/", data=json.dumps(dictt, cls=BytesEncoder))
    return x

def callPaymaster(op):
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
        "paymasterData": bytes(0),
        "signature":bytes(0)
        }}

    dictt = {
        "jsonrpc": "2.0", 
        "method": "eth_paymaster", 
        "params": opDict, 
        "id": 1
    }

    x = requests.post("http://127.0.0.1:8000/jsonrpc/", data=json.dumps(dictt, cls=BytesEncoder))

    return json.loads(x.text)['result']

def getRequestId(op):
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
        "signature":op[11]
        }}

    dictt = {
        "jsonrpc": "2.0", 
        "method": "eth_getRequestId", 
        "params": opDict, 
        "id": 1
    }

    x = requests.post("http://127.0.0.1:8000/jsonrpc/", data=json.dumps(dictt, cls=BytesEncoder))

    return '0x' + json.loads(x.text)['result']


class BytesEncoder(json.JSONEncoder):
    def default(self, obj):
            if isinstance(obj, bytes):
                    return obj.hex()
            return json.JSONEncoder.default(self, obj)