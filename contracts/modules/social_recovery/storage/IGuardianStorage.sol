// SPDX-License-Identifier: GPL-3.0
pragma solidity >=0.8.12 <0.9.0;

interface IGuardianStorage {
    /**
     * @dev Lets an authorised module add a guardian to a wallet and change the threshold.
     * @param _guardian The guardian to add.
     */
    function addGuardianWithThreshold(address _guardian, uint256 _threshold) external;

    /**
     * @dev Lets an authorised module revoke a guardian from a wallet and change the threshold.
     * @param _prevGuardian Guardian that pointed to the guardian to be removed in the linked list
     * @param _guardian The guardian to revoke.
     */
    function revokeGuardianWithThreshold(address _prevGuardian, address _guardian, uint256 _threshold) external;

    /**
     * @dev Allows to update the number of required confirmations by guardians.
     * @param _threshold New threshold.
     */
    function changeThreshold(uint256 _threshold) external;

    /**
     * @dev Checks if an account is a guardian for a wallet.
     * @param _wallet The target wallet.
     * @param _guardian The account.
     * @return true if the account is a guardian for a wallet.
     */
    function isGuardian(address _wallet, address _guardian) external view returns (bool);

    /**
     * @dev Retrieves the wallet guardians count.
     * @param _wallet The target wallet.
     * @return uint256 Guardians count.
     */
    function guardiansCount(address _wallet) external view returns (uint256);

    /**
     * @dev Retrieves the wallet threshold count.
     * @param _wallet The target wallet.
     * @return uint256 Threshold count.
     */
    function threshold(address _wallet) external view returns (uint256);

    /**
     * @dev Retrieves all guardians for a wallet.
     * @param _wallet The target wallet.
     * @return address[] Array of guardians.
     */
    function getGuardians(address _wallet) external view returns (address[] memory);
}
