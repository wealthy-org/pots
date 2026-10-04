// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { PotsRoundManager } from "../src/PotsRoundManager.sol";
import { PotsTestBase } from "./Base.t.sol";
import { MockPlan } from "./mocks/MockPlan.sol";

/// @dev Task 9.2: manager changes of v3 (ADR-014, ADR-015), plus the D-15 and D-16 regression.
contract ManagerV3Test is PotsTestBase {
    MockPlan internal plan;

    function setUp() public override {
        super.setUp();
        plan = new MockPlan(manager);
        vm.prank(owner);
        manager.setPlanContract(address(plan));
    }

    function _settleRound(uint256 roundId, uint8 winningSquare) internal {
        _lockAndRequest();
        _settle(roundId, _findOutput(winningSquare, false));
    }

    function _planEnter(address wallet, uint8 square, uint256 amount) internal returns (uint256) {
        return plan.enterFor{ value: amount }(wallet, _one(square), amount);
    }

    function test_enter_startsNextRound_afterSettled() public {
        _enter(alice, _one(1), 1e15);
        _settleRound(1, 2);
        assertEq(manager.currentRoundId(), 1);

        vm.expectEmit(true, false, false, true, address(manager));
        emit PotsRoundManager.RoundOpened(2, manager.rolloverBalance());
        _enter(bob, _one(3), 1e15);

        assertEq(manager.currentRoundId(), 2);
        PotsRoundManager.Round memory round = manager.getRound(2);
        assertEq(uint256(round.phase), uint256(PotsRoundManager.Phase.OPEN));
        assertEq(round.closeAt, block.timestamp + WINDOW);
        assertEq(round.rolloverIn, (1e15 * 9000) / 10_000);
        assertEq(manager.entries(2, 3, bob), 1e15);
        assertTrue(manager.invariantHolds());
    }

    function test_enter_startsFirstRound_whenNoneExists() public {
        _deployStack(1_000_000e18);
        assertEq(manager.currentRoundId(), 0);
        _enter(alice, _one(4), 2e15);
        assertEq(manager.currentRoundId(), 1);
        assertEq(uint256(manager.getRound(1).phase), uint256(PotsRoundManager.Phase.OPEN));
        assertTrue(manager.invariantHolds());
    }

    function test_enter_startsNextRound_afterCancelled() public {
        _enter(alice, _one(1), 1e15);
        vm.warp(block.timestamp + WINDOW + 1);
        manager.lock();
        vm.warp(block.timestamp + LOCKED_CANCEL_DELAY);
        manager.cancelRound(1);

        _enter(bob, _one(2), 1e15);
        assertEq(manager.currentRoundId(), 2);
        assertEq(uint256(manager.getRound(2).phase), uint256(PotsRoundManager.Phase.OPEN));
        assertTrue(manager.invariantHolds());
    }

    function test_enter_doesNotStartRound_whileCurrentRoundIsLocked() public {
        _enter(alice, _one(1), 1e15);
        vm.warp(block.timestamp + WINDOW + 1);
        manager.lock();
        vm.prank(bob);
        vm.expectRevert(PotsRoundManager.NotOpen.selector);
        manager.enter{ value: 1e15 }(_one(2), 1e15);
        assertEq(manager.currentRoundId(), 1);
    }

    function test_enter_whenPaused_revertsBeforeStartingARound() public {
        _enter(alice, _one(1), 1e15);
        _settleRound(1, 2);
        vm.prank(owner);
        manager.pause();
        vm.prank(bob);
        vm.expectRevert(PotsRoundManager.ContractPaused.selector);
        manager.enter{ value: 1e15 }(_one(3), 1e15);
        assertEq(manager.currentRoundId(), 1);
    }

    function test_startNextRound_stillWorksAndStillRejectsAnOpenRound() public {
        _enter(alice, _one(1), 1e15);
        vm.expectRevert(PotsRoundManager.WrongPhase.selector);
        manager.startNextRound();
        _settleRound(1, 2);
        manager.startNextRound();
        assertEq(manager.currentRoundId(), 2);
        assertEq(uint256(manager.getRound(2).phase), uint256(PotsRoundManager.Phase.WAITING));
    }

    function test_setPlanContract_onlyOwner_once_notZero() public {
        _deployStack(1_000_000e18);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        manager.setPlanContract(address(plan));

        vm.prank(owner);
        vm.expectRevert(PotsRoundManager.ZeroAddress.selector);
        manager.setPlanContract(address(0));

        vm.expectEmit(true, false, false, true, address(manager));
        emit PotsRoundManager.PlanContractSet(address(plan));
        vm.prank(owner);
        manager.setPlanContract(address(plan));
        assertEq(manager.planContract(), address(plan));

        vm.prank(owner);
        vm.expectRevert(PotsRoundManager.PlanContractAlreadySet.selector);
        manager.setPlanContract(address(0xBEEF));
    }

    function test_enterFor_onlyPlanContract() public {
        vm.prank(alice);
        vm.expectRevert(PotsRoundManager.NotPlanContract.selector);
        manager.enterFor{ value: 1e15 }(bob, _one(1), 1e15);
        assertEq(manager.totalUnsettledDeposits(), 0);
    }

    function test_enterFor_zeroWalletReverts() public {
        vm.expectRevert(PotsRoundManager.ZeroAddress.selector);
        plan.enterFor{ value: 1e15 }(address(0), _one(1), 1e15);
    }

    function test_enterFor_recordsTheEntryUnderTheWallet() public {
        vm.expectEmit(true, true, false, true, address(manager));
        emit PotsRoundManager.EntryPlaced(1, bob, _one(5), 1e15, 1e15);
        uint256 roundId = _planEnter(bob, 5, 1e15);

        assertEq(roundId, 1);
        assertEq(manager.entries(1, 5, bob), 1e15);
        assertEq(manager.entries(1, 5, address(plan)), 0);
        assertEq(manager.getRound(1).totalEth, 1e15);
        assertEq(manager.totalUnsettledDeposits(), 1e15);
        assertEq(address(manager).balance, 1e15);
        assertTrue(manager.invariantHolds());
    }

    function test_enterFor_startsTheNextRound() public {
        _enter(alice, _one(1), 1e15);
        _settleRound(1, 2);
        uint256 roundId = _planEnter(bob, 3, 1e15);
        assertEq(roundId, 2);
        assertEq(uint256(manager.getRound(2).phase), uint256(PotsRoundManager.Phase.OPEN));
        assertTrue(manager.invariantHolds());
    }

    function test_enterFor_keepsTheEntryRules() public {
        vm.expectRevert(PotsRoundManager.AmountBelowMinimum.selector);
        plan.enterFor{ value: 1e14 }(bob, _one(1), 1e14);

        vm.expectRevert(PotsRoundManager.AmountAboveMaximum.selector);
        plan.enterFor{ value: 2 ether }(bob, _one(1), 2 ether);

        vm.expectRevert(PotsRoundManager.ValueMismatch.selector);
        plan.enterFor{ value: 1e15 }(bob, _one(1), 2e15);

        uint8[] memory dup = new uint8[](2);
        dup[0] = 4;
        dup[1] = 4;
        vm.expectRevert(PotsRoundManager.InvalidSquares.selector);
        plan.enterFor{ value: 2e15 }(bob, dup, 1e15);

        vm.expectRevert(PotsRoundManager.InvalidSquares.selector);
        plan.enterFor{ value: 1e15 }(bob, _one(26), 1e15);
    }

    function test_enterFor_afterDeadlineAndWhenPaused_reverts() public {
        _planEnter(bob, 1, 1e15);
        vm.warp(block.timestamp + WINDOW);
        vm.expectRevert(PotsRoundManager.RoundClosed.selector);
        plan.enterFor{ value: 1e15 }(bob, _one(2), 1e15);

        vm.prank(owner);
        manager.pause();
        vm.expectRevert(PotsRoundManager.ContractPaused.selector);
        plan.enterFor{ value: 1e15 }(bob, _one(2), 1e15);
    }

    function test_walletClaimsByHand_whatThePlanEntered() public {
        _planEnter(bob, 5, 1e15);
        _settleRound(1, 5);
        uint256 before = bob.balance;
        vm.prank(bob);
        manager.claimEth(1);
        assertGt(bob.balance, before);
        vm.prank(bob);
        manager.claimPots(1);
        assertEq(token.balanceOf(bob), EMISSION);
        assertTrue(manager.invariantHolds());
    }

    function test_setPlanClaimConsent_beforeAPlanContractIsRegistered_canOnlyBeSwitchedOff()
        public
    {
        _deployStack(1_000_000e18);
        vm.prank(bob);
        vm.expectRevert(PotsRoundManager.PlanContractNotSet.selector);
        manager.setPlanClaimConsent(true);
        vm.prank(bob);
        manager.setPlanClaimConsent(false);

        vm.prank(owner);
        manager.setPlanContract(address(plan));
        vm.prank(bob);
        manager.setPlanClaimConsent(true);
        assertTrue(manager.planClaimConsent(bob));
    }

    function test_setPlanClaimConsent_setsOnlyTheCallersFlag() public {
        vm.expectEmit(true, false, false, true, address(manager));
        emit PotsRoundManager.PlanClaimConsentSet(bob, true);
        vm.prank(bob);
        manager.setPlanClaimConsent(true);
        assertTrue(manager.planClaimConsent(bob));
        assertFalse(manager.planClaimConsent(alice));
        vm.prank(bob);
        manager.setPlanClaimConsent(false);
        assertFalse(manager.planClaimConsent(bob));
    }

    function test_claimEthToPlan_onlyPlanContract_andNeedsConsent() public {
        _planEnter(bob, 5, 1e15);
        _settleRound(1, 5);

        vm.prank(alice);
        vm.expectRevert(PotsRoundManager.NotPlanContract.selector);
        manager.claimEthToPlan(1, bob);

        vm.expectRevert(PotsRoundManager.NoClaimConsent.selector);
        plan.claimToPlan(1, bob);
    }

    function test_claimEthToPlan_movesExactlyTheClaimableEth() public {
        _planEnter(bob, 5, 1e15);
        _settleRound(1, 5);
        (uint256 claimable,) = manager.getClaimable(1, bob);
        uint256 unclaimedBefore = manager.totalUnclaimedEth();
        vm.prank(bob);
        manager.setPlanClaimConsent(true);

        vm.expectEmit(true, true, false, true, address(manager));
        emit PotsRoundManager.RewardClaimed(1, bob, manager.CLAIM_KIND_ETH(), claimable);
        uint256 moved = plan.claimToPlan(1, bob);

        assertEq(moved, claimable);
        assertEq(address(plan).balance, claimable);
        assertEq(manager.totalUnclaimedEth(), unclaimedBefore - claimable);
        assertTrue(manager.getWalletRound(1, bob).ethClaimed);
        assertTrue(manager.invariantHolds());

        vm.prank(bob);
        vm.expectRevert(PotsRoundManager.AlreadyClaimed.selector);
        manager.claimEth(1);
        vm.expectRevert(PotsRoundManager.AlreadyClaimed.selector);
        plan.claimToPlan(1, bob);
    }

    function test_claimEthToPlan_movesARefundOfACancelledRound() public {
        _planEnter(bob, 5, 1e15);
        vm.warp(block.timestamp + WINDOW + 1);
        manager.lock();
        vm.warp(block.timestamp + LOCKED_CANCEL_DELAY);
        manager.cancelRound(1);
        vm.prank(bob);
        manager.setPlanClaimConsent(true);

        assertEq(plan.claimToPlan(1, bob), 1e15);
        assertEq(address(plan).balance, 1e15);
        assertTrue(manager.invariantHolds());
    }

    function test_claimEthToPlan_errors() public {
        _planEnter(bob, 5, 1e15);
        vm.startPrank(bob);
        manager.setPlanClaimConsent(true);
        vm.stopPrank();

        vm.expectRevert(PotsRoundManager.WrongPhase.selector);
        plan.claimToPlan(1, bob);

        _settleRound(1, 7);
        vm.expectRevert(PotsRoundManager.NothingToClaim.selector);
        plan.claimToPlan(1, bob);
    }

    function test_claimEthToPlan_failingPlanReceiver_revertsOnlyThisClaim() public {
        _planEnter(bob, 5, 1e15);
        _planEnter(carol, 5, 1e15);
        _settleRound(1, 5);
        vm.prank(bob);
        manager.setPlanClaimConsent(true);
        plan.setRejectEth(true);

        vm.expectRevert(PotsRoundManager.TransferFailed.selector);
        plan.claimToPlan(1, bob);
        assertFalse(manager.getWalletRound(1, bob).ethClaimed);

        vm.prank(carol);
        manager.claimEth(1);
        assertTrue(manager.invariantHolds());
    }

    function test_noWinner_mintsNoPots_andTheVaultHoldsOnlyEth() public {
        _enter(alice, _one(1), 1e15);
        _enter(bob, _one(3), 1e15);
        _settleRound(1, 7);

        assertEq(token.totalSupply(), 0);
        assertEq(manager.getRound(1).winningSquareEth, 0);
        vm.prank(alice);
        vm.expectRevert(PotsRoundManager.NothingToClaim.selector);
        manager.claimPots(1);
        assertEq(token.totalSupply(), 0);

        assertEq(manager.jackpotBalance(), (2e15 * 100) / 10_000);
        assertEq(manager.rolloverBalance(), (2e15 * 9000) / 10_000);
        assertTrue(manager.invariantHolds());
    }

    function test_afterAnEmptyRound_onlyTheWinnerMintsPots() public {
        _enter(alice, _one(1), 1e15);
        _settleRound(1, 7);
        assertEq(token.totalSupply(), 0);

        _enter(alice, _one(4), 1e15);
        _settleRound(2, 4);
        vm.prank(alice);
        manager.claimPots(2);
        assertEq(token.totalSupply(), EMISSION);
        assertEq(token.balanceOf(alice), EMISSION);
        assertTrue(manager.invariantHolds());
    }
}
