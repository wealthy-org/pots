// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { PotsAutoPlan } from "../src/PotsAutoPlan.sol";
import { PotsRoundManager } from "../src/PotsRoundManager.sol";
import { PotsTestBase } from "./Base.t.sol";
import { FaultyManager } from "./mocks/FaultyManager.sol";

/// @dev A contract wallet without a receive function: it can fund a plan but never take ETH back.
contract PlanWallet {
    function create(PotsAutoPlan plan, uint8[] calldata squares, uint256 amount, uint16 rounds)
        external
        payable
    {
        plan.createPlan{ value: msg.value }(squares, amount, rounds, false);
    }

    function cancel(PotsAutoPlan plan) external {
        plan.cancelPlan();
    }
}

/// @dev Task 9.3: the plan contract (API-31 to API-35, DATA-17, ADR-015).
contract PotsAutoPlanTest is PotsTestBase {
    uint256 internal constant MIN_DEPOSIT = 0.002 ether;
    uint256 internal constant AMOUNT = 1e15;

    PotsAutoPlan internal plan;

    function setUp() public override {
        super.setUp();
        plan = new PotsAutoPlan(manager, 5, MIN_DEPOSIT);
        vm.prank(owner);
        manager.setPlanContract(address(plan));
    }

    function _two(uint8 a, uint8 b) internal pure returns (uint8[] memory list) {
        list = new uint8[](2);
        list[0] = a;
        list[1] = b;
    }

    function _create(
        address wallet,
        uint8[] memory squares,
        uint256 amount,
        uint16 rounds,
        bool loop
    ) internal {
        vm.prank(wallet);
        plan.createPlan{ value: uint256(rounds) * squares.length * amount }(
            squares, amount, rounds, loop
        );
    }

    function _consent(address wallet, bool allowed) internal {
        vm.prank(wallet);
        manager.setPlanClaimConsent(allowed);
    }

    function _settleCurrent(uint8 winningSquare) internal {
        _lockAndRequest();
        _settle(manager.currentRoundId(), _findOutput(winningSquare, false));
    }

    function _wallet(string memory name) internal returns (address wallet) {
        wallet = makeAddr(name);
        vm.deal(wallet, 100 ether);
    }

    function test_createPlan_storesFundsAndJoinsTheActiveList() public {
        vm.expectEmit(true, false, false, true, address(plan));
        emit PotsAutoPlan.PlanCreated(alice, 0x3, AMOUNT, 3, false, 6e15);
        _create(alice, _two(1, 2), AMOUNT, 3, false);

        PotsAutoPlan.Plan memory stored = plan.getPlan(alice);
        assertEq(stored.squareMask, 0x3);
        assertEq(stored.squareCount, 2);
        assertEq(stored.amountPerSquare, AMOUNT);
        assertEq(stored.roundsRemaining, 3);
        assertTrue(stored.active);
        assertFalse(stored.loop);
        assertEq(stored.lastRound, 0);
        assertEq(stored.balance, 6e15);
        assertEq(plan.activePlanCount(), 1);
        assertEq(plan.activeWalletAt(0), alice);
        assertEq(plan.totalPlanBalance(), 6e15);
        assertEq(address(plan).balance, 6e15);
        assertTrue(plan.planInvariantHolds());
    }

    function test_createPlan_rejectsInvalidInput() public {
        vm.startPrank(alice);
        vm.expectRevert(PotsAutoPlan.InvalidRounds.selector);
        plan.createPlan{ value: 0 }(_two(1, 2), AMOUNT, 0, false);
        vm.expectRevert(PotsAutoPlan.InvalidRounds.selector);
        plan.createPlan{ value: 202e15 }(_two(1, 2), AMOUNT, 101, false);

        vm.expectRevert(PotsAutoPlan.InvalidSquares.selector);
        plan.createPlan{ value: 0 }(new uint8[](0), AMOUNT, 3, false);
        vm.expectRevert(PotsAutoPlan.InvalidSquares.selector);
        plan.createPlan{ value: 6e15 }(_two(4, 4), AMOUNT, 3, false);
        vm.expectRevert(PotsAutoPlan.InvalidSquares.selector);
        plan.createPlan{ value: 6e15 }(_two(0, 4), AMOUNT, 3, false);
        vm.expectRevert(PotsAutoPlan.InvalidSquares.selector);
        plan.createPlan{ value: 6e15 }(_two(26, 4), AMOUNT, 3, false);

        vm.expectRevert(PotsAutoPlan.AmountBelowMinimum.selector);
        plan.createPlan{ value: 6e14 }(_two(1, 2), 1e14, 3, false);
        vm.expectRevert(PotsAutoPlan.AmountAboveMaximum.selector);
        plan.createPlan{ value: 12 ether }(_two(1, 2), 2 ether, 3, false);

        vm.expectRevert(PotsAutoPlan.ValueMismatch.selector);
        plan.createPlan{ value: 5e15 }(_two(1, 2), AMOUNT, 3, false);
        vm.expectRevert(PotsAutoPlan.DepositTooSmall.selector);
        plan.createPlan{ value: 1e15 }(_one(1), AMOUNT, 1, false);
        vm.stopPrank();
        assertEq(plan.activePlanCount(), 0);
    }

    function test_createPlan_whenPaused_reverts() public {
        vm.prank(owner);
        manager.pause();
        vm.prank(alice);
        vm.expectRevert(PotsAutoPlan.ContractPaused.selector);
        plan.createPlan{ value: 6e15 }(_two(1, 2), AMOUNT, 3, false);
    }

    function test_createPlan_oneActivePlanPerWallet_andACap() public {
        _create(alice, _two(1, 2), AMOUNT, 3, false);
        vm.prank(alice);
        vm.expectRevert(PotsAutoPlan.PlanExists.selector);
        plan.createPlan{ value: 6e15 }(_two(1, 2), AMOUNT, 3, false);

        for (uint256 i; i < 4; ++i) {
            _create(_wallet(string(abi.encodePacked("w", i))), _two(1, 2), AMOUNT, 1, false);
        }
        assertEq(plan.activePlanCount(), 5);
        vm.prank(bob);
        vm.expectRevert(PotsAutoPlan.PlanCapReached.selector);
        plan.createPlan{ value: 2e15 }(_two(1, 2), AMOUNT, 1, false);
    }

    function test_createPlan_loopNeedsTheWalletsConsent() public {
        vm.prank(alice);
        vm.expectRevert(PotsAutoPlan.LoopNeedsConsent.selector);
        plan.createPlan{ value: 6e15 }(_two(1, 2), AMOUNT, 3, true);

        _consent(alice, true);
        _create(alice, _two(1, 2), AMOUNT, 3, true);
        assertTrue(plan.getPlan(alice).loop);
    }

    function test_setLoop_needsAnActivePlan_andConsent() public {
        vm.prank(alice);
        vm.expectRevert(PotsAutoPlan.NoPlan.selector);
        plan.setLoop(true);

        _create(alice, _two(1, 2), AMOUNT, 3, false);
        vm.prank(alice);
        vm.expectRevert(PotsAutoPlan.LoopNeedsConsent.selector);
        plan.setLoop(true);

        _consent(alice, true);
        vm.expectEmit(true, false, false, true, address(plan));
        emit PotsAutoPlan.PlanLoopSet(alice, true);
        vm.prank(alice);
        plan.setLoop(true);
        assertTrue(plan.getPlan(alice).loop);

        vm.prank(alice);
        plan.setLoop(false);
        assertFalse(plan.getPlan(alice).loop);
    }

    function test_cancelPlan_returnsExactlyTheBalance_alsoWhilePaused() public {
        _create(alice, _two(1, 2), AMOUNT, 3, false);
        vm.prank(owner);
        manager.pause();

        uint256 before = alice.balance;
        vm.expectEmit(true, false, false, true, address(plan));
        emit PotsAutoPlan.PlanCancelled(alice, 6e15);
        vm.prank(alice);
        plan.cancelPlan();

        assertEq(alice.balance, before + 6e15);
        assertEq(plan.activePlanCount(), 0);
        assertEq(plan.totalPlanBalance(), 0);
        assertFalse(plan.getPlan(alice).active);
        assertTrue(plan.planInvariantHolds());

        vm.prank(alice);
        vm.expectRevert(PotsAutoPlan.NoPlan.selector);
        plan.cancelPlan();
    }

    function test_cancelPlan_afterAnEntry_returnsTheUnspentBalance() public {
        _create(alice, _two(1, 2), AMOUNT, 3, false);
        plan.executePlans(20);
        assertEq(plan.getPlan(alice).balance, 4e15);

        uint256 before = alice.balance;
        vm.prank(alice);
        plan.cancelPlan();
        assertEq(alice.balance, before + 4e15);
        assertEq(manager.entries(1, 1, alice), AMOUNT);
        assertTrue(manager.invariantHolds());
    }

    function test_cancelPlan_contractWalletThatRejectsEth_locksOnlyItself() public {
        PlanWallet wallet = new PlanWallet();
        vm.deal(address(wallet), 1 ether);
        wallet.create{ value: 6e15 }(plan, _two(1, 2), AMOUNT, 3);
        _create(alice, _two(3, 4), AMOUNT, 1, false);

        vm.expectRevert(PotsAutoPlan.TransferFailed.selector);
        wallet.cancel(plan);
        assertTrue(plan.getPlan(address(wallet)).active);
        assertEq(plan.getPlan(address(wallet)).balance, 6e15);

        vm.prank(alice);
        plan.cancelPlan();
        assertEq(plan.activePlanCount(), 1);
        assertTrue(plan.planInvariantHolds());
    }

    function test_receive_acceptsEthOnlyFromTheManager() public {
        vm.expectRevert(PotsAutoPlan.NotManager.selector);
        payable(address(plan)).transfer(1 wei);
    }

    function test_executePlans_entersEveryFundedRound_thenFinishes() public {
        _create(alice, _two(1, 2), AMOUNT, 3, false);

        for (uint256 round = 1; round <= 3; ++round) {
            vm.expectEmit(true, true, false, true, address(plan));
            emit PotsAutoPlan.PlanExecuted(alice, round, 2e15, uint16(3 - round));
            assertEq(plan.executePlans(20), 1);
            assertEq(manager.entries(round, 1, alice), AMOUNT);
            assertEq(manager.entries(round, 2, alice), AMOUNT);
            _settleCurrent(25);
        }
        assertEq(plan.getPlan(alice).balance, 0);
        assertEq(plan.getPlan(alice).lastRound, 3);

        vm.expectEmit(true, false, false, true, address(plan));
        emit PotsAutoPlan.PlanFinished(alice, 1);
        assertEq(plan.executePlans(20), 1);
        assertFalse(plan.getPlan(alice).active);
        assertEq(plan.activePlanCount(), 0);
        assertTrue(plan.planInvariantHolds());
        assertTrue(manager.invariantHolds());
    }

    function test_executePlans_entryBelongsToTheWallet_whoClaimsByHand() public {
        _create(alice, _one(5), 2e15, 1, false);
        plan.executePlans(20);
        _settleCurrent(5);
        uint256 before = alice.balance;
        vm.prank(alice);
        manager.claimEth(1);
        assertGt(alice.balance, before);
        vm.prank(alice);
        manager.claimPots(1);
        assertEq(token.balanceOf(alice), EMISSION);
    }

    function test_executePlans_aPlanEntersARoundAtMostOnce() public {
        _create(alice, _two(1, 2), AMOUNT, 3, false);
        assertEq(plan.executePlans(20), 1);
        assertEq(plan.executePlans(20), 0);
        assertEq(manager.entries(1, 1, alice), AMOUNT);
    }

    function test_lastRound_survivesCancelAndCreate_soAMovedPlanCannotEnterTwice() public {
        address first = _wallet("first");
        _create(first, _two(3, 4), AMOUNT, 1, false);
        _create(alice, _two(1, 2), AMOUNT, 3, false);
        assertEq(plan.executePlans(1), 1);
        assertEq(manager.entries(1, 1, alice), AMOUNT);

        vm.prank(alice);
        plan.cancelPlan();
        _create(alice, _two(1, 2), AMOUNT, 3, false);
        assertEq(plan.getPlan(alice).lastRound, 1);

        vm.prank(first);
        plan.cancelPlan();
        assertEq(plan.activeWalletAt(0), alice);
        plan.executePlans(20);

        assertEq(manager.entries(1, 1, alice), AMOUNT);
        assertEq(plan.getPlan(alice).roundsRemaining, 3);
        assertEq(manager.getRound(1).totalEth, 2e15);
    }

    function test_executePlans_returnsZeroWithoutReverting_whenTheRoundCannotTakeEntries() public {
        _create(alice, _two(1, 2), AMOUNT, 3, false);

        vm.prank(owner);
        manager.pause();
        assertEq(plan.executePlans(20), 0);
        vm.prank(owner);
        manager.unpause();

        _enter(bob, _one(3), AMOUNT);
        vm.warp(block.timestamp + WINDOW);
        assertEq(plan.executePlans(20), 0);

        manager.lock();
        assertEq(plan.executePlans(20), 0);
        manager.fundTreasury{ value: 0.01 ether }();
        manager.requestRandomness();
        assertEq(plan.executePlans(20), 0);
        assertEq(manager.entries(1, 1, alice), 0);
    }

    function test_executePlans_startsTheNextRound() public {
        _enter(bob, _one(3), AMOUNT);
        _settleCurrent(7);
        _create(alice, _two(1, 2), AMOUNT, 2, false);

        assertEq(plan.executePlans(20), 1);
        assertEq(manager.currentRoundId(), 2);
        assertEq(uint256(manager.getRound(2).phase), uint256(PotsRoundManager.Phase.OPEN));
        assertEq(manager.entries(2, 1, alice), AMOUNT);
        assertTrue(manager.invariantHolds());
    }

    function test_constructor_rejectsAZeroManagerAndAZeroCap() public {
        vm.expectRevert(PotsAutoPlan.ZeroAddress.selector);
        new PotsAutoPlan(PotsRoundManager(payable(address(0))), 5, MIN_DEPOSIT);
        vm.expectRevert(PotsAutoPlan.InvalidConfig.selector);
        new PotsAutoPlan(manager, 0, MIN_DEPOSIT);
    }

    function test_createPlan_beforeTheManagerRegisteredThePlanContract_reverts() public {
        _deployStack(1_000_000e18);
        PotsAutoPlan unregistered = new PotsAutoPlan(manager, 5, MIN_DEPOSIT);
        vm.prank(alice);
        vm.expectRevert(PotsAutoPlan.PlanNotRegistered.selector);
        unregistered.createPlan{ value: 6e15 }(_two(1, 2), AMOUNT, 3, false);
        assertEq(address(unregistered).balance, 0);
    }

    function test_createPlan_afterAFinishedPlanThatKeepsABalance_needsACancelFirst() public {
        _consent(alice, true);
        _create(alice, _one(5), 2e15, 1, true);
        _enter(bob, _one(9), 2e15);
        plan.executePlans(20);
        _settleCurrent(5);
        plan.executePlans(20);
        _settleCurrent(9);
        plan.executePlans(20);
        assertFalse(plan.getPlan(alice).active);
        assertGt(plan.getPlan(alice).balance, 0);

        vm.prank(alice);
        vm.expectRevert(PotsAutoPlan.PlanExists.selector);
        plan.createPlan{ value: 2e15 }(_one(5), 2e15, 1, false);

        vm.prank(alice);
        plan.cancelPlan();
        _create(alice, _one(5), 2e15, 1, false);
        assertTrue(plan.getPlan(alice).active);
    }

    function test_forcedEth_doesNotBreakTheInvariantsOrTheExit() public {
        _create(alice, _two(1, 2), AMOUNT, 3, false);
        vm.deal(address(plan), address(plan).balance + 1 ether);
        vm.deal(address(manager), address(manager).balance + 1 ether);
        assertTrue(plan.planInvariantHolds());
        assertTrue(manager.invariantHolds());

        plan.executePlans(20);
        uint256 before = alice.balance;
        vm.prank(alice);
        plan.cancelPlan();
        assertEq(alice.balance, before + 4e15);
        assertTrue(plan.planInvariantHolds());
    }

    function test_nextCursor_countsThePositionsLeftForTheCurrentRound() public {
        for (uint256 i; i < 4; ++i) {
            _create(_wallet(string(abi.encodePacked("w", i))), _two(1, 2), AMOUNT, 1, false);
        }
        assertEq(plan.nextCursor(), 4);
        assertEq(plan.executePlans(3), 3);
        assertEq(plan.nextCursor(), 1);
        assertEq(plan.executePlans(3), 1);
        assertEq(plan.nextCursor(), 0);
        assertEq(plan.executePlans(3), 0);

        _settleCurrent(25);
        assertEq(plan.nextCursor(), 4);
    }

    function test_cursor_cancelBetweenCallsNeverMakesAPlanMissTheRound() public {
        address[4] memory wallets;
        for (uint256 i; i < 4; ++i) {
            wallets[i] = _wallet(string(abi.encodePacked("w", i)));
            _create(wallets[i], _one(uint8(i + 1)), 2e15, 1, false);
        }
        assertEq(plan.executePlans(2), 2);

        vm.prank(wallets[0]);
        plan.cancelPlan();
        plan.executePlans(20);

        for (uint256 i = 1; i < 4; ++i) {
            assertEq(manager.entries(1, uint8(i + 1), wallets[i]), 2e15);
        }
        assertEq(manager.entries(1, 1, wallets[0]), 0);
        assertEq(manager.getRound(1).totalEth, 6e15);
        assertTrue(plan.planInvariantHolds());
    }

    function test_cursor_isClampedWhenPlansAreCancelledMidPass() public {
        address[4] memory wallets;
        for (uint256 i; i < 4; ++i) {
            wallets[i] = _wallet(string(abi.encodePacked("w", i)));
            _create(wallets[i], _one(uint8(i + 1)), 2e15, 1, false);
        }
        assertEq(plan.executePlans(1), 1);
        for (uint256 i; i < 3; ++i) {
            vm.prank(wallets[i]);
            plan.cancelPlan();
        }
        assertEq(plan.activePlanCount(), 1);
        plan.executePlans(20);
        assertEq(plan.nextCursor(), 0);
        assertEq(manager.entries(1, 4, wallets[3]), 2e15);
    }

    function test_executePlans_withTooLittleGas_stopsTheBatchWithoutSkippingAPlan() public {
        _create(alice, _two(1, 2), AMOUNT, 3, false);
        assertEq(plan.executePlans{ gas: 300_000 }(20), 0);
        assertEq(manager.entries(1, 1, alice), 0);
        assertEq(plan.getPlan(alice).roundsRemaining, 3);
        assertEq(plan.nextCursor(), 1);

        assertEq(plan.executePlans(20), 1);
        assertEq(manager.entries(1, 1, alice), AMOUNT);
    }

    function test_loop_movesThePreviousWinningsIntoThePlan_andKeepsPlaying() public {
        _consent(alice, true);
        _create(alice, _one(5), 2e15, 1, true);
        _enter(bob, _one(9), 2e15);
        plan.executePlans(20);
        _settleCurrent(5);
        (uint256 claimable,) = manager.getClaimable(1, alice);
        assertEq(claimable, (4e15 * 9000) / 10_000);

        vm.expectEmit(true, true, false, true, address(plan));
        emit PotsAutoPlan.PlanCompounded(alice, 1, claimable);
        assertEq(plan.executePlans(20), 1);

        PotsAutoPlan.Plan memory stored = plan.getPlan(alice);
        assertEq(stored.lastRound, 2);
        assertEq(stored.roundsRemaining, 0);
        assertEq(stored.balance, claimable - 2e15);
        assertTrue(stored.active);
        assertEq(manager.entries(2, 5, alice), 2e15);
        assertEq(plan.totalPlanBalance(), stored.balance);
        assertTrue(plan.planInvariantHolds());
        assertTrue(manager.invariantHolds());

        vm.prank(alice);
        vm.expectRevert(PotsRoundManager.AlreadyClaimed.selector);
        manager.claimEth(1);
    }

    function test_loop_stopsWhenTheBalanceNoLongerCoversARound_andTheWalletKeepsIt() public {
        _consent(alice, true);
        _create(alice, _one(5), 2e15, 1, true);
        _enter(bob, _one(9), 2e15);
        plan.executePlans(20);
        _settleCurrent(5);
        plan.executePlans(20);
        _settleCurrent(9);

        vm.expectEmit(true, false, false, true, address(plan));
        emit PotsAutoPlan.PlanFinished(alice, 2);
        plan.executePlans(20);
        assertFalse(plan.getPlan(alice).active);

        uint256 remaining = plan.getPlan(alice).balance;
        assertGt(remaining, 0);
        uint256 before = alice.balance;
        vm.prank(alice);
        plan.cancelPlan();
        assertEq(alice.balance, before + remaining);
        assertTrue(plan.planInvariantHolds());
    }

    function test_loop_withoutConsentDoesNotCompound() public {
        _consent(alice, true);
        _create(alice, _one(5), 2e15, 3, true);
        _enter(bob, _one(9), 2e15);
        plan.executePlans(20);
        _settleCurrent(5);
        _consent(alice, false);

        uint256 balanceBefore = plan.getPlan(alice).balance;
        plan.executePlans(20);
        assertEq(plan.getPlan(alice).balance, balanceBefore - 2e15);

        vm.prank(alice);
        manager.claimEth(1);
    }

    function test_executePlans_aFailingEntryIsSkippedAndBlocksNobody() public {
        FaultyManager faulty = new FaultyManager();
        PotsAutoPlan guarded =
            new PotsAutoPlan(PotsRoundManager(payable(address(faulty))), 5, MIN_DEPOSIT);
        faulty.setPlanContract(address(guarded));
        address bad = _wallet("bad");
        address silent = _wallet("silent");
        address good = _wallet("good");
        faulty.setMode(bad, 1);
        faulty.setMode(silent, 2);

        address[3] memory wallets = [bad, silent, good];
        for (uint256 i; i < 3; ++i) {
            vm.prank(wallets[i]);
            guarded.createPlan{ value: 4e15 }(_two(1, 2), AMOUNT, 2, false);
        }

        vm.expectEmit(true, false, false, true, address(guarded));
        emit PotsAutoPlan.PlanExecuted(good, 1, 2e15, 1);
        vm.expectEmit(true, false, false, true, address(guarded));
        emit PotsAutoPlan.PlanSkipped(silent, bytes4(0));
        vm.expectEmit(true, false, false, true, address(guarded));
        emit PotsAutoPlan.PlanSkipped(bad, FaultyManager.Boom.selector);
        assertEq(guarded.executePlans(20), 3);

        assertEq(faulty.entered(), 1);
        assertEq(guarded.getPlan(bad).balance, 4e15);
        assertEq(guarded.getPlan(bad).roundsRemaining, 2);
        assertEq(guarded.getPlan(silent).balance, 4e15);
        assertEq(guarded.getPlan(good).balance, 2e15);
        assertEq(guarded.totalPlanBalance(), 10e15);
        assertTrue(guarded.planInvariantHolds());
    }
}

/// @dev The batch cap: one call never visits more than MAX_BATCH plans.
contract PotsAutoPlanBatchTest is PotsTestBase {
    PotsAutoPlan internal plan;

    function setUp() public override {
        super.setUp();
        plan = new PotsAutoPlan(manager, 50, 0.002 ether);
        vm.prank(owner);
        manager.setPlanContract(address(plan));
    }

    function test_executePlans_neverVisitsMoreThanTheBatchCap() public {
        uint8[] memory squares = new uint8[](2);
        squares[0] = 1;
        squares[1] = 2;
        for (uint256 i; i < 25; ++i) {
            address wallet = makeAddr(string(abi.encodePacked("batch", i)));
            vm.deal(wallet, 1 ether);
            vm.prank(wallet);
            plan.createPlan{ value: 2e15 }(squares, 1e15, 1, false);
        }
        assertEq(plan.MAX_BATCH(), 20);
        assertEq(plan.executePlans(100), 20);
        assertEq(plan.nextCursor(), 5);
        assertEq(plan.executePlans(100), 5);
        assertEq(plan.nextCursor(), 0);
        assertEq(manager.getRound(1).totalEth, 25 * 2e15);
    }
}
