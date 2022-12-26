from py_ecc.optimized_bn128 import add, multiply, normalize, FQ, FQ2, G2
from typing import Tuple

"""
Helper functions to use py_ecc library
https://github.com/ethereum/py_ecc
https://datatracker.ietf.org/doc/html/draft-irtf-cfrg-hash-to-curve-07
modified version of : https://github.com/ChihChengLiang/bls_solidity_python/blob/master/tests/test_bls.py
"""

"""
get public key from private key
"""


def get_public_key(secret_key: int):
    return multiply(G2, secret_key)


"""
sign message with private key
"""


def sign(message: Tuple[FQ, FQ, FQ], secret_key: int):
    return multiply(message, secret_key)


"""
aggregate signatures to one signature
"""


def aggregate_signatures(signatures: list[Tuple[FQ, FQ, FQ]]) -> Tuple[FQ, FQ, FQ]:
    res = signatures[0]
    for signature in signatures[1:]:
        res = add(res, signature)
    return res


"""
aggregate public keys to one public key
"""


def aggregate_public_keys(pubkeys: list[Tuple[FQ2, FQ2, FQ2]]) -> Tuple[FQ2, FQ2, FQ2]:
    res = pubkeys[0]
    for pubkey in pubkeys[1:]:
        res = add(res, pubkey)
    return res


"""
Affine to XYZ in G1 group
"""


def affine_to_xyz_G1(affine_G1: Tuple[int, int]):
    x, y = affine_G1
    return FQ(x), FQ(y), FQ(1)


"""
Affine to XYZ in G2 group
"""


def affine_to_xyz_G2(affine_G2: Tuple[int, int, int, int]):
    x1, y1, x2, y2 = affine_G2
    return FQ2((x1, y1)), FQ2((x2, y2)), FQ2((1, 0))


"""
from XYZ to Affine in G1 group
py_ecc uses homogeneous projective coordinates
A point (X, Y, Z) in homogeneous projective coordinates 
corresponds to the affine point (x, y) = (X / Z, Y / Z)
"""


def xyz_to_affine_G1(g1_element: Tuple[FQ, FQ, FQ]) -> Tuple[FQ, FQ]:
    x, y = normalize(g1_element)
    return int(x), int(y)


"""
from XYZ to Affine in G2 group
py_ecc uses homogeneous projective coordinates
A point (X, Y, Z) in homogeneous projective coordinates 
corresponds to the affine point (x, y) = (X / Z, Y / Z)
"""


def xyz_to_affine_G2(g2_element: Tuple[FQ2, FQ2, FQ2]) -> Tuple[FQ2, FQ2]:
    x, y = normalize(g2_element)
    x1, x2 = x.coeffs
    y1, y2 = y.coeffs
    return x1, x2, y1, y2
