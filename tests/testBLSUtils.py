from py_ecc.optimized_bn128 import add, multiply, normalize, FQ, FQ2, G2
from typing import Tuple

"""
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
def aggregate_signatures(signatures: list[Tuple[FQ, FQ, FQ]])->Tuple[FQ, FQ, FQ]:
    res = signatures[0]
    for signature in signatures[1:]:
        res = add(res, signature)
    return res

def aggregate_public_keys(signatures):
    pass

"""
Affine to jacopian with z=1
"""
def affine_to_jacopian_G1(affine_G1: Tuple[int, int]):
    x, y = affine_G1
    return FQ(x), FQ(y), FQ(1)

"""
Affine to Jacobian over Fq (G1)
"""
def jacobian_to_affine_G1(g1_element: Tuple[FQ, FQ, FQ]) -> Tuple[FQ, FQ]:
    x, y = normalize(g1_element)
    return (int(x), int(y))

"""
Affine to Jacobian over Fq2 (G2) (quadratic extension)
"""
def jacobian_to_affine_G2(g2_element: Tuple[FQ2, FQ2, FQ2]) -> Tuple[FQ2, FQ2]:
    x, y = normalize(g2_element)
    x1, x2 = x.coeffs
    y1, y2 = y.coeffs
    return x1, x2, y1, y2