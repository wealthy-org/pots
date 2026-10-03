// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { PotsRoundManager } from "../src/PotsRoundManager.sol";
import { PotsTestBase } from "./Base.t.sol";

contract OwnershipTest is PotsTestBase {
    address internal multisig = makeAddr("multisig");
    address internal stranger = makeAddr("stranger");

    function test_transfer_isTwoStep() public {
        vm.prank(owner);
        manager.transferOwnership(multisig);

        assertEq(manager.owner(), owner);
        assertEq(manager.pendingOwner(), multisig);

        vm.prank(multisig);
        manager.acceptOwnership();
        assertEq(manager.owner(), multisig);
        assertEq(manager.pendingOwner(), address(0));
    }

    function test_transfer_toWrongAddressKeepsControl() public {
        vm.prank(owner);
        manager.transferOwnership(stranger);

        vm.prank(owner);
        manager.pause();
        assertTrue(manager.paused());

        vm.prank(owner);
        manager.transferOwnership(multisig);
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger)
        );
        manager.acceptOwnership();
        assertEq(manager.owner(), owner);
    }

    function test_accept_onlyPendingOwner() public {
        vm.prank(owner);
        manager.transferOwnership(multisig);
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger)
        );
        manager.acceptOwnership();
    }

    function test_transfer_onlyOwner() public {
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger)
        );
        manager.transferOwnership(multisig);
    }

    function test_oldOwnerLosesPowersAfterAccept() public {
        vm.prank(owner);
        manager.transferOwnership(multisig);
        vm.prank(multisig);
        manager.acceptOwnership();

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, owner));
        manager.pause();

        vm.prank(multisig);
        manager.pause();
        assertTrue(manager.paused());
    }

    function test_renounce_isDisabled() public {
        vm.prank(owner);
        vm.expectRevert(PotsRoundManager.RenounceDisabled.selector);
        manager.renounceOwnership();
        assertEq(manager.owner(), owner);
    }

    function test_renounce_isStillOwnerOnly() public {
        vm.prank(stranger);
        vm.expectRevert(
            abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, stranger)
        );
        manager.renounceOwnership();
    }

    function test_treasuryWithdrawal_worksForTheNewOwnerOnly() public {
        manager.fundTreasury{ value: 1 ether }();
        vm.prank(owner);
        manager.transferOwnership(multisig);
        vm.prank(multisig);
        manager.acceptOwnership();

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, owner));
        manager.withdrawTreasury(owner, 1 ether);

        uint256 before = multisig.balance;
        vm.prank(multisig);
        manager.withdrawTreasury(multisig, 1 ether);
        assertEq(multisig.balance, before + 1 ether);
        assertTrue(manager.invariantHolds());
    }

    function test_roundStillRunsAfterTokenAndAdapterOwnersRenounce() public {
        vm.startPrank(owner);
        token.renounceOwnership();
        adapter.renounceOwnership();
        vm.stopPrank();
        assertEq(token.owner(), address(0));
        assertEq(adapter.owner(), address(0));

        _enter(alice, _one(5), 1e15);
        bytes32 output = _findOutput(5, false);
        _lockAndRequest();
        _settle(1, output);

        vm.prank(alice);
        manager.claimEth(1);
        vm.prank(alice);
        manager.claimPots(1);
        assertEq(token.balanceOf(alice), EMISSION);
        assertTrue(manager.invariantHolds());
    }

    function test_minterAndManagerCannotBeChangedAfterRenounce() public {
        vm.startPrank(owner);
        token.renounceOwnership();
        adapter.renounceOwnership();
        vm.stopPrank();

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, owner));
        token.setMinter(alice);
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, owner));
        adapter.setManager(alice);
    }
}
