#!/usr/bin/python3

from brownie import accounts  # noqa: F401

from testBLSUtils import (
    sign,
    aggregate_signatures,
    aggregate_public_keys,
    affine_to_xyz_G1,
    affine_to_xyz_G2,
    get_public_key,
    xyz_to_affine_G1,
    xyz_to_affine_G2,
)
from web3.auto import w3

from eth_utils.hexadecimal import encode_hex

"""
Note: py_ecc uses homogeneous projective coordinates, while blsHelper.sol uses
Jacobian projective coordinates, so you should always converte a point to the
affine form after processing it with py_ecc using xyz_to_affine_G1
and xyz_to_affine_G2
"""


def test_bls_pyecc_lib(testBLS):
    """
    Test bls multisig signatures using py_ecc
    Two signers sign one message
    Aggregate both public keys and signatures
    Verify the aggregated signature with the aggregated public key
    """
    secret_key1 = 123
    secret_key2 = 456
    public_key1 = get_public_key(secret_key1)
    public_key2 = get_public_key(secret_key2)
    data = encode_hex("fooooo")
    BLS_DOMAIN = w3.solidity_keccak(
        ["bytes"], [str.encode("eip4337.bls.domain")]
    )

    message_affine = tuple(testBLS.hashToPoint(BLS_DOMAIN, data))
    message_xyz = affine_to_xyz_G1(message_affine)

    sig1 = sign(message_xyz, secret_key1)
    sig2 = sign(message_xyz, secret_key2)

    agg_sig = aggregate_signatures([sig1, sig2])
    agg_pubkey = aggregate_public_keys([public_key1, public_key2])

    assert testBLS.verifySingle(
        xyz_to_affine_G1(agg_sig), xyz_to_affine_G2(agg_pubkey), message_affine
    )


def test_wallet_bls_signature(bLSAccountMultisig, testBLS):
    """
    Test retriving public key from bls wallet instance and signing and
    verifying signatures
    """
    # get private keys for wallet1
    sk1w1 = bLSAccountMultisig[1][0][0]
    sk2w1 = bLSAccountMultisig[1][0][1]
    # get private keys for wallet2
    sk1w2 = bLSAccountMultisig[1][1][0]
    sk2w2 = bLSAccountMultisig[1][1][1]

    # get Wallets instances
    wallet1 = bLSAccountMultisig[0][0]
    wallet2 = bLSAccountMultisig[0][1]

    # get public keys
    (pk1w1_int, pk2w1_int) = wallet1.getBlsPublicKeys()
    (pk1w2_int, pk2w2_int) = wallet2.getBlsPublicKeys()
    pk1w1 = affine_to_xyz_G2(pk1w1_int)
    pk2w1 = affine_to_xyz_G2(pk2w1_int)
    pk1w2 = affine_to_xyz_G2(pk1w2_int)
    pk2w2 = affine_to_xyz_G2(pk2w2_int)

    BLS_DOMAIN = bytes.fromhex(
        w3.solidity_keccak(
            ["bytes32"], [str.encode("eip4337.bls.domain")]
        ).hex()[2:]
    )

    # multisig sign message1 using wallet1
    m1: bytes = bytes([1, 2, 3, 4, 5])
    message1_affine = tuple(testBLS.hashToPoint(BLS_DOMAIN, m1))
    message1_xyz = affine_to_xyz_G1(message1_affine)
    sig1w1 = sign(message1_xyz, sk1w1)
    sig2w1 = sign(message1_xyz, sk2w1)

    # multisig sign message2 using wallet2
    m2: bytes = bytes([1, 2, 3, 4, 5, 6, 7])
    message2_affine = tuple(testBLS.hashToPoint(BLS_DOMAIN, m2))
    message2_xyz = affine_to_xyz_G1(message2_affine)
    sig1w2 = sign(message2_xyz, sk1w2)
    sig2w2 = sign(message2_xyz, sk2w2)

    # aggregate signatures to create one signature per wallet
    agg_sig_w1 = aggregate_signatures([sig1w1, sig2w1])
    agg_sig_w2 = aggregate_signatures([sig1w2, sig2w2])
    agg_sig_w1_affine = xyz_to_affine_G1(agg_sig_w1)
    agg_sig_w2_affine = xyz_to_affine_G1(agg_sig_w2)

    # aggregate public keys to create one public key per wallet
    agg_pubkey_w1 = aggregate_public_keys([pk1w1, pk2w1])
    agg_pubkey_w2 = aggregate_public_keys([pk1w2, pk2w2])
    agg_pubkey_w1_xyz = xyz_to_affine_G2(agg_pubkey_w1)
    agg_pubkey_w2_xyz = xyz_to_affine_G2(agg_pubkey_w2)

    # verify aggregated public key and signature per wallet for each message
    assert testBLS.verifySingle(
        agg_sig_w1_affine, agg_pubkey_w1_xyz, message1_affine
    )
    assert testBLS.verifySingle(
        agg_sig_w2_affine, agg_pubkey_w2_xyz, message2_affine
    )

    # aggregate the 2 wallets signatures
    agg_sig = aggregate_signatures([agg_sig_w1, agg_sig_w2])
    agg_sig_affine = xyz_to_affine_G1(agg_sig)

    # verify the overall aggregated signature for both messages
    assert testBLS.verifyMultiple(
        agg_sig_affine,
        [agg_pubkey_w1_xyz, agg_pubkey_w2_xyz],
        [message1_affine, message2_affine],
    )
