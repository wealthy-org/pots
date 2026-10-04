// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { Test } from "forge-std/Test.sol";
import { Vm } from "forge-std/Vm.sol";
import { POTSToken } from "../../src/POTSToken.sol";
import { PotsAutoPlan } from "../../src/PotsAutoPlan.sol";
import { PotsRandomnessAdapter } from "../../src/PotsRandomnessAdapter.sol";
import { PotsRoundManager } from "../../src/PotsRoundManager.sol";
import { MockDiceCoordinator } from "../mocks/MockDiceCoordinator.sol";

/// @dev Drives plans, rounds, claims, pausing, and cancellations at random. The plan wallets never
/// enter by hand, so every entry of theirs came through `executePlans`.
contract PlanHandler is Test {
    address internal constant DICE_PROVIDER = address(0xD1CE);
    uint32 internal constant WINDOW = 60;
    uint256 internal constant ACTORS = 5;

    PotsRoundManager public manager;
    PotsAutoPlan public plan;
    MockDiceCoordinator public dice;
    address[] public actors;

    /// @dev Set when a call broke a rule that is checked at the moment of the call.
    string public violation;

    /// @dev How often each plan event happened, to show that the invariants run over real activity.
    uint256 public executed;
    uint256 public compounded;
    uint256 public finished;
    uint256 public skipped;
    mapping(address => uint256) internal lastRoundSeen;

    constructor() {
        dice = new MockDiceCoordinator(DICE_PROVIDER);
        POTSToken token = new POTSToken("POTS", "POTS", 1_000_000e18, address(this));
        PotsRandomnessAdapter adapter =
            new PotsRandomnessAdapter(address(dice), DICE_PROVIDER, 200_000, address(this));
        manager = new PotsRoundManager(
            address(token),
            address(adapter),
            address(this),
            900,
            100,
            9000,
            0.001 ether,
            1 ether,
            WINDOW,
            625,
            1e18,
            6,
            1 hours,
            1 days
        );
        token.setMinter(address(manager));
        adapter.setManager(address(manager));
        plan = new PotsAutoPlan(manager, 4, 0.002 ether);
        manager.setPlanContract(address(plan));
        for (uint256 i; i < ACTORS; ++i) {
            address actor = makeAddr(string(abi.encodePacked("planActor", i)));
            actors.push(actor);
            vm.deal(actor, 1_000 ether);
        }
        vm.deal(address(this), 100 ether);
        manager.fundTreasury{ value: 5 ether }();
    }

    function _actor(uint256 seed) internal view returns (address) {
        return actors[seed % ACTORS];
    }

    /// @dev One to four distinct squares: a start and a step that is not a multiple of 5.
    function _squares(uint256 seed) internal pure returns (uint8[] memory squares) {
        uint256 count = (seed % 4) + 1;
        uint256 start = (seed >> 8) % 25;
        uint256 step = ((seed >> 16) % 24) + 1;
        if (step % 5 == 0) {
            step += 1;
        }
        squares = new uint8[](count);
        for (uint256 i; i < count; ++i) {
            squares[i] = uint8(((start + i * step) % 25) + 1);
        }
    }

    function createPlan(
        uint256 actorSeed,
        uint256 squareSeed,
        uint96 amountSeed,
        uint8 roundSeed,
        bool loop
    ) external {
        address actor = _actor(actorSeed);
        uint8[] memory squares = _squares(squareSeed);
        uint256 amount = bound(amountSeed, 0.001 ether, 0.05 ether);
        uint16 rounds = uint16(bound(roundSeed, 1, 6));
        if (loop) {
            vm.prank(actor);
            manager.setPlanClaimConsent(true);
        }
        vm.prank(actor);
        try plan.createPlan{ value: uint256(rounds) * squares.length * amount }(
            squares, amount, rounds, loop
        ) { }
            catch { }
    }

    function cancelPlan(uint256 actorSeed) external {
        address actor = _actor(actorSeed);
        PotsAutoPlan.Plan memory before = plan.getPlan(actor);
        uint256 balanceBefore = actor.balance;
        vm.prank(actor);
        try plan.cancelPlan() {
            if (actor.balance != balanceBefore + before.balance) {
                violation = "cancelPlan did not return exactly the plan balance";
            }
        } catch {
            if (before.active || before.balance != 0) {
                violation = "cancelPlan reverted for a plan that exists";
            }
        }
    }

    function setLoop(uint256 actorSeed, bool loop) external {
        vm.prank(_actor(actorSeed));
        try plan.setLoop(loop) { } catch { }
    }

    function setConsent(uint256 actorSeed, bool allowed) external {
        vm.prank(_actor(actorSeed));
        manager.setPlanClaimConsent(allowed);
    }

    function execute(uint256 maxCount) external {
        uint256 roundBefore = manager.currentRoundId();
        uint256[] memory lastBefore = new uint256[](ACTORS);
        uint256[] memory deposits = new uint256[](ACTORS * 2);
        for (uint256 i; i < ACTORS; ++i) {
            lastBefore[i] = plan.getPlan(actors[i]).lastRound;
            deposits[i * 2] = manager.getWalletRound(roundBefore, actors[i]).deposited;
            deposits[i * 2 + 1] = manager.getWalletRound(roundBefore + 1, actors[i]).deposited;
        }
        vm.recordLogs();
        try plan.executePlans(bound(maxCount, 1, 25)) { }
        catch {
            violation = "executePlans reverted";
            return;
        }
        _count(vm.getRecordedLogs());
        for (uint256 i; i < ACTORS; ++i) {
            uint256 last = plan.getPlan(actors[i]).lastRound;
            if (last < lastBefore[i]) {
                violation = "lastRound decreased";
            } else if (last != lastBefore[i]) {
                if (last != roundBefore && last != roundBefore + 1) {
                    violation = "a plan entered a round that is not the one being filled";
                } else if (deposits[i * 2 + (last - roundBefore)] != 0) {
                    violation = "a wallet entered one round twice through plans";
                }
            }
        }
    }

    function _count(Vm.Log[] memory logs) internal {
        for (uint256 i; i < logs.length; ++i) {
            bytes32 topic = logs[i].topics[0];
            if (topic == PotsAutoPlan.PlanExecuted.selector) {
                ++executed;
            } else if (topic == PotsAutoPlan.PlanCompounded.selector) {
                ++compounded;
            } else if (topic == PotsAutoPlan.PlanFinished.selector) {
                ++finished;
            } else if (topic == PotsAutoPlan.PlanSkipped.selector) {
                ++skipped;
            }
        }
    }

    function claimByHand(uint256 actorSeed, uint256 roundSeed) external {
        address actor = _actor(actorSeed);
        uint256 current = manager.currentRoundId();
        if (current == 0) {
            return;
        }
        vm.prank(actor);
        try manager.claimEth((roundSeed % current) + 1) { } catch { }
    }

    function togglePause(bool paused) external {
        if (paused) {
            manager.pause();
        } else {
            manager.unpause();
        }
    }

    function advanceRound(uint256 outputSeed, bool cancel) external {
        uint256 roundId = manager.currentRoundId();
        if (roundId == 0) {
            return;
        }
        PotsRoundManager.Round memory round = manager.getRound(roundId);
        if (round.phase == PotsRoundManager.Phase.OPEN) {
            vm.warp(block.timestamp + WINDOW + 1);
            manager.lock();
            round = manager.getRound(roundId);
        }
        if (round.phase == PotsRoundManager.Phase.LOCKED) {
            if (cancel) {
                vm.warp(block.timestamp + 1 hours);
                manager.cancelRound(roundId);
                return;
            }
            if (manager.treasuryBalance() < dice.fee()) {
                manager.fundTreasury{ value: 1 ether }();
            }
            manager.requestRandomness();
            round = manager.getRound(roundId);
        }
        if (round.phase == PotsRoundManager.Phase.RANDOMNESS_PENDING) {
            if (round.randomOutput == bytes32(0)) {
                dice.fulfill(
                    round.randomnessRequestId,
                    keccak256(abi.encodePacked("plan-output", outputSeed))
                );
            }
            manager.settle(roundId);
        }
    }

    function sumOfPlanBalances() external view returns (uint256 sum) {
        for (uint256 i; i < ACTORS; ++i) {
            sum += plan.getPlan(actors[i]).balance;
        }
    }

    function activeFlags() external view returns (uint256 flagged) {
        for (uint256 i; i < ACTORS; ++i) {
            if (plan.getPlan(actors[i]).active) {
                ++flagged;
            }
        }
    }
}

