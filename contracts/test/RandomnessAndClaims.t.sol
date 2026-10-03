// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { POTSToken } from "../src/POTSToken.sol";
import { PotsRandomnessAdapter } from "../src/PotsRandomnessAdapter.sol";
import { PotsRoundManager } from "../src/PotsRoundManager.sol";
import { PotsTestBase, RejectingPlayer } from "./Base.t.sol";

contract RandomnessAndClaimsTest is PotsTestBase {
    function _pendingRound() internal {
        _enter(alice, _one(1), 1e15);
        _lockAndRequest();
    }

    function test_request_paysFeeFromTreasury() public {
        _enter(alice, _one(1), 1e15);
        vm.warp(block.timestamp + WINDOW + 1);
        manager.lock();
        manager.fundTreasury{ value: 0.001 ether }();
        uint256 before = manager.treasuryBalance();
        manager.requestRandomness();

        uint256 fee = dice.fee();
        assertEq(manager.treasuryBalance(), before - fee);
        assertEq(address(dice).balance, fee);
        assertEq(
            uint256(manager.getRound(1).phase), uint256(PotsRoundManager.Phase.RANDOMNESS_PENDING)
        );
        assertTrue(manager.invariantHolds());
    }

    function test_request_withoutTreasury_reverts() public {
        _enter(alice, _one(1), 1e15);
        vm.warp(block.timestamp + WINDOW + 1);
        manager.lock();
        vm.expectRevert(PotsRoundManager.InsufficientTreasury.selector);
        manager.requestRandomness();
    }

    function test_callback_onlyCoordinator() public {
        _pendingRound();
        uint64 sequence = manager.getRound(1).randomnessRequestId;
        vm.expectRevert(PotsRandomnessAdapter.NotCoordinator.selector);
        adapter._entropyCallback(sequence, DICE_PROVIDER, bytes32(uint256(1)));
    }

    function test_setManager_oneTimeOnly() public {
        vm.prank(owner);
        vm.expectRevert(PotsRandomnessAdapter.AlreadySet.selector);
        adapter.setManager(address(0xBEEF));
    }

    function test_unknownSequenceCallback_reverts() public {
        _pendingRound();
        vm.prank(address(dice));
        vm.expectRevert(PotsRandomnessAdapter.UnknownRequest.selector);
        adapter._entropyCallback(999, DICE_PROVIDER, bytes32(uint256(1)));
    }

    function test_duplicateCallback_reverts() public {
        _pendingRound();
        uint64 sequence = manager.getRound(1).randomnessRequestId;
        dice.fulfill(sequence, bytes32(uint256(7)));
        vm.expectRevert(PotsRoundManager.AlreadySettled.selector);
        dice.fulfill(sequence, bytes32(uint256(8)));
    }

    function test_refund_beforeDelay_reverts() public {
        _pendingRound();
        vm.expectRevert(PotsRoundManager.RefundTooEarly.selector);
        manager.refundRandomness(1);
    }

    function test_refund_afterDelay_thenCancel_refundsDeposits() public {
        _pendingRound();
        uint256 treasuryBefore = manager.treasuryBalance();
        vm.roll(manager.getRound(1).requestedAtBlock + REFUND_DELAY);
        manager.refundRandomness(1);
        assertEq(manager.treasuryBalance(), treasuryBefore + dice.fee());
        assertTrue(manager.invariantHolds());

        manager.cancelRound(1);
        assertEq(uint256(manager.getRound(1).phase), uint256(PotsRoundManager.Phase.CANCELLED));

        uint256 before = alice.balance;
        vm.prank(alice);
        manager.claimEth(1);
        assertEq(alice.balance, before + 1e15);
        assertTrue(manager.invariantHolds());
    }

    function test_cancel_withoutRefund_reverts() public {
        _pendingRound();
        vm.expectRevert(PotsRoundManager.CancelNotAllowed.selector);
        manager.cancelRound(1);
    }

    function test_refund_forwardsOnlyFee_notStrayBalance() public {
        _pendingRound();
        vm.deal(address(adapter), 1 ether);
        uint256 treasuryBefore = manager.treasuryBalance();
        vm.roll(manager.getRound(1).requestedAtBlock + REFUND_DELAY);
        manager.refundRandomness(1);
        assertEq(manager.treasuryBalance(), treasuryBefore + dice.fee());
        assertEq(address(adapter).balance, 1 ether);
        assertTrue(manager.invariantHolds());
    }

    function test_claim_double_reverts() public {
        _enter(alice, _one(1), 1e15);
        bytes32 output = _findOutput(1, false);
        _lockAndRequest();
        _settle(1, output);

        vm.prank(alice);
        manager.claimEth(1);
        vm.prank(alice);
        vm.expectRevert(PotsRoundManager.AlreadyClaimed.selector);
        manager.claimEth(1);
    }

    function test_claim_nothing_reverts() public {
        _enter(alice, _one(1), 1e15);
        _enter(bob, _one(2), 1e15);
        bytes32 output = _findOutput(1, false);
        _lockAndRequest();
        _settle(1, output);

        vm.prank(bob);
        vm.expectRevert(PotsRoundManager.NothingToClaim.selector);
        manager.claimEth(1);
        vm.prank(bob);
        vm.expectRevert(PotsRoundManager.NothingToClaim.selector);
        manager.claimPots(1);
    }

    function test_failingReceiver_doesNotBlockOtherClaims() public {
        RejectingPlayer rejecter = new RejectingPlayer();
        vm.deal(address(rejecter), 10 ether);
        rejecter.enter{ value: 1e15 }(manager, _one(1), 1e15);
        _enter(alice, _one(1), 1e15);

        bytes32 output = _findOutput(1, false);
        _lockAndRequest();
        _settle(1, output);

        vm.expectRevert(PotsRoundManager.TransferFailed.selector);
        rejecter.claimEth(manager, 1);

        vm.prank(alice);
        manager.claimEth(1);
        assertTrue(manager.invariantHolds());
    }

    function test_emissionExhaustion_reverts() public {
        _deployStack(0.5e18);
        manager.startNextRound();
        _enter(alice, _one(1), 1e15);
        _enter(bob, _one(1), 1e15);
        bytes32 output = _findOutput(1, false);
        _lockAndRequest();
        _settle(1, output);

        vm.prank(alice);
        manager.claimPots(1);
        assertEq(token.totalSupply(), 0.5e18);

        vm.prank(bob);
        vm.expectRevert(POTSToken.CapExceeded.selector);
        manager.claimPots(1);
    }

    function test_maxPayable_sumDoesNotExceedReserved() public {
        _enter(alice, _one(1), 1e15);
        _enter(bob, _one(1), 1e15);
        _enter(carol, _one(1), 1e15);
        bytes32 output = _findOutput(1, false);
        _lockAndRequest();
        _settle(1, output);

        uint256 pool = manager.getRound(1).payoutPool;
        (uint256 aliceEth,) = manager.getClaimable(1, alice);
        (uint256 bobEth,) = manager.getClaimable(1, bob);
        (uint256 carolEth,) = manager.getClaimable(1, carol);
        assertLe(aliceEth + bobEth + carolEth, pool);

        vm.prank(alice);
        manager.claimEth(1);
        vm.prank(bob);
        manager.claimEth(1);
        vm.prank(carol);
        manager.claimEth(1);
        assertTrue(manager.invariantHolds());
    }

    function test_withdrawTreasury_ownerOnly_andBounded() public {
        _enter(alice, _one(1), 1e15);
        bytes32 output = _findOutput(1, false);
        _lockAndRequest();
        _settle(1, output);

        vm.prank(alice);
        vm.expectRevert();
        manager.withdrawTreasury(alice, 1);

        uint256 accrued = manager.treasuryBalance();
        vm.prank(owner);
        vm.expectRevert(PotsRoundManager.InsufficientTreasury.selector);
        manager.withdrawTreasury(owner, accrued + 1);

        vm.prank(owner);
        manager.withdrawTreasury(owner, accrued);
        assertEq(manager.treasuryBalance(), 0);
        assertTrue(manager.invariantHolds());
    }
}
