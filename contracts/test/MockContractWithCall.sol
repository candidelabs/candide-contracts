// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.7.0 <0.9.0;

import "@safe-global/mock-contract/contracts/MockContract.sol";

interface MockWithCallInterface is MockInterface {

    function executeDelegatecallViaMock(
        address payable to,
        bytes memory data,
        uint256 gas
    ) external returns (bool success, bytes memory response);

    function executeCallViaMock(
        address payable to,
        uint256 value,
        bytes memory data,
        uint256 gas
    ) external returns (bool success, bytes memory response);

}

/**
 * Implementation of the MockWithCallInterface.
 */
contract MockContractWithCall is MockWithCallInterface, MockContract {

    /**
     * @notice This function is used to call a function on a contract via the mock contract.
	 * @param to Address of the contract to call
	 * @param value Amount of ether to send
	 * @param data Input bytes to send
	 * @param gas Amount to gas to send
	 * @return success Bool indicating if call was successful
	 * @return response Bytes returned from the call
	 */
    function executeCallViaMock(
        address payable to,
        uint256 value,
        bytes memory data,
        uint256 gas
    ) external returns (bool success, bytes memory response) {
        (success, response) = to.call{ value: value, gas: gas }(data);
    }

    function executeViaMockAndRevert(address payable to, uint256 value, bytes calldata data) external {
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

    /**
     * @notice This function is used to execute delegatecall to a contract via the mock contract.
	 * @param to Address of the contract to execute delegatecall
	 * @param data Input bytes to send
	 * @param gas Amount to gas to send
	 * @return success Bool indicating if call was successful
	 * @return response Bytes returned from the call
	 */
    function executeDelegatecallViaMock(
        address payable to,
        bytes memory data,
        uint256 gas
    ) external returns (bool success, bytes memory response) {
        (success, response) = to.delegatecall{ gas: gas }(data);
    }
}