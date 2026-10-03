// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

import { IDiceConsumer, IDiceEntropy } from "../../src/interfaces/IDiceEntropy.sol";

contract MockDiceCoordinator is IDiceEntropy {
    uint256 public fee = 25_000_000_000_000;
    address public provider;
    uint64 public nextSequence = 1;
    bool public failRequests;
    bool public failRefunds;

    mapping(uint64 => address) public consumerOf;
    mapping(uint64 => bool) public refunded;

    constructor(address provider_) {
        provider = provider_;
    }

    receive() external payable { }

    function setFee(uint256 fee_) external {
        fee = fee_;
    }

    function setFailRequests(bool failing) external {
        failRequests = failing;
    }

    function setFailRefunds(bool failing) external {
        failRefunds = failing;
    }

    function getFeeV2(address, uint32) external view returns (uint256) {
        return fee;
    }

    function requestV2(address, bytes32, uint32) external payable returns (uint64) {
        require(!failRequests, "MockDice: provider down");
        require(msg.value == fee, "MockDice: fee");
        uint64 sequence = nextSequence++;
        consumerOf[sequence] = msg.sender;
        return sequence;
    }

    function refundRequest(address, uint64 sequenceNumber) external {
        require(!failRefunds, "MockDice: refund unavailable");
        require(consumerOf[sequenceNumber] == msg.sender, "MockDice: consumer");
        require(!refunded[sequenceNumber], "MockDice: refunded");
        refunded[sequenceNumber] = true;
        (bool ok,) = msg.sender.call{ value: fee }("");
        require(ok, "MockDice: refund");
    }

    function fulfill(uint64 sequenceNumber, bytes32 random) external {
        address consumer = consumerOf[sequenceNumber];
        require(consumer != address(0), "MockDice: unknown");
        IDiceConsumer(consumer)._entropyCallback(sequenceNumber, provider, random);
    }
}
