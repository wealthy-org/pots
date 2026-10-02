// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IPotsRandomnessAdapter } from "./interfaces/IPotsRandomnessAdapter.sol";
import { POTSToken } from "./POTSToken.sol";

contract PotsRoundManager is Ownable, ReentrancyGuard {
    uint256 public constant MAX_SQUARES = 25;
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint8 public constant CLAIM_KIND_ETH = 0;
    uint8 public constant CLAIM_KIND_POTS = 1;

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

    uint256 public currentRoundId;
    bool public paused;

    mapping(uint256 => Round) internal rounds;
    mapping(uint256 => mapping(uint8 => mapping(address => uint256))) public entries;
    mapping(uint256 => mapping(uint8 => uint256)) public squareTotals;
    mapping(uint256 => mapping(address => WalletRound)) internal walletRounds;

    uint256 public totalUnsettledDeposits;
    uint256 public totalUnclaimedEth;
    uint256 public rolloverBalance;
    uint256 public jackpotBalance;
    uint256 public treasuryBalance;
    uint256 public totalDust;

    error NotOpen();
    error RoundClosed();
    error InvalidSquares();
    error AmountBelowMinimum();
    error AmountAboveMaximum();
    error ValueMismatch();
    error ContractPaused();
    error UnknownRound();
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
    error EmissionExhausted();
    error Unauthorized();
    error CancelNotAllowed();
    error InsufficientTreasury();
    error ZeroAddress();

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
        uint256 randomnessRefundDelayBlocks_
    ) Ownable(owner_) {
        if (token_ == address(0) || adapter_ == address(0)) {
            revert ZeroAddress();
        }
        require(uint256(treasuryBps_) + jackpotBps_ + payoutBps_ == BPS_DENOMINATOR, "bps");
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
    }

    modifier onlyAdapter() {
        if (msg.sender != address(adapter)) {
            revert NotCoordinator();
        }
        _;
    }

    receive() external payable {
        if (msg.sender != address(adapter)) {
            revert Unauthorized();
        }
    }

    function pause() external onlyOwner {
        paused = true;
        emit PausedSet(true);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit PausedSet(false);
    }

    function fundTreasury() external payable {
        treasuryBalance += msg.value;
        emit TreasuryFunded(msg.sender, msg.value);
    }

    function startNextRound() external {
        uint256 previous = currentRoundId;
        if (previous != 0) {
            Phase previousPhase = rounds[previous].phase;
            if (previousPhase != Phase.SETTLED && previousPhase != Phase.CANCELLED) {
                revert WrongPhase();
            }
        }
        uint256 next = previous + 1;
        currentRoundId = next;
        Round storage round = rounds[next];
        round.phase = Phase.WAITING;
        round.rolloverIn = rolloverBalance;
        emit RoundOpened(next, rolloverBalance);
    }

    function enter(uint8[] calldata squareIds, uint256 amountPerSquare)
        external
        payable
        nonReentrant
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

        uint256 roundId = currentRoundId;
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
            entries[roundId][square][msg.sender] += amountPerSquare;
            squareTotals[roundId][square] += amountPerSquare;
            total += amountPerSquare;
        }

        round.totalEth += total;
        walletRounds[roundId][msg.sender].deposited += total;
        totalUnsettledDeposits += total;
        emit EntryPlaced(roundId, msg.sender, squareIds, amountPerSquare, total);
    }

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
        emit RoundLocked(roundId, round.closeAt);
    }

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
        round.phase = Phase.RANDOMNESS_PENDING;
        emit RandomnessRequested(roundId, sequence, block.number);
    }

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

    function cancelRound(uint256 roundId) external nonReentrant {
        Round storage round = rounds[roundId];
        if (round.phase != Phase.RANDOMNESS_PENDING) {
            revert WrongPhase();
        }
        if (round.randomOutput != bytes32(0)) {
            revert AlreadySettled();
        }
        if (!round.randomnessRefunded) {
            revert CancelNotAllowed();
        }
        round.phase = Phase.CANCELLED;
        totalUnsettledDeposits -= round.totalEth;
        totalUnclaimedEth += round.totalEth;
        emit RoundCancelled(roundId);
    }

    function claimEth(uint256 roundId) external nonReentrant {
        Round storage round = rounds[roundId];
        WalletRound storage walletRound = walletRounds[roundId][msg.sender];
        if (walletRound.ethClaimed) {
            revert AlreadyClaimed();
        }

        uint256 owed;
        bool isRefund = false;
        if (round.phase == Phase.CANCELLED) {
            owed = walletRound.deposited;
            isRefund = true;
        } else if (round.phase == Phase.SETTLED) {
            uint256 entry = entries[roundId][round.winningSquare][msg.sender];
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
        emit RewardAllocated(roundId, msg.sender, owed, 0);
        if (isRefund) {
            emit RefundClaimed(roundId, msg.sender, owed);
        } else {
            emit RewardClaimed(roundId, msg.sender, CLAIM_KIND_ETH, owed);
        }
        (bool ok,) = msg.sender.call{ value: owed }("");
        if (!ok) {
            revert TransferFailed();
        }
    }

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

    function getRound(uint256 roundId) external view returns (Round memory) {
        return rounds[roundId];
    }

    function getSquareTotals(uint256 roundId) external view returns (uint256[25] memory totals) {
        for (uint8 square = 1; square <= MAX_SQUARES; ++square) {
            totals[square - 1] = squareTotals[roundId][square];
        }
    }

    function getEntry(uint256 roundId, uint8 squareId, address wallet)
        external
        view
        returns (uint256)
    {
        return entries[roundId][squareId][wallet];
    }

    function getWalletRound(uint256 roundId, address wallet)
        external
        view
        returns (WalletRound memory)
    {
        return walletRounds[roundId][wallet];
    }

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

    function balances()
        external
        view
        returns (uint256 rollover, uint256 jackpot, uint256 treasury)
    {
        return (rolloverBalance, jackpotBalance, treasuryBalance);
    }

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

    function invariantHolds() external view returns (bool) {
        return address(this).balance
            == totalUnsettledDeposits + totalUnclaimedEth + rolloverBalance + jackpotBalance
                + treasuryBalance + totalDust;
    }
}
