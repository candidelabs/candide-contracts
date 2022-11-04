#!/usr/bin/python3

import pytest
from web3.auto import w3
from eth_account.messages import defunct_hash_message
from  testUtils import *

def test_fees(safeProxy, owner, bundler, receiver, tokenErc20,
        entryPoint, candidePaymaster, accounts):
    """
    Test fees calculation and gas estimation
    """
    accounts[0].transfer(safeProxy, "1 ether")#Add ether to wallet

    receiverBeforeBalance = receiver.balance()
    walletBeforeBalance = safeProxy.balance()
    walletEntryPointBeforeDeposit = entryPoint.deposits(safeProxy.address)[0]
    bundlerBeforeBalance = bundler.balance()
    
    assert walletEntryPointBeforeDeposit == 0

    nonce = 0
    amountToSend = 5

    #using execTransactionFromModule
    callData = safeProxy.execTransactionFromModule.encode_input(
        receiver.address,
        amountToSend,
        "0x",
        0)

    maxFeePerGas = 1 #maxFeePerGas & maxPriorityFeePerGas (should be according to the chain gas live fees)
    callGas = 10**5  #to be estimated for each operation
    verificationGas = 10**5 #to be estimated for the wallet verification process
    preVerificationGas = 10**4 #should cover the bundler batch and overhead - can be controlled for the bundler to be profitable

    op = [
            safeProxy.address,
            nonce,
            bytes(0),
            callData,
            callGas,
            verificationGas,
            preVerificationGas,
            maxFeePerGas,
            maxFeePerGas,
            '0x0000000000000000000000000000000000000000',
            '0x',
            '0x'
            ]
    
    nonce = nonce + 1
    tx = ExecuteEntryPointHandleOps(op, entryPoint, owner, bundler)

    feesPaidByWallet = walletBeforeBalance - (safeProxy.balance() + amountToSend)
    feesReceivedByBundler = bundler.balance() - bundlerBeforeBalance #equal to actualGasCost
    walletEntryPointAfterDeposit = entryPoint.deposits(safeProxy.address)[0]

    operationMaxGas = callGas + verificationGas + preVerificationGas #userOp.callGas + userOp.verificationGas  + userOp.preVerificationGas

    assert receiverBeforeBalance + amountToSend == receiver.balance()
    assert feesPaidByWallet == operationMaxGas * maxFeePerGas
    assert feesReceivedByBundler == tx.events["UserOperationEvent"][0]['actualGasCost']
    assert feesReceivedByBundler < tx.gas_used * maxFeePerGas #maybe be not profitable for the bundler- verificationGas should be approx 10**6 to be profitable
    assert walletEntryPointAfterDeposit > 0
    assert feesPaidByWallet == feesReceivedByBundler + walletEntryPointAfterDeposit #walletEntryPointBeforeDeposit is 0

    """
    second operation
    """
    receiverBeforeBalance = receiver.balance()
    walletBeforeBalance = safeProxy.balance()
    walletEntryPointBeforeDeposit = entryPoint.deposits(safeProxy.address)[0]
    bundlerBeforeBalance = bundler.balance()

    op = [
            safeProxy.address,
            nonce,
            bytes(0),
            callData,
            callGas,
            verificationGas,
            preVerificationGas * 10, #increase preVerificationGas for the bundler to be profitable
            maxFeePerGas,
            maxFeePerGas,
            '0x0000000000000000000000000000000000000000',
            '0x',
            '0x'
            ]

    nonce = nonce + 1
    tx = ExecuteEntryPointHandleOps(op, entryPoint, owner, bundler)
    feesPaidByWallet = walletBeforeBalance - (safeProxy.balance() + amountToSend)
    feesReceivedByBundler = bundler.balance() - bundlerBeforeBalance #equal to actualGasCost
    walletEntryPointAfterDeposit = entryPoint.deposits(safeProxy.address)[0]

    operationMaxGas = callGas + verificationGas + preVerificationGas * 10 #userOp.callGas + userOp.verificationGas  + userOp.preVerificationGas

    assert receiverBeforeBalance + amountToSend == receiver.balance()
    assert feesPaidByWallet == (operationMaxGas * maxFeePerGas) - walletEntryPointBeforeDeposit
    assert feesReceivedByBundler == tx.events["UserOperationEvent"][0]['actualGasCost']
    assert feesReceivedByBundler > tx.gas_used * maxFeePerGas #profitable for the bundler
    assert walletEntryPointAfterDeposit > 0
    assert feesPaidByWallet == feesReceivedByBundler + (walletEntryPointAfterDeposit - walletEntryPointBeforeDeposit)

    """
    third operation with paymaster (approve + send eth)
    """

    accounts[0].transfer(bundler, "3 ether")
    candidePaymaster.addStake(100, {'from':bundler, 'value': "1 ether"})
    candidePaymaster.deposit({'from':bundler, 'value': "1 ether"})

    tokenErc20.transfer(safeProxy.address, "1 ether", {'from':bundler})

    receiverBeforeBalance = receiver.balance()
    walletBeforeBalance = safeProxy.balance()
    walletEntryPointBeforeDeposit = entryPoint.deposits(safeProxy.address)[0]
    bundlerBeforeBalance = bundler.balance()

    #(callGas + verificationGas * 3 + preVerificationGas) * maxFeePerGas
    operationMaxEthCostUsingPaymaster = (callGas + verificationGas * 3 + preVerificationGas) * maxFeePerGas
    
    conversionRate = 1 # token/eth conversionRate
    maxTokenCost = operationMaxEthCostUsingPaymaster * conversionRate
    maxTokenCostHex = str("{0:0{1}x}".format(maxTokenCost,40))
    
    costOfPost = verificationGas * maxFeePerGas #gas cost of postOp (can be controlled be profitable to the paymaster service)
    costOfPostHex = str("{0:0{1}x}".format(costOfPost,40))
    
    ops = []
    approveCallData = tokenErc20.approve.encode_input(candidePaymaster.address, maxTokenCost)
    callData = safeProxy.execTransactionFromModule.encode_input(
            tokenErc20.address,
            0,
            approveCallData,
            0)
    op = [
        safeProxy.address,
        nonce,
        bytes(0),
        callData,
        callGas,
        verificationGas,
        preVerificationGas,
        maxFeePerGas,
        maxFeePerGas,
        candidePaymaster.address,
        bytes(0),
        bytes(0)
        ]
    nonce = nonce + 1

    token = tokenErc20.address[2:]

    datahash = candidePaymaster.getHash(op, maxTokenCost, costOfPost, tokenErc20.address)
    bundlerSigner = w3.eth.account.from_key(bundler.private_key)
    sig = bundlerSigner.signHash(datahash)
        
    paymasterData = maxTokenCostHex + costOfPostHex + token + sig.signature.hex()[2:]

    op[10] = paymasterData

    requestId = entryPoint.getRequestId(op)
    
    ownerSigner = w3.eth.account.from_key(owner.private_key)
    message_hash = defunct_hash_message(requestId)
    sig = ownerSigner.signHash(message_hash)
    op[11] = sig.signature

    ops.append(op)

    paymasterBeforeDepositBalance = entryPoint.deposits(candidePaymaster.address)[0]
    paymasterBeforeBalanceERC = tokenErc20.balanceOf(candidePaymaster.address)

    callData = safeProxy.execTransactionFromModule.encode_input(
        receiver.address,
        5,
        "0x",
        0)

    op = [
            safeProxy.address,
            nonce,
            bytes(0),
            callData,
            callGas,
            verificationGas,
            preVerificationGas,
            maxFeePerGas,
            maxFeePerGas,
            candidePaymaster.address,
            '0x',
            '0x'
            ]


    datahash = candidePaymaster.getHash(op, maxTokenCost, costOfPost, tokenErc20.address)
    bundlerSigner = w3.eth.account.from_key(bundler.private_key)
    sig = bundlerSigner.signHash(datahash)

    paymasterData = maxTokenCostHex + costOfPostHex + token + sig.signature.hex()[2:]

    op = [
            safeProxy.address,
            nonce,
            bytes(0),
            callData,
            callGas,
            verificationGas,
            preVerificationGas,
            maxFeePerGas,
            maxFeePerGas,
            candidePaymaster.address,
            paymasterData,
            '0x'
            ]
    
    requestId = entryPoint.getRequestId(op)
    ownerSigner = w3.eth.account.from_key(owner.private_key)
    message_hash = defunct_hash_message(requestId)
    sig = ownerSigner.signHash(message_hash)
    op[11] = sig.signature

    ops.append(op)
    tx = entryPoint.handleOps(ops, bundler, {'from': bundler})
   
    assert receiverBeforeBalance + 5 == receiver.balance() #verifing eth is sent
    assert tokenErc20.balanceOf(candidePaymaster.address) > paymasterBeforeBalanceERC #verify paymaster is payed

    feesPaidByWallet = walletBeforeBalance - (safeProxy.balance() + amountToSend)
    feesReceivedByBundler = bundler.balance() - bundlerBeforeBalance #equal to actualGasCost
    walletEntryPointAfterDeposit = entryPoint.deposits(safeProxy.address)[0]
    feesPaidByPaymasterDeposit = paymasterBeforeDepositBalance - entryPoint.deposits(candidePaymaster.address)[0]
    paymasterAfterBalanceERC = tokenErc20.balanceOf(candidePaymaster.address)
    gasLimitPredictionAccuracy = tx.gas_used * maxFeePerGas / operationMaxEthCostUsingPaymaster

    assert receiverBeforeBalance + amountToSend == receiver.balance()
    assert feesPaidByWallet == 0 #because the paymaster spondored the operation
    assert feesReceivedByBundler == tx.events["UserOperationEvent"][0]['actualGasCost'] + tx.events["UserOperationEvent"][1]['actualGasCost']
    assert feesReceivedByBundler < tx.gas_used * maxFeePerGas #maybe be not profitable for the bundler- verificationGas should be approx 10**6 to be profitable
    assert walletEntryPointAfterDeposit > 0
    assert walletEntryPointAfterDeposit == walletEntryPointBeforeDeposit
    assert feesPaidByPaymasterDeposit == feesReceivedByBundler
    assert (paymasterAfterBalanceERC - paymasterBeforeBalanceERC) * conversionRate > feesPaidByPaymasterDeposit #profitable for the paymaster service
    assert gasLimitPredictionAccuracy > .5 #check accuracy of predicted gas limit to be more than 50%