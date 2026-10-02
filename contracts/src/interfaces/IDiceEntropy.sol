// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IDiceEntropy {
    function getFeeV2(address provider, uint32 gasLimit) external view returns (uint256);

    function requestV2(address provider, bytes32 userRandom, uint32 gasLimit)
        external
        payable
        returns (uint64);

    function refundRequest(address provider, uint64 sequenceNumber) external;
}

interface IDiceConsumer {
    function entropyCallback(uint64 sequenceNumber, address provider, bytes32 random) external;
}
