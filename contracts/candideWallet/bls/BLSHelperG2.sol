// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.12;

/// @title BLSHelperG2 same as BLSHelper for the G2 group
/// @author CandideWallet Team
library  BLSHelperG2 {

   struct G2PointElement{
        uint e1;
        uint e2;
    } 

    struct Point{
        G2PointElement x;
        G2PointElement y;
    }
    
    /**
     * sum all the points in the array
     * @param points an array of G2PointElement[2], representing an (x,y) of a point
     * @param _pp the modulus of the curve
     * @return ret the sum of all points
     */
    function sum(Point[] memory points, uint _pp) 
        internal pure returns (Point memory ret){
        G2PointElement memory x = points[0].x;
        G2PointElement memory y = points[0].y;
        G2PointElement memory z = G2PointElement(1,0);

        for (uint i = 1; i < points.length; i++) {
            (x, y, z) = Add(x, y, z, points[i].x, points[i].y, z, _pp);
        }
        (ret.x, ret.y) = toAffine(x, y, z, _pp);
    }

    /// @dev similar to imaginary numbers
    function addQE(G2PointElement memory _a, G2PointElement memory _b, uint _p)
        internal pure returns(G2PointElement memory){
        return(G2PointElement(addmod(_a.e1, _b.e1, _p), 
            addmod(_a.e2, _b.e2, _p)));
    }

    /// @dev similar to imaginary numbers
    function subQE(G2PointElement memory _a, G2PointElement memory _b, uint _p)
        internal pure returns(G2PointElement memory ret){
        return(G2PointElement(addmod(_a.e1, _p - _b.e1, _p), 
            addmod(_a.e2, _p - _b.e2, _p)));
    }

    /// @dev similar to imaginary numbers
    function mulQE(G2PointElement memory _a, G2PointElement memory _b, uint _p)
        internal pure returns(G2PointElement memory){
        uint[3] memory b;
        b[0] = mulmod(_a.e1, _b.e1, _p);
        b[1] = addmod(mulmod(_a.e1, _b.e2, _p), mulmod(_b.e1, _a.e2, _p), _p);
        b[2] = mulmod(_a.e2, _b.e2, _p);
        return(G2PointElement(addmod(b[0], _p - b[2], _p), b[1]));
    }
    
    /// @dev similar to imaginary numbers
    function mulQE(uint256 _a, G2PointElement memory _b, uint _p)
        internal pure returns(G2PointElement memory){
        return(G2PointElement(mulmod(_a, _b.e1, _p), 
            mulmod(_a, _b.e2, _p)));

    }

    /// @dev Adds two points (x1, y1, z1) and (x2 y2, z2).
    /// @dev https://github.com/ethereum/py_ecc/blob/master/py_ecc/optimized_bn128/optimized_curve.py
    /// @param _x1 coordinate x of P1
    /// @param _y1 coordinate y of P1
    /// @param _z1 coordinate z of P1
    /// @param _x2 coordinate x of square
    /// @param _y2 coordinate y of square
    /// @param _z2 coordinate z of square
    /// @param _pp the modulus
    /// @return (qx, qy, qz)
    function Add(
        G2PointElement memory _x1,
        G2PointElement memory _y1,
        G2PointElement memory _z1,
        G2PointElement memory _x2,
        G2PointElement memory _y2,
        G2PointElement memory _z2,
        uint256 _pp)
    internal pure returns (G2PointElement memory, G2PointElement memory, 
                            G2PointElement memory){
        if(_z1.e1 == 0 && _z1.e2 == 0){
            return (_x2, _y2, _z2);
        }
        if(_z2.e1 == 0 && _z2.e2 == 0){
            return (_x1, _y1, _z1);
        }

        G2PointElement[4] memory u;
        // U1, U2, V1, V2
        u[0] = mulQE(_y2, _z1, _pp);
        u[1] = mulQE(_y1, _z2, _pp);
        u[2] = mulQE(_x2, _z1, _pp);
        u[3] = mulQE(_x1, _z2, _pp);

        require(u[2].e1 != u[3].e1 || u[2].e2 != u[3].e2 ||
            u[0].e1 != u[1].e1 || u[0].e2 != u[1].e2, "Both points can't be identical");

        if(u[2].e1 == u[3].e1 && u[2].e2 == u[3].e2){
            return (G2PointElement(1,0), G2PointElement(1,0), G2PointElement(0,0));
        }        

        G2PointElement[7] memory V;
        V[0] = subQE(u[0], u[1], _pp);//U
        V[1] = subQE(u[2], u[3], _pp);//V
        V[2] = mulQE(V[1], V[1], _pp);//V_squared
        V[3] = mulQE(V[2], u[3], _pp);//V_squared_times_V2
        V[4] = mulQE(V[1], V[2], _pp);//V_cubed
        V[5] = mulQE(_z1,_z2, _pp);//W
        V[6] = subQE(
                mulQE(mulQE(V[0], V[0], _pp), V[5], _pp),
                addQE(V[4], mulQE(2, V[3], _pp), _pp), 
                _pp);//A
		
      return (
			mulQE(V[1], V[6], _pp), 
            subQE(mulQE(V[0], subQE(V[3], V[6], _pp), _pp), mulQE(V[4], u[1], _pp), _pp), 
            mulQE(V[4], V[5], _pp)
            );
    }

    /// @dev Converts a point (x, y, z) expressed in projective coordinates to affine coordinates (x', y', 1).
    /// @param _x coordinate x
    /// @param _y coordinate y
    /// @param _z coordinate z
    /// @param _pp the modulus
    /// @return (x', y') affine coordinates
    function toAffine(
        G2PointElement memory _x,
        G2PointElement memory _y,
        G2PointElement memory _z,
        uint256 _pp)
    internal pure returns (G2PointElement memory, G2PointElement memory)
    {
        G2PointElement memory zInv = invMod(_z, _pp);
        return (mulQE(_x, zInv, _pp), mulQE(_y, zInv, _pp));
    }

    function invMod(G2PointElement memory _x, uint256 _pp) 
        internal pure returns (G2PointElement memory ret) {
            uint256 mod = invMod(addmod(mulmod(_x.e1, _x.e1, _pp), 
                                mulmod(_x.e2, _x.e2, _pp), _pp), _pp);
            return G2PointElement(mulmod(_x.e1, mod, _pp), 
                    mulmod(_pp - _x.e2, mod, _pp));
    }

    /// @dev Modular euclidean inverse of a number (mod p).
    /// @param _x The number
    /// @param _pp The modulus
    /// @return q such that x*q = 1 (mod _pp)
    function invMod(uint256 _x, uint256 _pp) internal pure returns (uint256) {
        require(_x != 0 && _x != _pp && _pp != 0, "Invalid number");
        uint256 q = 0;
        uint256 newT = 1;
        uint256 r = _pp;
        uint256 t;
        while (_x != 0) {
            t = r / _x;
            (q, newT) = (newT, addmod(q, (_pp - mulmod(t, newT, _pp)), _pp));
            (r, _x) = (_x, r - t * _x);
        }
        return q;
    }

} 
