#!/usr/bin/python3

from web3.auto import w3
from eth_account.messages import defunct_hash_message
from eth_account import Account
from hexbytes import HexBytes


def ExecuteExecTransaction(
    to,  # to Destination address
    value,  # Ether value
    data,  # Data payload
    operation,  # Operation type (0: Call, 1: Delegate)
    safeTxGas,  # Gas that should be used for the safe transaction
    baseGas,  # Gas costs for that are independent of the transaction execution
    gasPrice,  # Maximum gas price that should be used for this transaction
    gasToken,  # Token address (or 0 if ETH) that is used for the payment
    refundReceiver,  # Address of receiver of gas payment (or 0 if tx.origin)
    signerAccount,  # Account to sign with
    senderAccount,  # Account to send transaction wtih
    proxyContract,
):
    _nonce = proxyContract.nonce()
    tx_hash = proxyContract.getTransactionHash(
        to,
        value,
        data,
        operation,
        safeTxGas,
        baseGas,
        gasPrice,
        gasToken,
        refundReceiver,
        _nonce,
    )

    contract_transaction_hash = HexBytes(tx_hash)
    signer = Account.from_key(signerAccount.private_key)
    signature = signer.signHash(contract_transaction_hash)

    return proxyContract.execTransaction(
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
        {"from": senderAccount},
    )


def ExecuteEntryPointHandleOps(op, entryPoint, owner, bundler):
    requestId = entryPoint.getUserOpHash(op)
    ownerSigner = w3.eth.account.from_key(owner.private_key)
    message_hash = defunct_hash_message(requestId)
    sig = ownerSigner.signHash(
        message_hash
    )  # proxy owner should sign the entrypoint operation
    op[10] = sig.signature
    # call the entrypoint
    return entryPoint.handleOps([op], bundler, {"from": bundler})


def ExecuteSocialRecoveryOperation(
    callData, proxyContract, socialRecoveryModule, owner
):
    nonce = proxyContract.nonce()

    tx_hash = proxyContract.getTransactionHash(
        socialRecoveryModule.address,
        0,
        callData,
        0,
        0,
        0,
        0,
        "0x0000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000",
        nonce,
    )

    contract_transaction_hash = HexBytes(tx_hash)
    ownerSigner = Account.from_key(owner.private_key)
    signature = ownerSigner.signHash(contract_transaction_hash)

    proxyContract.execTransaction(
        socialRecoveryModule.address,
        0,
        callData,
        0,
        0,
        0,
        0,
        "0x0000000000000000000000000000000000000000",
        "0x0000000000000000000000000000000000000000",
        signature.signature.hex(),
        {"from": owner},
    )
