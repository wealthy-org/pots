// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { PotsAutoPlan } from "../src/PotsAutoPlan.sol";
import { PotsRoundManager } from "../src/PotsRoundManager.sol";
import { PotsTestBase } from "./Base.t.sol";

/// @dev Task 9.4: fuzzing of plan creation, the exit, and the loop.
contract PotsAutoPlanFuzzTest is PotsTestBase {
    uint256 internal constant MIN_DEPOSIT = 0.002 ether;

    PotsAutoPlan internal plan;

    function setUp() public override {
        super.setUp();
        plan = new PotsAutoPlan(manager, 8, MIN_DEPOSIT);
        vm.prank(owner);
        manager.setPlanContract(address(plan));
    }

    function _squares(uint32 mask) internal pure returns (uint8[] memory squares) {
        uint256 count;
        for (uint8 i; i < 25; ++i) {
            if (mask & (uint32(1) << i) != 0) {
                ++count;
            }
        }
        squares = new uint8[](count);
        uint256 filled;
        for (uint8 i; i < 25; ++i) {
            if (mask & (uint32(1) << i) != 0) {
                squares[filled++] = i + 1;
            }
        }
    }

    function _round(uint8 winning) internal {
        plan.executePlans(20);
        if (manager.getRound(manager.currentRoundId()).phase != PotsRoundManager.Phase.OPEN) {
            return;
        }
        _lockAndRequest();
        _settle(manager.currentRoundId(), _findOutput(winning, false));
    }

    function testFuzz_createAndCancel_returnTheExactDeposit(
        uint32 maskSeed,
        uint256 amountSeed,
        uint8 roundsSeed
    ) public {
        uint32 mask = (maskSeed & 0x1FFFFFF) | 1;
        uint8[] memory squares = _squares(mask);
        uint16 rounds = uint16(bound(roundsSeed, 1, 100));
        uint256 perRound = uint256(rounds) * squares.length;
        uint256 lowest = (MIN_DEPOSIT + perRound - 1) / perRound;
        uint256 amount = bound(amountSeed, lowest > MIN_ENTRY ? lowest : MIN_ENTRY, MAX_ENTRY / 25);
        uint256 deposit = perRound * amount;
        vm.deal(alice, deposit + 1 ether);

        uint256 before = alice.balance;
        vm.prank(alice);
        plan.createPlan{ value: deposit }(squares, amount, rounds, false);
        PotsAutoPlan.Plan memory stored = plan.getPlan(alice);
        assertEq(stored.squareMask, mask);
        assertEq(stored.squareCount, squares.length);
        assertEq(stored.balance, deposit);
        assertEq(address(plan).balance, deposit);

        vm.prank(alice);
        plan.cancelPlan();
        assertEq(alice.balance, before);
        assertEq(address(plan).balance, 0);
        assertTrue(plan.planInvariantHolds());
    }

    function testFuzz_createPlan_rejectsAnyValueThatIsNotTheFullPlan(
        uint256 wrongValue,
        uint8 roundsSeed
    ) public {
        uint16 rounds = uint16(bound(roundsSeed, 1, 100));
        uint256 exact = uint256(rounds) * 2 * 1e15;
        wrongValue = bound(wrongValue, 0, 300 ether);
        vm.assume(wrongValue != exact);
        vm.deal(alice, 300 ether);
        vm.prank(alice);
        vm.expectRevert(PotsAutoPlan.ValueMismatch.selector);
        plan.createPlan{ value: wrongValue }(_squares(0x3), 1e15, rounds, false);
    }

    function testFuzz_exitIsAlwaysPossible_whateverTheRoundsAndPauses(
        uint8 roundsRun,
        uint16 pauseBits,
        uint256 winningSeed
    ) public {
        vm.prank(alice);
        plan.createPlan{ value: 20 * 2 * 2e15 }(_squares(0x5), 2e15, 20, false);
        vm.prank(bob);
        manager.enter{ value: 2e15 }(_one(13), 2e15);

        uint256 count = bound(roundsRun, 0, 8);
        for (uint256 i; i < count; ++i) {
            bool paused = (pauseBits >> i) & 1 == 1;
            vm.prank(owner);
            if (paused) {
                manager.pause();
            } else {
                manager.unpause();
            }
            _round(uint8(((winningSeed >> (8 * i)) % 25) + 1));
            assertTrue(manager.invariantHolds());
            assertTrue(plan.planInvariantHolds());
            assertEq(address(plan).balance, plan.totalPlanBalance());
        }

        uint256 owned = plan.getPlan(alice).balance;
        uint256 before = alice.balance;
        vm.prank(alice);
        plan.cancelPlan();
        assertEq(alice.balance, before + owned);
        assertEq(plan.totalPlanBalance(), 0);
    }

    function testFuzz_loop_neverMovesMoreThanTheReservedClaim(uint256 outputSeed, uint8 roundsRun)
        public
    {
        vm.prank(alice);
        manager.setPlanClaimConsent(true);
        vm.prank(alice);
        plan.createPlan{ value: 2e15 }(_one(5), 2e15, 1, true);
        vm.prank(bob);
        manager.enter{ value: 2e15 }(_one(9), 2e15);

        uint256 count = bound(roundsRun, 1, 8);
        for (uint256 i; i < count; ++i) {
            plan.executePlans(20);
            if (manager.getRound(manager.currentRoundId()).phase != PotsRoundManager.Phase.OPEN) {
                break;
            }
            uint8 winning = (outputSeed >> (8 * i)) % 3 == 0 ? 5 : 9;
            _lockAndRequest();
            _settle(manager.currentRoundId(), _findOutput(winning, false));

            uint256 current = manager.currentRoundId();
            (uint256 claimable,) = manager.getClaimable(current, alice);
            PotsAutoPlan.Plan memory before = plan.getPlan(alice);
            plan.executePlans(20);
            PotsAutoPlan.Plan memory afterVisit = plan.getPlan(alice);
            uint256 expected = before.balance;
            if (before.active) {
                expected += claimable;
                if (afterVisit.lastRound == current + 1) {
                    expected -= 2e15;
                }
            }
            assertEq(afterVisit.balance, expected);
            assertTrue(manager.invariantHolds());
            assertTrue(plan.planInvariantHolds());
            assertEq(address(plan).balance, plan.totalPlanBalance());
        }
    }
}
