// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.18;
import {Safe} from "@safe-global/safe-contracts/contracts/Safe.sol";

contract TestExecutor is Safe {

    function testSetup(
        address[] calldata _owners,
        uint256 _threshold,
        address fallbackHandler,
        address[] memory modules
    ) external {
        threshold = 0;
        this.setup(_owners, _threshold, address(0), "", fallbackHandler, address(0), 0, payable(address(0)));
        for (uint i=0; i<modules.length; i++){
            this.enableModule(modules[i]);
        }
    }

    function exec(address payable to, uint256 value, bytes calldata data) external {
        bool success;
        bytes memory response;
        (success, response) = to.call{value: value}(data);
        if (!success) {
            // solhint-disable-next-line no-inline-assembly
            assembly {
                revert(add(response, 0x20), mload(response))
            }
        }
    }

}