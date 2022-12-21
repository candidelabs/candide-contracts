#!/usr/bin/python3

import pytest
from brownie import accounts, reverts 

from  testBLSUtils import *
from web3.auto import w3
import eth_abi

from eth_utils import encode_hex

def test_bls_pyecc_lib(testBLS):
    """
    Test bls signatures using py_ecc
    """ 
    secret_key = 123
    public_key = get_public_key(secret_key)
    data = encode_hex("fooooo")
    BLS_DOMAIN = w3.solidityKeccak(['bytes'], [str.encode('eip4337.bls.domain')])

    message_affine = tuple(testBLS.hashToPoint(BLS_DOMAIN, data))
    message_jac = affine_to_jacopian_G1(message_affine)

    sig = sign(message_jac, secret_key)

    message_affine_2 = jacobian_to_affine_G1(message_jac)
    assert message_affine_2 == message_affine

    pubkey_affine = jacobian_to_affine_G2(public_key)
    sig_affine = jacobian_to_affine_G1(sig)
    assert testBLS.verifySingle(sig_affine, pubkey_affine, message_affine)

def test_wallet_bls_signature(bLSAccount, testBLS):
    """
    Test retriving public key from bls wallet instance and signing and verifying
    signatures
    """
    #get private keys
    sk1 = bLSAccount[1][0]
    sk2 = bLSAccount[1][1]

    #get Wallets instances 
    wallet1 = bLSAccount[0][0]
    wallet2 = bLSAccount[0][1]

    #get public keys 
    pk1_int = wallet1.getBlsPublicKey()
    pk2_int = wallet2.getBlsPublicKey()

    BLS_DOMAIN = bytes.fromhex(w3.solidityKeccak(['bytes32'], 
        [str.encode('eip4337.bls.domain')]).hex()[2:])
    
    m1: bytes = bytes([1, 2, 3, 4, 5])
    message1_affine = tuple(testBLS.hashToPoint(BLS_DOMAIN, m1))
    message1_jac = affine_to_jacopian_G1(message1_affine)
    sig1 = sign(message1_jac, sk1)

    m2: bytes = bytes([1, 2, 3, 4, 5, 6, 7])
    message2_affine = tuple(testBLS.hashToPoint(BLS_DOMAIN, m2))
    message2_jac = affine_to_jacopian_G1(message2_affine)
    sig2 = sign(message2_jac, sk2)

    sig1_affine = jacobian_to_affine_G1(sig1)
    sig2_affine = jacobian_to_affine_G1(sig2)
    
    assert testBLS.verifySingle(sig1_affine, pk1_int, message1_affine)
    assert testBLS.verifySingle(sig2_affine, pk2_int, message2_affine)

def test_wallet_bls_aggregated_signature_through_entrypoint(bLSAccount, entryPoint, 
        bLSSignatureAggregator, owner, accounts, receiver, testBLS):
    """
    Test BLS aggregation through 4337 entrypoint
    """
    #get private keys
    sk1 = bLSAccount[1][0]
    sk2 = bLSAccount[1][1]
    
    #get Wallets instances 
    wallet1 = bLSAccount[0][0]
    wallet2 = bLSAccount[0][1]

    #get public keys 
    pk1_int = wallet1.getBlsPublicKey()
    pk2_int = wallet2.getBlsPublicKey()

    #create call data from wallet1
    callData1 = wallet1.execute.encode_input(receiver, 5, "")
    op1 = [
            wallet1.address,
            0,
            bytes(0),
            callData1,
            215000,
            645000,
            21000,
            17530000000,
            17530000000,
            bytes(0),
            bytes(0)
            ]
    
    #get entrypoint operation hash to sign
    messageToSign1 = bLSSignatureAggregator.userOpToMessage(op1)

    #sign entrypoint operation hash
    sig1 = sign(affine_to_jacopian_G1(messageToSign1), sk1)
    sig1_affine = jacobian_to_affine_G1(sig1)

    #formate signature    
    op1[10] = eth_abi.encode(['uint256[2]'],[sig1_affine])
    
    assert testBLS.verifySingle(sig1_affine, pk1_int, messageToSign1)
    assert bLSSignatureAggregator.validateUserOpSignature(op1) == '0x' 
    
    #create call data from wallet2
    callData2 = wallet2.execute.encode_input(receiver, 10, "")
    op2 = [
            wallet2.address,
            0,
            bytes(0),
            callData2,
            215000,
            645000,
            21000,
            17530000000,
            17530000000,
            bytes(0),
            bytes(0)
            ]
    
    #get entrypoint operation hash to sign
    messageToSign2 = bLSSignatureAggregator.userOpToMessage(op2)

    #sign entrypoint operation hash
    sig2 = sign(affine_to_jacopian_G1(messageToSign2), sk2)
    sig2_affine = jacobian_to_affine_G1(sig2)

    #formate signature    
    op2[10] = eth_abi.encode(['uint256[2]'],[sig2_affine])
    
    assert testBLS.verifySingle(sig2_affine, pk2_int, messageToSign2)
    assert bLSSignatureAggregator.validateUserOpSignature(op2) == '0x' 

    agg_sig = bLSSignatureAggregator.aggregateSignatures([op1, op2])

    #assert value from aggregator contract is equal to py_ecc library aggregation
    assert agg_sig == '0x' + eth_abi.encode(['uint256[2]'],
        [jacobian_to_affine_G1(aggregate_signatures([sig1, sig2]))]).hex()

    #send ether to wallets
    accounts[0].transfer(wallet1, "1 ether")
    accounts[0].transfer(wallet2, "1 ether")
    
    beforeBalance = receiver.balance()

    entryPoint.handleAggregatedOps([[[op1,op2], 
                                    bLSSignatureAggregator.address, 
                                    agg_sig]], owner, {'from': owner})

    #check if the two transaction was excuted using aggregated operations
    assert beforeBalance + 15 == receiver.balance()