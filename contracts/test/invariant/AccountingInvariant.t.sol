// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { Test } from "forge-std/Test.sol";
import { POTSToken } from "../../src/POTSToken.sol";
import { PotsRandomnessAdapter } from "../../src/PotsRandomnessAdapter.sol";
import { PotsRoundManager } from "../../src/PotsRoundManager.sol";
import { MockDiceCoordinator } from "../mocks/MockDiceCoordinator.sol";

contract AccountingHandler is Test {
    address internal constant DICE_PROVIDER = address(0xD1CE);
    uint32 internal constant WINDOW = 60;
    uint256 internal constant REFUND_DELAY = 6;

    PotsRoundManager public manager;
    MockDiceCoordinator public dice;
    address[] public actors;

    constructor() {
        dice = new MockDiceCoordinator(DICE_PROVIDER);
        POTSToken token = new POTSToken("POTS", "POTS", 1_000_000e18, address(this));
        PotsRandomnessAdapter adapter =
            new PotsRandomnessAdapter(address(dice), DICE_PROVIDER, 200_000, address(this));
        manager = new PotsRoundManager(
            address(token),
            address(adapter),
            address(this),
            900,
            100,
            9000,
            0.001 ether,
            1 ether,
            WINDOW,
            625,
            1e18,
            REFUND_DELAY,
            1 hours,
            1 days
        );
        token.setMinter(address(manager));
        adapter.setManager(address(manager));
        for (uint256 i; i < 4; ++i) {
            address actor = makeAddr(string(abi.encodePacked("actor", i)));
            actors.push(actor);
            vm.deal(actor, 1_000 ether);
        }
        manager.startNextRound();
        vm.deal(address(this), 100 ether);
        manager.fundTreasury{ value: 5 ether }();
    }

    function enter(uint256 actorSeed, uint8 squareSeed, uint96 amountSeed) external {
        address actor = actors[actorSeed % actors.length];
        uint8 square = uint8(squareSeed % 25) + 1;
        uint256 amount = bound(amountSeed, 0.001 ether, 0.1 ether);
        uint8[] memory squares = new uint8[](1);
        squares[0] = square;
        vm.prank(actor);
        manager.enter{ value: amount }(squares, amount);
    }

    function enterMany(uint256 actorSeed, uint8 countSeed, uint96 amountSeed) external {
        address actor = actors[actorSeed % actors.length];
        uint256 count = (uint256(countSeed) % 5) + 1;
        uint256 amount = bound(amountSeed, 0.001 ether, 0.01 ether);
        uint8[] memory squares = new uint8[](count);
        for (uint8 i; i < count; ++i) {
            squares[i] = uint8((uint256(keccak256(abi.encodePacked(countSeed, i))) % 25) + 1);
        }
        vm.prank(actor);
        manager.enter{ value: count * amount }(squares, amount);
    }

    function settleCurrentRound(uint256 outputSeed) external {
        uint256 roundId = manager.currentRoundId();
        if (roundId == 0) {
            return;
        }
        PotsRoundManager.Round memory round = manager.getRound(roundId);
        if (round.phase == PotsRoundManager.Phase.WAITING) {
            return;
        }
        if (round.phase == PotsRoundManager.Phase.OPEN) {
            vm.warp(block.timestamp + WINDOW + 1);
            manager.lock();
            round = manager.getRound(roundId);
        }
        if (round.phase == PotsRoundManager.Phase.LOCKED) {
            if (manager.treasuryBalance() < dice.fee()) {
                manager.fundTreasury{ value: 1 ether }();
            }
            manager.requestRandomness();
            round = manager.getRound(roundId);
        }
        if (round.phase == PotsRoundManager.Phase.RANDOMNESS_PENDING) {
            if (round.randomOutput == bytes32(0)) {
                bytes32 output = keccak256(abi.encodePacked("handler-output", outputSeed));
                dice.fulfill(round.randomnessRequestId, output);
            }
            manager.settle(roundId);
        }
        manager.startNextRound();
    }

    function claim(uint256 actorSeed, uint256 roundSeed) external {
        address actor = actors[actorSeed % actors.length];
        uint256 current = manager.currentRoundId();
        if (current == 0) {
            return;
        }
        uint256 roundId = (roundSeed % current) + 1;
        (uint256 eth,) = manager.getClaimable(roundId, actor);
        if (eth == 0) {
            return;
        }
        vm.prank(actor);
        manager.claimEth(roundId);
    }

    function refundAndCancel(uint256 roundsBack) external {
        uint256 roundId = manager.currentRoundId();
        if (roundId <= roundsBack || roundsBack == 0) {
            return;
        }
        roundId -= roundsBack % 2;
        PotsRoundManager.Round memory round = manager.getRound(roundId);
        if (round.phase != PotsRoundManager.Phase.RANDOMNESS_PENDING) {
            return;
        }
        vm.roll(round.requestedAtBlock + REFUND_DELAY);
        manager.refundRandomness(roundId);
        manager.cancelRound(roundId);
    }

    function abandonCurrentRound(uint8 mode) external {
        uint256 roundId = manager.currentRoundId();
        if (roundId == 0) {
            return;
        }
        if (manager.getRound(roundId).phase != PotsRoundManager.Phase.OPEN) {
            return;
        }
        vm.warp(block.timestamp + WINDOW + 1);
        manager.lock();
        if (mode % 2 == 1) {
            if (manager.treasuryBalance() < dice.fee()) {
                manager.fundTreasury{ value: 1 ether }();
            }
            manager.requestRandomness();
            vm.warp(block.timestamp + 1 days);
        } else {
            vm.warp(block.timestamp + 1 hours);
        }
        manager.cancelRound(roundId);
        manager.startNextRound();
    }
}

contract AccountingInvariantTest is Test {
    AccountingHandler internal handler;

    function setUp() public {
        handler = new AccountingHandler();
        targetContract(address(handler));
    }

    function invariant_ethBalance() public view {
        assertTrue(handler.manager().invariantHolds());
    }
}
