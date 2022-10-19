#!/usr/bin/python3

import pytest
from brownie import Contract, SafeProxy4337, reverts 
from web3.auto import w3
from eth_account.messages import defunct_hash_message
from eth_account import Account
from hexbytes import HexBytes

def ExecuteGnosisSafeExecTransaction(
    to,             #to Destination address
    value,          #Ether value
    data,           #Data payload
    operation,      #Operation type (0: Call, 1: Delegate)
    safeTxGas,      #Gas that should be used for the safe transaction
    baseGas,        #Gas costs for that are independent of the transaction execution(e.g. base transaction fee, signature check, payment of the refund)
    gasPrice,       #Maximum gas price that should be used for this transaction
    gasToken,       #Token address (or 0 if ETH) that is used for the payment
    refundReceiver, #Address of receiver of gas payment (or 0 if tx.origin)
    _nonce,         #Transaction nonce
    signerAccount,  #Account to sign with
    senderAccount,  #Account to send transaction wtih
    safeProxyContract):
    tx_hash = safeProxyContract.getTransactionHash(
        to,
        value,
        data,
        operation,
        safeTxGas,
        baseGas,
        gasPrice,
        gasToken,
        refundReceiver,
        _nonce)
    contract_transaction_hash = HexBytes(tx_hash)
    signer = Account.from_key(signerAccount.private_key)
    signature = signer.signHash(contract_transaction_hash)

    return safeProxyContract.execTransaction(
        to,
        value,
        data,
        operation,
        safeTxGas,
        baseGas,
        gasPrice,
        gasToken,
        refundReceiver,
        signature.signature.hex(),
        {'from': senderAccount}
    )


def ExecuteEntryPointHandleOpsWithExecTransaction(
        to,             #to Destination address
        value,          #Ether value
        data,           #Data payload
        operation,      #Operation type (0: Call, 1: Delegate)
        safeTxGas,      #Gas that should be used for the safe transaction
        baseGas,        #Gas costs for that are independent of the transaction execution(e.g. base transaction fee, signature check, payment of the refund)
        gasPrice,       #Maximum gas price that should be used for this transaction
        gasToken,       #Token address (or 0 if ETH) that is used for the payment
        refundReceiver, #Address of receiver of gas payment (or 0 if tx.origin)
        _nonce,         #Transaction nonce
        signerAccount,  #Account to sign with
        senderAccount,  #Account to send transaction wtih
        safeProxyContract,
        paymaster,
        paymasterData, 
        entryPoint 
        ):
    tx_hash = safeProxyContract.getTransactionHash(
        to,
        value,
        data,
        operation,
        safeTxGas,
        baseGas,
        gasPrice,
        gasToken,
        refundReceiver,
        _nonce+1)
        
    contract_transaction_hash = HexBytes(tx_hash)
    ownerSigner = Account.from_key(signerAccount.private_key)
    signature = ownerSigner.signHash(contract_transaction_hash)

    callData = safeProxyContract.execTransaction.encode_input(
        to,
        value,
        data,
        operation,
        safeTxGas,
        baseGas,
        gasPrice,
        gasToken,
        refundReceiver,
        signature.signature.hex())

    op = [
            safeProxyContract.address,
            _nonce,
            bytes(0),
            callData,
            2150000,
            645000,
            21000,
            17530000000,
            17530000000,
            paymaster,
            paymasterData,
            '0x'
            ]
    requestId = entryPoint.getRequestId(op)
    ownerSigner = w3.eth.account.from_key(signerAccount.private_key)
    message_hash = defunct_hash_message(requestId)
    sig = ownerSigner.signHash(message_hash)
    op[11] = sig.signature
    return entryPoint.handleOps([op], senderAccount, {'from': senderAccount})


def ExecuteEntryPointHandleOps(
        op, 
        entryPoint, 
        owner, 
        bundler
        ):
    requestId = entryPoint.getRequestId(op)
    ownerSigner = w3.eth.account.from_key(owner.private_key)
    message_hash = defunct_hash_message(requestId)
    sig = ownerSigner.signHash(message_hash) #SafeProxy owner should sign the entrypoint operation
    op[11] = sig.signature
    #call the entrypoint
    return entryPoint.handleOps([op], bundler, {'from': bundler})


def ExecuteSocialRecoveryOperation(
        callData, 
        safeProxyContract,
        socialRecoveryModule,
        owner
        ):
    nonce = safeProxyContract.nonce()

    tx_hash = safeProxyContract.getTransactionHash(
        socialRecoveryModule.address,
        0,
        callData,
        0,
        215000,
        215000,
        100000,
        "0x0000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000",
        nonce)
        
    contract_transaction_hash = HexBytes(tx_hash)
    ownerSigner = Account.from_key(owner.private_key)
    signature = ownerSigner.signHash(contract_transaction_hash)

    safeProxyContract.execTransaction(
        socialRecoveryModule.address,
        0,
        callData,
        0,
        215000,
        215000,
        100000,
        "0x0000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000",
       signature.signature.hex(), {'from':owner})
