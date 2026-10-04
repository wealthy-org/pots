// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { Vm } from "forge-std/Vm.sol";
import { POTSToken } from "../src/POTSToken.sol";
import { PotsRandomnessAdapter } from "../src/PotsRandomnessAdapter.sol";
import { PotsRoundManager } from "../src/PotsRoundManager.sol";
import { PotsTestBase } from "./Base.t.sol";
import { MockDiceCoordinator } from "./mocks/MockDiceCoordinator.sol";
import { MockPlan } from "./mocks/MockPlan.sol";

/// @dev Task 10.3: referral tagging and the 1% POTS bonus (ADR-016, D-19).
contract ManagerReferralTest is PotsTestBase {
    MockPlan internal plan;

    function setUp() public override {
        super.setUp();
        plan = new MockPlan(manager);
        vm.prank(owner);
        manager.setPlanContract(address(plan));
    }

    function _settleWith(uint8 winningSquare) internal {
        _lockAndRequest();
        _settle(manager.currentRoundId(), _findOutput(winningSquare, false));
    }

    function test_setReferrer_storesAndEmits() public {
        vm.expectEmit(true, true, false, false, address(manager));
        emit PotsRoundManager.ReferrerSet(alice, bob);
        vm.prank(alice);
        manager.setReferrer(bob);
        assertEq(manager.referrerOf(alice), bob);
        assertFalse(manager.hasEntered(alice));
    }

    function test_setReferrer_rejectsZeroSelfAndASecondTag() public {
        vm.startPrank(alice);
        vm.expectRevert(PotsRoundManager.ZeroAddress.selector);
        manager.setReferrer(address(0));
        vm.expectRevert(PotsRoundManager.SelfReferral.selector);
        manager.setReferrer(alice);
        manager.setReferrer(bob);
        vm.expectRevert(PotsRoundManager.ReferrerAlreadySet.selector);
        manager.setReferrer(carol);
        vm.stopPrank();
        assertEq(manager.referrerOf(alice), bob);
    }

    function test_setReferrer_afterADeploy_isTooLate_byHand() public {
        _enter(alice, _one(1), 1e15);
        assertTrue(manager.hasEntered(alice));
        vm.prank(alice);
        vm.expectRevert(PotsRoundManager.ReferralTooLate.selector);
        manager.setReferrer(bob);
    }

    function test_setReferrer_afterADeploy_isTooLate_throughAPlan() public {
        plan.enterFor{ value: 1e15 }(alice, _one(1), 1e15);
        assertTrue(manager.hasEntered(alice));
        vm.prank(alice);
        vm.expectRevert(PotsRoundManager.ReferralTooLate.selector);
        manager.setReferrer(bob);
    }

    function test_enterWithReferrer_tagsAndEntersInOneTransaction() public {
        vm.prank(alice);
        manager.enterWithReferrer{ value: 1e15 }(bob, _one(3), 1e15);
        assertEq(manager.referrerOf(alice), bob);
        assertTrue(manager.hasEntered(alice));
        assertEq(manager.entries(1, 3, alice), 1e15);
        assertTrue(manager.invariantHolds());
    }

    function test_enterWithReferrer_rollsTheTagBack_whenTheEntryReverts() public {
        vm.prank(owner);
        manager.pause();
        vm.prank(alice);
        vm.expectRevert(PotsRoundManager.ContractPaused.selector);
        manager.enterWithReferrer{ value: 1e15 }(bob, _one(3), 1e15);
        assertEq(manager.referrerOf(alice), address(0));
        assertFalse(manager.hasEntered(alice));

        vm.prank(owner);
        manager.unpause();
        vm.prank(alice);
        vm.expectRevert(PotsRoundManager.AmountBelowMinimum.selector);
        manager.enterWithReferrer{ value: 1e14 }(bob, _one(3), 1e14);
        assertEq(manager.referrerOf(alice), address(0));
    }

    function test_enterWithReferrer_keepsTheTagRules() public {
        vm.startPrank(alice);
        vm.expectRevert(PotsRoundManager.SelfReferral.selector);
        manager.enterWithReferrer{ value: 1e15 }(alice, _one(3), 1e15);
        vm.expectRevert(PotsRoundManager.ZeroAddress.selector);
        manager.enterWithReferrer{ value: 1e15 }(address(0), _one(3), 1e15);
        manager.enterWithReferrer{ value: 1e15 }(bob, _one(3), 1e15);
        vm.expectRevert(PotsRoundManager.ReferrerAlreadySet.selector);
        manager.enterWithReferrer{ value: 1e15 }(carol, _one(4), 1e15);
        vm.stopPrank();
    }

    function test_claim_mintsOnePercentToTheReferrer() public {
        vm.prank(alice);
        manager.enterWithReferrer{ value: 1e15 }(bob, _one(5), 1e15);
        _settleWith(5);

        vm.expectEmit(true, true, true, true, address(manager));
        emit PotsRoundManager.ReferralRewarded(1, alice, bob, EMISSION / 100);
        vm.prank(alice);
        manager.claimPots(1);

        assertEq(token.balanceOf(alice), EMISSION);
        assertEq(token.balanceOf(bob), EMISSION / 100);
        assertEq(token.totalSupply(), EMISSION + EMISSION / 100);
        assertTrue(manager.invariantHolds());
    }

    function test_claim_withoutAReferrer_mintsNoBonus() public {
        _enter(alice, _one(5), 1e15);
        _settleWith(5);
        vm.prank(alice);
        manager.claimPots(1);
        assertEq(token.totalSupply(), EMISSION);
    }

    function test_claim_aSecondClaimNeverPaysTheBonusTwice() public {
        vm.prank(alice);
        manager.enterWithReferrer{ value: 1e15 }(bob, _one(5), 1e15);
        _settleWith(5);
        vm.startPrank(alice);
        manager.claimPots(1);
        vm.expectRevert(PotsRoundManager.AlreadyClaimed.selector);
        manager.claimPots(1);
        vm.stopPrank();
        assertEq(token.balanceOf(bob), EMISSION / 100);
    }

    function test_claim_aShareIsRoundedDown_andEachReferrerGetsItsOwn() public {
        vm.prank(alice);
        manager.enterWithReferrer{ value: 1e15 }(bob, _one(5), 1e15);
        vm.prank(carol);
        manager.enterWithReferrer{ value: 2e15 }(bob, _one(5), 2e15);
        _settleWith(5);

        vm.prank(alice);
        manager.claimPots(1);
        vm.prank(carol);
        manager.claimPots(1);
        uint256 aliceShare = (EMISSION * 1e15) / 3e15;
        uint256 carolShare = (EMISSION * 2e15) / 3e15;
        assertEq(token.balanceOf(bob), (aliceShare * 100) / 10_000 + (carolShare * 100) / 10_000);
    }

    function test_claim_aBonusThatWouldPassTheCap_isSkipped_andTheClaimSucceeds() public {
        _deployStack(EMISSION);
        manager.startNextRound();
        vm.prank(alice);
        manager.enterWithReferrer{ value: 1e15 }(bob, _one(5), 1e15);
        _settleWith(5);

        vm.prank(alice);
        manager.claimPots(1);
        assertEq(token.balanceOf(alice), EMISSION);
        assertEq(token.balanceOf(bob), 0);
        assertEq(token.totalMinted(), EMISSION);
    }

    function _referredClaimOnASettledRound() internal {
        manager.startNextRound();
        vm.prank(alice);
        manager.enterWithReferrer{ value: 1e15 }(bob, _one(5), 1e15);
        _settleWith(5);
    }

    function test_claim_aBonusThatFitsTheCapExactly_isMinted() public {
        _deployStack(EMISSION + EMISSION / 100);
        _referredClaimOnASettledRound();
        vm.prank(alice);
        manager.claimPots(1);
        assertEq(token.balanceOf(bob), EMISSION / 100);
        assertEq(token.totalMinted(), token.cap());
    }

    function test_claim_aBonusOneWeiOverTheCap_isSkipped() public {
        _deployStack(EMISSION + EMISSION / 100 - 1);
        _referredClaimOnASettledRound();
        vm.prank(alice);
        manager.claimPots(1);
        assertEq(token.balanceOf(alice), EMISSION);
        assertEq(token.balanceOf(bob), 0);
    }

    function _stackWithEmission(uint256 emission) internal {
        dice = new MockDiceCoordinator(DICE_PROVIDER);
        vm.prank(owner);
        token = new POTSToken("POTS", "POTS", 1_000_000e18, owner);
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
            emission,
            REFUND_DELAY,
            LOCKED_CANCEL_DELAY,
            FORCE_CANCEL_DELAY
        );
        vm.startPrank(owner);
        token.setMinter(address(manager));
        adapter.setManager(address(manager));
        vm.stopPrank();
        manager.startNextRound();
    }

    function test_claim_aBonusThatRoundsToZero_mintsNothingAndEmitsNothing() public {
        _stackWithEmission(50);
        vm.prank(alice);
        manager.enterWithReferrer{ value: 1e15 }(bob, _one(5), 1e15);
        _settleWith(5);

        vm.recordLogs();
        vm.prank(alice);
        manager.claimPots(1);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        for (uint256 i; i < logs.length; ++i) {
            assertTrue(logs[i].topics[0] != PotsRoundManager.ReferralRewarded.selector);
        }
        assertEq(token.balanceOf(alice), 50);
        assertEq(token.balanceOf(bob), 0);
    }

    /// @dev One claim attempt with a fixed gas limit, rolled back afterwards: whether it succeeded
    /// and what the referrer held.
    function _attempt(uint256 gas) internal returns (bool ok, uint256 bonus) {
        uint256 id = vm.snapshotState();
        vm.prank(alice);
        try manager.claimPots{ gas: gas }(1) {
            ok = true;
            bonus = token.balanceOf(bob);
        } catch { }
        vm.revertToState(id);
    }

    function test_claim_littleGasNeverSkipsADueBonus() public {
        vm.prank(alice);
        manager.enterWithReferrer{ value: 1e15 }(bob, _one(5), 1e15);
        _settleWith(5);

        (bool highOk,) = _attempt(400_000);
        assertTrue(highOk);
        uint256 low = 100_000;
        uint256 high = 400_000;
        while (high - low > 250) {
            uint256 mid = (low + high) / 2;
            (bool ok,) = _attempt(mid);
            if (ok) {
                high = mid;
            } else {
                low = mid;
            }
        }

        uint256 successes;
        for (uint256 gas = low - 10_000; gas <= high + 10_000; gas += 250) {
            (bool ok, uint256 bonus) = _attempt(gas);
            if (ok) {
                ++successes;
                assertEq(bonus, EMISSION / 100);
            }
        }
        assertGt(successes, 0);
    }
}
