// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { PotsRoundManager } from "./PotsRoundManager.sol";

/// @title PotsAutoPlan
/// @notice Holds a wallet's funded plan (the same squares and amount for a number of rounds) and
/// enters the rounds for it through `PotsRoundManager.enterFor`. It has no owner and no admin
/// function. A plan owner can always take the unspent balance back with `cancelPlan`.
contract PotsAutoPlan is ReentrancyGuard {
    uint16 public constant MAX_ROUNDS = 100;
    uint256 public constant MAX_BATCH = 20;
    /// @dev Gas of the worst successful visit (a claim into the plan plus an entry on 25 squares
    /// that also starts a round) times 64/63 with a margin. Measured at about 1.51 million gas in
    /// PotsAutoPlan.gas.t.sol.
    uint256 public constant MIN_GAS_PER_PLAN = 1_800_000;
    uint256 internal constant MAX_SQUARES = 25;

    struct Plan {
        uint32 squareMask;
        uint8 squareCount;
        uint128 amountPerSquare;
        uint16 roundsRemaining;
        bool loop;
        bool active;
        uint256 lastRound;
        uint256 balance;
    }

    PotsRoundManager public immutable manager;
    uint256 public immutable maxActivePlans;
    uint256 public immutable minPlanDeposit;

    mapping(address => Plan) internal plans;
    address[] internal activeWallets;
    mapping(address => uint256) internal activeIndex;

    uint256 public cursor;
    uint256 public cursorRound;
    uint256 public totalPlanBalance;

    error PlanExists();
    error NoPlan();
    error InvalidRounds();
    error InvalidSquares();
    error AmountBelowMinimum();
    error AmountAboveMaximum();
    error ValueMismatch();
    error DepositTooSmall();
    error ContractPaused();
    error PlanCapReached();
    error LoopNeedsConsent();
    error TransferFailed();
    error NotManager();
    error ZeroAddress();
    error InvalidConfig();
    error PlanNotRegistered();

    event PlanCreated(
        address indexed wallet,
        uint32 squareMask,
        uint256 amountPerSquare,
        uint16 rounds,
        bool loop,
        uint256 deposit
    );
    event PlanCancelled(address indexed wallet, uint256 refund);
    event PlanLoopSet(address indexed wallet, bool loop);
    event PlanExecuted(
        address indexed wallet, uint256 indexed roundId, uint256 cost, uint16 roundsRemaining
    );
    event PlanSkipped(address indexed wallet, bytes4 reason);
    event PlanCompounded(address indexed wallet, uint256 indexed roundId, uint256 amount);
    event PlanFinished(address indexed wallet, uint8 reason);

    uint8 internal constant FINISHED_COMPLETED = 1;
    uint8 internal constant FINISHED_INSUFFICIENT = 2;

    constructor(PotsRoundManager manager_, uint256 maxActivePlans_, uint256 minPlanDeposit_) {
        if (address(manager_) == address(0)) {
            revert ZeroAddress();
        }
        if (maxActivePlans_ == 0) {
            revert InvalidConfig();
        }
        manager = manager_;
        maxActivePlans = maxActivePlans_;
        minPlanDeposit = minPlanDeposit_;
    }

    /// @notice Accepts ETH only from the manager (a claim moved into a plan). No accounting here:
    /// `executePlans` credits the amount that `claimEthToPlan` returns.
    receive() external payable {
        if (msg.sender != address(manager)) {
            revert NotManager();
        }
    }

    /// @notice Funds and starts the caller's plan: the same squares and amount in each of the next
    /// `rounds` rounds. `msg.value` must equal rounds * squares * amountPerSquare.
    function createPlan(
        uint8[] calldata squareIds,
        uint256 amountPerSquare,
        uint16 rounds,
        bool loop
    ) external payable nonReentrant {
        Plan storage plan = plans[msg.sender];
        if (plan.active || plan.balance != 0) {
            revert PlanExists();
        }
        if (rounds == 0 || rounds > MAX_ROUNDS) {
            revert InvalidRounds();
        }
        uint256 count = squareIds.length;
        if (count == 0 || count > MAX_SQUARES) {
            revert InvalidSquares();
        }
        uint32 mask = 0;
        for (uint256 i; i < count; ++i) {
            uint8 square = squareIds[i];
            if (square == 0 || square > MAX_SQUARES) {
                revert InvalidSquares();
            }
            uint32 bit = uint32(1) << (square - 1);
            if (mask & bit != 0) {
                revert InvalidSquares();
            }
            mask |= bit;
        }
        if (amountPerSquare < manager.minEntryPerSquare()) {
            revert AmountBelowMinimum();
        }
        uint256 maxEntry = manager.maxEntryPerSquare();
        if ((maxEntry != 0 && amountPerSquare > maxEntry) || amountPerSquare > type(uint128).max) {
            revert AmountAboveMaximum();
        }
        if (msg.value != uint256(rounds) * count * amountPerSquare) {
            revert ValueMismatch();
        }
        if (msg.value < minPlanDeposit) {
            revert DepositTooSmall();
        }
        if (manager.paused()) {
            revert ContractPaused();
        }
        if (manager.planContract() != address(this)) {
            revert PlanNotRegistered();
        }
        if (activeWallets.length >= maxActivePlans) {
            revert PlanCapReached();
        }
        if (loop && !manager.planClaimConsent(msg.sender)) {
            revert LoopNeedsConsent();
        }

        plan.squareMask = mask;
        plan.squareCount = uint8(count);
        plan.amountPerSquare = uint128(amountPerSquare);
        plan.roundsRemaining = rounds;
        plan.loop = loop;
        plan.active = true;
        plan.balance = msg.value;
        activeWallets.push(msg.sender);
        activeIndex[msg.sender] = activeWallets.length;
        totalPlanBalance += msg.value;
        emit PlanCreated(msg.sender, mask, amountPerSquare, rounds, loop, msg.value);
    }

    /// @notice Ends the caller's plan, active or finished, and returns its whole balance.
    /// @dev Works while the manager is paused and depends on no other wallet. A wallet that
    /// rejects ETH can only lock its own balance.
    function cancelPlan() external nonReentrant {
        Plan storage plan = plans[msg.sender];
        if (!plan.active && plan.balance == 0) {
            revert NoPlan();
        }
        uint256 refund = plan.balance;
        if (plan.active) {
            _removeActive(msg.sender);
        }
        plan.active = false;
        plan.loop = false;
        plan.roundsRemaining = 0;
        plan.balance = 0;
        totalPlanBalance -= refund;
        emit PlanCancelled(msg.sender, refund);
        (bool ok,) = msg.sender.call{ value: refund }("");
        if (!ok) {
            revert TransferFailed();
        }
    }

    /// @notice Switches the loop of the caller's active plan. Turning it on needs the wallet's
    /// consent on the manager.
    function setLoop(bool loop) external nonReentrant {
        Plan storage plan = plans[msg.sender];
        if (!plan.active) {
            revert NoPlan();
        }
        if (loop && !manager.planClaimConsent(msg.sender)) {
            revert LoopNeedsConsent();
        }
        plan.loop = loop;
        emit PlanLoopSet(msg.sender, loop);
    }

    /// @notice Enters the round being filled for the active plans, from the last position of the
    /// active list down to 0, at most `min(maxCount, MAX_BATCH)` plans per call. Permissionless; the
    /// caller is not paid, the keeper's owner carries the gas.
    /// @dev Returns 0 without reverting while the manager is paused, while the round is LOCKED or
    /// RANDOMNESS_PENDING, or when an OPEN round is past its deadline.
    /// @return visited The number of plans looked at.
    function executePlans(uint256 maxCount) external nonReentrant returns (uint256 visited) {
        if (manager.paused()) {
            return 0;
        }
        uint256 roundId = manager.currentRoundId();
        PotsRoundManager.Round memory round = manager.getRound(roundId);
        PotsRoundManager.Phase phase = round.phase;
        if (phase == PotsRoundManager.Phase.OPEN) {
            if (block.timestamp >= round.closeAt) {
                return 0;
            }
        } else if (
            phase == PotsRoundManager.Phase.LOCKED
                || phase == PotsRoundManager.Phase.RANDOMNESS_PENDING
        ) {
            return 0;
        }
        uint256 target = _targetRound(roundId, phase);
        if (cursorRound != target) {
            cursorRound = target;
            cursor = activeWallets.length;
        }

        uint256 limit = maxCount < MAX_BATCH ? maxCount : MAX_BATCH;
        while (visited < limit) {
            uint256 length = activeWallets.length;
            if (cursor > length) {
                cursor = length;
            }
            if (cursor == 0 || gasleft() < MIN_GAS_PER_PLAN) {
                break;
            }
            uint256 position = cursor - 1;
            cursor = position;
            _visit(activeWallets[position], target);
            ++visited;
        }
    }

    /// @notice Positions still to visit for the round being filled. The keeper calls
    /// `executePlans` while this is above 0 and stops when a call visits nothing.
    function nextCursor() external view returns (uint256) {
        uint256 roundId = manager.currentRoundId();
        uint256 target = _targetRound(roundId, manager.getRound(roundId).phase);
        uint256 length = activeWallets.length;
        if (cursorRound != target) {
            return length;
        }
        return cursor < length ? cursor : length;
    }

    function getPlan(address wallet) external view returns (Plan memory) {
        return plans[wallet];
    }

    function activePlanCount() external view returns (uint256) {
        return activeWallets.length;
    }

    function activeWalletAt(uint256 index) external view returns (address) {
        return activeWallets[index];
    }

    /// @notice True while the contract holds at least the ETH that the plans own. A forced
    /// transfer can make the balance larger.
    function planInvariantHolds() external view returns (bool) {
        return address(this).balance >= totalPlanBalance;
    }

    function _targetRound(uint256 roundId, PotsRoundManager.Phase phase)
        internal
        pure
        returns (uint256)
    {
        if (
            roundId == 0 || phase == PotsRoundManager.Phase.SETTLED
                || phase == PotsRoundManager.Phase.CANCELLED
        ) {
            return roundId + 1;
        }
        return roundId;
    }

    function _visit(address wallet, uint256 target) internal {
        Plan storage plan = plans[wallet];
        if (plan.lastRound == target) {
            return;
        }
        // forge-lint: disable-next-line(calls-loop)
        if (plan.loop && plan.lastRound != 0 && manager.planClaimConsent(wallet)) {
            uint256 claimedRound = plan.lastRound;
            // forge-lint: disable-next-line(calls-loop, reentrancy-no-eth)
            try manager.claimEthToPlan(claimedRound, wallet) returns (uint256 amount) {
                plan.balance += amount;
                totalPlanBalance += amount;
                emit PlanCompounded(wallet, claimedRound, amount);
            } catch { }
        }

        uint256 cost = uint256(plan.squareCount) * plan.amountPerSquare;
        if (plan.roundsRemaining == 0 && !plan.loop) {
            _finish(wallet, plan, FINISHED_COMPLETED);
            return;
        }
        if (plan.balance < cost) {
            _finish(wallet, plan, FINISHED_INSUFFICIENT);
            return;
        }

        // forge-lint: disable-start(calls-loop)
        try manager.enterFor{ value: cost }(
            wallet, _squares(plan.squareMask, plan.squareCount), plan.amountPerSquare
        ) returns (
            uint256 roundId
        ) {
            plan.balance -= cost;
            totalPlanBalance -= cost;
            if (plan.roundsRemaining > 0) {
                plan.roundsRemaining -= 1;
            }
            plan.lastRound = roundId;
            emit PlanExecuted(wallet, roundId, cost, plan.roundsRemaining);
        } catch (bytes memory reason) {
            emit PlanSkipped(wallet, reason.length < 4 ? bytes4(0) : bytes4(reason));
        }
        // forge-lint: disable-end
    }

    function _finish(address wallet, Plan storage plan, uint8 reason) internal {
        plan.active = false;
        _removeActive(wallet);
        emit PlanFinished(wallet, reason);
    }

    function _removeActive(address wallet) internal {
        uint256 index = activeIndex[wallet] - 1;
        uint256 lastIndex = activeWallets.length - 1;
        if (index != lastIndex) {
            address moved = activeWallets[lastIndex];
            activeWallets[index] = moved;
            activeIndex[moved] = index + 1;
        }
        activeWallets.pop();
        activeIndex[wallet] = 0;
    }

    function _squares(uint32 mask, uint8 count) internal pure returns (uint8[] memory squares) {
        squares = new uint8[](count);
        uint256 filled = 0;
        for (uint8 square = 1; square <= MAX_SQUARES && filled < count; ++square) {
            if (mask & (uint32(1) << (square - 1)) != 0) {
                squares[filled++] = square;
            }
        }
    }
}
