// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { PotsRoundManager } from "../src/PotsRoundManager.sol";
import { PotsTestBase } from "./Base.t.sol";

contract AccountingTest is PotsTestBase {
    function test_feeSplitAndDust() public {
        _enter(alice, _one(1), 5e15);
        bytes32 output = _findOutput(1, false);
        vm.warp(block.timestamp + WINDOW + 1);
        manager.lock();
        manager.fundTreasury{ value: 0.01 ether }();
        manager.requestRandomness();
        uint256 treasuryBeforeSettle = manager.treasuryBalance();
        _settle(1, output);

        uint256 total = 5e15;
        uint256 treasury = (total * 900) / 10_000;
        uint256 jackpot = (total * 100) / 10_000;
        uint256 payout = (total * 9000) / 10_000;

        (uint256 rollover, uint256 jackpotBalance, uint256 treasuryBalance) = manager.balances();
        assertEq(treasuryBalance, treasuryBeforeSettle + treasury);
        assertEq(jackpotBalance, jackpot);
        assertEq(rollover, 0);
        assertEq(manager.totalDust(), total - treasury - jackpot - payout);
        assertEq(manager.getRound(1).payoutPool, payout);
        assertTrue(manager.invariantHolds());
    }

    function test_qZero_rollsOver_andPaysOnNextWinningRound() public {
        _enter(alice, _one(1), 1e15);
        bytes32 miss = _findOutput(2, false);
        _lockAndRequest();
        _settle(1, miss);

        uint256 expectedRollover = (1e15 * 9000) / 10_000;
        assertEq(manager.rolloverBalance(), expectedRollover);
        assertEq(manager.getRound(1).payoutPool, 0);
        assertEq(manager.getRound(1).winningSquareEth, 0);
        assertTrue(manager.invariantHolds());

        manager.startNextRound();
        _enter(bob, _one(2), 1e15);
        bytes32 output = _findOutput(2, false);
        _lockAndRequest();
        _settle(2, output);

        uint256 pool = ((1e15 * 9000) / 10_000) + expectedRollover;
        assertEq(manager.getRound(2).payoutPool, pool);
        assertEq(manager.rolloverBalance(), 0);
        (uint256 eth,) = manager.getClaimable(2, bob);
        assertEq(eth, pool);
        assertTrue(manager.invariantHolds());
    }

    function test_tZero_roundCannotLockOrRequest() public {
        assertEq(manager.getRound(1).totalEth, 0);
        vm.expectRevert(PotsRoundManager.WrongPhase.selector);
        manager.lock();
        vm.expectRevert(PotsRoundManager.WrongPhase.selector);
        manager.requestRandomness();
    }

    function test_weights_andClaimable() public {
        _enter(alice, _one(1), 3e15);
        _enter(bob, _one(1), 1e15);
        _enter(carol, _one(2), 1e15);
        bytes32 output = _findOutput(1, false);
        _lockAndRequest();
        _settle(1, output);

        uint256 pool = manager.getRound(1).payoutPool;
        (uint256 aliceEth, uint256 alicePots) = manager.getClaimable(1, alice);
        (uint256 bobEth, uint256 bobPots) = manager.getClaimable(1, bob);
        (uint256 carolEth, uint256 carolPots) = manager.getClaimable(1, carol);

        assertEq(aliceEth, (pool * 3) / 4);
        assertEq(bobEth, pool / 4);
        assertEq(carolEth, 0);
        assertEq(alicePots, (EMISSION * 3) / 4);
        assertEq(bobPots, EMISSION / 4);
        assertEq(carolPots, 0);
        assertEq(aliceEth + bobEth, pool);
    }

    function test_jackpot_hitPaysEntireBalance() public {
        _enter(alice, _one(1), 4e15);
        bytes32 miss = _findOutput(1, false);
        _lockAndRequest();
        _settle(1, miss);
        uint256 jackpotAfterRound1 = manager.jackpotBalance();
        assertTrue(jackpotAfterRound1 > 0);
        manager.startNextRound();

        _enter(bob, _one(3), 4e15);
        bytes32 hit = _findOutput(3, true);
        _lockAndRequest();
        _settle(2, hit);

        uint256 round2Share = (4e15 * 100) / 10_000;
        uint256 expectedJackpotPaid = jackpotAfterRound1 + round2Share;
        assertEq(manager.getRound(2).jackpotPaidAmount, expectedJackpotPaid);
        assertEq(manager.jackpotBalance(), 0);
        (uint256 eth,) = manager.getClaimable(2, bob);
        assertEq(eth, manager.getRound(2).payoutPool + expectedJackpotPaid);
        assertTrue(manager.invariantHolds());
    }

    function test_settle_twice_reverts() public {
        _enter(alice, _one(1), 1e15);
        bytes32 output = _findOutput(1, false);
        _lockAndRequest();
        _settle(1, output);
        vm.expectRevert(PotsRoundManager.WrongPhase.selector);
        manager.settle(1);
    }

    function test_settle_withoutOutput_reverts() public {
        _enter(alice, _one(1), 1e15);
        _lockAndRequest();
        vm.expectRevert(PotsRoundManager.NotRequested.selector);
        manager.settle(1);
    }
}
