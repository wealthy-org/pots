// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { PotsRoundManager } from "../../src/PotsRoundManager.sol";

/// @dev Manager stand-in that can fail on purpose, for the plan contract's skip and gas tests.
contract FaultyManager {
    error Boom();

    uint256 public currentRoundId = 1;
    bool public paused;
    uint256 public minEntryPerSquare = 1e15;
    uint256 public maxEntryPerSquare = 1 ether;
    PotsRoundManager.Phase public phase = PotsRoundManager.Phase.WAITING;
    uint64 public closeAt;
    uint256 public entered;
    mapping(address => bool) public planClaimConsent;
    address public planContract;
    /// @dev 0 enters, 1 reverts with a custom error, 2 reverts with empty data.
    mapping(address => uint8) public mode;

    function setPlanContract(address plan) external {
        planContract = plan;
    }

    function setMode(address wallet, uint8 value) external {
        mode[wallet] = value;
    }

    function getRound(uint256) external view returns (PotsRoundManager.Round memory round) {
        round.phase = phase;
        round.closeAt = closeAt;
    }

    function enterFor(address wallet, uint8[] calldata, uint256)
        external
        payable
        returns (uint256)
    {
        if (mode[wallet] == 1) {
            revert Boom();
        }
        if (mode[wallet] == 2) {
            assembly {
                revert(0, 0)
            }
        }
        ++entered;
        return currentRoundId;
    }

    function claimEthToPlan(uint256, address) external pure returns (uint256) {
        revert Boom();
    }
}
