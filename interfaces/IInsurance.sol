// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.19;

interface IInsurance {
    event InsuranceIssued(
        bytes32 indexed policyId,
        bytes insuredEvent,
        uint256 insuranceAmount,
        address indexed payoutAddress
    );

    event InsurancePayoutRequested(bytes32 indexed policyId, bytes32 indexed assertionId);

    event InsurancePayoutSettled(bytes32 indexed policyId, bytes32 indexed assertionId);

    function issueInsurance(
        uint256 insuranceAmount,
        address payoutAddress,
        bytes calldata insuredEvent
    ) external returns (bytes32 policyId);

    function requestPayout(bytes32 policyId) external returns (bytes32 assertionId);

    function assertionResolvedCallback(bytes32 assertionId, bool assertedTruthfully) external;

    function assertionDisputedCallback(bytes32 assertionId) external;
}
