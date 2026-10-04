// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IPotsRandomnessAdapter } from "./interfaces/IPotsRandomnessAdapter.sol";
import { POTSToken } from "./POTSToken.sol";

contract PotsRoundManager is Ownable2Step, ReentrancyGuard {
    uint256 public constant MAX_SQUARES = 25;
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint8 public constant CLAIM_KIND_ETH = 0;
    uint8 public constant CLAIM_KIND_POTS = 1;
    uint256 public constant MIN_ESCAPE_DELAY = 10 minutes;

    enum Phase {
        NONE,
        WAITING,
        OPEN,
        LOCKED,
        RANDOMNESS_PENDING,
        SETTLED,
        CANCELLED
    }

    struct Round {
        Phase phase;
        uint64 closeAt;
        uint64 requestedAtBlock;
        uint64 settledAt;
        uint8 winningSquare;
        uint64 randomnessRequestId;
        bool jackpotHit;
        bool randomnessRefunded;
        uint256 totalEth;
        uint256 rolloverIn;
        uint256 randomnessFee;
        uint256 winningSquareEth;
        uint256 payoutPool;
        uint256 jackpotPaidAmount;
        uint256 roundingDust;
        bytes32 randomOutput;
    }

    struct WalletRound {
        uint256 deposited;
        bool ethClaimed;
        bool potsClaimed;
    }

    POTSToken public immutable token;
    IPotsRandomnessAdapter public immutable adapter;

    uint16 public immutable treasuryBps;
    uint16 public immutable jackpotBps;
    uint16 public immutable payoutBps;
    uint256 public immutable minEntryPerSquare;
    uint256 public immutable maxEntryPerSquare;
    uint32 public immutable roundWindow;
    uint256 public immutable jackpotChanceDenominator;
    uint256 public immutable potEmissionPerRound;
    uint256 public immutable randomnessRefundDelayBlocks;
    uint256 public immutable lockedCancelDelay;
    uint256 public immutable forceCancelDelay;

    uint256 public currentRoundId;
    bool public paused;

    mapping(uint256 => Round) internal rounds;
    mapping(uint256 => uint64) public lockedAtTime;
    mapping(uint256 => uint64) public requestedAtTime;
    mapping(uint256 => mapping(uint8 => mapping(address => uint256))) public entries;
    mapping(uint256 => mapping(uint8 => uint256)) public squareTotals;
    mapping(uint256 => mapping(address => WalletRound)) internal walletRounds;

    uint256 public totalUnsettledDeposits;
    uint256 public totalUnclaimedEth;
    uint256 public rolloverBalance;
    uint256 public jackpotBalance;
    uint256 public treasuryBalance;
    uint256 public totalDust;

    /// @notice The plan contract allowed to call enterFor and claimEthToPlan. Set once.
    address public planContract;
    /// @notice A wallet's own permission for the plan contract to move its ETH winnings into its plan.
    mapping(address => bool) public planClaimConsent;

    error NotOpen();
    error RoundClosed();
    error InvalidSquares();
    error AmountBelowMinimum();
    error AmountAboveMaximum();
    error ValueMismatch();
    error ContractPaused();
    error NotLockable();
    error WrongPhase();
    error RandomnessAlreadyRequested();
    error NotRequested();
    error RefundTooEarly();
    error NotCoordinator();
    error AlreadySettled();
    error NothingToClaim();
    error AlreadyClaimed();
    error TransferFailed();
    error Unauthorized();
    error CancelNotAllowed();
    error InsufficientTreasury();
    error ZeroAddress();
    error InvalidDelay();
    error RenounceDisabled();
    error NotPlanContract();
    error PlanContractAlreadySet();
    error NoClaimConsent();
    error PlanContractNotSet();

    event RoundOpened(uint256 indexed roundId, uint256 rolloverIn);
    event EntryPlaced(
        uint256 indexed roundId,
        address indexed wallet,
        uint8[] squareIds,
        uint256 amountPerSquare,
        uint256 total
    );
    event RoundLocked(uint256 indexed roundId, uint64 closeAt);
    event RandomnessRequested(uint256 indexed roundId, uint64 sequence, uint256 requestedAtBlock);
    event RandomnessFulfilled(uint256 indexed roundId, uint64 sequence, bytes32 output);
    event RandomnessRefunded(uint256 indexed roundId, uint64 sequence, uint256 fee);
    event RoundSettled(
        uint256 indexed roundId,
        uint8 winningSquare,
        uint256 totalEth,
        uint256 winningSquareEth,
        uint256 pool,
        uint256 rolloverOut,
        bool jackpotHit
    );
    event RewardAllocated(
        uint256 indexed roundId, address indexed wallet, uint256 eth, uint256 pots
    );
    event RewardClaimed(
        uint256 indexed roundId, address indexed wallet, uint8 kind, uint256 amount
    );
    event JackpotContributed(uint256 indexed roundId, uint256 amount);
    event JackpotPaid(uint256 indexed roundId, uint256 amount);
    event RoundCancelled(uint256 indexed roundId);
    event RefundClaimed(uint256 indexed roundId, address indexed wallet, uint256 amount);
    event TreasuryWithdrawn(address indexed to, uint256 amount);
    event TreasuryFunded(address indexed from, uint256 amount);
    event PausedSet(bool paused);
    event PlanContractSet(address indexed plan);
    event PlanClaimConsentSet(address indexed wallet, bool allowed);

    constructor(
        address token_,
        address adapter_,
        address owner_,
        uint16 treasuryBps_,
        uint16 jackpotBps_,
        uint16 payoutBps_,
        uint256 minEntryPerSquare_,
        uint256 maxEntryPerSquare_,
        uint32 roundWindow_,
        uint256 jackpotChanceDenominator_,
        uint256 potEmissionPerRound_,
        uint256 randomnessRefundDelayBlocks_,
        uint256 lockedCancelDelay_,
        uint256 forceCancelDelay_
    ) Ownable(owner_) {
        if (token_ == address(0) || adapter_ == address(0)) {
            revert ZeroAddress();
        }
        require(uint256(treasuryBps_) + jackpotBps_ + payoutBps_ == BPS_DENOMINATOR, "bps");
        if (lockedCancelDelay_ < MIN_ESCAPE_DELAY || forceCancelDelay_ < lockedCancelDelay_) {
            revert InvalidDelay();
        }
        token = POTSToken(token_);
        adapter = IPotsRandomnessAdapter(adapter_);
        treasuryBps = treasuryBps_;
        jackpotBps = jackpotBps_;
        payoutBps = payoutBps_;
        minEntryPerSquare = minEntryPerSquare_;
        maxEntryPerSquare = maxEntryPerSquare_;
        roundWindow = roundWindow_;
        jackpotChanceDenominator = jackpotChanceDenominator_;
        potEmissionPerRound = potEmissionPerRound_;
        randomnessRefundDelayBlocks = randomnessRefundDelayBlocks_;
        lockedCancelDelay = lockedCancelDelay_;
        forceCancelDelay = forceCancelDelay_;
    }

    /// @notice Disabled: renouncing would lock the treasury and remove the ability to pause.
    /// @dev Ownership moves only through the two-step `transferOwnership` and `acceptOwnership`.
    function renounceOwnership() public view override onlyOwner {
        revert RenounceDisabled();
    }

    modifier onlyAdapter() {
        if (msg.sender != address(adapter)) {
            revert NotCoordinator();
        }
        _;
    }

    /// @notice Accepts ETH only from the randomness adapter (a refunded provider fee).
    receive() external payable {
        if (msg.sender != address(adapter)) {
            revert Unauthorized();
        }
    }

    /// @notice Stops new entries. Claims, refunds, settlement, and cancellation stay available.
    /// @dev Owner only.
    function pause() external onlyOwner {
        paused = true;
        emit PausedSet(true);
    }

    /// @notice Resumes new entries.
    /// @dev Owner only.
    function unpause() external onlyOwner {
        paused = false;
        emit PausedSet(false);
    }

    /// @notice Adds ETH to the treasury that pays randomness fees. Anyone may call it.
    function fundTreasury() external payable {
        treasuryBalance += msg.value;
        emit TreasuryFunded(msg.sender, msg.value);
    }

    /// @notice Opens the next round in WAITING, carrying the rollover balance.
    /// @dev Permissionless. Requires the previous round to be SETTLED or CANCELLED.
    function startNextRound() external {
        _startNextRound();
    }

    function _startNextRound() internal returns (uint256 next) {
        uint256 previous = currentRoundId;
        if (previous != 0) {
            Phase previousPhase = rounds[previous].phase;
            if (previousPhase != Phase.SETTLED && previousPhase != Phase.CANCELLED) {
                revert WrongPhase();
            }
        }
        next = previous + 1;
        currentRoundId = next;
        Round storage round = rounds[next];
        round.phase = Phase.WAITING;
        round.rolloverIn = rolloverBalance;
        emit RoundOpened(next, rolloverBalance);
    }

    /// @notice Places the same amount on each listed square (1 to 25, no duplicates).
    /// @dev The first entry opens the round and sets its deadline. When the previous round is
    /// SETTLED or CANCELLED (or none exists) the next round is started first. msg.value must equal
    /// squareIds.length * amountPerSquare. Reverts when paused or after the deadline.
    function enter(uint8[] calldata squareIds, uint256 amountPerSquare)
        external
        payable
        nonReentrant
    {
        _enter(msg.sender, squareIds, amountPerSquare);
    }

    /// @notice Same as `enter`, for another wallet, funded by msg.value.
    /// @dev Only the registered plan contract. The entry, the claim, and the events belong to `wallet`.
    function enterFor(address wallet, uint8[] calldata squareIds, uint256 amountPerSquare)
        external
        payable
        nonReentrant
        returns (uint256)
    {
        if (msg.sender != planContract) {
            revert NotPlanContract();
        }
        if (wallet == address(0)) {
            revert ZeroAddress();
        }
        return _enter(wallet, squareIds, amountPerSquare);
    }

    function _enter(address wallet, uint8[] calldata squareIds, uint256 amountPerSquare)
        internal
        returns (uint256 roundId)
    {
        if (paused) {
            revert ContractPaused();
        }
        if (amountPerSquare < minEntryPerSquare) {
            revert AmountBelowMinimum();
        }
        if (maxEntryPerSquare != 0 && amountPerSquare > maxEntryPerSquare) {
            revert AmountAboveMaximum();
        }
        uint256 count = squareIds.length;
        if (count == 0) {
            revert InvalidSquares();
        }
        if (msg.value != count * amountPerSquare) {
            revert ValueMismatch();
        }

        roundId = currentRoundId;
        Phase currentPhase = rounds[roundId].phase;
        if (roundId == 0 || currentPhase == Phase.SETTLED || currentPhase == Phase.CANCELLED) {
            roundId = _startNextRound();
        }
        Round storage round = rounds[roundId];
        if (round.phase == Phase.WAITING) {
            round.phase = Phase.OPEN;
            round.closeAt = uint64(block.timestamp) + roundWindow;
        } else if (round.phase != Phase.OPEN) {
            revert NotOpen();
        }
        if (block.timestamp >= round.closeAt) {
            revert RoundClosed();
        }

        uint256 total = 0;
        for (uint256 i; i < count; ++i) {
            uint8 square = squareIds[i];
            if (square == 0 || square > MAX_SQUARES) {
                revert InvalidSquares();
            }
            for (uint256 j; j < i; ++j) {
                if (squareIds[j] == square) {
                    revert InvalidSquares();
                }
            }
            entries[roundId][square][wallet] += amountPerSquare;
            squareTotals[roundId][square] += amountPerSquare;
            total += amountPerSquare;
        }

        round.totalEth += total;
        walletRounds[roundId][wallet].deposited += total;
        totalUnsettledDeposits += total;
        emit EntryPlaced(roundId, wallet, squareIds, amountPerSquare, total);
    }

    /// @notice Locks an OPEN round once its deadline has passed and records the lock time.
    /// @dev Permissionless.
    function lock() external {
        uint256 roundId = currentRoundId;
        Round storage round = rounds[roundId];
        if (round.phase != Phase.OPEN) {
            revert WrongPhase();
        }
        if (block.timestamp < round.closeAt) {
            revert NotLockable();
        }
        round.phase = Phase.LOCKED;
        lockedAtTime[roundId] = uint64(block.timestamp);
        emit RoundLocked(roundId, round.closeAt);
    }

    /// @notice Requests one random output for the LOCKED round and pays the provider fee from the treasury.
    /// @dev Permissionless. Reverts when the treasury cannot cover the fee or the provider rejects it.
    function requestRandomness() external nonReentrant {
        uint256 roundId = currentRoundId;
        Round storage round = rounds[roundId];
        if (round.phase != Phase.LOCKED) {
            revert WrongPhase();
        }
        if (round.randomnessRequestId != 0) {
            revert RandomnessAlreadyRequested();
        }
        uint256 fee = adapter.quoteFee();
        if (treasuryBalance < fee) {
            revert InsufficientTreasury();
        }
        treasuryBalance -= fee;
        round.randomnessFee = fee;
        bytes32 userRandom = keccak256(abi.encodePacked(roundId, msg.sender, address(this)));
        uint64 sequence = adapter.requestRandomness{ value: fee }(roundId, userRandom);
        round.randomnessRequestId = sequence;
        round.requestedAtBlock = uint64(block.number);
        requestedAtTime[roundId] = uint64(block.timestamp);
        round.phase = Phase.RANDOMNESS_PENDING;
        emit RandomnessRequested(roundId, sequence, block.number);
    }

    /// @notice Stores the single accepted random output for a pending round.
    /// @dev Callable only by the adapter. A second output for the same round reverts.
    function onRandomnessFulfilled(uint256 roundId, bytes32 output) external onlyAdapter {
        Round storage round = rounds[roundId];
        if (round.phase != Phase.RANDOMNESS_PENDING) {
            revert WrongPhase();
        }
        if (round.randomOutput != bytes32(0)) {
            revert AlreadySettled();
        }
        round.randomOutput = output;
        emit RandomnessFulfilled(roundId, round.randomnessRequestId, output);
    }

    /// @notice Settles a pending round whose output arrived: picks the winning square, splits fees,
    /// and fixes each winner's claimable share.
    /// @dev Permissionless. With no ETH on the winning square the payout rolls over.
    function settle(uint256 roundId) external nonReentrant {
        Round storage round = rounds[roundId];
        if (round.phase != Phase.RANDOMNESS_PENDING) {
            revert WrongPhase();
        }
        if (round.randomOutput == bytes32(0)) {
            revert NotRequested();
        }

        uint256 totalEth = round.totalEth;
        uint256 treasuryShare = (totalEth * treasuryBps) / BPS_DENOMINATOR;
        uint256 jackpotShare = (totalEth * jackpotBps) / BPS_DENOMINATOR;
        uint256 payout = (totalEth * payoutBps) / BPS_DENOMINATOR;
        uint256 dust = totalEth - treasuryShare - jackpotShare - payout;

        totalUnsettledDeposits -= totalEth;
        treasuryBalance += treasuryShare;
        jackpotBalance += jackpotShare;
        totalDust += dust;
        round.roundingDust = dust;

        uint8 winningSquare = uint8(
            (uint256(keccak256(abi.encodePacked(round.randomOutput, "SQUARE"))) % MAX_SQUARES) + 1
        );
        round.winningSquare = winningSquare;
        round.winningSquareEth = squareTotals[roundId][winningSquare];
        round.settledAt = uint64(block.timestamp);
        emit JackpotContributed(roundId, jackpotShare);

        uint256 rolloverOut = 0;
        if (round.winningSquareEth == 0) {
            rolloverBalance += payout;
            rolloverOut = payout;
        } else {
            uint256 pool = payout + round.rolloverIn;
            if (round.rolloverIn != 0) {
                rolloverBalance -= round.rolloverIn;
            }
            bool jackpotHit = uint256(keccak256(abi.encodePacked(round.randomOutput, "JACKPOT")))
                    % jackpotChanceDenominator == 0;
            round.jackpotHit = jackpotHit;
            uint256 jackpotPaid = 0;
            if (jackpotHit) {
                jackpotPaid = jackpotBalance;
                jackpotBalance = 0;
                round.jackpotPaidAmount = jackpotPaid;
                emit JackpotPaid(roundId, jackpotPaid);
            }
            round.payoutPool = pool;
            totalUnclaimedEth += pool + jackpotPaid;
        }

        round.phase = Phase.SETTLED;
        emit RoundSettled(
            roundId,
            winningSquare,
            totalEth,
            round.winningSquareEth,
            round.winningSquareEth == 0 ? 0 : round.payoutPool,
            rolloverOut,
            round.jackpotHit
        );
    }

    /// @notice Recovers the provider fee after randomnessRefundDelayBlocks blocks without an output.
    /// @dev Permissionless. Marks the round as refunded so it can be cancelled.
    function refundRandomness(uint256 roundId) external nonReentrant {
        Round storage round = rounds[roundId];
        if (round.phase != Phase.RANDOMNESS_PENDING) {
            revert WrongPhase();
        }
        if (round.randomOutput != bytes32(0)) {
            revert AlreadySettled();
        }
        if (round.randomnessRefunded) {
            revert AlreadySettled();
        }
        if (block.number < uint256(round.requestedAtBlock) + randomnessRefundDelayBlocks) {
            revert RefundTooEarly();
        }
        round.randomnessRefunded = true;
        uint256 fee = round.randomnessFee;
        round.randomnessFee = 0;
        adapter.refundRandomness(roundId);
        treasuryBalance += fee;
        emit RandomnessRefunded(roundId, round.randomnessRequestId, fee);
    }

    /// @notice Cancels a round that cannot settle and makes every entry refundable in full.
    /// @dev Permissionless. Allowed when the round is LOCKED for lockedCancelDelay seconds, or
    /// PENDING without output and either refunded or forceCancelDelay seconds after the request.
    function cancelRound(uint256 roundId) external nonReentrant {
        Round storage round = rounds[roundId];
        if (round.phase == Phase.LOCKED) {
            if (block.timestamp < uint256(lockedAtTime[roundId]) + lockedCancelDelay) {
                revert CancelNotAllowed();
            }
        } else if (round.phase == Phase.RANDOMNESS_PENDING) {
            if (round.randomOutput != bytes32(0)) {
                revert AlreadySettled();
            }
            bool timedOut = block.timestamp >= uint256(requestedAtTime[roundId]) + forceCancelDelay;
            if (!round.randomnessRefunded && !timedOut) {
                revert CancelNotAllowed();
            }
        } else {
            revert WrongPhase();
        }
        round.phase = Phase.CANCELLED;
        totalUnsettledDeposits -= round.totalEth;
        totalUnclaimedEth += round.totalEth;
        emit RoundCancelled(roundId);
    }

    /// @notice Pulls the caller's ETH payout for a settled round, or the refund for a cancelled one.
    /// @dev Sets the claimed flag before sending ETH. A failing transfer reverts only this claim.
    function claimEth(uint256 roundId) external nonReentrant {
        uint256 owed = _claimEth(roundId, msg.sender);
        (bool ok,) = msg.sender.call{ value: owed }("");
        if (!ok) {
            revert TransferFailed();
        }
    }

    /// @notice Like `claimEth` for `wallet`, but the ETH goes to the plan contract (loop).
    /// @dev Only the registered plan contract, and only when the wallet allowed it with
    /// `setPlanClaimConsent`. Returns the amount sent.
    function claimEthToPlan(uint256 roundId, address wallet)
        external
        nonReentrant
        returns (uint256 owed)
    {
        if (msg.sender != planContract) {
            revert NotPlanContract();
        }
        if (!planClaimConsent[wallet]) {
            revert NoClaimConsent();
        }
        owed = _claimEth(roundId, wallet);
        (bool ok,) = msg.sender.call{ value: owed }("");
        if (!ok) {
            revert TransferFailed();
        }
    }

    function _claimEth(uint256 roundId, address wallet) internal returns (uint256 owed) {
        Round storage round = rounds[roundId];
        WalletRound storage walletRound = walletRounds[roundId][wallet];
        if (walletRound.ethClaimed) {
            revert AlreadyClaimed();
        }

        bool isRefund = false;
        if (round.phase == Phase.CANCELLED) {
            owed = walletRound.deposited;
            isRefund = true;
        } else if (round.phase == Phase.SETTLED) {
            uint256 entry = entries[roundId][round.winningSquare][wallet];
            if (entry == 0) {
                revert NothingToClaim();
            }
            owed = (round.payoutPool * entry) / round.winningSquareEth
                + (round.jackpotPaidAmount * entry) / round.winningSquareEth;
        } else {
            revert WrongPhase();
        }
        if (owed == 0) {
            revert NothingToClaim();
        }

        walletRound.ethClaimed = true;
        totalUnclaimedEth -= owed;
        emit RewardAllocated(roundId, wallet, owed, 0);
        if (isRefund) {
            emit RefundClaimed(roundId, wallet, owed);
        } else {
            emit RewardClaimed(roundId, wallet, CLAIM_KIND_ETH, owed);
        }
    }

    /// @notice Registers the plan contract once. There is no way to change or clear it.
    /// @dev Owner only.
    function setPlanContract(address plan) external onlyOwner {
        if (plan == address(0)) {
            revert ZeroAddress();
        }
        if (planContract != address(0)) {
            revert PlanContractAlreadySet();
        }
        planContract = plan;
        emit PlanContractSet(plan);
    }

    /// @notice The caller allows (or stops allowing) the plan contract to move its ETH winnings
    /// into its plan balance. Claims by hand are never blocked. Consent can be given only after the
    /// plan contract is registered, so the wallet always knows who it is allowing.
    function setPlanClaimConsent(bool allowed) external {
        if (allowed && planContract == address(0)) {
            revert PlanContractNotSet();
        }
        planClaimConsent[msg.sender] = allowed;
        emit PlanClaimConsentSet(msg.sender, allowed);
    }

    /// @notice Mints the caller's POTS share for a settled round.
    function claimPots(uint256 roundId) external nonReentrant {
        Round storage round = rounds[roundId];
        if (round.phase != Phase.SETTLED) {
            revert WrongPhase();
        }
        WalletRound storage walletRound = walletRounds[roundId][msg.sender];
        if (walletRound.potsClaimed) {
            revert AlreadyClaimed();
        }
        uint256 entry = entries[roundId][round.winningSquare][msg.sender];
        if (entry == 0) {
            revert NothingToClaim();
        }
        uint256 pots = (potEmissionPerRound * entry) / round.winningSquareEth;
        if (pots == 0) {
            revert NothingToClaim();
        }
        walletRound.potsClaimed = true;
        emit RewardAllocated(roundId, msg.sender, 0, pots);
        emit RewardClaimed(roundId, msg.sender, CLAIM_KIND_POTS, pots);
        token.mint(msg.sender, pots);
    }

    /// @notice Withdraws accrued fees from the treasury balance.
    /// @dev Owner only. Cannot touch deposits, unclaimed payouts, rollover, jackpot, or dust.
    function withdrawTreasury(address to, uint256 amount) external nonReentrant onlyOwner {
        if (to == address(0)) {
            revert ZeroAddress();
        }
        if (amount > treasuryBalance) {
            revert InsufficientTreasury();
        }
        treasuryBalance -= amount;
        emit TreasuryWithdrawn(to, amount);
        (bool ok,) = to.call{ value: amount }("");
        if (!ok) {
            revert TransferFailed();
        }
    }

    /// @notice Returns all stored fields of a round.
    function getRound(uint256 roundId) external view returns (Round memory) {
        return rounds[roundId];
    }

    /// @notice Returns the ETH on each of the 25 squares of a round (index 0 is square 1).
    function getSquareTotals(uint256 roundId) external view returns (uint256[25] memory totals) {
        for (uint8 square = 1; square <= MAX_SQUARES; ++square) {
            totals[square - 1] = squareTotals[roundId][square];
        }
    }

    /// @notice Returns the amount a wallet placed on one square of a round.
    function getEntry(uint256 roundId, uint8 squareId, address wallet)
        external
        view
        returns (uint256)
    {
        return entries[roundId][squareId][wallet];
    }

    /// @notice Returns a wallet's deposit and claim flags for a round.
    function getWalletRound(uint256 roundId, address wallet)
        external
        view
        returns (WalletRound memory)
    {
        return walletRounds[roundId][wallet];
    }

    /// @notice Returns the ETH (or refund) and POTS a wallet can still claim for a round.
    function getClaimable(uint256 roundId, address wallet)
        external
        view
        returns (uint256 eth, uint256 pots)
    {
        Round storage round = rounds[roundId];
        WalletRound storage walletRound = walletRounds[roundId][wallet];
        if (round.phase == Phase.CANCELLED) {
            if (!walletRound.ethClaimed) {
                eth = walletRound.deposited;
            }
        } else if (round.phase == Phase.SETTLED) {
            uint256 entry = entries[roundId][round.winningSquare][wallet];
            if (entry > 0) {
                if (!walletRound.ethClaimed) {
                    eth = (round.payoutPool * entry) / round.winningSquareEth
                        + (round.jackpotPaidAmount * entry) / round.winningSquareEth;
                }
                if (!walletRound.potsClaimed) {
                    pots = (potEmissionPerRound * entry) / round.winningSquareEth;
                }
            }
        }
    }

    /// @notice Returns the rollover, jackpot, and treasury balances.
    function balances()
        external
        view
        returns (uint256 rollover, uint256 jackpot, uint256 treasury)
    {
        return (rolloverBalance, jackpotBalance, treasuryBalance);
    }

    /// @notice Returns every accounted balance that the contract's ETH must cover.
    function accounting()
        external
        view
        returns (
            uint256 unsettled,
            uint256 unclaimed,
            uint256 rollover,
            uint256 jackpot,
            uint256 treasury,
            uint256 dust
        )
    {
        return (
            totalUnsettledDeposits,
            totalUnclaimedEth,
            rolloverBalance,
            jackpotBalance,
            treasuryBalance,
            totalDust
        );
    }

    /// @notice True when the contract's ETH covers every accounted balance.
    /// @dev Uses >= because ETH can be forced in, which only raises the balance.
    function invariantHolds() external view returns (bool) {
        return address(this).balance
            >= totalUnsettledDeposits + totalUnclaimedEth + rolloverBalance + jackpotBalance
                + treasuryBalance + totalDust;
    }
}
