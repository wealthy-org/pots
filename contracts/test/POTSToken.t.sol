// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { Test } from "forge-std/Test.sol";
import { POTSToken } from "../src/POTSToken.sol";

contract POTSTokenTest is Test {
    POTSToken internal token;
    address internal owner = makeAddr("owner");
    address internal minter = makeAddr("minter");
    address internal alice = makeAddr("alice");
    uint256 internal constant CAP = 1_000e18;

    function setUp() public {
        vm.prank(owner);
        token = new POTSToken("POTS", "POTS", CAP, owner);
        vm.prank(owner);
        token.setMinter(minter);
    }

    function test_setMinter_onlyOwner() public {
        vm.expectRevert();
        token.setMinter(alice);
    }

    function test_setMinter_rejectsZeroAddress() public {
        vm.prank(owner);
        vm.expectRevert(POTSToken.ZeroAddress.selector);
        token.setMinter(address(0));
    }

    function test_setMinter_oneTimeOnly() public {
        vm.prank(owner);
        vm.expectRevert(POTSToken.AlreadySet.selector);
        token.setMinter(alice);
        assertEq(token.minter(), minter);
    }

    function test_mint_onlyMinter() public {
        vm.expectRevert(POTSToken.Unauthorized.selector);
        token.mint(alice, 1e18);
    }

    function test_mint_untilCap() public {
        vm.prank(minter);
        token.mint(alice, CAP);
        assertEq(token.totalSupply(), CAP);
        assertEq(token.balanceOf(alice), CAP);
    }

    function test_mint_revertsAboveCap() public {
        vm.startPrank(minter);
        token.mint(alice, CAP);
        vm.expectRevert(POTSToken.CapExceeded.selector);
        token.mint(alice, 1);
        vm.stopPrank();
    }

    function test_transfer_movesBalance() public {
        vm.prank(minter);
        token.mint(alice, 5e18);
        vm.prank(alice);
        token.transfer(minter, 2e18);
        assertEq(token.balanceOf(alice), 3e18);
        assertEq(token.balanceOf(minter), 2e18);
    }
}
