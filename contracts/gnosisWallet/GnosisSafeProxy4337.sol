//SPDX-License-Identifier: GPL
pragma solidity ^0.8.7;

/* solhint-disable avoid-low-level-calls */

import "./EIP4337Manager.sol";
import "@safe-global/safe-contracts/contracts/proxies/GnosisSafeProxy.sol";

/// @author eth-infinitism/account-abstraction - https://github.com/eth-infinitism/account-abstraction
/// @author modified by CandideWallet Team

/**
 * Create a proxy to a GnosisSafe, which accepts calls through Account-Abstraction.
 * The created GnosisSafe has a single owner.
 * It is possible to add more owners, but currently, it can only be accessed via Account-Abstraction
 * if the owners threshold is exactly 1.
 */
contract SafeProxy4337 is GnosisSafeProxy {
    constructor(
        address singleton, EIP4337Manager aaModule,
        address owner,
		address[] memory _friends, 
		uint256 _friendsThreshold
    ) GnosisSafeProxy(singleton) {
		address[] memory owners = new address[](1);
        owners[0] = owner;

		(bool success,bytes memory ret) = address(aaModule).delegatecall(
			//abi.encodeWithSignature(
                //"setupEIP4337(address,EIP4337Manager,address[],bytes)",
			abi.encodeWithSelector(EIP4337Manager.setupEIP4337.selector,
                 singleton, aaModule, owners, '0x', _friends, _friendsThreshold
			)
		);

        require(success, string(ret));
    }
}
