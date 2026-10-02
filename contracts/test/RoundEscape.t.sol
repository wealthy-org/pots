// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { PotsRoundManager } from "../src/PotsRoundManager.sol";
import { PotsTestBase } from "./Base.t.sol";

contract RoundEscapeTest is PotsTestBase {
    function _lockedRound() internal returns (uint64 lockedAt) {
        _enter(alice, _one(1), 1e15);
        _enter(bob, _one(2), 2e15);
        vm.warp(block.timestamp + WINDOW + 1);
        manager.lock();
        lockedAt = manager.lockedAtTime(1);
    }

    function _pendingRound() internal {
        _enter(alice, _one(1), 1e15);
        _enter(bob, _one(2), 2e15);
        _lockAndRequest();
    }

    function test_requestFailing_roundStaysLocked() public {
        _lockedRound();
        manager.fundTreasury{ value: 0.01 ether }();
        dice.setFailRequests(true);
        vm.expectRevert();
        manager.requestRandomness();
        assertEq(uint256(manager.getRound(1).phase), uint256(PotsRoundManager.Phase.LOCKED));
    }

    function test_cancelLocked_beforeDelay_reverts() public {
        uint64 lockedAt = _lockedRound();
        vm.warp(uint256(lockedAt) + LOCKED_CANCEL_DELAY - 1);
        vm.expectRevert(PotsRoundManager.CancelNotAllowed.selector);
        manager.cancelRound(1);
    }

    function test_cancelLocked_afterDelay_refundsEveryoneAndUnblocksNextRound() public {
        uint64 lockedAt = _lockedRound();
        dice.setFailRequests(true);
        vm.warp(uint256(lockedAt) + LOCKED_CANCEL_DELAY);
        manager.cancelRound(1);

        assertEq(uint256(manager.getRound(1).phase), uint256(PotsRoundManager.Phase.CANCELLED));
        assertTrue(manager.invariantHolds());

        uint256 aliceBefore = alice.balance;
        uint256 bobBefore = bob.balance;
        vm.prank(alice);
        manager.claimEth(1);
        vm.prank(bob);
        manager.claimEth(1);
        assertEq(alice.balance, aliceBefore + 1e15);
        assertEq(bob.balance, bobBefore + 2e15);
        assertEq(manager.totalUnclaimedEth(), 0);
        assertEq(manager.totalUnsettledDeposits(), 0);
        assertTrue(manager.invariantHolds());

        manager.startNextRound();
        assertEq(manager.currentRoundId(), 2);
    }

    function test_cancelLocked_delayCountsFromLockNotFromDeadline() public {
        _enter(alice, _one(1), 1e15);
        uint256 closeAt = manager.getRound(1).closeAt;
        vm.warp(closeAt + LOCKED_CANCEL_DELAY * 3);
        manager.lock();
        assertEq(manager.lockedAtTime(1), closeAt + LOCKED_CANCEL_DELAY * 3);

        vm.expectRevert(PotsRoundManager.CancelNotAllowed.selector);
        manager.cancelRound(1);

        manager.fundTreasury{ value: 0.01 ether }();
        manager.requestRandomness();
        assertEq(
            uint256(manager.getRound(1).phase), uint256(PotsRoundManager.Phase.RANDOMNESS_PENDING)
        );
    }

    function test_cancelLocked_anyoneCanCall() public {
        uint64 lockedAt = _lockedRound();
        vm.warp(uint256(lockedAt) + LOCKED_CANCEL_DELAY);
        vm.prank(makeAddr("stranger"));
        manager.cancelRound(1);
        assertEq(uint256(manager.getRound(1).phase), uint256(PotsRoundManager.Phase.CANCELLED));
    }

    function test_cancelOpenRound_reverts() public {
        _enter(alice, _one(1), 1e15);
        vm.warp(block.timestamp + LOCKED_CANCEL_DELAY * 2);
        vm.expectRevert(PotsRoundManager.WrongPhase.selector);
        manager.cancelRound(1);
    }

    function test_cancelLocked_keepsRolloverForNextRound() public {
        _enter(alice, _one(1), 1e15);
        bytes32 output = _findOutput(9, false);
        _lockAndRequest();
        _settle(1, output);
        uint256 rollover = manager.rolloverBalance();
        assertGt(rollover, 0);

        manager.startNextRound();
        _enter(bob, _one(3), 1e15);
        vm.warp(block.timestamp + WINDOW + 1);
        manager.lock();
        vm.warp(block.timestamp + LOCKED_CANCEL_DELAY);
        manager.cancelRound(2);

        assertEq(manager.rolloverBalance(), rollover);
        assertTrue(manager.invariantHolds());
    }

    function test_cancelPending_beforeTimeout_withoutRefund_reverts() public {
        _pendingRound();
        vm.warp(block.timestamp + FORCE_CANCEL_DELAY - 1);
        vm.expectRevert(PotsRoundManager.CancelNotAllowed.selector);
        manager.cancelRound(1);
    }

    function test_cancelPending_afterTimeout_worksWhenProviderRefundFails() public {
        _pendingRound();
        dice.setFailRefunds(true);
        vm.roll(block.number + REFUND_DELAY);
        vm.expectRevert();
        manager.refundRandomness(1);

        vm.warp(block.timestamp + FORCE_CANCEL_DELAY);
        manager.cancelRound(1);
        assertEq(uint256(manager.getRound(1).phase), uint256(PotsRoundManager.Phase.CANCELLED));

        uint256 before = alice.balance;
        vm.prank(alice);
        manager.claimEth(1);
        assertEq(alice.balance, before + 1e15);
        assertTrue(manager.invariantHolds());
    }

    function test_cancelPending_afterTimeout_blocksLateCallback() public {
        _pendingRound();
        uint64 sequence = manager.getRound(1).randomnessRequestId;
        vm.warp(block.timestamp + FORCE_CANCEL_DELAY);
        manager.cancelRound(1);
        vm.expectRevert();
        dice.fulfill(sequence, bytes32(uint256(7)));
    }

    function test_cancelPending_afterOutput_reverts() public {
        _pendingRound();
        _fulfill(1, bytes32(uint256(7)));
        vm.warp(block.timestamp + FORCE_CANCEL_DELAY);
        vm.expectRevert(PotsRoundManager.AlreadySettled.selector);
        manager.cancelRound(1);
    }

    function test_cancel_twice_reverts() public {
        uint64 lockedAt = _lockedRound();
        vm.warp(uint256(lockedAt) + LOCKED_CANCEL_DELAY);
        manager.cancelRound(1);
        vm.expectRevert(PotsRoundManager.WrongPhase.selector);
        manager.cancelRound(1);
    }

    function test_requestedAtTime_isRecorded() public {
        _pendingRound();
        assertEq(manager.requestedAtTime(1), uint64(block.timestamp));
    }

    function test_invariantHolds_withForcedEth() public {
        _enter(alice, _one(1), 1e15);
        assertTrue(manager.invariantHolds());
        vm.deal(address(manager), address(manager).balance + 1 ether);
        assertTrue(manager.invariantHolds());
    }

    function _deployWithDelays(uint256 lockedDelay, uint256 forceDelay) internal {
        new PotsRoundManager(
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
            REFUND_DELAY,
            lockedDelay,
            forceDelay
        );
    }

    function test_constructor_rejectsZeroOrTooShortLockedDelay() public {
        vm.expectRevert(PotsRoundManager.InvalidDelay.selector);
        this.deployWithDelays(0, 1 days);
        vm.expectRevert(PotsRoundManager.InvalidDelay.selector);
        this.deployWithDelays(10 minutes - 1, 1 days);
    }

    function test_constructor_rejectsForceDelayShorterThanLockedDelay() public {
        vm.expectRevert(PotsRoundManager.InvalidDelay.selector);
        this.deployWithDelays(2 hours, 1 hours);
    }

    function test_constructor_acceptsTheMinimumDelays() public {
        _deployWithDelays(10 minutes, 10 minutes);
    }

    function deployWithDelays(uint256 lockedDelay, uint256 forceDelay) external {
        _deployWithDelays(lockedDelay, forceDelay);
    }
}
