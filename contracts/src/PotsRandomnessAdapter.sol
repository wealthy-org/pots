// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IDiceConsumer, IDiceEntropy } from "./interfaces/IDiceEntropy.sol";
import { IPotsRandomnessAdapter } from "./interfaces/IPotsRandomnessAdapter.sol";
import { IPotsRoundManagerCallback } from "./interfaces/IPotsRoundManagerCallback.sol";

contract PotsRandomnessAdapter is IPotsRandomnessAdapter, IDiceConsumer, Ownable {
    IDiceEntropy public immutable dice;
    address public immutable provider;
    uint32 public immutable callbackGasLimit;

    address public manager;

    mapping(uint64 => uint256) public roundOfRequest;
    mapping(uint256 => uint64) public requestOfRound;
    mapping(uint256 => uint256) public feeOfRound;
    mapping(uint256 => bool) public refunded;

    error NotManager();
    error NotCoordinator();
    error RequestExists();
    error UnknownRequest();
    error AlreadyRefunded();
    error AlreadySet();
    error FeeMismatch();
    error TransferFailed();
    error ZeroAddress();

    event ManagerSet(address indexed manager);
    event RandomnessForwarded(uint256 indexed roundId, uint64 sequence);
    event RandomnessRefunded(uint256 indexed roundId, uint64 sequence, uint256 fee);

    constructor(address dice_, address provider_, uint32 callbackGasLimit_, address owner_)
        Ownable(owner_)
    {
        if (dice_ == address(0) || provider_ == address(0)) {
            revert ZeroAddress();
        }
        dice = IDiceEntropy(dice_);
        provider = provider_;
        callbackGasLimit = callbackGasLimit_;
    }

    /// @notice Accepts ETH refunded by the provider.
    receive() external payable { }

    /// @notice Registers the round manager that may request and refund randomness.
    /// @dev Owner only and one-time.
    function setManager(address manager_) external onlyOwner {
        if (manager != address(0)) {
            revert AlreadySet();
        }
        if (manager_ == address(0)) {
            revert ZeroAddress();
        }
        manager = manager_;
        emit ManagerSet(manager_);
    }

    /// @notice Returns the provider's current fee for a request with the configured callback gas.
    function quoteFee() public view returns (uint256) {
        return dice.getFeeV2(provider, callbackGasLimit);
    }

    /// @notice Forwards one randomness request to the provider for a round.
    /// @dev Manager only. One request per round; msg.value must equal the quoted fee.
    function requestRandomness(uint256 roundId, bytes32 userRandom)
        external
        payable
        returns (uint64 sequenceNumber)
    {
        if (msg.sender != manager) {
            revert NotManager();
        }
        if (requestOfRound[roundId] != 0) {
            revert RequestExists();
        }
        uint256 fee = quoteFee();
        if (msg.value != fee) {
            revert FeeMismatch();
        }
        sequenceNumber = dice.requestV2{ value: fee }(provider, userRandom, callbackGasLimit);
        requestOfRound[roundId] = sequenceNumber;
        roundOfRequest[sequenceNumber] = roundId;
        feeOfRound[roundId] = fee;
        emit RandomnessForwarded(roundId, sequenceNumber);
    }

    /// @notice Reclaims the fee of a request the provider never revealed and forwards it to the manager.
    /// @dev Manager only. One refund per round.
    function refundRandomness(uint256 roundId) external {
        if (msg.sender != manager) {
            revert NotManager();
        }
        uint64 sequence = requestOfRound[roundId];
        if (sequence == 0) {
            revert UnknownRequest();
        }
        if (refunded[roundId]) {
            revert AlreadyRefunded();
        }
        refunded[roundId] = true;
        uint256 fee = feeOfRound[roundId];
        delete feeOfRound[roundId];
        dice.refundRequest(provider, sequence);
        if (fee > 0) {
            (bool ok,) = manager.call{ value: fee }("");
            if (!ok) {
                revert TransferFailed();
            }
        }
        emit RandomnessRefunded(roundId, sequence, fee);
    }

    /// @notice Receives the provider's random output and passes it to the manager.
    /// @dev Only the configured coordinator and provider may call it; unknown requests revert.
    function _entropyCallback(uint64 sequenceNumber, address provider_, bytes32 random) external {
        if (msg.sender != address(dice) || provider_ != provider) {
            revert NotCoordinator();
        }
        uint256 roundId = roundOfRequest[sequenceNumber];
        if (roundId == 0) {
            revert UnknownRequest();
        }
        IPotsRoundManagerCallback(manager).onRandomnessFulfilled(roundId, random);
    }
}