contract AutoPlanInvariantTest is Test {
    PlanHandler internal handler;
    PotsAutoPlan internal plan;
    PotsRoundManager internal manager;

    function setUp() public {
        handler = new PlanHandler();
        plan = handler.plan();
        manager = handler.manager();
        targetContract(address(handler));
    }

    /// @dev P1: the stored total equals the sum of the plans and the contract holds exactly that.
    /// forge-config: default.invariant.runs = 128
    /// forge-config: default.invariant.depth = 48
    function invariant_P1_planBalancesAreBacked() public view {
        assertEq(plan.totalPlanBalance(), handler.sumOfPlanBalances());
        assertEq(address(plan).balance, plan.totalPlanBalance());
        assertTrue(plan.planInvariantHolds());
    }

    /// @dev P2: the active list and the active flags agree, and the cap holds.
    function invariant_P2_activeListMatchesTheFlags() public view {
        uint256 count = plan.activePlanCount();
        assertEq(count, handler.activeFlags());
        assertLe(count, plan.maxActivePlans());
        for (uint256 i; i < count; ++i) {
            address wallet = plan.activeWalletAt(i);
            assertTrue(plan.getPlan(wallet).active);
            for (uint256 j = i + 1; j < count; ++j) {
                assertTrue(plan.activeWalletAt(j) != wallet);
            }
        }
    }

    /// @dev P3, P4, and the no-revert rule of `executePlans` are checked inside the handler.
    function invariant_P3_P4_handlerChecksHold() public view {
        assertEq(handler.violation(), "");
    }

    /// @dev A fixed sequence through the handler shows that entries, compounding, and finishing are
    /// reachable, so the invariants above are not checked over idle runs only. `PlanSkipped` needs a
    /// failing manager and is covered with `FaultyManager`.
    function test_handler_reachesEntriesCompoundingAndFinishing() public {
        uint256 loopSquare = 4 << 8;
        uint256 otherSquare = 9 << 8;
        handler.createPlan(0, loopSquare, 0.01 ether, 1, true);
        handler.createPlan(1, otherSquare, 0.01 ether, 6, false);
        handler.execute(25);
        assertEq(handler.executed(), 2);

        handler.advanceRound(_seedWinning(5), false);
        handler.execute(25);
        assertEq(handler.compounded(), 1);
        assertGe(handler.executed(), 4);

        handler.advanceRound(_seedWinning(10), false);
        handler.execute(25);
        assertGe(handler.finished(), 1);
        assertEq(handler.violation(), "");
        assertEq(address(plan).balance, plan.totalPlanBalance());
    }

    function _seedWinning(uint8 square) internal pure returns (uint256) {
        for (uint256 seed; seed < 10_000; ++seed) {
            bytes32 output = keccak256(abi.encodePacked("plan-output", seed));
            if (uint8((uint256(keccak256(abi.encodePacked(output, "SQUARE"))) % 25) + 1) == square)
            {
                return seed;
            }
        }
        revert("seed not found");
    }

    /// @dev The manager's own ETH invariant holds with plans, loops, pausing, and cancelled rounds.
    function invariant_managerEthBalance() public view {
        assertTrue(manager.invariantHolds());
    }
}
