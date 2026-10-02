// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IPotsRandomnessAdapter {
    function quoteFee() external view returns (uint256);

    function requestRandomness(uint256 roundId, bytes32 userRandom)
        external
        payable
        returns (uint64 sequenceNumber);

    function refundRandomness(uint256 roundId) external;
}
