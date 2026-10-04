// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { PotsRoundManager } from "../src/PotsRoundManager.sol";
import { PotsTestBase } from "./Base.t.sol";

/// @dev Task 10.4: fuzzing of referral tagging and the bonus amount.
contract ManagerReferralFuzzTest is PotsTestBase {
    function testFuzz_setReferrer_anyValidPairTagsOnceForever(address wallet, address referrer)
        public
    {
        vm.assume(wallet != address(0) && referrer != address(0) && wallet != referrer);
        vm.assume(wallet != address(0xBEEF));
        vm.prank(wallet);
        manager.setReferrer(referrer);
        assertEq(manager.referrerOf(wallet), referrer);

        vm.prank(wallet);
        vm.expectRevert(PotsRoundManager.ReferrerAlreadySet.selector);
        manager.setReferrer(address(0xBEEF));
        assertEq(manager.referrerOf(wallet), referrer);
    }

    function testFuzz_bonus_isExactlyOnePercentOfTheClaim_roundedDown(
        uint96 aliceSeed,
        uint96 carolSeed
    ) public {
        uint256 aliceAmount = bound(aliceSeed, MIN_ENTRY, 5 ether / 25);
        uint256 carolAmount = bound(carolSeed, MIN_ENTRY, 5 ether / 25);
        vm.prank(alice);
        manager.enterWithReferrer{ value: aliceAmount }(bob, _one(5), aliceAmount);
        _enter(carol, _one(5), carolAmount);
        _lockAndRequest();
        _settle(1, _findOutput(5, false));

        vm.prank(alice);
        manager.claimPots(1);
        uint256 pots = (EMISSION * aliceAmount) / (aliceAmount + carolAmount);
        assertEq(token.balanceOf(alice), pots);
        assertEq(token.balanceOf(bob), (pots * manager.REFERRAL_BPS()) / 10_000);
        assertLe(token.totalSupply(), token.totalMinted());
        assertTrue(manager.invariantHolds());
    }
}
