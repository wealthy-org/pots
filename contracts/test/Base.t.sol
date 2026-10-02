// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { Test } from "forge-std/Test.sol";
import { POTSToken } from "../src/POTSToken.sol";
import { PotsRandomnessAdapter } from "../src/PotsRandomnessAdapter.sol";
import { PotsRoundManager } from "../src/PotsRoundManager.sol";
import { MockDiceCoordinator } from "./mocks/MockDiceCoordinator.sol";

contract RejectingPlayer {
    function enter(PotsRoundManager manager, uint8[] calldata squares, uint256 amount)
        external
        payable
    {
        manager.enter{ value: msg.value }(squares, amount);
    }

    function claimEth(PotsRoundManager manager, uint256 roundId) external {
        manager.claimEth(roundId);
    }
}

contract PotsTestBase is Test {
    uint256 internal constant MIN_ENTRY = 0.001 ether;
    uint256 internal constant MAX_ENTRY = 1 ether;
    uint32 internal constant WINDOW = 60;
    uint256 internal constant JACKPOT_DENOM = 625;
    uint256 internal constant EMISSION = 1e18;
    uint256 internal constant REFUND_DELAY = 6;
    address internal constant DICE_PROVIDER = address(0xD1CE);

    address internal owner = makeAddr("owner");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    POTSToken internal token;
    MockDiceCoordinator internal dice;
    PotsRandomnessAdapter internal adapter;
    PotsRoundManager internal manager;

    function _deployStack(uint256 cap) internal {
        dice = new MockDiceCoordinator(DICE_PROVIDER);
        vm.prank(owner);
        token = new POTSToken("POTS", "POTS", cap, owner);
        vm.prank(owner);
        adapter = new PotsRandomnessAdapter(address(dice), DICE_PROVIDER, 200_000, owner);
        vm.prank(owner);
        manager = new PotsRoundManager(
            address(token),
            address(adapter),
            owner,
            900,
            100,
            9000,
            MIN_ENTRY,
            MAX_ENTRY,
            WINDOW,
            JACKPOT_DENOM,
            EMISSION,
            REFUND_DELAY
        );
        vm.startPrank(owner);
        token.setMinter(address(manager));
        adapter.setManager(address(manager));
        vm.stopPrank();
        vm.deal(address(this), 100 ether);
        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(carol, 100 ether);
    }

    function setUp() public virtual {
        _deployStack(1_000_000e18);
        manager.startNextRound();
    }

    function _enter(address player, uint8[] memory squares, uint256 amountPerSquare) internal {
        uint256 value = squares.length * amountPerSquare;
        vm.prank(player);
        manager.enter{ value: value }(squares, amountPerSquare);
    }

    function _one(uint8 square) internal pure returns (uint8[] memory list) {
        list = new uint8[](1);
        list[0] = square;
    }

    function _lockAndRequest() internal {
        vm.warp(block.timestamp + WINDOW + 1);
        manager.lock();
        manager.fundTreasury{ value: 0.01 ether }();
        manager.requestRandomness();
    }

    function _fulfill(uint256 roundId, bytes32 output) internal {
        PotsRoundManager.Round memory round = manager.getRound(roundId);
        dice.fulfill(round.randomnessRequestId, output);
    }

    function _findOutput(uint8 square, bool jackpotHit) internal pure returns (bytes32) {
        for (uint256 i = 0; i < 500_000; ++i) {
            bytes32 candidate = keccak256(abi.encodePacked("pots-output", i));
            uint8 winning =
                uint8((uint256(keccak256(abi.encodePacked(candidate, "SQUARE"))) % 25) + 1);
            bool hit =
                uint256(keccak256(abi.encodePacked(candidate, "JACKPOT"))) % JACKPOT_DENOM == 0;
            if (winning == square && hit == jackpotHit) {
                return candidate;
            }
        }
        revert("output not found");
    }

    function _settle(uint256 roundId, bytes32 output) internal {
        _fulfill(roundId, output);
        manager.settle(roundId);
    }
}
