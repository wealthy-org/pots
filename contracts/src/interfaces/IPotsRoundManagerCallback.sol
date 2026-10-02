// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

interface IPotsRoundManagerCallback {
    function onRandomnessFulfilled(uint256 roundId, bytes32 output) external;
}
