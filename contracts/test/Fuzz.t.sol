// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { PotsRoundManager } from "../src/PotsRoundManager.sol";
import { PotsTestBase } from "./Base.t.sol";

contract FuzzTest is PotsTestBase {
    uint256 internal constant SQUARE_MASK = (1 << 25) - 1;

    function _squaresFromMask(uint32 mask) internal pure returns (uint8[] memory list) {
        uint256 bits = uint256(mask) & SQUARE_MASK;
        uint256 count;
        for (uint256 i; i < 25; ++i) {
            if ((bits >> i) & 1 == 1) {
                ++count;
            }
        }
        list = new uint8[](count);
        uint256 index;
        for (uint256 i; i < 25; ++i) {
            if ((bits >> i) & 1 == 1) {
                list[index++] = uint8(i + 1);
            }
        }
    }

    function testFuzz_enter_tracksTotals(uint32 mask, uint256 amountSeed) public {
        uint8[] memory squares = _squaresFromMask(mask);
        vm.assume(squares.length > 0);
        uint256 amount = bound(amountSeed, MIN_ENTRY, MAX_ENTRY);

        _enter(alice, squares, amount);

        uint256 total = squares.length * amount;
        assertEq(manager.getRound(1).totalEth, total);
        assertEq(manager.getWalletRound(1, alice).deposited, total);
        assertEq(manager.totalUnsettledDeposits(), total);
        for (uint256 i; i < squares.length; ++i) {
            assertEq(manager.squareTotals(1, squares[i]), amount);
            assertEq(manager.getEntry(1, squares[i], alice), amount);
        }
        assertTrue(manager.invariantHolds());
    }

    function testFuzz_enter_rejectsValueMismatch(
        uint32 mask,
        uint256 amountSeed,
        uint256 deltaSeed,
        bool over
    ) public {
        uint8[] memory squares = _squaresFromMask(mask);
        vm.assume(squares.length > 0);
        uint256 amount = bound(amountSeed, MIN_ENTRY, MAX_ENTRY);
        uint256 total = squares.length * amount;
        uint256 delta = bound(deltaSeed, 1, total);
        uint256 value = over ? total + delta : total - delta;

        vm.prank(alice);
        vm.expectRevert(PotsRoundManager.ValueMismatch.selector);
        manager.enter{ value: value }(squares, amount);
        assertEq(manager.totalUnsettledDeposits(), 0);
    }

    function testFuzz_enter_rejectsInvalidSquare(uint8 bad, uint256 amountSeed) public {
        vm.assume(bad == 0 || bad > 25);
        uint256 amount = bound(amountSeed, MIN_ENTRY, MAX_ENTRY);
        uint8[] memory squares = new uint8[](2);
        squares[0] = 1;
        squares[1] = bad;

        vm.prank(alice);
        vm.expectRevert(PotsRoundManager.InvalidSquares.selector);
        manager.enter{ value: 2 * amount }(squares, amount);
    }

    function testFuzz_enter_rejectsDuplicateSquare(uint8 square, uint256 amountSeed) public {
        square = uint8(bound(square, 1, 25));
        uint256 amount = bound(amountSeed, MIN_ENTRY, MAX_ENTRY);
        uint8[] memory squares = new uint8[](2);
        squares[0] = square;
        squares[1] = square;

        vm.prank(alice);
        vm.expectRevert(PotsRoundManager.InvalidSquares.selector);
        manager.enter{ value: 2 * amount }(squares, amount);
    }

    function testFuzz_enter_rejectsAmountBelowMinimum(uint256 amountSeed) public {
        uint256 amount = bound(amountSeed, 0, MIN_ENTRY - 1);
        vm.prank(alice);
        vm.expectRevert(PotsRoundManager.AmountBelowMinimum.selector);
        manager.enter{ value: amount }(_one(1), amount);
    }

    function testFuzz_enter_rejectsAmountAboveMaximum(uint256 amountSeed) public {
        uint256 amount = bound(amountSeed, MAX_ENTRY + 1, 10 ether);
        vm.prank(alice);
        vm.expectRevert(PotsRoundManager.AmountAboveMaximum.selector);
        manager.enter{ value: amount }(_one(1), amount);
    }

    function testFuzz_deadline_boundary(uint256 beforeSeed, uint256 afterSeed) public {
        _enter(alice, _one(1), MIN_ENTRY);
        uint256 closeAt = manager.getRound(1).closeAt;

        vm.warp(closeAt - bound(beforeSeed, 1, WINDOW));
        _enter(bob, _one(2), MIN_ENTRY);
        assertEq(manager.getRound(1).totalEth, 2 * MIN_ENTRY);

        vm.warp(closeAt + bound(afterSeed, 0, 30 days));
        vm.prank(carol);
        vm.expectRevert(PotsRoundManager.RoundClosed.selector);
        manager.enter{ value: MIN_ENTRY }(_one(3), MIN_ENTRY);
        assertEq(manager.getRound(1).totalEth, 2 * MIN_ENTRY);
    }

    function testFuzz_lock_onlyAtOrAfterDeadline(uint256 earlySeed, uint256 lateSeed) public {
        _enter(alice, _one(1), MIN_ENTRY);
        uint256 closeAt = manager.getRound(1).closeAt;

        vm.warp(closeAt - bound(earlySeed, 1, WINDOW));
        vm.expectRevert(PotsRoundManager.NotLockable.selector);
        manager.lock();

        vm.warp(closeAt + bound(lateSeed, 0, 30 days));
        manager.lock();
        assertEq(uint256(manager.getRound(1).phase), uint256(PotsRoundManager.Phase.LOCKED));
    }

    function testFuzz_settleAndClaim_neverExceedsReserved(
        uint32[3] memory masks,
        uint256[3] memory amountSeeds,
        bytes32 output
    ) public {
        vm.assume(output != bytes32(0));
        address[3] memory players = [alice, bob, carol];
        bool anyEntry;
        for (uint256 i; i < 3; ++i) {
            uint8[] memory squares = _squaresFromMask(masks[i]);
            if (squares.length == 0) {
                continue;
            }
            _enter(players[i], squares, bound(amountSeeds[i], MIN_ENTRY, MAX_ENTRY));
            anyEntry = true;
        }
        vm.assume(anyEntry);

        _lockAndRequest();
        _settle(1, output);

        uint256 paid;
        for (uint256 i; i < 3; ++i) {
            (uint256 eth,) = manager.getClaimable(1, players[i]);
            if (eth > 0) {
                vm.prank(players[i]);
                manager.claimEth(1);
                paid += eth;
            }
        }

        PotsRoundManager.Round memory round = manager.getRound(1);
        uint256 reserved =
            round.winningSquareEth == 0 ? 0 : round.payoutPool + round.jackpotPaidAmount;
        assertLe(paid, reserved);
        assertLe(reserved - paid, 6);
        assertEq(manager.totalUnclaimedEth(), reserved - paid);
        assertTrue(manager.invariantHolds());
    }

    function testFuzz_cancel_refundsExactDeposits(
        uint32 maskA,
        uint32 maskB,
        uint256 amountSeedA,
        uint256 amountSeedB
    ) public {
        uint8[] memory squaresA = _squaresFromMask(maskA);
        uint8[] memory squaresB = _squaresFromMask(maskB);
        vm.assume(squaresA.length > 0 && squaresB.length > 0);
        uint256 aliceStart = alice.balance;
        uint256 bobStart = bob.balance;

        _enter(alice, squaresA, bound(amountSeedA, MIN_ENTRY, MAX_ENTRY));
        _enter(bob, squaresB, bound(amountSeedB, MIN_ENTRY, MAX_ENTRY));
        _lockAndRequest();
        vm.warp(block.timestamp + FORCE_CANCEL_DELAY);
        manager.cancelRound(1);

        vm.prank(alice);
        manager.claimEth(1);
        vm.prank(bob);
        manager.claimEth(1);

        assertEq(alice.balance, aliceStart);
        assertEq(bob.balance, bobStart);
        assertEq(manager.totalUnclaimedEth(), 0);
        assertEq(manager.totalUnsettledDeposits(), 0);
        assertTrue(manager.invariantHolds());
    }

    function testFuzz_doubleClaim_alwaysReverts(uint32 mask, uint256 amountSeed, bytes32 output)
        public
    {
        vm.assume(output != bytes32(0));
        uint8[] memory squares = _squaresFromMask(mask);
        vm.assume(squares.length > 0);
        _enter(alice, squares, bound(amountSeed, MIN_ENTRY, MAX_ENTRY));
        _lockAndRequest();
        _settle(1, output);

        (uint256 eth,) = manager.getClaimable(1, alice);
        vm.assume(eth > 0);
        vm.prank(alice);
        manager.claimEth(1);
        vm.prank(alice);
        vm.expectRevert(PotsRoundManager.AlreadyClaimed.selector);
        manager.claimEth(1);
    }
}
