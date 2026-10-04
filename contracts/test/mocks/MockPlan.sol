// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { PotsRoundManager } from "../../src/PotsRoundManager.sol";

/// @dev Stand-in for the plan contract of v3: forwards `enterFor` and `claimEthToPlan` and takes ETH.
contract MockPlan {
    PotsRoundManager public immutable manager;
    bool public rejectEth;

    constructor(PotsRoundManager manager_) {
        manager = manager_;
    }

    receive() external payable {
        require(!rejectEth, "rejected");
    }

    function setRejectEth(bool value) external {
        rejectEth = value;
    }

    function enterFor(address wallet, uint8[] calldata squares, uint256 amountPerSquare)
        external
        payable
        returns (uint256)
    {
        return manager.enterFor{ value: msg.value }(wallet, squares, amountPerSquare);
    }

    function claimToPlan(uint256 roundId, address wallet) external returns (uint256) {
        return manager.claimEthToPlan(roundId, wallet);
    }
}
