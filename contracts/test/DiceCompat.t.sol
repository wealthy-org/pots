// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { PotsRoundManager } from "../src/PotsRoundManager.sol";
import { PotsTestBase } from "./Base.t.sol";

/// @dev The deployed Dice oracle calls the consumer with the raw selector below. On 2026-10-03 a
/// testnet rehearsal showed `callbackFailed = true` because the adapter once exposed
/// `entropyCallback` (0x24185135) instead. These tests pin the selector the oracle really uses.
contract DiceCompatTest is PotsTestBase {
    bytes4 internal constant ORACLE_SELECTOR = 0x52a5f1f8;
    bytes4 internal constant WRONG_SELECTOR = 0x24185135;

    function _pending() internal returns (uint64 sequence) {
        _enter(alice, _one(4), 1e15);
        _lockAndRequest();
        sequence = manager.getRound(1).randomnessRequestId;
    }

    function test_selector_matchesTheDeployedOracle() public pure {
        assertEq(bytes4(keccak256("_entropyCallback(uint64,address,bytes32)")), ORACLE_SELECTOR);
    }

    function test_adapter_acceptsTheOracleSelectorFromTheCoordinator() public {
        uint64 sequence = _pending();
        bytes32 random = bytes32(uint256(0xBEEF));
        vm.prank(address(dice));
        (bool ok,) = address(adapter)
            .call(abi.encodeWithSelector(ORACLE_SELECTOR, sequence, DICE_PROVIDER, random));
        assertTrue(ok);
        assertEq(manager.getRound(1).randomOutput, random);
    }

    function test_adapter_doesNotAnswerTheWrongSelector() public {
        uint64 sequence = _pending();
        vm.prank(address(dice));
        (bool ok,) = address(adapter)
            .call(
                abi.encodeWithSelector(WRONG_SELECTOR, sequence, DICE_PROVIDER, bytes32(uint256(1)))
            );
        assertFalse(ok);
        assertEq(manager.getRound(1).randomOutput, bytes32(0));
    }

    function test_oracleSelector_rejectsAForeignCaller() public {
        uint64 sequence = _pending();
        vm.prank(alice);
        (bool ok,) = address(adapter)
            .call(
                abi.encodeWithSelector(
                    ORACLE_SELECTOR, sequence, DICE_PROVIDER, bytes32(uint256(1))
                )
            );
        assertFalse(ok);
    }

    function test_oracleSelector_rejectsAForeignProvider() public {
        uint64 sequence = _pending();
        vm.prank(address(dice));
        (bool ok,) = address(adapter)
            .call(
                abi.encodeWithSelector(
                    ORACLE_SELECTOR, sequence, address(0xBAD), bytes32(uint256(1))
                )
            );
        assertFalse(ok);
    }

    function test_roundSettlesAfterAnOracleStyleCallback() public {
        uint64 sequence = _pending();
        bytes32 random = _findOutput(4, false);
        vm.prank(address(dice));
        (bool ok,) = address(adapter)
            .call(abi.encodeWithSelector(ORACLE_SELECTOR, sequence, DICE_PROVIDER, random));
        assertTrue(ok);
        manager.settle(1);
        assertEq(uint256(manager.getRound(1).phase), uint256(PotsRoundManager.Phase.SETTLED));
        assertTrue(manager.invariantHolds());
    }
}
