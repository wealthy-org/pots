// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { PotsAutoPlan } from "../src/PotsAutoPlan.sol";
import { PotsRoundManager } from "../src/PotsRoundManager.sol";
import { PotsTestBase } from "./Base.t.sol";

/// @dev Task 9.5: measures the gas of one plan visit, which sets `MIN_GAS_PER_PLAN` and `MAX_BATCH`.
contract PotsAutoPlanGasTest is PotsTestBase {
    PotsAutoPlan internal plan;

    function setUp() public override {
        super.setUp();
        plan = new PotsAutoPlan(manager, 100, 0.002 ether);
        vm.prank(owner);
        manager.setPlanContract(address(plan));
    }

    function _squares(uint256 count) internal pure returns (uint8[] memory squares) {
        squares = new uint8[](count);
        for (uint256 i; i < count; ++i) {
            squares[i] = uint8(i + 1);
        }
    }

    function _wallet(uint256 index) internal returns (address wallet) {
        wallet = address(uint160(0x10000 + index));
        vm.deal(wallet, 1_000 ether);
    }

    function _create(address wallet, uint256 squares, uint256 amount, bool loop) internal {
        vm.prank(wallet);
        plan.createPlan{ value: 3 * squares * amount }(_squares(squares), amount, 3, loop);
    }

    function _gasOf(uint256 maxCount) internal returns (uint256 used) {
        uint256 start = gasleft();
        plan.executePlans(maxCount);
        used = start - gasleft();
    }

    function test_gas_oneVisit_firstEntryOfARound() public {
        _create(_wallet(1), 25, 0.001 ether, false);
        emit log_named_uint("visit 25 squares, round already WAITING", _gasOf(1));
    }

    function test_gas_worstVisit_claimThenEntryThatStartsTheRound() public {
        address wallet = _wallet(1);
        vm.prank(wallet);
        manager.setPlanClaimConsent(true);
        _create(_wallet(2), 25, 0.001 ether, false);
        _create(wallet, 25, 0.001 ether, true);
        plan.executePlans(2);
        _lockAndRequest();
        uint256 winning = 3;
        _settle(1, _findOutput(uint8(winning), false));

        uint256 used = _gasOf(1);
        emit log_named_uint("worst visit: claim into plan + 25 square entry + round start", used);
        assertEq(plan.getPlan(wallet).lastRound, 2);
        assertEq(manager.getRound(2).totalEth, 25 * 0.001 ether);
        assertLt((used * 64) / 63, plan.MIN_GAS_PER_PLAN());
    }

    /// @dev The worst visit completes when the call carries just the floor plus the cost of the
    /// reads before the loop.
    function test_gas_theFloorIsEnoughForTheWorstVisit() public {
        address wallet = _wallet(1);
        vm.prank(wallet);
        manager.setPlanClaimConsent(true);
        _create(_wallet(2), 25, 0.001 ether, false);
        _create(wallet, 25, 0.001 ether, true);
        plan.executePlans(2);
        _lockAndRequest();
        _settle(1, _findOutput(3, false));

        assertEq(plan.executePlans{ gas: plan.MIN_GAS_PER_PLAN() + 150_000 }(1), 1);
        assertEq(plan.getPlan(wallet).lastRound, 2);
        assertEq(manager.getRound(2).totalEth, 25 * 0.001 ether);
    }

    function test_gas_fullBatchOfTwentyPlans_25Squares() public {
        for (uint256 i; i < 20; ++i) {
            _create(_wallet(i + 1), 25, 0.001 ether, false);
        }
        uint256 used = _gasOf(20);
        emit log_named_uint("batch of 20 plans, 25 squares each", used);
        emit log_named_uint("average per plan", used / 20);
        assertEq(plan.nextCursor(), 0);
        assertLt(used, 30_000_000);
    }
}
