// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { PotsRoundManager } from "../src/PotsRoundManager.sol";
import { PotsTestBase } from "./Base.t.sol";

contract RoundLifecycleTest is PotsTestBase {
    function test_startNextRound_createsWaitingRound() public {
        assertEq(manager.currentRoundId(), 1);
        PotsRoundManager.Round memory round = manager.getRound(1);
        assertEq(uint256(round.phase), uint256(PotsRoundManager.Phase.WAITING));
    }

    function test_enter_firstEntryOpensRoundAndSetsDeadline() public {
        uint256 start = block.timestamp;
        _enter(alice, _one(1), MIN_ENTRY);
        PotsRoundManager.Round memory round = manager.getRound(1);
        assertEq(uint256(round.phase), uint256(PotsRoundManager.Phase.OPEN));
        assertEq(round.closeAt, uint64(start + WINDOW));
        assertEq(round.totalEth, MIN_ENTRY);
    }

    function test_enter_rejectsInvalidSquares() public {
        uint8[] memory empty = new uint8[](0);
        vm.prank(alice);
        vm.expectRevert(PotsRoundManager.InvalidSquares.selector);
        manager.enter{ value: 0 }(empty, MIN_ENTRY);

        uint8[] memory zero = new uint8[](1);
        zero[0] = 0;
        vm.prank(alice);
        vm.expectRevert(PotsRoundManager.InvalidSquares.selector);
        manager.enter{ value: MIN_ENTRY }(zero, MIN_ENTRY);

        uint8[] memory tooHigh = new uint8[](1);
        tooHigh[0] = 26;
        vm.prank(alice);
        vm.expectRevert(PotsRoundManager.InvalidSquares.selector);
        manager.enter{ value: MIN_ENTRY }(tooHigh, MIN_ENTRY);

        uint8[] memory duplicate = new uint8[](2);
        duplicate[0] = 3;
        duplicate[1] = 3;
        vm.prank(alice);
        vm.expectRevert(PotsRoundManager.InvalidSquares.selector);
        manager.enter{ value: 2 * MIN_ENTRY }(duplicate, MIN_ENTRY);
    }

    function test_enter_rejectsValueMismatch() public {
        vm.prank(alice);
        vm.expectRevert(PotsRoundManager.ValueMismatch.selector);
        manager.enter{ value: MIN_ENTRY - 1 }(_one(1), MIN_ENTRY);
    }

    function test_enter_rejectsBelowMinimum() public {
        vm.prank(alice);
        vm.expectRevert(PotsRoundManager.AmountBelowMinimum.selector);
        manager.enter{ value: 2 }(_one(1), 2);
    }

    function test_enter_rejectsAboveMaximum() public {
        vm.prank(alice);
        vm.expectRevert(PotsRoundManager.AmountAboveMaximum.selector);
        manager.enter{ value: MAX_ENTRY + 1 }(_one(1), MAX_ENTRY + 1);
    }

    function test_enter_accumulatesRepeatedEntries() public {
        _enter(alice, _one(5), MIN_ENTRY);
        _enter(alice, _one(5), MIN_ENTRY);
        assertEq(manager.getEntry(1, 5, alice), 2 * MIN_ENTRY);
        assertEq(manager.squareTotals(1, 5), 2 * MIN_ENTRY);
        assertEq(manager.getRound(1).totalEth, 2 * MIN_ENTRY);
    }

    function test_enter_allTwentyFiveSquares() public {
        uint8[] memory squares = new uint8[](25);
        for (uint8 i; i < 25; ++i) {
            squares[i] = i + 1;
        }
        _enter(alice, squares, MIN_ENTRY);
        assertEq(manager.getRound(1).totalEth, 25 * MIN_ENTRY);
    }

    function test_enter_afterDeadline_reverts() public {
        _enter(alice, _one(1), MIN_ENTRY);
        vm.warp(block.timestamp + WINDOW);
        vm.prank(bob);
        vm.expectRevert(PotsRoundManager.RoundClosed.selector);
        manager.enter{ value: MIN_ENTRY }(_one(1), MIN_ENTRY);
    }

    function test_lock_beforeDeadline_reverts() public {
        _enter(alice, _one(1), MIN_ENTRY);
        vm.expectRevert(PotsRoundManager.NotLockable.selector);
        manager.lock();
    }

    function test_lock_afterDeadline_setsLocked() public {
        _enter(alice, _one(1), MIN_ENTRY);
        vm.warp(block.timestamp + WINDOW + 1);
        manager.lock();
        assertEq(uint256(manager.getRound(1).phase), uint256(PotsRoundManager.Phase.LOCKED));
    }

    function test_enter_afterLock_reverts() public {
        _enter(alice, _one(1), MIN_ENTRY);
        vm.warp(block.timestamp + WINDOW + 1);
        manager.lock();
        vm.prank(bob);
        vm.expectRevert(PotsRoundManager.NotOpen.selector);
        manager.enter{ value: MIN_ENTRY }(_one(2), MIN_ENTRY);
    }

    function test_startNextRound_beforeSettle_reverts() public {
        _enter(alice, _one(1), MIN_ENTRY);
        vm.expectRevert(PotsRoundManager.WrongPhase.selector);
        manager.startNextRound();
    }

    function test_pause_blocksEnterNotSettlement() public {
        _enter(alice, _one(1), MIN_ENTRY);
        vm.prank(owner);
        manager.pause();
        vm.prank(bob);
        vm.expectRevert(PotsRoundManager.ContractPaused.selector);
        manager.enter{ value: MIN_ENTRY }(_one(2), MIN_ENTRY);

        bytes32 output = _findOutput(1, false);
        _lockAndRequest();
        _settle(1, output);
        assertEq(uint256(manager.getRound(1).phase), uint256(PotsRoundManager.Phase.SETTLED));
        manager.startNextRound();
    }

    function test_unpause_allowsEnter() public {
        vm.startPrank(owner);
        manager.pause();
        manager.unpause();
        vm.stopPrank();
        _enter(alice, _one(1), MIN_ENTRY);
        assertEq(manager.getRound(1).totalEth, MIN_ENTRY);
    }
}
